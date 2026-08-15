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
//       **プッシュ（走り出し）** … ★GO の瞬間 / たまにランダム / ★技を決めたあとにも たまに
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
	var SK  = global.DotSkyline;        // ★★最遠景の景観（js/skyline.js）
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
		PUSH:    "once"         // プッシュ（走り出し）。★GO の瞬間と、たまに
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
	// ★★2026-08-13、色が35色 → 25色になったので番号を付け替えた（→ js/palette.js）。
	//   ★色そのものは、空だけが変わっている（青 #065ab5 → 藍 #25489c）。
	//     ★★理由: **青はスケーターの服の色でもあった**ので、25色では空と主役が
	//       同じ色になってしまう。空を藍、服を水色に分けた（明るさの比 3.43 で見分けられる）
	var C_BG     = 0;   // ★空（一色）。0=藍
	var C_GROUND = 22;  // ★地面（本体）。22=藤色
	// ★★地表の際（2026-08-13 / N3）。14=暗い灰
	//   ★手前の丘陵（濃紺2.6%）と 地面（藤色20.2%）の**あいだの明るさ（9.8%）**。
	//     これを1枚はさむと明るさが階段状につながり、
	//     **「遠景の絵」と「地面の帯」が別々の絵に見える**のが解消される。
	//   ★太さは `js/world.js` の `EDGE_*`（★0 にすれば地面が一色に戻る）
	var C_GROUND_EDGE = 14;
	var C_RIDGE  = 10;  // ★遠景の稜線。10=濃紺（空より暗い＝遠くのシルエットに見える）
	var C_TEXT   = 16;  // 距離の数字。16=生成り

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

	// ============================================================
	// ■■■ ★★走行の経済（2026-08-15 / 成長型コア）■■■
	// ============================================================
	//
	//   ★★**距離 × 倍率 = 稼ぎ。** 腕前が要らないのは、**距離は走れば必ず増えるから**。
	//
	//   ■ ★★倍率の上げ方（★ここを間違えるとコーンを攻略する意味が消える）
	//
	//     > **通常走行 ＝ 基礎成長 ／ 技・障害物 ＝ 加速装置**
	//
	//     ★「走り続けるだけ」を強くしすぎると、**何もしない方が得**になる。
	//     だから走行ぶんは**ごく少し**、技とコーンは**はっきり**上げる
	//
	//   ★★数値はまだ「仮」。**A-4 の実測を見てから決める**（先に決めない）
	var STAMINA_MAX   = 20;    // ★1ランのスタミナ（秒）。★アップグレードで伸びる
	var HIT_STAMINA   = 3;     // ★ぶつかると余分に減る（秒）
	var HIT_SLOW_MS   = 700;   // ★ぶつかったあと、遅くなっている長さ（ミリ秒）
	var HIT_SLOW      = 0.45;  // ★そのあいだの速さ（トップの何割か）

	var MULT_BASE     = 1.0;   // ★倍率の出発点。★ぶつかるとここへ戻る
	var MULT_PER_SEC  = 0.05;  // ★走っているだけで上がるぶん（★ごく少し）
	// ★★★2026-08-15、**「技を出しただけ」のボーナスを 0 にした**（島さんの指定）。
	//   実測で「**ひたすら連打がいちばん強い**」になっていたため
	//   （何もしない 159 → ひたすら連打 479 コイン）。
	//   ★空打ちに意味が無くなり、**障害物を越える意味が正しく出る**。
	//   → `docs/decisions.md` 2026-08-15(7)
	var MULT_TRICK    = 0;     // ★技を出しただけでは上がらない
	var MULT_CONE     = 0.5;   // ★★障害物を越えたら（★ここだけが「加速装置」）
	var MULT_MAX      = 20;    // ★★上限（★暴走よけ）
	// ★★★2026-08-15、島さんの指定で **「0 に戻す」→「半分になる」** に変えた。
	//   ★障害物が約3.5秒に1個来るのに 0 に戻していたので、
	//     **倍率が 1.2 前後から伸びなかった**（インフレの土台が育たない）。
	//   ★半分なら**山なりに育つ**うえ、失敗の痛みも残る
	var MULT_HIT_KEEP = 0.5;   // ★ぶつかったときに残る割合

	// ============================================================
	// ■ ★★丘の障害物（岩）—— 2026-08-15、島さんの指定で新設
	// ============================================================
	//
	//   ★★これまで「丘には何も置かない」だったが、**方針転換で変わった**。
	//     成長型では**障害物は「稼ぎの機会」**なので、**いつも来る**のが正しい。
	//     ★実測で「1ランに約0.68パターンしか来ない」＝ 倍率が伸びる機会がほぼ無かった
	//
	//   ★★コーンは「まっすぐな道」に、岩は「丘」に。**場所で住み分ける**
	var ROCK_ON      = 1;    // 1=出す / 0=出さない
	var ROCK_GAP_MIN = 140;  // ★丘での間隔（ドット）。★ここから
	var ROCK_GAP_MAX = 320;  //   ★ここまでの間でランダム（★約2〜4.5秒に1個）

	// ============================================================
	// ■■■ ★★報酬フィードバック（2026-08-15 島さんの実機フィードバック）■■■
	// ============================================================
	//
	//   島さん「走る → 数値が増える → **でも画面上では何が起きたか分からない**」
	//
	//   ★★狙いは「ポップアップを足すこと」ではなく、
	//     **「越えると倍率が育つんだ。じゃあ次も越えたい」**を目に見えるようにすること。
	//
	//   ★★★**出す数字は、必ず「実際に変わった量」から作ること**（島さんの指定）。
	//     表示だけ別に直書きすると、あとで倍率を変えたときに
	//     **「実際は +1.0 なのに画面は +0.5」**という同期バグが必ず起きる
	var POP_ON       = 1;     // 0 にするとポップアップが出なくなる
	var POP_MS       = 850;   // ★1つが出ている長さ（ミリ秒）
	var POP_RISE     = 16;    // ★その間に上へ何ドット上がるか
	var POP_FADE_MS  = 260;   // ★最後、暗い色に落ちる長さ
	var POP_MAX      = 6;     // ★同時に出る数の上限（★溜まり続けないように）
	var POP_TOP_GAP  = 54;    // ★主役の足元から何ドット上に出すか（＝頭のすこし上）
	var C_POP_GAIN   = 16;    // 得の色。16=生成り
	var C_POP_GAIN_D = 7;     // ★得が消える直前の色。7=銀
	var C_POP_LOSS   = 17;    // 損の色。17=赤
	var C_POP_LOSS_D = 11;    // ★損が消える直前の色。11=暗い赤

	// ★★倍率の表示（左上2行目）。★上がった瞬間だけ「跳ねて色が変わる」
	var MULT_FLASH_MS = 260;  // 跳ねている長さ
	var C_MULT      = 16;     // ふだんの色。16=生成り
	var C_MULT_UP   = 19;     // ★上がった瞬間。19=黄色
	var C_MULT_DOWN = 17;     // ★下がった瞬間。17=赤

	// ★★ぶつかったときの揺れ（★2026-08-09 に一度削ったものを、島さんの指定で戻した）
	//   ★★**走行中は揺らさない**（ドット絵がにじんで読みにくくなるため）。ぶつかった瞬間だけ
	//   ★★★**揺れは描画だけ。** 距離・倍率・当たり判定には1ドットも触らない
	var SHAKE_MS = 220;       // 揺れている長さ
	var SHAKE_PX = 2;         // 揺れ幅（ドット）

	// ★★距離の節目（★進むほど間隔が広がる。★距離は報酬の主役ではない）
	//
	//   ★★★2026-08-15、島さんの指定で **いったん出さないことにした**:
	//     > 「**距離の現在値をキャラクターの上に表示させるのをやめにして。**」
	//   ★1 に戻せばまた出る（★仕組みも表もそのまま残してある）
	var MILESTONE_POP_ON = 0;    // ★0 = 出さない / 1 = 節目に「+100m」を出す
	var MILESTONES = [20, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000];
	var MILESTONE_STEP = 2000;   // ★表を使い切ったあとは、この間隔で

	// ============================================================
	// ■■■ ★★スタミナバー（2026-08-15 島さんの指定）■■■
	// ============================================================
	//
	//   島さん「**スタミナの見える化がないと、何故急に終了したのか分からない。**
	//           スタミナゲージは緑色のバー。減ると赤。バーが全部赤で終了。」
	//
	//   ★★**画面のいちばん上に、横いっぱい。** 文字を増やさずに残量が分かる。
	//   ★★**見た目は見た目だけ。** バーを描いてもスタミナ・距離・倍率は1ドットも変わらない
	var BAR_ON     = 1;    // 0 にするとバーが出なくなる
	var BAR_H      = 3;    // バーの高さ（ドット）
	var C_BAR_BACK = 5;    // ★減った側の色。5=炭（「どれだけ減ったか」が見える）
	// ★残量で色が変わる（★上から順に見て、最初に当てはまったものを使う）
	var BAR_STEPS = [
		{ at: 0.60, color: 20 },   // 60%〜   20=緑 #00e436
		{ at: 0.30, color: 19 },   // 30〜60% 19=黄 #ffec27
		{ at: 0.15, color: 18 },   // 15〜30% 18=橙 #ffa300
		{ at: 0.00, color: 17 }    // ★〜15%  17=赤 #ff004d（★もう終わる）
	];

	// ============================================================
	// ■■■ ★★コインのカウントアップ（2026-08-15 島さんの指定）■■■
	// ============================================================
	//
	//   島さん「**COIN 320 ← これがいきなり表示されて分からない。**
	//           `COIN 0 ×4.2` からチャリンチャリンの音と同時に数字が0から上昇する
	//           （タップで省略可）」
	//
	//   ★★★**カウントアップは「表示だけ」。貯金（`coins`）には触らない。**
	//     実コインの確定は `runOver()` の1か所だけ。
	//     ★これで **省略／二重加算／ラン再開／localStorage のずれ**が構造的に起きない
	var COUNT_MS      = 1200;  // ★0 から稼いだ額まで数えるのにかける時間
	var COUNT_BEEP_MS = 80;    // ★チャリンの間隔（ミリ秒）
	var COUNT_BEEP_HZ = 1760;  // ★チャリンの高さ

	// ============================================================
	// ■■■ ★★お店の見た目（2026-08-15 / Phase B）■■■
	// ============================================================
	//   ★★**ラン終了の画面と一体**。★カーソルの最初の場所は `START` なので、
	//     **タップ1回で即もう一回**（前に作った「即リトライ」を1ドットも損なわない）
	var SHOP_TOP    = 44;   // 一覧のいちばん上の行
	var SHOP_X      = 26;   // 文字の左端（★カーソルはその左に出る）
	var C_SHOP_BACK = 5;    // 一覧の後ろの帯。5=炭（★景色の上だと読めないため）
	var C_SHOP_SEL  = 19;   // 選んでいる行。19=黄
	var C_SHOP_ROW  = 15;   // ふつうの行。15=明るい灰
	var C_SHOP_OFF  = 14;   // ★買えない行。14=暗い灰

	// ■ ★プッシュ（走り出し）が、たまに勝手に出る間隔（秒）
	//   島さん「少し間が開くときなどにランダムで行うアクション」
	var PUSH_EVERY_MIN = 2.5;   // 次のプッシュまで。★ここから
	var PUSH_EVERY_MAX = 6.0;   //   ★ここまでの間でランダム

	// ■ ★★技を決めたあと、そのままプッシュに入る割合（0〜1）
	//   島さん「プッシュはトリックを決めたあとにもたまに行うように。そのほうが自然」
	//   1 = 毎回かならず / 0 = 一度も入らない / 0.4 = だいたい5回に2回
	var PUSH_AFTER_TRICK = 0.4;

	// ============================================================
	// ■ ★★スタートの段（2026-08-12 島さんの指定）
	// ============================================================
	//   島さん「START（画面タップ）→ Seed ID〜（画面タップ）→ プレイ画面 → READY/GO」
	//
	//   ★**READY のあいだは世界が止まっている。GO で走り出す。**
	//     止まっているものが動き出すので「**始まった**」がはっきり出る
	//     （出典: 浮遊感は落ちてこそ生まれる —— 相反するもので引き立てる）
	//
	//   ★★2026-08-12、島さんの指定で「プレイ画面 0.5秒 → READY/GO」になった。
	//     **文字が何も出ない0.5秒**を先に置く ＝「どんな世界に来たか」を見る間。
	//     この間があることで、続く READY が「さあ始まる」の合図として立つ
	//
	//   ★★2026-08-12、島さんの指定で「**READY はタップで飛ばせない**」ことにした。
	//     走り出す前（enter / READY）は、タップしても**何も起きない**。
	//     ★あとで「転ぶ→やり直し」を入れると、**やり直すたびにこの間を待つ**ことになる。
	//       そのときは `ENTER_MS` / `READY_MS` を短くするか 0 にして調整する
	var ENTER_MS = 500;   // ★世界を見せるだけの間（文字は出ない）。0 にすると飛ばす
	var READY_MS = 800;   // 「READY」を出しておく長さ。★0 にすると READY を飛ばす
	var GO_MS    = 500;   // 「GO」を出しておく長さ。★0 にすると GO を出さない

	// ============================================================
	// ■ ★★走り出しの加速（2026-08-12 島さんの指定）
	// ============================================================
	//   島さん「GOでいきなりトップスピードはおかしいので調整お願いします」
	//
	//   ★★加速にかける時間は **プッシュ（蹴り出し）の絵の長さ**をそのまま使う。
	//     ここに数字を直書きしないので、**島さんがプッシュのコマを詰めると
	//     加速も一緒に速くなる**（この作品の「絵が動きを決める」考え方どおり）。
	//     いまのプッシュは 12コマ・1109ms。
	//
	//   ★速さの上がり方は「両端がゆるやかな曲線」。
	//     蹴り出してから、じわっと乗って、トップスピードに落ち着く
	var ACCEL_ON    = 1;    // ★0 にすると昔どおり（GO の瞬間からトップスピード）
	var ACCEL_START = 0.2;  // ★走り出しの速さ（トップスピードの何割から始めるか）

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
	var CONE_W = CONE.FRAMES[0].rows[0].length;   // ★コーン1個の幅（9ドット）

	// ★★コインの絵（★島さんが描いたもの。5×7ドット）。2026-08-15
	//   もと: `assets/parts/coin.aseprite` → 「絵を反映する.bat」→ `js/parts-art.js`
	//   ★★**AIは置く場所を決めるだけ。絵は1ドットも触らない**
	//   ★無くても遊べる（そのときはアイコンが出ないだけ）
	var COIN_ICON = (global.DotPartsArt && global.DotPartsArt.coin)
		? global.DotPartsArt.coin.FRAMES[0] : null;

	// ★★丘の障害物（岩）。2026-08-15、島さんの指定で新設
	//   > 「丘に新しい障害物を新設してください。背景部品と差別化するため、コーン同様、縁取り黒で」
	//   ★★いまは**仮の絵**（→ `js/rock-art.js`）。島さんが描いたら差し替える
	var ROCK = global.DotRockArt;
	var ROCK_W = ROCK.FRAMES[0].rows[0].length;

	// ★障害物1つの絵と幅（★2か所に持たない）
	function obArt(o) { return (o.kind === "rock") ? ROCK : CONE; }
	function obWidth(o) { return (o.kind === "rock") ? ROCK_W : CONE_W; }

	// ============================================================
	// ■■■ ★★障害物のパターン（2026-08-15 / Phase 2）■■■
	// ============================================================
	//
	//   島さん「**この地形ならどの技を選ぶ？** を発生させる」
	//
	// ■ ★★幅を直書きしない（ここがいちばん大事）
	//
	//   コーンを**何個並べるか**は、技の「越えられる幅」から**毎回計算する**。
	//   ★直書きすると、島さんが `js/frames.js` のコマを速くした瞬間に
	//     幅だけ取り残されて、**理不尽な障害物**になる。
	//
	// ■ ★★「高さ」ではなく「幅」で作る理由
	//
	//   3技の**跳ぶ高さは 25 / 27 / 27 ドットでほぼ同じ**（島さんが描いた絵が決めている）。
	//   → 高さでは使い分けが作れない。**幅なら滞空時間の差がそのまま効く**。
	//
	// ■ ★★★2026-08-15、**アップグレードで越えられる範囲が広がる形**にした
	//
	//   島さん「**技術を要しない。** アップグレードで強くなる」
	//
	//   ★★**コーンの幅は「Lv0 のときの越えられる幅」を基準に決め打ちにする。**
	//     ★★**いまの（強化後の）幅から決めてはいけない。**
	//       それをすると障害物が自分に合わせて大きくなり、
	//       **いつまでも「前は越えられなかったものが越えられた」が起きない**。
	//
	//       狭い … Lv0 でも余裕で越えられる
	//       中   … Lv0 でぎりぎり越えられる
	//       ★広い … ★**Lv0 では越えられない。** アップグレードすると越えられるようになる
	//
	//   → ★**「俺が上手くなった」ではなく「このビルドなら突破できる」**になる
	// ============================================================
	var PATTERN_ON = 1;      // 0 にすると障害物が出なくなる

	// ★その技の「越えられる幅」（ドット）。★表と速さから毎回計算する
	//   ★★これは **Lv0（アップグレード無し）の値**。障害物の大きさを決めるのに使う
	function clearDotsOf(name) {
		for (var i = 0; i < POSES.length; i++) {
			if (POSES[i].name !== name) continue;
			return Math.round(FR.airMs(POSES[i].ms, POSES[i].lifts) / 1000 * SPEED);
		}
		return 0;
	}

	// ★★★いま実際に越えられる幅（★アップグレードが乗ったあと）。
	//   空中の時間 × 速さ。★JUMP は時間を、SPEED は速さを伸ばす ＝ **掛け算になる**
	function curClearDots(name) {
		for (var i = 0; i < POSES.length; i++) {
			if (POSES[i].name !== name) continue;
			return Math.round(
				FR.airMs(POSES[i].ms, POSES[i].lifts) * jumpDurationMul() / 1000 * curSpeed());
		}
		return 0;
	}
	// ★その技の「拘束距離」（技を出してから次が出せるまでに進む距離）
	function lockDotsOf(name) {
		for (var i = 0; i < POSES.length; i++) {
			if (POSES[i].name !== name) continue;
			return Math.round(FR.totalMs(POSES[i].ms) / 1000 * SPEED);
		}
		return 0;
	}
	// ★★★「Lv0 のときに越えられる幅」＝ 障害物の大きさを決める基準
	//   ★★アップグレードが乗る前の値なので、**世界の側は永久に変わらない**。
	//     だからこそ「前は越えられなかったコーンが越えられた」が起きる
	//
	//   ★★★**ここを `curSpeed()` に変えないこと**（2026-08-15 / Phase B）。
	//     変えると**障害物が自分に合わせて大きくなり**、
	//     「前は越えられなかったものが越えられた」が**永久に起きなくなる**。
	//
	//       SPEED を上げる → プレイヤーが速くなる
	//       → 同じ障害物を以前より短時間で通過する
	//       → ★★**障害物そのものは大きくならない**
	var BASE_CLEAR = clearDotsOf("OLLIE");

	// ★その幅に収まるコーンの個数（★1個ぶん余裕を残す）
	function conesForDots(dots) {
		return Math.max(1, Math.floor((dots - CONE_W) / CONE_W));
	}

	// ★★パターンの表。obs = [{ at: パターン先頭からの距離, n: コーンの個数 }]
	function buildPatterns() {
		var nNarrow = conesForDots(BASE_CLEAR * 0.55);   // ★Lv0 でも余裕
		var nMid    = conesForDots(BASE_CLEAR * 1.00);   // ★Lv0 でぎりぎり
		var nWide   = conesForDots(BASE_CLEAR * 1.80);   // ★★Lv0 では越えられない
		var gap = Math.round(BASE_CLEAR * 1.3);          // 連続のときの間
		return [
			{ name: "A 狭い", obs: [{ at: 0, n: nNarrow }] },
			{ name: "B 中",   obs: [{ at: 0, n: nMid }] },
			{ name: "C 連続", obs: [{ at: 0, n: nNarrow }, { at: gap, n: nNarrow }] },
			// ★★D は Lv0 では越えられない。**アップグレードで越えられるようになる壁**
			{ name: "D 広い", obs: [{ at: 0, n: nWide }] }
		];
	}
	var PATTERNS = buildPatterns();

	// そのパターンの全長（ドット）
	function patternLen(p) {
		var last = p.obs[p.obs.length - 1];
		return last.at + last.n * CONE_W;
	}

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
	// ■ ★★いちばん進んだ距離（BEST）—— 2026-08-15 / Phase 3
	//
	//   ★覚え方は**音の入り切りとまったく同じ**（`localStorage` ＋ `try/catch`）。
	//     ★保存できない場所（プライベートモードなど）でも**遊べなくならない**
	//
	//   ★★BEST は**ゲーム性の核心ではない**（島さんの指定）。
	//     「もう一回」の理由を1つ増やすだけのもの。★ここから育てないこと
	// ------------------------------------------------------------
	var best = 0;      // ★ドットではなく**メートル**（画面に出す数字と同じ単位）

	function loadBest() {
		try {
			var v = parseInt(localStorage.getItem("dotollie-best"), 10);
			best = (isFinite(v) && v > 0) ? v : 0;
		} catch (e) { best = 0; }
		return best;
	}

	// ★★超えたときだけ更新する（**同じ距離では更新しない**）
	function updateBest(m) {
		if (m <= best) return false;
		best = m;
		try { localStorage.setItem("dotollie-best", String(best)); } catch (e) { /* 保存できなくても遊べる */ }
		return true;
	}

	// ============================================================
	// ■■■ ★★アップグレード（2026-08-15 / Phase B）■■■
	// ============================================================
	//
	//   ★**表（何があるか・いくらか・どれくらい強くなるか）は `js/upgrades.js`**（島さんの持ち場）。
	//     ★ここは「**どこに効かせるか**」だけを知っている
	//
	//   ★★覚え方は 音・BEST・コインと**まったく同じ**（`localStorage` ＋ `try/catch`）
	var UP = global.DotUpgrades;
	var upgLv = {};        // id → いまのレベル（0 から）
	var unlocked = {};     // id → 覚えている技かどうか

	function loadUpg() {
		upgLv = {}; unlocked = {};
		try {
			var raw = localStorage.getItem("dotollie-upg");
			var o = raw ? JSON.parse(raw) : null;
			if (o && o.lv) upgLv = o.lv;
			if (o && o.un) unlocked = o.un;
		} catch (e) { upgLv = {}; unlocked = {}; }
		return upgLv;
	}

	function saveUpg() {
		try {
			localStorage.setItem("dotollie-upg", JSON.stringify({ lv: upgLv, un: unlocked }));
		} catch (e) { /* 保存できなくても遊べる */ }
	}

	// ★その強化がいま何倍か（★買っていなければ 1 倍 ＝ 何も変わらない）
	function upgMul(id) {
		var u = UP && UP.find(id);
		return u ? UP.mulOf(u, upgLv[id] || 0) : 1;
	}

	function upgLevel(id) { return upgLv[id] || 0; }

	// ============================================================
	// ■ ★★★ぜんぶ最初に戻す（2026-08-16。★島さんの指定で**扉ボタン**に付けた）
	//
	//   > 島さん「扉ボタンですべてのステータスをリセット出来るようにして。(テストのため)」
	//
	//   ★消すのは**育ったもの**だけ:
	//     コインの貯金 / アップグレードのレベル / 覚えた技 / いちばん進んだ距離
	//   ★**音の入り切りは消さない**（育ったものではなく「設定」なので）
	//
	//   ★★これは**テストのための仕掛け**です。要らなくなったら
	//     下の `RESET_ON_EXIT` を **0** にすれば、扉ボタンはただ「もどる」だけに戻ります。
	// ============================================================
	var RESET_ON_EXIT = 1;      // ★1 = 扉ボタンでぜんぶ消す / 0 = ただ「もどる」だけ

	function resetAll() {
		coins = 0;
		best = 0;
		upgLv = {};
		unlocked = {};
		try {
			localStorage.setItem("dotollie-coins", "0");
			localStorage.setItem("dotollie-best", "0");
			localStorage.setItem("dotollie-upg", JSON.stringify({ lv: {}, un: {} }));
		} catch (e) { /* 消せなくても遊べる */ }
		return true;
	}

	// ============================================================
	// ■ ★★どこに効かせるか（★表は `js/upgrades.js`。ここは当て方だけ）
	// ============================================================
	//   SPEED   … 速さ           → 距離が伸びる
	//   JUMP    … ★コマの進みを遅くする → 滞空が伸びる → ★越えられる幅が広がる
	//   STAMINA … ランの長さ
	//   MULT    … 障害物を越えたときの倍率の伸び
	//   COIN    … 最後にもらうコイン
	function curSpeed()   { return SPEED * upgMul("speed"); }
	// ★★「ジャンプ力」ではなく「**ジャンプ持続倍率**」。
	//   ★★★絵を引き伸ばして高さを変えるのではなく、**同じ絵をゆっくり再生する**。
	//     → `CLAUDE.md` の「高さは絵が決める／物理を足し戻さない」を守っている
	function jumpDurationMul() { return upgMul("jump"); }
	function curStaminaMax()   { return STAMINA_MAX * upgMul("stamina"); }
	function curMultCone()     { return MULT_CONE * upgMul("mult"); }

	// ★★その技を覚えているか。★オーリー（tap）は最初から使える
	function knowsTrick(name) {
		var id = String(name).toLowerCase();
		if (!UP || !UP.findUnlock(id)) return true;   // ★アンロックの表に無いもの＝最初から使える
		return !!unlocked[id];
	}

	// ------------------------------------------------------------
	// ■ ★★貯めたコイン（2026-08-15 / 成長型コア）
	//   ★覚え方は BEST とまったく同じ。★保存できなくても遊べる
	//   ★これがアップグレードの元手になる（Phase B）
	// ------------------------------------------------------------
	var coins = 0;

	function loadCoins() {
		try {
			var v = parseInt(localStorage.getItem("dotollie-coins"), 10);
			coins = (isFinite(v) && v > 0) ? v : 0;
		} catch (e) { coins = 0; }
		return coins;
	}

	function saveCoins() {
		try { localStorage.setItem("dotollie-coins", String(coins)); } catch (e) { /* 保存できなくても遊べる */ }
		return coins;
	}

	function addCoins(n) {
		coins += n;
		return saveCoins();
	}

	// ------------------------------------------------------------
	// ■ 状態
	// ------------------------------------------------------------
	// ★★`instant` = **やり直し**（2026-08-15 / Phase 3）
	//   島さん「クラッシュ → タップ → **即スタート**。ここは『もう一回』を成立させるうえで重要」
	//
	//   ★**初回は今までどおり**（`enter 500ms → READY 800ms → GO 500ms` の 1.8秒）。
	//     2026-08-12 に島さんが設計した「**どんな世界に来たかを見る間**」を壊さないため。
	//   ★★**やり直しのときだけ** `play` から始める。
	//     ただし**走り出しの加速は残す**（`speedMs = 0` から）。
	//     島さんの指定「**GOでいきなりトップスピードはおかしい**」はやり直しでも同じ
	function reset(seed, instant) {
		// ★★どの世界に入るかを決める（→ js/world.js）
		//   ★シェルから種を渡されたら**それを使う**（SEED ID 画面で見せた番号と必ず一致する）。
		//     渡されなければ、いままでどおり自分で引く（テストはこの道を通る）
		if (typeof seed === "number") WD.setSeed(seed); else WD.newSeed();
		PD.reset();      // ★世界が変わったので、焼いてあった背景の紙を捨てる
		st = {
			// ★★スタートの段。
			//   "enter"(世界を見せるだけ) → "ready" → "go"(動き出す) → "play"
			//   ★enter と ready は**世界が止まっている**
			phase: instant ? "play" : firstPhase(),
			phaseMs: 0,
			speedMs: 0,     // ★GO からの経過（走り出しの加速に使う）
			dist: 0,      // 進んだ距離（ドット）
			air: -1,      // ★技の進み具合（ミリ秒）。-1 = 転がっている
			trick: 0,     // ★いま出している技（POSES の何番目か）。air >= 0 のときだけ意味を持つ
			// ★地上の姿（技を出していないとき）
			// ★★始まりは「立ち」。**プッシュ（走り出し）は GO の瞬間から**（島さん 2026-08-12）
			//   ★世界が止まっているのに蹴っているのは変なので、GO まで待つ
			idle: I_STANDBY,
			idleMs: 0,      // その姿の進み具合（ミリ秒）
			nextPush: 0,    // 次にプッシュするまでの残り（秒）
			paused: false,
			// ★三角コーン。画面の右から流れてくる。中身は { x } だけ
			cones: [],
			nextCone: 0,   // 次のコーンを出すまでの残り距離（ドット）
			nextRock: 0,   // ★次の岩（丘の障害物）を出すまでの残り距離
			conesBorn: 0,  // ★これまでに出したコーンの数（テストが見張るためだけの数）
			rocksBorn: 0,  // ★これまでに出した岩の数
			// ★★次に置くパターン（A→B→C→D の巡回）。★種では決めない
			patIndex: 0,
			// ★★ラン終了のときに残す記録。over のときだけ意味を持つ
			reached: 0,      // そのプレイで進んだ距離（メートル）
			newBest: false,  // ★BEST を更新したか
			earned: 0,       // ★そのランで稼いだコイン
			// ★★走行の経済（2026-08-15 / 成長型コア）
			stamina: curStaminaMax(),     // ★0 になったらラン終了
			staminaMax: curStaminaMax(),  // ★★このランの満タン（★バーの割合に使う）
			mult: MULT_BASE,       // ★いまの倍率
			coin: 0,               // ★★積分した稼ぎ（毎コマ「距離 × そのときの倍率」を足す）
			slowMs: 0,             // ★ぶつかったあとの減速の残り
			hits: 0,               // ★ぶつかった回数（★テストと実測が見る）
			// ★★報酬フィードバック（2026-08-15）
			pops: [],              // ★頭上に出る数字（★1か所に集約）
			multFlashMs: 0,        // ★倍率が跳ねている残り
			multFlashUp: 1,        // ★1=上がった / 0=下がった
			shakeMs: 0,            // ★★揺れの残り（★描画だけ）
			mileIndex: 0,          // ★次に出す距離の節目
			// ★★コインのカウントアップ（★表示だけ。貯金には触らない）
			countMs: 0,
			// ★★お店のカーソル。★**0 = START** なので、タップ1回で即もう一回
			shopSel: 0,
			// ★お店で「押したけど、まだ離していない」か（→ `inputUp` の説明）
			tapArmed: false
		};
		st.nextCone = nextConeGap();
		st.nextRock = nextRockGap();
		st.nextPush = nextPushWait();
		// ★★やり直しは「もう走り出している」ところから始める。
		//   ★プッシュ（蹴り出し）も GO のときと同じように入れる（`goNow()` と同じ形）
		if (instant) {
			st.idle = I_PUSH;
			st.idleMs = 0;
		}
	}

	function meters() { return Math.floor(st.dist / SCORE_DOTS); }
	function metersOf(dots) { return Math.floor(dots / SCORE_DOTS); }

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

	// ★丘の岩までの間隔をランダムに引く（★種で決めない ＝ 覚えゲーにしない）
	function nextRockGap() {
		return ROCK_GAP_MIN + Math.random() * (ROCK_GAP_MAX - ROCK_GAP_MIN);
	}

	// 次にプッシュするまでの待ち時間をランダムに引く
	function nextPushWait() {
		return PUSH_EVERY_MIN + Math.random() * (PUSH_EVERY_MAX - PUSH_EVERY_MIN);
	}

	// ★★走り出す前（enter / READY）の姿を進める
	//   ★**立ちをループするだけ。** たまに出るプッシュの時計は動かさない
	//     （世界が止まっているのに蹴り出したら変。プッシュは GO の瞬間から）
	function updateStandby(dt) {
		st.idleMs += dt * 1000;
		var P = POSES[st.idle];
		if (FR.frameAt(P.ms, st.idleMs) < 0) st.idleMs = 0;   // 繰り返す
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

	// ------------------------------------------------------------
	// ■ ★★スタートの段を進める
	//   ready … 世界は止まっている（姿だけ動く）
	//   go    … もう動いている。文字が出ているだけ
	// ------------------------------------------------------------
	// ★どの段から始まるか（★0 にした段は飛ばす）
	function firstPhase() {
		if (ENTER_MS > 0) return "enter";
		if (READY_MS > 0) return "ready";
		return (GO_MS > 0) ? "go" : "play";
	}

	// ★世界が止まっている段か（enter と ready は止まっている）
	function isFrozen(phase) {
		return phase === "enter" || phase === "ready";
	}

	// ------------------------------------------------------------
	// ■ ★★走り出しの加速 —— いまトップスピードの何割で進んでいるか（0〜1）
	//   ★かける時間は**プッシュの絵の長さ**そのもの（直書きしない）
	// ------------------------------------------------------------
	function accelSpan() { return FR.totalMs(POSES[I_PUSH].ms); }

	function accelFactor() {
		if (!ACCEL_ON) return 1;
		var span = accelSpan();
		if (span <= 0) return 1;
		var t = st.speedMs / span;
		if (t >= 1) return 1;
		var s = t * t * (3 - 2 * t);            // 両端がゆるやかな曲線
		return ACCEL_START + (1 - ACCEL_START) * s;
	}

	function goNow() {
		st.phase = (GO_MS > 0) ? "go" : "play";
		st.phaseMs = 0;
		// ★★ここで走り出す ＝ プッシュ（蹴り出し）はこの瞬間から（島さん 2026-08-12）
		//   ★GO より前は世界が止まっているので、蹴っていたら変
		st.idle = I_PUSH;
		st.idleMs = 0;
		st.nextPush = nextPushWait();
		sound(990, 0.07);          // ★低→高で「始まる」
	}

	function updatePhase(dt) {
		if (st.phase === "play") return;
		st.phaseMs += dt * 1000;
		if (st.phase === "enter") {
			if (st.phaseMs < ENTER_MS) return;
			// ★世界を見せる間が終わった → READY へ（READY が 0 なら そのまま GO）
			if (READY_MS > 0) {
				st.phase = "ready";
				st.phaseMs = 0;
				sound(660, 0.06);
			} else {
				goNow();
			}
		} else if (st.phase === "ready") {
			if (st.phaseMs >= READY_MS) goNow();
		} else if (st.phaseMs >= GO_MS) {
			st.phase = "play";
			st.phaseMs = 0;
		}
	}

	// ============================================================
	// ■■■ ★★当たり判定と転倒（2026-08-15 / Phase 2）■■■
	// ============================================================
	//
	//   ■ ★★縦は「足が地面についているコマ」だけ
	//     `lifts > 0`（＝島さんの絵の中で足が浮いている）あいだは**ぶつからない**。
	//     ★これが「越えられる幅」の実体。**物理の判定は作っていない**
	//
	//   ■ ★★横は「主役の足の位置」1点だけ（島さんの指定 2026-08-15）
	//     島さん「腕や頭がコーンに触れたから死亡、はゲームコアの検証を邪魔する」
	//     ★見たいのは「**跳べばコーンを越えられる**」ことだけ。
	//     ★足の位置は地面を読むのと**同じ列**を使う（2か所に持たない）
	//
	//   ★**障害物の外形を1ドットも太らせていない**（既存の決まり）
	function currentLift() {
		var P = currentPose();
		return P.lifts[currentFrame()];
	}

	// ============================================================
	// ■■■ ★★ポップアップ —— **1か所に集約する**（2026-08-15）■■■
	// ============================================================
	//
	//   ★既存の決まり「**まん中に出す文字は1か所を通す**」と同じ思想。
	//     ★★**発生源ごとに個別に描かない。** 越えた・ぶつかった・節目、全部ここを通す
	//
	//   ★x は主役の中心／y は頭のすこし上から上昇／★画面の上端で止まる／
	//     ★寿命で必ず消える（★溜まり続けない）
	function addPop(text, kind) {
		if (!POP_ON) return;
		var F = global.DotFont;
		var w = F.textWidth(text.length);
		// ★主役の中心にそろえる。画面からはみ出さないように寄せる
		var cx = RIDER_X + RIDER_FOOT;
		var x = Math.max(0, Math.min(W - w, Math.round(cx - w / 2)));
		var y = Math.max(0, riderGroundRow() - POP_TOP_GAP);
		if (st.pops.length >= POP_MAX) st.pops.shift();   // ★古いものから捨てる
		st.pops.push({ text: text, kind: kind, x: x, y: y, ms: 0 });
	}

	// ★i 番目の節目は何メートルか（★表を使い切ったら、あとは一定間隔で広がる）
	function milestoneAt(i) {
		if (i < MILESTONES.length) return MILESTONES[i];
		return MILESTONES[MILESTONES.length - 1] +
			MILESTONE_STEP * (i - MILESTONES.length + 1);
	}

	function updatePops(dt) {
		for (var i = st.pops.length - 1; i >= 0; i--) {
			st.pops[i].ms += dt * 1000;
			if (st.pops[i].ms >= POP_MS) st.pops.splice(i, 1);   // ★必ず消える
		}
	}

	// ★★小数を「見せる形」にする（0.5 → "0.5" / 1 → "1"）。
	//   ★★必ず**実際に変わった量**を渡すこと（表示だけ直書きしない）
	function popNum(v) {
		var r = Math.round(v * 10) / 10;
		return (r === Math.floor(r)) ? String(r) : r.toFixed(1);
	}

	// ★★倍率を上げる（★上限で頭打ち。暴走よけ）
	//   ★★順序を崩さないこと: **倍率を変える → ポップを出す → 左上の倍率が反応**
	function addMult(n) {
		var before = st.mult;
		st.mult = Math.min(MULT_MAX, st.mult + n);
		var got = st.mult - before;                       // ★実際に増えた量
		if (got <= 0) return;
		addPop("+" + popNum(got), "gain");
		st.multFlashMs = MULT_FLASH_MS;
		st.multFlashUp = 1;
	}

	// ★いまぶつかっているコーンの番号（無ければ -1）
	function hitConeIndex() {
		if (st.phase !== "play" && st.phase !== "go") return -1;
		if (currentLift() > 0) return -1;                // ★跳んでいる＝当たらない
		var foot = RIDER_X + RIDER_FOOT;                 // ★地面を読むのと同じ列
		for (var i = 0; i < st.cones.length; i++) {
			var cx = Math.round(st.cones[i].x);          // ★描くときと同じ丸め方
			if (foot >= cx && foot < cx + obWidth(st.cones[i])) return i;
		}
		return -1;
	}

	// ============================================================
	// ■■■ ★★ぶつかっても死なない（2026-08-15 / 成長型コア）■■■
	// ============================================================
	//
	//   島さん「**技術を要しない。** 大量のアップグレード、数値のインフレ、
	//           数ある強化要素からどれを選ぶかによって自分好みの強力な組み合わせを作る楽しさ」
	//
	//   ★★**失敗はゲームオーバーではなく「コスト」**。
	//     ただし「何をやっても走れる」だと**コーンを避ける意味が消える**ので、
	//     ★**「避けないと損する」**程度の重さにしてある:
	//
	//       成功（越えた） … 倍率が上がる
	//       失敗（当たった）… ★減速 ＋ ★倍率が 0 に戻る ＋ ★スタミナが余分に減る
	//
	//   ★これで**技術は要らないが、ゲーム内の行動には意味が残る**
	function onHit(i) {
		st.cones.splice(i, 1);          // ★当たったコーンは消す（毎コマ当たり続けないように）
		st.hits++;
		st.stamina -= HIT_STAMINA;      // ★スタミナが余分に減る
		// ★★倍率は**半分になる**（★0 には戻さない。積み上げが全部飛ぶと育たないため）
		var before = st.mult;
		st.mult = Math.max(MULT_BASE, st.mult * MULT_HIT_KEEP);
		var lost = before - st.mult;    // ★★**実際に失った量**から表示を作る
		if (lost > 0) {
			addPop("-" + popNum(lost), "loss");
			st.multFlashMs = MULT_FLASH_MS;
			st.multFlashUp = 0;
		}
		st.slowMs = HIT_SLOW_MS;        // ★しばらく減速する
		st.shakeMs = SHAKE_MS;          // ★★揺れる（★描画だけ。遊びには触らない）
		sound(220, 0.12);
	}

	// ★★ラン終了（スタミナが 0 になった）。★転んだのではない
	function runOver() {
		st.phase = "over";
		st.phaseMs = 0;
		st.reached = meters();
		st.newBest = updateBest(st.reached);
		// ★★積分した稼ぎを整数にする。★COIN のアップグレードはここで効く
		st.earned = Math.floor(st.coin * upgMul("coin"));
		// ★★★**貯金に足すのは、ここ1か所だけ。**
		//   カウントアップは「表示だけ」なので、省略しても二重に増えない
		addCoins(st.earned);
		st.countMs = 0;                          // ★0 から数え始める
		sound(330, 0.20);
	}

	// ============================================================
	// ■■■ ★★コインのカウントアップ（★表示だけ・貯金に触らない）■■■
	// ============================================================
	//
	//   島さん「`COIN 0 ×4.2` からチャリンチャリンの音と同時に数字が0から上昇する
	//           （タップで省略可）」
	function updateCount(dt) {
		if (st.countMs >= COUNT_MS) return;
		var before = st.countMs;
		st.countMs = Math.min(COUNT_MS, st.countMs + dt * 1000);
		// ★チャリンチャリン。★数え終わったら鳴らさない／稼ぎが0なら鳴らさない
		if (st.earned > 0 &&
			Math.floor(st.countMs / COUNT_BEEP_MS) !== Math.floor(before / COUNT_BEEP_MS)) {
			sound(COUNT_BEEP_HZ, 0.03);
		}
	}

	function countDone() { return st.countMs >= COUNT_MS; }

	// ============================================================
	// ■■■ ★★お店の一覧（★ラン終了の画面と一体）2026-08-15 / Phase B ■■■
	// ============================================================
	//
	//   ★★**カーソルの最初の場所は `START`**。
	//     → **タップ1回で即もう一回**（前に作った「即リトライ」を1ドットも損なわない）
	//   ★操作はいまの3つだけ: 上へなぞる＝↑ / 下へなぞる＝↓ / タップ＝決定
	//
	//   ★一覧は毎回その場で作る（★項目数を決め打ちにしない ＝ 表に1行足せば増える）
	function shopRows() {
		var rows = [{ kind: "start", name: "START" }];
		if (!UP) return rows;
		UP.UPGRADES.forEach(function (u) {
			var lv = upgLevel(u.id);
			rows.push({
				kind: "upg", id: u.id, name: u.name, lv: lv, max: u.maxLevel,
				cost: (lv >= u.maxLevel) ? 0 : UP.costOf(u, lv)
			});
		});
		UP.UNLOCKS.forEach(function (u) {
			rows.push({
				kind: "unlock", id: u.id, name: u.name,
				got: !!unlocked[u.id], cost: u.cost
			});
		});
		return rows;
	}

	// ★その行が買えるか（★買えないものは暗く出す）
	function canBuy(r) {
		if (r.kind === "start") return true;
		if (r.kind === "upg") return r.lv < r.max && coins >= r.cost;
		return !r.got && coins >= r.cost;
	}

	// ★★決定を押したとき。★買えたら true
	function shopPick() {
		var rows = shopRows();
		var r = rows[Math.max(0, Math.min(rows.length - 1, st.shopSel))];
		if (!r || r.kind === "start") return false;
		if (!canBuy(r)) { sound(180, 0.06); return false; }   // ★買えない音
		if (r.kind === "upg") {
			coins -= r.cost;
			upgLv[r.id] = (upgLv[r.id] || 0) + 1;
		} else {
			coins -= r.cost;
			unlocked[r.id] = true;
		}
		saveCoins();
		saveUpg();
		sound(1320, 0.10);                                     // ★買えた音
		return true;
	}

	function shopMove(d) {
		var n = shopRows().length;
		st.shopSel = (st.shopSel + d + n) % n;
		sound(880, 0.03);
	}

	// ★★いま選んでいる行を決める（★呼ぶのは「指を離したとき」＝ `inputUp`）
	function shopDecide() {
		var rows = shopRows();
		if (rows[st.shopSel] && rows[st.shopSel].kind === "start") { restart(); return; }
		shopPick();
	}

	// ★いま画面に出す額（★0 → 稼いだ額。最初速く、最後ゆっくり）
	function countedCoin() {
		if (countDone()) return st.earned;
		var t = st.countMs / COUNT_MS;
		return Math.floor(st.earned * (1 - Math.pow(1 - t, 3)));
	}

	// ★そのランで**実際に効いた倍率**（★距離で重みづけした平均）。
	//   ★★2026-08-15、**画面には出していない**（島さんの指定）。
	//     一度ラン終了の画面に出したが、**左上の「いまの倍率」と食い違って見えた**ため外した。
	//   ★★`st.mult`（いまの倍率）とは**別物**。混ぜないこと。
	//     コインは「距離 × そのときの倍率」を積分したものなので、
	//     **稼ぎ ÷ 距離** が「1mあたり平均して何倍が効いたか」になる。
	//   ★テストと実測が使う（★戻したくなったらここを呼ぶ）
	function runAvgMult() {
		return (st.reached > 0) ? (st.earned / st.reached) : 1;
	}

	// ★★やり直し。★**同じ種のまま**（「次はこの技を使おう」を起こしたいので）
	//   ★★2026-08-15（Phase 3）: **待ち時間なしで走り出す**（`instant`）。
	//     島さん「クラッシュ → タップ → 即スタート」
	//   ★ただし**加速はやり直される**（`speedMs` が 0 に戻る）ので、
	//     いきなりトップスピードにはならない
	function restart() {
		reset(WD.getSeed(), true);
		sound(880, 0.06);
	}

	function update(dt) {
		if (st.paused) return;
		// ★★ラン終了。★世界は止まったまま、コインの数え上げだけ進む
		if (st.phase === "over") { updateCount(dt); return; }

		updatePhase(dt);

		// ★★enter と READY のあいだは世界が止まる（進まない・コーンも流れない）。
		//   ★スケーターは**立ちのまま待つ**（プッシュは GO の瞬間から）
		if (isFrozen(st.phase)) { updateStandby(dt); return; }

		// ★★スタミナが減る。0 になったらラン終了（★転ぶのではない）
		st.stamina -= dt;
		if (st.stamina <= 0) { st.stamina = 0; runOver(); return; }

		// ★ぶつかったあとの減速（残り時間が減っていく）
		if (st.slowMs > 0) st.slowMs = Math.max(0, st.slowMs - dt * 1000);
		var slowFactor = (st.slowMs > 0) ? HIT_SLOW : 1;

		// ★★走り出しの加速。GO からの経過で、速さがじわっと上がる
		st.speedMs += dt * 1000;
		// ★★SPEED のアップグレードはここで効く（→ `curSpeed()`）
		var moved = curSpeed() * accelFactor() * slowFactor * dt;
		st.dist += moved;

		// ★★見た目だけのもの（★遊びには触らない）を進める
		updatePops(dt);
		if (st.multFlashMs > 0) st.multFlashMs = Math.max(0, st.multFlashMs - dt * 1000);
		if (st.shakeMs > 0) st.shakeMs = Math.max(0, st.shakeMs - dt * 1000);

		// ★★倍率: 走っているだけでも少し上がる（★基礎成長）
		//   ★ここはポップアップを出さない（毎コマ出たらうるさい）ので、直接足す
		st.mult = Math.min(MULT_MAX, st.mult + MULT_PER_SEC * dt);

		// ★★距離の節目（★進むほど間隔が広がる。★距離は報酬の主役ではない）
		//   ★★2026-08-15、島さんの指定で **いったん出さない**（`MILESTONE_POP_ON = 0`）
		var mile = milestoneAt(st.mileIndex);
		if (meters() >= mile) {
			if (MILESTONE_POP_ON) addPop("+" + mile + "m", "gain");
			st.mileIndex++;
		}
		// ★★稼ぎは「積分」。**そのときの倍率**で足していく（→ docs/decisions.md 2026-08-15(7)）
		//   ★「距離 × 終了時の倍率」にすると、**最後に倍率を上げたことだけが効いてしまう**
		st.coin += (moved / SCORE_DOTS) * st.mult;

		// ★三角コーン: 画面の右の外から出して、左へ流す
		if (CONE_ON) {
			st.nextCone -= moved;
			if (st.nextCone <= 0) {
				// ★★出そうとした場所が「まっすぐな道の本体」のときだけ出す（2026-08-11）
				//   `>= 1` ＝ 完全に平らなところ。**入口と出口のなだらかな坂には置かない**
				//   平らでなければ「今回は出さない」だけ（抽選のタイミングはそのまま進む）
				var bornAt = worldX() + W + 4;
				// ★★2026-08-15（Phase 2）: 1個ずつではなく**パターンをまるごと**置く。
				//   ★パターンの順番は A→B→C→D の巡回。**種（シード）では決めない**
				//     （既存の決まり: 障害物を種で決めると「覚えゲー」になる）
				var pat = PATTERN_ON ? PATTERNS[st.patIndex % PATTERNS.length] : null;
				var len = pat ? patternLen(pat) : 0;
				// ★★パターンの**端から端まで**が平らな道の上に乗るときだけ置く
				if (pat && WD.flatnessAt(bornAt) >= 1 && WD.flatnessAt(bornAt + len) >= 1) {
					for (var oi = 0; oi < pat.obs.length; oi++) {
						for (var ci = 0; ci < pat.obs[oi].n; ci++) {
							var off = pat.obs[oi].at + ci * CONE_W;
							// wx = ★このコーンが**世界のどこに立っているか**。
							//   描くのには使わないが、「本当に平らな道の上か」を測るときの正。
							//   画面の x から逆算すると丸めが二重にかかってブレる
							st.cones.push({ x: W + 4 + off, wx: bornAt + off });
							st.conesBorn++;           // ★テストが「全滅していないか」を見る
						}
					}
					st.patIndex++;
					st.nextCone = len + CONE_GAP_MIN; // ★次のパターンまで、ひと呼吸あける
				} else {
					st.nextCone = nextConeGap();      // すこし進んで、また試す
				}
			}
			// ★★丘の岩（2026-08-15、島さんの指定で新設）。
			//   ★コーンは「まっすぐな道」、岩は「丘」。**場所で住み分ける**
			if (ROCK_ON) {
				st.nextRock -= moved;
				if (st.nextRock <= 0) {
					var rockAt = worldX() + W + 4;
					// ★丘のときだけ（＝まっすぐな道ではないとき）
					if (WD.flatnessAt(rockAt) <= 0) {
						st.cones.push({ x: W + 4, wx: rockAt, kind: "rock" });
						st.rocksBorn++;
					}
					st.nextRock = nextRockGap();
				}
			}

			var foot = RIDER_X + RIDER_FOOT;
			for (var i = st.cones.length - 1; i >= 0; i--) {
				var c = st.cones[i];
				var cw = obWidth(c);
				c.x -= moved;
				// ★★足の位置を通り過ぎた ＝ 越えた（★倍率が上がる。★唯一の加速装置）
				if (!c.passed && Math.round(c.x) + cw < foot) {
					c.passed = 1;
					// ★★MULT のアップグレードはここで効く
					addMult(curMultCone());
				}
				if (c.x + cw < 0) st.cones.splice(i, 1);
			}
			// ★★当たり判定。★★**転ばない。** 減速＋倍率リセット＋スタミナ減だけ
			var hi = hitConeIndex();
			if (hi >= 0) onHit(hi);
		}
		// ★技: 島さんの絵を js/frames.js の時間どおりに送る。物理の計算は無い
		//   ★★JUMP のアップグレードはここで効く ＝ **コマの進みが遅くなる**
		//     → 同じ絵をゆっくり再生 → 滞空が伸びる → 越えられる幅が広がる
		//   ★★★絵も `js/frames.js` の表も1つも変えていない
		if (st.air >= 0) {
			st.air += dt * 1000 / jumpDurationMul();
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

	// ★★スタミナバー（★画面のいちばん上・横いっぱい）
	//   ★★**見た目だけ。** ここは何も書き換えない（読むだけ）
	function barColorFor(ratio) {
		for (var i = 0; i < BAR_STEPS.length; i++) {
			if (ratio >= BAR_STEPS[i].at) return BAR_STEPS[i].color;
		}
		return BAR_STEPS[BAR_STEPS.length - 1].color;
	}

	function drawStaminaBar() {
		if (!BAR_ON) return;
		// ★★このランの満タンで割る（★STAMINA を上げるとバーの目盛りも伸びる）
		var r = Math.max(0, Math.min(1, st.stamina / (st.staminaMax || STAMINA_MAX)));
		// ★★2026-08-15、島さんの指定で**「尽きたら全部赤」にはしない**。
		//   ★残量が減るほど短くなり、色が 緑 → 黄 → 橙 → 赤 と変わって、**そのまま尽きる**
		// ★減った側（★「どれだけ減ったか」が見える）
		ctx.fillStyle = GB[C_BAR_BACK];
		ctx.fillRect(0, 0, W, BAR_H);
		// ★残っている側。★残量で色が変わる（緑 → 黄 → 橙 → 赤）
		var w = Math.round(W * r);
		if (w > 0) {
			ctx.fillStyle = GB[barColorFor(r)];
			ctx.fillRect(0, 0, w, BAR_H);
		}
	}

	// ★★頭上のポップアップを描く（★出すのは `addPop()` 1か所だけ）
	//   ★消え方: パレットに透明度が無いので、**最後に暗い色へ落として**消す
	function drawPops() {
		var F = global.DotFont;
		for (var i = 0; i < st.pops.length; i++) {
			var p = st.pops[i];
			var t = p.ms / POP_MS;
			var y = Math.max(0, Math.round(p.y - POP_RISE * t));   // ★上端で止まる
			var late = (p.ms > POP_MS - POP_FADE_MS);
			var col = (p.kind === "loss")
				? (late ? C_POP_LOSS_D : C_POP_LOSS)
				: (late ? C_POP_GAIN_D : C_POP_GAIN);
			F.drawText(ctx, p.text, p.x, y, GB[col]);
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
	//   ★★2026-08-15: コーン（まっすぐな道）と岩（丘）を**同じ道具で描く**
	function drawCones() {
		for (var i = 0; i < st.cones.length; i++) {
			var o = st.cones[i], A = obArt(o), f = A.FRAMES[0];
			var half = Math.floor(f.rows[0].length / 2);
			var cx = Math.round(o.x);
			drawArt(f, cx, groundRowAt(cx + half) - 1 - A.FEET_ROW + f.y);
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

	// ★最遠景の帯を1枚ぶん描くための小さな道具（ループの中で関数を作るため）
	function skyBandRow(bi, wx) {
		return function (c) { return SK.bandRowAt(bi, wx, c); };
	}

	function draw() {
		// ★★★ぶつかったときの揺れ（2026-08-15）。★**ここから ⑧ までだけを揺らす**
		//   ★★HUD（距離・倍率・まん中の文字）は揺らさない ＝ 読めなくならない
		//   ★★★揺れは**描画だけ**。距離・倍率・当たり判定・世界には1ドットも触らない
		//     （既存の決まり「見た目は見た目だけ。遊びに触らない」）
		//   ★テストの偽の液晶では `translate` が何もしないので、お手本の絵は変わらない
		var shakeX = 0, shakeY = 0;
		if (st.shakeMs > 0 && SHAKE_PX > 0) {
			var k = st.shakeMs / SHAKE_MS;                     // 1 → 0 へ弱まる
			shakeX = Math.round(Math.sin(st.shakeMs * 0.09) * SHAKE_PX * k);
			shakeY = Math.round(Math.cos(st.shakeMs * 0.13) * SHAKE_PX * k);
		}
		ctx.save();
		if (shakeX || shakeY) ctx.translate(shakeX, shakeY);

		// ① 空（一色）。★このあと地面と稜線を上から重ねる
		ctx.fillStyle = GB[C_BG];
		ctx.fillRect(-SHAKE_PX, -SHAKE_PX, W + SHAKE_PX * 2, H + SHAKE_PX * 2);

		// ② ★遠景の稜線（あれば）。★地面より先に描くので、手前の地面に隠れる
		if (WD.RIDGE_ON) {
			var bx = worldX();
			fillBelow(function (c) { return GROUND - WD.ridgeAt(bx + c); }, GB[C_RIDGE]);
		}

		// ②' ★★最遠景の景観 —— 連続地形＋巨大ランドマーク（→ js/skyline.js）
		//
		//   ★★順番は「**いちばん奥の帯 → ランドマーク → 残りの帯**」。
		//
		//   ■ ★なぜランドマークを「いちばん奥の帯のあと」に描くのか
		//     2026-08-13、島さんの図どおり「ランドマーク → A → B」で作ってみたら、
		//     ★**ランドマークが帯Aにほぼ埋もれて、山の中腹の帯にしか見えませんでした**
		//     （ランドマークの高さ 22〜40 に対し、帯Aは 6〜48 まで上がるため）。
		//     → それでは「景色が変わった」と感じられないので、**帯Aの手前**に移しました。
		//
		//   ■ ★島さんの決めごとは守っています
		//     「**そのあとに描く地形（帯B）が、ランドマークの下部を自然に隠す**」——
		//     これがマスク方式の要で、**足元が浮かない・食い込まない**のはこのおかげ。
		//   ★ここを入れ替えると、巨大な山が空中に浮いて見えます
		//
		//   ■ ★★2026-08-15、**背景の部品も、このマスクの中に入りました**
		//
		//     島さん「建物を『地面に立てる』のではなく、**丘の向こう側に存在させる**」
		//
		//     ★前は建物（遠景の部品）が**帯Bのあと**に描かれ、構造として
		//       「丘の**手前**に立って」いました。丘が低い場所では**足元のすぐ下に緑や空が覗き**、
		//       「地面に貼り付けた」ように見えていた原因がこれです。
		//     → ★**帯を塗る直前に `PD.drawBehind()`** を呼び、その帯に足元を隠させます。
		//       どの層を奥へ回すかは `js/parts.js` の `behindBand`（★島さんの持ち場）
		var skx = worldX();
		fillBelow(skyBandRow(0, skx), GB[SK.colorIndexOf(SK.BANDS[0].color)]);
		fillBelow(function (c) { return SK.lmRowAt(skx, c); },
			GB[SK.colorIndexOf(SK.LM_COLOR)]);
		for (var sb = 1; sb < SK.BANDS.length; sb++) {
			// ★★この帯より「奥」の層を先に置く → 次の行の帯が足元を隠す
			PD.drawBehind(ctx, skx, SK.BANDS[sb].name);
			fillBelow(skyBandRow(sb, skx), GB[SK.colorIndexOf(SK.BANDS[sb].color)]);
		}

		// ③ ★★背景の部品（中景など）。→ js/parts.js / js/tint.js
		//   ★奥ほどゆっくり流れ、奥ほど淡い。**地面より先に描くので、手前の地面に隠れる**
		//   ★★`behindBand` を書いた層（遠景・光もの）は**ここには来ません**（上で描き済み）
		PD.draw(ctx, worldX(), 0);

		// ④ ★★地面。**種から作られる起伏**（→ js/world.js）
		//
		//   ★★2026-08-13（N3）、**2段に塗る**ようにしました:
		//     ① 地表の際の色で、地面ぜんぶを塗る
		//     ② 本体を「際の太さぶん下」から塗る → ★上に際が残る
		//
		//   ★★★新しい描画の仕組みは作っていません。**`fillBelow` を2回呼ぶだけ**。
		//   ★際の太さは場所で変わります（`js/world.js` の `EDGE_*`）。
		//     `EDGE_ON = 0` にすると太さが 0 になり、**地面が一色に戻ります**
		var gx = worldX();
		fillBelow(groundRowAt, GB[C_GROUND_EDGE]);
		fillBelow(function (c) { return groundRowAt(c) + WD.edgeThickAt(gx + c); },
			GB[C_GROUND]);

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

		// ★★★ここで揺れをやめる。この下（HUD）は揺らさない
		ctx.restore();

		// ⑨' ★★スタミナバー（★画面のいちばん上・横いっぱい）。2026-08-15 島さんの指定
		//   島さん「スタミナの見える化がないと、何故急に終了したのか分からない」
		drawStaminaBar();

		// ⑨ 距離と倍率（左上に2行）。★右上は [音][一時停止][もどる] が重なるので使わない
		//   ★単位の「m」つき（2026-08-12 島さんの指定）
		//   ★★バーのぶんだけ下へずらす
		var F = global.DotFont;
		var hudY = (BAR_ON ? BAR_H : 0) + 2;
		F.drawText(ctx, meters() + "m", 2, hudY, GB[C_TEXT]);
		// ★★倍率を画面の主役にする（2026-08-15 島さんの指定）。
		//   ★上がった瞬間だけ **1ドット跳ねて色が変わる**（★2倍で描く仕組みは作らない）
		var multY = hudY + F.GLYPH_H + 2;
		var multCol = C_MULT;
		if (st.multFlashMs > 0) {
			multY -= 1;                                  // ★ぴょこっと跳ねる
			multCol = st.multFlashUp ? C_MULT_UP : C_MULT_DOWN;
		}
		// ★★コインの絵を倍率の左に置く（2026-08-15 島さんの指定）。
		//   ★★★**島さんが描いた絵**（`assets/parts/coin.aseprite` → `js/parts-art.js`）。
		//     AIは置く場所を決めるだけで、**絵は1ドットも触らない**
		//   ★「この × はコインに効くんですよ」を、文字を増やさずに伝える
		//   ★倍率と**同じ行**なので、跳ねるときは一緒に跳ねる
		var multX = 2;
		if (COIN_ICON) {
			drawArt(COIN_ICON, 2, multY);
			multX = 2 + COIN_ICON.rows[0].length + 2;
		}
		F.drawText(ctx, "×" + st.mult.toFixed(1), multX, multY, GB[multCol]);

		// ★★頭上のポップアップ（+0.5 / -1.5 / +100m）。★1か所に集約してある
		drawPops();

		// ⑩ ★まん中に出す文字（READY / GO / PAUSE / ★転んだときの記録）
		if (st.paused) drawCenterText("PAUSE");
		else if (st.phase === "ready") drawCenterText("READY");
		else if (st.phase === "go") drawCenterText("GO");
		// ★★ラン終了の画面（2026-08-15 / 成長型コア）。**3行だけ**
		//
		//     1234m
		//   COIN 5821
		//   BEST 9842m
		//
		//   ★★主役やコーンには重ならない:
		//     主役は画面の左（x 26〜47）、コーンは地面の上（y 115〜124）。
		//     この文字は**まん中**なので、どちらとも離れている
		//   ★コンボ・倍率・SEED は出さない（あと）
		else if (st.phase === "over") {
			drawOverScreen();
		}
	}

	// ============================================================
	// ★★ラン終了の画面（★お店と一体）。2026-08-15 / Phase B
	// ============================================================
	//
	//     200m
	//   COIN 820          ← ★0 から数え上がる
	//  ────────────
	//  →START             ← ★カーソルはここから ＝ **タップ1回で即もう一回**
	//   SPEED    LV1  330
	//   …
	//
	//   ★★**新しい操作もボタンも増やしていない**（上へなぞる／下へなぞる／タップ だけ）
	function drawOverScreen() {
		var F = global.DotFont;
		var rowH = F.GLYPH_H + 3;
		var rows = shopRows();

		// ★★2026-08-15、島さんの指定で **BEST の行は出さない**。
		//   ★記録そのものは覚えている（`localStorage` の `dotollie-best`）
		drawCenterText(st.reached + "m", SHOP_TOP - 76 - rowH);
		// ★★「COIN 0」から数字が伸びる。★ここに倍率は出さない（島さんの指定で外した）
		drawCenterText("COIN " + countedCoin(), SHOP_TOP - 76 - 2);

		// ★★数え終わるまでは一覧を出さない（★結果を落ち着いて見せる）
		if (!countDone()) return;

		// ★★一覧の後ろに暗い帯を敷く（★景色の上だと読めないため）
		//   ★★帯は**いちばん下の「COIN いくつ」の行まで**覆うこと。
		//     覆い忘れると持ち金の字だけ地面の上に乗って読めなくなる（2026-08-15 に一度そうなった）
		var moneyY = SHOP_TOP + rows.length * rowH + 1;
		ctx.fillStyle = GB[C_SHOP_BACK];
		ctx.fillRect(0, SHOP_TOP - 3, W, (moneyY + F.GLYPH_H + 3) - (SHOP_TOP - 3));

		var money = "COIN " + coins;
		for (var i = 0; i < rows.length; i++) {
			var r = rows[i], y = SHOP_TOP + i * rowH;
			var sel = (i === st.shopSel);
			var col = canBuy(r) ? (sel ? C_SHOP_SEL : C_SHOP_ROW) : C_SHOP_OFF;
			if (sel) F.drawText(ctx, "→", SHOP_X - 7, y, GB[C_SHOP_SEL]);
			F.drawText(ctx, shopRowText(r), SHOP_X, y, GB[col]);
		}
		// ★いくら持っているか（★一覧のいちばん下）
		F.drawText(ctx, money, SHOP_X, moneyY, GB[C_SHOP_ROW]);
	}

	// ★1行ぶんの文字（★名前・レベル・値段を桁でそろえる）
	function shopRowText(r) {
		if (r.kind === "start") return "START";
		var name = pad(r.name, 9);
		if (r.kind === "unlock") return name + (r.got ? "OWNED" : pad("", 4) + r.cost);
		if (r.lv >= r.max) return name + "LV" + r.lv + " MAX";
		return name + "LV" + r.lv + " " + r.cost;
	}

	function pad(s, n) {
		s = String(s);
		while (s.length < n) s += " ";
		return s;
	}

	// ------------------------------------------------------------
	// ■ ★★液晶のまん中に文字を出す（READY / GO / PAUSE が全部ここを通る）
	//
	//   ★★2026-08-12、島さんの指摘で直した:
	//     > 「一時停止ボタンの時 PAUSE が出るが画面中央でない。若干上寄り。」
	//
	//     前は `GROUND / 2` で計算していた ＝ **液晶ではなく「空の帯」のまん中**。
	//     240×160 で **18ドット上にずれていた**（58行目に出ていた。正しくは76行目）。
	//
	//   ★**3つとも同じここを通すのが大事。**
	//     別々に計算していると「PAUSE は直したが READY だけまた上寄り」が起きる。
	//   ★字数も文字列から数える（直書きすると、言葉を変えたとき黙ってずれる）
	//   ★`dy` は中央からの上下のずらし（ふだんは 0）
	// ------------------------------------------------------------
	function drawCenterText(text, dy) {
		var F = global.DotFont;
		F.drawText(ctx, text,
			Math.floor((W - F.textWidth(text.length)) / 2),
			Math.floor((H - F.GLYPH_H) / 2) + (dy || 0),
			GB[C_TEXT]);
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
			SK.setup(H, GROUND);         // ★★最遠景の景観に、液晶の高さと地面の位置を教える
			PD.setup(W, H, GROUND);      // ★背景の部品に、画面の大きさと地面の位置を教える
			loadSound();
			loadBest();                  // ★いちばん進んだ距離を思い出す（2026-08-15 / Phase 3）
			loadCoins();                 // ★★貯めたコインを思い出す（2026-08-15 / 成長型コア）
			loadUpg();                   // ★★アップグレードを思い出す（2026-08-15 / Phase B）
			// ★シェルが SEED ID 画面で見せた種を、そのまま受け取る
			reset(opts && typeof opts.seed === "number" ? opts.seed : undefined);
			// ★READY の音。★enter から始まるときは、enter が明けた瞬間に鳴る（updatePhase）
			if (st.phase === "ready") sound(660, 0.06);
			startLoop();
			tick();          // 開始直後に1枚描いて、すぐ画面を切り替える
		},

		stop: function () { stopLoop(); },

		// ★★★扉ボタン（もどる）を押したとき（2026-08-16。★島さんの指定）
		//   シェルはこれを呼んでからメニューへ戻る。
		//   ★★**テストのため、ここでぜんぶ最初に戻す**（→ `resetAll` の説明）
		//   ★要らなくなったら `RESET_ON_EXIT = 0` に。扉はただ「もどる」だけになる
		onExit: function () {
			if (!RESET_ON_EXIT) return false;
			resetAll();
			sound(220, 0.14);          // ★消えたことが分かる低い音
			return true;
		},

		inputDown: function (action) {
			if (action === "pause") { this.togglePause(); return; }
			if (action === "sound") { this.toggleSound(); return; }
			// ★お店では、パソコンの上下キーでもカーソルが動くようにする
			//   （★スマホは「なぞる」。★操作は増やしていない）
			if (st && st.phase === "over" && countDone() &&
				(action === "jump" || action === "guard")) {
				shopMove(action === "jump" ? -1 : 1);
				return;
			}
			this.input();
		},

		// ★★★指を離したとき（2026-08-16。★実機で見つけた不具合の直し）
		//
		//   遊んでいる最中は**押しっぱなしを使わない**ので、ここは何もしない。
		//   ★★ただし**買い物の画面だけは、決定を「指を離したとき」にする。**
		//
		//   なぜか: シェルは「**押した瞬間**に act」を送る（技の反応を遅らせないため）。
		//   そのままだと、なぞろうとして指を置いた瞬間に `START` が決まってしまい、
		//   ★**買い物画面でカーソルを動かすことが構造的に不可能**だった。
		//   → 押した瞬間は「構える」だけにして、**離したときに決める**。
		//     ★タップ1回で即もう一回（押して離す＝1タップ）は**そのまま**。
		//   ★`swiped` が真のときは決めない（なぞりは移動であって決定ではない）
		inputUp: function (action, swiped) {
			if (action !== "act") return;
			if (st === null || st.paused) return;
			if (st.phase !== "over") return;
			if (swiped || !st.tapArmed) { st.tapArmed = false; return; }
			st.tapArmed = false;
			shopDecide();
		},

		// ★★技を出す。`how` は "tap"(タップ) か "swipeUp"(上へなぞる)
		//   ★ここでやるのは「どの技かを決めて 0 にする」だけ。
		//     高さも滞空も**島さんが描いた絵**が決める
		trick: function (how) {
			if (st === null || st.paused) return false;
			if (st.phase === "over") return false;       // ★ラン終了中は技が出ない
			for (var i = 0; i < POSES.length; i++) {
				if (POSES[i].how !== how) continue;
				// ★★★覚えていない技は出ない（2026-08-15 / Phase B）。
				//   ★最初はオーリーだけ。キックフリップとポップは**買って覚える**
				if (!knowsTrick(POSES[i].name)) return false;
				st.trick = i;
				st.air = 0;
				// ★★技を出したら倍率が上がる（★加速装置。★出すだけでよい＝技術が要らない）
				addMult(MULT_TRICK);
				// 技ごとに音を変える（タップ990 / 上へ1320 / 下へ660）
				sound(how === "swipeUp" ? 1320 : (how === "swipeDown" ? 660 : 990), 0.06);
				return true;
			}
			return false;
		},

		// ★タップ = オーリー。**技の最中は受け付けない**(技の途中で技は出ない)
		//   ★★READY 中のタップは「飛ばす」だけ（技は出ない）
		input: function () {
			if (st === null || st.paused) return;
			// ★★ラン終了の画面（2026-08-15）。★タップは2段階:
			//   ① 数えている途中 … **省略**（★誤タップで結果が消えない）
			//   ② 数え終わったあと … ★**構えるだけ。決めるのは指を離したとき**（`inputUp`）
			//      ★そうしないと、なぞろうとして指を置いた瞬間に決まってしまう
			if (st.phase === "over") {
				if (!countDone()) { st.countMs = COUNT_MS; return; }
				st.tapArmed = true;
				return;
			}
			// ★★走り出す前（enter / READY）は**何も起きない**（島さんの指定 2026-08-12）。
			//   飛ばせないし、技も出ない
			if (isFrozen(st.phase)) return;
			if (st.air >= 0) return;
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
			// ★★ラン終了の画面では、なぞりは**カーソルの上下**（2026-08-15 / Phase B）
			//   ★数えている途中なら、まず省略
			if (st.phase === "over") {
				if (!countDone()) { st.countMs = COUNT_MS; return; }
				st.tapArmed = false;      // ★なぞったので、離しても決定しない
				shopMove(how === "swipeUp" ? -1 : 1);
				return;
			}
			if (isFrozen(st.phase)) return;                  // ★走り出す前は何も起きない
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
		// ★いま足が何ドット浮いているか（★テストと実測が使う。0 = 地面）
		_lift: function () { return currentLift(); },
		// ★ポップアップを外から1つ出す（★テストが上限と寿命を確かめるため）
		_addPop: function (text, kind) { addPop(text, kind); },
		// ★★カウントアップの覗き窓（★テストが「表示だけ」を確かめるため）
		_countedCoin: countedCoin,
		_countDone: countDone,
		_runAvgMult: runAvgMult,
		_barColorFor: barColorFor,
		// ★★アップグレードの覗き窓（2026-08-15 / Phase B）
		_shopRows: shopRows,
		_shopPick: shopPick,
		_upgLevel: upgLevel,
		_knowsTrick: knowsTrick,
		_curSpeed: curSpeed,
		_jumpMul: jumpDurationMul,
		_curStaminaMax: curStaminaMax,
		_curMultCone: curMultCone,
		_curClearDots: curClearDots,
		_baseClear: function () { return BASE_CLEAR; },
		_resetOnExit: function () { return RESET_ON_EXIT; },
		_draw: function () { draw(); },
		_meters: meters,
		_consts: function () {
			return {
				SPEED: SPEED, RIDER_X: RIDER_X, SCORE_DOTS: SCORE_DOTS,
				GROUND_FROM_BOTTOM: GROUND_FROM_BOTTOM, RIDER_FOOT: RIDER_FOOT,
				COLORS: { BG: C_BG, GROUND: C_GROUND, RIDGE: C_RIDGE, TEXT: C_TEXT,
					GROUND_EDGE: C_GROUND_EDGE },
				// ★世界のかたち（js/world.js。テストが「起伏の分だけ余白があるか」を測るのに使う）
				WORLD: WD,
				PALETTE: GB,
				PAD: this.pad, SWIPE_GRACE_MS: SWIPE_GRACE_MS,
				ENTER_MS: ENTER_MS, READY_MS: READY_MS, GO_MS: GO_MS,
				// ★走り出しの加速（かける時間はプッシュの絵の長さ）
				ACCEL_ON: ACCEL_ON, ACCEL_START: ACCEL_START, ACCEL_MS: accelSpan(),
				CONE_ON: CONE_ON, CONE_GAP_MIN: CONE_GAP_MIN, CONE_GAP_MAX: CONE_GAP_MAX,
				// ★★障害物のパターン（2026-08-15 / Phase 2）。★テストが解いて見張る
				PATTERN_ON: PATTERN_ON, PATTERNS: PATTERNS,
				patternLen: patternLen,
				// ★★いちばん進んだ距離（2026-08-15 / Phase 3）
				BEST: best, SCORE_DOTS: SCORE_DOTS,
				// ★★走行の経済（2026-08-15 / 成長型コア）
				COINS: coins,
				STAMINA_MAX: STAMINA_MAX, HIT_STAMINA: HIT_STAMINA,
				HIT_SLOW_MS: HIT_SLOW_MS, HIT_SLOW: HIT_SLOW,
				MULT_BASE: MULT_BASE, MULT_PER_SEC: MULT_PER_SEC,
				MULT_TRICK: MULT_TRICK, MULT_CONE: MULT_CONE, MULT_MAX: MULT_MAX,
				MULT_HIT_KEEP: MULT_HIT_KEEP,
				// ★★報酬フィードバック（2026-08-15）
				POP_ON: POP_ON, POP_MS: POP_MS, POP_MAX: POP_MAX, POP_RISE: POP_RISE,
				MULT_FLASH_MS: MULT_FLASH_MS, SHAKE_MS: SHAKE_MS, SHAKE_PX: SHAKE_PX,
				MILESTONE_POP_ON: MILESTONE_POP_ON,
				MILESTONES: MILESTONES, MILESTONE_STEP: MILESTONE_STEP,
				// ★★スタミナバーとコインのカウントアップ（2026-08-15）
				BAR_ON: BAR_ON, BAR_H: BAR_H, BAR_STEPS: BAR_STEPS, C_BAR_BACK: C_BAR_BACK,
				COUNT_MS: COUNT_MS, COUNT_BEEP_MS: COUNT_BEEP_MS,
				CONE_W: CONE.FRAMES[0].rows[0].length,
				CONE_H: CONE.FRAMES[0].rows.length,
				CONE_SOURCE: CONE.SOURCE,
				// ★★丘の障害物（岩）。2026-08-15、島さんの指定で新設
				ROCK_ON: ROCK_ON, ROCK_GAP_MIN: ROCK_GAP_MIN, ROCK_GAP_MAX: ROCK_GAP_MAX,
				ROCK_W: ROCK_W, ROCK_H: ROCK.FRAMES[0].rows.length,
				ROCK_SOURCE: ROCK.SOURCE,
				// ★★障害物の絵ぜんぶ（★テストが「黒で縁取られているか」を見張る）
				OBSTACLE_ARTS: [
					{ name: "コーン", art: CONE }, { name: "岩", art: ROCK }
				],
				// ★技は数字ではなく「島さんが描いた動き」。テストもここから読む
				POSES: POSES.map(function (P) {
					return {
						name: P.name, label: P.label, how: P.how, idle: P.idle, x0: P.x0,
						count: P.art.COUNT, feetRow: P.art.FEET_ROW,
						source: P.art.SOURCE,
						ms: P.ms, totalMs: FR.totalMs(P.ms), lifts: P.lifts,
					// ★★2026-08-15: 3技に「意味」を持たせるための2つの数（→ js/frames.js）
					//   airMs    … ★本当に足が浮いている時間（＝越えられる幅のもと）
					//   clearDots… ★越えられる幅（ドット）。**表と速さから毎回計算する**
					//               ★直書きしないこと（島さんがコマを速くしたら幅も追従する）
					airMs: FR.airMs(P.ms, P.lifts),
					// ★★いま実際に越えられる幅（★アップグレードが乗ったあと）
					clearDots: curClearDots(P.name)
					};
				}),
				PUSH_EVERY_MIN: PUSH_EVERY_MIN, PUSH_EVERY_MAX: PUSH_EVERY_MAX,
				PUSH_AFTER_TRICK: PUSH_AFTER_TRICK
			};
		}
	};
})(typeof window !== "undefined" ? window : globalThis);
