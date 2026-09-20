// ============================================================
// DotMineSound —— 採掘の音（2026-09-19 ★仮の音）
// ============================================================
//
//   ★★仮の音です。★音を理屈で差し替えないこと: 本番の音は tools/preview-sound.html で島さんが選ぶ。
//   ★差し替えやすいように、音は種類ごとに分けてある（VOICES）。
//     さらに「HEAD 素材 × 鉱石」ごとに別の音を当てられる（BY の表。★空なら VOICES のまま）。
//       例: BY["clang"]["carbon:crystal"] = function (o) { ... }
//   ★AudioContext は釣り場・キャンプの音と共有（DotFishSound.context）。★新しく作らない
//   ★音のファイルは使わない（★その場で作る。通信なし）。★Math.random は使わない
(function (global) {
"use strict";
var MINE_SOUND_ON = 1;
var LV = { hit: 0.42, hitHard: 0.42, clang: 0.5, crack: 0.3, break: 0.62, scatter: 0.2, absorb: 0.16, rare: 0.34, upgrade_complete_head: 0.34, upgrade_complete_handle: 0.3, upgrade_available: 0.24, ui_tick: 0.07, discover: 0.26, new_material_discovered: 0.3 };
// ★音のファイルに差し替える口（2026-09-19）: ここに "assets/sound/xxx.wav" のように書くと、その音を鳴らす（★無い・読めないときは下の作った音）
var SAMPLES = { upgrade_complete_head: null, upgrade_complete_handle: null, upgrade_available: null, ui_tick: null, new_material_discovered: null };

var seed = ((Date.now() ^ 0x1b873593) >>> 0) || 1;
function rnd() { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; }
function R(a, b) { return a + rnd() * (b - a); }
function ctxOf() { var F = global.DotFishSound; return F && F.context ? F.context() : null; }
var NOISE = null;
function noise(ctx) {
	if (NOISE && NOISE.ctx === ctx) return NOISE.buf;
	var n = Math.floor(ctx.sampleRate * 1.5), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
	for (var i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
	NOISE = { ctx: ctx, buf: b }; return b;
}
function env(ctx, t, dur, peak, atk) { var g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(Math.max(peak, .0002), t + (atk || .002)); g.gain.exponentialRampToValueAtTime(.0001, t + dur); return g; }
function burst(o, p) {
	var ctx = o.ctx, t = o.t0 + (p.at || 0), s = ctx.createBufferSource(); s.buffer = noise(ctx); s.loop = true;
	var f = ctx.createBiquadFilter(); f.type = p.type || "bandpass"; f.frequency.value = p.f; f.Q.value = p.q || 1;
	if (p.f2) { f.frequency.setValueAtTime(p.f, t); f.frequency.exponentialRampToValueAtTime(p.f2, t + p.dur); }
	var g = env(ctx, t, p.dur, p.g, p.atk); s.connect(f); f.connect(g); g.connect(o.dest); s.start(t, rnd()); s.stop(t + p.dur + .05);
}
function tone(o, p) {
	var ctx = o.ctx, t = o.t0 + (p.at || 0), s = ctx.createOscillator(); s.type = p.wave || "sine"; s.frequency.setValueAtTime(p.f, t);
	if (p.f2) s.frequency.exponentialRampToValueAtTime(p.f2, t + (p.fT || p.dur));
	var g = env(ctx, t, p.dur, p.g, p.atk); s.connect(g); g.connect(o.dest); s.start(t); s.stop(t + p.dur + .05);
}
// ★★HEAD ごとの音の性格（2026-09-20(5) 島さんの指定）: 同じ鉱石でも、HEAD が変わると音が変わる
//   mul = 高さの倍率 ／ bite = 当たりの鋭さ ／ body = 低い胴鳴り
var HEAD_TONE = {
	iron: { mul: .92, bite: .7, body: 1.15 },          // 鈍い
	carbon: { mul: 1, bite: 1, body: 1 },              // 硬い
	chromoly: { mul: 1.12, bite: 1.35, body: .9 },     // 鋭い
	tool: { mul: 1.05, bite: 1.6, body: 1.25 },        // 強い金属感
	carbide: { mul: .96, bite: 1.9, body: 1.5 }        // 短く重い
};
function headTone(d) { return HEAD_TONE[d && d.head] || HEAD_TONE.carbon; }
function oreTone(d) { return (d && d.tone) || 1; }
// ---- 声（★種類ごと。★k = 強さ） ----
var VOICES = {
	// 通常命中「ゴッ／カン」: 石が受ける低い音 ＋ 先端の小さな硬い音
	hit: function (o, k, d) { var h = headTone(d), t = oreTone(d);
		tone(o, { f: R(110, 140) * t, f2: 70 * t, dur: .09, g: .8 * h.body });
		burst(o, { f: R(900, 1400) * t, q: 1.1, dur: .05, g: .7 * h.bite, atk: .001 });
		burst(o, { f: 3200 * t * h.mul, q: 2, dur: .02, g: .35 * h.bite, atk: .0005 }); },
	// 硬い命中「キン」: 高い倍音が少し残る
	hitHard: function (o, k, d) { var h = headTone(d), t = oreTone(d);
		tone(o, { f: R(160, 190) * t, f2: 100 * t, dur: .07, g: .6 * h.body });
		[1, 2.76, 5.4].forEach(function (m, i) { tone(o, { f: 900 * m * t * h.mul, dur: .18 - i * .04, g: .18 / (i + 1) * h.bite }); });
		burst(o, { f: 2400 * t, q: 1.5, dur: .03, g: .5 * h.bite, atk: .0005 }); },
	// 砕けない「カァン！」: 金属の倍音（整数比でない）＋火花の粒
	clang: function (o) { [1, 2.76, 5.4, 8.93].forEach(function (m, i) { tone(o, { f: 620 * m * R(.99, 1.01), dur: .55 - i * .1, g: .32 / (i + 1), atk: .001 }); });
		burst(o, { type: "highpass", f: 4000, dur: .08, g: .4, atk: .0005 }); for (var i = 0; i < 4; i++) burst(o, { type: "highpass", f: 6000, at: .02 + i * R(.02, .05), dur: .012, g: .18 }); },
	// ★★新しい「素材」を初めて手に入れた合図（2026-09-20(9) 島さんの指定）
	//   ★「コロン → キラッ」。★0.4秒ほど・明るい・少し不思議・ファンファーレにはしない
	//   ★★これは **仮の音** です（本番は tools/preview-sound.html で島さんが選ぶ）
	new_material_discovered: function (o) {
		tone(o, { wave: "triangle", f: 523.25, dur: .1, g: .5, atk: .004 });                 // コロン（ド）
		tone(o, { wave: "triangle", f: 783.99, at: .08, dur: .13, g: .45, atk: .004 });       // 　　（ソ）
		tone(o, { wave: "sine", f: 1244.5, at: .17, dur: .22, g: .34, atk: .006 });           // キラッ（ミ♭ ＝ 少し不思議）
		tone(o, { wave: "sine", f: 1661.2, at: .2, dur: .18, g: .16, atk: .008 });
		burst(o, { type: "highpass", f: 7000, at: .18, dur: .06, g: .12, atk: .004 }); },
	// ★新しい鉱石を初めて見た合図（★短く・小さく。★文字は出さない）
	discover: function (o) { [1, 1.5, 2.25].forEach(function (m, i) { tone(o, { wave: "triangle", f: 880 * m, at: i * .05, dur: .12, g: .2 / (i + 1) }); });
		burst(o, { type: "highpass", f: 6000, at: .05, dur: .04, g: .1, atk: .002 }); },
	// 小さなヒビ「ピシッ」
	crack: function (o) { burst(o, { type: "highpass", f: R(2500, 4000), dur: .035, g: .8, atk: .0004 }); burst(o, { f: 1800, q: 3, at: .012, dur: .02, g: .4 }); },
	// 最終破壊「ドゴッ！」: 低い衝撃 ＋ 砕ける音 ＋ 崩れる粒
	"break": function (o, k, d) { var h = headTone(d), t = oreTone(d), one = d && d.oneShot;   // ★一撃で砕いたときは、少しだけ強く短く
		tone(o, { f: 95 * t * (one ? .85 : 1), f2: 42 * t, dur: one ? .26 : .32, g: 1 * h.body * (one ? 1.25 : 1), atk: .002 });
		burst(o, { type: "lowpass", f: 900 * t, f2: 200, dur: one ? .3 : .4, g: .9 * (one ? 1.2 : 1), atk: .002 });
		burst(o, { f: 1500 * t, q: .8, dur: .12, g: .8 * h.bite, atk: .001 });
		for (var i = 0; i < (one ? 5 : 7); i++) burst(o, { f: R(1800, 4200) * t, q: 2, at: .05 + i * R(.025, .06), dur: .02, g: .35 * (1 - i / 8) }); },
	// 素材が散る「カラカラ」
	scatter: function (o, k) { for (var i = 0; i < Math.min(6, 2 + (k || 3)); i++) tone(o, { wave: "square", f: R(1200, 2200), at: i * R(.03, .06), dur: .03, g: .12 }); },
	// 吸い込み「チッ」（★ドットらしく短い上がる音）。★続けて届くと少しずつ高く（seq）、4個目から「チン」の余韻。★レアは少し高い
	absorb: function (o, k, d) { d = d || {}; var n = Math.min((d.seq || 1) - 1, 5), f = (d.rare ? 1230 : 820) * (1 + .05 * n);
		tone(o, { wave: "square", f: f, f2: f * 1.8, dur: .045, g: .17 });
		if (n >= 3 || d.rare) tone(o, { f: f * 2, at: .01, dur: .12, g: .07 }); },
	// レア素材「キラン」
	rare: function (o) { [1, 1.5, 2, 3].forEach(function (m, i) { tone(o, { f: 1320 * m, at: .12 + i * .06, dur: .4, g: .14 }); }); },
	// ★★HEAD を作り上げた音（2026-09-20(4) 島さんの指定）「カチャ → コンッ → キィン…」
	//   0ms 小さな金属部品が合わさる ／ 110ms 圧入・固定の低い音 ／ 200ms 完成した金属が澄んで響く
	upgrade_complete_head: function (o) {
		burst(o, { type: "highpass", f: 4200, dur: .022, g: .5, atk: .0004 });                      // カチャ（部品が合わさる）
		burst(o, { f: 2600, q: 3, at: .022, dur: .018, g: .3, atk: .0004 });
		tone(o, { f: 190, f2: 96, dur: .16, g: .95, at: .11, atk: .002 });                          // コンッ（圧入・固定）
		burst(o, { type: "lowpass", f: 900, f2: 260, at: .11, dur: .14, g: .55, atk: .002 });
		[1, 2.76, 5.4].forEach(function (m, i) {                                                    // キィン…（澄んだ余韻）
			tone(o, { f: 1860 * m * (i ? 1.002 : 1), at: .2, dur: .34 - i * .09, g: .26 / (i + 1.4), atk: .004 });
		});
		burst(o, { type: "highpass", f: 7000, at: .2, dur: .05, g: .12, atk: .003 });
	},
	// ★「作れるようになった」知らせ（2026-09-20(3)）: ピン → キラン↑。★作り終えた音とは別・短く・宝箱ほど派手にしない
	upgrade_available: function (o) {
		tone(o, { wave: "triangle", f: 1319, dur: .07, g: .3 });                                    // ピン（E6）
		tone(o, { wave: "triangle", f: 1976, at: .08, dur: .09, g: .28 });                          // キラン（B6）
		tone(o, { f: 1976 * 2, at: .08, dur: .26, g: .07 });                                        // ★細い余韻
		burst(o, { type: "highpass", f: 6000, at: .08, dur: .03, g: .12, atk: .001 });
	},
	// ★★HANDLE を作り上げた音「コッ → トン → チン」（★HEAD よりやわらかい。★強い金属音にしない）
	upgrade_complete_handle: function (o) {
		burst(o, { f: 1400, q: 2, dur: .02, g: .3, atk: .0006 });                                  // コッ（組み合わせる）
		tone(o, { wave: "triangle", f: 330, f2: 210, dur: .1, g: .5 });
		tone(o, { wave: "triangle", f: 220, f2: 150, at: .1, dur: .14, g: .6, atk: .003 });        // トン（はまる）
		burst(o, { type: "lowpass", f: 700, f2: 300, at: .1, dur: .1, g: .3, atk: .003 });
		tone(o, { wave: "triangle", f: 1568, at: .21, dur: .22, g: .22, atk: .004 });              // チン（軽い余韻）
		tone(o, { f: 1568 * 2, at: .21, dur: .16, g: .06, atk: .004 });
	},
	// ★装備の列が1段カチッと決まった音（★とても小さい）
	ui_tick: function (o) { burst(o, { f: 2000, q: 4, dur: .014, g: .5, atk: .0004 }); tone(o, { wave: "square", f: 620, dur: .02, g: .12 }); }
};
var BY = { hit: {}, hitHard: {}, clang: {}, crack: {}, "break": {}, scatter: {}, absorb: {}, rare: {}, upgrade_complete_head: {}, upgrade_complete_handle: {}, upgrade_available: {}, ui_tick: {}, discover: {}, new_material_discovered: {} };   // ★HEAD × 鉱石で差し替える口（★absorb は素材ごと: BY.absorb.iron など）
function voice(kind, head, ore, mat) { var t = BY[kind] || {}; return (mat && t[mat]) || t[head + ":" + ore] || t[head] || t[ore] || VOICES[kind]; }
var lastAbsorb = 0, loaded = {}, recent = [], ABSORB_WINDOW = .15, ABSORB_MAX = 4;
// ★SAMPLES に書いたファイルを1度だけ読んで鳴らす（★読めるまでは作った音）
function sample(ctx, type, dest) {
	var url = SAMPLES[type]; if (!url || typeof fetch !== "function") return false;
	var L = loaded[url];
	if (!L) { L = loaded[url] = { buf: null };
		fetch(url).then(function (r) { return r.arrayBuffer(); }).then(function (a) { return ctx.decodeAudioData(a); }).then(function (b) { L.buf = b; }).catch(function () { L.failed = true; }); }
	if (!L.buf) return false;
	var src = ctx.createBufferSource(); src.buffer = L.buf; src.connect(dest); src.onended = function () { try { dest.disconnect(); } catch (e) { /* もう外れている */ } }; src.start(); return true;
}
function play(e) {
	if (!MINE_SOUND_ON || !e || !VOICES[e.type]) return;
	var ctx = ctxOf(); if (!ctx || ctx.state !== "running") return;
	if (e.type === "absorb") {   // ★たくさん届いてもうるさくしない: 18ms より詰まった音は鳴らさない・0.15秒に4つまで
		var now = ctx.currentTime; recent = recent.filter(function (t) { return now - t < ABSORB_WINDOW; });
		if (now - lastAbsorb < .018 || recent.length >= ABSORB_MAX) return;
		lastAbsorb = now; recent.push(now); }
	var g = ctx.createGain(); g.gain.value = LV[e.type] || .3; g.connect(ctx.destination);
	var d = e.data || {}, o = { ctx: ctx, dest: g, t0: ctx.currentTime + .005 };
	if (sample(ctx, e.type, g)) return;
	voice(e.type, d.head, d.ore, d.mat)(o, d.count, d);
	setTimeout(function () { try { g.disconnect(); } catch (err) { /* もう外れている */ } }, 1500);
}
global.DotMineSound = {
	wake: function () { if (MINE_SOUND_ON) ctxOf(); },
	event: play, VOICES: VOICES, BY: BY, LV: LV, SAMPLES: SAMPLES, KINDS: Object.keys(VOICES)
};
})(typeof window !== "undefined" ? window : globalThis);
