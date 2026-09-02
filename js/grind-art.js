// ★★このファイルは自動生成です。手で書き換えないでください★★
//
//   もと: assets/shapes/reruyou.aseprite(島さんが描いたスケーター)
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
	global.DotGrindArt = {
		SOURCE: "assets/shapes/reruyou.aseprite",
		CELL: 64,
		COUNT: 1,
		FEET_ROW: 44,
		FRAMES: [
			{ // 0 コマ目
				x: 20, y: 20, rows: [
					".......999.........",
					"......9lll9........",
					".....9lllll9.......",
					".....9iioo9..99....",
					".....9oioo9.9o9....",
					"......9ooo99o9.....",
					"......99o99o9......",
					".....9ttltt9.......",
					"....9ttttt9........",
					"...9oottt9.........",
					".99o99ttt9.........",
					"9oo9.9ttt9.........",
					"999..9ttt9.........",
					"....9ttll9999......",
					".....9lllllll9..99.",
					".....9la9999ll99an9",
					"....9ll9....9lltan9",
					"....9l9......9ttn9.",
					"....9l9....99ann9..",
					"....9l9..99ann999..",
					"...99l999ann99.99..",
					"..99tttann99.......",
					"..9nnnnn99.........",
					"...99999...........",
					"......99...........",
				]
			}
		]
	};
})(typeof window !== "undefined" ? window : globalThis);
