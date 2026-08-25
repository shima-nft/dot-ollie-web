// ============================================================
// ★★体力（HP）バーの絵 —— ★★島さんが描いた絵 ★★
// ============================================================
//
//   ★★★これは**島さんの絵**です。AIは1ドットも触っていません。
//     もと: `assets/shapes/bar-now-export.png`
//     ★★このファイルは `node tools/bar2art.js` が作ります（★手で書き換えない）
//
//   ■ ★描き直したときの入れ替え方は2手
//     ① `assets/shapes/bar-now-export.png` を上書き保存する
//     ② `node tools/bar2art.js`
//
//   ■ ★★★中身（残量で伸び縮みするところ）＝ **島さんが緑で塗ったところ**
//     ★コード側に幅の数字を1つも書いていません。
//     ★★だから緑の形を変えれば、伸び縮みする形もそのまま変わります。
//     ★残っている側は 緑 → 黄 → 橙 → 赤 に変わります（`BAR_STEPS`）。
//     ★減った側は炭（`C_BAR_BACK`）で塗ります。
//
//   ■ 使っている色（★3色。★全部 `js/palette.js` の中）
//     9=#000000 / k=#00e436 / t=#fcf5fd
//     ★"." は透明（★背景がそのまま見える）
// ============================================================
(function (global) {
	"use strict";
	global.DotBarArt = {
		SOURCE: "assets/shapes/bar-now-export.png",   // ★★島さんの絵
		W: 240, H: 14,
		// ★★残量で伸び縮みするところ（★島さんが緑で塗ったところ）
		FILL_CHAR: "k",
		FILL_X0: 3, FILL_X1: 236,
		FILL_Y0: 9, FILL_Y1: 11,
		rows: [
			"..9999999999999.................................................................................................................................................................................................................................",
			"..9t99tt99tttt99................................................................................................................................................................................................................................",
			"..9t99tt99tt99t99...............................................................................................................................................................................................................................",
			"..9ttttt99tt99t99...............................................................................................................................................................................................................................",
			"..9t99tt99tttt999...............................................................................................................................................................................................................................",
			"..9t99tt99tt9999................................................................................................................................................................................................................................",
			"..9t99tt99tt999.................................................................................................................................................................................................................................",
			"..99999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999..",
			".9tttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttt9.",
			".9tkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkt9.",
			".9tkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkt9.",
			".9tkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkt9.",
			".9tttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttt9.",
			"..99999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999.."
		]
	};
})(typeof window !== "undefined" ? window : globalThis);
