// ============================================================
// 背景の部品を「置いて・淡くして・流す」仕組み（★ふつうは開かない）
// ============================================================
//
//   ★島さんが触るのは `js/parts.js`（何を置くか）と `js/tint.js`（どれくらい淡くするか）。
//     このファイルは、その2つを画面にするだけの係です。
//
// ■ ★★1: 同じ景色が繰り返して見えないようにしてある
//
//   「1周ぶんの絵を作って、横に貼り続ける」やり方はいちばん簡単ですが、
//   **同じ山・同じ木が一定の間隔でずっと繰り返され、すぐ見破られます。**
//
//   → そうではなく、世界を **区画（256ドット）** に切り、
//     **区画ごとに、種と区画番号から中身を決めています。**
//     区画番号が計算に入るので、**同じ並びは二度と出てきません。**
//
//   ★区画は「その場で計算できる」ので、覚えておく必要がありません
//     （`js/world.js` の地面と同じ考え方）。
//     **遠くへ行っても重くならず、戻れば同じ景色に戻ります。**
//
// ■ ★★2: 「淡くする」は、重ねるのではなく色を置き換えている
//
//   半透明の板を画面に重ねる代わりに、**26色それぞれを「混ぜたあとの色」に置き換え**ます。
//   見た目は同じで、こちらのほうが:
//
//     ・**同じところに二重にかからない**（部品が重なっても1回だけ）
//     ・毎コマ画面いっぱいを塗り直さないので速い
//     ・機械が数字で確かめられる
//
//   → 置き換えの表は `js/tint.js` が作ります。
//
// ■ ★★3: 「焼き付け」は速さのためだけ。絵は1ドットも変えない
//
//   区画1つぶんを裏の紙に1回描いておき、あとは**その紙を貼るだけ**にします。
//   ★色も位置も焼く前とまったく同じ（同じ整数の位置に、同じ色を置くだけ）なので、
//     **焼いても見た目は変わりません。**
//   ★裏の紙が作れない場所（node でのテストなど）では、**毎コマ描く道**を通ります。
// ============================================================
(function (global) {
	"use strict";

	var P  = global.DotParts;
	var TI = global.DotTint;
	var WD = global.DotWorld;
	var PAL = global.DotPalette;

	var CHUNK = 256;         // 区画1つの幅（その層での距離・ドット）
	var MAX_PER_CHUNK = 64;  // 区画1つに置く部品の上限（暴走よけ）

	var W = 0, H = 0, GROUND = 0;
	var caches = [];          // 層ごとの「焼いた紙」置き場
	var bakeOn = true;        // ★ベンチで切り替える
	var stamp = "";           // 種や時間帯が変わったら焼き直すための印

	// ------------------------------------------------------------
	// ■ 絵の形をそろえる
	//   ・島さんの PNG から作った絵 … { FEET_ROW, FRAMES:[{x,y,rows}] }
	//   ・仮の絵                    … { rows }
	//   どちらも「足元を基準にした上端のずれ」に直して使う
	// ------------------------------------------------------------
	// ★★名前の決まり（2026-08-11 に実物で確かめた）
	//
	//   **1つの絵 = 1枚のPNG = 1本の js = 1つの名前**
	//
	//     assets/parts/flower.png  →  js/parts-flower-art.js  →  global.DotPartFlower
	//     → `js/parts.js` には `art: "DotPartFlower"` と書く
	//
	//   ★★2026-08-12、島さんが「絵を1枚足すのに4か所さわる」で詰まったので、こう変えた:
	//
	//       **`assets/parts/` に保存する → 「絵を反映する.bat」 → `js/parts.js` に1行**
	//
	//     `tools/sheet2art.py` が `assets/parts/` を丸ごと見て、
	//     **1つの箱 `DotPartsArt` にまとめて** `js/parts-art.js` を作る。
	//     ★だから読み込みの行は最初の1回だけで済む（絵を足しても増えない）。
	//     ★`js/parts.js` には **ファイル名（例 `"flower"`）**を書く
	function artOf(name) {
		var a = (global.DotPartsArt && global.DotPartsArt[name]) ||
			(global.DotPartsTemp && global.DotPartsTemp[name]) ||
			global[name];
		if (!a) return null;
		if (a.FRAMES) {
			var f = a.FRAMES[0];
			return { rows: f.rows, topOff: -1 - a.FEET_ROW + f.y, w: f.rows[0].length, h: f.rows.length };
		}
		return { rows: a.rows, topOff: -a.rows.length, w: a.rows[0].length, h: a.rows.length };
	}

	var artCache = {};
	function art(name) {
		if (artCache[name] === undefined) artCache[name] = artOf(name);
		return artCache[name];
	}

	// ------------------------------------------------------------
	// ■ ★区画の中身を決める（★覚えない。種と区画番号からその場で計算する）
	//   返すのは [{ pi:部品の番号, lx:その層での位置 }]
	// ------------------------------------------------------------
	function placementsIn(li, k) {
		var L = P.LAYERS[li];
		if (!L || !L.on) return [];
		var mine = [];
		for (var i = 0; i < P.PARTS.length; i++) {
			if (P.PARTS[i].layer === L.name) mine.push(i);
		}
		if (!mine.length) return [];

		var seed = WD.getSeed();
		var salt = seed + 7919 * (li + 1) + 31;
		var base = k * 8191;
		var total = 0;
		for (i = 0; i < mine.length; i++) total += (P.PARTS[mine[i]].weight || 1);

		var out = [];
		var start = k * CHUNK, end = start + CHUNK;
		// ★★最初のずれは**区画いっぱい**の幅で振る。
		//   ここを狭くすると（例: 48ドット）、部品が区画の頭に寄って
		//   **一定間隔に並んだ「格子」に見えてしまう**（＝周期が見破られる）
		var x = start + Math.floor(WD.rand(base + 1, salt) * CHUNK);
		var n = 0;

		// 出やすさ（weight）で部品を1つ選ぶ
		function pickOne(seq) {
			var r = WD.rand(base + seq, salt) * total, pick = mine[0];
			for (var j = 0; j < mine.length; j++) {
				r -= (P.PARTS[mine[j]].weight || 1);
				if (r <= 0) { pick = mine[j]; break; }
			}
			return pick;
		}

		// ============================================================
		// ★★★「塊（クラスター）」で置く —— 島さんの指示（2026-08-13）
		// ============================================================
		//
		//   島さん:
		//   > 遠景は建物や森などを**単体で散らさず、複数の部品を組み合わせて景観の塊**を作る。
		//   > 各距離のオブジェクトは、単独で均等に配置せず、**大小・間隔・重なりを変える**。
		//   > 「**一定間隔でランダム配置**」を基本にしない。
		//
		//   ■ 何が変わるか
		//     ふつうの置き方 …… 1つ置く → その部品の `gap` ぶん進む → 1つ置く（★等間隔）
		//     ★**塊の置き方** …… **密に何個か固めて置く** → **大きく空ける** → また固める
		//
		//   ★★これで「森」「街」が**ひとかたまりの景観**になり、
		//     間の空白が「ここには何も無い」を作る（＝疎密のリズムが生まれる）。
		//
		//   ■ ★塊の中を「部品の幅より狭い間隔」にすると**重なります**。
		//     重なると輪郭が1つにつながって、**個々の部品に見えなくなります**（狙いどおり）
		//
		//   ■ ★★区画番号 k と種だけで決まる作りは崩していません
		//     （前の区画を見に行かない＝無限・戻れば同じ・軽さはそのまま）
		var C = L.cluster;
		if (!C) {
			// ---- ふつうの置き方（前景など、散らしたい層）----
			while (x < end && n < MAX_PER_CHUNK) {
				var pick = pickOne(n * 3 + 2);
				out.push({ pi: pick, lx: x });
				var g = P.PARTS[pick].gap;
				x += Math.round(g[0] + WD.rand(base + n * 3 + 3, salt) * (g[1] - g[0]));
				n++;
			}
			return out;
		}

		// ---- ★塊の置き方 ----
		var cn = 0;
		while (x < end && n < MAX_PER_CHUNK && cn < 40) {
			// この塊に何個入れるか
			var sz = Math.round(C.size[0] +
				WD.rand(base + cn * 7 + 4101, salt) * (C.size[1] - C.size[0]));
			for (var m = 0; m < sz && n < MAX_PER_CHUNK; m++) {
				out.push({ pi: pickOne(n * 3 + 2), lx: x });
				// ★塊の中は狭い間隔（＝重なる）
				x += Math.round(C.inner[0] +
					WD.rand(base + n * 3 + 3, salt) * (C.inner[1] - C.inner[0]));
				n++;
			}
			// ★塊と塊の間は大きく空ける
			x += Math.round(C.gap[0] +
				WD.rand(base + cn * 7 + 4102, salt) * (C.gap[1] - C.gap[0]));
			cn++;
		}
		return out;
	}

	// ------------------------------------------------------------
	// ■ ★★持ち上げる量（`lift`）—— 一直線に並ばないようにするためのばらつき
	//
	//   島さん（2026-08-11）:
	//   > 木が一定の高さにあるのと、一マス下にあったりするのとでは
	//   >   どちらが自然に見えますか
	//
	//   ★★決める材料は **「その場所」だけ。種（シード）は入れない**（島さんの指定）。
	//     ＝ **その場所に立っているものは、いつもその高さ**。
	//
	//   ★なぜ「毎回サイコロを振る」形にしないのか:
	//     背景は区画ごとに1回描いて貼るので、**描き直した瞬間に高さが変わってしまう**。
	//       ・時間帯を変えた瞬間、画面の木が一斉に上下へ飛ぶ
	//       ・焼き付けを切ると、毎コマ高さが変わってガタガタ震える
	//       ・「焼いても絵が変わらない」という保証が成り立たなくなる
	//     ★場所から決めれば、この3つが全部起きない。
	//       それでいて**走るたびに置かれる場所そのものが変わる**ので、並びは毎回ちがう
	// ------------------------------------------------------------
	var LIFT_SALT = 60421;   // ★ここに種は足さない（足したら「種で決めない」が崩れる）

	function liftOf(part, pi, lx) {
		var v = part.lift;
		if (v === undefined || v === null) return 0;
		if (typeof v === "number") return v;                  // いつもその高さ
		return Math.round(v[0] + WD.rand(lx, LIFT_SALT + pi) * (v[1] - v[0]));
	}

	// ★その部品の `lift` が取りうる下限・上限
	function liftRange(part) {
		var v = part.lift;
		if (v === undefined || v === null) return [0, 0];
		return (typeof v === "number") ? [v, v] : [v[0], v[1]];
	}

	// ★★持ち上げ量 = その層の `horizon` ＋ 部品の `lift`
	//   ★これが「足元がどれだけ上か」の全て。テストもこの数で見張る
	function raiseOf(L, part, pi, lx) {
		return (L.horizon || 0) + liftOf(part, pi, lx);
	}

	// ------------------------------------------------------------
	// ■ 1つの部品を、どの行に置くか
	// ------------------------------------------------------------
	//   ★★2026-08-13、**部品の `at` だけで決まる形に変えました**（島さんの指定）。
	//
	//     島さん「中景を地面から不自然に浮かせる安全帯ルールは撤廃し、
	//             **オブジェクトごとに接地条件を定義する**」
	//
	//   前は `clear` の層をまるごと「いちばん高い丘のてっぺん＋10行」の上へ押し上げていた。
	//   ★そのため**平らな場所では地面から21ドットも浮き**、山や木が空中に並んで見えていた。
	//
	// ★★2026-08-11 からの決まりはそのまま: 「マイナスの lift のぶん土台を自動で上げる」ことは
	//   しません（層ごとにバラバラに土台がずれ、奥と手前の順番が逆転する原因だった）。
	//   → **`horizon` に一本化**。はみ出しは `test/parts.test.js`【10】が理由を出して止める
	function topRowOf(L, part, A, lx, pi) {
		if (part.at === "空") return (part.y || 0) - liftOf(part, pi, lx);
		if (part.at === "地面") {
			// ★いまの地面の起伏に乗る（前景）
			//   ★ここは `horizon` を使わない（地面そのものが基準なので）
			return GROUND - WD.groundAt(lx) + A.topOff - liftOf(part, pi, lx);
		}
		// ★"地平" … **基準線に立つ**。
		//   ★丘が上がってくれば地面に隠れます。**それが自然**（遠くの土地の見え方）
		return GROUND + A.topOff - raiseOf(L, part, pi, lx);
	}

	// ------------------------------------------------------------
	// ■ 絵を1つ描く（★色は「淡くしたあとの表」から引く）
	// ------------------------------------------------------------
	function drawArt(ctx, A, ox, oy, table, clipH) {
		var rows = A.rows;
		for (var r = 0; r < rows.length; r++) {
			var y = oy + r;
			if (y < 0 || y >= clipH) continue;
			var line = rows[r], c = 0;
			while (c < line.length) {
				var ch = line.charAt(c);
				if (ch === ".") { c++; continue; }
				var run = 1;
				while (c + run < line.length && line.charAt(c + run) === ch) run++;
				ctx.fillStyle = table[PAL.indexOfChar(ch)];
				ctx.fillRect(ox + c, y, run, 1);
				c += run;
			}
		}
	}

	// ------------------------------------------------------------
	// ■ ★★沈んでいるか（＝プレイヤーより手前に描くか）
	//
	//   島さん（2026-08-11）:
	//   > 地面から1〜下 → プレイヤーを優先表示。←**おかしい**。
	//   > これは地面に草花が埋もれているのではなく、**手前にある**という
	//   > 表現に見せたいためです
	//
	//   ★決まりは一言で言うと **「画面で下にあるものほど、手前」**。
	//     だから **地面より下がった草花は、プレイヤーより手前**に描く。
	//   ★`js/parts.js` の層で `sinkInFront: 0` にすれば、前の形に戻ります
	// ------------------------------------------------------------
	function isSunk(L, part, pi, lx) {
		return !!L.sinkInFront && liftOf(part, pi, lx) < 0;
	}

	// ------------------------------------------------------------
	// ■ 1つの層を、ある区画ぶんだけ描く
	//   originLx = 描き先の左端が、その層のどの位置にあたるか
	//   ★となりの区画（k-1 / k+1）からはみ出してくる部品も描く
	//   sunk … null = ぜんぶ / false = 沈んでいないものだけ / true = 沈んだものだけ
	// ------------------------------------------------------------
	function drawLayerRange(ctx, li, kFrom, kTo, originLx, table, clipH, sunk) {
		var L = P.LAYERS[li];
		for (var k = kFrom - 1; k <= kTo + 1; k++) {
			var list = placementsIn(li, k);
			for (var i = 0; i < list.length; i++) {
				var part = P.PARTS[list[i].pi];
				var A = art(part.art);
				if (!A) continue;
				if (sunk !== null && isSunk(L, part, list[i].pi, list[i].lx) !== sunk) continue;
				var x = list[i].lx - originLx;
				if (x + A.w < 0 || x >= W + CHUNK) continue;
				drawArt(ctx, A, x, topRowOf(L, part, A, list[i].lx, list[i].pi), table, clipH);
			}
		}
	}

	// ------------------------------------------------------------
	// ■ 焼き付け（裏の紙）
	// ------------------------------------------------------------
	function canBake() {
		return bakeOn && typeof document !== "undefined" &&
			typeof document.createElement === "function";
	}

	function chunkPaper(li, k, table, sunk) {
		// ★沈んだもの／沈んでいないものは**別の紙**に焼く（描く順が違うため）
		var key = li + "|" + sunk;
		var c = caches[key] || (caches[key] = {});
		if (c[k]) return c[k];
		var cv = document.createElement("canvas");
		cv.width = CHUNK; cv.height = H;
		var cx = cv.getContext("2d");
		// ★焼く紙の中では x=0 が「この区画の左端」
		drawLayerRange(cx, li, k, k, k * CHUNK, table, H, sunk);
		c[k] = cv;
		// 遠くの紙は捨てる（覚えっぱなしにしない）
		var keys = Object.keys(c);
		if (keys.length > 8) {
			keys.sort(function (a, b) { return Math.abs(a - k) - Math.abs(b - k); });
			for (var i = 8; i < keys.length; i++) delete c[keys[i]];
		}
		return cv;
	}

	// ------------------------------------------------------------
	// ■ 層を1枚ぶん画面に置く（★焼いた紙があれば貼る／無ければその場で描く）
	//   ★`draw()` と `drawBehind()` の**両方がここを通る**。
	//     ★2か所に同じ処理を書くと、片方だけ直したときに見た目が割れる
	// ------------------------------------------------------------
	function paintLayer(ctx, li, worldX, sunk) {
		var L = P.LAYERS[li];
		var table = TI.tableFor(L.filter);
		var lx0 = Math.round(worldX * L.speed);
		var kFrom = Math.floor(lx0 / CHUNK), kTo = Math.floor((lx0 + W - 1) / CHUNK);
		if (L.bake && canBake()) {
			for (var k = kFrom; k <= kTo; k++) {
				ctx.drawImage(chunkPaper(li, k, table, sunk), k * CHUNK - lx0, 0);
			}
		} else {
			drawLayerRange(ctx, li, kFrom, kTo, lx0, table, H, sunk);
		}
	}

	// 種や時間帯が変わったら、焼いた紙を捨てる
	function checkStamp() {
		var s = WD.getSeed() + "/" + TI.time + "/" + W + "x" + H + "/" + GROUND;
		if (s !== stamp) { stamp = s; caches = []; }
	}

	// ------------------------------------------------------------
	// ■ 外に出す窓口
	// ------------------------------------------------------------
	global.DotPartsDraw = {
		CHUNK: CHUNK,

		setup: function (w, h, groundRow) {
			W = w; H = h; GROUND = groundRow;
			artCache = {};
			caches = [];
			stamp = "";
		},

		// 走り直したとき（種が変わる）
		reset: function () { caches = []; stamp = ""; },

		// ★時間帯やパレットを変えたとき
		rebake: function () { caches = []; stamp = ""; },

		// ★★画面に描く。段は3つ:
		//     0 … 地面より**奥**（★ただし `behindBand` を持つ層は**ここでは描かない**）
		//     1 … 地面より手前・**プレイヤーより奥**（沈んでいない前景）
		//     2 … ★**プレイヤーより手前**（沈んだ前景。＝「下にあるものほど手前」）
		//
		//   ★★`behindBand` を持つ層は、`drawBehind()` が**その帯を塗る直前**に描きます
		//     （→ すぐ下）。**ここで描くと二重になり、丘の奥に沈みません**
		draw: function (ctx, worldX, stage) {
			checkStamp();
			for (var li = 0; li < P.LAYERS.length; li++) {
				var L = P.LAYERS[li];
				if (!L.on) continue;
				var isFront = L.front ? 1 : 0;
				var sunk;
				if (stage === 0) {
					if (isFront) continue;
					if (L.behindBand) continue;           // ★★この層は drawBehind が描く
					sunk = null;                          // 奥の層はぜんぶ一緒に描く
				} else if (stage === 1) {
					if (!isFront) continue;
					sunk = L.sinkInFront ? false : null;  // 沈んでいないものだけ
				} else {
					if (!isFront || !L.sinkInFront) continue;
					sunk = true;                          // ★沈んだものだけ
				}
				paintLayer(ctx, li, worldX, sunk);
			}
		},

		// ------------------------------------------------------------
		// ★★その帯の「奥」に置く層だけを描く（2026-08-15）
		//
		//   島さん「建物を『地面に立てる』のではなく、**丘の向こう側に存在させる**」
		//
		//   ★`js/ollie.js` の `draw()` が、**帯を塗る直前**にこれを呼びます。
		//     → あとから塗られる帯が、建物の足元を隠す（**ランドマークと同じマスク方式**）。
		//
		//   ★★通る道は `draw()` の段0 とまったく同じ（`paintLayer`）。
		//     **新しい描画の仕組みは作っていません。** 焼き付けもそのまま効きます
		// ------------------------------------------------------------
		drawBehind: function (ctx, worldX, bandName) {
			checkStamp();
			for (var li = 0; li < P.LAYERS.length; li++) {
				var L = P.LAYERS[li];
				if (!L.on || L.front) continue;
				if (L.behindBand !== bandName) continue;
				paintLayer(ctx, li, worldX, null);
			}
		},

		// ------------------------------------------------------------
		// ★テストとベンチが使う覗き窓
		// ------------------------------------------------------------
		_placements: placementsIn,
		_art: art,
		_lift: function (pi, lx) { return liftOf(P.PARTS[pi], pi, lx); },
		_liftRange: liftRange,
		// ★持ち上げ量 = 層の horizon ＋ 部品の lift（テスト【10】が見張る数）
		_raise: function (li, pi, lx) { return raiseOf(P.LAYERS[li], P.PARTS[pi], pi, lx); },
		_raiseRange: function (li, pi) {
			var h = P.LAYERS[li].horizon || 0, r = liftRange(P.PARTS[pi]);
			return [h + r[0], h + r[1]];
		},
		_isSunk: function (li, pi, lx) {
			return isSunk(P.LAYERS[li], P.PARTS[pi], pi, lx);
		},
		_topRowOf: function (li, pi, lx) {
			return topRowOf(P.LAYERS[li], P.PARTS[pi], art(P.PARTS[pi].art), lx, pi);
		},
		// ★「焼いたとき」と「毎コマ描いたとき」に、**同じ条件で**何をどこへ描くかの一覧。
		//   ★同じ整数の位置・同じ色で比べるためのもの（丸め方の違いを不具合扱いしないため）
		_drawList: function (li, worldX, viaChunks, sunk) {
			var L = P.LAYERS[li], out = [];
			if (sunk === undefined) sunk = null;
			var table = TI.tableFor(L.filter);
			var lx0 = Math.round(worldX * L.speed);
			var kFrom = Math.floor(lx0 / CHUNK), kTo = Math.floor((lx0 + W - 1) / CHUNK);
			function push(list, originLx, shift) {
				for (var i = 0; i < list.length; i++) {
					var part = P.PARTS[list[i].pi], A = art(part.art);
					if (!A) continue;
					if (sunk !== null && isSunk(L, part, list[i].pi, list[i].lx) !== sunk) continue;
					var x = list[i].lx - originLx + shift;
					if (x + A.w < 0 || x >= W) continue;
					out.push([part.art, x, topRowOf(L, part, A, list[i].lx, list[i].pi),
						table[PAL.indexOfChar(A.rows.join("").replace(/\./g, "").charAt(0) || "0")]]);
				}
			}
			if (viaChunks) {
				// 焼く道: 区画ごとに焼いて、あとで貼る
				for (var k = kFrom; k <= kTo; k++) {
					for (var kk = k - 1; kk <= k + 1; kk++) {
						push(placementsIn(li, kk), k * CHUNK, k * CHUNK - lx0);
					}
				}
			} else {
				// 毎コマ描く道
				for (var k2 = kFrom - 1; k2 <= kTo + 1; k2++) {
					push(placementsIn(li, k2), lx0, 0);
				}
			}
			out.sort(function (a, b) { return (a[1] - b[1]) || (a[2] - b[2]) || (a[0] < b[0] ? -1 : 1); });
			// 焼く道は区画のはみ出しぶんが重複しうるので、同じものは1つにまとめる
			var uniq = [], seen = {};
			for (var i = 0; i < out.length; i++) {
				var key = out[i].join("|");
				if (seen[key]) continue;
				seen[key] = 1; uniq.push(out[i]);
			}
			return uniq;
		},
		_setBake: function (on) { bakeOn = !!on; caches = []; },
		_bakeOn: function () { return bakeOn; },
		_canBake: canBake
	};
})(typeof window !== "undefined" ? window : globalThis);
