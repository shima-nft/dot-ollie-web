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
	// ★★タイトル画面の右下に出す版数（2026-09-20 島さんの指定）
	//   ★★★**`sw.js` の `CACHE` の番号と必ずそろえる**（★dot-ollie-v167 なら "V167"）。
	//     ★`tools/build-web.py` が、さわしていないと NG を出します
	var VERSION = "V171";
	// ============================================================
	// ★★★★テストモードを出すか（2026-08-22 島さんの指定）
	// ============================================================
	//
	//   > 島さん「公開版はテストモードを外した状態でお願いします。」
	//
	//   ★★★**ここは 1 のままにしておくこと**（★島さんが手元で使うため）。
	//     ★公開版を作るとき、`tools/build-web.py` が**コピーしたほうだけ 0 に**します。
	//     ★★もとのファイル（このファイル）は**書き換えません**。
	//   ★★仕組みが1行なので、「公開版にだけ出ないもの」を足すときも同じ形が使えます
	var TEST_MENU_ON = 0;

	var GAMES = [
		// ★★★★★2026-09-13、島さんの指定で3つに分けた:
		//   > 島さん「タイトル画面で「はじめから」と「つづきから」と「オプション」を選べるように」
		//   ★フォントにひらがなが無いので英語で出す。★`sub` = 選んだら開く画面（→ `openSub()`）
		{ label: "NEW GAME", skater: 0, sub: "newgame", game: function () { return DotOllie; } },
		{ label: "CONTINUE", skater: 0, sub: "continue", game: function () { return DotOllie; } },
		{ label: "OPTIONS", skater: 0, sub: "options" },
		// ============================================================
		// ★★★テストモード（2026-08-22 島さんの指定）
		// ============================================================
		//
		//   > 島さん「テストでエンディングをみたいのだけど、9950ｍまでとばせないかな。
		//   >   例えばタイトル画面でテストモードを選べるようにしてさ」
		//
		//   ★★**4950m から走り出す**（★5000m のゴールまで約7秒）。
		//     ★★★2026-08-23、島さんの指定でゴールが 10000m → **5000m** へ動いたので、
		//       ★ここも動かしました（★★**ゴールの50m手前**、という関係は同じ）。
		//   ★★★**BEST は更新しない**ので、記録が汚れない（→ `js/ollie.js` の `testMode`）。
		//   ★★消したくなったら、**この1行を消すだけ**（★他はどこも触らなくてよい）
		//   ★★★★2026-09-03、島さんの指定で**お金を持たせて**始めるようにした:
		//
		//     > 島さん「「TEST 4950m」モードはテストなので
		//     >   最初から１T分のコインを持たせた状態にして」
		//
		//   ★★テストモードは**さらな状態から**始まります（2026-08-23 島さんの指定）。
		//     ★そのままだと**お店で何ひとつ買えない**ので、確かめようがありませんでした。
		//   ★★★`startCoin` に書いた額を、**リセットのあとに**渡します。
		//     ★左上には「1.0T」と出ます（★`shortNum` の単位: K → M → B → **T**）。
		//   ★★数字を変えたいときは、ここだけ書き換えれば効きます
		{ label: "TEST 4950m", skater: 0, test: 1, startM: 4950, startCoin: 1e12,
			game: function () { return DotOllie; } },
		// ============================================================
		// ★★★★★天気を見るテストモード（2026-09-06 島さんの指定）
		// ============================================================
		//
		//   > 島さん「雨をすぐ見たいから、タイトルに TEST 4950m と並べて
		//   >   TEST あめ(プラスα便利機能)をたしてください。」
		//
		//   ★★**雨が降っているところから走り出します**（★探して置くだけ）。
		//     ★少し手前に置くので、★★**強くなって、やがて止む**まで見られます。
		//
		//   ■ ★★★プラスαの「便利」（★天気をぜんぶ見るため）
		//
		//     ① ★**すぐ雨**（`startRain`）……… 走り出しから降っている
		//     ② ★★**夜がすぐ来る**（`startDayMs`）… ★15秒で暮れはじめる
		//        （★ふつうは60秒。★★雨の夜＝星が消えるところまで見られる）
		//     ③ ★**お金 1T**（`startCoin`）…… ★★お店もそのまま試せる
		//     ④ ★★**BEST を汚さない**（`test`）… ★記録は1ドットも動かない
		//
		//   ■ ★★★★なぜ「あめ」ではなく「RAIN」か
		//     ★この作品の文字は **5×7ドットのフォント**で、
		//       ★★**ひらがな・漢字が1文字も入っていません**（★入れても潰れて読めない）。
		//     ★★★この作品はずっと同じやり方をしています
		//       （★JUMP / CAMP? / WANT TO GO TO SLEEP? …）。
		//     ★ひらがなが要るなら、`js/font.js` に字を足せば出せます（★島さんの持ち場）
		{ label: "TEST RAIN", skater: 0, test: 1,
			startRain: 0.85, startDayMs: 45000, startCoin: 1e12,
			game: function () { return DotOllie; } },
		// ============================================================
		// ★★★★★釣りを見るテストモード（2026-09-15 島さんの指定）
		// ============================================================
		//
		//   > 島さん「テストモードで釣りを追加したい。」
		//
		//   ★★**いきなりキャンプの池（釣りの画面）から始まります**
		//     （★ふつうは夜まで走ってキャンプに入らないと、釣りに行けません）。
		//   ★時計は**完全な夜**（125秒）にしてあります（★キャンプは夜の中にあるため）。
		//   ★★池を出ればキャンプの中 → 眠れば朝、と**ふつうの流れ**に戻ります。
		//   ★★★釣果の記録は**覚えません**（★テスト中は localStorage に書かない決まり）
		{ label: "TEST FISH", skater: 0, test: 1,
			startFish: 1, startDayMs: 125000, startCoin: 1e12,
			game: function () { return DotOllie; } }
	];

	// ★★★公開版（`TEST_MENU_ON = 0`）では、テストモードの項目を外す。
	//   ★★★★2026-09-06、**`test: 1` の印**で見分けるようにした。
	//     ★前は「`startM` を持つ項目」で見分けていましたが、
	//     ★★**距離を飛ばさないテスト項目**（★TEST RAIN）を足したので、
	//     ★★★そのままだと**公開版に漏れます**。
	//   ★名前（label）で見分けないのは、島さんが名前を変えたときに黙って残るため
	if (!TEST_MENU_ON) {
		GAMES = GAMES.filter(function (g) { return !g.test; });
	}

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

	// ★★2026-08-12、島さんの指定で画面を1つ増やした:
	//   「START(画面タップ) → Seed ID〜(画面タップ) → プレイ画面 → READY/GO」
	//   seed = ★これから入る世界の番号を見せる画面
	var mode = "menu";            // menu(選択画面) / seed(世界の番号) / game(プレイ中)
	var cursor = 0;               // 選択中の項目
	var activeGame = null;
	var pendingSeed = null;       // ★SEED ID 画面で見せた番号。そのままゲームへ渡す

	var lcd = document.getElementById("lcd");
	lcd.width = LCD_W;
	lcd.height = LCD_H;
	var lctx = lcd.getContext("2d");

	// 選択中を指すカーソル(3×5の三角)
	var CURSOR = ["#..", "##.", "###", "##.", "#.."];

	function drawSprite(ctx, rows, x, y) {
		ctx.fillStyle = GB[9];   // ★9 = まっ黒（2026-08-13、25色化で 0→9 に付け替え）
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

	// ============================================================
	// ■ ★★2行の文字を、液晶のまん中に置く（選択画面と SEED ID 画面が共用）
	// ============================================================
	//   ★★2026-08-12、島さんの指定で作った:
	//     > 「START(画面タップ) Seed画面同様中央にして」
	//
	//     前は選択画面だけ「カーソル＋文字のかたまり」を中央に置いていたので、
	//     **文字だけ見ると4ドット右にずれていた**。
	//     さらに2つの画面で**1行目が18ドット違い**、タップした瞬間に文字が飛んでいた。
	//
	//   ★**両方ここを通すので、行がぴったり重なる**（1行目71 / 2行目81）。
	//     別々に計算していると、片方だけ直してまたずれる
	var ROW_H = DotFont.GLYPH_H + 4;               // 2行の間隔
	var CUR_W = 5;                // カーソル分の幅(三角3+すき間2)

	// 2行ぶんの1行目が来る行（★液晶のまん中）
	function twoLineTop() {
		return Math.floor((LCD_H - (ROW_H + DotFont.GLYPH_H)) / 2);
	}

	function drawCenterLine(text, y) {
		DotFont.drawText(lctx, text,
			Math.floor((LCD_W - DotFont.textWidth(text.length)) / 2), y, GB[16]);  // Shared light pixel lettering
	}

	// ---- ゲーム選択画面 ----
	var menuPress = null;
	function menuButtons() {
		return GAMES.slice(0,3).map(function(g,i){return {id:i,text:g.label,x:24,y:44+i*36,w:192,h:33};});
	}
	function menuHit(p) {
		if(!p)return null;
		return menuButtons().find(function(b){return p.x>=b.x&&p.x<b.x+b.w&&p.y>=b.y&&p.y<b.y+b.h;})||null;
	}
	function menuPaper() {
		lctx.fillStyle="#101f20";lctx.fillRect(0,0,LCD_W,LCD_H);
		lctx.fillStyle="#5f7473";lctx.fillRect(4,4,LCD_W-8,1);lctx.fillRect(4,LCD_H-5,LCD_W-8,1);
		lctx.fillRect(4,4,1,LCD_H-8);lctx.fillRect(LCD_W-5,4,1,LCD_H-8);
	}
	function pixelButton(b,on) {
		lctx.fillStyle="#080d14";lctx.fillRect(b.x,b.y,b.w,b.h);
		lctx.fillStyle=on?"#264039":"#1d2b53";lctx.fillRect(b.x+1,b.y+1,b.w-2,b.h-3);
		lctx.fillStyle=b.off?GB[7]:on?GB[19]:"#b4c7cb";lctx.fillRect(b.x+1,b.y+1,b.w-2,1);
		if(on){lctx.fillStyle=GB[19];lctx.fillRect(b.x+2,b.y+3,2,b.h-7);}
		DotFont.drawText(lctx,b.text,b.x+Math.floor((b.w-DotFont.textWidth(b.text.length))/2),b.y+Math.floor((b.h-DotFont.GLYPH_H)/2),GB[b.off?7:16]);
	}
	function renderMenu() {
		if(cursor>2)cursor=0;
		menuPaper();
		if(TITLE){
			lctx.save();lctx.translate(25,18);lctx.scale(2,2);DotFont.drawText(lctx,TITLE,0,0,GB[16]);lctx.restore();
		}
		var F=DotFont,best="BEST "+(global.DotOllie.bestOf?global.DotOllie.bestOf(curSlot()):global.DotOllie.getBest())+"m";
		// ★版数（★右下に小さく・薄く。★遊びの邪魔にならない位置）
		F.drawText(lctx,VERSION,LCD_W-10-F.textWidth(VERSION.length),7,GB[7]);
		// A small trail marker separates the lifetime record from the selected journey.
		lctx.fillStyle=GB[19];lctx.fillRect(212,17,1,16);lctx.fillRect(213,17,8,4);
		F.drawText(lctx,best,132,31,GB[7]);
		menuButtons().forEach(function(b){pixelButton(b,b.id===cursor);});
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

	// ============================================================
	// ■ ★★SEED ID 画面（2026-08-12 島さんの指定）
	// ============================================================
	//   「これからどの世界に入るのか」を見せるだけの画面。
	//
	//   ★★種を引くのは**ここ（シェル側）**。
	//     ゲーム側で引き直すと、**見せた番号と実際に入った世界がずれる**余地が残る。
	//     引いた番号は `pendingSeed` に持って、そのまま `start()` へ渡す。
	//
	//   ★プレイ中はこの番号を出さない（遊びの邪魔をしない）。
	function renderSeed() {
		menuPaper();

		// ★★選択画面とまったく同じ位置に2行を置く（1行目71 / 2行目81）。
		//   だから **タップしても文字が飛ばない**（OLLIE→SEED ID / START→番号 と入れ替わるだけ）
		var top = twoLineTop();
		drawCenterLine("SEED ID", top);         // ★フォントに ! と # は無い。この字は全部ある
		drawCenterLine(String(pendingSeed), top + ROW_H);

		// ★スケーターは出さない（島さんの指定 2026-08-12）。番号だけを見せる画面にする
	}

	// ★★★★★2026-09-13: `seed` を渡したら、その番号の世界へ（★島さん「同じシード値で同じ世界へ」）
	function enterSeed(seed, fresh) {
		pendingFresh = !!fresh;
		pendingSeed = (typeof seed === "number")
			? global.DotWorld.setSeed(seed)          // ★入力した番号
			: global.DotWorld.newSeed();             // ★ここで世界が決まる
		mode = "seed";
		beep(770, 0.05);
		// ★[もどる]は出さない（島さんの指定）。タップすればプレイ画面へ進むので行き止まりにならない
		showPad(["act"], false);
		renderSeed();
	}

	function moveCursor(step) {
		if (GAMES.length === 0) return;
		cursor = (cursor + step + 3) % 3;
		beep(770, 0.04);
		renderMenu();
	}

	// ============================================================
	// ■ ★★★★★NEW GAME / CONTINUE / OPTIONS の画面（2026-09-13 島さんの指定）
	// ============================================================
	//
	//   > 島さん「はじめからを選択でスタートかシード値入力を選べる。(同じシード値で同じ世界へ)
	//   >   つづきからは一つのセーブスロットを表示し選べる。セーブ削除も選べる。」
	//
	//   ★★ボタンはタップで決める（★押したボタンの上で離したときだけ ＝ ずらせば取り消せる）。
	//   ★★★描くところ（renderSub）と当たり判定（subHit）は `subButtons()` の1か所を共有する
	//     （★`campBtnRects()` と同じ作法。離すと「絵と判定がずれる」事故が起きる）
	// ★★★★★2026-09-13: セーブスロットは2つ（島さんの指定）。
	//   newslot = NEW GAME でスロットを選ぶ ／ continue = スロット一覧 ／ slot = そのスロットの LOAD・DELETE
	var SUB_MODES = { tests: 1, newgame: 1, newslot: 1, newask: 1, seedpad: 1, "continue": 1, slot: 1, del: 1, options: 1 };
	var SUB_HEAD = { tests: "TEST RUNS", newgame: "NEW GAME", newslot: "NEW GAME", newask: "ERASE OLD DATA?", seedpad: "INPUT SEED",
		"continue": "CONTINUE", del: "DELETE?", options: "OPTIONS" };
	// ★★★★★NEW GAME から来たか（★true なら技も成長も引き継がずに始める）
	var pendingFresh = false;
	var subSel = 0;            // 選んでいるボタン（なぞる・矢印キーで動く）
	var subPress = null;       // 押しているボタンの id（離すまで決めない）
	var seedDigits = "";       // 入力中のシード値
	var SEED_DIGITS = 5;       // ★シードは 0〜99999（→ js/world.js の newSeed）
	var BTN_H = 26;
	var OPTIONS_KEY = "dotollie-options";

	// ---- オプション（★音は昔からの dotollie-sound をそのまま使う）----
	function loadOptions() {
		var o = { shake: 1, flash: 1 };
		try {
			var raw = JSON.parse(localStorage.getItem(OPTIONS_KEY) || "{}");
			if (raw.shake === 0) o.shake = 0;
			if (raw.flash === 0) o.flash = 0;
		} catch (e) { /* 読めなくても既定値で遊べる */ }
		return o;
	}
	function saveOptions(o) {
		try { localStorage.setItem(OPTIONS_KEY, JSON.stringify(o)); } catch (e) { /* 保存できなくても遊べる */ }
	}
	function soundIsOn() {
		try { return localStorage.getItem("dotollie-sound") !== "off"; } catch (e) { return true; }
	}
	function setSound(on) {
		try { localStorage.setItem("dotollie-sound", on ? "on" : "off"); } catch (e) { /* 保存できなくても遊べる */ }
	}
	// ★★ゲーム側（js/ollie.js）が「ゆれ」「フラッシュ」を見るための窓口
	global.DotOptions = { get: function (key) { return loadOptions()[key]; } };

	// ---- セーブスロット（★中身を作るのは js/ollie.js。★まだ無ければ NO DATA）----
	//   ★`n` を渡すと、切り替えずにそのスロットを覗く（★渡さなければ、いまのスロット）
	function peekSave(n) {
		var G = global.DotOllie;
		return (G && G.peekSave) ? G.peekSave(n) : null;
	}
	// ★置き換える旅があるか（★セーブ、または覚えた技・転生・走った記録）
	function hasJourney(n) {
		var G = global.DotOllie;
		return !!(G && G.hasJourney && G.hasJourney(n));
	}
	function curSlot() { return global.DotProgression ? global.DotProgression.slot() : 1; }
	function pickSlot(n) { if (global.DotProgression) global.DotProgression.setSlot(n); }
	// ★スロットのボタンの文字（★途中セーブ ＞ 旅の記録 ＞ 空）
	function slotLabel(n) {
		var s = peekSave(n);
		if (s) return "SLOT " + n + " SAVE " + Math.floor(s.m || 0) + "m";
		if (hasJourney(n)) {
			var p = (global.DotProgression && global.DotProgression.peek(n)) || {};
			return "SLOT " + n + " LAST " + (p.lastDistance || 0) + "m";
		}
		return "SLOT " + n + " EMPTY";
	}

	// 縦に並べるボタン（★いちばん長い文字にそろえて、まん中に置く）
	function listButtons(items, top, minChars) {
		var w = DotFont.textWidth(minChars || 0), i;
		for (i = 0; i < items.length; i++) w = Math.max(w, DotFont.textWidth(items[i][1].length));
		w += 16;
		var x = Math.floor((LCD_W - w) / 2), out = [];
		for (i = 0; i < items.length; i++) {
			out.push({ id: items[i][0], text: items[i][1], off: !!items[i][2],
				x: x, y: top + i * (BTN_H + 4), w: w, h: BTN_H });
		}
		return out;
	}

	function subButtons() {
		if (mode === "newgame") {
			return listButtons([["random", "RANDOM SEED"], ["input", "INPUT SEED"], ["back", "BACK"]], 54);
		}
		if (mode === "seedpad") {
			// ★液晶に数字パッド（島さんの指定）。1 2 3 4 5 / 6 7 8 9 0 / DEL BACK OK
			var out = [], keys = "1234567890", cw = 28, ch = 18, gap = 4;
			var x0 = Math.floor((LCD_W - (cw * 5 + gap * 4)) / 2);
			for (var k = 0; k < 10; k++) {
				out.push({ id: "d" + keys.charAt(k), text: keys.charAt(k), off: seedDigits.length >= SEED_DIGITS,
					x: x0 + (k % 5) * (cw + gap), y: 44 + Math.floor(k / 5) * (ch + gap), w: cw, h: ch });
			}
			var bw = Math.floor((cw * 5 + gap * 2) / 3);
			[["del", "DEL", !seedDigits], ["back", "BACK"], ["ok", "OK", !seedDigits]].forEach(function (it, j) {
				out.push({ id: it[0], text: it[1], off: !!it[2],
					x: x0 + j * (bw + gap), y: 44 + 2 * (ch + gap) + 4, w: bw, h: ch });
			});
			return out;
		}
		if (mode === "newask") return listButtons([["yes", "YES"], ["no", "NO"]], 84);
		if (mode === "newslot" || mode === "continue") {
			// ★CONTINUE では、空のスロットは押せない
			var cont = mode === "continue";
			return listButtons([["s1", slotLabel(1), cont && !hasJourney(1)],
				["s2", slotLabel(2), cont && !hasJourney(2)], ["back", "BACK"]], 54);
		}
		if (mode === "slot") {
			// ★セーブがあれば LOAD（保存した旅の再開）／無ければ NEXT RUN（技と記録を持って次のラン）
			var s = peekSave(), j = hasJourney();
			return listButtons([["load", s ? "LOAD" : "NEXT RUN", !j], ["delete", "DELETE", !j],
				["back", "BACK"]], 70);
		}
		if (mode === "del") return listButtons([["yes", "YES"], ["no", "NO"]], 84);
		if(mode==="tests")return listButtons(GAMES.slice(3).map(function(g,i){return ["test"+(i+3),g.label];}).concat([["back","BACK"]]),32);
		if(mode==="options") {
			var o=loadOptions(),items=[["sound","SOUND "+(soundIsOn()?"ON":"OFF")],["shake","SHAKE "+(o.shake?"ON":"OFF")],["flash","FLASH "+(o.flash?"ON":"OFF")]];
			if(GAMES.length>3)items.push(["tests","TEST RUNS"]);
			items.push(["back","BACK"]);
			return items.map(function(it,i){return {id:it[0],text:it[1],x:16+(i%2)*106,y:46+Math.floor(i/2)*34,w:102,h:28};});
		}
		return [];
	}

	function renderSub() {
		menuPaper();
		drawCenterLine(mode === "slot" ? "SLOT " + curSlot() : SUB_HEAD[mode],
			(mode === "del" || mode === "newask") ? 64 : (mode === "seedpad" ? 10 : 24));
		if (mode === "seedpad") {
			var shown = seedDigits;
			while (shown.length < SEED_DIGITS) shown += "-";
			drawCenterLine(shown, 26);
		}
		if (mode === "slot") {
			var s = peekSave();
			if (!s && !hasJourney()) drawCenterLine("NO DATA", 46);
			else if (!s) {
				var jp = global.DotOllie.getJourney();
				drawCenterLine("LAST " + (jp.lastDistance || 0) + "m", 40);
				drawCenterLine("RANK " + (jp.rank || 0), 52);
			} else {
				drawCenterLine("SEED " + s.seed, 40);
				drawCenterLine(Math.floor(s.m || 0) + "m", 52);
			}
		}
		var bs=subButtons();if(subSel>=bs.length)subSel=0;
		bs.forEach(function(b,i){pixelButton(b,i===subSel||subPress===b.id);});
	}

	function subHit(p) {
		if (!p) return null;
		var bs = subButtons();
		for (var i = 0; i < bs.length; i++) {
			var b = bs[i];
			if (p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h) return { b: b, i: i };
		}
		return null;
	}

	function subMove(step) {
		var n = subButtons().length;
		if (!n) return;
		subSel = (subSel + step + n) % n;
		subPress = null;
		beep(770, 0.04);
		renderSub();
	}

	function openSub(name, sel) {
		mode = name;
		subSel = sel || 0;
		subPress = null;
		showMenuPad();
		renderSub();
	}

	function backToTitle() {
		mode = "menu";
		subPress = null;
		showMenuPad();
		renderMenu();
	}

	// ★タイトルで項目を決めた
	function chooseMenu() {
		var g = GAMES[cursor];
		if (!g) return;
		beep(990, 0.06);
		// ★NEW GAME も CONTINUE も、まずスロットを選ぶ（★いまのスロットを選んだ状態で開く）
		if (g.sub === "newgame") openSub("newslot", curSlot() - 1);
		else if (g.sub === "continue") openSub("continue", curSlot() - 1);
		else if (g.sub) openSub(g.sub);
		else enterSeed();                     // ★TEST の項目は、いままでどおり SEED ID 画面へ
	}

	function loadGame() {
		var s = peekSave();
		if (!s) return;
		pendingSeed = global.DotWorld.setSeed(s.seed);
		startGame(GAMES[cursor], { resume: true });
	}

	function subAct(id) {
		var bs = subButtons(), b = null;
		for (var i = 0; i < bs.length; i++) if (bs[i].id === id) b = bs[i];
		if (!b || b.off) return;
		beep(990, 0.06);
		if (mode === "newgame") {
			if (id === "random") enterSeed(undefined, true);
			else if (id === "input") { seedDigits = ""; openSub("seedpad"); }
			else openSub("newslot", curSlot() - 1);
		} else if (mode === "seedpad") {
			if (id.length === 2 && id.charAt(0) === "d") { seedDigits += id.charAt(1); renderSub(); }
			else if (id === "del") { seedDigits = seedDigits.slice(0, -1); renderSub(); }
			else if (id === "ok") enterSeed(Number(seedDigits), true);
			else openSub("newgame", 1);
		} else if (mode === "newslot") {
			if (id === "back") backToTitle();
			else {
				pickSlot(Number(id.slice(1)));
				if (hasJourney()) openSub("newask", 1);   // ★置き換える前に一段はさむ（はじめは NO）
				else openSub("newgame");
			}
		} else if (mode === "continue") {
			if (id === "back") backToTitle();
			else { pickSlot(Number(id.slice(1))); openSub("slot"); }
		} else if (mode === "slot") {
			if (id === "load") { if (peekSave()) loadGame(); else enterSeed(); }   // ★セーブが無ければ次のラン
			else if (id === "delete") openSub("del", 1);   // ★はじめは NO を選んでおく（押し間違いよけ）
			else openSub("continue", curSlot() - 1);
		} else if (mode === "del") {
			if (id === "yes" && global.DotOllie && global.DotOllie.clearJourney) global.DotOllie.clearJourney();
			if (id === "yes") openSub("continue", curSlot() - 1);
			else openSub("slot", 1);
		} else if (mode === "newask") {
			if (id === "yes") openSub("newgame");
			else openSub("newslot", curSlot() - 1);
		} else if(mode === "tests") {
			if(id==="back")openSub("options");else {cursor=Number(id.slice(4));enterSeed();}
		} else if (mode === "options") {
			if(id==="tests"){openSub("tests");return;}
			if (id === "back") { backToTitle(); return; }
			if (id === "sound") setSound(!soundIsOn());
			else { var o = loadOptions(); o[id] = o[id] ? 0 : 1; saveOptions(o); }
			renderSub();
		}
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
	// ============================================================
	// ★★★★タップを拾うのは「画面ぜんぶ」（2026-08-23 島さんの指定）
	// ============================================================
	//
	//   > 島さん「スマホを横画面にして遊ぶさい、液晶外タップでもジャンプ出来るように
	//   >   してください。」
	//
	//   ★★前は `#shell` だけで拾っていた。
	//     ★★★横画面では、液晶の**左右に黒い余白**ができる（★`#shell` の外）ので、
	//       ★そこを触っても**何も起きなかった**。
	//   → ★★**`document.body` で拾う**。★これで画面のどこを触っても跳べる。
	//   ★★ボタンの上だけは、いままでどおり除く（→ `onButton()`）
	var tapEl = document.body;
	var SWIPE_PX = 24;          // 上へこれだけ動いたら「なぞった」とみなす(画面の実寸)
	var swipeFromY = null;      // なぞりはじめの縦位置(null = なぞっていない)
	// ★★★★★2026-09-04、**横**も覚える（★島さんの指定「画面スライド。液晶外スライド。」）
	//   ★キャンプの中では、指をスライドした向きへプレイヤーが歩きます。
	//   ★★`tapEl` は `document.body` なので、**液晶の外をなぞっても効きます**
	var swipeFromX = null;

	// ============================================================
	// ★★★★★触ったところを「液晶のドット」に直す（2026-09-04 島さんの指定）
	// ============================================================
	//
	//   > 島さん「YES/NO選択はスライド選択ではなくボタンタップにします。」
	//
	//   ★液晶は画面の中で拡大して出しているので、
	//     ★★**指の位置（ページの座標）を、240×160 の中のどこかに直します**。
	//   ★★★液晶の外を触ったときは `null` を返します（★ボタンには当たらない）
	function lcdPoint(ev) {
		var r = lcd.getBoundingClientRect();
		if (!r.width || !r.height) return null;
		var x = (ev.clientX - r.left) * LCD_W / r.width;
		var y = (ev.clientY - r.top) * LCD_H / r.height;
		if (x < 0 || y < 0 || x >= LCD_W || y >= LCD_H) return null;
		return { x: x, y: y };
	}
	// ★★★★★横だけを「液晶のドット」に直す（2026-09-15 島さんの指定）
	//   ★液晶の外（下・左右の余白）を触っても、**今回の指の横位置**を返します（範囲に収めない）。
	//   ★★釣りで「液晶の外の左をタップ → 池の左へ」に使う。★前回の位置は使わない
	function lcdX(ev) {
		var r = lcd.getBoundingClientRect();
		if (!r.width) return null;
		return (ev.clientX - r.left) * LCD_W / r.width;
	}
	// ★縦も同じく「液晶のドット」に直す（★液晶の外でも、範囲に収めない）。★採掘の「液晶の外からスワイプ」に使う（2026-09-19）
	function lcdY(ev) {
		var r = lcd.getBoundingClientRect();
		if (!r.height) return null;
		return (ev.clientY - r.top) * LCD_H / r.height;
	}
	var swipeFromMode = null;  // 画面をまたいだタップを次の画面の決定に使わない
	var swipeFired = false;     // このなぞりで、もう技を差し替えたか

	function onButton(el) {     // ボタンの上で始まった操作か
		// ★★★`document.body` まで見る（2026-08-23）。
		//   ★`#shell` で止めていると、★★**シェルの外のボタン**を見逃す
		while (el && el !== document) {
			if (el.tagName === "BUTTON") return true;
			el = el.parentNode;
		}
		return false;
	}

	tapEl.addEventListener("pointerdown", function (ev) {
		if (ev.isPrimary === false) return;
		if (onButton(ev.target)) return;      // [音][一時停止][もどる] は自分の役目を果たす
		ev.preventDefault();
		swipeFromY = ev.clientY;
		swipeFromX = ev.clientX;
		swipeFired = false;
		swipeFromMode = mode;
		// ★★★★★液晶の中のボタン（YES / NO）を押したか（2026-09-04 島さんの指定）
		//   ★ゲームが true を返したら、**跳ぶ・技を出すには渡しません**
		if (activeGame && activeGame.inputTapAt) {
			var lp = lcdPoint(ev);
			if (activeGame.inputTapAt(lp ? lp.x : -1, lp ? lp.y : -1, true, false, lcdX(ev), lcdY(ev))) {
				try { tapEl.setPointerCapture(ev.pointerId); } catch (e) {}
				return;
			}
		}
		// ============================================================
		// ★★★タイトル画面だけは「離したときに決める」（2026-08-22 島さんの指定）
		// ============================================================
		//
		//   > 島さん「テストモードへいけないので(現在は左右ボタンがない)
		//   >   なぞるで操作できるようにしてください。」
		//
		//   ★★★押した瞬間に決めていると、**なぞる前に SEED 画面へ進んでしまう**ので、
		//     ★**なぞってカーソルを動かすことが構造的に不可能**だった。
		//   ★★これは買い物画面で 2026-08-16 に踏んだのと**まったく同じ罠**
		//     （→ `js/ollie.js` の `inputUp` の説明）。★同じ解き方でそろえてある
		if(mode==="menu"){var mh=menuHit(lcdPoint(ev));menuPress=mh?mh.id:null;if(mh)cursor=mh.id;renderMenu();return;}
		// ★★★★★NEW GAME などの画面: 押したボタンを覚えるだけ（★決めるのは離したとき）
		if (SUB_MODES[mode]) {
			var hit = subHit(lcdPoint(ev));
			subPress = (hit && !hit.b.off) ? hit.b.id : null;
			if (hit) subSel = hit.i;
			renderSub();
			return;
		}
		padDown("act");                       // ★押した瞬間に出す(反応を遅らせない)
	});

	tapEl.addEventListener("pointermove", function (ev) {
		if (ev.isPrimary === false) return;
		if (swipeFromY === null) return;
		if (mode !== swipeFromMode) return;
		if(mode==="menu"){
			var mh=menuHit(lcdPoint(ev));if(!mh||mh.id!==menuPress)menuPress=null;return;
		}
		if(SUB_MODES[mode]){
			var sh=subHit(lcdPoint(ev));if(!sh||sh.b.id!==subPress){subPress=null;renderSub();}return;
		}
		if (activeGame && activeGame.inputPointerMove) {
			var point = lcdPoint(ev);
			if (activeGame.inputPointerMove(point ? point.x : -1, point ? point.y : -1, lcdX(ev), lcdY(ev))) return;   // ★3・4番目 = 液晶の外でも使える位置
		}
		// ★★★★★キャンプの中では、指のスライドで歩く（2026-09-04 島さんの指定）
		//   ★ゲーム側が true を返したら、下の「技の差し替え」はしない
		//     （★キャンプの中では技を出さないので、取り合いにならない）
		if (activeGame && activeGame.inputDrag &&
			activeGame.inputDrag(ev.clientX - swipeFromX, swipeFromY - ev.clientY)) return;
		if (swipeFired) return;
		var dy = swipeFromY - ev.clientY;          // ＋が上へ、−が下へ
		if (Math.abs(dy) < SWIPE_PX) return;
		swipeFired = true;
		// 走行中の技は従来の上下スワイプ。メニューは上でタップ判定済み。
		if (mode !== "game" || !activeGame) return;
		if (dy > 0) {
			if (activeGame.inputSwipeUp) activeGame.inputSwipeUp();
		} else {
			if (activeGame.inputSwipeDown) activeGame.inputSwipeDown();
		}
	});

	// ★★2026-08-16、**指を離したこと**もゲームに伝えるようにした。
	//   遊んでいる最中は使わないが、**買い物の画面だけは「離したときに決める」**
	//   （★押した瞬間に決めると、なぞろうとした瞬間に決まってしまい、
	//     ★カーソルを動かすことが構造的に不可能だった —— 実機で見つかった）
	//   ★`swiped` = このなぞりで、もうカーソルを動かしたか
	tapEl.addEventListener("pointerup", function (ev) {
		if (ev.isPrimary === false) return;
		// ★★★★★液晶の中のボタン（YES / NO）を離した（2026-09-04）
		//   ★★**押したボタンの上で離したときだけ**決まります
		//     （★押しまちがえたら、指をずらせば取り消せる ＝ ふつうのボタンの作法）
		if (activeGame && activeGame.inputTapAt) {
			var lp2 = lcdPoint(ev);
			if (activeGame.inputTapAt(lp2 ? lp2.x : -1, lp2 ? lp2.y : -1, false)) {
				swipeFromY = null; swipeFromX = null;
				return;
			}
		}
		if (swipeFromY === null) return;
		var swiped = swipeFired;
		swipeFromY = null;
		// ★★★★★キャンプの中: 指を離したら歩くのをやめる（2026-09-04）
		if (activeGame && activeGame.inputDrag && activeGame.inputDrag(0, 0)) {
			swipeFromX = null;
			padUp("act", swiped);
			return;
		}
		swipeFromX = null;
		// ★★★タイトル画面は、ここで決める（★なぞっただけのときは決めない）
		if (mode === "menu") {
			var mh=menuHit(lcdPoint(ev)),pressed=menuPress;menuPress=null;
			if(!swiped&&swipeFromMode==="menu"&&mh&&mh.id===pressed){cursor=mh.id;chooseMenu();}
			return;
		}
		// ★★★★★NEW GAME などの画面: 押したボタンの上で離したときだけ決める
		if (SUB_MODES[mode]) {
			var pressed = subPress, up = subHit(lcdPoint(ev));
			subPress = null;
			if (!swiped && swipeFromMode === mode && pressed && up && up.b.id === pressed) subAct(pressed);
			else renderSub();
			return;
		}
		padUp("act", swiped);
	});
	tapEl.addEventListener("pointercancel", function (ev) {
		if (ev.isPrimary === false) return;
		swipeFromY = null; swipeFromX = null;menuPress=null;
		if (SUB_MODES[mode] && subPress) { subPress = null; renderSub(); }
		// ★★キャンプの中: 指が外れたら歩くのをやめる
		if (activeGame && activeGame.inputDrag) activeGame.inputDrag(0, 0);
		// ★★★ボタンを押したまま指が外れたら、押していないことにする（★決まらない）
		if (activeGame && activeGame.inputTapAt) activeGame.inputTapAt(-1, -1, false, true);
	});
	tapEl.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
	// RUN が出すボタン(特大の「跳ぶ」/ 右上の「音」「一時停止」「もどる」)
	//   ★`sound` の絵は入り切りで変わるので、ゲーム側(DotOllie.padIcons)が上書きする
	var PAD_ICONS = {
		act: "BTN_ACT", sound: "BTN_SOUND_ON", pause: "BTN_PAUSE", exit: "BTN_EXIT",
		// ★★ショップ（2026-08-16 島さんの指定）。★液晶の外の3つ目のボタン
		shop: "BTN_SHOP",
		// ★★★★★キャンプ（2026-09-04 島さんの指定）。★**夜のあいだだけ出る**
		//   ★出し入れはゲーム側が `refreshPad()` で頼みます（→ `js/ollie.js` の `syncCampPad`）
		camp: "BTN_CAMP"
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
		// 液晶内の各ボタンを直接タップする。外側の戻るボタンは不要。
		showPad(["act"], false);
	}

	// ---- ゲームの起動・終了 ----
	function startGame(entry, extra) {
		var g = entry.game();
		mode = "game";
		activeGame = g;
		// 先に start() で状態を初期化してからパッドを出す
		// (でないと前回の状態が残り、条件つきのボタンが最初から出てしまう)
		g.start(lctx, LCD_W, LCD_H, {
			beep: beep,
			level: entry.level,
			// ★★SEED ID 画面で見せた番号を、そのままゲームへ渡す
			//   （渡さないとゲーム側が引き直して、見せた番号と別の世界になる）
			seed: pendingSeed,
			// ★★★テストモード（2026-08-22 島さんの指定）。
			//   ★`startM` を持つ項目を選んだときだけ、そこから走り出す。
			//   ★★そのときは BEST を更新しない（★記録を汚さない）
			startM: entry.startM || 0,
			// ★★★★2026-09-06、テストモードの印は `test`（★`startM` ではない）
			testMode: !!entry.test,
			// ★★★★★天気を見るためのテストモード（2026-09-06 島さんの指定）
			//   ★`startRain` … この強さの雨が降っている場所から走り出す
			//   ★★`startDayMs` … 昼と夜の時計を、この時刻から始める
			startRain: entry.startRain || 0,
			startDayMs: (typeof entry.startDayMs === "number") ? entry.startDayMs : -1,
			// ★★★★テストモードで最初から持っているお金（2026-09-03 島さんの指定）
			//   ★ふつうの START には書いていないので **0**（＝いつもどおり空の財布）
			startCoin: entry.startCoin || 0,
			// ★★★★★釣りを見るテストモード（2026-09-15 島さんの指定）。★池の画面から始める
			startFish: !!entry.startFish,
			// ★★★★★CONTINUE（2026-09-13 島さんの指定）。★セーブの中身を戻すのは js/ollie.js
			resume: !!(extra && extra.resume),
			// ★★★★★NEW GAME から来たときだけ、旅の記録を消して始める（→ js/ollie.js の start）
			fresh: !entry.test && !(extra && extra.resume) && pendingFresh,
			// ゲーム側でボタンが増えたとき(例: 何かを習得)に呼んでもらう
			refreshPad: function () { showPad(activeGame.pad || ["act"], false); },
			// ★★★ゲームから「メニューへ戻して」と言うための窓口（2026-08-16 / Phase D）
			//   ★島さんの指定で **🚪 を一時停止メニューの中へ移した**ので、
			//     ゲーム側から戻す道が要る（★液晶の外に 🚪 はもう出さない）
			exitToMenu: function () { backToMenu(); }
		});
		// ★★★2026-08-16、**液晶の外に 🚪 を出さない**（島さんの指定）。
		//   ★理由: ⛺キャンプ（世界の中）と 🚪 終了（操作）を**記号として分ける**ため。
		//     ★遊びの中心記号が「扉」になったので、外の扉と混同する
		//   → 🚪 は**一時停止メニューの中**にある（→ `js/ollie.js` の `drawPauseScreen`）
		showPad(g.pad || ["act"], false);
	}

	function backToMenu() {
		// ★★★扉ボタンを押したことをゲームに知らせる（2026-08-16。★島さんの指定）
		//   ゲーム側が「ぜんぶ最初に戻す」などをやりたい場合の窓口。
		//   ★止める前に呼ぶ（ゲームがまだ生きているうちに片づけができるように）
		if (activeGame && activeGame.onExit) activeGame.onExit();
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
			// ★★決定 → いきなり遊ばず、まず SEED ID 画面へ（島さんの指定）
			else if (action === "act" && GAMES.length > 0) chooseMenu();
			return;
		}
		if (SUB_MODES[mode]) {
			if (action === "act") { var bs = subButtons(); if (bs[subSel]) subAct(bs[subSel].id); }
			return;
		}
		if (mode === "seed") {
			// ★どこを触ってもプレイ画面へ（見せた種を持ったまま）
			startGame(GAMES[cursor]);
			return;
		}
		if (!activeGame) return;
		if (activeGame.inputDown) activeGame.inputDown(action);
		else if (activeGame.input) activeGame.input();
	}

	function padUp(action, swiped) {
		if (mode !== "game" || !activeGame) return;
		if (activeGame.inputUp) activeGame.inputUp(action, swiped);
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
		// ★★★★★NEW GAME などの画面（2026-09-13）
		if (SUB_MODES[mode]) {
			var k = ev.key;
			if (mode === "seedpad" && /^[0-9]$/.test(k)) subAct("d" + k);
			else if (mode === "seedpad" && k === "Backspace") subAct("del");
			else if (k === "ArrowUp" || k === "ArrowLeft") subMove(-1);
			else if (k === "ArrowDown" || k === "ArrowRight") subMove(1);
			else if (k === "Escape") subAct((mode === "del" || mode === "newask") ? "no" : "back");
			else if (k === "Enter" || k === " ") { var kb = subButtons(); if (kb[subSel]) subAct(kb[subSel].id); }
			ev.preventDefault();
			return;
		}
		if (mode === "menu") {
			if (ev.key === "ArrowUp" || ev.key === "ArrowLeft") moveCursor(-1);
			else if (ev.key === "ArrowDown" || ev.key === "ArrowRight") moveCursor(1);
			else if (GAMES.length > 0) chooseMenu();
			ev.preventDefault();
			return;
		}
		if (ev.key === "Escape") {
			if (activeGame && activeGame.inputEscape && activeGame.inputEscape()) { ev.preventDefault(); return; }
			if(mode==="game" && activeGame && activeGame.togglePause){activeGame.togglePause();ev.preventDefault();return;}
			backToMenu(); ev.preventDefault(); return;
		}
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
		// ★SEED ID 画面で見せている番号（テスト・確認用）
		getPendingSeed: function () { return pendingSeed; },
		getGames: function () { return GAMES.map(function (g) { return g.label; }); },
		// ★★★★★NEW GAME などの画面（2026-09-13。テスト・確認用）
		choose: function (i) { if (typeof i === "number") cursor = i; chooseMenu(); },
		pick: function (id) { subAct(id); },
		getMenuButtons: menuButtons,
		getSubButtons: function () { return SUB_MODES[mode] ? subButtons() : []; },
		getSeedDigits: function () { return seedDigits; },
		padDown: padDown,
		padUp: padUp,
		backToMenu: backToMenu,
		getVersion: function () { return VERSION; }
	};
})(typeof window !== "undefined" ? window : globalThis);
