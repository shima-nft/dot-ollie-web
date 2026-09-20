// ============================================================
// DotTrip —— 坑道ワイプ（2026-09-21(2) 島さんの指定で作り直した）
// ============================================================
//
//   ★★★**1回押したら、そのまま目的地へ行く**。★途中で何も要求しません（★追加のタップは不要）。
//   ★★「場所が変わった」ことだけを、短いドット絵と音で伝えます（★文字の説明はしません）。
//
//   ■ 3段だけ（★合計 250ms。★初回も2回目も同じ）
//     close  … いまの画面が少し動いて暗くなり、★暗い岩壁が上下から閉じる
//     switch … ほぼまっ暗な一瞬（★ここで行き先へ入れ替わる）
//     open   … 岩壁が上下へ開き、★行き先の画面が出てくる
//
//   ★★前の「縦穴を長く降りる／上がる」演出はやめました
//     （★初回だけ長い・遠い採掘音を待つ・タップで短縮・パララックス移動 は全部廃止）。
//   ★この仕組みは、あとで「キャンプ → 釣り」など ほかの場所でも使い回せます。
(function (global) {
"use strict";

var W = 240, H = 160;

// ============================================================
// ■ 時間と見た目（★ここだけ直せばテンポが変わります）
// ============================================================
var TIME = {
	total: 250,      // ★合計（ms）。★★どちらの向きも同じ・毎回同じ
	close: .52,      // ★岩壁が閉じきるまで（0〜.52 ＝ 0〜130ms）
	sw: .60,         // ★まっ暗な一瞬の終わり（.52〜.60 ＝ 130〜150ms）★ここで行き先へ
	shift: .5        // ★close のうち、画面がずれるのは前半だけ（0〜65ms）
};
var SHIFT = { down: 5, up: -4 };          // ★close 中に画面をずらす量（★下りは下へ・上りは上へ）
var COL = {
	void: "#05060a", deep: "#0d101a",
	rock: ["#1d2233", "#272e44", "#333b55"],   // ★岩壁（暗い洞窟の色）
	edge: "#3c4158", dust: ["#4c536b", "#717485"]
};
// ★音（★あとから WAV に差し替えられるよう、名前だけを投げます）
var SFX = { close: "trip_close", down: "mine_arrive", up: "camp_arrive" };

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function ease(t) { return t * t * (3 - 2 * t); }
function hash(a, b) { var n = Math.imul(a | 0, 374761393) ^ Math.imul((b | 0) + 0x9e37, 668265263); n = (n ^ (n >>> 13)) >>> 0; return (Math.imul(n, 1274126177) >>> 0) / 4294967296; }

// ★いまどの段か／その段の中で 0〜1 のどこか
function phaseOf(s) {
	var p = clamp01(s.t / s.total);
	if (p < TIME.close) return { name: "close", k: p / TIME.close };
	if (p < TIME.sw) return { name: "switch", k: (p - TIME.close) / (TIME.sw - TIME.close) };
	return { name: "open", k: (p - TIME.sw) / (1 - TIME.sw) };
}
// ★★行き先が見えているか（★switch から先は、もう行き先の画面）
function showsTarget(s) { return !!s && s.t >= s.total * TIME.close; }

// ★つなぎを始める（dir = "down" 地下へ ／ "up" 地上へ）
function create(dir) {
	var d = dir === "up" ? "up" : "down";
	return { dir: d, t: 0, total: TIME.total, phase: "close", k: 0, sfx: [], done: false, said: {}, seed: d === "up" ? 77 : 31 };
}
// ★時間を進める。★終わったら true
function update(s, dt) {
	if (!s || s.done) return true;
	s.t += Math.max(0, dt) * 1000;
	var p = phaseOf(s);
	s.phase = p.name; s.k = p.k;
	// ★岩壁が閉じる「ザッ」（★どちらの向きも共通）
	if (!s.said.close && s.t >= s.total * TIME.close * .5) { s.said.close = 1; s.sfx.push(SFX.close); }
	// ★行き先に着いた合図（★下りは閉じきった所で「ゴトン」／上りは開ききる手前で「コトッ」）
	var at = s.dir === "down" ? TIME.close : .82;
	if (!s.said.arrive && s.t >= s.total * at) { s.said.arrive = 1; s.sfx.push(SFX[s.dir]); }
	if (s.t >= s.total) { s.done = true; s.t = s.total; }
	return s.done;
}

// ============================================================
// ■ 描く（★ぼかし・なめらかな階調・大量の粒は使わない）
// ============================================================
var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function veil(box, col, amt) {
	amt = clamp01(amt); if (amt <= 0) return;
	var lv = Math.round(amt * 16);
	for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (BAYER[(y & 3) * 4 + (x & 3)] < lv) box(x, y, 1, 1, col);
}
// ★★岩壁の「口」のかたち（★直線にしない。★4ドットの列ごとに 0〜6ドットの凸凹）
function lipAt(seed, x) { return Math.floor(hash(seed, x >> 2) * 7) + (hash(seed + 5, x >> 1) < .3 ? 2 : 0); }
// ★★上下から閉じる岩壁（p = 0 開いている → 1 閉じきり）
function walls(box, s, p, raw) {
	var k = raw ? clamp01(p) : ease(clamp01(p)), half = H / 2 + 8, x, y, i;
	var topH = [], botH = [];
	for (x = 0; x < W; x++) {
		topH.push(Math.round((half + lipAt(s.seed, x)) * k));
		botH.push(Math.round((half + lipAt(s.seed + 11, x)) * k));
	}
	// ① 岩壁の地
	for (x = 0; x < W; x++) {
		if (topH[x] > 0) box(x, 0, 1, topH[x], COL.rock[0]);
		if (botH[x] > 0) box(x, H - botH[x], 1, botH[x], COL.rock[0]);
	}
	// ② 4〜12ドットの岩ブロック（★壁の中だけ）
	for (i = 0; i < 84; i++) {
		var bw = 4 + Math.floor(hash(s.seed + i, 3) * 9), bh = 3 + Math.floor(hash(s.seed + i, 7) * 6);
		var bx = Math.floor(hash(s.seed + i, 11) * (W - bw)), col = COL.rock[1 + (i % 2)];
		// 上の壁
		var by = Math.floor(hash(s.seed + i, 13) * half);
		if (by + bh <= topH[Math.min(W - 1, bx + (bw >> 1))]) box(bx, by, bw, bh, col);
		// 下の壁
		var by2 = H - 1 - Math.floor(hash(s.seed + i, 17) * half) - bh;
		if (H - by2 <= botH[Math.min(W - 1, bx + (bw >> 1))]) box(bx, by2, bw, bh, col);
	}
	// ③ 口のふち（★1ドットだけ明るく ＝ 岩の角）
	for (x = 0; x < W; x++) {
		if (topH[x] > 1) box(x, topH[x] - 1, 1, 1, COL.edge);
		if (botH[x] > 1) box(x, H - botH[x], 1, 1, COL.edge);
	}
	// ④ 口のきわに舞う粉じん（1〜2ドット）
	for (i = 0; i < 18; i++) {
		x = Math.floor(hash(s.seed + i, 23) * W);
		var up2 = i % 2 === 0, base = up2 ? topH[x] : H - botH[x];
		y = base + (up2 ? 1 : -2) + Math.floor(hash(s.seed + i, 29) * 5) * (up2 ? 1 : -1);
		if (y > 0 && y < H && k > .15) box(x, y, hash(s.seed + i, 31) < .3 ? 2 : 1, 1, COL.dust[i % 2]);
	}
}
// ★★hooks.camp(dx, dy) / hooks.mine(dx, dy) … その画面を描く
function draw(ctx, s, hooks) {
	if (!s) return;
	function box(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
	function screen(which, dy) {
		if (!ctx.save) { which(); return; }
		ctx.save(); if (dy) ctx.translate(0, dy); which(); ctx.restore();
	}
	var from = s.dir === "down" ? hooks.camp : hooks.mine;
	var to = s.dir === "down" ? hooks.mine : hooks.camp;
	if (s.phase === "close") {
		// ★いまの画面が少しずれて暗くなり、そのうえに岩壁が閉じてくる
		var m = clamp01(s.k / TIME.shift);
		screen(from, Math.round(SHIFT[s.dir] * ease(m)));
		veil(box, COL.void, ease(s.k) * .55);
		walls(box, s, s.k);
	} else if (s.phase === "switch") {
		box(0, 0, W, H, COL.void);
		walls(box, s, 1);
	} else {
		// ★★もう行き先の画面（★岩壁が上下へ開いていく）
		screen(to, 0);
		veil(box, COL.void, clamp01(.45 - s.k * .45));
		walls(box, s, (1 - s.k) * (1 - s.k), true);   // ★開くときは、はじめが速い
	}
}

global.DotTrip = {
	create: create, update: update, draw: draw,
	phaseOf: phaseOf, showsTarget: showsTarget,
	TIME: TIME, SHIFT: SHIFT, SFX: SFX, COL: COL
};
})(typeof window !== "undefined" ? window : globalThis);
