// ============================================================
// ★★★★★YES / NO のボタン —— 島さんが描いた絵（自動生成）
// ============================================================
//
//   ★★このファイルは `tools/botan2art.py` が作ります。**手で書き換えない。**
//     ★描き直したら、もう一度 `python tools/botan2art.py` を走らせてください。
//
//   > 島さん「YES/NO選択はスライド選択ではなくボタンタップにします。」（2026-09-04）
//
//   ■ 中身
//     YES      … ★ふつう（★白い本体 ＋ 下に黒い影）
//     YES_DOWN … ★★押しているあいだ（★黒い本体 ＋ 緑のふち）
//     NO / NO_DOWN … 同じ
//
//   ★★色はこの世界の42色だけ（★`js/palette.js` が正）。
//     ★★★1文字＝1ドット。★「.」は透明（★下の絵が見える）
// ============================================================
(function (global) {
	"use strict";

	global.DotCampBtnArt = {
		SOURCE: "assets/parts/botan1.aseprite",
		// ★YES … 38×16 ドット（★元の紙の y 1〜16）
		YES: { rows: [
				"......99999999999999999999999999......",
				"....99tttttttttttttttttttttttttt99....",
				"..99tttttttttttttttttttttttttttttt99..",
				".9tttttttttttttttttttttttttttttttttt9.",
				".9ttttttt9ttt9ttt9999tttt999tttttttt9.",
				"9tttttttt9ttt9ttt9tttttt9tttttttttttt9",
				"9ttttttttt9t9tttt9tttttt9tttttttttttt9",
				"9tttttttttt9ttttt999ttttt99tttttttttt9",
				"9tttttttttt9ttttt9ttttttttt9ttttttttt9",
				"9tttttttttt9ttttt9ttttttttt9ttttttttt9",
				"99ttttttttt9ttttt9999ttt999ttttttttt99",
				".9tttttttttttttttttttttttttttttttttt9.",
				".999tttttttttttttttttttttttttttttt999.",
				"..9999tttttttttttttttttttttttttt9999..",
				"....999999999999999999999999999999....",
				"......99999999999999999999999999......"
			] },
		// ★YES_DOWN … 38×15 ドット（★元の紙の y 19〜33）
		YES_DOWN: { rows: [
				"......qqqqqqqqqqqqqqqqqqqqqqqqqq......",
				"....qq99999999999999999999999999qq....",
				"..qq999999999999999999999999999999qq..",
				".q9999999999999999999999999999999999q.",
				".q9999999q999q999qqqq9999qqq99999999q.",
				"q99999999q999q999q999999q999999999999q",
				"q999999999q9q9999q999999q999999999999q",
				"q9999999999q99999qqq99999qq9999999999q",
				"q9999999999q99999q999999999q999999999q",
				"q9999999999q99999q999999999q999999999q",
				".q999999999q99999qqqq999qqq999999999q.",
				".q9999999999999999999999999999999999q.",
				"..qq999999999999999999999999999999qq..",
				"....qq99999999999999999999999999qq....",
				"......qqqqqqqqqqqqqqqqqqqqqqqqqq......"
			] },
		// ★NO … 38×16 ドット（★元の紙の y 40〜55）
		NO: { rows: [
				"......99999999999999999999999999......",
				"....99tttttttttttttttttttttttttt99....",
				"..99tttttttttttttttttttttttttttttt99..",
				".9tttttttttttttttttttttttttttttttttt9.",
				".9tttttttttt9ttt9tttt999tttttttttttt9.",
				"9ttttttttttt99tt9ttt9ttt9tttttttttttt9",
				"9ttttttttttt99tt9ttt9ttt9tttttttttttt9",
				"9ttttttttttt9t9t9ttt9ttt9tttttttttttt9",
				"9ttttttttttt9tt99ttt9ttt9tttttttttttt9",
				"9ttttttttttt9tt99ttt9ttt9tttttttttttt9",
				"99tttttttttt9ttt9tttt999tttttttttttt99",
				".9tttttttttttttttttttttttttttttttttt9.",
				".999tttttttttttttttttttttttttttttt999.",
				"..9999tttttttttttttttttttttttttt9999..",
				"....999999999999999999999999999999....",
				"......99999999999999999999999999......"
			] },
		// ★NO_DOWN … 38×15 ドット（★元の紙の y 59〜73）
		NO_DOWN: { rows: [
				"......qqqqqqqqqqqqqqqqqqqqqqqqqq......",
				"....qq99999999999999999999999999qq....",
				"..qq999999999999999999999999999999qq..",
				".q9999999999999999999999999999999999q.",
				".q9999999999q999q9999qqq999999999999q.",
				"q99999999999qq99q999q999q999999999999q",
				"q99999999999qq99q999q999q999999999999q",
				"q99999999999q9q9q999q999q999999999999q",
				"q99999999999q99qq999q999q999999999999q",
				"q99999999999q99qq999q999q999999999999q",
				".q9999999999q999q9999qqq999999999999q.",
				".q9999999999999999999999999999999999q.",
				"..qq999999999999999999999999999999qq..",
				"....qq99999999999999999999999999qq....",
				"......qqqqqqqqqqqqqqqqqqqqqqqqqq......"
			] },
		_end: 0
	};
})(typeof window !== "undefined" ? window : globalThis);
