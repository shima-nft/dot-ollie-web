// ============================================================
// DotCampSound —— 湖畔キャンプの自然の音（2026-09-18 候補）
// ============================================================
//
//   > 島さん「音を聞かせるのではなく、音によって、この場所が存在しているように感じること」
//
//   ★★2026-09-18 島さんが B / B / B / B / 虫あり を選び（★同日 FIRE だけ B2 へ）、本体（js/ollie.js の updateCamp）につないだ。
//     A / C は tools/preview-sound.html の「LAKESIDE CAMP」で聴ける調整用の候補（★消さない）。
//   ★★★音を理屈で差し替えないこと（★選ぶのは島さん）
//   ★音のファイルは使わない（★その場で作る。通信なし・課金なし）
//   ★世界のサイコロ（popNoise / 絵の roll）には触らない。音の揺らぎは、このファイルだけのサイコロで作る
//
//   ■ 映像とのつなぎ方（★絵の状態を「読むだけ」。絵の側は音を知らない）
//     js/camp-lakeside.js の状態 s には、出来事の短い記録 s.sfx が残ります（番号つき・最新16件）:
//       pop    … 薪がはぜた（★炎が伸び、火の粉が舞い、周りが明るくなる瞬間）→ 強い「パチッ」
//       ember  … 火の粉が出た → ときどき小さな「パチ」
//       croak  … カエルが鳴きはじめた（beat 秒ごとに、のどがふくらむ）→ ふくらむ瞬間に1声ずつ
//       ripple … 湖に波紋（魚が跳ねた）→ 「ちゃぷ」
//       gust   … 突風が来た（★音量は下の「葉の音」がずっと風の値を読んでいる）
//     続く音は2つだけ（★どちらも小さい）:
//       燃える音 … 炎の強さ（DotCampLakeside._fireI）で、ほんの少し大きく・小さく
//       葉の音   … 画面の草を揺らしている風（DotCampLakeside._wind）で。★ふだんはほぼ 0
//
//   ■ 静けさ: 何かが鳴った直後は、湖と虫が少し待つ（★全部が同時に鳴らない）。
//     はぜる音にも「ほとんど鳴らない時間」がある（ゆっくりしたノイズの門）。
(function (global) {
"use strict";

// ---- ★島さんの持ち場（★音量。★焚き火 ＞ 近くの出来事 ＞ 湖 ＞ 遠くの森） ----
var LV = { bed: 0.045, crackle: 0.30, pop: 0.50, frog: 0.34, leaves: 0.07, lap: 0.05, chapu: 0.38, insect: 0.05 };
var LAP_EVERY = [6, 16];        // 岸の水の間（秒）
var INSECT_EVERY = [16, 42];    // 遠くの虫の間（秒）
var QUIET_AFTER = 2.5;          // 何かが鳴ったあと、湖と虫が待つ秒数

// ---- このファイルだけのサイコロ ----
var seed = ((Date.now() ^ 0x2545f491) >>> 0) || 1;
function rnd() { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; }
function R(a, b) { return a + rnd() * (b - a); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function slow(t, k) { var i = Math.floor(t), f = t - i; f = f * f * (3 - 2 * f); return h(i + k) * (1 - f) + h(i + 1 + k) * f; }
function h(n) { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }

// ============================================================
// ■ 音の材料（★AudioContext ごとに1回だけ作る）
// ============================================================
function buf(ctx, kind) {
	var cache = ctx.__campNoise || (ctx.__campNoise = {});
	if (cache[kind]) return cache[kind];
	var sr = ctx.sampleRate, n = Math.floor(sr * ({ grain2: 5.9, grain3: 7.3 }[kind] || 4.3)), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
	var b0 = 0, b1 = 0, b2 = 0, last = 0, hold = 0, target = 0, from = 0, i;
	for (i = 0; i < n; i++) {
		var w = rnd() * 2 - 1;
		if (kind === "white") d[i] = w * 0.5;
		else if (kind === "pink") { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.05) * 1.9; }
		else if (kind === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
		else if (kind === "grain" || kind === "grain2" || kind === "grain3") {   // 燃えている木の「チリ…」: ごく短い粒がまばらに（★ほとんどは小さく、たまに少し大きい）
			if (i === 0) { d.fill(0); var per = { grain: 9, grain2: 6, grain3: 4 }[kind], len = n; for (var gI = 0; gI < per * len / sr; gI++) { var at0 = Math.floor(rnd() * (len - sr * 0.01)), amp = Math.pow(rnd(), 2.2) * 0.9, dl = Math.floor(sr * R(0.0008, 0.004)); for (var q = 0; q < dl; q++) d[at0 + q] += (rnd() * 2 - 1) * amp * Math.exp(-4 * q / dl); } }
			continue;
		}
		else if (kind === "gb") { if (i % 6 === 0) hold = rnd() < 0.5 ? -0.4 : 0.4; d[i] = hold; }   // ゲームボーイの「ザー」（1ビット）
		else if (kind === "flutter") {   // 葉がこすれる「ゆらぎ」（0〜1 がでこぼこに動く）
			if (i % Math.floor(sr * 0.07) === 0) { from = target; target = rnd(); }
			var u = (i % Math.floor(sr * 0.07)) / (sr * 0.07); d[i] = from + (target - from) * u;
		}
	}
	return (cache[kind] = b);
}
function src(ctx, kind, rate) { var s = ctx.createBufferSource(); s.buffer = buf(ctx, kind); s.loop = true; if (rate) s.playbackRate.value = rate; return s; }
function filt(ctx, type, f, q) { var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q == null ? 0.7 : q; return b; }
function level(o, g) { var n = o.ctx.createGain(); n.gain.value = g; n.connect(o.dest); return { ctx: o.ctx, dest: n, t0: o.t0 }; }
function later(o, sec) { return { ctx: o.ctx, dest: o.dest, t0: o.t0 + sec }; }
function env(ctx, t, dur, peak, atk, swell) {
	var g = ctx.createGain(); peak = Math.max(peak, 0.0002);
	g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + (atk || 0.003));
	if (swell) g.gain.linearRampToValueAtTime(0, t + dur); else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	return g;
}
// 雑音を短く鳴らす: kind / type(フィルタ) / f / q / at / dur / g / atk / swell / rate / f2
function burst(o, p) {
	var ctx = o.ctx, t = o.t0 + (p.at || 0), dur = Math.max(p.dur, (p.atk || 0) + 0.005);
	var s = src(ctx, p.kind || "white", p.rate), node = s;
	if (p.type) { var f = filt(ctx, p.type, p.f, p.q); if (p.f2) { f.frequency.setValueAtTime(p.f, t); f.frequency.exponentialRampToValueAtTime(p.f2, t + dur); } node.connect(f); node = f; }
	var g = env(ctx, t, dur, p.g, p.atk, p.swell); node.connect(g); g.connect(o.dest);
	s.start(t, rnd() * 3.5); s.stop(t + dur + 0.05);
}
function tone(o, p) {
	var ctx = o.ctx, t = o.t0 + (p.at || 0), s = ctx.createOscillator(); s.type = p.wave || "sine";
	s.frequency.setValueAtTime(p.f, t); if (p.f2) s.frequency.exponentialRampToValueAtTime(p.f2, t + (p.fT || p.dur));
	var g = env(ctx, t, p.dur, p.g, p.atk); var node = s;
	if (p.bp) { var f = filt(ctx, "bandpass", p.bp, p.q || 1.5); node.connect(f); node = f; }
	node.connect(g); g.connect(o.dest); s.start(t); s.stop(t + p.dur + 0.05);
}

// ============================================================
// ■ 候補（A = ゲームボーイ寄り ／ B = 自然寄り ／ C = その中間）
// ============================================================
// ---- 焚き火: 小さな「パチ」（k = 火の強さ 0.5〜1.2） ----
var CRACKLE = {
	A: function (o, k) {   // 1ビットの「チッ」と、矩形波の小さな「ピッ」
		var n = 1 + Math.floor(R(0, 2.2 * k)), at = 0;
		for (var i = 0; i < n; i++) { at += R(0.02, 0.1); burst(o, { kind: "gb", rate: R(0.7, 1.6), type: "highpass", f: 1400, at: at, dur: R(0.012, 0.03), g: R(0.4, 0.9) * k, atk: 0.001 }); }
		if (rnd() < 0.3) tone(o, { wave: "square", f: R(1100, 1800), f2: 500, at: at * 0.5, dur: 0.02, g: 0.05 * k, atk: 0.001 });
	},
	B: function (o, k) {   // 木の中の水分がはじける、細い「パチ・ぱち」
		var n = 1 + Math.floor(R(0, 3.2 * k)), at = 0;
		for (var i = 0; i < n; i++) {
			at += R(0.015, 0.11);
			burst(o, { type: "bandpass", f: R(1800, 5200), q: R(0.8, 2.4), at: at, dur: R(0.004, 0.014), g: R(0.3, 1) * 3.6 * k, atk: 0.0006 });
			if (rnd() < 0.25) burst(o, { type: "bandpass", f: R(650, 1100), q: 1.2, at: at + 0.002, dur: 0.012, g: 1.2 * k, atk: 0.001 });
		}
	},
	C: function (o, k) {   // B の「パチ」に、1ビットの粒を少しだけ混ぜる
		var n = 1 + Math.floor(R(0, 2.6 * k)), at = 0;
		for (var i = 0; i < n; i++) {
			at += R(0.02, 0.1);
			if (rnd() < 0.35) burst(o, { kind: "gb", rate: R(0.9, 1.5), type: "highpass", f: 1800, at: at, dur: R(0.008, 0.02), g: 0.5 * k, atk: 0.001 });
			else burst(o, { type: "bandpass", f: R(2000, 4600), q: 1.4, at: at, dur: R(0.005, 0.014), g: R(0.4, 1) * 3 * k, atk: 0.0006 });
		}
	}
};
// ---- 焚き火: 強い「パチッ」（k = 強さ。★1.2 を超えると、ごくまれな小さな爆ぜ） ----
var POP = {
	A: function (o, k) {
		burst(o, { kind: "gb", rate: 0.8, type: "lowpass", f: 3200, dur: 0.05, g: 0.9 * k, atk: 0.0008 });
		tone(o, { wave: "square", f: 420, f2: 110, dur: 0.06, g: 0.08 * k, atk: 0.001 });
		CRACKLE.A(later(o, 0.05), 0.7);
		if (k > 1.2) burst(o, { kind: "gb", rate: 1.8, type: "highpass", f: 2500, at: 0.09, dur: 0.3, g: 0.12, atk: 0.05, swell: true });
	},
	B: function (o, k) {   // 乾いた「パチッ」＋ほんの少しの重さ＋あとから散る小さな粒
		burst(o, { type: "bandpass", f: R(1400, 2600), q: 0.9, dur: 0.028, g: 1.1 * k, atk: 0.0005 });
		burst(o, { type: "highpass", f: 3500, at: 0.001, dur: 0.012, g: 0.5 * k, atk: 0.0004 });
		tone(o, { f: R(95, 140), f2: 60, dur: 0.06, g: 0.3 * k, atk: 0.001 });
		for (var i = 0, at = 0.04; i < 2 + Math.floor(R(0, 3)); i++) { at += R(0.03, 0.14); burst(o, { type: "bandpass", f: R(2200, 5500), q: 1.8, at: at, dur: 0.008, g: 0.35 * k * (1 - i * 0.2), atk: 0.0006 }); }
		if (k > 1.2) {   // 爆ぜ: もう1度「パン」、そのあと樹液が「シュー」
			burst(o, { type: "bandpass", f: 1900, q: 0.8, at: 0.06, dur: 0.035, g: 0.9, atk: 0.0005 });
			burst(o, { kind: "pink", type: "highpass", f: 3000, at: 0.12, dur: 0.45, g: 0.09, atk: 0.08, swell: true });
		}
	},
	C: function (o, k) {
		POP.B(o, k * 0.9);
		burst(o, { kind: "gb", rate: 1.1, type: "highpass", f: 1600, at: 0.004, dur: 0.02, g: 0.35 * k, atk: 0.001 });
	}
};
// ★B2 / B3（2026-09-18 島さんがスマホで聴いて「B の燃える音が強い風に聞こえる。パチッ・爆ぜ・火の粉は良い」）:
//   ★「パチ」「パチッ」「爆ぜ」は B とまったく同じ（音色もタイミングも）。★変えるのは下の「燃える音」だけ
CRACKLE.B2 = CRACKLE.B3 = CRACKLE.B;
POP.B2 = POP.B3 = POP.B;
// ---- 焚き火: 燃える音（ずっと。★とても小さい） ----
function fireBed(ctx, dest, style) {
	var out = ctx.createGain(); out.gain.value = 0; out.connect(dest);
	var parts = [];
	function add(kind, rate, type, f, q, g) { var s = src(ctx, kind, rate), fl = filt(ctx, type, f, q), gg = ctx.createGain(); gg.gain.value = g; s.connect(fl); fl.connect(gg); gg.connect(out); s.start(ctx.currentTime, rnd() * 4); parts.push(s); return gg; }
	if (style === "A") add("gb", 0.3, "lowpass", 700, 0.7, 0.6);
	else if (style === "B2" || style === "B3") {
		// ★続く雑音（ザー・ゴー・サー）を使わない。燃えている木の「チリ…」という、ごく短い粒がまばらに鳴るだけ。
		//   2kHz より下は鳴らさない（★スマホで風に聞こえる帯域）。長さの違う材料を重ねて、くり返しに聞こえないように。
		//   さらに数秒かけて大きさがゆっくり変わり、ほとんど無音の時間ができる
		var calm = ctx.createGain(); calm.gain.value = 0.04; calm.connect(out);
		var cm = src(ctx, "flutter", 0.02), cmg = ctx.createGain(); cmg.gain.value = 1; cm.connect(cmg); cmg.connect(calm.gain); cm.start(ctx.currentTime, rnd() * 4); parts.push(cm);
		function grain(kind, rate, hp, g) { var gs = src(ctx, kind, rate), gf = filt(ctx, "highpass", hp, 0.7), gg = ctx.createGain(); gg.gain.value = g; gs.connect(gf); gf.connect(gg); gg.connect(calm); gs.start(ctx.currentTime, rnd() * 4); parts.push(gs); }
		if (style === "B2") { grain("grain", 1, 2000, 4); grain("grain2", 0.93, 2600, 2.8); }   // B2: 意識して聴くと分かる程度
		else grain("grain3", 1, 3000, 1.1);                                                      // B3: ほぼ無し
	}
	else {
		add("brown", 1, "lowpass", style === "B" ? 420 : 520, 0.6, 1);
		// ゆらぐ「ごう…」（炎の息づかい）: 葉のゆらぎと同じ材料で、ゆっくり大きさを変える
		var g = add("pink", 1, "bandpass", 1000, 0.6, 0.15), mod = src(ctx, "flutter", 0.35), mg = ctx.createGain(); mg.gain.value = 0.25; mod.connect(mg); mg.connect(g.gain); mod.start(); parts.push(mod);
		if (style === "C") add("gb", 0.45, "lowpass", 1400, 0.7, 0.18);
	}
	return { gain: out.gain, stop: function (t) { parts.forEach(function (s) { try { s.stop(t); } catch (e) { /* 止まっている */ } }); } };
}
// ---- 葉の音（ずっと。★風が来たときだけ聞こえる） ----
function leafBed(ctx, dest, style) {
	var out = ctx.createGain(); out.gain.value = 0; out.connect(dest);
	var parts = [];
	function add(s, chain, g, flutterDepth, flutterRate) {
		var node = s; chain.forEach(function (f) { node.connect(f); node = f; });
		var gg = ctx.createGain(); gg.gain.value = g; node.connect(gg); gg.connect(out); s.start(ctx.currentTime, rnd() * 4); parts.push(s);
		if (flutterDepth) { var m = src(ctx, "flutter", flutterRate), mg = ctx.createGain(); mg.gain.value = flutterDepth; m.connect(mg); mg.connect(gg.gain); m.start(ctx.currentTime, rnd() * 4); parts.push(m); }
	}
	if (style === "A") {
		add(src(ctx, "gb", 0.9), [filt(ctx, "bandpass", 2600, 0.8)], 0.8, 1, 1.4);
		add(src(ctx, "gb", 0.12), [filt(ctx, "lowpass", 380, 0.7)], 0.7, 0, 0);
	} else {
		// さわさわ（高いところ・でこぼこに揺れる）＋ ごう（低いところ・なめらか）
		add(src(ctx, "pink"), [filt(ctx, "highpass", 1700, 0.6), filt(ctx, "bandpass", 3300, 0.5)], style === "B" ? 0.55 : 0.45, 0.8, style === "B" ? 1.1 : 1.4);
		add(src(ctx, "pink"), [filt(ctx, "lowpass", 360, 0.6)], 0.4, 0, 0);
		if (style === "C") add(src(ctx, "gb", 0.7), [filt(ctx, "bandpass", 3000, 1)], 0.12, 0.12, 1.6);
	}
	return { gain: out.gain, stop: function (t) { parts.forEach(function (s) { try { s.stop(t); } catch (e) { /* 止まっている */ } }); } };
}
// ---- 湖: 岸に寄る小さな水 ----
var LAP = {
	A: function (o) { burst(o, { kind: "gb", rate: 0.22, type: "lowpass", f: R(420, 620), dur: R(0.2, 0.35), atk: R(0.06, 0.12), g: 0.7, swell: true }); if (rnd() < 0.2) tone(o, { wave: "square", f: R(700, 900), f2: 1500, at: 0.15, dur: 0.03, g: 0.03 }); },
	B: function (o) {
		burst(o, { kind: rnd() < 0.5 ? "brown" : "pink", type: "lowpass", f: R(320, 620), dur: R(0.24, 0.45), atk: R(0.08, 0.16), g: R(0.5, 0.9), swell: true });
		if (rnd() < 0.35) burst(o, { kind: "brown", type: "lowpass", at: R(0.28, 0.5), f: R(300, 520), dur: R(0.16, 0.3), atk: 0.06, g: R(0.3, 0.55), swell: true });
		if (rnd() < 0.15) tone(o, { f: R(1300, 1900), f2: 2700, at: R(0.1, 0.3), dur: 0.028, g: 0.03, atk: 0.002 });
	},
	C: function (o) { LAP.B(o); burst(o, { kind: "gb", rate: 0.3, type: "lowpass", f: 700, at: 0.05, dur: 0.2, atk: 0.08, g: 0.12, swell: true }); }
};
// ---- 湖: 波紋のときの「ちゃぷ」（★絵の波紋と同時） ----
var CHAPU = {
	A: function (o) { tone(o, { wave: "square", f: 480, f2: 1250, dur: 0.06, g: 0.09, atk: 0.001 }); burst(o, { kind: "gb", rate: 0.9, type: "lowpass", f: 2400, dur: 0.06, g: 0.4, atk: 0.001 }); tone(o, { wave: "square", f: 700, f2: 1400, at: 0.14, dur: 0.035, g: 0.04 }); },
	B: function (o) {   // 魚が水面をたたく「ちゃぷ」＋あとからしずく＋輪が岸へ
		tone(o, { f: R(620, 860), f2: 1800, fT: 0.05, dur: 0.07, g: 0.18, atk: 0.002 });
		burst(o, { kind: "pink", type: "bandpass", f: R(1300, 1900), q: 0.9, dur: 0.09, g: 0.5, atk: 0.003 });
		tone(o, { f: R(1000, 1300), f2: 2400, at: R(0.11, 0.16), dur: 0.035, g: 0.07, atk: 0.002 });
		burst(o, { kind: "brown", type: "lowpass", f: 500, at: R(0.5, 0.8), dur: 0.3, atk: 0.1, g: 0.3, swell: true });
	},
	C: function (o) { CHAPU.B(o); tone(o, { wave: "square", f: 520, f2: 1100, dur: 0.04, g: 0.03, atk: 0.001 }); }
};
// ---- カエル: 1声（★v = 0/1/2 の3つの声。★のどがふくらむ瞬間に1つずつ） ----
var FROG_V = [{ f: 165, am: 34, bp: 780, dur: 0.17 }, { f: 146, am: 28, bp: 650, dur: 0.2 }, { f: 184, am: 41, bp: 900, dur: 0.15 }];
function amTone(o, p) {   // 声帯の震え（速い振幅のふるえ）＋口の響き（バンドパス）
	var ctx = o.ctx, t = o.t0 + (p.at || 0), s = ctx.createOscillator(), a = ctx.createOscillator(), ag = ctx.createGain(), vg = ctx.createGain();
	s.type = p.wave || "sawtooth"; s.frequency.setValueAtTime(p.f, t); s.frequency.exponentialRampToValueAtTime(p.f * 0.88, t + p.dur);
	a.type = "square"; a.frequency.value = p.am; ag.gain.value = 0.5; vg.gain.value = 0.5; a.connect(ag); ag.connect(vg.gain);
	var bp = filt(ctx, "bandpass", p.bp, 2.2), lp = filt(ctx, "lowpass", 1600, 0.7), g = env(ctx, t, p.dur, p.g, 0.012);
	s.connect(vg); vg.connect(bp); bp.connect(lp); lp.connect(g); g.connect(o.dest);
	s.start(t); a.start(t); s.stop(t + p.dur + 0.05); a.stop(t + p.dur + 0.05);
}
var FROG = {
	A: function (o, v, k) { var p = FROG_V[v]; for (var i = 0; i < 5; i++) tone(o, { wave: "square", f: p.f * (1 + i * 0.012), at: i * 0.03, dur: 0.024, g: 0.28 * k * (i < 1 ? 0.6 : 1), atk: 0.002 }); },
	B: function (o, v, k) { var p = FROG_V[v]; amTone(o, { f: p.f * R(0.97, 1.03), am: p.am, bp: p.bp, dur: p.dur, g: 0.75 * k }); tone(o, { f: p.f / 2, dur: p.dur * 0.8, g: 0.08 * k, atk: 0.02 }); },
	C: function (o, v, k) { var p = FROG_V[v]; amTone(o, { wave: "square", f: p.f * R(0.98, 1.02), am: p.am, bp: p.bp, dur: p.dur * 0.9, g: 0.5 * k }); }
};
function croak(style, o, e) {   // ★絵と同じ間（e.beat）で、鳴いているあいだ1声ずつ
	var n = Math.max(1, Math.ceil(e.dur / e.beat)), v = e.v || 0;
	for (var i = 0; i < n; i++) FROG[style](later(o, i * e.beat), v, i === 0 ? 0.8 : (i === n - 1 ? 0.85 : 1));
}
// ---- 遠くの森: 虫（★ごくまれ・とても小さい） ----
var INSECT = {
	A: function (o) { var f = R(4200, 4700), t = 0; for (var p = 0; p < 2 + Math.floor(R(0, 3)); p++) { for (var i = 0; i < 3; i++) tone(o, { wave: "square", f: f, at: t + i * 0.032, dur: 0.016, g: 0.25, atk: 0.003 }); t += R(0.35, 0.7); } },
	B: function (o) { var f = R(4300, 4900), t = 0; for (var p = 0; p < 2 + Math.floor(R(0, 4)); p++) { for (var i = 0; i < 4; i++) tone(o, { f: f * R(0.997, 1.003), at: t + i * 0.034, dur: 0.02, g: 0.6 * R(0.7, 1), atk: 0.004 }); t += R(0.32, 0.65); } }
};

// ============================================================
// ■ エンジン: 絵の状態を毎フレーム読んで、鳴らす
// ============================================================
//   pick = { fire: "A|B|C", water: "A|B|C", wind: "A|B|C", frog: "A|B|C", insect: "off|A|B" }
//   onEvent(name) … 鳴らしたときに呼ぶ（★試聴ページで「いま何が鳴ったか」を出すため）
function create(ctx, dest, pick, onEvent) {
	var CL = global.DotCampLakeside, out = ctx.createGain(), now = ctx.currentTime;
	out.gain.setValueAtTime(0, now); out.gain.linearRampToValueAtTime(1, now + 1.2); out.connect(dest);
	var fire = fireBed(ctx, out, pick.fire), leaves = leafBed(ctx, out, pick.wind);
	var me = { last: -1, lastT: null, nextLap: null, nextInsect: null, lastOther: -99, stopped: false };
	function o(g) { return level({ ctx: ctx, dest: out, t0: ctx.currentTime + 0.02 }, g); }
	function tell(n) { if (onEvent) onEvent(n); }
	me.frame = function (s) {
		if (me.stopped || !s) return;
		var t = s.time, a = ctx.currentTime;
		if (me.lastT === null) { me.last = s.sfxSeq; me.lastT = t; me.nextLap = t + R(1.5, 5); me.nextInsect = t + R(6, 18); }
		var dt = t - me.lastT; me.lastT = t; if (dt < 0 || dt > 1) dt = 0;
		var I = CL._fireI(s, t), w = 0;
		// 燃える音: 炎の強さで、ほんの少し（★0.4秒かけてならす）
		fire.gain.setTargetAtTime(LV.bed * (0.55 + 0.6 * clamp(I, 0, 1.3)), a, 0.4);
		// 葉の音: 画面の草を揺らしている風を、草の場所で平均（★ふだんは 0）
		for (var x = 20; x <= 220; x += 50) w += CL._wind(s, t, x);
		w = clamp((w / 5 - 0.36) / 0.75, 0, 1);
		leaves.gain.setTargetAtTime(LV.leaves * Math.pow(w, 1.4), a, 0.35);
		// 絵の出来事（★新しい番号だけ）
		s.sfx.forEach(function (e) {
			if (e.n <= me.last) return; me.last = e.n;
			if (e.type === "pop") { var k = 1 + e.k * 0.6, burstK = rnd() < 0.2 ? 1.35 : k; POP[pick.fire](o(LV.pop), burstK); tell(burstK > 1.2 ? "薪が爆ぜた" : "パチッ（薪）"); }
			else if (e.type === "ember") { if (rnd() < 0.45) { CRACKLE[pick.fire](o(LV.crackle), 0.6 + 0.4 * clamp(e.i, 0, 1)); tell("ぱち（火の粉）"); } }
			else if (e.type === "croak") { croak(pick.frog, o(LV.frog), e); me.lastOther = t + e.dur; tell("カエル"); }
			else if (e.type === "ripple") { CHAPU[pick.water](o(LV.chapu), 0); me.lastOther = t; tell("ちゃぷ（波紋）"); }
			else if (e.type === "gust") { me.lastOther = t + e.dur; tell("風が来る"); }
		});
		// 小さな「パチ」: 火が強いほど出やすい。★ゆっくりした門で「ほとんど鳴らない時間」を作る
		var gate = slow(t * 0.045, 91) > 0.32 ? 1 : 0.12;
		if (rnd() < (0.1 + 0.55 * Math.max(0, I - 0.3)) * gate * dt) { CRACKLE[pick.fire](o(LV.crackle * 0.8), 0.5 + 0.5 * clamp(I, 0, 1)); tell("ぱち"); }
		// 湖と虫は、ほかの音のあとは少し待つ
		if (t >= me.nextLap) {
			if (t - me.lastOther < QUIET_AFTER) me.nextLap = t + R(1.5, 3);
			else { LAP[pick.water](o(LV.lap)); me.lastOther = t; me.nextLap = t + R(LAP_EVERY[0], LAP_EVERY[1]); tell("岸の水"); }
		}
		if (pick.insect && pick.insect !== "off" && t >= me.nextInsect) {
			if (t - me.lastOther < QUIET_AFTER + 1 || w > 0.15) me.nextInsect = t + R(3, 6);
			else { INSECT[pick.insect](o(LV.insect)); me.lastOther = t; me.nextInsect = t + R(INSECT_EVERY[0], INSECT_EVERY[1]); tell("遠くの虫"); }
		}
	};
	me.stop = function () {
		if (me.stopped) return; me.stopped = true;
		var a = ctx.currentTime; out.gain.cancelScheduledValues(a); out.gain.setValueAtTime(out.gain.value, a); out.gain.linearRampToValueAtTime(0, a + 0.6);
		fire.stop(a + 0.7); leaves.stop(a + 0.7);
		setTimeout(function () { try { out.disconnect(); } catch (e) { /* もう外れている */ } }, 900);
	};
	return me;
}

// ============================================================
// ■ 本番の窓口（★2026-09-18 島さんが選んだ: FIRE B / WATER B / WIND B / FROG B / 遠くの虫 あり）
// ============================================================
//   ★AudioContext は釣り場の音と共有（DotFishSound.context）。★新しく作らない（iPhone の解錠も同じもの）
//   ★エンジンは同時に1つだけ。★キャンプに入り直したら（状態が変わったら）古いものを消してから作る
//   ★ゲームは「キャンプの中にいるあいだ」毎フレーム frame(s, on) を呼ぶだけ。
//     ★呼ばれなくなって STALE_MS たつと、静かに消える（一時停止・ショップ・眠り・朝・釣り・別画面）
var CAMP_SOUND_ON = 1;   // 0 = キャンプの音を全部止める
var PROFILE = { fire: "B2", water: "B", wind: "B", frog: "B", insect: "B" };   // ★FIRE は 2026-09-18 に B → B2（島さんがスマホで選んだ。燃える音だけ弱く、パチ・爆ぜは B と同じ）
var STALE_MS = 350;
var cur = null, curState = null, lastFrame = 0, watch = null, made = 0;
function sharedCtx() { var F = global.DotFishSound; return F && F.context ? F.context() : null; }   // ★作る・起こす（触った瞬間だけ）
function peekCtx() { var F = global.DotFishSound; return F && F.peek ? F.peek() : null; }         // ★見るだけ（毎フレーム）
function stopCur() {
	if (cur) { cur.stop(); cur = null; curState = null; }   // ★0.6秒で消える（create の stop）
	if (watch) { clearInterval(watch); watch = null; }
}
function frame(s, on) {
	lastFrame = Date.now();
	if (!CAMP_SOUND_ON || !on || !s) { stopCur(); return; }
	var c = peekCtx();
	// ★まだ触られていない（iPhone で音が起きていない）あいだは作らない
	//   （★時計が止まった所に予約すると、起きた瞬間にまとめて鳴るため）
	if (!c || c.state !== "running") { stopCur(); return; }
	if (cur && curState !== s) stopCur();
	if (!cur) {
		cur = create(c, c.destination, PROFILE, null); curState = s; made++;   // ★1.2秒で立ち上がる
		watch = setInterval(function () { if (Date.now() - lastFrame > STALE_MS) stopCur(); }, 120);
	}
	cur.frame(s);
}

global.DotCampSound = {
	PROFILE: PROFILE, STALE_MS: STALE_MS,
	// ★触った瞬間に呼ぶ（★iPhone は触るまで音を出せない。★釣り場の音と同じ AudioContext を起こす）
	wake: function () { if (CAMP_SOUND_ON) sharedCtx(); },
	frame: frame, stop: stopCur,
	_running: function () { return !!cur; }, _made: function () { return made; },
	LV: LV, create: create,
	// ★試聴ページで1つずつ鳴らすため
	CRACKLE: CRACKLE, POP: POP, LAP: LAP, CHAPU: CHAPU, FROG: FROG, INSECT: INSECT, croak: croak, fireBed: fireBed, leafBed: leafBed, level: level, later: later
};
})(typeof window !== "undefined" ? window : globalThis);
