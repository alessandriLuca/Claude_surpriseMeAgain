// Valdombra — loot: weapons & shields with rarity and random affixes, plus their 3D models.
(function () {
  const L = {};

  L.RARITY = [
    { id: 'common', name: 'Comune', color: '#c8c2b4', hex: 0xc8c2b4, affixes: 0, mult: 1.0 },
    { id: 'uncommon', name: 'Non comune', color: '#7fd67a', hex: 0x7fd67a, affixes: 1, mult: 1.12 },
    { id: 'rare', name: 'Rara', color: '#6fa8ff', hex: 0x6fa8ff, affixes: 2, mult: 1.25 },
    { id: 'epic', name: 'Epica', color: '#c27aff', hex: 0xc27aff, affixes: 3, mult: 1.4 },
    { id: 'legendary', name: 'Leggendaria', color: '#ffa33a', hex: 0xffa33a, affixes: 3, mult: 1.6 },
  ];

  // reach in meters, speed = attack speed multiplier
  L.WEAPONS = {
    traveler: { name: 'Spada del viandante', dmg: 12, speed: 1.0, reach: 2.6, len: 1.0, w: 0.07, col: 0xd0d8e0 },
    short: { name: 'Spada corta', dmg: 11, speed: 1.2, reach: 2.4, len: 0.8, w: 0.07, col: 0xd8dde4 },
    long: { name: 'Spada lunga', dmg: 16, speed: 0.95, reach: 2.9, len: 1.25, w: 0.08, col: 0xc8d0dc },
    great: { name: 'Spadone', dmg: 25, speed: 0.72, reach: 3.3, len: 1.6, w: 0.13, col: 0xa8b0bc },
    axe: { name: 'Ascia da guerra', dmg: 20, speed: 0.85, reach: 2.7, len: 0.9, w: 0.06, col: 0x9aa0a8, axe: true },
    saber: { name: 'Sciabola', dmg: 14, speed: 1.12, reach: 2.7, len: 1.1, w: 0.06, col: 0xe0e6ee, curved: true },
  };
  L.SHIELDS = {
    plank: { name: 'Scudo di assi', block: 0.5, stab: 22, bash: 10, shape: 'square', size: 0.5, col: 0x6a4a2a },
    round: { name: 'Scudo rotondo', block: 0.62, stab: 30, bash: 13, shape: 'round', size: 0.45, col: 0x7a5a3a },
    kite: { name: 'Scudo a goccia', block: 0.7, stab: 36, bash: 15, shape: 'kite', size: 0.55, col: 0x4a5a7a },
    tower: { name: 'Scudo a torre', block: 0.82, stab: 48, bash: 20, shape: 'tower', size: 0.7, col: 0x5a5a62 },
  };

  L.AFFIXES = {
    dmg: { slot: 'any', label: v => `+${v}% danno`, roll: r => 8 + Math.floor(r() * 18) },
    atkspd: { slot: 'weapon', label: v => `+${v}% velocità d'attacco`, roll: r => 6 + Math.floor(r() * 14) },
    leech: { slot: 'weapon', label: v => `Furto vita ${v}%`, roll: r => 3 + Math.floor(r() * 6) },
    fire: { slot: 'weapon', label: v => `Fuoco: +${v} danno bruciante`, roll: r => 4 + Math.floor(r() * 8) },
    crit: { slot: 'weapon', label: v => `+${v}% probabilità di critico`, roll: r => 5 + Math.floor(r() * 12) },
    hp: { slot: 'any', label: v => `+${v} vita massima`, roll: r => 10 + Math.floor(r() * 25) },
    stam: { slot: 'any', label: v => `+${v} stamina massima`, roll: r => 10 + Math.floor(r() * 20) },
    parry: { slot: 'shield', label: v => `+${v}% finestra di parata`, roll: r => 15 + Math.floor(r() * 30) },
    stun: { slot: 'shield', label: v => `+${v}% durata stordimento`, roll: r => 15 + Math.floor(r() * 35) },
    thorns: { slot: 'shield', label: v => `Spine: ${v} danni a chi colpisce lo scudo`, roll: r => 5 + Math.floor(r() * 10) },
  };

  const UNIQUES = {
    alpha: { kind: 'weapon', base: 'saber', name: 'Zanna di Zannagrigia', rarity: 4, affixes: { leech: 8, atkspd: 18, dmg: 15 } },
    knight: { kind: 'shield', base: 'tower', name: 'Egida del Cavaliere', rarity: 4, affixes: { parry: 50, stun: 50, thorns: 12 } },
    golem: { kind: 'weapon', base: 'great', name: 'Cuore di Pietra', rarity: 4, affixes: { dmg: 25, hp: 40, crit: 10 } },
  };

  let seq = 0;
  function uid() { return 'it' + Date.now().toString(36) + (seq++).toString(36) + Math.floor(Math.random() * 1e4).toString(36); }

  L.make = function (kind, base, rarity, affixes, name) {
    const B = kind === 'weapon' ? L.WEAPONS[base] : L.SHIELDS[base];
    return { id: uid(), kind, base, rarity, affixes: affixes || {}, name: name || B.name };
  };

  // power: 0..1 roughly floor/zone difficulty, boss: bool
  L.roll = function (power, opts = {}) {
    const r = Math.random;
    let rar = 0; const x = r() + power * 0.35 + (opts.boss ? 0.5 : 0);
    if (x > 1.25) rar = 4; else if (x > 1.0) rar = 3; else if (x > 0.8) rar = 2; else if (x > 0.5) rar = 1;
    if (opts.minRarity) rar = Math.max(rar, opts.minRarity);
    const kind = r() < 0.62 ? 'weapon' : 'shield';
    const pool = Object.keys(kind === 'weapon' ? L.WEAPONS : L.SHIELDS).filter(k => k !== 'traveler');
    const base = pool[Math.floor(r() * pool.length)];
    const aff = {};
    const keys = Object.keys(L.AFFIXES).filter(k => L.AFFIXES[k].slot === 'any' || L.AFFIXES[k].slot === kind);
    for (let i = 0; i < L.RARITY[rar].affixes; i++) {
      const k = keys.splice(Math.floor(r() * keys.length), 1)[0];
      aff[k] = Math.round(L.AFFIXES[k].roll(r) * L.RARITY[rar].mult);
    }
    const SUF = { 2: ['di Brina', 'del Vento', 'delle Rune'], 3: ['della Luna', 'delle Braci', 'del Lupo'], 4: ['della Notte Lunga', "dell'Alba", 'degli Antichi'] };
    const B = kind === 'weapon' ? L.WEAPONS[base] : L.SHIELDS[base];
    const name = SUF[rar] ? `${B.name} ${SUF[rar][Math.floor(r() * 3)]}` : B.name;
    return L.make(kind, base, rar, aff, name);
  };

  L.unique = function (boss) {
    const u = UNIQUES[boss]; if (!u) return null;
    return L.make(u.kind, u.base, u.rarity, Object.assign({}, u.affixes), u.name);
  };

  // derived numbers for UI and combat
  L.stats = function (it) {
    if (!it) return null;
    const m = L.RARITY[it.rarity].mult;
    if (it.kind === 'weapon') {
      const B = L.WEAPONS[it.base];
      return { dmg: Math.round(B.dmg * m * (1 + (it.affixes.dmg || 0) / 100)), speed: B.speed * (1 + (it.affixes.atkspd || 0) / 100), reach: B.reach };
    }
    const B = L.SHIELDS[it.base];
    return { block: Math.min(0.92, B.block + (it.rarity * 0.025)), stab: Math.round(B.stab * m), bash: Math.round(B.bash * m * (1 + (it.affixes.dmg || 0) / 100)) };
  };

  L.describe = function (it) {
    const s = L.stats(it); const lines = [];
    if (it.kind === 'weapon') lines.push(`Danno ${s.dmg} · Velocità ${s.speed.toFixed(2)} · Portata ${s.reach.toFixed(1)} m`);
    else lines.push(`Blocco ${Math.round(s.block * 100)}% · Stabilità ${s.stab} · Colpo di scudo ${s.bash}`);
    for (const k in it.affixes) lines.push(L.AFFIXES[k].label(it.affixes[k]));
    return lines;
  };

  L.scrapValue = it => ({ iron: 1 + it.rarity, gold: 5 + it.rarity * it.rarity * 8 });

  // ---------------------------------------------------------------- 3D models
  function lam(color, em) { return new THREE.MeshLambertMaterial({ color, emissive: em || 0x000000 }); }
  L.weaponMesh = function (it) {
    const B = L.WEAPONS[it.base];
    const g = new THREE.Group();
    const rc = L.RARITY[it.rarity];
    const em = it.rarity >= 2 ? new THREE.Color(rc.hex).multiplyScalar(it.rarity >= 3 ? 0.45 : 0.22).getHex() : 0x101820;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 6), lam(0x3a2418)); grip.position.y = -0.02; g.add(grip);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(B.axe ? 0.12 : 0.34, 0.05, 0.07), lam(it.rarity >= 3 ? rc.hex : 0xa08040)); guard.position.y = 0.1; g.add(guard);
    let blade;
    if (B.axe) {
      const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, B.len, 6), lam(0x5a4028)); haft.position.y = 0.1 + B.len / 2; g.add(haft);
      blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.03), lam(B.col, em)); blade.position.set(0.15, 0.1 + B.len - 0.12, 0); g.add(blade);
    } else {
      blade = new THREE.Mesh(new THREE.BoxGeometry(B.w, B.len, 0.025), lam(B.col, em)); blade.position.y = 0.12 + B.len / 2; g.add(blade);
      if (B.curved) { blade.rotation.z = 0.08; blade.position.x = 0.03; }
      const tip = new THREE.Mesh(new THREE.ConeGeometry(B.w * 0.72, 0.16, 4), lam(B.col, em)); tip.position.y = 0.12 + B.len + 0.08; tip.rotation.y = Math.PI / 4; tip.scale.z = 0.35; g.add(tip);
    }
    g.userData.blade = blade;
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  };
  L.shieldMesh = function (it) {
    const B = L.SHIELDS[it.base];
    const rc = L.RARITY[it.rarity];
    const g = new THREE.Group();
    const s = B.size;
    let face;
    if (B.shape === 'round') face = new THREE.Mesh(new THREE.CylinderGeometry(s, s, 0.06, 14), lam(B.col));
    else if (B.shape === 'kite') { face = new THREE.Mesh(new THREE.CylinderGeometry(s, s * 0.2, 0.06, 4), lam(B.col)); face.scale.set(0.8, 1, 1.4); }
    else face = new THREE.Mesh(new THREE.BoxGeometry(s * 1.6, 0.06, s * (B.shape === 'tower' ? 2.4 : 1.6)), lam(B.col));
    face.rotation.x = Math.PI / 2; g.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(s * 0.3, 0.04, 4, 10), lam(it.rarity >= 2 ? rc.hex : 0x8a8a90, it.rarity >= 3 ? new THREE.Color(rc.hex).multiplyScalar(0.4).getHex() : 0));
    rim.position.z = 0.05; g.add(rim);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), lam(0xb0b0b8)); boss.position.z = 0.06; g.add(boss);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  };

  window.Loot = L;
})();
