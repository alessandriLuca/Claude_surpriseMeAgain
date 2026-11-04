// Valdombra — low-poly character & creature builders with procedural animation rigs.
(function () {
  const M = {};
  const cache = {};
  function lam(color, extra) {
    const k = color + (extra ? JSON.stringify(extra) : '');
    if (!cache[k]) cache[k] = new THREE.MeshLambertMaterial(Object.assign({ color }, extra || {}));
    return cache[k];
  }
  function mesh(geo, m, x, y, z, parent) {
    const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = true;
    if (parent) parent.add(o); return o;
  }
  function limb(len, rad, m, parent, x, y, z) {
    const pivot = new THREE.Group(); pivot.position.set(x, y, z); parent.add(pivot);
    mesh(new THREE.CylinderGeometry(rad, rad * 0.85, len, 6), m, 0, -len / 2, 0, pivot);
    return pivot;
  }

  // Generic humanoid. opts: skin, cloth, cloth2, hair, hat, beard, scale, robe, staff, apron, hood
  M.humanoid = function (o) {
    o = Object.assign({ skin: 0xd8a888, cloth: 0x4a5a7a, cloth2: 0x3a2a20, hair: 0x3a2a1a, scale: 1 }, o);
    const root = new THREE.Group();
    const body = new THREE.Group(); root.add(body);
    const rig = { root, body };
    const legM = lam(o.cloth2), clothM = lam(o.cloth), skinM = lam(o.skin);
    rig.legL = limb(0.85, 0.13, legM, body, -0.17, 0.9, 0);
    rig.legR = limb(0.85, 0.13, legM, body, 0.17, 0.9, 0);
    mesh(new THREE.BoxGeometry(0.2, 0.12, 0.32), lam(0x2a1e16), 0, -0.82, 0.06, rig.legL);
    mesh(new THREE.BoxGeometry(0.2, 0.12, 0.32), lam(0x2a1e16), 0, -0.82, 0.06, rig.legR);
    const torso = mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.75, 8), clothM, 0, 1.25, 0, body);
    rig.torso = torso;
    if (o.robe) mesh(new THREE.CylinderGeometry(0.26, 0.42, 0.9, 8), clothM, 0, 0.62, 0, body);
    if (o.apron) mesh(new THREE.BoxGeometry(0.42, 0.7, 0.05), lam(o.apron), 0, 1.0, 0.25, body);
    mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.08, 8), lam(0x2a1e14), 0, 0.92, 0, body); // belt
    const head = new THREE.Group(); head.position.set(0, 1.85, 0); body.add(head); rig.head = head;
    mesh(new THREE.SphereGeometry(0.22, 10, 8), skinM, 0, 0, 0, head);
    mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), lam(0x111111), -0.08, 0.03, 0.2, head);
    mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), lam(0x111111), 0.08, 0.03, 0.2, head);
    if (o.hair !== null && !o.hood) { const h = mesh(new THREE.SphereGeometry(0.235, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), lam(o.hair), 0, 0.02, -0.02, head); h.rotation.x = -0.25; }
    if (o.longHair) mesh(new THREE.BoxGeometry(0.4, 0.45, 0.12), lam(o.hair), 0, -0.2, -0.17, head);
    if (o.beard) mesh(new THREE.ConeGeometry(0.16, 0.38, 6), lam(o.beard), 0, -0.24, 0.12, head).rotation.x = Math.PI;
    if (o.hood) { const hd = mesh(new THREE.ConeGeometry(0.32, 0.6, 8), lam(o.hood), 0, 0.12, -0.04, head); hd.rotation.x = -0.15; mesh(new THREE.SphereGeometry(0.27, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), lam(o.hood), 0, 0, -0.03, head); }
    if (o.hat) { mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 12), lam(o.hat), 0, 0.17, 0, head); mesh(new THREE.ConeGeometry(0.22, 0.55, 10), lam(o.hat), 0, 0.42, 0, head); }
    if (o.helmet) mesh(new THREE.SphereGeometry(0.25, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), lam(o.helmet), 0, 0.03, 0, head);
    rig.armL = limb(0.7, 0.09, clothM, body, -0.36, 1.58, 0);
    rig.armR = limb(0.7, 0.09, clothM, body, 0.36, 1.58, 0);
    mesh(new THREE.SphereGeometry(0.09, 6, 5), skinM, 0, -0.74, 0, rig.armL);
    rig.handR = new THREE.Group(); rig.handR.position.set(0, -0.74, 0); rig.armR.add(rig.handR);
    mesh(new THREE.SphereGeometry(0.09, 6, 5), skinM, 0, 0, 0, rig.handR);
    if (o.cape) {
      const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.1, 1, 4), lam(o.cape, { side: THREE.DoubleSide }));
      cape.position.set(0, 1.0, -0.3); cape.castShadow = true;
      const cp = new THREE.Group(); cp.position.set(0, 1.62, -0.2); body.add(cp); cape.position.set(0, -0.6, -0.05); cp.add(cape);
      rig.cape = cp;
    }
    if (o.staff) { const s = mesh(new THREE.CylinderGeometry(0.04, 0.04, 2, 5), lam(0x5a4028), 0, 0.1, 0.1, rig.handR); s.rotation.x = 0.1; mesh(new THREE.SphereGeometry(0.1, 6, 5), lam(0x9ad0ff, { emissive: 0x3060a0 }), 0, 1.1, 0.12, rig.handR); }
    if (o.hammer) { const h = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 5), lam(0x5a4028), 0, -0.1, 0.15, rig.handR); h.rotation.x = Math.PI / 2; mesh(new THREE.BoxGeometry(0.16, 0.16, 0.3), lam(0x30343a), 0, -0.1, 0.5, rig.handR); }
    if (o.spear) { const s = mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 5), lam(0x5a4028), 0, 0.3, 0.1, rig.handR); void s; mesh(new THREE.ConeGeometry(0.07, 0.3, 5), lam(0xb0b8c0), 0, 1.6, 0.1, rig.handR); }
    if (o.basket) mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.2, 8), lam(0x8a6a3a), 0, -0.1, 0, rig.handR);
    root.scale.setScalar(o.scale);
    rig.phase = Math.random() * 6;
    return rig;
  };

  // Hero
  M.hero = function () {
    const rig = M.humanoid({ skin: 0xe0b090, cloth: 0x2a4a5a, cloth2: 0x2a2420, hair: 0x6a3a1a, cape: 0x7a1a24 });
    // sword
    const sword = new THREE.Group(); rig.handR.add(sword); sword.rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 6), lam(0x3a2418), 0, -0.02, 0, sword);
    mesh(new THREE.BoxGeometry(0.34, 0.05, 0.07), lam(0xa08040), 0, 0.1, 0, sword);
    rig.blade = mesh(new THREE.BoxGeometry(0.07, 1.0, 0.025), lam(0xd0d8e0, { emissive: 0x101820 }), 0, 0.62, 0, sword);
    rig.sword = sword;
    // shoulder pads
    mesh(new THREE.SphereGeometry(0.14, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), lam(0x5a5a64), -0.36, 1.6, 0, rig.body);
    mesh(new THREE.SphereGeometry(0.14, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), lam(0x5a5a64), 0.36, 1.6, 0, rig.body);
    // small lantern at belt
    rig.lamp = mesh(new THREE.BoxGeometry(0.12, 0.16, 0.12), new THREE.MeshBasicMaterial({ color: 0xffc070 }), -0.3, 0.85, 0.12, rig.body);
    return rig;
  };

  // Animate a humanoid rig. state: idle|walk|run|attack|talk|roll|hurt|dead ; k = 0..1 progress for attacks
  M.animHumanoid = function (rig, state, t, opts = {}) {
    const p = t + rig.phase;
    let legSwing = 0, armSwing = 0, bob = 0;
    if (state === 'walk' || state === 'run') {
      const sp = state === 'run' ? 11 : 7, amp = state === 'run' ? 0.9 : 0.55;
      legSwing = Math.sin(p * sp) * amp; armSwing = -legSwing * 0.8;
      bob = Math.abs(Math.cos(p * sp)) * (state === 'run' ? 0.1 : 0.05);
    }
    rig.legL.rotation.x = legSwing; rig.legR.rotation.x = -legSwing;
    rig.armL.rotation.x = armSwing; rig.armR.rotation.x = -armSwing;
    rig.armL.rotation.z = 0.08; rig.armR.rotation.z = -0.08;
    rig.body.position.y = bob; rig.body.rotation.x = 0; rig.body.rotation.z = 0;
    rig.head.rotation.y = 0; rig.head.rotation.x = 0;
    if (state === 'idle') { rig.body.position.y = Math.sin(p * 1.8) * 0.015; rig.armL.rotation.x = Math.sin(p * 1.8) * 0.04; rig.head.rotation.y = Math.sin(p * 0.4) * 0.25; }
    if (state === 'talk') { rig.armR.rotation.x = -0.5 + Math.sin(p * 4) * 0.25; rig.armR.rotation.z = -0.3; rig.head.rotation.x = Math.sin(p * 5) * 0.06; }
    if (state === 'attack') {
      const k = opts.k || 0, combo = opts.combo || 0;
      if (combo === 2) { // overhead slam
        const a = k < 0.4 ? U.lerp(0, -2.8, k / 0.4) : U.lerp(-2.8, -0.6, Math.min(1, (k - 0.4) / 0.3));
        rig.armR.rotation.x = a; rig.armL.rotation.x = a * 0.8; rig.body.rotation.x = k > 0.4 ? 0.25 : -0.1;
      } else {
        const dir = combo === 0 ? 1 : -1;
        const a = k < 0.35 ? U.lerp(0, 1, k / 0.35) : U.lerp(1, -1, Math.min(1, (k - 0.35) / 0.3));
        rig.armR.rotation.x = -1.4; rig.armR.rotation.z = -0.2 + a * 1.2 * dir; rig.body.rotation.y = a * 0.5 * dir;
      }
      rig.legL.rotation.x = 0.3; rig.legR.rotation.x = -0.3;
    } else rig.body.rotation.y = 0;
    if (state === 'cast') { rig.armL.rotation.x = -1.5; rig.armR.rotation.x = -1.5; rig.armL.rotation.z = 0.3; rig.armR.rotation.z = -0.3; }
    if (state === 'roll') { rig.body.rotation.x = (opts.k || 0) * Math.PI * 2; rig.body.position.y = 0.4 - Math.abs(Math.sin((opts.k || 0) * Math.PI)) * 0.4 + 0.1; rig.legL.rotation.x = -1.4; rig.legR.rotation.x = -1.4; rig.armL.rotation.x = -1.6; rig.armR.rotation.x = -1.6; }
    if (state === 'jump') { rig.legL.rotation.x = -0.6; rig.legR.rotation.x = 0.3; rig.armL.rotation.x = -0.6; rig.armR.rotation.x = -0.6; }
    if (state === 'hurt') { rig.body.rotation.x = -0.2; }
    if (state === 'dead') { rig.body.rotation.x = -Math.PI / 2 * Math.min(1, opts.k || 1); rig.body.position.y = 0.25; }
    if (rig.cape) rig.cape.rotation.x = 0.15 + (state === 'run' ? 0.7 : state === 'walk' ? 0.35 : 0.05) + Math.sin(p * 3) * 0.05;
  };

  // ------------------------------------------------------------ creatures
  M.wolf = function (o = {}) {
    const s = o.scale || 1, col = o.color || 0x4a4a52;
    const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
    const fur = lam(col), dark = lam(0x2a2a30);
    mesh(new THREE.BoxGeometry(0.6, 0.55, 1.3), fur, 0, 0.85, 0, body);
    mesh(new THREE.BoxGeometry(0.66, 0.6, 0.5), fur, 0, 0.92, 0.45, body);
    const head = new THREE.Group(); head.position.set(0, 1.08, 0.82); body.add(head);
    mesh(new THREE.BoxGeometry(0.42, 0.38, 0.45), fur, 0, 0, 0, head);
    mesh(new THREE.BoxGeometry(0.26, 0.22, 0.38), dark, 0, -0.06, 0.36, head);
    for (const sx of [-1, 1]) {
      mesh(new THREE.ConeGeometry(0.08, 0.2, 4), fur, sx * 0.13, 0.26, -0.08, head);
      mesh(new THREE.BoxGeometry(0.07, 0.05, 0.02), new THREE.MeshBasicMaterial({ color: o.eyes || 0xffcc33 }), sx * 0.12, 0.06, 0.23, head);
    }
    const legs = [];
    for (const [x, z] of [[-0.22, 0.45], [0.22, 0.45], [-0.22, -0.5], [0.22, -0.5]]) legs.push(limb(0.65, 0.08, dark, body, x, 0.68, z));
    const tail = new THREE.Group(); tail.position.set(0, 1.0, -0.65); body.add(tail);
    mesh(new THREE.ConeGeometry(0.1, 0.7, 5), fur, 0, 0, -0.32, tail).rotation.x = -Math.PI / 2 - 0.4;
    root.scale.setScalar(s);
    return { root, body, head, legs, tail, phase: Math.random() * 6, kind: 'wolf' };
  };
  M.animWolf = function (r, state, t, opts = {}) {
    const p = t + r.phase;
    const sp = state === 'run' ? 14 : state === 'walk' ? 8 : 0;
    const a = state === 'run' ? 0.55 : 0.35;
    r.legs.forEach((l, i) => { l.rotation.x = sp ? Math.sin(p * sp + (i % 2 === 0 ? 0 : Math.PI) + (i > 1 ? Math.PI / 2 : 0)) * a : 0; });
    r.body.position.y = sp ? Math.abs(Math.sin(p * sp)) * 0.06 : Math.sin(p * 2) * 0.01;
    r.tail.rotation.y = Math.sin(p * 6) * 0.3;
    r.head.rotation.x = 0; r.body.rotation.x = 0;
    if (state === 'attack') { const k = opts.k || 0; r.body.rotation.x = k < 0.5 ? -k * 0.6 : (k - 1) * 0.6; r.head.rotation.x = 0.3; }
    if (state === 'windup') { r.body.rotation.x = 0.15; r.head.rotation.x = 0.2; }
    if (state === 'dead') { r.body.rotation.z = Math.PI / 2 * Math.min(1, opts.k || 1); r.body.position.y = -0.5; }
  };

  M.skeleton = function (o = {}) {
    const bone = lam(0xd8d0bc), dark = lam(0x2a2620);
    const rig = M.humanoid({ skin: 0xd8d0bc, cloth: o.armor || 0x5a5048, cloth2: 0xc8c0ac, hair: null, scale: o.scale || 1, helmet: o.helmet, cape: o.cape });
    // ribs
    for (let i = 0; i < 3; i++) mesh(new THREE.TorusGeometry(0.22, 0.025, 4, 10, Math.PI), bone, 0, 1.4 - i * 0.14, 0.02, rig.body).rotation.set(0, 0, Math.PI);
    // glowing eyes overriding
    for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.07, 0.06, 0.03), new THREE.MeshBasicMaterial({ color: o.eyes || 0x60c0ff }), sx * 0.08, 0.03, 0.2, rig.head);
    // weapon
    const wpn = new THREE.Group(); rig.handR.add(wpn); wpn.rotation.x = Math.PI / 2;
    mesh(new THREE.BoxGeometry(0.06, o.big ? 1.6 : 0.9, 0.03), lam(0x8a8a90), 0, o.big ? 0.8 : 0.5, 0, wpn);
    mesh(new THREE.BoxGeometry(0.26, 0.05, 0.06), dark, 0, 0.05, 0, wpn);
    if (o.shield) { const sh = mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.06, 10), lam(0x4a3a2a), 0, -0.6, 0.12, rig.armL); sh.rotation.x = Math.PI / 2; }
    rig.kind = 'skeleton';
    return rig;
  };

  M.wisp = function (o = {}) {
    const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), new THREE.MeshBasicMaterial({ color: o.color || 0x80d0ff }));
    core.position.y = 1.6; body.add(core);
    const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), new THREE.MeshBasicMaterial({ color: o.color || 0x80d0ff, transparent: true, opacity: 0.25, depthWrite: false }));
    halo.position.y = 1.6; body.add(halo);
    const tail = [];
    for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.18 - i * 0.035, 6, 4), new THREE.MeshBasicMaterial({ color: o.color || 0x80d0ff, transparent: true, opacity: 0.6 - i * 0.12 })); body.add(m); tail.push(m); }
    const light = new THREE.PointLight(o.color || 0x80d0ff, 0.9, 8, 2); light.position.y = 1.6; body.add(light);
    return { root, body, core, halo, tail, light, phase: Math.random() * 6, kind: 'wisp' };
  };
  M.animWisp = function (r, state, t, opts = {}) {
    const p = t + r.phase;
    r.core.position.y = 1.6 + Math.sin(p * 2.2) * 0.25;
    r.halo.position.y = r.core.position.y; r.halo.scale.setScalar(1 + Math.sin(p * 5) * 0.12 + (state === 'windup' ? 0.4 : 0));
    r.tail.forEach((m, i) => m.position.set(Math.sin(p * 3 - i) * 0.15, r.core.position.y - 0.3 - i * 0.18, -0.15 * i));
    if (state === 'dead') r.root.scale.setScalar(Math.max(0.01, 1 - (opts.k || 1)));
  };

  M.golem = function () {
    const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
    const rock = lam(0x5a5a62), moss = lam(0x3a5a3a);
    const glow = new THREE.MeshBasicMaterial({ color: 0x50e0ff });
    const torso = mesh(new THREE.DodecahedronGeometry(1.3, 0), rock, 0, 3.0, 0, body); torso.scale.set(1.3, 1.1, 0.9);
    mesh(new THREE.DodecahedronGeometry(0.7, 0), moss, 0.3, 4.1, -0.3, body);
    mesh(new THREE.OctahedronGeometry(0.35, 0), glow, 0, 3.0, 1.05, body);
    const head = new THREE.Group(); head.position.set(0, 4.4, 0.3); body.add(head);
    mesh(new THREE.DodecahedronGeometry(0.55, 0), rock, 0, 0, 0, head);
    for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.15, 0.08, 0.05), glow, sx * 0.2, 0.05, 0.48, head);
    const arms = [];
    for (const sx of [-1, 1]) {
      const a = new THREE.Group(); a.position.set(sx * 1.8, 3.6, 0); body.add(a);
      mesh(new THREE.DodecahedronGeometry(0.55, 0), rock, 0, -0.4, 0, a);
      mesh(new THREE.DodecahedronGeometry(0.5, 0), rock, 0, -1.3, 0, a);
      mesh(new THREE.DodecahedronGeometry(0.75, 0), rock, 0, -2.3, 0.1, a);
      arms.push(a);
    }
    const legs = [];
    for (const sx of [-1, 1]) { const l = new THREE.Group(); l.position.set(sx * 0.7, 1.8, 0); body.add(l); mesh(new THREE.DodecahedronGeometry(0.6, 0), rock, 0, -0.9, 0, l); legs.push(l); }
    const light = new THREE.PointLight(0x50e0ff, 1.2, 14, 2); light.position.set(0, 3, 1.5); body.add(light);
    return { root, body, head, arms, legs, phase: 0, kind: 'golem' };
  };
  M.animGolem = function (r, state, t, opts = {}) {
    const p = t + r.phase;
    const w = state === 'walk' || state === 'run' ? Math.sin(p * 4) * 0.4 : 0;
    r.legs[0].rotation.x = w; r.legs[1].rotation.x = -w;
    r.arms[0].rotation.x = -w * 0.5; r.arms[1].rotation.x = w * 0.5;
    r.body.position.y = Math.abs(w) * 0.1; r.body.rotation.x = 0;
    if (state === 'windup') { r.arms[0].rotation.x = -2.6; r.arms[1].rotation.x = -2.6; r.body.rotation.x = -0.15; }
    if (state === 'attack') { const k = opts.k || 0; const a = U.lerp(-2.6, 0.3, Math.min(1, k * 2.5)); r.arms[0].rotation.x = a; r.arms[1].rotation.x = a; r.body.rotation.x = 0.2; }
    if (state === 'dead') { r.body.rotation.x = -Math.PI / 2 * Math.min(1, opts.k || 1); r.body.position.y = -0.8 * Math.min(1, opts.k || 1); }
  };

  M.cat = function () {
    const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
    const fur = lam(0xd08a3a), stripe = lam(0x8a4a1a), white = lam(0xf0e8d8);
    mesh(new THREE.BoxGeometry(0.28, 0.26, 0.55), fur, 0, 0.28, 0, body);
    const head = new THREE.Group(); head.position.set(0, 0.48, 0.3); body.add(head);
    mesh(new THREE.BoxGeometry(0.3, 0.26, 0.26), fur, 0, 0, 0, head);
    mesh(new THREE.BoxGeometry(0.14, 0.1, 0.06), white, 0, -0.06, 0.13, head);
    for (const sx of [-1, 1]) {
      mesh(new THREE.ConeGeometry(0.06, 0.13, 4), fur, sx * 0.09, 0.18, 0, head);
      mesh(new THREE.BoxGeometry(0.05, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: 0x9aff60 }), sx * 0.07, 0.03, 0.14, head);
    }
    for (let i = 0; i < 3; i++) mesh(new THREE.BoxGeometry(0.3, 0.04, 0.05), stripe, 0, 0.42, -0.15 + i * 0.13, body);
    const tail = new THREE.Group(); tail.position.set(0, 0.35, -0.27); body.add(tail);
    mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.55, 5), fur, 0, 0.26, -0.05, tail).rotation.x = -0.3;
    for (const [x, z] of [[-0.09, 0.2], [0.09, 0.2], [-0.09, -0.2], [0.09, -0.2]]) mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.18, 5), fur, x, 0.09, z, body);
    return { root, body, head, tail, phase: 0, kind: 'cat' };
  };
  M.animCat = function (r, state, t) {
    r.tail.rotation.z = Math.sin(t * 2) * 0.5; r.tail.rotation.x = Math.sin(t * 1.3) * 0.2;
    r.head.rotation.y = Math.sin(t * 0.5) * 0.4;
    if (state === 'talk') r.head.rotation.x = Math.sin(t * 8) * 0.08;
  };

  window.Models = M;
})();
