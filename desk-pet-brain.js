/* Desk Pet — BRAIN
 *
 * Needs-driven behaviour engine shared by every pet on screen.
 * Each pet registers a small context object; the brain decays its needs over
 * time, weights a library of ~30 named behaviours against those needs, and
 * drives the winner frame by frame. Pets can see each other, so social
 * behaviours (tag, nuzzle, stare-down, copycat, pile-up, conga) only surface
 * when there is actually a friend on screen.
 *
 * Contract with desk-pet.js — the ctx it hands us:
 *   { p, say, startHop, startFlip, species() }
 * We only ever touch fields the renderer already understands, plus three new
 * knobs the physics step honours: p.speedMul, p.spinV, p.rotHold.
 */
(function () {
  "use strict";

  var pets = [];

  /* ------------------------------------------------------------------ *
   *  flavour text
   * ------------------------------------------------------------------ */
  var CRY = { cat: "MEOW!", dog: "WOOF!", dino: "RAWR!" };

  var LINES = {
    cat: {
      groom: ["*lick lick*", "so clean", "*licks paw*"],
      bored: ["...", "hmph.", "entertain me"],
      happy: ["prrrrr", "mrrp!", "nyaa~"],
      hungry: ["feed me.", "i am starving", "bowl. empty."],
      think: ["plotting", "knock it over?", "that's mine now"],
    },
    dog: {
      groom: ["*scratch scratch*", "itchy!", "*nibble*"],
      bored: ["ball? ball?", "walk??", "someone play"],
      happy: ["BEST DAY", "hehehe", "yay yay yay"],
      hungry: ["food time?", "i smell snacks", "belly empty"],
      think: ["is that a squirrel", "i love you", "stick!!"],
    },
    dino: {
      groom: ["*preens*", "scales on point", "shiny"],
      bored: ["bored.", "extinct from boredom", "rawr... i guess"],
      happy: ["RAWR!", "APEX!", "hehe stompy"],
      hungry: ["MEAT.", "hungry lizard", "snack. now."],
      think: ["meteor? never heard of her", "tiny arms, big dreams", "stomp stomp"],
    },
  };

  function line(ctx, kind) {
    var set = (LINES[ctx.species()] || LINES.cat)[kind] || ["..."];
    return set[(Math.random() * set.length) | 0];
  }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* ------------------------------------------------------------------ *
   *  registry
   * ------------------------------------------------------------------ */
  function register(ctx) {
    ctx.p.needs = { energy: rnd(0.6, 1), fun: rnd(0.4, 0.9), social: rnd(0.4, 0.9), tidy: rnd(0.5, 1) };
    ctx.p.mood = pick(["chill", "hyper", "goofy", "grumpy"]);
    pets.push(ctx);
  }
  function unregister(ctx) {
    var i = pets.indexOf(ctx);
    if (i >= 0) pets.splice(i, 1);
  }
  function others(ctx) {
    return pets.filter(function (o) { return o !== ctx && o.p.mode === "ground"; });
  }
  function nearest(ctx) {
    var best = null, bd = 1e9, list = others(ctx);
    for (var i = 0; i < list.length; i++) {
      var d = Math.abs(list[i].p.x - ctx.p.x);
      if (d < bd) { bd = d; best = list[i]; }
    }
    return best;
  }

  /** face a point without fighting the walk logic */
  function face(p, x) { p.dir = x >= p.x ? 1 : -1; }

  /* ------------------------------------------------------------------ *
   *  behaviour library
   *
   *  weight(ctx, friends) -> 0 means "never right now".
   *  start/step get (ctx, dt, u) where u is 0..1 progress through the action.
   * ------------------------------------------------------------------ */
  var ACTS = [

    /* ---------------- solo: grooming + body language ---------------- */
    {
      id: "stretch",
      dur: [1.6, 2.4],
      weight: function (c) { return c.p.needs.energy < 0.55 ? 3 : 1.2; },
      start: function (c) { c.say("nnnngh..."); c.p.eye = "happy"; c.p.mouth = "happy"; },
      step: function (c, dt, u) {
        var p = c.p;
        p.action = "idle";
        var s = Math.sin(u * Math.PI);
        p.sx = 1 + s * 0.3; p.sy = 1 - s * 0.22;
        p.rotHold = -p.dir * s * 0.22;
      },
      end: function (c) { c.p.needs.energy = Math.min(1, c.p.needs.energy + 0.18); },
    },
    {
      id: "groom",
      dur: [2.4, 3.6],
      weight: function (c) { return (1 - c.p.needs.tidy) * 5 + 0.6; },
      start: function (c) { c.say(line(c, "groom")); c.p.eye = "happy"; },
      step: function (c, dt, u) {
        var p = c.p;
        p.action = "sit";
        p.rotHold = Math.sin(u * 44) * 0.13;
        p.sy = 1 + Math.sin(u * 30) * 0.04;
        if (u > 0.5 && u < 0.54) c.say(line(c, "groom"));
      },
      end: function (c) { c.p.needs.tidy = 1; },
    },
    {
      id: "scratch",
      dur: [1.4, 2.2],
      weight: function (c) { return (1 - c.p.needs.tidy) * 3 + 0.5; },
      start: function (c) { c.say("scritch scritch"); c.p.eye = "happy"; c.p.mouth = "happy"; },
      step: function (c, dt, u) {
        var p = c.p;
        p.action = "sit";
        p.rotHold = Math.sin(u * 90) * 0.1;
        p.sx = 1 + Math.sin(u * 90) * 0.06;
      },
      end: function (c) { c.p.needs.tidy = Math.min(1, c.p.needs.tidy + 0.5); },
    },
    {
      id: "yawn",
      dur: [1.5, 2],
      weight: function (c) { return c.p.needs.energy < 0.4 ? 4 : 0.5; },
      start: function (c) { c.say("*yaaawn*"); c.p.mouth = "happy"; c.p.eye = "happy"; },
      step: function (c, dt, u) {
        var p = c.p;
        p.action = "sit";
        p.sy = 1 + Math.sin(u * Math.PI) * 0.16;
        p.rotHold = -p.dir * Math.sin(u * Math.PI) * 0.2;
      },
    },
    {
      id: "sneeze",
      dur: [0.9, 1.2],
      weight: function () { return 0.7; },
      start: function (c) { c.say("...hh"); },
      step: function (c, dt, u) {
        var p = c.p;
        p.action = "idle";
        if (u < 0.55) { p.rotHold = -p.dir * 0.25; p.sy = 1.1; p.sx = 0.92; }
        else {
          if (!p.__sneezed) {
            p.__sneezed = true;
            c.say("ACHOO!"); p.emote = "bang"; p.emoteT = 0.6;
            p.vx = -p.dir * 260; p.sx = 1.3; p.sy = 0.72;
          }
          p.rotHold = p.dir * 0.18;
        }
      },
      end: function (c) { c.p.__sneezed = false; },
    },

    /* ---------------- solo: play + silliness ---------------- */
    {
      id: "chaseTail",
      dur: [2.2, 3.4],
      weight: function (c) { return (1 - c.p.needs.fun) * 6 * (c.p.mood === "hyper" ? 1.6 : 1); },
      start: function (c) { c.say("round and round"); c.p.eye = "happy"; c.p.mouth = "happy"; },
      step: function (c, dt, u) {
        var p = c.p;
        p.action = "idle";
        p.spinV = 11;
        p.speedMul = 0;
        if (u > 0.9) { p.spinV = 0; p.rotHold = 0; p.eye = "dizzy"; p.dizzyT = 0.8; }
      },
      end: function (c) { c.p.needs.fun = Math.min(1, c.p.needs.fun + 0.35); c.p.needs.energy -= 0.15; },
    },
    {
      id: "rollOver",
      dur: [1.4, 1.9],
      weight: function (c) { return (1 - c.p.needs.fun) * 3 + 0.6; },
      start: function (c) { c.say("roll!"); c.p.eye = "happy"; c.p.mouth = "happy"; },
      step: function (c, dt, u) {
        var p = c.p;
        p.action = "idle";
        p.rotHold = u * Math.PI * 2 * p.dir;
        p.sy = 1 - Math.sin(u * Math.PI) * 0.18;
        p.sx = 1 + Math.sin(u * Math.PI) * 0.18;
      },
      end: function (c) { c.p.needs.fun = Math.min(1, c.p.needs.fun + 0.2); c.p.rotHold = 0; },
    },
    {
      id: "dance",
      dur: [3, 4.5],
      weight: function (c) { return (1 - c.p.needs.fun) * 5 * (c.p.mood === "goofy" ? 2 : 1); },
      start: function (c) { c.say("\u266a \u266b"); c.p.eye = "happy"; c.p.mouth = "happy"; c.p.ears = 1; },
      step: function (c, dt, u) {
        var p = c.p;
        p.action = "idle";
        var t = u * 26;
        p.rotHold = Math.sin(t) * 0.3;
        p.sx = 1 + Math.sin(t * 2) * 0.1;
        p.sy = 1 - Math.sin(t * 2) * 0.1;
        p.dir = Math.sin(t / 3) >= 0 ? 1 : -1;
        if (u > 0.48 && u < 0.52) c.say("\u266b \u266a");
      },
      end: function (c) { c.p.needs.fun = Math.min(1, c.p.needs.fun + 0.4); c.p.needs.energy -= 0.12; },
    },
    {
      id: "headbang",
      dur: [2, 3],
      weight: function (c) { return c.p.mood === "hyper" ? (1 - c.p.needs.fun) * 4 : 0.4; },
      start: function (c) { c.say("\u266a RAAA \u266a"); c.p.eye = "happy"; c.p.mouth = "happy"; },
      step: function (c, dt, u) {
        var p = c.p;
        p.action = "idle";
        p.rotHold = Math.abs(Math.sin(u * 40)) * 0.42 * p.dir;
        p.sy = 1 - Math.abs(Math.sin(u * 40)) * 0.12;
      },
      end: function (c) { c.p.needs.fun = Math.min(1, c.p.needs.fun + 0.35); c.p.needs.energy -= 0.15; },
    },
    {
      id: "dig",
      dur: [2.2, 3.2],
      weight: function (c) { return c.species() === "dog" ? 2.4 : 0.8; },
      start: function (c) { c.say("dig dig dig"); c.p.eye = "happy"; c.p.mouth = "happy"; },
      step: function (c, dt, u) {
        var p = c.p;
        p.action = "sit";
        var t = u * 38;
        p.sy = 1 - Math.abs(Math.sin(t)) * 0.18;
        p.sx = 1 + Math.abs(Math.sin(t)) * 0.14;
        p.rotHold = -p.dir * 0.2;
        if (u > 0.92 && !p.__dug) { p.__dug = true; c.say(pick(["found it!", "a bone!", "nothing."])); p.emote = "love"; p.emoteT = 0.9; }
      },
      end: function (c) { c.p.__dug = false; c.p.needs.tidy -= 0.4; c.p.needs.fun = Math.min(1, c.p.needs.fun + 0.25); },
    },
    {
      id: "howl",
      dur: [1.8, 2.4],
      weight: function (c) { return 1.1; },
      start: function (c) { c.say(CRY[c.species()] || "!"); c.p.emote = "bang"; c.p.emoteT = 0.9; c.p.ears = 1; },
      step: function (c, dt, u) {
        var p = c.p;
        p.action = "sit";
        p.rotHold = -p.dir * Math.sin(u * Math.PI) * 0.34;
        p.mouth = "happy"; p.eye = "happy";
        p.sy = 1 + Math.sin(u * Math.PI) * 0.1;
      },
      end: function (c) {
        // a howl is contagious — nearby friends answer back
        others(c).forEach(function (o) {
          if (Math.abs(o.p.x - c.p.x) < 420) { o.say(CRY[o.species()] || "!"); o.p.emote = "bang"; o.p.emoteT = 0.7; }
        });
      },
    },
    {
      id: "beg",
      dur: [2.4, 3.4],
      weight: function (c) { return (1 - c.p.needs.tidy) * 0.5 + 1.6; },
      start: function (c) { c.say(line(c, "hungry")); c.p.eye = "happy"; c.p.mouth = "happy"; },
      step: function (c, dt, u) {
        var p = c.p;
        p.action = "sit";
        p.rotHold = Math.sin(u * 16) * 0.12;
        p.sy = 1 + Math.sin(u * 16) * 0.05;
        if (u > 0.6 && u < 0.64) { p.emote = "love"; p.emoteT = 0.8; }
      },
    },
    {
      id: "ponder",
      dur: [2.4, 3.6],
      weight: function (c) { return c.p.mood === "chill" ? 2.2 : 1; },
      start: function (c) { c.say(line(c, "think")); },
      step: function (c, dt, u) {
        var p = c.p;
        p.action = "sit";
        p.rotHold = Math.sin(u * 5) * 0.09;
        p.eye = "open";
        if (u > 0.55 && u < 0.59) c.say(line(c, "think"));
      },
    },
    {
      id: "grump",
      dur: [2, 3],
      weight: function (c) { return c.p.mood === "grumpy" ? 3 : 0.5; },
      start: function (c) { c.say(line(c, "bored")); c.p.mouth = "neutral"; },
      step: function (c, dt, u) {
        var p = c.p;
        p.action = "sit";
        p.dir = u < 0.5 ? -1 : 1;
        p.rotHold = 0;
        p.ears = 0.3;
      },
    },
    {
      id: "patrol",
      dur: [4, 6],
      weight: function (c) { return 2.2; },
      start: function (c) {
        c.p.__legA = 80 + Math.random() * 120;
        c.p.__legB = window.innerWidth - 80 - Math.random() * 120;
        c.say(pick(["patrolling", "on watch", "nothing to report"]));
      },
      step: function (c, dt, u) {
        var p = c.p;
        p.action = "wander";
        p.speedMul = 1.15;
        var phase = Math.floor(u * 3) % 2;
        p.targetX = phase === 0 ? p.__legB : p.__legA;
      },
    },
    {
      id: "sprintStop",
      dur: [2.6, 3.4],
      weight: function (c) { return (1 - c.p.needs.fun) * 4 * (c.p.mood === "hyper" ? 1.5 : 1); },
      start: function (c) {
        c.p.targetX = 70 + Math.random() * (window.innerWidth - 140);
        c.say("watch this");
      },
      step: function (c, dt, u) {
        var p = c.p;
        if (u < 0.6) { p.action = "wander"; p.speedMul = 3.4; p.eye = "happy"; }
        else {
          p.action = "idle"; p.speedMul = 0;
          if (!p.__skid) { p.__skid = true; c.say("SKRRT"); p.sx = 1.35; p.sy = 0.7; p.emote = "zoom"; p.emoteT = 0.5; }
          p.rotHold = -p.dir * 0.3;
        }
      },
      end: function (c) { c.p.__skid = false; c.p.needs.fun = Math.min(1, c.p.needs.fun + 0.3); c.p.needs.energy -= 0.2; },
    },
    {
      id: "wallSlam",
      dur: [2.6, 3.4],
      weight: function (c) { return c.p.mood === "goofy" ? 2.4 : 0.8; },
      start: function (c) {
        c.p.__wallX = Math.random() < 0.5 ? 20 : window.innerWidth - 20;
        c.say("no brakes");
      },
      step: function (c, dt, u) {
        var p = c.p;
        if (u < 0.7) { p.action = "wander"; p.targetX = p.__wallX; p.speedMul = 2.6; }
        else {
          p.action = "idle"; p.speedMul = 0;
          if (!p.__bonk) {
            p.__bonk = true;
            c.say("bonk."); p.emote = "bang"; p.emoteT = 0.8;
            p.eye = "dizzy"; p.dizzyT = 1.2; p.sx = 0.72; p.sy = 1.3;
            p.dir = -p.dir;
          }
        }
      },
      end: function (c) { c.p.__bonk = false; c.p.needs.fun = Math.min(1, c.p.needs.fun + 0.25); },
    },
    {
      id: "hopScotch",
      dur: [3, 4.4],
      weight: function (c) { return (1 - c.p.needs.fun) * 3 + 0.8; },
      start: function (c) { c.say("hop hop hop"); c.p.__hopT = 0; },
      step: function (c, dt) {
        var p = c.p;
        p.action = "idle";
        p.__hopT -= dt;
        if (p.__hopT <= 0 && p.mode === "ground") {
          p.__hopT = 0.55;
          c.startHop(p.x + (Math.random() < 0.5 ? -110 : 110));
        }
      },
      end: function (c) { c.p.needs.fun = Math.min(1, c.p.needs.fun + 0.3); c.p.needs.energy -= 0.12; },
    },
    {
      id: "peek",
      dur: [2.2, 3],
      weight: function (c) { return 1.4; },
      start: function (c) { c.say("..."); },
      step: function (c, dt, u) {
        var p = c.p;
        p.action = "idle";
        p.dir = Math.sin(u * 9) >= 0 ? 1 : -1;
        p.rotHold = Math.sin(u * 9) * 0.16;
        p.ears = 1;
        if (u > 0.85 && !p.__spooked) { p.__spooked = true; c.say(pick(["nope", "nothing there", "heard something"])); p.eye = "scared"; }
      },
      end: function (c) { c.p.__spooked = false; },
    },

    /* ---------------- social: only when a friend exists ---------------- */
    {
      id: "tag",
      dur: [3.4, 5],
      weight: function (c, n) { return n ? (1 - c.p.needs.social) * 7 + 1.5 : 0; },
      start: function (c) {
        var f = nearest(c);
        c.p.__friend = f;
        if (f) { c.say(pick(["you're IT!", "catch me!", "tag!"])); f.say(pick(["oh no", "hey!", "wait up!"])); }
        c.p.eye = "happy"; c.p.mouth = "happy";
      },
      step: function (c, dt, u) {
        var p = c.p, f = p.__friend;
        if (!f || pets.indexOf(f) < 0) { p.thinkT = 0; return; }
        p.action = "wander";
        p.speedMul = 2.4;
        p.targetX = f.p.x;
        p.eye = "happy";
        if (Math.abs(f.p.x - p.x) < 64 && !p.__tagged) {
          p.__tagged = true;
          p.emote = "fight"; p.emoteT = 0.5;
          c.say("TAG!");
          f.p.emote = "bang"; f.p.emoteT = 0.6;
          f.say("aa!");
          f.startHop(f.p.x + (f.p.x >= p.x ? 220 : -220));
        }
        if (u > 0.9) p.speedMul = 1;
      },
      end: function (c) {
        c.p.__tagged = false; c.p.__friend = null;
        c.p.needs.social = Math.min(1, c.p.needs.social + 0.5);
        c.p.needs.fun = Math.min(1, c.p.needs.fun + 0.4);
        c.p.needs.energy -= 0.22;
      },
    },
    {
      id: "nuzzle",
      dur: [3.2, 4.4],
      weight: function (c, n) { return n ? (1 - c.p.needs.social) * 6 + 1 : 0; },
      start: function (c) { c.p.__friend = nearest(c); c.p.eye = "happy"; c.p.mouth = "happy"; },
      step: function (c, dt, u) {
        var p = c.p, f = p.__friend;
        if (!f || pets.indexOf(f) < 0) { p.thinkT = 0; return; }
        var gap = Math.abs(f.p.x - p.x);
        if (gap > 70) { p.action = "wander"; p.targetX = f.p.x + (f.p.x > p.x ? -58 : 58); p.speedMul = 1.3; }
        else {
          p.action = "idle"; p.speedMul = 0;
          face(p, f.p.x);
          p.rotHold = Math.sin(u * 20) * 0.14;
          if (!p.__nuz) {
            p.__nuz = true;
            p.emote = "love"; p.emoteT = 2;
            c.say(pick(["\u2665", "friend!", "hi you"]));
            f.p.emote = "love"; f.p.emoteT = 1.6;
            f.say("\u2665");
            f.p.needs.social = Math.min(1, f.p.needs.social + 0.4);
            face(f.p, p.x);
          }
        }
      },
      end: function (c) {
        c.p.__nuz = false; c.p.__friend = null;
        c.p.needs.social = Math.min(1, c.p.needs.social + 0.55);
      },
    },
    {
      id: "stareDown",
      dur: [3.4, 4.6],
      weight: function (c, n) { return n ? (c.p.mood === "grumpy" ? 3.5 : 1.4) : 0; },
      start: function (c) { c.p.__friend = nearest(c); c.say("..."); },
      step: function (c, dt, u) {
        var p = c.p, f = p.__friend;
        if (!f || pets.indexOf(f) < 0) { p.thinkT = 0; return; }
        var gap = Math.abs(f.p.x - p.x);
        if (gap > 120) { p.action = "wander"; p.targetX = f.p.x + (f.p.x > p.x ? -100 : 100); p.speedMul = 1.1; return; }
        p.action = "sit"; p.speedMul = 0;
        face(p, f.p.x); face(f.p, p.x);
        p.ears = 1; p.eye = "open"; p.mouth = "neutral";
        p.rotHold = Math.sin(u * 3) * 0.05;
        if (u > 0.82 && !p.__blinked) {
          p.__blinked = true;
          if (Math.random() < 0.5) {
            c.say("BLINK. you lose.");
            p.emote = "fight"; p.emoteT = 0.6;
            f.say("...rude"); f.p.eye = "dizzy"; f.p.dizzyT = 1;
          } else {
            c.say("...fine. truce.");
            p.emote = "love"; p.emoteT = 1; f.p.emote = "love"; f.p.emoteT = 1;
          }
        }
      },
      end: function (c) { c.p.__blinked = false; c.p.__friend = null; c.p.needs.social = Math.min(1, c.p.needs.social + 0.3); },
    },
    {
      id: "copycat",
      dur: [3, 4],
      weight: function (c, n) { return n ? 1.6 : 0; },
      start: function (c) {
        var f = nearest(c);
        c.p.__friend = f;
        c.say(pick(["do what he does", "copying", "me too!"]));
      },
      step: function (c, dt, u) {
        var p = c.p, f = p.__friend;
        if (!f || pets.indexOf(f) < 0) { p.thinkT = 0; return; }
        p.action = f.p.action === "wander" ? "wander" : f.p.action;
        p.targetX = f.p.x + (p.x > f.p.x ? 90 : -90);
        p.speedMul = 1.4;
        p.dir = f.p.dir;
        p.rotHold = f.p.rot * 0.8;
        p.eye = f.p.eye; p.mouth = f.p.mouth;
        if (u > 0.9 && !p.__cop) { p.__cop = true; c.say("hehe"); p.emote = "love"; p.emoteT = 0.8; }
      },
      end: function (c) { c.p.__cop = false; c.p.__friend = null; c.p.needs.social = Math.min(1, c.p.needs.social + 0.35); },
    },
    {
      id: "pileUp",
      dur: [4, 5.5],
      weight: function (c, n) { return n >= 2 ? (1 - c.p.needs.social) * 5 + 1 : 0; },
      start: function (c) {
        c.p.__spot = window.innerWidth * (0.3 + Math.random() * 0.4);
        c.say(pick(["everyone over here", "pile!", "group nap"]));
        others(c).forEach(function (o) { o.p.__invite = c.p.__spot; o.p.thinkT = 0; });
      },
      step: function (c, dt, u) {
        var p = c.p;
        if (Math.abs(p.__spot - p.x) > 40) { p.action = "wander"; p.targetX = p.__spot; p.speedMul = 1.4; }
        else {
          p.action = "sit"; p.speedMul = 0;
          p.eye = "happy"; p.mouth = "happy";
          p.rotHold = Math.sin(u * 4) * 0.06;
          if (u > 0.6 && !p.__piled) { p.__piled = true; p.emote = "love"; p.emoteT = 1.6; c.say("cozy"); }
        }
      },
      end: function (c) { c.p.__piled = false; c.p.needs.social = 1; },
    },
    {
      id: "conga",
      dur: [5, 7],
      weight: function (c, n) { return n >= 2 ? 1.8 : 0; },
      start: function (c) { c.say("\u266a conga line \u266a"); c.p.__leg = Math.random() < 0.5 ? 1 : -1; },
      step: function (c, dt, u) {
        var p = c.p;
        p.action = "wander";
        p.speedMul = 1.2;
        p.targetX = p.__leg > 0 ? window.innerWidth - 80 : 80;
        p.eye = "happy"; p.mouth = "happy";
        p.rotHold = Math.sin(u * 30) * 0.12;
        // everyone else falls in behind
        others(c).forEach(function (o, i) {
          if (o.p.act || o.p.trick || o.p.mode !== "ground") return;
          o.p.action = "wander";
          o.p.targetX = p.x - p.dir * (90 * (i + 1));
          o.p.speedMul = 1.3;
          o.p.eye = "happy"; o.p.mouth = "happy";
        });
      },
      end: function (c) { c.p.needs.social = 1; c.p.needs.fun = Math.min(1, c.p.needs.fun + 0.4); },
    },
    {
      id: "gossip",
      dur: [3.6, 5],
      weight: function (c, n) { return n ? (1 - c.p.needs.social) * 4 + 1.2 : 0; },
      start: function (c) { c.p.__friend = nearest(c); },
      step: function (c, dt, u) {
        var p = c.p, f = p.__friend;
        if (!f || pets.indexOf(f) < 0) { p.thinkT = 0; return; }
        var gap = Math.abs(f.p.x - p.x);
        if (gap > 110) { p.action = "wander"; p.targetX = f.p.x + (f.p.x > p.x ? -90 : 90); p.speedMul = 1.2; return; }
        p.action = "sit"; p.speedMul = 0;
        face(p, f.p.x); face(f.p, p.x);
        p.rotHold = Math.sin(u * 22) * 0.1;
        var beat = Math.floor(u * 4);
        if (p.__beat !== beat) {
          p.__beat = beat;
          if (beat % 2 === 0) c.say(line(c, "think"));
          else f.say(pick(["no way", "for real?", "wow", "hmm", "tell me more"]));
        }
      },
      end: function (c) { c.p.__beat = -1; c.p.__friend = null; c.p.needs.social = Math.min(1, c.p.needs.social + 0.5); },
    },
    {
      id: "followFriend",
      dur: [4, 6],
      weight: function (c, n) { return n ? (1 - c.p.needs.social) * 3 + 0.8 : 0; },
      start: function (c) { c.p.__friend = nearest(c); c.say(pick(["wait for me", "where we going", "tagging along"])); },
      step: function (c) {
        var p = c.p, f = p.__friend;
        if (!f || pets.indexOf(f) < 0) { p.thinkT = 0; return; }
        var off = p.x > f.p.x ? 80 : -80;
        if (Math.abs(f.p.x + off - p.x) > 30) { p.action = "wander"; p.targetX = f.p.x + off; p.speedMul = 1.5; }
        else { p.action = "idle"; p.speedMul = 0; face(p, f.p.x); }
        p.eye = "happy";
      },
      end: function (c) { c.p.__friend = null; c.p.needs.social = Math.min(1, c.p.needs.social + 0.4); },
    },
  ];

  /* ------------------------------------------------------------------ *
   *  scheduler
   * ------------------------------------------------------------------ */
  function resetKnobs(p) {
    p.speedMul = 1;
    p.spinV = 0;
    p.rotHold = 0;
  }

  /** decay needs, weight the library, start the winner. true = we took over */
  function choose(ctx) {
    var p = ctx.p;
    resetKnobs(p);
    p.act = null;

    var n = p.needs;
    var friends = others(ctx).length;

    // a pet with no juice left should nap — hand control back to the base AI
    if (n.energy < 0.12) { n.energy = Math.min(1, n.energy + 0.5); p.restT = 99; return false; }

    // 1 in 5 falls through to the original wander/flip/zoomies roll so the old
    // behaviour never fully disappears
    if (Math.random() < 0.2) return false;

    var pool = [], total = 0;
    for (var i = 0; i < ACTS.length; i++) {
      var a = ACTS[i];
      if (a.id === p.lastAct) continue;
      var w = a.weight(ctx, friends) || 0;
      if (w <= 0) continue;
      total += w;
      pool.push({ a: a, w: total });
    }
    if (!pool.length) return false;

    var r = Math.random() * total, def = pool[pool.length - 1].a;
    for (var k = 0; k < pool.length; k++) { if (r <= pool[k].w) { def = pool[k].a; break; } }

    p.lastAct = def.id;
    p.act = { def: def, t: 0, dur: rnd(def.dur[0], def.dur[1]) };
    p.emote = null;
    p.restT = 0;
    if (def.start) def.start(ctx);
    return true;
  }

  /** run the active behaviour. true = it owns this frame */
  function step(ctx, dt) {
    var p = ctx.p, act = p.act;
    if (!act) return false;

    act.t += dt;
    var u = Math.min(1, act.t / act.dur);

    // needs drain while living
    var n = p.needs;
    n.energy = Math.max(0, n.energy - dt * 0.012);
    n.fun = Math.max(0, n.fun - dt * 0.03);
    n.social = Math.max(0, n.social - dt * (others(ctx).length ? 0.035 : 0.008));
    n.tidy = Math.max(0, n.tidy - dt * 0.018);

    act.def.step(ctx, dt, u);

    if (act.t >= act.dur) {
      if (act.def.end) act.def.end(ctx);
      p.act = null;
      resetKnobs(p);
      p.thinkT = rnd(0.2, 1.1);
      p.mouth = "neutral";
    }
    return true;
  }

  /** a quick click on a pet = a scritch */
  function petted(ctx) {
    var p = ctx.p;
    p.act = null;
    resetKnobs(p);
    p.emote = "love"; p.emoteT = 1.8;
    p.eye = "happy"; p.mouth = "happy"; p.ears = 1;
    p.needs.social = 1;
    p.needs.fun = Math.min(1, p.needs.fun + 0.35);
    p.needs.energy = Math.min(1, p.needs.energy + 0.1);
    p.restT = 0;
    ctx.say(line(ctx, "happy"));
    p.thinkT = 1.4;
    // jealous friends wander over
    others(ctx).forEach(function (o) {
      if (Math.random() < 0.6) { o.p.act = null; o.p.action = "wander"; o.p.targetX = p.x + (Math.random() < 0.5 ? -90 : 90); o.p.thinkT = 2; o.say(pick(["me too!", "hey", "my turn"])); }
    });
  }

  /** current headline need, for the tooltip / debug */
  function statusOf(ctx) {
    var n = ctx.p.needs, low = "content", lv = 0.65;
    if (n.energy < lv) { low = "sleepy"; lv = n.energy; }
    if (n.fun < lv) { low = "bored"; lv = n.fun; }
    if (n.social < lv) { low = "lonely"; lv = n.social; }
    if (n.tidy < lv) { low = "scruffy"; lv = n.tidy; }
    return ctx.p.mood + " \u00b7 " + low;
  }

  window.__deskPetBrain = {
    register: register,
    unregister: unregister,
    choose: choose,
    step: step,
    petted: petted,
    statusOf: statusOf,
    count: function () { return pets.length; },
    all: function () { return pets.slice(); },
  };
})();
