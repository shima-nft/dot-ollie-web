// The shop uses the game's original pixel lettering and sprite sheets.
// Only visible shop canvases animate, at 24fps; no timer survives closing.
(function (global) {
  "use strict";
  var game, dialog, grid, wallet, tabs, trailHint, cards = [], group = "upg", raf = 0, last = 0, ask = null, rebornOpen = false;
  var previousFocus, cache = new Map(), reduced = matchMedia("(prefers-reduced-motion: reduce)");
  var F = global.DotFont, P = global.DotPalette.COLORS;
  var help = {
    speed: "最高速が上がり、遠くへ速く進める。", stamina: "体力の上限が増え、より多くの衝突に耐えられる。", coin: "障害物・コイン・レールからの収入が増える。", rail: "レールを滑って得るコインが増える。",
    railpass: "旅にレールが現れ、上を滑れるようになる。", drink: "MAXドリンク1本で回復できる体力が増える。",
    wheels: "加速が速くなり、ぶつかった後も速度を保ちやすい。", shoes: "空中でもう一度ジャンプできる。転生後も使える。", light: "夜道を広く照らす。速く走るほど前方が見やすい。", live: "走りを配信し、視聴者から投げ銭をもらえる。",
    magnet: "遠くのコインまで引き寄せられる。", recover: "無傷で走ると体力が回復。強化で回復が早まる。",
    kickflip: "レールを滑って覚える、デッキを回す技。", pop: "レールを半分滑り、跳び出すと覚えられる技。", maxdrink: "体力が0になると自動で回復する、使い切りの1本。"
  };
  function textCanvas(text, color) {
    var c = document.createElement("canvas");
    c.width = Math.max(1, F.textWidth(text.length)); c.height = F.GLYPH_H;
    F.drawText(c.getContext("2d"), text, 0, 0, color || P[16]);
    c.style.width = c.width * 2 + "px"; c.setAttribute("aria-hidden", "true");
    return c;
  }
  function button(label, action, className) {
    var b = document.createElement("button"); b.type = "button"; b.className = className || "shop-control";
    b.setAttribute("aria-label", label); b.appendChild(textCanvas(label));
    var armed = false, cancelled = false, bounds, pointer, startX, startY;
    var slop = className === "shop-product" ? 0 : 8;
    function inside(e) { return bounds && e.clientX >= bounds.left-slop && e.clientX < bounds.right+slop && e.clientY >= bounds.top-slop && e.clientY < bounds.bottom+slop; }
    b.addEventListener("pointerdown", function (e) {
      if (e.isPrimary === false || e.button !== 0) return;
      bounds=b.getBoundingClientRect();pointer=e.pointerId;startX=e.clientX;startY=e.clientY;
      armed = true; cancelled = false;b.classList.add("pressed"); b.setPointerCapture(e.pointerId);
    });
    b.addEventListener("pointermove", function (e) {
      if (!armed || e.pointerId!==pointer) return;
      if (!inside(e) || (className === "shop-product" && Math.hypot(e.clientX-startX,e.clientY-startY)>10)) {
        cancelled = true; b.classList.remove("pressed");
      }
    });
    b.addEventListener("pointercancel", function () { armed = false; cancelled = true; b.classList.remove("pressed"); });
    b.addEventListener("pointerup", function (e) {
      if(e.pointerId!==pointer)return;
      var valid=armed&&!cancelled&&inside(e);armed=false;b.classList.remove("pressed");
      if(valid)action();
    });
    b.addEventListener("click", function (e) {
      // Native keyboard / assistive activation has no pointer release. Pointer clicks were handled above.
      if(e.detail===0)action();
    });
    return b;
  }
  function init() {
    if (dialog) return;
    dialog = document.createElement("dialog"); dialog.id = "pixel-shop";
    dialog.setAttribute("aria-label", "ショップ");
    var head = document.createElement("header"); head.className = "shop-header";
    var title = document.createElement("div"); title.className = "shop-title";
    title.appendChild(textCanvas("SHOP", P[19]));
    wallet = document.createElement("div"); wallet.className = "shop-wallet";
    var close = button("CLOSE", function () { game.toggleShop(); });
    close.setAttribute("aria-label", "ショップを閉じる");
    head.append(title, wallet, close);
    tabs = document.createElement("nav"); tabs.className = "shop-tabs"; tabs.setAttribute("aria-label", "商品カテゴリ");
    ["UPGRADES", "GEAR"].forEach(function (name, i) {
      var b = button(name, function () { group = i === 0 ? "upg" : "gear"; build(); });
      b.dataset.group = i === 0 ? "upg" : "gear"; tabs.appendChild(b);
    });
    grid = document.createElement("div"); grid.className = "shop-grid";
    grid.addEventListener("scroll", function () { if (reduced.matches) render(performance.now()); }, {passive:true});
    trailHint = document.createElement("p"); trailHint.className = "shop-next";
    trailHint.setAttribute("aria-live", "polite");
    dialog.append(head, tabs, trailHint, grid); document.body.appendChild(dialog);
    dialog.addEventListener("cancel", function (e) { e.preventDefault(); game.toggleShop(); });
    // Native dialog supplies inert background and Tab focus containment.
    ["keydown", "keyup"].forEach(function (type) {
      document.addEventListener(type, function (e) {
        if (!dialog.open) return;
        e.stopImmediatePropagation();
        if (e.key === "Escape") { e.preventDefault(); if (type === "keydown") {
          if (ask) { closeAsk(); game.prestigeAnswer(1); } else game.toggleShop();
        } }
      }, true);
    });
    document.addEventListener("visibilitychange", schedule);
    reduced.addEventListener("change", schedule);
  }
  function sprite(art, index) {
    if (!art || !art.FRAMES || !art.FRAMES.length) return null;
    var frame = art.FRAMES[index % art.FRAMES.length];
    if (!cache.has(frame)) {
      var c = document.createElement("canvas"); c.width = frame.rows[0].length; c.height = frame.rows.length;
      var ctx = c.getContext("2d");
      frame.rows.forEach(function (row, y) {
        for (var x = 0; x < row.length; x++) if (row[x] !== ".") {
          ctx.fillStyle = P[global.DotPalette.indexOfChar(row[x])]; ctx.fillRect(x, y, 1, 1);
        }
      });
      cache.set(frame, c);
    }
    return cache.get(frame);
  }
  function paint(card, seconds) {
    if (card.id === "prestige") return;
    var c = card.ctx, id = card.row.id, lv = card.row.lv || 0;
    var w = 128, h = 52, p = (seconds % 3.6) / 3.6;
    c.clearRect(0, 0, w, h); c.imageSmoothingEnabled = false;
    c.fillStyle = P[10]; c.fillRect(0, 0, w, h);
    if(id === "rail") {
      // Deck underside: two baseplates, hangers, axles and four wheels. Static.
      c.fillStyle=P[5];c.fillRect(17,15,94,22);c.fillRect(12,20,104,12);
      c.fillStyle=P[22];c.fillRect(20,17,88,18);c.fillRect(15,21,98,10);
      c.fillStyle=P[10];c.fillRect(55,20,18,12);
      [37,89].forEach(function(x){
        c.fillStyle=P[15];c.fillRect(x-5,19,10,14);
        c.fillStyle=P[7];c.fillRect(x-2,10,4,32);c.fillRect(x-7,23,14,6);
        c.fillStyle=P[16];c.fillRect(x-1,16,2,20);c.fillRect(x-4,24,8,2);
        c.fillStyle=P[19];c.fillRect(x-5,7,10,9);c.fillRect(x-5,36,10,9);
        c.fillStyle=P[5];c.fillRect(x-1,10,2,4);c.fillRect(x-1,38,2,4);
      });
      return;
    }
    if(id === "stamina") {
      c.fillStyle=P[5];c.fillRect(20,21,68,10);
      for(var cell=0;cell<6;cell++){c.fillStyle=P[20];c.fillRect(22+cell*11,23,9,6);}
      c.fillStyle=P[20];c.fillRect(99,21,3,11);c.fillRect(95,25,11,3);
      return;
    }
    if(id === "maxdrink") {
      var restored=p>=.42, recovery=game._drinkRecovery();
      var bottle=sprite(global.DotPartsArt.MAXdrink,0);
      if(bottle&&!restored)c.drawImage(bottle,23-bottle.width,26-bottle.height,bottle.width*2,bottle.height*2);
      c.fillStyle=P[5];c.fillRect(48,24,60,9);
      if(restored){c.fillStyle=P[20];c.fillRect(50,26,Math.round(56*Math.min(1,recovery/game._curStaminaMax())),5);}
      F.drawText(c,restored?"+"+Math.min(recovery,game._curStaminaMax())+"HP":"0HP",49,10,P[restored?20:16]);
      return;
    }
    c.fillStyle = P[22]; c.fillRect(0, 42, w, 1);
    var pace = id === "speed" || id === "wheels" ? 1.4 + Math.min(lv, 15) * 0.08 : 1;
    c.fillStyle = P[5];
    for (var x = 0; x < 5; x++) c.fillRect(Math.floor((x * 31 - seconds * 22 * pace % 31 + 128) % 128), 47, 9, 1);
    var art = global.DotPushArt, frame = Math.floor(seconds * 5 * pace), riderY = 42;
    if (id === "kickflip" || id === "pop" || id === "shoes") {
      art = id === "kickflip" ? global.DotKickflipArt : id === "shoes" ? global.DotOllieArt : global.DotPopArt;
      if (!art) art = global.DotPopArt;
      frame = Math.floor(p * art.FRAMES.length);
      riderY -= Math.round(Math.abs(Math.sin(p * Math.PI * (id === "shoes" ? 2 : 1))) * 10);
    }
    var rider = sprite(art, frame) || sprite(global.DotStandbyArt, 0);
    if (id!=="railpass" && rider) c.drawImage(rider, 32, riderY - rider.height);
    var coin = sprite(global.DotPartsArt.coin, 0);
    function drawCoin(x, y) {
      if (coin) c.drawImage(coin, Math.round(x), Math.round(y));
      else { c.fillStyle = P[19]; c.fillRect(Math.round(x), Math.round(y), 3, 5); }
    }
    if (id === "live") {
      F.drawText(c, "LIVE", 72, 9, P[16]);
      F.drawText(c, "100→1K", 72, 24, P[19]);
      c.fillStyle=P[25];c.fillRect(65,11,2,2);
    } else if (id === "light") {
      var dy=9-Math.min(7,Math.max(0,lv-1))+Math.round(Math.sin(seconds*1.6)), aim=46+Math.sin(seconds*.8)*5;
      var coneH=42-dy-5;
      c.globalCompositeOperation="lighter";c.globalAlpha=.28;c.fillStyle="#b3c9b4";
      for(var band=0;band<coneH;band+=2){var t=band/coneH,wide=2+t*(40+4*Math.max(0,lv-1));c.fillRect(Math.round(25+(aim-25)*t-wide/2),dy+5+band,Math.round(wide),Math.min(2,coneH-band));}
      c.globalAlpha=1;c.globalCompositeOperation="source-over";
      c.fillStyle=P[15];c.fillRect(21,dy+2,7,3);c.fillRect(18,dy,5,1);c.fillRect(27,dy,5,1);
    } else if (id === "railpass") {
      c.fillStyle=P[15];c.fillRect(14,33,100,2);c.fillRect(22,35,3,7);c.fillRect(105,35,3,7);
      var grind=sprite(global.DotGrindArt,0),gx=24+Math.floor(p*58);
      if(grind)c.drawImage(grind,gx,34-(global.DotGrindArt.FEET_ROW-global.DotGrindArt.FRAMES[0].y));
      c.fillStyle=P[19];c.fillRect(gx-3,34,2,1);c.fillRect(gx-7,36,1,1);
      F.drawText(c,"→",96,17,P[16]);
    } else if (id === "magnet") {
      var radius = global.DotUpgrades.magnetRadius(Math.max(1, lv));
      var reach = 28 + radius * 0.35;
      var pull = Math.max(0, Math.min(1, (p - 0.25) / 0.55)); pull = pull * pull;
      c.fillStyle = P[4];
      for (var a = -3; a <= 3; a++) {
        var angle = a * 0.35;
        c.fillRect(Math.round(43 + Math.cos(angle) * reach), Math.round(30 + Math.sin(angle) * reach * 0.6), 1, 1);
      }
      if (pull < 1) for (var k = 0; k < 3; k++) {
        var sx = 65 + reach * 0.5 + k * 7, sy = 9 + k * 9;
        drawCoin(sx + (43 - sx) * pull, sy + (34 - sy) * pull);
      }
      else { c.fillStyle = P[19]; c.fillRect(42, 19, 1, 5); c.fillRect(40, 21, 5, 1); }
    } else if (id === "drink") {
      var bottle = sprite(global.DotPartsArt.MAXdrink, 0);
      if (bottle) c.drawImage(bottle, 72, 25);
      F.drawText(c, "+" + (5+lv) + "HP", 72, 10, P[20]);
    } else if (id === "recover") {
      var completion = 0.3 + global.DotUpgrades.recoverDistance(Math.max(1, lv)) / 360;
      var full = p >= completion, amount = full ? 3 : 2, flash = full && (p-completion)*3.6 < .45;
      // Same arrangement as the running HUD: recharge above, discrete HP blocks below.
      var bx=64, by=24, A=global.DotBarArt;
      c.fillStyle=P[5];c.fillRect(bx+8,by-4,48,2);
      c.fillStyle=P[flash?16:4];c.fillRect(bx+8,by-4,flash?48:full?0:Math.floor(48*p/completion),2);
      c.fillRect(bx+2,by-4,5,1);c.fillRect(bx+4,by-6,1,5);
      if(A)for(var ay=0;ay<A.H;ay++)for(var ax=0;ax<56;ax++){
        var ch=A.rows[ay].charAt(ax);if(!ch||ch===".")continue;
        var block=Math.floor((ax-A.FILL_X0)/A.BLOCK_PITCH);
        c.fillStyle=ch===A.FILL_CHAR?P[block<amount?game._barColorFor(amount/A.BLOCK_N):5]:P[global.DotPalette.indexOfChar(ch)];
        c.fillRect(bx+ax,by+ay,1,1);
      }
    } else if (id === "coin") {
      var cone = sprite(global.DotConeArt, 0);
      if (cone) c.drawImage(cone, 88, 42 - cone.height);
      drawCoin(83, 9);
      F.drawText(c, "+" + game._shortNum(Math.floor(game._curCoinPer()) * game.getBoostView().multiplier), 88, 10, P[19]);
    } else if (id === "speed" || id === "wheels") {
      c.fillStyle = P[8];
      for (var line = 0; line < 3; line++) c.fillRect(13 + line * 3, 20 + line * 6, 9, 1);
      F.drawText(c, "→", 87, 24, P[8]);
    }
  }
  function updateCard(card) {
    var r = card.row;
    if (r.kind === "prestige") {
      card.summary.replaceChildren(prestigeSummary(true));
      card.button.setAttribute("aria-label", "転生の詳細" + (rebornOpen ? "を閉じる" : "を開く"));
      card.button.setAttribute("aria-expanded", String(rebornOpen));
      card.details.hidden=!rebornOpen;
      card.indicator.textContent=rebornOpen?"−":"＋";
      card.confirm.disabled=!r.enabled;
      card.confirm.setAttribute("aria-label",r.enabled?"転生内容を最終確認":"強化をMAXにすると転生できます");
      return;
    }
    if (card.help) card.help.textContent = help[r.id] || "";
    // ★★★★★行が自分で文字を持っていれば、それをそのまま出す（2026-09-12）
    //   ★転生の行がこれを使います。★★こうしておかないと、
    //   ★★★新しい種類の行を足すたびに**ここを直す**ことになります。
    var state = r.state !== undefined ? r.state : r.kind === "unlock" && !r.got ? r.hint : r.kind === "item" && r.usedUp && !r.have ? "USED" : r.kind === "upg" && r.max !== null && r.lv >= r.max ? "MAX" : r.got ? "OWNED" : (r.kind === "item" && r.have >= r.maxHave ? "FULL" : game._shortNum(r.cost));
    if ((r.id === "shoes" || r.id === "railpass") && r.lv) state = "OWNED";
    card.price.replaceChildren(textCanvas(state, r.enabled ? P[19] : P[7]));
    card.level.replaceChildren(textCanvas(r.id === "shoes" && r.lv ? "×2" : r.kind === "upg" ? "LV" + r.lv : "", P[7]));
    card.button.setAttribute("aria-disabled", String(!r.enabled));
    card.button.setAttribute("aria-label", r.name + "。" + (help[r.id] || "") + "。" + (r.kind === "upg" ? "レベル" + r.lv + "。" : "") + state + (r.enabled ? "コインで購入" : "。購入不可"));
  }
  function refresh() {
    var view = game.shopView();
    tabs.hidden = !view.rows.some(isGear);
    updateTabNotices(view.rows);
    trailHint.textContent = view.next ? "次のアンロック · " + view.next.text : "";
    trailHint.hidden = !view.next;
    wallet.replaceChildren(textCanvas("COIN " + game._shortNum(view.coins), P[19]));
    wallet.setAttribute("aria-label", "所持コイン " + view.coins);
    cards.forEach(function (card) {
      card.row = view.rows.find(function (r) { return (r.id || r.kind) === card.id; }); if (card.row) updateCard(card);
    });
  }
  // ★★★★★転生（REBORN）は**1 ページ目**に出す（2026-09-12 島さんの指定）。
  //   ★前は `kind !== "upg"` だったので、★★**2 ページ目（GEAR）に落ちていました**
  function isGear(r) { return r.group === "gear" || (r.kind !== "upg" && r.kind !== "prestige"); }
  function updateTabNotices(rows) {
    Array.from(tabs.children).forEach(function(b) {
      b.classList.toggle("has-new", rows.some(function(r) { return r.fresh && (isGear(r) ? "gear" : "upg") === b.dataset.group; }));
    });
  }
  function inGroup(r) { return group === "gear" ? isGear(r) : !isGear(r); }
  // ★★いま並んでいるパネルの面々（★**行そのものが増えたか**を見るため）
  function rowKeys() {
    return game.shopView().rows.map(function (r) { return r.id || r.kind; }).join(",");
  }
  // ============================================================
  // ★★★★★一段はさむ問いかけ（2026-09-12 島さんの指定）
  // ============================================================
  //   > 島さん「重要な選択なので押し間違いを防ぐためにも一段選択肢をはさみましょう。」
  //   ★★**決めるのはゲーム本体（`prestigeAnswer`）だけ**。
  //     ★ここは**聞くだけ**なので、★★★液晶のお店と答えがずれません
  function prose(text, className) {
    var p = document.createElement("p"); p.className = className || ""; p.textContent = text; return p;
  }
  // ★★★★★2026-09-15 島さんの指定: ブースト（5分×5）と初転生の特典は**サプライズなので書かない**。
  //   ★読む順 = 何が起きるか → ①伸びる上限 → ②0に戻るもの → ③残るもの → 戻れない
  function prestigeSummary() {
    var view = game.shopView();
    var section = document.createElement("div"); section.className = "reborn-summary";
    section.appendChild(prose("同じ世界の0mから、もう一度育て直します。そのかわり、MAXにした強化の上限が永久に伸びます。", "reborn-lead"));
    section.appendChild(prose("① 伸びる上限", "reborn-label"));
    if (!view.prestige.length) section.appendChild(prose("強化を1項目MAXにすると転生できます。", "reborn-note"));
    view.prestige.forEach(function (p) {
      var line = document.createElement("div"); line.className = "reborn-gain";
      line.append(textCanvas(p.name, P[16]), textCanvas(p.before + " → " + p.after, P[20]));
      line.setAttribute("aria-label", p.name + "の上限が" + p.before + "から" + p.after);
      section.appendChild(line);
    });
    var reset = document.createElement("div"); reset.className = "reborn-reset";
    reset.appendChild(prose("② 0に戻るもの", "reborn-label"));
    reset.appendChild(prose("所持コイン・強化のレベル・道具"));
    section.appendChild(reset);
    var keep = document.createElement("div"); keep.className = "reborn-keep";
    keep.appendChild(prose("③ 残るもの", "reborn-label"));
    keep.appendChild(prose("開放したパネル・買った二段ジャンプ・BEST・覚えた技・発見と釣りの記録"));
    section.appendChild(keep);
    section.appendChild(prose("転生すると、今の旅には戻れません。", "reborn-note"));
    return section;
  }
  function closeAsk() {
    if (!ask) return;
    ask.remove(); ask = null;
    [grid, tabs, wallet.parentNode, trailHint].forEach(function (node) { node.inert = false; });
    var origin = grid.querySelector('[data-item="prestige"]'); if (origin) origin.focus({preventScroll:true});
  }
  function askReborn() {
    closeAsk();
    ask = document.createElement("div"); ask.className = "shop-ask";
    ask.setAttribute("role", "alertdialog");
    var box = document.createElement("div"); box.className = "shop-ask-box";
    var word = game._consts().PRESTIGE_ASK_TEXT;
    ask.setAttribute("aria-label", "転生して、次の旅へ出発しますか？");
    ask.setAttribute("aria-modal", "true");
    box.appendChild(textCanvas(word, P[29]));
    box.appendChild(prose("上限を伸ばして、次の旅へ", "reborn-heading"));
    var summary = prestigeSummary(true); summary.id = "reborn-details";
    ask.setAttribute("aria-describedby", summary.id); box.appendChild(summary);
    var row = document.createElement("div"); row.className = "shop-ask-btns";
    var yes = button("REBORN", function () { closeAsk(); game.prestigeAnswer(0); });
    var no = button("BACK", function () { closeAsk(); game.prestigeAnswer(1); refresh(); schedule(); });
    yes.appendChild(prose("転生して出発")); no.appendChild(prose("旅を続ける"));
    yes.setAttribute("aria-label", "転生して出発"); no.setAttribute("aria-label", "旅を続ける");
    row.append(no, yes);
    box.appendChild(row); ask.appendChild(box); dialog.appendChild(ask);
    [grid, tabs, wallet.parentNode, trailHint].forEach(function (node) { node.inert = true; });
    no.focus({ preventScroll: true });
    // A touch-generated click can move focus after pointerup made the source inert.
    var currentAsk=ask;
    requestAnimationFrame(function(){if(ask===currentAsk&&!ask.contains(document.activeElement))no.focus({preventScroll:true});});
  }
  function build() {
    var focusId = document.activeElement && document.activeElement.dataset.item;
    closeAsk();
    cards = []; grid.replaceChildren(); grid.classList.toggle("gear", group === "gear");
    Array.from(tabs.children).forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.group === group)); });
    var keys = rowKeys();
    grid.classList.toggle("reborn", keys.indexOf("prestige") >= 0);
    game.shopView().rows.filter(inGroup).sort(function(a,b){return (a.kind==="prestige")-(b.kind==="prestige");}).forEach(function (r) {
      var card = { id: r.id || r.kind, row: r };
      var b = button(r.name, function () {
        if(card.id==="prestige") {
          rebornOpen=!rebornOpen;updateCard(card);
          // ★★★★★2026-09-15 島さんの指摘「開いたかどうか下へスクロールしないとわからない」
          //   ★開いたら、パネルの見出しを一覧のいちばん上へ運ぶ（★中身がその下に見える）
          if(rebornOpen) requestAnimationFrame(function(){
            var still=global.matchMedia&&global.matchMedia("(prefers-reduced-motion: reduce)").matches;
            b.scrollIntoView({block:"start",behavior:still?"auto":"smooth"});
          });
          return;
        }
        if (!card.row.enabled) return;
        if (!game.buyShop(card.id)) return;
        // ★★★★★転生はここでは進みません（★一段はさむ問いかけへ）
        if (game.prestigeAsking()) { askReborn(); return; }
        card.flashUntil = performance.now() + 300; b.classList.add("bought");
        // ★★買った結果**行そのものが増えた**ときは、並べ直します。
        //   ★★★REBORN のパネルは **MAX に届いた瞬間に生まれる**ので、
        //   ★`refresh()` だけだと**お店を開き直すまで出てこない**
        if (rowKeys() !== keys) { build(); return; }
        refresh(); schedule();
      }, "shop-product");
      b.dataset.item = card.id;
      // ★★★★★グリッチが終わったら印を外す（2026-09-13）。★iPhone で、演出のあと LV と値段が描き直されず消えていた
      b.addEventListener("animationend", function () { b.classList.remove("glitch-in"); });
      // ★★★★★生まれたてのパネルは、グリッチしながら現れる（★島さんの指定）。
      //   ★長さを決めているのは `js/ollie.js` の `PRESTIGE_GLITCH_MS` **1 か所**だけです
      var glitchMs = (card.id === "prestige") ? game.prestigeGlitchMs() : 0;
      if (glitchMs > 0) {
        b.classList.add("glitch-in");
        b.style.setProperty("--glitch-ms", Math.round(glitchMs) + "ms");
      }
      var name = document.createElement("div"); name.className = "shop-product-name";
      name.appendChild(b.firstChild); b.appendChild(name);
      if (r.kind === "prestige") {
        name.appendChild(prose("転生", "reborn-heading"));
        card.indicator=prose("＋","reborn-indicator");b.appendChild(card.indicator);
        card.details=document.createElement("div");card.details.className="reborn-inline";card.details.id="shop-reborn-details";
        card.summary=document.createElement("div");card.details.appendChild(card.summary);
        card.confirm=button("REBORN",function(){if(card.row.enabled&&game.buyShop("prestige"))askReborn();});
        card.confirm.appendChild(prose("転生内容を確認"));card.details.appendChild(card.confirm);
        b.setAttribute("aria-controls",card.details.id);
        card.button = b; cards.push(card); grid.append(b,card.details); return;
      }
      var demo = document.createElement("canvas"); demo.width = 128; demo.height = 52;
      demo.className = "shop-demo"; demo.setAttribute("aria-hidden", "true"); b.appendChild(demo);
      card.help = prose(help[r.id] || "", "shop-product-help"); b.appendChild(card.help);
      var meta = document.createElement("div"); meta.className = "shop-product-meta";
      card.level = document.createElement("span"); card.price = document.createElement("span");
      meta.append(card.level, card.price); b.appendChild(meta);
      card.button = b; card.ctx = demo.getContext("2d", { alpha: false });
      cards.push(card); grid.appendChild(b);
    });
    refresh(); render(performance.now());
    if (focusId) { var focused = cards.find(function (c) { return c.id === focusId; }); if (focused) focused.button.focus({preventScroll:true}); }
  }
  function render(time) {
    var viewport = grid.getBoundingClientRect(), revealed = false;
    cards.forEach(function (card) {
      var rect=card.button.getBoundingClientRect(),visible=dialog.open&&rect.bottom>viewport.top&&rect.top<viewport.bottom;
      if (!card.revealed && card.id !== "prestige" && dialog.open) {
        if (visible) {
          var ms = game.panelRevealMs(card.id); card.revealed = true;
          if (ms > 0) {
            revealed = true;
            card.button.style.setProperty("--glitch-ms", Math.round(ms) + "ms");
            card.button.classList.add("glitch-in");
          }
        }
      }
      if(visible && (!card.staticPainted || (card.id!=="rail"&&card.id!=="stamina"))) {
        paint(card, reduced.matches ? 2.7 : time / 1000);card.staticPainted=true;
      }
      if (card.flashUntil && time >= card.flashUntil) { card.button.classList.remove("bought"); card.flashUntil = 0; }
    });
    if (revealed) updateTabNotices(game.shopView().rows);
  }
  function loop(time) {
    raf = 0;
    if (!dialog.open || document.hidden) return;
    if (time - last >= 1000 / 24) { last = time; render(time); }
    if (!reduced.matches || cards.some(function (c) { return c.flashUntil; })) raf = requestAnimationFrame(loop);
  }
  function schedule() {
    cancelAnimationFrame(raf); raf = 0;
    if (dialog && dialog.open && !document.hidden) { render(performance.now()); raf = requestAnimationFrame(loop); }
  }
  global.DotShop = {
    isOpen: function () { return !!(dialog && dialog.open); },
    open: function (g) {
      init(); game = g; group = "upg"; rebornOpen=false;previousFocus = document.activeElement;
      build(); dialog.showModal(); schedule();
    },
    close: function () {
      closeAsk();
      cancelAnimationFrame(raf); raf = 0;
      if (dialog && dialog.open) { dialog.close(); if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true }); }
      cards = [];
    }
  };
})(window);
