// ============================================================
// ★★ 仮の部品（四角と線だけ）—— **本物の絵が入ったら、このファイルごと消せます** ★★
// ============================================================
//
//   ■ これは何か
//     背景の絵はまだ一枚も無いので、**仕組みが動くかを確かめるためだけ**に置いた
//     間に合わせの図形です。**絵ではありません。**
//
//   ■ ★これを「アート素材」として扱わないこと
//     ・形も色も、AIが動作確認のために置いただけのもの
//     ・**島さんの絵が1つでも入ったら、この節は用済み**
//
//   ■ ★消し方（本物の絵が入ったとき）
//     ① `js/parts.js` の `PARTS` から `TEMP_` で始まる行を消す
//     ② `index.html` と `sw.js` からこのファイルの行を消す
//     ③ このファイルを消す
//     → `node test/parts.test.js` が「仮の絵はもう無い」と教えます
//
//   ■ 形はコードで作っています（★手で描いていない ＝ 仮であることの印）
// ============================================================
(function (global) {
	"use strict";

	// 塗りつぶした四角
	function rect(w, h, ch) {
		var rows = [], line = new Array(w + 1).join(ch);
		for (var y = 0; y < h; y++) rows.push(line);
		return rows;
	}

	// 三角（山のかたち）
	function tri(w, h, ch) {
		var rows = [];
		for (var y = 0; y < h; y++) {
			var half = Math.round((y + 1) / h * (w / 2));
			var pad = Math.floor(w / 2) - half;
			var body = new Array(half * 2 + 1).join(ch);
			rows.push(new Array(pad + 1).join(".") + body +
				new Array(w - pad - body.length + 1).join("."));
		}
		return rows;
	}

	// なだらかな丘（上が丸い）
	function dome(w, h, ch) {
		var rows = [];
		for (var y = 0; y < h; y++) {
			var t = (y + 1) / h;
			var half = Math.round(Math.sqrt(t) * (w / 2));
			var pad = Math.floor(w / 2) - half;
			var body = new Array(half * 2 + 1).join(ch);
			rows.push(new Array(pad + 1).join(".") + body +
				new Array(w - pad - body.length + 1).join("."));
		}
		return rows;
	}

	function part(rows) { return { TEMP: 1, rows: rows }; }

	global.DotPartsTemp = {
		// ---- 最遠景 ----
		TEMP_MOUNTAIN: part(tri(44, 26, "j")),        // j = 暗い灰

		// ---- 遠景 ----
		TEMP_TOWER: part(rect(9, 30, "k")),           // k = 明るい灰
		TEMP_HILL:  part(dome(38, 14, "h")),          // h = 暗い緑

		// ---- 中景 ----
		// ★色の選び方について（仮の絵でも守ること）
		//   いまの空は **#065ab5（暗くて鮮やかな青）**。明るさで言うと**地面より暗い**。
		//   そのため **中間の茶色（i）や暗い緑は、空に溶けて見えなくなります**（比 1.29）。
		//   → 仮の絵では、空とはっきり差のつく色を選んでいます。
		//   ★本物の絵を描くときも、この制約がそのまま効きます（→ docs/decisions.md 2026-08-11）
		TEMP_TREE: part([
			"..hhh..",
			".hhhhh.",
			"hhhhhhh",
			".hhhhh.",
			"..hhh..",
			"...7...",
			"...7...",
			"...7..."
		]),
		TEMP_HUT: part([
			"...kkk...",
			"..kkkkk..",
			".kkkkkkk.",
			"kkkkkkkkk",
			"kkkkkkkkk",
			"kkkkkkkkk"
		]),

		// ---- 光もの（★フィルターを通さない＝夜でも明るいまま）----
		TEMP_WINDOW: part([
			"mm",
			"mm"
		]),

		// ---- 前景 ----
		TEMP_GRASS: part([
			"n.n.n",
			"nnnnn",
			".nnn."
		]),
		TEMP_FLOWER: part([
			".l.",
			"lll",
			".l.",
			".n.",
			".n."
		])
	};
})(typeof window !== "undefined" ? window : globalThis);
