// ★★このファイルは自動生成です。手で書き換えないでください★★
//
//   もと: assets/sprites/trafficcone-export.png(島さんが描いたスケーター)
//   作り方: 「絵を反映する.bat」をダブルクリック(tools/sheet2art.py が作ります)
//
//   ■ 中身
//     FRAMES  … 1コマ = { x, y, rows }。
//               x,y は 64×64 のマスの中での左上の位置(★描いた位置のまま)。
//               rows の1文字 = **js/palette.js の色の番号**(0〜9・a〜f・g〜p)。"." = 透明
//     FEET_ROW … 絵の中で「足がつく」いちばん下の行。ここが道の面に重なる
//
//   ★色そのものは js/palette.js にある(ここには持たない。2か所に真実を置かないため)
(function (global) {
	"use strict";
	global.DotConeArt = {
		SOURCE: "assets/sprites/trafficcone-export.png",
		CELL: 64,
		COUNT: 1,
		FEET_ROW: 45,
		FRAMES: [
			{ // 0 コマ目
				x: 27, y: 36, rows: [
					"....0....",
					"...0l0...",
					"...0l0...",
					"..0ddd0..",
					"..0lll0..",
					"..0ddd0..",
					"..0lll0..",
					".0000000.",
					"0lllllll0",
					"000000000",
				]
			}
		]
	};
})(typeof window !== "undefined" ? window : globalThis);
