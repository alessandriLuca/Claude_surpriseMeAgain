// Valdombra — building: grid-snapped structures (floors, walls, ramps, torches, campfires), terrain digging,
// structure collision and walkable surfaces.
(function () {
  const B = {};
  const GRID = 2, WALL_H = 2.5, FLOOR_T = 0.25;
  B.RES = {
    wood: { name: 'Legno', icon: '▮', short: 'Legno' },
    stone: { name: 'Pietra', icon: '◆', short: 'Pietra' },
    iron: { name: 'Minerale di ferro', icon: '⛏', short: 'Ferro' },
    crystal: { name: 'Cristallo', icon: '✧', short: 'Cristallo' },
    dirt: { name: 'Terra', icon: '▪', short: 'Terra' },
  };
  B.PIECES = [
    { id: 'floor', name: 'Pavimento', cost: { wood: 2 } },
    { id: 'wall', name: 'Muro di legno', short: 'Muro legno', cost: { wood: 3 } },
    { id: 'stone', name: 'Muro di pietra', short: 'Muro pietra', cost: { stone: 3 } },
    { id: 'ramp', name: 'Rampa', cost: { wood: 3 } },
    { id: 'torch', name: 'Torcia', cost: { wood: 1, crystal: 1 } },
    { id: 'campfire', name: 'Fuoco da campo', short: 'Falò', cost: { wood: 3, stone: 2 } },
    { id: 'dig', name: 'Scava', cost: {}, tool: true },
    { id: 'fill', name: 'Riempi', cost: { dirt: 1 }, tool: true },
  ];
  B.list = [];   // placed structures
  B.boxes = [];  // collision boxes {x,z,hw,hd,y0,y1,s}
  let scene, ghost = null, ghostType = null, torchLights = 0;

  const M = {};
  function mats() {
    M.wood = new THREE.MeshLambertMaterial({ color: 0x8a6440 });
    M.woodDark = new THREE.MeshLambertMaterial({ color: 0x5a3e26 });
    M.stone = new THREE.MeshLambertMaterial({ color: 0x7a7672 });
    M.flame = new THREE.MeshBasicMaterial({ color: 0xffa040 });
    M.crystal = new THREE.MeshLambertMaterial({ color: 0x9ae8ff, emissive: 0x3aa0d0 });
    M.ghostOk = new THREE.MeshBasicMaterial({ color: 0x70ff90, transparent: true, opacity: 0.38, depthWrite: false });
    M.ghostBad = new THREE.MeshBasicMaterial({ color: 0xff5050, transparent: true, opacity: 0.38, depthWrite: false });
  }
  B.init = function (sc) { scene = sc; mats(); };

  const snap = v => Math.floor(v / GRID) * GRID + GRID / 2;
  const dirOf = r => [[0, -1], [1, 0], [0, 1], [-1, 0]][((r % 4) + 4) % 4];

  function boxMesh(w, h, d, m) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.castShadow = true; o.receiveShadow = true; return o; }

  function makeMesh(type) {
    const g = new THREE.Group();
    if (type === 'floor') {
      g.add(boxMesh(GRID, FLOOR_T, GRID, M.wood).translateY(FLOOR_T / 2));
      for (let i = 0; i < 4; i++) { const p = boxMesh(GRID - 0.05, 0.02, 0.04, M.woodDark); p.position.set(0, FLOOR_T + 0.005, -0.75 + i * 0.5); g.add(p); }
    } else if (type === 'wall' || type === 'stone') {
      const m = type === 'wall' ? M.wood : M.stone;
      g.add(boxMesh(GRID, WALL_H, 0.25, m).translateY(WALL_H / 2));
      if (type === 'wall') { for (const x of [-0.95, 0.95]) g.add(boxMesh(0.16, WALL_H, 0.3, M.woodDark).translateX(x).translateY(WALL_H / 2)); g.add(boxMesh(GRID, 0.14, 0.3, M.woodDark).translateY(WALL_H * 0.55)); }
      else for (let i = 0; i < 4; i++) { const l = boxMesh(GRID + 0.02, 0.04, 0.27, new THREE.MeshLambertMaterial({ color: 0x5a5652 })); l.position.y = 0.6 * (i + 1); g.add(l); }
    } else if (type === 'ramp') {
      const len = Math.hypot(GRID, WALL_H), ang = Math.atan2(WALL_H, GRID);
      const p = boxMesh(GRID, 0.2, len, M.wood); p.rotation.x = ang; p.position.set(0, WALL_H / 2, 0); g.add(p);
      // rises toward local -z
    } else if (type === 'torch') {
      g.add(boxMesh(0.14, 1.8, 0.14, M.woodDark).translateY(0.9));
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), M.crystal); c.position.y = 1.95; g.add(c);
    } else if (type === 'campfire') {
      for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), M.stone); const a = i / 6 * Math.PI * 2; s.position.set(Math.cos(a) * 0.65, 0.12, Math.sin(a) * 0.65); g.add(s); }
      for (let i = 0; i < 4; i++) { const l = boxMesh(0.16, 0.16, 1.1, M.woodDark); l.rotation.y = i / 4 * Math.PI; l.position.y = 0.12; g.add(l); }
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 6), M.flame); f.position.y = 0.55; g.add(f); g.userData.flame = f;
    }
    return g;
  }

  // geometry of a piece placed at cell (cx,cz), base height y0, rotation r
  function boxesFor(type, cx, cz, y0, r) {
    const [dx, dz] = dirOf(r);
    if (type === 'floor') return [{ x: cx, z: cz, hw: 1, hd: 1, y0, y1: y0 + FLOOR_T }];
    if (type === 'wall' || type === 'stone') {
      const x = cx + dx * (GRID / 2), z = cz + dz * (GRID / 2);
      return [dx === 0 ? { x, z, hw: 1, hd: 0.14, y0, y1: y0 + WALL_H } : { x, z, hw: 0.14, hd: 1, y0, y1: y0 + WALL_H }];
    }
    if (type === 'ramp') return [{ x: cx, z: cz, hw: 1, hd: 1, y0, y1: y0 + WALL_H, ramp: { dx, dz } }];
    if (type === 'torch') return [{ x: cx, z: cz, hw: 0.15, hd: 0.15, y0, y1: y0 + 1.9 }];
    if (type === 'campfire') return [{ x: cx, z: cz, hw: 0.6, hd: 0.6, y0, y1: y0 + 0.3, low: true }];
    return [];
  }
  function placeMeshTransform(o, type, cx, cz, y0, r) {
    const [dx, dz] = dirOf(r);
    if (type === 'wall' || type === 'stone') o.position.set(cx + dx * GRID / 2, y0, cz + dz * GRID / 2);
    else o.position.set(cx, y0, cz);
    // walls: local x runs along the edge; ramps rise toward local -z == dir
    o.rotation.y = (type === 'ramp') ? Math.atan2(-dx, -dz) : (dx === 0 ? 0 : Math.PI / 2);
  }

  B.add = function (type, cx, cz, y0, r, silent) {
    const mesh = makeMesh(type);
    placeMeshTransform(mesh, type, cx, cz, y0, r);
    scene.add(mesh);
    const s = { type, x: cx, z: cz, y0, r, mesh, boxes: [] };
    for (const b of boxesFor(type, cx, cz, y0, r)) { b.s = s; s.boxes.push(b); B.boxes.push(b); }
    if (type === 'torch' || type === 'campfire') {
      if (torchLights < 8) { const l = new THREE.PointLight(type === 'torch' ? 0x9ae0ff : 0xff8a30, type === 'torch' ? 1.1 : 1.6, 14, 2); l.position.set(cx, y0 + (type === 'torch' ? 2.1 : 1), cz); scene.add(l); s.light = l; torchLights++; }
    }
    B.list.push(s);
    return s;
  };
  B.remove = function (s) {
    scene.remove(s.mesh);
    if (s.light) { scene.remove(s.light); torchLights--; }
    B.list.splice(B.list.indexOf(s), 1);
    B.boxes = B.boxes.filter(b => b.s !== s);
  };
  B.serialize = () => B.list.map(s => [s.type, s.x, s.z, Math.round(s.y0 * 100) / 100, s.r]);
  B.load = function (arr) { for (const s of B.list.slice()) B.remove(s); for (const [t, x, z, y0, r] of arr || []) B.add(t, x, z, y0, r, true); };

  // ---------------------------------------------------------------- physics hooks
  function rampTop(b, x, z) {
    const { dx, dz } = b.ramp;
    // progress 0 at the low edge (opposite of dir) to 1 at the high edge
    const t = U.clamp(((x - b.x) * dx + (z - b.z) * dz) / GRID + 0.5, 0, 1);
    return b.y0 + t * (b.y1 - b.y0);
  }
  // highest walkable surface under (x,z) that the feet can step onto
  B.groundAt = function (x, z, feetY, r = 0.3) {
    let g = -Infinity;
    for (const b of B.boxes) {
      if (Math.abs(x - b.x) > b.hw + r * 0.5 || Math.abs(z - b.z) > b.hd + r * 0.5) continue;
      const top = b.ramp ? rampTop(b, x, z) : b.y1;
      if (top <= feetY + 0.55 && top > g) g = top;
    }
    return g;
  };
  // push a circle out of structure boxes that block at this height
  B.resolve = function (x, z, r, feetY) {
    for (const b of B.boxes) {
      if (b.ramp || b.low) continue;
      if (b.y1 <= feetY + 0.5 || b.y0 >= feetY + 1.7) continue;
      const qx = U.clamp(x, b.x - b.hw, b.x + b.hw), qz = U.clamp(z, b.z - b.hd, b.z + b.hd);
      const ex = x - qx, ez = z - qz, d = Math.hypot(ex, ez);
      if (d < r) {
        if (d > 1e-4) { x = qx + ex / d * r; z = qz + ez / d * r; }
        else { const px = b.hw - Math.abs(x - b.x), pz = b.hd - Math.abs(z - b.z); if (px < pz) x = b.x + Math.sign(x - b.x || 1) * (b.hw + r); else z = b.z + Math.sign(z - b.z || 1) * (b.hd + r); }
      }
    }
    return { x, z };
  };
  // ceiling check: lowest box bottom above the head
  B.ceilingAt = function (x, z, headY) {
    let c = Infinity;
    for (const b of B.boxes) {
      if (b.ramp || Math.abs(x - b.x) > b.hw || Math.abs(z - b.z) > b.hd) continue;
      if (b.y0 >= headY - 0.3 && b.y0 < c) c = b.y0;
    }
    return c;
  };
  function insideBox(p) {
    for (const b of B.boxes) {
      if (Math.abs(p.x - b.x) <= b.hw && Math.abs(p.z - b.z) <= b.hd) {
        const top = b.ramp ? rampTop(b, p.x, p.z) : b.y1;
        if (p.y >= b.y0 && p.y <= top) return b;
      }
    }
    return null;
  }
  // ray vs structures (for grappling): returns distance or -1
  B.rayHit = function (o, d, maxD) {
    const p = new THREE.Vector3();
    for (let t = 0.3; t < maxD; t += 0.15) { p.copy(o).addScaledVector(d, t); if (insideBox(p)) return t; }
    return -1;
  };

  // ---------------------------------------------------------------- placement
  // returns a placement plan {type, cx, cz, y0, r, ok, reason} or a removal target {remove: s}
  B.aim = function (camPos, dir, playerPos, type, rot, removing) {
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    const maxD = 16;
    let hit = null, prev = camPos.clone();
    for (let t = 1.0; t < maxD; t += 0.08) {
      p.copy(camPos).addScaledVector(dir, t);
      const bx = insideBox(p);
      if (bx) { hit = { box: bx, p: p.clone(), q: prev.clone() }; break; }
      if (p.y < World.height(p.x, p.z)) { hit = { terrain: true, p: p.clone(), q: prev.clone() }; break; }
      prev.copy(p);
    }
    if (!hit) return null;
    if (Math.hypot(hit.p.x - playerPos.x, hit.p.z - playerPos.z) > 10) return null;
    if (removing) return hit.box ? { remove: hit.box.s, p: hit.p } : null;
    if (type === 'dig' || type === 'fill') return hit.terrain ? { tool: type, x: hit.p.x, z: hit.p.z, y: hit.p.y } : null;
    q.copy(hit.q);
    const cx = snap(q.x), cz = snap(q.z);
    let y0;
    const surf = B.groundAt(cx, cz, q.y + 0.2, 0);
    let ter = World.height(cx, cz);
    if (type === 'floor' || type === 'ramp') for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ter = Math.max(ter, World.height(cx + ox * 0.9, cz + oz * 0.9));
    y0 = Math.max(ter, surf);
    if (hit.box && hit.q.y >= (hit.box.ramp ? hit.box.y0 : hit.box.y1) - 0.05) y0 = Math.max(y0, hit.box.ramp ? y0 : hit.box.y1);
    const plan = { type, cx, cz, y0, r: rot, ok: true, reason: '' };
    // overlap with an identical piece?
    const solo = t => t === 'ramp' || t === 'torch' || t === 'campfire';
    for (const s of B.list) {
      if (s.x !== cx || s.z !== cz || Math.abs(s.y0 - y0) > 0.3) continue;
      const same = s.type === type && (type === 'floor' || solo(type) || ((s.r - rot) % 4 + 4) % 4 === 0);
      if (same || (solo(type) && solo(s.type))) { plan.ok = false; plan.reason = 'Già occupato'; }
    }
    // don't trap the player
    if (type !== 'floor' && type !== 'ramp' && type !== 'campfire') {
      for (const b of boxesFor(type, cx, cz, y0, rot)) {
        if (Math.abs(playerPos.x - b.x) < b.hw + 0.45 && Math.abs(playerPos.z - b.z) < b.hd + 0.45 && playerPos.y < b.y1 && playerPos.y + 1.8 > b.y0) { plan.ok = false; plan.reason = 'Sei in mezzo'; }
      }
    }
    if (Math.hypot(cx, cz) < 12) { plan.ok = false; plan.reason = 'Non in piazza'; }
    return plan;
  };

  B.showGhost = function (plan, affordable) {
    if (!plan || plan.remove || plan.tool) { if (ghost) ghost.visible = false; return; }
    if (ghostType !== plan.type) {
      if (ghost) scene.remove(ghost);
      ghost = makeMesh(plan.type); ghostType = plan.type;
      ghost.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      scene.add(ghost);
    }
    const ok = plan.ok && affordable;
    ghost.traverse(o => { if (o.isMesh) o.material = ok ? M.ghostOk : M.ghostBad; });
    placeMeshTransform(ghost, plan.type, plan.cx, plan.cz, plan.y0 + 0.01, plan.r);
    ghost.visible = true;
  };
  B.hideGhost = () => { if (ghost) ghost.visible = false; };

  B.update = function (t) {
    for (const s of B.list) {
      if (s.mesh.userData.flame) { s.mesh.userData.flame.scale.y = 1 + Math.sin(t * 13 + s.x) * 0.15; s.mesh.userData.flame.rotation.y += 0.05; }
      if (s.light && s.type === 'campfire') s.light.intensity = 1.5 + Math.sin(t * 11 + s.z) * 0.15;
    }
  };

  window.Build = B;
})();
