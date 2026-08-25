// ============================================================
// ★★地面の際（草の表面）の絵
// ============================================================
//
//   ★★★いまは AI が置いた仮の絵です（★js/gate-art.js と同じ扱い）。
//     ★島さんが描いたら、そのまま差し替わります。
//     ★★このファイルは node tools/edge2art.js が作ります（★手で書き換えない）
//
//   ■ ★描き替えるのは2手
//     ① assets/shapes/edge-sheet.png を描き替える（★1段 64×10）
//     ② node tools/edge2art.js
//     ★★段を増やすほど、横の繰り返しが見えなくなります
//
//   ■ ★★★守ること
//     ① ★高さは固定。★薄いところは透明にして土を見せる（★見切れない）
//     ② ★★左端と右端の厚みはそろえる（★継ぎ目が構造として作れなくなる）
//     ③ ★★いちばん上の行を暗くしない（★コーンが地面に溶ける）
//
//   ■ 使っている色（★5色。★全部 js/palette.js の中）
//     c=#008751 / k=#00e436 / q=#00e000 / x=#66ff66 / y=#00ad00
//     ★ "." は透明（★土がそのまま見える）
// ============================================================
(function (global) {
	"use strict";
	global.DotEdgeArt = {
		W: 64, H: 10,
		EDGE_THICK: 7,   // ★左端と右端の厚み（★全部の絵で同じ）
		SHEETS: [
			// 1段目
			[
				"kxkxkxkxkxkxkxqxkxqxkxkxkxkxkxqxkxqxkxkxkxkxkxkxkxkxkxkxkxkxkxkx",
				"xkxkxkxkxkxkxqxkxkxkxkxkxkxkxqxkxkxqxkxqxkxkxkxkxkxkxkxkxkxkxkxk",
				"kkkkkkkkkkkkkqqkkkqkkkkkkkkkkqqkkkqyqkqyqyqyqkqkkkqkqkqkqkqkqkkk",
				"kqkqkqkqkqkqkqyqkqyqkqkqkqkqkqyqkqyyyqyyyyyyyqyqkqyqyqyqyqyqyqyq",
				"ykykykykykykqyyyqyyyqyqyqyqyqyyyqycccycccyyyyyyyqyyyyyyyyyyyyyyy",
				"yyyyyyyyyyyyycccycccyyyyyyyyycccyc...c...c.c.c.cyc.c.c.c.c.c.cyc",
				"cycycycycycyccc.c.cycycycycyccc.c...............c.............cy",
				".c.c.c.c.c.c.......c.c.c.c.c....................................",
				"................................................................",
				"................................................................"
			],
			// 2段目
			[
				"kxkxkxkxkxkxkxkxkxkxkxqxkxqxkxkxkxkxqxkxqxkxkxqxkxkxqxkxkxkxkxkx",
				"xkxkxkxkxkxkxkxkxkxkxkxkxyxqxkxkxkxkxqxkxqxkxkxkxkxqxkxkxkxkxkxk",
				"kkkkkkkkkkkkkkkkkkkkkkqkqyyqqkkkkkkkqqkkqqkkkkqkkkkqkkqkqyqkqkkk",
				"kqkqkqkqkykqkqkqkqkqkqyqyccyyqkqkqkqqqkqqqkqkqqqkqkqkqyqycyqyqkq",
				"ykykykykyyqyqyqqqyqyqycyc..ccyqyqyqyqyqyqyqyqykyqyqyqycyc.cycyqy",
				"yyyyyyyyycycycyyycycyc.c.....cycyyyyycyyycycycyyycycyc.c...c.cyc",
				"cycycycyc.c.c.cyc.c.c.........c.cycycccyc.c.c.cyc.c.c.........cy",
				".c.c.c.c.......c.................c.c...c.......c................",
				"................................................................",
				"................................................................"
			],
			// 3段目
			[
				"kxkxkxkxqxkxqxkxkxqxkxkxkxkxkxqxkxkxkxkxkxkxkxkxqxkxkxkxkxkxkxkx",
				"xkxkxkxqxqxkxkxkxkxkxkxkxkxkxkxkxkxkxkxkxkxkxkxkxkxkxkxkxkxkxkxk",
				"kkkkkkkqqqkkqkqkqyykqkkkkkkkkkqkykqkqkkkqkqkkkkkqkkkkkkkqyqkqkkk",
				"kqkqkykqqqkqqqyqyccyyqkqkqkqkqqyyyyqyqkqyqyqkqkqyqkqkqkqycyqyqkq",
				"ykqkyyyyyyqyyycyc.cycyqkqkqyqyyycycycyqycycyqyqkykqqqyqyc.cycyqy",
				"yyyyycycccyccc.c...c.cyyyqycyccc.c.c.cyc.c.cycyyyyqyycyc...c.cyc",
				"cycyc.c.ccc...........cycycycyc.......c.....c.cycyyyc.c.......cy",
				".c.c...................c.cyc.c.................c.cyc............",
				"..........................c.......................c.............",
				"................................................................"
			],
			// 4段目
			[
				"kxkxkxkxqxkxkxkxkxqxkxqxkxkxkxkxkxkxqxkxkxkxkxkxkxkxkxkxkxkxkxkx",
				"xkxkxkxkxqxkxkxkxkxqxqxkxkxkxqxkxkxkxqxkxqxkxkxkxkxkxkxkxkxkxkxk",
				"kkkkkkkkqqkkqyqkkkqqkqqkqkqkqqkkkkkkqqkkkqkkqyqkkkkkkkkkqkqkqkkk",
				"kqkqkqkqqqkqycyqkqqqkqqqyqyqyqkqkqkqqqkqkqkqycyqkqkqkqkqyqyqyqkq",
				"qyqyqyqyyqkyc.cyqyyqqyyycycycyqyqyqyyyqyqyqyc.cyqyqkqyqycycycyqy",
				"ycycycycccyc...cyccyyccc.c.c.cycycycccycycyc...cycyqycyc.c.c.cyc",
				"cyc.cycyc.c.....cyccccc.......c.c.c.cccyc.c.....cycycyc.......cy",
				".c...c.c.........c.cyc.................c.........c.cyc..........",
				"....................c...............................c...........",
				"................................................................"
			]
		]
	};
})(typeof window !== "undefined" ? window : globalThis);
