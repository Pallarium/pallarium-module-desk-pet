/* Desk Pet — PVP Battle Arena.
   Pokemon-style turn combat, fought on screen: the two sprites charge, lunge,
   get knocked back, flash on hit, pop damage numbers and faint.
   window.__deskPetBattle.start(playerSpecies, rivalSpecies, onEnd) */
(function () {
  var GLYPH = { cat: "🐱", dog: "🐶", dino: "🦖" };
  var NAME  = { cat: "Cat", dog: "Dog", dino: "Dino" };
  var BEATS = { cat: "dino", dino: "dog", dog: "cat" };   // cat > dino > dog > cat

  var SPECIES = {
    cat: {
      hp: 108, atk: 28, def: 18, spd: 32, tint: "",
      moves: [
        { name: "Pounce",       glyph: "🐾", power: 34, acc: 1.0,  fx: "lunge",  desc: "A clean leaping strike." },
        { name: "Scratch Fury", glyph: "✴️", power: 15, acc: 0.9,  hits: 2, fx: "flurry", desc: "Hits twice in a blur." },
        { name: "Hiss",         glyph: "💢", power: 0,  acc: 1.0,  debuff: 6, fx: "shout", desc: "Lowers rival attack." },
        { name: "Nine Lives",   glyph: "💚", power: 0,  acc: 1.0,  heal: 30, fx: "heal",  desc: "Recovers 30 HP." },
      ],
    },
    dog: {
      hp: 128, atk: 26, def: 23, spd: 24, tint: "",
      moves: [
        { name: "Tackle",   glyph: "💥", power: 32, acc: 1.0,  fx: "lunge", desc: "A solid body slam." },
        { name: "Chomp",    glyph: "🦷", power: 46, acc: 0.72, fx: "lunge", desc: "Big damage, often misses." },
        { name: "Bark",     glyph: "📣", power: 12, acc: 1.0,  stun: 0.45, fx: "shout", desc: "May stun the rival." },
        { name: "Good Boy", glyph: "💚", power: 0,  acc: 1.0,  heal: 28, buff: 5, fx: "heal", desc: "Heals and pumps up." },
      ],
    },
    dino: {
      hp: 146, atk: 34, def: 15, spd: 17, tint: "",
      moves: [
        { name: "Rawr Blast",  glyph: "🔊", power: 38, acc: 0.95, fx: "shout", desc: "A shockwave roar." },
        { name: "Tail Swipe",  glyph: "🌀", power: 28, acc: 1.0,  stun: 0.28, fx: "lunge", desc: "Can knock them flat." },
        { name: "Stomp",       glyph: "🦶", power: 52, acc: 0.65, fx: "slam",  desc: "Earth-shaking, risky." },
        { name: "Primal Rest", glyph: "💚", power: 0,  acc: 1.0,  heal: 26, fx: "heal", desc: "Recovers 26 HP." },
      ],
    },
  };

  var root = null, state = null, raf = 0;

  function sheets(sp) {
    return sp === "dog" ? window.__deskPetDog
         : sp === "dino" ? window.__deskPetDino
         : window.__deskPetCat;
  }

  function mult(a, b) {
    if (BEATS[a] === b) return 1.5;
    if (BEATS[b] === a) return 0.7;
    return 1;
  }

  function makeFighter(sp, isPlayer, homeX) {
    var s = SPECIES[sp];
    return {
      sp: sp, name: NAME[sp], glyph: GLYPH[sp], isPlayer: isPlayer,
      hp: s.hp, max: s.hp, atk: s.atk, def: s.def, spd: s.spd,
      moves: s.moves, stunned: false, atkMod: 0,
      homeX: homeX, x: homeX, y: 0, dir: isPlayer ? 1 : -1,
      anim: "idle", animT: 0, flash: 0, shakeT: 0, fainted: false, rot: 0,
      frame: 0, frameT: 0,
    };
  }

  function damage(src, dst, move) {
    var base = move.power * ((src.atk + src.atkMod) / 25) * (26 / (26 + dst.def));
    var m = mult(src.sp, dst.sp);
    var crit = Math.random() < 0.11 ? 1.8 : 1;
    var roll = 0.86 + Math.random() * 0.14;
    return { dmg: Math.max(1, Math.round(base * m * crit * roll)), crit: crit > 1, eff: m };
  }

  /* ---------------- dom ---------------- */
  function el(tag, css, text) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  }

  var AW = 560, AH = 230, GROUND = 186;

  function build() {
    root = el("div",
      "position:fixed;inset:0;z-index:2147483640;display:flex;align-items:center;justify-content:center;" +
      "background:rgba(4,5,10,.78);backdrop-filter:blur(7px);" +
      "font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#e6e9f7;");

    var panel = el("div",
      "width:min(600px,94vw);border-radius:18px;padding:16px;" +
      "background:linear-gradient(180deg,#12141d,#0b0c12);border:1px solid rgba(120,140,255,.26);" +
      "box-shadow:0 30px 80px rgba(0,0,0,.72);");
    root.appendChild(panel);

    var head = el("div", "display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;");
    head.appendChild(el("div", "font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#7ee7ff;font-weight:700;", "PVP Battle"));
    var close = el("div", "cursor:pointer;color:#7d86a8;font-size:16px;padding:2px 6px;", "✕");
    close.addEventListener("click", end);
    head.appendChild(close);
    panel.appendChild(head);

    /* hp bars above the arena */
    var bars = el("div", "display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;margin-bottom:8px;");
    state.ui.you = barCard(state.you, false);
    state.ui.foe = barCard(state.foe, true);
    bars.appendChild(state.ui.you.wrap);
    bars.appendChild(el("div", "font-size:17px;color:#5a6488;font-weight:800;", "VS"));
    bars.appendChild(state.ui.foe.wrap);
    panel.appendChild(bars);

    /* the arena itself */
    var stage = el("div", "position:relative;border-radius:12px;overflow:hidden;margin-bottom:10px;" +
      "border:1px solid rgba(255,255,255,.07);background:linear-gradient(180deg,#0d1020,#161a2c 62%,#0a0c15);");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cv = document.createElement("canvas");
    cv.width = AW * dpr; cv.height = AH * dpr;
    cv.style.cssText = "display:block;width:100%;height:auto;";
    cv.getContext("2d").scale(dpr, dpr);
    stage.appendChild(cv);
    panel.appendChild(stage);
    state.ui.cv = cv;
    state.ui.ctx = cv.getContext("2d");

    state.ui.log = el("div",
      "height:60px;overflow-y:auto;padding:8px 10px;border-radius:10px;margin-bottom:10px;" +
      "background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.06);font-size:12.5px;color:#b9c0da;");
    panel.appendChild(state.ui.log);

    state.ui.moves = el("div", "display:grid;grid-template-columns:1fr 1fr;gap:8px;");
    panel.appendChild(state.ui.moves);

    state.ui.footer = el("div", "margin-top:10px;display:none;gap:8px;");
    panel.appendChild(state.ui.footer);

    document.body.appendChild(root);
    renderMoves();
  }

  function barCard(f, right) {
    var wrap = el("div", "display:flex;flex-direction:column;gap:5px;" + (right ? "align-items:flex-end;text-align:right;" : ""));
    var top = el("div", "display:flex;align-items:baseline;gap:7px;" + (right ? "flex-direction:row-reverse;" : ""));
    top.appendChild(el("div", "font-weight:700;font-size:13px;color:#eef1ff;", f.glyph + " " + f.name + (f.isPlayer ? " (you)" : "")));
    var hpText = el("div", "font-size:11px;color:#8b93b5;", f.hp + " / " + f.max);
    top.appendChild(hpText);
    var barWrap = el("div", "width:100%;height:8px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;");
    var bar = el("div", "height:100%;width:100%;background:linear-gradient(90deg,#3ce88f,#7ee7ff);transition:width .3s ease;");
    barWrap.appendChild(bar);
    wrap.appendChild(top); wrap.appendChild(barWrap);
    return { wrap: wrap, bar: bar, hpText: hpText };
  }

  function refresh(f, ui) {
    var pct = Math.max(0, f.hp / f.max);
    ui.bar.style.width = (pct * 100).toFixed(1) + "%";
    ui.bar.style.background = pct > 0.5 ? "linear-gradient(90deg,#3ce88f,#7ee7ff)"
      : pct > 0.22 ? "linear-gradient(90deg,#ffcc4d,#ff9d3d)"
      : "linear-gradient(90deg,#ff5d6c,#ff2d55)";
    ui.hpText.textContent = Math.max(0, f.hp) + " / " + f.max;
  }

  function log(text, color) {
    state.ui.log.appendChild(el("div", "margin:2px 0;" + (color ? "color:" + color + ";font-weight:600;" : ""), text));
    state.ui.log.scrollTop = state.ui.log.scrollHeight;
  }

  function renderMoves() {
    state.ui.moves.innerHTML = "";
    state.you.moves.forEach(function (mv) {
      var b = el("div",
        "padding:8px 11px;border-radius:10px;cursor:pointer;background:rgba(110,135,255,.09);" +
        "border:1px solid rgba(120,140,255,.22);");
      b.appendChild(el("div", "font-weight:700;font-size:13px;color:#eef1ff;", mv.glyph + "  " + mv.name));
      b.appendChild(el("div", "font-size:11px;color:#8b93b5;margin-top:2px;", mv.desc));
      b.addEventListener("mouseenter", function () { b.style.background = "rgba(126,231,255,.16)"; b.style.borderColor = "rgba(126,231,255,.45)"; });
      b.addEventListener("mouseleave", function () { b.style.background = "rgba(110,135,255,.09)"; b.style.borderColor = "rgba(120,140,255,.22)"; });
      b.addEventListener("click", function () { if (!state.busy && !state.over) playerTurn(mv); });
      state.ui.moves.appendChild(b);
    });
  }

  function lockMoves(on) {
    state.ui.moves.style.opacity = on ? "0.4" : "1";
    state.ui.moves.style.pointerEvents = on ? "none" : "auto";
  }

  /* ---------------- floating popups + particles ---------------- */
  function pop(f, text, color, big) {
    state.pops.push({ x: f.x, y: GROUND - 74, vy: -34, t: 1.1, text: text, color: color, size: big ? 22 : 16 });
  }
  function burst(x, y, color, n) {
    for (var i = 0; i < (n || 12); i++) {
      var a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 190;
      state.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 50, t: 0.45 + Math.random() * 0.3, color: color, r: 2 + Math.random() * 3 });
    }
  }

  /* ---------------- animation loop ---------------- */
  function loop(now) {
    var dt = Math.min(0.05, (now - (state.last || now)) / 1000);
    state.last = now;
    state.time = (state.time || 0) + dt;

    [state.you, state.foe].forEach(function (f) {
      f.frameT += dt;
      var fps = f.anim === "run" ? 16 : f.anim === "attack" ? 14 : 8;
      if (f.frameT > 1 / fps) { f.frameT = 0; f.frame++; }
      if (f.flash > 0) f.flash -= dt * 3.2;
      if (f.shakeT > 0) f.shakeT -= dt;
      if (f.fainted) f.rot += (1.35 - f.rot) * dt * 5;
      else f.rot += (0 - f.rot) * dt * 8;
    });

    // movement toward the animation target
    [state.you, state.foe].forEach(function (f) {
      if (f.targetX != null) {
        var d = f.targetX - f.x;
        f.x += d * Math.min(1, dt * 11);
        if (Math.abs(d) < 2) { f.x = f.targetX; f.targetX = null; }
      }
      if (f.hop > 0) { f.hop -= dt * 3.4; f.y = -Math.sin(Math.max(0, f.hop) * Math.PI) * 42; }
      else f.y += (0 - f.y) * dt * 9;
      if (f.knock) { f.x += f.knock * dt * 60; f.knock *= 0.86; if (Math.abs(f.knock) < 0.4) f.knock = 0; }
    });

    for (var i = state.pops.length - 1; i >= 0; i--) {
      var p = state.pops[i];
      p.t -= dt; p.y += p.vy * dt; p.vy += 42 * dt;
      if (p.t <= 0) state.pops.splice(i, 1);
    }
    for (var j = state.parts.length - 1; j >= 0; j--) {
      var q = state.parts[j];
      q.t -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 620 * dt;
      if (q.t <= 0) state.parts.splice(j, 1);
    }
    if (state.shake > 0) state.shake -= dt * 3;

    draw();
    raf = requestAnimationFrame(loop);
  }

  function drawFighter(ctx, f) {
    var sh = sheets(f.sp);
    var key = f.anim === "run" ? "run" : f.anim === "attack" ? "jump" : "idle";
    var d = sh && sh[key] ? sh[key] : null;
    var bx = f.x + (f.shakeT > 0 ? (Math.random() - 0.5) * 9 : 0);
    var by = GROUND + f.y;

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.32 * Math.max(0.35, 1 + f.y / 120);
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(f.x, GROUND + 4, 30 * Math.max(0.4, 1 + f.y / 150), 7, 0, 0, 6.283);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(f.rot * (f.dir > 0 ? 1 : -1));
    ctx.scale(f.dir, 1);
    if (d && d.img.complete && d.img.naturalWidth) {
      var n = d.n, fr = f.frame % n;
      var scale = 1.02, dw = d.fw * scale, dh = d.fh * scale;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(d.img, fr * d.fw, 0, d.fw, d.fh, -dw / 2, -dh, dw, dh);
    } else {
      ctx.font = "56px serif"; ctx.textAlign = "center";
      ctx.fillText(f.glyph, 0, -8);
    }
    ctx.restore();

    if (f.flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.min(0.32, f.flash * 0.32);
      var gr = ctx.createRadialGradient(bx, by - 46, 4, bx, by - 46, 54);
      gr.addColorStop(0, "#ff3b5c");
      gr.addColorStop(1, "rgba(255,59,92,0)");
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.ellipse(bx, by - 46, 48, 58, 0, 0, 6.283);
      ctx.fill();
      ctx.restore();
    }
  }

  function draw() {
    var ctx = state.ui.ctx;
    ctx.save();
    if (state.shake > 0) ctx.translate((Math.random() - 0.5) * 10 * state.shake, (Math.random() - 0.5) * 8 * state.shake);
    ctx.clearRect(-20, -20, AW + 40, AH + 40);

    // arena floor
    var g = ctx.createLinearGradient(0, GROUND - 40, 0, AH);
    g.addColorStop(0, "rgba(126,231,255,.07)");
    g.addColorStop(1, "rgba(10,12,22,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, GROUND - 40, AW, AH - GROUND + 40);
    ctx.strokeStyle = "rgba(126,231,255,.22)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(24, GROUND + 5); ctx.lineTo(AW - 24, GROUND + 5); ctx.stroke();

    // subtle grid
    ctx.strokeStyle = "rgba(255,255,255,.04)";
    ctx.lineWidth = 1;
    for (var x = 20; x < AW; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, GROUND + 5); ctx.lineTo(x - 18, AH); ctx.stroke();
    }

    var order = state.you.x <= state.foe.x ? [state.you, state.foe] : [state.foe, state.you];
    drawFighter(ctx, order[0]);
    drawFighter(ctx, order[1]);

    state.parts.forEach(function (q) {
      ctx.globalAlpha = Math.max(0, q.t * 2);
      ctx.fillStyle = q.color;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 6.283); ctx.fill();
    });
    ctx.globalAlpha = 1;

    state.pops.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.t * 1.6));
      ctx.font = "800 " + p.size + "px system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,.65)";
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* ---------------- animated move execution ---------------- */
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function applyMove(src, dst, move, srcUi, dstUi) {
    if (src.stunned) {
      src.stunned = false;
      pop(src, "STUNNED", "#ffcc4d");
      log(src.name + " is stunned and can't move!", "#ffcc4d");
      return wait(650);
    }

    if (move.heal) {
      src.anim = "idle";
      var before = src.hp;
      src.hp = Math.min(src.max, src.hp + move.heal);
      if (move.buff) src.atkMod += move.buff;
      refresh(src, srcUi);
      src.hop = 1;
      burst(src.x, GROUND - 40, "#3ce88f", 16);
      pop(src, "+" + (src.hp - before), "#3ce88f");
      log(src.name + " used " + move.name + " and recovered " + (src.hp - before) + " HP.", "#3ce88f");
      return wait(760);
    }

    if (move.debuff) {
      dst.atkMod -= move.debuff;
      src.anim = "attack"; src.frame = 0;
      burst(src.x + src.dir * 34, GROUND - 52, "#7ee7ff", 14);
      pop(dst, "ATK ↓", "#7ee7ff");
      log(src.name + " used " + move.name + "! " + dst.name + "'s attack fell.", "#7ee7ff");
      return wait(700).then(function () { src.anim = "idle"; });
    }

    var hit = Math.random() <= move.acc;
    var contact = move.fx !== "shout";

    src.anim = contact ? "run" : "attack";
    src.frame = 0;
    if (contact) src.targetX = dst.x - src.dir * 74;

    return wait(contact ? 330 : 130).then(function () {
      src.anim = "attack"; src.frame = 0;
      if (move.fx === "slam") { src.hop = 1; state.shake = 1.1; }
      if (move.fx === "shout") {
        burst(src.x + src.dir * 40, GROUND - 56, "#c9a6ff", 18);
        state.shake = 0.6;
      }
      return wait(200);
    }).then(function () {
      if (!hit) {
        pop(dst, "MISS", "#8b93b5");
        log(src.name + " used " + move.name + " — but it missed!", "#8b93b5");
        return;
      }
      var hits = move.hits || 1, total = 0, crit = false, eff = 1;
      var chain = Promise.resolve();
      for (var i = 0; i < hits; i++) {
        chain = chain.then(function () {
          var r = damage(src, dst, move);
          total += r.dmg; crit = crit || r.crit; eff = r.eff;
          dst.hp = Math.max(0, dst.hp - r.dmg);
          refresh(dst, dstUi);
          dst.flash = 1; dst.shakeT = 0.22; dst.knock = src.dir * 2.6;
          state.shake = Math.max(state.shake, r.crit ? 1.2 : 0.7);
          burst(dst.x - src.dir * 14, GROUND - 52, r.eff > 1 ? "#3ce88f" : "#ff9d3d", r.crit ? 22 : 14);
          pop(dst, "-" + r.dmg, r.crit ? "#ff9d3d" : "#ff5d6c", r.crit);
          return wait(hits > 1 ? 230 : 0);
        });
      }
      return chain.then(function () {
        log(src.name + " used " + move.name + "! " + total + " damage" + (hits > 1 ? " (" + hits + " hits)" : "") + ".", "#eef1ff");
        if (crit) log("Critical hit!", "#ff9d3d");
        if (eff > 1) log("It's super effective!", "#3ce88f");
        else if (eff < 1) log("It's not very effective...", "#8b93b5");
        if (move.stun && dst.hp > 0 && Math.random() < move.stun) {
          dst.stunned = true;
          pop(dst, "STUN!", "#ffcc4d");
          log(dst.name + " is stunned!", "#ffcc4d");
        }
      });
    }).then(function () {
      return wait(260);
    }).then(function () {
      src.anim = "run"; src.frame = 0; src.targetX = src.homeX;
      return wait(330);
    }).then(function () {
      src.anim = "idle"; src.x = src.homeX;
    });
  }

  function aiPick() {
    var f = state.foe;
    var healer = f.moves.filter(function (m) { return m.heal; })[0];
    if (healer && f.hp < f.max * 0.3 && Math.random() < 0.7) return healer;
    var attacks = f.moves.filter(function (m) { return m.power > 0; });
    var best = attacks[0], bestVal = -1;
    attacks.forEach(function (m) {
      var val = m.power * (m.hits || 1) * m.acc * (m.stun ? 1.15 : 1);
      if (val > bestVal) { bestVal = val; best = m; }
    });
    return Math.random() < 0.72 ? best : attacks[(Math.random() * attacks.length) | 0];
  }

  function playerTurn(move) {
    state.busy = true;
    lockMoves(true);
    var foeMove = aiPick();
    var youFirst = state.you.spd >= state.foe.spd;
    var a = youFirst
      ? [[state.you, state.foe, move, state.ui.you, state.ui.foe], [state.foe, state.you, foeMove, state.ui.foe, state.ui.you]]
      : [[state.foe, state.you, foeMove, state.ui.foe, state.ui.you], [state.you, state.foe, move, state.ui.you, state.ui.foe]];

    var o = a[0];
    applyMove(o[0], o[1], o[2], o[3], o[4]).then(function () {
      if (o[1].hp <= 0) return finish(o[1] === state.you ? "lose" : "win");
      var p = a[1];
      return applyMove(p[0], p[1], p[2], p[3], p[4]).then(function () {
        if (p[1].hp <= 0) return finish(p[1] === state.you ? "lose" : "win");
        state.turn++;
        log("— turn " + state.turn + " —", "#5a6488");
        state.busy = false;
        lockMoves(false);
      });
    });
  }

  function finish(result) {
    state.over = true; state.busy = true;
    lockMoves(true);
    var loser = result === "win" ? state.foe : state.you;
    var winner = result === "win" ? state.you : state.foe;
    loser.fainted = true; loser.anim = "idle";
    pop(loser, "K.O.", "#ff5d6c", true);
    burst(loser.x, GROUND - 48, "#ff5d6c", 26);
    state.shake = 1.4;
    winner.hop = 1;

    log(result === "win" ? "🏆 " + state.foe.name + " fainted. You win!" : "💀 Your " + state.you.name + " fainted...",
        result === "win" ? "#3ce88f" : "#ff5d6c");

    var f = state.ui.footer;
    f.innerHTML = ""; f.style.display = "flex";
    var again = el("div",
      "flex:1;text-align:center;padding:10px;border-radius:10px;cursor:pointer;font-weight:700;" +
      "background:rgba(126,231,255,.16);border:1px solid rgba(126,231,255,.4);color:#7ee7ff;", "Rematch");
    again.addEventListener("click", function () {
      var ps = state.you.sp, fs = state.foe.sp, cb = state.onEnd;
      destroy(); start(ps, fs, cb);
    });
    var out = el("div",
      "flex:1;text-align:center;padding:10px;border-radius:10px;cursor:pointer;font-weight:700;" +
      "background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#b9c0da;", "Close");
    out.addEventListener("click", end);
    f.appendChild(again); f.appendChild(out);

    if (state.onEnd) { try { state.onEnd(result); } catch (e) {} }
  }

  function destroy() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (root) { root.remove(); root = null; }
    state = null;
  }
  function end() { destroy(); }

  function start(playerSpecies, rivalSpecies, onEnd) {
    destroy();
    var keys = ["cat", "dog", "dino"];
    var ps = SPECIES[playerSpecies] ? playerSpecies : "cat";
    var rs = SPECIES[rivalSpecies] ? rivalSpecies : keys[(Math.random() * keys.length) | 0];
    state = {
      you: makeFighter(ps, true, 150),
      foe: makeFighter(rs, false, AW - 150),
      ui: {}, turn: 1, over: false, busy: false, onEnd: onEnd || null,
      pops: [], parts: [], shake: 0, time: 0, last: 0,
    };
    build();
    refresh(state.you, state.ui.you);
    refresh(state.foe, state.ui.foe);
    log("A wild " + state.foe.name + " challenges you!", "#7ee7ff");
    var m = mult(state.you.sp, state.foe.sp);
    if (m > 1) log("Type advantage: your " + state.you.name + " hits harder.", "#3ce88f");
    else if (m < 1) log("Type disadvantage: this is an uphill fight.", "#ff9d3d");
    log("— turn 1 —", "#5a6488");
    raf = requestAnimationFrame(loop);
  }

  window.__deskPetBattle = { start: start, close: end, species: SPECIES };
})();
