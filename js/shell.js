// ============================================================
// シェル(土台) — 液晶・音・ゲームパッド・ゲーム選択画面
// ============================================================
//
// このファイルは「毎回同じもの」。ゲームを1本足すときに触るのは、
// すぐ下の GAMES 配列に1行足すことだけ。
//
// ■ ゲームを1本足す手順
//   1. js/あたらしいゲーム.js を作る(書き方は js/ollie.js が見本)
//      ※ ただし**この作品では別ゲームを足さない**。遊びは RUN 1本に絞る
//   2. index.html に <script src="js/あたらしいゲーム.js"></script> を足す
//   3. sw.js の FILES に足して CACHE の番号を上げる
//   4. 下の GAMES に1行足す
//
(function (global) {
	"use strict";

	// ============================================================
	// ■ ここだけ書き換える: 遊べるゲームの一覧
	// ============================================================
	// label は液晶に出る名前(英数字のみ。5×7フォントに日本語は無い)
	// sprite はメニューに出る絵。★選択画面には**スケーターの1コマ目**を出す
	var TITLE = "OLLIE";          // 画面上部に出す題名。空なら出さない
	var GAMES = [
		{ label: "START", skater: 0, game: function () { return DotOllie; } }
	];

	// ============================================================
	// 以下は土台。ふつうは触らない
	// ============================================================

	// ★★画面の色は `js/palette.js`(26色)が唯一の正。ここに色コードを書かない
	//   (RUN は5色をここと js/run.js の2か所に書いていて、ずれる余地があった)
	var GB = global.DotPalette.COLORS;
	// ★★液晶のドット数 = **ゲームボーイアドバンスと同じ 240×160**
	//   (2026-08-09 島さんの指定「画面が小さく感じたので GBA と同等に」)。
	//   128×64(RUN) → 144×144 → **240×160**。横に広いので**障害物を見る時間が伸びる**
	//   ここを変えると画面全体の広さが変わる。**テストはこの2行を読んで自動で追随する**
	//   (`test/sprites.test.js` / `test/ollie.test.js` が正規表現で拾っている)
	var LCD_W = 240;
	var LCD_H = 160;

	var mode = "menu";            // menu(選択画面) / game(プレイ中)
	var cursor = 0;               // 選択中の項目
	var activeGame = null;

	var lcd = document.getElementById("lcd");
	lcd.width = LCD_W;
	lcd.height = LCD_H;
	var lctx = lcd.getContext("2d");

	// 選択中を指すカーソル(3×5の三角)
	var CURSOR = ["#..", "##.", "###", "##.", "#.."];

	function drawSprite(ctx, rows, x, y) {
		ctx.fillStyle = GB[0];
		for (var r = 0; r < rows.length; r++) {
			for (var c = 0; c < rows[r].length; c++) {
				if (rows[r][c] === "#") ctx.fillRect(x + c, y + r, 1, 1);
			}
		}
	}

	// ---- 音(GB風の矩形波。初回タップでAudioContext解禁) ----
	var audioCtx = null;

	function beep(freq, dur) {
		try {
			if (!audioCtx) audioCtx = new (global.AudioContext || global.webkitAudioContext)();
			if (audioCtx.state === "suspended") audioCtx.resume();
			var osc = audioCtx.createOscillator();
			var gain = audioCtx.createGain();
			osc.type = "square";
			osc.frequency.value = freq;
			gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
			osc.connect(gain).connect(audioCtx.destination);
			osc.start();
			osc.stop(audioCtx.currentTime + dur);
		} catch (e) { /* 音が出せなくても操作は続行 */ }
	}

	// ---- ゲーム選択画面 ----
	// 位置は項目数と一番長い行から計算して中央にそろえる
	// (項目を増減しても勝手に釣り合うので、ここの数字を直す必要はない)
	function renderMenu() {
		lctx.fillStyle = GB[9];                 // 選択画面の地の色(藤色)
		lctx.fillRect(0, 0, LCD_W, LCD_H);

		var ROW_H = 10;           // 行の間隔
		var CUR_W = 5;            // カーソル分の幅(三角3+すき間2)
		var maxLen = 0, i;
		for (i = 0; i < GAMES.length; i++) maxLen = Math.max(maxLen, GAMES[i].label.length);

		var blockW = CUR_W + 2 + DotFont.textWidth(maxLen);
		var x = Math.floor((LCD_W - blockW) / 2);
		var listH = (GAMES.length - 1) * ROW_H + DotFont.GLYPH_H;
		var titleH = TITLE ? 10 : 0;
		var top = Math.floor((LCD_H - (listH + titleH)) / 2) + titleH;

		if (TITLE) {
			DotFont.drawText(lctx, TITLE, Math.floor((LCD_W - DotFont.textWidth(TITLE.length)) / 2), top - titleH, GB[0]);
		}
		for (i = 0; i < GAMES.length; i++) {
			var y = top + i * ROW_H;
			if (i === cursor) drawSprite(lctx, CURSOR, x, y + 1);
			DotFont.drawText(lctx, GAMES[i].label, x + CUR_W + 2, y, GB[0]);
			// ★スケーターを一人、題名の下に立たせる(選択画面に出るのは0コマ目)
			if (GAMES[i].skater !== undefined) drawSkaterFrame(GAMES[i].skater, y + 16);
		}
	}

	// ★選択画面のスケーター —— js/ollie-art.js の絵をそのまま、まん中に置く
	function drawSkaterFrame(index, top) {
		var A = global.DotOllieArt, f = A.FRAMES[index];
		var ox = Math.floor((LCD_W - f.rows[0].length) / 2);
		for (var r = 0; r < f.rows.length; r++) {
			var line = f.rows[r], c = 0;
			while (c < line.length) {
				var ch = line.charAt(c);
				if (ch === ".") { c++; continue; }
				var run = 1;
				while (c + run < line.length && line.charAt(c + run) === ch) run++;
				lctx.fillStyle = GB[global.DotPalette.indexOfChar(ch)];
				lctx.fillRect(ox + c, top + r, run, 1);
				c += run;
			}
		}
	}

	function moveCursor(step) {
		if (GAMES.length === 0) return;
		cursor = (cursor + step + GAMES.length) % GAMES.length;
		beep(770, 0.04);
		renderMenu();
	}

	// ---- ゲームパッド ----
	var padEl = document.getElementById("gamepad");

	// ============================================================
	// ■■■ ★★画面のどこを触っても跳ぶ / 上へなぞると別の技 ■■■
	// ============================================================
	//
	//   ■ 2026-08-09、島さんの指摘で直した
	//     > 「オーリーができなかった。プレイ画面を押さないといけないみたいだけど不便だな」
	//     いったん**液晶の中だけ**を触れる場所にしていたが、それだと狭くて押しづらい。
	//     ★「ボタンを液晶の外に出す」のは**見た目の話**で、**触れる場所の話ではなかった**。
	//     → **画面ぜんぶ**(液晶の外の余白も)を触れる場所に戻した。
	//       ただし [音][一時停止][もどる] の**ボタンの上だけは除く**(そのボタンの役目が優先)
	//
	//   ■ ★操作は3つ
	//     **タップ**        → オーリー
	//     **上へなぞる**    → キックフリップ
	//     **下へなぞる**    → ポップショウビット
	//
	//   ■ ★なぜ「押した瞬間にオーリー、なぞったら差し替え」なのか
	//     指を離すまで待ってから決めると、**タップの反応がそのぶん遅れる**(遅さは罪)。
	//     だから**押した瞬間にオーリーを出し**、そこから上へなぞられたら
	//     **キックフリップに差し替える**。どちらの技も出だしは「しゃがむ」なので、
	//     差し替わっても見た目が飛ばない
	// ============================================================
	var shellEl = document.getElementById("shell");
	var SWIPE_PX = 24;          // 上へこれだけ動いたら「なぞった」とみなす(画面の実寸)
	var swipeFromY = null;      // なぞりはじめの縦位置(null = なぞっていない)
	var swipeFired = false;     // このなぞりで、もう技を差し替えたか

	function onButton(el) {     // ボタンの上で始まった操作か
		while (el && el !== shellEl) {
			if (el.tagName === "BUTTON") return true;
			el = el.parentNode;
		}
		return false;
	}

	shellEl.addEventListener("pointerdown", function (ev) {
		if (onButton(ev.target)) return;      // [音][一時停止][もどる] は自分の役目を果たす
		ev.preventDefault();
		swipeFromY = ev.clientY;
		swipeFired = false;
		padDown("act");                       // ★押した瞬間に出す(反応を遅らせない)
	});

	shellEl.addEventListener("pointermove", function (ev) {
		if (swipeFromY === null || swipeFired) return;
		var dy = swipeFromY - ev.clientY;          // ＋が上へ、−が下へ
		if (Math.abs(dy) < SWIPE_PX) return;
		swipeFired = true;
		if (mode !== "game" || !activeGame) return;
		if (dy > 0) {
			if (activeGame.inputSwipeUp) activeGame.inputSwipeUp();
		} else {
			if (activeGame.inputSwipeDown) activeGame.inputSwipeDown();
		}
	});

	function endSwipe() { swipeFromY = null; }
	shellEl.addEventListener("pointerup", endSwipe);
	shellEl.addEventListener("pointercancel", endSwipe);
	shellEl.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
	// RUN が出すボタン(特大の「跳ぶ」/ 右上の「音」「一時停止」「もどる」)
	//   ★`sound` の絵は入り切りで変わるので、ゲーム側(DotOllie.padIcons)が上書きする
	var PAD_ICONS = {
		act: "BTN_ACT", sound: "BTN_SOUND_ON", pause: "BTN_PAUSE", exit: "BTN_EXIT"
	};

	function renderPadLabels() {
		var canvases = padEl.querySelectorAll("canvas.pad-label");
		for (var i = 0; i < canvases.length; i++) {
			var c = canvases[i];
			var icon = c.getAttribute("data-icon");
			// ゲームがアイコン差し替え(padIcons)を持っていれば優先
			var name = (activeGame && activeGame.padIcons && activeGame.padIcons[icon]) || PAD_ICONS[icon];
			// ★「もどる」は扉の絵(BTN_EXIT)。走りの絵を流用すると「走り出す」ボタンに見える
			var g = DotSprites[name];
			// ★★キャンバスの大きさは「絵が入る大きさ」まで自動で広がる(2026-08-06)。
			//   前は 7×9 に固定していたので、**5×7 より大きい絵を描くと黙って切れていた**
			//   (島さんの「特大ボタンが反映されない」の原因の1つ)。
			//
			//   ★7×9 を**下限**にしてあるのが大事。いまの絵(5幅×6高)ならこれまでと
			//     まったく同じ 7×9 になるので、**見た目は1ドットも変わらない**。
			//     大きく描いたときだけ広がって、切れずに全部出る
			c.width = Math.max(7, (g && g[0] ? g[0].length : 5) + 2);
			c.height = Math.max(9, (g ? g.length : 6) + 2);
			var ctx2 = c.getContext("2d");
			ctx2.clearRect(0, 0, c.width, c.height);
			if (g) drawSprite(ctx2, g, 1, 1);
		}
	}

	// actions に挙げたボタンだけを出す。withExit=true なら「もどる」も出す
	function showPad(actions, withExit) {
		var btns = padEl.querySelectorAll("button.pad");
		for (var i = 0; i < btns.length; i++) {
			var a = btns[i].getAttribute("data-action");
			var on = (a === "exit") ? !!withExit : actions.indexOf(a) !== -1;
			btns[i].style.display = on ? "" : "none";
		}
		renderPadLabels();
	}

	function showMenuPad() {
		// 選択画面: ◀▶で選ぶ / Aで決定(もどる先は無いので「もどる」は出さない)
		showPad(GAMES.length > 1 ? ["left", "right", "act"] : ["act"], false);
	}

	// ---- ゲームの起動・終了 ----
	function startGame(entry) {
		var g = entry.game();
		mode = "game";
		activeGame = g;
		// 先に start() で状態を初期化してからパッドを出す
		// (でないと前回の状態が残り、条件つきのボタンが最初から出てしまう)
		g.start(lctx, LCD_W, LCD_H, {
			beep: beep,
			level: entry.level,
			// ゲーム側でボタンが増えたとき(例: 何かを習得)に呼んでもらう
			refreshPad: function () { showPad(activeGame.pad || ["act"], true); }
		});
		showPad(g.pad || ["act"], true);
	}

	function backToMenu() {
		if (activeGame && activeGame.stop) activeGame.stop();
		activeGame = null;
		mode = "menu";
		beep(660, 0.06);
		showMenuPad();
		renderMenu();
	}

	function padDown(action) {
		if (mode === "menu") {
			if (action === "left") moveCursor(-1);
			else if (action === "right") moveCursor(1);
			else if (action === "act" && GAMES.length > 0) { beep(990, 0.06); startGame(GAMES[cursor]); }
			return;
		}
		if (!activeGame) return;
		if (activeGame.inputDown) activeGame.inputDown(action);
		else if (activeGame.input) activeGame.input();
	}

	function padUp(action) {
		if (mode !== "game" || !activeGame) return;
		if (activeGame.inputUp) activeGame.inputUp(action);
	}

	// ---- ボタンの配線 ----
	var pads = padEl.querySelectorAll("button.pad");
	for (var j = 0; j < pads.length; j++) {
		(function (btn) {
			var action = btn.getAttribute("data-action");
			btn.addEventListener("pointerdown", function (ev) {
				ev.preventDefault();
				// 指がボタンから少しずれても「離した」と誤判定しないよう捕捉する
				// (押し続けている間に指が動いても外れない=多点タッチが安定)
				try { btn.setPointerCapture(ev.pointerId); } catch (e) {}
				if (action === "exit") backToMenu();
				else padDown(action);
			});
			var release = function (ev) {
				if (ev) ev.preventDefault();
				if (action !== "exit") padUp(action);
			};
			// pointerleave は使わない(捕捉中は指のずれで離れたことにしない)
			btn.addEventListener("pointerup", release);
			btn.addEventListener("pointercancel", release);
			btn.addEventListener("click", function (ev) { ev.preventDefault(); });
		})(pads[j]);
	}

	// ---- キーボード(PC向け) ----
	function keyToAction(k) {
		if (k === "ArrowLeft") return "left";
		if (k === "ArrowRight") return "right";
		if (k === "ArrowDown") return "guard";
		if (k === "ArrowUp") return "jump";
		if (k === "p" || k === "P") return "pause";
		if (k === "s" || k === "S") return "status";
		// スペース・Enter・その他は主アクション
		var main = (activeGame && activeGame.pad && activeGame.pad.indexOf("attack") !== -1) ? "attack" : "act";
		return main;
	}

	document.addEventListener("keydown", function (ev) {
		if (mode === "menu") {
			if (ev.key === "ArrowUp" || ev.key === "ArrowLeft") moveCursor(-1);
			else if (ev.key === "ArrowDown" || ev.key === "ArrowRight") moveCursor(1);
			else if (GAMES.length > 0) { beep(990, 0.06); startGame(GAMES[cursor]); }
			ev.preventDefault();
			return;
		}
		if (ev.key === "Escape") { backToMenu(); ev.preventDefault(); return; }
		if (!ev.repeat) padDown(keyToAction(ev.key));
		ev.preventDefault();
	});

	document.addEventListener("keyup", function (ev) {
		if (mode !== "game") return;
		padUp(keyToAction(ev.key));
	});

	// 指2本でのピンチ拡大を止める(iOS Safari は user-scalable=no を無視するため JS でも抑止)。
	// ボタンはポインタイベントで動くので、ゲームの多点タッチには影響しない。
	["gesturestart", "gesturechange", "gestureend"].forEach(function (t) {
		document.addEventListener(t, function (ev) { ev.preventDefault(); }, { passive: false });
	});
	document.addEventListener("touchmove", function (ev) {
		if (ev.touches && ev.touches.length > 1) ev.preventDefault();
	}, { passive: false });

	showMenuPad();
	renderMenu();

	// テスト・デバッグ用の窓口
	global.SHELL = {
		getMode: function () { return mode; },
		getCursor: function () { return cursor; },
		getGames: function () { return GAMES.map(function (g) { return g.label; }); },
		padDown: padDown,
		padUp: padUp,
		backToMenu: backToMenu
	};
})(typeof window !== "undefined" ? window : globalThis);
