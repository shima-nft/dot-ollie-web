// ============================================================
// DotFishSound —— 釣り場の自然の音（2026-09-15 島さんが選んだ）
// ============================================================
//
//   > 島さん「Pixelの池を眺めていると、風、水、草、魚がそこに存在しているように感じること。
//   >   音がないと寂しく感じる程度の自然さ」
//
//   ★島さんが tools/preview-sound.html で選んだ組み合わせ（2026-09-15）:
//     環境音 P② ／ CAST C ／ ENTRY C ／ APPROACH C ／ HIT C ／
//     FIGHT B（小さい魚）・C（中〜大）／ THRASH 小型 C・大型 C ／ CATCH C
//   ★2026-09-16: 暴れたときは W① 泡の抵抗（★島さん「自然な水の音＋泡音。魚の抵抗感が伝わるように」）
//   ★★分け方: 自然の出来事 = ここ（水・風・虫・魚・糸）／ゲームからの知らせ = js/ollie.js の電子音
//     （★逃げた音と、釣れたときのチップはそのまま）
//   ★★★音を理屈で差し替えないこと。変えたくなったら、まず preview-sound.html で鳴らして島さんに選んでもらう
//   ★音のファイルは使わない（★その場で作る。通信なし）
//   ★世界のサイコロ（popNoise）には触らない。揺らぎはこのファイルだけのサイコロで作る
(function (global) {
"use strict";

// ---- ★島さんの持ち場 ----
var FISH_SOUND_ON = 1;      // 0 = 釣り場の自然の音を全部止める
var POND_AMB_ON   = 1;      // 0 = 池の環境音（P②）だけ止める
var SMALL_CM      = 15;     // これより小さい魚の FIGHT は B（中間）、これ以上は C（自然寄り）
var APPROACH_GAP  = 1.6;    // 寄ってくる泡の音は、この秒数に1回まで（★絵は0.45秒ごとに泡を出す）
var THRASH_GAP    = 0.35;   // 水面近くで暴れる音の間（秒）
var DEEP_GAP      = 0.5;    // 深いところで暴れる音の間（秒）
// 音量（★ゲームの跳ぶ音 = 1 として preview-sound.html で測った値。★いちばん小さいのは環境音）
var STRUGGLE_REEL_ON = 0;   // 1 = 暴れたときも、前のリール「ジジジ」と糸の音を重ねる（★2026-09-16 に W① へ入れ替えた）
var LV = { cast: 0.30, entry: 0.52, approach: 0.42, hit: 0.51, fightB: 0.44, fightC: 0.46, resist: 0.51, thrash: 0.265, catch: 0.48, amb: 0.35 };

// ---- このファイルだけのサイコロ（★毎回ほんの少し違う音にする） ----
var seed = ((Date.now() ^ 0x9e3779b9) >>> 0) || 1;
function rnd() { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; }
function R(a, b) { return a + rnd() * (b - a); }
function J(v, pct) { return v * (1 + (rnd() * 2 - 1) * pct); }
var PITCH = 0.04, GAIN = 0.12, LEN = 0.08;   // 高さ ±4% ／ 大きさ ±12% ／ 長さ ±8%
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function sizeK(cm) { return clamp(((cm || 0) - 6) / 39, 0, 1); }   // 0 = MINNOW の小さいもの … 1 = 45cm 以上
function fightStyle(cm) { return (cm || 0) < SMALL_CM ? "B" : "C"; }

// ============================================================
// ■ 鳴らす先
// ============================================================
var ctx = null, out = null;
function audio() {
	if (!ctx) {
		var AC = global.AudioContext || global.webkitAudioContext;
		if (!AC) return null;                       // ★音が出せない場所でも遊べる
		try { ctx = new AC(); } catch (e) { return null; }
	}
	if (ctx.state === "suspended" && ctx.resume) { try { ctx.resume(); } catch (e) { /* 次に触ったとき */ } }
	if (!out) { out = ctx.createGain(); out.connect(ctx.destination); }
	return ctx;
}
function here() { return { ctx: ctx, dest: out, t0: ctx.currentTime + 0.01 }; }
function later(o, sec) { return { ctx: o.ctx, dest: o.dest, t0: o.t0 + sec }; }
function level(o, g) {
	var n = o.ctx.createGain(); n.gain.value = g; n.connect(o.dest);
	return { ctx: o.ctx, dest: n, t0: o.t0 };
}
function muffle(o, hz) {   // ★水の中: 高い音を落として、こもらせる
	var f = o.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = hz; f.Q.value = 0.5;
	f.connect(o.dest); return { ctx: o.ctx, dest: f, t0: o.t0 };
}

// ---- 雑音の元（2秒ぶん。★1回だけ作る） ----
var BUF = {};
function noise(kind) {
	if (BUF[kind]) return BUF[kind];
	var n = Math.floor(ctx.sampleRate * 2), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
	var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
	for (var i = 0; i < n; i++) {
		var w = rnd() * 2 - 1;
		if (kind === "white") d[i] = w * 0.5;
		else if (kind === "pink") {
			b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520;
			b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
			d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
		} else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
	}
	return (BUF[kind] = buf);
}

// ---- 音のかたち（atk = 立ち上がり ／ swell = ゆっくり上がってゆっくり下がる） ----
function env(t, dur, peak, atk, swell) {
	var g = ctx.createGain();
	peak = Math.max(peak, 0.0002);
	g.gain.value = 0;
	g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + (atk || 0.003));
	if (swell) g.gain.linearRampToValueAtTime(0, t + dur);
	else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	return g;
}
function nz(o, p) {
	var t = o.t0 + (p.at || 0), dur = Math.max(p.dur, (p.atk || 0) + 0.01);
	var src = ctx.createBufferSource();
	src.buffer = noise(p.kind || "white"); src.loop = true;
	var node = src;
	if (p.type) {
		var f = ctx.createBiquadFilter(); f.type = p.type; f.Q.value = p.q == null ? 0.7 : p.q;
		f.frequency.setValueAtTime(p.f, t);
		if (p.f2) f.frequency.exponentialRampToValueAtTime(p.f2, t + (p.fT || dur));
		node.connect(f); node = f;
	}
	var g = env(t, dur, p.g, p.atk, p.swell);
	node.connect(g); g.connect(o.dest);
	src.start(t, rnd() * 1.8);
	src.stop(t + dur + 0.05);
}
function tone(o, p) {
	var t = o.t0 + (p.at || 0), s = ctx.createOscillator();
	s.type = p.wave || "sine";
	s.frequency.setValueAtTime(p.f, t);
	if (p.f2) s.frequency.exponentialRampToValueAtTime(p.f2, t + (p.fT || p.dur));
	var g = env(t, p.dur, p.g, p.atk);
	s.connect(g); g.connect(o.dest);
	s.start(t); s.stop(t + p.dur + 0.05);
}
function plip(o, at, f, g, dur) {     // 水滴「ポ」（高さが上がる）
	tone(o, { at: at, f: J(f, PITCH), f2: f * R(1.7, 2.3), fT: dur * 0.7, dur: J(dur, LEN), g: J(g, GAIN), atk: 0.002 });
}
function bubble(o, at, f, g, dur) {   // 水の中の泡「ポコ」
	tone(o, { at: at, f: J(f, PITCH), f2: f * R(1.4, 1.9), fT: dur, dur: dur, g: J(g, GAIN), atk: 0.006 });
}

// ============================================================
// ■ 島さんが選んだ音（★中身は preview-sound.html の同じ記号と同じ）
// ============================================================
function CAST(o) {   // CAST C: 竿のしなり＋糸＋リールが空回りして止まる
	nz(o, { kind: "pink", type: "bandpass", f: J(450, PITCH), f2: J(1400, PITCH), q: 0.9, dur: J(0.26, LEN), atk: 0.12, g: J(0.9, GAIN) });
	nz(o, { kind: "pink", type: "bandpass", at: 0.13, f: 1400, f2: 800, q: 0.9, dur: 0.2, atk: 0.01, g: J(0.3, GAIN) });
	nz(o, { kind: "white", type: "bandpass", at: 0.1, f: J(6500, PITCH), f2: 3800, q: 2, dur: J(0.42, LEN), atk: 0.03, g: J(0.14, GAIN) });
	for (var i = 0, t = 0.12, gap = 0.028; i < 6; i++, t += gap, gap *= 1.25)
		nz(o, { kind: "white", type: "bandpass", f: J(3200, PITCH), q: 3, at: t, dur: 0.012, atk: 0.001, g: J(0.35 * (1 - i / 7), GAIN) });
}
function ENTRY(o, v) {   // ENTRY C: 型 a / b / c からランダム
	plip(o, 0, [900, 820, 980][v], 0.09, 0.05);
	nz(o, { kind: "pink", type: "bandpass", f: J([1800, 1600, 2100][v], PITCH), q: 0.8, dur: J(0.16, LEN), atk: 0.002, g: J(0.45, GAIN) });
	tone(o, { f: J(190, PITCH), f2: 120, dur: 0.035, g: J(0.06, GAIN), atk: 0.001 });
	if (v !== 1) plip(o, R(0.07, 0.11), [1700, 0, 1500][v], 0.035, 0.03);
	nz(o, { kind: "brown", type: "lowpass", f: 500, at: 0.12, dur: J(0.26, LEN), atk: 0.06, g: J(0.25, GAIN) });
}
function APPROACH(o) {   // APPROACH C: こもった泡＋水の中の鈍い動き
	var m = muffle(o, 700), n = Math.floor(R(2, 5)), t = 0;
	for (var i = 0; i < n; i++) { bubble(m, t, R(220, 420), 0.06, R(0.04, 0.08)); t += R(0.05, 0.22); }
	nz(m, { kind: "brown", type: "lowpass", f: 300, dur: 0.45, atk: 0.15, g: J(0.06, GAIN) });
}
function HIT(o) {   // HIT C: 自然だけ（「チュ」と吸い込まれて沈む）
	plip(o, 0, 1200, 0.1, 0.03);
	tone(o, { at: 0.02, f: J(600, PITCH), f2: 170, dur: 0.13, g: J(0.12, GAIN), atk: 0.002 });
	nz(o, { kind: "white", type: "highpass", f: 2500, dur: 0.06, atk: 0.001, g: J(0.3, GAIN) });
	nz(o, { kind: "brown", type: "lowpass", f: 420, at: 0.04, dur: 0.3, atk: 0.03, g: J(0.35, GAIN) });
	var m = muffle(o, 900);
	bubble(m, 0.13, R(350, 450), 0.05, 0.05); bubble(m, R(0.2, 0.26), R(420, 520), 0.035, 0.04);
}
function THRASH(o, k, deep) {   // THRASH C（小型・大型とも）: k = 魚の大きさ 0〜1
	var i, n, t;
	if (deep) {   // ★絵で泡だけが出るとき → 泡のかたまり「ごぽっ」。しぶきの音は鳴らさない
		var m = muffle(o, 450);
		n = 3 + Math.round(4 * k);
		for (i = 0, t = 0; i < n; i++, t += R(0.025, 0.05)) bubble(m, t, R(160, 380) * (1 - 0.35 * k), 0.05, R(0.04, 0.09));
		nz(m, { kind: "brown", type: "lowpass", f: 280, dur: 0.3 + 0.3 * k, atk: 0.05, g: J(0.15 + 0.15 * k, GAIN) });
		return;
	}
	var bodyF = 1300 - 500 * k;
	if (k > 0.4) nz(o, { kind: "brown", type: "lowpass", f: 240, dur: 0.16 + 0.08 * k, atk: 0.002, g: J(0.7 * k, GAIN) });
	nz(o, { kind: "pink", type: "bandpass", f: J(bodyF, PITCH), q: 0.8, dur: 0.12 + 0.2 * k, atk: 0.002, g: J(0.7 + 0.3 * k, GAIN) });
	nz(o, { kind: "white", type: "highpass", f: 3500, dur: 0.1 + 0.15 * k, atk: 0.003, g: J(0.12 + 0.1 * k, GAIN) });
	n = Math.round(3 + 6 * k);
	for (i = 0; i < n; i++) plip(o, R(0.04, 0.25 + 0.35 * k), R(1200, 2800), R(0.02, 0.05), R(0.02, 0.04));
}
function CATCH(o, k) {   // CATCH C: 水から抜ける＋流れ落ちる水＋ポタポタ
	if (k > 0.5) nz(o, { kind: "brown", type: "lowpass", f: 250, dur: 0.16, atk: 0.003, g: J(0.5 * k, GAIN) });
	nz(o, { kind: "pink", type: "bandpass", f: J(400, PITCH), f2: 1800, q: 0.7, dur: 0.28, atk: 0.03, g: J(0.9 * (0.6 + 0.4 * k), GAIN) });
	nz(o, { kind: "white", type: "bandpass", at: 0.05, f: 3000, f2: 5000, q: 1, dur: 0.45, atk: 0.04, g: J(0.14, GAIN) });
	var n = Math.round(5 + 5 * k), t = 0.2;
	for (var i = 0; i < n; i++) { plip(o, t, R(1500, 3000), 0.045 * (1 - i / (n + 2)), R(0.02, 0.035)); t += R(0.04, 0.12); }
}

// ============================================================
// ■ FIGHT（★小さい魚 = B ／ 中〜大 = C）。★毎フレーム、いまの様子から少し先まで予約する
// ============================================================
//   巻いている（押している・おとなしい）→ リールの「カチ」
//   ★暴れた → W① 泡の抵抗（2026-09-16 島さんが選んだ）。尾を振るたびに泡が噴き出し、低い水がうねる
//     （★前の「ジジジ」と糸の音は STRUGGLE_REEL_ON = 1 で戻る）
//   C だけ → 水の中で魚が動く低い「ごう」
var fight = { next: 0, swell: 0, line: null, beat: 0, resisting: false };
// ★絵と同じ深さの境目（★魚の背が水面より10ドット以上下 = 泡だけ）
function deepOf(f) {
	var surface = (global.DotFishing && global.DotFishing.SURFACE) || 49;
	return f.y - Math.min(5, (f.cm || 0) / 9) > surface + 10;
}
// ★尾を振る間: 暴れはじめ (0.14 + 0.1k) 秒おき → 終わりぎわ (0.12 + 0.08k) 秒おき（★だんだん速く・大きい魚ほどゆっくり）
function resistGap(k, u) {
	u = clamp(u || 0, 0, 1);
	var first = 0.14 + 0.1 * k, last = 0.12 + 0.08 * k;
	return first + (last - first) * u;
}
// ★W① のひと振りぶん（★preview-sound.html の W1 と同じ中身）
function resistBeat(t, k, deep) {
	var o = level({ ctx: ctx, dest: out, t0: t }, LV.resist), m = muffle(o, deep ? 600 : 1500), j;
	var n = deep ? 2 + Math.floor(R(0, 3)) : 1 + Math.floor(R(0, 2));
	for (j = 0; j < n; j++) bubble(m, R(0, 0.08), R(200, 420) * (1 - 0.35 * k), deep ? 0.03 : 0.05, R(0.04, 0.08));
	nz(deep ? m : o, { kind: "brown", type: "lowpass", f: 260, dur: 0.18, atk: 0.03, g: J((0.12 + 0.18 * k) * (deep ? 0.45 : 1), GAIN) });
	if (!deep) {
		nz(o, { kind: "pink", type: "bandpass", f: J(1100 - 500 * k, PITCH), q: 0.8, at: 0.01, dur: 0.08 + 0.08 * k, atk: 0.003, g: J(0.3 + 0.35 * k, GAIN) });
		if (rnd() < 0.6) plip(o, R(0.02, 0.1), R(1200, 2400), 0.03, 0.03);
	}
}
function reelClick(t, style, drag, lv) {
	var click = style === "B" ? 3500 : 2800;
	nz(level({ ctx: ctx, dest: out, t0: t }, lv), { kind: "white", type: "bandpass", f: J(drag ? click * 1.3 : click, PITCH), q: 3, dur: 0.009, atk: 0.001, g: J(drag ? 0.5 : 0.9, GAIN) });
}
function lineStart(lv) {
	var now = ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
	src.buffer = noise("white"); src.loop = true;
	f.type = "bandpass"; f.Q.value = 30;
	f.frequency.setValueAtTime(2200, now); f.frequency.linearRampToValueAtTime(2700, now + 1.6);
	g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(1.4 * lv, now + 0.25);
	src.connect(f); f.connect(g); g.connect(out);
	src.start(now, rnd() * 1.8);
	return { src: src, gain: g };
}
function lineStop(l) {
	var now = ctx.currentTime;
	l.gain.gain.cancelScheduledValues(now); l.gain.gain.setValueAtTime(l.gain.gain.value, now);
	l.gain.gain.linearRampToValueAtTime(0, now + 0.15);
	try { l.src.stop(now + 0.2); } catch (e) { /* もう止まっている */ }
}
function fightQuiet() {
	if (fight.line) lineStop(fight.line);
	fight.line = null; fight.next = 0; fight.swell = 0; fight.beat = 0; fight.resisting = false;
}
function fightTick(s) {
	var f = null, i;
	if (s.phase === "reel" && s.pool) for (i = 0; i < s.pool.length; i++) if (s.pool[i].id === s.hookId) f = s.pool[i];
	if (!f) { fightQuiet(); return; }
	var style = fightStyle(f.cm), lv = style === "B" ? LV.fightB : LV.fightC, now = ctx.currentTime;
	var drag = !!s.angry, reeling = !!s.held && !drag;
	if (reeling || (drag && STRUGGLE_REEL_ON)) {
		if (fight.next < now) fight.next = now + 0.01;
		while (fight.next < now + 0.1) {
			reelClick(fight.next, style, drag, lv);
			fight.next += J(drag ? 0.022 : (style === "B" ? 0.05 : 0.065), 0.15);
		}
	} else fight.next = 0;
	var sing = drag && !!s.held && STRUGGLE_REEL_ON;
	if (sing && !fight.line) fight.line = lineStart(lv);
	else if (!sing && fight.line) { lineStop(fight.line); fight.line = null; }
	// ★★暴れているあいだは W① 泡の抵抗（★深さは毎回見る ＝ 潜れば泡だけ、浮けばチャプが混ざる）
	fight.resisting = drag;
	if (drag) {
		var k = sizeK(f.cm), b = (s.fight && typeof s.fight === "object") ? s.fight : {}, u = b.duration ? b.age / b.duration : 0.5;
		if (fight.beat < now) fight.beat = now + 0.01;
		while (fight.beat < now + 0.1) {
			resistBeat(fight.beat, k, deepOf(f));
			fight.beat += J(resistGap(k, u), 0.18);
		}
	} else fight.beat = 0;
	if (style === "C" && fight.swell < now + 0.1) {
		if (fight.swell < now) fight.swell = now;
		nz(level({ ctx: ctx, dest: out, t0: fight.swell }, lv), { kind: "brown", type: "lowpass", f: 230, dur: 0.5, atk: 0.2, g: J(0.1, GAIN), swell: true });
		fight.swell += R(0.35, 0.6);
	}
}

// ============================================================
// ■ 池の環境音 P②「夏の夜の池」（★どれもずっとは鳴らない。不規則な長い間隔で）
// ============================================================
function lap(o) {   // 岸に寄る小さな水
	nz(o, { kind: rnd() < 0.5 ? "brown" : "pink", type: "lowpass", f: R(350, 750), dur: R(0.14, 0.32), atk: R(0.03, 0.08), g: 0.3 * R(0.6, 1.1) });
	if (rnd() < 0.3) nz(o, { kind: "brown", type: "lowpass", at: R(0.15, 0.3), f: R(300, 600), dur: R(0.1, 0.2), atk: 0.04, g: 0.2 * R(0.6, 1) });
	if (rnd() < 0.12) plip(o, R(0, 0.2), R(1200, 2200), 0.012, 0.025);
}
function wind(o) {   // 弱い風（数秒かけて来て、去る）
	var d = R(3, 7);
	nz(o, { kind: "pink", type: "bandpass", f: R(250, 420), f2: R(600, 950), fT: d * 0.5, q: 0.6, dur: d, atk: d * 0.45, g: 0.25 * 0.7 * R(0.6, 1), swell: true });
}
function crickets(o) {   // 虫（ときどき別の高さの虫が答える）
	var f = R(4300, 4800), phrases = Math.floor(R(2, 7)), t = 0, p, i;
	for (p = 0; p < phrases; p++) {
		var pulses = Math.floor(R(3, 6));
		for (i = 0; i < pulses; i++) tone(o, { f: f * R(0.995, 1.005), at: t + i * 0.034, dur: 0.02, atk: 0.004, g: 0.025 });
		t += R(0.32, 0.6);
	}
	if (rnd() < 0.3) {
		var f2 = f * R(0.85, 0.92), t2 = R(0.2, 1);
		for (p = 0; p < 3; p++) { for (i = 0; i < 4; i++) tone(o, { f: f2, at: t2 + i * 0.03, dur: 0.018, atk: 0.004, g: 0.015 }); t2 += R(0.4, 0.7); }
	}
}
function frog(o) {   // 遠くのカエル
	var m = muffle(o, 650), f = R(130, 180), n = Math.floor(R(1, 4)), t = 0;
	for (var c = 0; c < n; c++) {
		for (var i = 0; i < 6; i++) tone(m, { wave: "square", f: f * (1 + i * 0.01), at: t + i * 0.035, dur: 0.028, atk: 0.003, g: 0.05 * (i < 2 ? 0.6 : 1) });
		t += R(0.35, 0.55);
	}
}
// first = 池に入って何秒後に最初に鳴るか ／ every = 次までの間（★さらに ±30% 揺らす）
var POND = [
	{ first: [0.3, 1.5], every: [2.5, 8], play: lap },
	{ first: [1, 4], every: [6, 20], play: crickets },
	{ first: [8, 20], every: [20, 55], play: frog },
	{ first: [15, 30], every: [25, 60], play: wind }
];
var lastFrame = 0, amb = null;
function ambStop() {
	if (!amb) return;
	var a = amb, now = ctx.currentTime;
	amb = null;
	a.timers.forEach(clearTimeout);
	a.gain.gain.cancelScheduledValues(now); a.gain.gain.setValueAtTime(a.gain.gain.value, now);
	a.gain.gain.linearRampToValueAtTime(0, now + 0.8);
	setTimeout(function () { try { a.gain.disconnect(); } catch (e) { /* もう外れている */ } }, 1000);
}
function ambStart() {
	var g = ctx.createGain(), now = ctx.currentTime;
	g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(LV.amb, now + 1.5);
	g.connect(out);
	var me = amb = { gain: g, timers: [] };
	POND.forEach(function (L, k) {
		function next(first) {
			var span = first ? L.first : L.every, wait = R(span[0], span[1]) * (first ? 1 : R(0.7, 1.3));
			me.timers[k] = setTimeout(function () {
				if (amb !== me) return;
				// ★池の画面が動いていない（一時停止・ショップ・池を出た・裏に回った）→ 静かに消える
				if (!out || Date.now() - lastFrame > 400) { ambStop(); return; }
				L.play({ ctx: ctx, dest: g, t0: ctx.currentTime + 0.05 });
				next(false);
			}, wait * 1000);
		}
		next(true);
	});
}

// ============================================================
// ■ 止める（★音を切った・池を出た）。★鳴りかけの音もすぐ消える
// ============================================================
function hush() {
	fightQuiet();
	ambStop();
	if (!ctx || !out) return;
	var old = out, now = ctx.currentTime;
	out = null;
	old.gain.setValueAtTime(old.gain.value, now); old.gain.linearRampToValueAtTime(0, now + 0.1);
	setTimeout(function () { try { old.disconnect(); } catch (e) { /* もう外れている */ } }, 250);
}

// ---- 間引き（★同じ種類の音を、gap 秒に1回まで） ----
var lastAt = {};
function allow(kind, gap, now) {
	if (lastAt[kind] != null && now - lastAt[kind] < gap) return false;
	lastAt[kind] = now;
	return true;
}

global.DotFishSound = {
	// ★触った瞬間に呼ぶ（★iPhone は触るまで音を出せない）
	wake: function () { if (FISH_SOUND_ON) audio(); },
	// ★釣りの出来事: cast / water / hit / catch ／ 泡と暴れる合図: bubble / thrash
	event: function (e) {
		if (!FISH_SOUND_ON || !e || !audio()) return;
		var o = here(), d = e.data || {}, now = ctx.currentTime;
		if (e.type === "cast") CAST(level(o, LV.cast));
		else if (e.type === "water") ENTRY(level(o, LV.entry), Math.floor(rnd() * 3));
		else if (e.type === "bubble") { if (allow("bubble", APPROACH_GAP, now)) APPROACH(level(o, LV.approach)); }
		else if (e.type === "hit") HIT(level(o, LV.hit));
		else if (e.type === "thrash") {
			// ★暴れているあいだは W① が水と泡を受け持つ（★重ねると、島さんが選んだ音と別物になる）
			if (!fight.resisting && allow(d.deep ? "deep" : "near", d.deep ? DEEP_GAP : THRASH_GAP, now)) THRASH(level(o, LV.thrash), sizeK(d.cm), !!d.deep);
		}
		else if (e.type === "catch") CATCH(level(o, LV.catch), sizeK(d.cm));
	},
	// ★池の画面が動いているあいだ、毎フレーム呼ぶ（on = 音を出してよいか）
	frame: function (s, on) {
		lastFrame = Date.now();
		if (!ctx) return;
		if (!FISH_SOUND_ON || !on || !s) { fightQuiet(); ambStop(); return; }
		if (!out) audio();
		if (POND_AMB_ON && !amb) ambStart();
		fightTick(s);
	},
	stop: hush,
	// ★キャンプの音（js/camp-sound.js）が同じ AudioContext を使うための受け取り口（★作るのも起こすのもここだけ）
	context: function () { return audio(); },
	peek: function () { return ctx; },   // ★作らず・起こさず、いまあるものを見るだけ（★毎フレーム用）
	sizeK: sizeK, fightStyle: fightStyle, deepOf: deepOf, resistGap: resistGap, _allow: allow,
	SMALL_CM: SMALL_CM, APPROACH_GAP: APPROACH_GAP, THRASH_GAP: THRASH_GAP, LV: LV
};
})(typeof window !== "undefined" ? window : globalThis);
