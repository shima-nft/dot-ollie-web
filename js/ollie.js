// ============================================================
// OLLIE —— スケーターが進み、押すとオーリーする。それだけ。
// ============================================================
//
// ★★2026-08-09、島さんの指定でここまで削ぎ落とした★★
//
//   > 「背景デザインは一色に。背景のスクロールも今は廃止。
//   >   AIが読み間違えないよう js も整理して。まずはシンプルにしたい。
//   >   いらないものは削って、そこから本当に必要なものをじっくり考えましょう。
//   >   障害物も一旦なし。あるのは各種ボタン、距離は小さい数字。」
//
//   ■ いま画面にあるもの（これで全部）
//       ・一色の空
//       ・★★種（シード）から作られる「終わらない地面」（2026-08-11。→ js/world.js）
//       ・★遠景の稜線（同上。要らなければ js/world.js の RIDGE_ON = 0）
//       ・スケーター（島さんが描いた絵）
//       ・★三角コーン（2026-08-10。**置いてあるだけ。まだぶつからない**）
//       ・距離の小さい数字（左上）
//       ・ボタン（音 / 一時停止 / もどる）★液晶の外に並ぶ
//
//   ■ ★★2026-08-11、地面が「まっすぐな線」から「種で作る起伏」になった
//       島さん「マインクラフトも初期はバイオームがなかった。それでもワクワクした。
//               無限の広さや可能性に。」
//       → 帯（バイオーム）も部品も音も時間帯も入れず、**地面だけ**を無限にした。
//       ★副産物: **下り坂で跳ぶと滞空が長く見え、上り坂だと早く着く。**
//         物理は1つも足していない（地面が動くだけ）
//
//   ■ ★★操作は3つ
//       **タップ**       → オーリー
//       **上へなぞる**   → キックフリップ
//       **下へなぞる**   → ポップショウビット（2026-08-10 追加）
//     どれも「技の最中は受け付けない」（技の途中で技は出ない）
//
//   ■ ★技を出していないときの姿（2026-08-10 追加）
//       **ニュートラル（立ち）** … ふだんはこれがループ
//       **プッシュ（走り出し）** … 始まり / たまにランダム / ★技を決めたあとにも たまに
//
//   ■ 削ったもの（**消したのではなく、git の履歴に全部ある**）
//       街の背景・空のグラデーション・背景のスクロール・時間帯・天気・雨と雪・
//       星と月・画面を暗くする乗算・電灯・障害物・当たり判定・ゲームオーバー・
//       ハイスコア・平地・影・画面のひらめきと揺れ
//       → 戻したくなったら `git log` の「a330b04」より前を見る。
//         経緯と理由は `docs/decisions.md` 2026-08-09
//
//   ★**AIへ**: 削ったものを気を利かせて戻さないこと。
//     「本当に必要か」を島さんがこれから決める。**足すのは島さんが決めてから。**
//
// ■ シェル（js/shell.js）との約束（この5つだけ）
//     pad / start(ctx, w, h, opts) / stop() / inputDown(action) / inputUp(action)
// ============================================================
(function (global) {
	"use strict";

	// 島さんが触るファイル
	var FR  = global.DotFrames;         // 1コマを何ミリ秒映すか（js/frames.js）
	var GB  = global.DotPalette.COLORS; // この世界の色（js/palette.js）
	var WD  = global.DotWorld;          // ★世界のかたち（js/world.js）
	var PD  = global.DotPartsDraw;      // ★背景の部品（js/parts.js / js/tint.js）

	// ============================================================
	// ■■■ ★★技の一覧 —— **技を増やすときはここに1行足す** ■■■
	// ============================================================
	//
	//   ★**技の一覧そのものは `js/frames.js` の `TABLES`**（島さんの持ち場）。
	//     ここでは「どの操作で出るか」だけを足している。
	//     2か所に一覧を持つと必ずずれるので、**名前と絵と時間は向こうが正**。
	//
	//   how  … どの操作で出るか（"tap" = タップ / "swipeUp" = 上へなぞる）
	//
	//   ★増やす手順: ①PNGを assets/sprites/ に置く ②tools/sheet2art.py の SHEETS に1行
	//     ③js/frames.js の時間の表と TABLES に1行ずつ ④ここに出し方を1行
	//     ⑤index.html と sw.js に読み込みを1行
	var HOW = {
		OLLIE:    "tap",        // 画面をタップ
		KICKFLIP: "swipeUp",    // 画面を上へなぞる
		POP:      "swipeDown"   // 画面を下へなぞる（ポップショウビット）
	};

	// ★地上の姿（勝手に出るもの）。"loop" = ずっと繰り返す / "once" = 1回だけ流れる
	var IDLE = {
		STANDBY: "loop",        // ニュートラル。ふだんはこれ
		PUSH:    "once"         // プッシュ（走り出し）。始まりと、たまに
	};

	// ★★姿の一覧。技も地上の姿も**同じ形で持つ**（描き方が同じなので分ける理由がない）
	var POSES = FR.TABLES.map(function (T) {
		return {
			name: T.name, label: T.label, art: global[T.art], ms: T.ms,
			how: HOW[T.name] || null,      // 技なら「どの操作で出るか」/ 地上の姿なら null
			idle: IDLE[T.name] || null     // 地上の姿なら "loop" か "once"
		};
	});

	function poseIndex(name) {
		for (var i = 0; i < POSES.length; i++) if (POSES[i].name === name) return i;
		return 0;
	}
	var I_STANDBY = poseIndex("STANDBY");
	var I_PUSH    = poseIndex("PUSH");

	// ============================================================
	// ■■■ 調整値 —— 触るのはここだけ ■■■
	// ============================================================

	var SPEED       = 70;   // 進む速さ（ドット/秒）。**一定**。だんだん速くはならない
	var RIDER_X     = 26;   // スケーターの左端x
	var SCORE_DOTS  = 10;    // 何ドット進むごとに距離が1増えるか

	// ■ 色（数字は `js/palette.js` の何番か）
	var C_BG     = 8;   // ★空（一色）。8=青
	var C_GROUND = 9;   // ★地面（一色）。9=藤色
	var C_RIDGE  = 7;   // ★遠景の稜線。7=濃紺（空より暗い＝遠くのシルエットに見える）
	var C_TEXT   = 13;  // 距離の数字。13=生成り

	// ■ 地面
	var GROUND_FROM_BOTTOM = 36;  // ★地面の**基準線**が、画面の下から何ドットのところにあるか
	//   ★2026-08-11 から、実際の地面はこの線の**上下に起伏する**（→ js/world.js の AMP）

	// ■ ★足元の地面を読む列（スケーターのまん中あたり）
	//   コマによって絵の幅が変わるので、**決め打ちの1列**で読む。
	//   ここを絵の幅から計算すると、コマが変わるたびに上下してガタガタになる
	var RIDER_FOOT = 10;   // RIDER_X から右へ何ドットの所の地面に乗るか

	// ============================================================
	// ■ ★三角コーン（2026-08-10 島さんが描いて「置いてみて。間隔はランダムに」）
	// ============================================================
	//   ★いまは**置いてあるだけ**。ぶつかりません（当たり判定はまだ入れていない）。
	//     入れるかどうかは島さんが決めます
	//
	// ■ ★★2026-08-11、**まっすぐな道の上にしか置かなくなった**（島さんの指定）
	//
	//   坂の途中にコーンがあると、地形と技と障害が同時に来て忙しい。
	//   **平らな道に置けば「ここで技を決めろ」という舞台**になる。
	//   → まっすぐな道が「休憩」から**「見せ場」**に変わる
	//   → ★**平らな地面が右から見えてきた瞬間が「予告」**になる（コーンが来るぞ）
	//
	//   ★丘には何も置かない（島さんの指定）。丘の主役は**地形そのもの**
	//     （てっぺんで跳ぶといちばん高く見え、下り坂だと滞空が伸びる）
	var CONE_ON       = 1;    // 1=出す / 0=出さない
	var CONE_GAP_MIN  = 80;   // ★**まっすぐな道の中での**間隔（ドット）。★ここから
	var CONE_GAP_MAX  = 170;  //   ★ここまでの間でランダムに決まる
	//   ★まっすぐな道は 220〜420ドットなので、これで**1本に だいたい2〜3個**。
	//     ★詰めれば増え、広げれば減る（0個の道も増える）
	//   ★間隔は**距離（ドット）**で数える。速さを変えても見た目の詰まり方が変わらない
	//
	//   ★★置く場所は**種（シード）で決めない。** 決めると「覚えゲー」になる
	//     （`SPEC.md` 5章）。**舞台（まっすぐな道）は種で決まるが、その上の配置は決まらない**

	// ■ ★プッシュ（走り出し）が、たまに勝手に出る間隔（秒）
	//   島さん「少し間が開くときなどにランダムで行うアクション」
	var PUSH_EVERY_MIN = 2.5;   // 次のプッシュまで。★ここから
	var PUSH_EVERY_MAX = 6.0;   //   ★ここまでの間でランダム

	// ■ ★★技を決めたあと、そのままプッシュに入る割合（0〜1）
	//   島さん「プッシュはトリックを決めたあとにもたまに行うように。そのほうが自然」
	//   1 = 毎回かならず / 0 = 一度も入らない / 0.4 = だいたい5回に2回
	var PUSH_AFTER_TRICK = 0.4;

	// ■ ★なぞったとき、オーリーを別の技に差し替えられる猶予（ミリ秒）
	//   押した瞬間にオーリーが出るので、そこから指を上へ動かすまでの間を見てあげる。
	//   ★短くすると「なぞったのにオーリーが出た」が増える／長くすると
	//     「跳んでから気が変わった」まで通ってしまう
	var SWIPE_GRACE_MS = 160;

	// ★★オーリーの高さと滞空は、**島さんが描いた絵**が決めている。
	//   絵の中で足元の行が 48 → 23 → 48 と動くので、それがそのまま跳躍になる。
	//   物理の数字（初速・重力）はこのファイルに1つも無い。
	//   手触りを変えるのは `js/frames.js` の34行（1コマ何ミリ秒か）。
	//   → 決めるためのページ: /tools/preview-frames.html

	// ============================================================
	// 以下は仕組み。ふつうは触らない
	// ============================================================

	var ctx = null, W = 0, H = 0, GROUND = 0;
	var beep = null, soundOn = true, refreshPad = null;
	var raf = null, timer = null, last = 0, lastTickAt = 0;
	var WATCHDOG_MS = 100;   // これだけ画面の更新が来なければ、見張りが代わりに進める
	var st = null;

	// ------------------------------------------------------------
	// ■ ★スケーターの絵から「動き」を読み取る
	//   コードは絵を測るだけ。位置を作り直さないので、**描いたとおりに動く**
	//   ★技ごとに測る（絵の大きさも位置も技で違うため）
	// ------------------------------------------------------------
	(function measure() {
		POSES.forEach(function (P) {
			var A = P.art, x0 = 999;
			for (var i = 0; i < A.FRAMES.length; i++) {
				if (A.FRAMES[i].x < x0) x0 = A.FRAMES[i].x;
			}
			P.x0 = x0;                     // いちばん左に描かれている列
			P.lifts = A.FRAMES.map(function (f) {
				return A.FEET_ROW - (f.y + f.rows.length - 1);   // 足元の浮き
			});
		});
	})();

	// ★コーンの絵（1コマだけ）。位置も大きさも、島さんが描いたまま使う
	var CONE = global.DotConeArt;

	// ★いま出している姿。技を出していれば技、そうでなければ地上の姿
	function currentPose() {
		return (st.air >= 0) ? POSES[st.trick] : POSES[st.idle];
	}

	// ★いま出すコマの番号
	function currentFrame() {
		var P = currentPose();
		var ms = (st.air >= 0) ? st.air : st.idleMs;
		var i = FR.frameAt(P.ms, ms);
		return (i < 0) ? P.ms.length - 1 : i;      // 行き過ぎたら最後のコマで待つ
	}

	// ------------------------------------------------------------
	// ■ 音（切っているときは鳴らさない。ここを通さないと切れない）
	// ------------------------------------------------------------
	function sound(freq, dur) {
		if (soundOn && beep) beep(freq, dur);
	}

	function loadSound() {
		try { soundOn = localStorage.getItem("dotollie-sound") !== "off"; } catch (e) { soundOn = true; }
		global.DotOllie.padIcons.sound = soundOn ? "BTN_SOUND_ON" : "BTN_SOUND_OFF";
		return soundOn;
	}

	function saveSound(on) {
		try { localStorage.setItem("dotollie-sound", on ? "on" : "off"); } catch (e) { /* 保存できなくても遊べる */ }
	}

	// ------------------------------------------------------------
	// ■ 状態
	// ------------------------------------------------------------
	function reset() {
		// ★★新しい世界に入る。ここで種を1つ引く（→ js/world.js）
		//   同じ種なら地形はまったく同じ。★いまは画面に出していないが、
		//   出したくなったら DotWorld.getSeed() を1行書くだけ
		WD.newSeed();
		PD.reset();      // ★世界が変わったので、焼いてあった背景の紙を捨てる
		st = {
			dist: 0,      // 進んだ距離（ドット）
			air: -1,      // ★技の進み具合（ミリ秒）。-1 = 転がっている
			trick: 0,     // ★いま出している技（POSES の何番目か）。air >= 0 のときだけ意味を持つ
			// ★地上の姿（技を出していないとき）
			idle: I_PUSH,   // ★始まりは「プッシュ」＝走り出し（島さんの指定）
			idleMs: 0,      // その姿の進み具合（ミリ秒）
			nextPush: 0,    // 次にプッシュするまでの残り（秒）
			paused: false,
			// ★三角コーン。画面の右から流れてくる。中身は { x } だけ
			cones: [],
			nextCone: 0,   // 次のコーンを出すまでの残り距離（ドット）
			conesBorn: 0   // ★これまでに出したコーンの数（テストが見張るためだけの数）
		};
		st.nextCone = nextConeGap();
		st.nextPush = nextPushWait();
	}

	function meters() { return Math.floor(st.dist / SCORE_DOTS); }

	// ------------------------------------------------------------
	// ■ ★地面の読み方（2026-08-11）
	//   ★**ドット単位に丸めてから**世界を読む。
	//     丸めないと、地面が1ドット未満でにじんで**ちらつく**（ドット絵が濁る）
	// ------------------------------------------------------------
	function worldX() { return Math.round(st.dist); }        // 画面の左端は世界のどこか

	// 画面の col 列目の「地面の面」の行。★小さいほど高い
	function groundRowAt(col) { return GROUND - WD.groundAt(worldX() + col); }

	// スケーターの足元の行（＝いま乗っている地面）
	function riderGroundRow() { return groundRowAt(RIDER_X + RIDER_FOOT); }

	// 次のコーンまでの間隔をランダムに引く
	function nextConeGap() {
		return CONE_GAP_MIN + Math.random() * (CONE_GAP_MAX - CONE_GAP_MIN);
	}

	// 次にプッシュするまでの待ち時間をランダムに引く
	function nextPushWait() {
		return PUSH_EVERY_MIN + Math.random() * (PUSH_EVERY_MAX - PUSH_EVERY_MIN);
	}

	// ★地上の姿を進める（技を出していないときだけ動く）
	//   ・ニュートラル … ずっとループ。たまにプッシュへ切り替わる
	//   ・プッシュ     … 1回流れたらニュートラルへ戻る
	function updateIdle(dt) {
		st.idleMs += dt * 1000;
		var P = POSES[st.idle];
		var done = (FR.frameAt(P.ms, st.idleMs) < 0);
		if (P.idle === "loop") {
			if (done) st.idleMs = 0;                       // 繰り返す
			st.nextPush -= dt;
			if (st.nextPush <= 0) {                        // ★たまにプッシュ
				st.idle = I_PUSH;
				st.idleMs = 0;
			}
		} else if (done) {                                 // "once" が終わった
			st.idle = I_STANDBY;
			st.idleMs = 0;
			st.nextPush = nextPushWait();
		}
	}

	function update(dt) {
		if (st.paused) return;
		var moved = SPEED * dt;
		st.dist += moved;

		// ★三角コーン: 画面の右の外から出して、左へ流す
		if (CONE_ON) {
			st.nextCone -= moved;
			if (st.nextCone <= 0) {
				// ★★出そうとした場所が「まっすぐな道の本体」のときだけ出す（2026-08-11）
				//   `>= 1` ＝ 完全に平らなところ。**入口と出口のなだらかな坂には置かない**
				//   平らでなければ「今回は出さない」だけ（抽選のタイミングはそのまま進む）
				var bornAt = worldX() + W + 4;
				if (WD.flatnessAt(bornAt) >= 1) {
					// wx = ★このコーンが**世界のどこに立っているか**。
					//   描くのには使わないが、「本当に平らな道の上か」を測るときの正。
					//   画面の x から逆算すると丸めが二重にかかってブレる
					st.cones.push({ x: W + 4, wx: bornAt });
					st.conesBorn++;                   // ★テストが「全滅していないか」を見る
				}
				st.nextCone = nextConeGap();          // ★間隔は毎回ランダム
			}
			for (var i = st.cones.length - 1; i >= 0; i--) {
				st.cones[i].x -= moved;
				if (st.cones[i].x + CONE.FRAMES[0].rows[0].length < 0) st.cones.splice(i, 1);
			}
		}
		// ★技: 島さんの絵を js/frames.js の時間どおりに送る。物理の計算は無い
		if (st.air >= 0) {
			st.air += dt * 1000;
			if (FR.frameAt(POSES[st.trick].ms, st.air) < 0) {
				st.air = -1;                     // 最後まで行った
				// ★★着地したあと、たまにそのままプッシュへ（島さんの指定。そのほうが自然）
				st.idle = (Math.random() < PUSH_AFTER_TRICK) ? I_PUSH : I_STANDBY;
				st.idleMs = 0;
				st.nextPush = nextPushWait();
			}
		} else {
			updateIdle(dt);
		}
	}

	// ------------------------------------------------------------
	// ■ 描く
	//   ★上から順に: 背景 → 地面 → スケーター → 距離
	// ------------------------------------------------------------
	// 絵を1コマ描く。**技もコーンも同じ道具で描く**
	//   ox / oy = 画面のどこに置くか（絵の左上）
	function drawArt(f, ox, oy) {
		var rows = f.rows;
		for (var r = 0; r < rows.length; r++) {
			var line = rows[r], y = oy + r;
			if (y < 0 || y >= H) continue;
			var c = 0;
			// 横に続く同じ色はまとめて塗る（1ドットずつ塗ると重くなる）
			while (c < line.length) {
				var ch = line.charAt(c);
				if (ch === ".") { c++; continue; }
				var run = 1;
				while (c + run < line.length && line.charAt(c + run) === ch) run++;
				ctx.fillStyle = GB[global.DotPalette.indexOfChar(ch)];
				ctx.fillRect(ox + c, y, run, 1);
				c += run;
			}
		}
	}

	function drawSkater(index) {
		var P = currentPose(), A = P.art, f = A.FRAMES[index];
		drawArt(f,
			RIDER_X + (f.x - P.x0),                     // ★描いた位置をそのまま使う
			riderGroundRow() - 1 - A.FEET_ROW + f.y);   // ★足がつく行を、いまの地面に重ねる
	}

	// ★三角コーン。**絵のいちばん下が地面に乗る**（島さんが描いたまま）
	//   ★2026-08-11 から、コーンも**その場所の地面の高さ**に乗る（坂の上では高い）
	function drawCones() {
		var f = CONE.FRAMES[0], half = Math.floor(f.rows[0].length / 2);
		for (var i = 0; i < st.cones.length; i++) {
			var cx = Math.round(st.cones[i].x);
			drawArt(f, cx, groundRowAt(cx + half) - 1 - CONE.FEET_ROW + f.y);
		}
	}

	// ------------------------------------------------------------
	// ■ ★横に長い帯をまとめて塗る（2026-08-11）
	//   240列を1本ずつ塗ると命令が240回になる。
	//   となり合う列は**たいてい同じ高さ**なので、**同じ高さが続くあいだはまとめて塗る**。
	//   → 実測で命令はおよそ 240回 → 40〜60回になる
	//   rowOf(col) = その列の「面」の行。そこから画面の下まで塗る
	// ------------------------------------------------------------
	function fillBelow(rowOf, color) {
		ctx.fillStyle = color;
		var c = 0;
		while (c < W) {
			var top = rowOf(c), run = 1;
			while (c + run < W && rowOf(c + run) === top) run++;
			var y = (top < 0) ? 0 : top;
			if (y < H) ctx.fillRect(c, y, run, H - y);
			c += run;
		}
	}

	function draw() {
		// ① 空（一色）。★このあと地面と稜線を上から重ねる
		ctx.fillStyle = GB[C_BG];
		ctx.fillRect(0, 0, W, H);

		// ② ★遠景の稜線（あれば）。★地面より先に描くので、手前の地面に隠れる
		if (WD.RIDGE_ON) {
			var bx = worldX();
			fillBelow(function (c) { return GROUND - WD.ridgeAt(bx + c); }, GB[C_RIDGE]);
		}

		// ③ ★★背景の部品（最遠景→遠景→中景→光もの）。→ js/parts.js / js/tint.js
		//   ★奥ほどゆっくり流れ、奥ほど淡い。**地面より先に描くので、手前の地面に隠れる**
		PD.draw(ctx, worldX(), 0);

		// ④ ★★地面。**種から作られる起伏**（→ js/world.js）
		fillBelow(groundRowAt, GB[C_GROUND]);

		// ⑤ ★前景の部品（草・花）。★地面と同じ速さ・フィルターなし＝いちばん濃く鮮やか
		PD.draw(ctx, worldX(), 1);

		// ⑥ 三角コーン（★スケーターより先に描く = 人が手前に見える）
		if (CONE_ON) drawCones();

		// ⑦ スケーター
		drawSkater(currentFrame());

		// ⑧ ★★プレイヤーより手前の草花（地面より下がったもの）
		//   島さん「地面に埋もれているのではなく、**手前にある**という表現に見せたい」
		//   ★決まりは「画面で下にあるものほど、手前」
		PD.draw(ctx, worldX(), 2);

		// ⑨ 距離（左上に小さく）。★右上は [音][一時停止][もどる] が重なるので使わない
		global.DotFont.drawText(ctx, String(meters()), 2, 2, GB[C_TEXT]);

		// ⑩ 一時停止中だけ、まん中に PAUSE
		if (st.paused) {
			var F = global.DotFont;
			F.drawText(ctx, "PAUSE", Math.floor((W - F.textWidth(5)) / 2),
				Math.floor(GROUND / 2) - 4, GB[C_TEXT]);
		}
	}

	// ============================================================
	// ■ ループの回し方（2026-08-06 の教訓をそのまま持ってきている）
	//
	//   `setInterval(16ms)` だけで回すと、画面の更新（16.7ms）とずれて
	//   **約17コマに1回、1コマのあいだに2回進む** = カクついて見える。
	//   → **画面の更新に合わせて進める**（requestAnimationFrame）。
	//
	//   ただし rAF は**画面が隠れると止まる**（2026-07-19 に固まる事故があった）。
	//   → **見張り（setInterval）を横に置く**。更新が来ないときだけ代わりに進める
	// ============================================================
	function nowMs() {
		return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
	}

	function tick() {
		var now = nowMs();
		var dt = Math.min(0.05, (now - last) / 1000);
		last = now;
		lastTickAt = now;
		update(dt);
		draw();
	}

	function frame() {
		if (raf === null) return;                   // stop() 済み
		raf = global.requestAnimationFrame(frame);
		tick();
	}

	function watchdog() {
		if (nowMs() - lastTickAt >= WATCHDOG_MS) tick();
	}

	function startLoop() {
		stopLoop();
		last = nowMs();
		lastTickAt = last;
		if (typeof global.requestAnimationFrame === "function") {
			raf = global.requestAnimationFrame(frame);
			timer = setInterval(watchdog, WATCHDOG_MS);
		} else {
			timer = setInterval(tick, 16);          // 古いブラウザ・テスト用
		}
	}

	function stopLoop() {
		if (raf !== null && typeof global.cancelAnimationFrame === "function") {
			global.cancelAnimationFrame(raf);
		}
		raf = null;
		if (timer !== null) clearInterval(timer);
		timer = null;
	}

	// ============================================================
	// ■ シェルとの窓口
	// ============================================================
	global.DotOllie = {
		pad: ["act", "sound", "pause"],
		padIcons: { sound: "BTN_SOUND_ON" },

		start: function (c, w, h, opts) {
			ctx = c; W = w; H = h;
			beep = opts && opts.beep;
			refreshPad = opts && opts.refreshPad;
			GROUND = H - GROUND_FROM_BOTTOM;
			PD.setup(W, H, GROUND);      // ★背景の部品に、画面の大きさと地面の位置を教える
			loadSound();
			reset();
			startLoop();
			tick();          // 開始直後に1枚描いて、すぐ画面を切り替える
		},

		stop: function () { stopLoop(); },

		inputDown: function (action) {
			if (action === "pause") { this.togglePause(); return; }
			if (action === "sound") { this.toggleSound(); return; }
			this.input();
		},

		inputUp: function () { /* 押しっぱなしは使わない */ },

		// ★★技を出す。`how` は "tap"(タップ) か "swipeUp"(上へなぞる)
		//   ★ここでやるのは「どの技かを決めて 0 にする」だけ。
		//     高さも滞空も**島さんが描いた絵**が決める
		trick: function (how) {
			if (st === null || st.paused) return false;
			for (var i = 0; i < POSES.length; i++) {
				if (POSES[i].how !== how) continue;
				st.trick = i;
				st.air = 0;
				// 技ごとに音を変える（タップ990 / 上へ1320 / 下へ660）
				sound(how === "swipeUp" ? 1320 : (how === "swipeDown" ? 660 : 990), 0.06);
				return true;
			}
			return false;
		},

		// ★タップ = オーリー。**技の最中は受け付けない**(技の途中で技は出ない)
		input: function () {
			if (st === null || st.paused || st.air >= 0) return;
			this.trick("tap");
		},

		// ★★上へなぞる = キックフリップ
		//   シェルは「押した瞬間にオーリー」を出しているので、
		//   **出だしのうち(SWIPE_GRACE_MS 以内)なら、キックフリップに差し替える**。
		//   どちらの技も出だしは「しゃがむ」なので、差し替わっても見た目が飛ばない
		inputSwipeUp: function () { this.swipe("swipeUp"); },

		// ★★下へなぞる = ポップショウビット（2026-08-10 島さんの指定）
		inputSwipeDown: function () { this.swipe("swipeDown"); },

		// なぞりで技を出す。
		//   シェルは「押した瞬間にオーリー」を出しているので、
		//   **出だしのうち(SWIPE_GRACE_MS 以内)なら、なぞった技に差し替える**。
		//   どの技も出だしは「しゃがむ」なので、差し替わっても見た目が飛ばない
		swipe: function (how) {
			if (st === null || st.paused) return;
			var justTapped = (st.air >= 0 && st.air <= SWIPE_GRACE_MS &&
				POSES[st.trick].how === "tap");
			if (st.air < 0 || justTapped) this.trick(how);
		},

		togglePause: function () {
			if (st === null) return;
			st.paused = !st.paused;
			sound(st.paused ? 440 : 660, 0.06);
		},

		toggleSound: function () {
			soundOn = !soundOn;
			this.padIcons.sound = soundOn ? "BTN_SOUND_ON" : "BTN_SOUND_OFF";
			saveSound(soundOn);
			if (refreshPad) refreshPad();
			sound(880, 0.05);
		},

		// ------------------------------------------------------------
		// テスト用の覗き窓
		// ------------------------------------------------------------
		_state: function () { return st; },
		// ★テスト用: 1コマぶんだけ手で進める(実時間を待たずに、終わりの処理まで通せる)
		_step: function (dt) { update(dt); },
		_draw: function () { draw(); },
		_meters: meters,
		_consts: function () {
			return {
				SPEED: SPEED, RIDER_X: RIDER_X, SCORE_DOTS: SCORE_DOTS,
				GROUND_FROM_BOTTOM: GROUND_FROM_BOTTOM, RIDER_FOOT: RIDER_FOOT,
				COLORS: { BG: C_BG, GROUND: C_GROUND, RIDGE: C_RIDGE, TEXT: C_TEXT },
				// ★世界のかたち（js/world.js。テストが「起伏の分だけ余白があるか」を測るのに使う）
				WORLD: WD,
				PALETTE: GB,
				PAD: this.pad, SWIPE_GRACE_MS: SWIPE_GRACE_MS,
				CONE_ON: CONE_ON, CONE_GAP_MIN: CONE_GAP_MIN, CONE_GAP_MAX: CONE_GAP_MAX,
				CONE_W: CONE.FRAMES[0].rows[0].length,
				CONE_H: CONE.FRAMES[0].rows.length,
				CONE_SOURCE: CONE.SOURCE,
				// ★技は数字ではなく「島さんが描いた動き」。テストもここから読む
				POSES: POSES.map(function (P) {
					return {
						name: P.name, label: P.label, how: P.how, idle: P.idle, x0: P.x0,
						count: P.art.COUNT, feetRow: P.art.FEET_ROW,
						source: P.art.SOURCE,
						ms: P.ms, totalMs: FR.totalMs(P.ms), lifts: P.lifts
					};
				}),
				PUSH_EVERY_MIN: PUSH_EVERY_MIN, PUSH_EVERY_MAX: PUSH_EVERY_MAX,
				PUSH_AFTER_TRICK: PUSH_AFTER_TRICK
			};
		}
	};
})(typeof window !== "undefined" ? window : globalThis);
