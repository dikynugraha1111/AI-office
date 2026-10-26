// The office diorama: geometry, named "spots" characters can occupy, and a
// tiny corridor graph so walks go around desks instead of through them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { drawMonitor, drawWhiteboard, drawBoard } from './screens.js';

export const OFFICE_NAME = 'DIKY OFFICE';

const mats = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...opts }));
  return mats.get(key);
}

// geometries are cached by shape + size, so 50 identical chair legs share one buffer
const geos = new Map();
function geo(kind, ...args) {
  const key = kind + args.join(',');
  if (!geos.has(key)) geos.set(key, new THREE[kind](...args));
  return geos.get(key);
}

function mesh(g, color, opts) {
  const m = new THREE.Mesh(g, typeof color === 'string' ? mat(color, opts) : color);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const box = (w, h, d, color, opts) => mesh(geo('BoxGeometry', w, h, d), color, opts);
const cyl = (rt, rb, h, color, seg = 20, opts) => mesh(geo('CylinderGeometry', rt, rb, h, seg), color, opts);
const ball = (r, color, opts, ws = 16, hs = 12) => mesh(geo('SphereGeometry', r, ws, hs), color, opts);

function at(obj, x, y, z, parent) {
  obj.position.set(x, y, z);
  parent?.add(obj);
  return obj;
}

function canvasTex(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { canvas, ctx: canvas.getContext('2d'), tex };
}

// ---------- corridors ----------
// Horizontal walkways (z) and vertical ones (x). Every spot has an "exit" on one of them.
const H = [-7, -3.1, 1.6, 5.6];
const V = [-10, 5.5];
const X_RANGE = [-10, 11];
const Z_RANGE = [-7, 5.6];
const near = (a, b) => Math.abs(a - b) < 0.01;

function snapToCorridor(p) {
  let best = null;
  let bestD = Infinity;
  for (const z of H) {
    const x = THREE.MathUtils.clamp(p.x, X_RANGE[0], X_RANGE[1]);
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestD) [best, bestD] = [{ x, z }, d];
  }
  for (const x of V) {
    const z = THREE.MathUtils.clamp(p.z, Z_RANGE[0], Z_RANGE[1]);
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestD) [best, bestD] = [{ x, z }, d];
  }
  return best;
}

// Waypoints from a position (optionally sitting at `fromSpot`) to `toSpot`.
export function route(fromPos, fromSpot, toSpot) {
  const pts = [];
  const a = fromSpot ? fromSpot.exit : snapToCorridor(fromPos);
  const b = toSpot.exit;
  pts.push(a);
  const aH = H.find((z) => near(a.z, z));
  const bH = H.find((z) => near(b.z, z));
  if (aH !== undefined && aH === bH) {
    pts.push(b);
  } else {
    const aV = V.find((x) => near(a.x, x));
    const bV = V.find((x) => near(b.x, x));
    let vx;
    if (aV !== undefined && aH === undefined) vx = aV;
    else if (bV !== undefined && bH === undefined) vx = bV;
    else vx = V.reduce((m, x) => (Math.abs(a.x - x) + Math.abs(b.x - x) < Math.abs(a.x - m) + Math.abs(b.x - m) ? x : m));
    pts.push({ x: vx, z: a.z }, { x: vx, z: b.z }, b);
  }
  pts.push({ x: toSpot.pos.x, z: toSpot.pos.z });
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1] || fromPos;
    if (Math.hypot(p.x - last.x, p.z - last.z) > 0.05) out.push(new THREE.Vector3(p.x, 0, p.z));
  }
  return out;
}

const yawTo = (dx, dz) => Math.atan2(dx, dz);

// Merge every static mesh under `root` into one mesh per material.
// Hundreds of furniture parts become a few dozen draw calls.
function bake(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const old = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.live) return;
    const key = o.material.uuid + (o.castShadow ? ':c' : '');
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!buckets.has(key)) buckets.set(key, { material: o.material, cast: o.castShadow, list: [] });
    buckets.get(key).list.push(g);
    old.push(o);
  });
  old.forEach((o) => o.removeFromParent());
  for (const { material, cast, list } of buckets.values()) {
    const indexed = list.every((g) => g.index);
    const merged = mergeGeometries(indexed ? list : list.map((g) => (g.index ? g.toNonIndexed() : g)));
    list.forEach((g) => g.dispose());
    const m = new THREE.Mesh(merged, material);
    m.castShadow = cast;
    m.receiveShadow = true;
    root.add(m);
  }
}

// ---------- furniture ----------
function makeChair(seat = '#2a2d36') {
  const g = new THREE.Group();
  at(box(0.6, 0.1, 0.58, seat), 0, 0.5, 0, g);
  at(box(0.58, 0.62, 0.08, '#24262d'), 0, 0.92, 0.3, g).rotation.x = -0.08;
  at(box(0.5, 0.08, 0.05, seat), 0, 1.18, 0.33, g);
  for (const s of [-1, 1]) at(box(0.05, 0.05, 0.36, '#3a3d46'), s * 0.3, 0.72, 0.02, g);
  at(cyl(0.035, 0.035, 0.4, '#9aa0aa', 8, { metalness: 0.6, roughness: 0.3 }), 0, 0.27, 0, g);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = at(box(0.05, 0.04, 0.34, '#2a2d36'), Math.sin(a) * 0.17, 0.06, Math.cos(a) * 0.17, g);
    leg.rotation.y = a;
    at(ball(0.035, '#15161b', undefined, 8, 6), Math.sin(a) * 0.33, 0.035, Math.cos(a) * 0.33, g);
  }
  return g;
}

const LEAF = ['#4f8f45', '#6aab55', '#3f7a3a'];
function makePlant(scale = 1, potColor = '#efe9df', kind = 0) {
  const g = new THREE.Group();
  at(cyl(0.22, 0.16, 0.42, potColor, 16), 0, 0.21, 0, g);
  at(cyl(0.2, 0.2, 0.03, '#5a3f2b', 16), 0, 0.41, 0, g);
  if (kind === 1) {
    // snake plant: tall blades
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const b = at(box(0.08, 0.9 + (i % 3) * 0.2, 0.02, LEAF[i % 3]), Math.sin(a) * 0.07, 0.85, Math.cos(a) * 0.07, g);
      b.rotation.set(Math.cos(a) * 0.18, a, Math.sin(a) * 0.18);
    }
  } else {
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(geo('SphereGeometry', 0.18, 10, 8), mat(LEAF[i % 3]));
      m.scale.set(0.7, 1.5, 0.3);
      const a = (i / 9) * Math.PI * 2;
      m.position.set(Math.sin(a) * 0.16, 0.66 + (i % 3) * 0.13, Math.cos(a) * 0.16);
      m.rotation.set(Math.cos(a) * 0.55, a, -Math.sin(a) * 0.55);
      m.castShadow = true;
      g.add(m);
    }
  }
  g.scale.setScalar(scale);
  return g;
}

function makeGlobeLamp(x, z, parent) {
  at(cyl(0.006, 0.006, 0.5, '#222', 4), x, 4.75, z, parent);
  at(cyl(0.04, 0.04, 0.05, '#d8b46a', 10, { metalness: 0.8, roughness: 0.3 }), x, 4.5, z, parent);
  const bulb = new THREE.Mesh(geo('SphereGeometry', 0.15, 16, 10), new THREE.MeshBasicMaterial({ color: '#fff1d6' }));
  at(bulb, x, 4.35, z, parent);
}

function makeBookshelf(parent, x, z, rotY) {
  const g = new THREE.Group();
  const w = 2.6;
  for (const y of [0.05, 0.75, 1.45, 2.15, 2.85]) at(box(w, 0.06, 0.4, '#c89b6d'), 0, y, 0, g);
  for (const s of [-1, 1]) at(box(0.06, 2.9, 0.4, '#c89b6d'), s * (w / 2), 1.45, 0, g);
  const colors = ['#e0533d', '#3d8bff', '#f2c230', '#2bb3a3', '#7c5cff', '#efe9df', '#1d1f26', '#ff8a3d'];
  let k = 0;
  for (const y of [0.08, 0.78, 1.48, 2.18]) {
    let bx = -w / 2 + 0.12;
    while (bx < w / 2 - 0.3) {
      const bw = 0.06 + ((k * 7) % 5) * 0.015;
      const bh = 0.42 + ((k * 13) % 4) * 0.05;
      if (k % 9 === 4) {
        at(makePlant(0.35), bx + 0.15, y, 0, g);
        bx += 0.4;
      } else {
        const b = at(box(bw, bh, 0.28, colors[k % colors.length]), bx, y + bh / 2, 0, g);
        if (k % 11 === 7) b.rotation.z = 0.25;
        bx += bw + 0.01;
      }
      k++;
    }
  }
  g.rotation.y = rotY;
  return at(g, x, 0, z, parent);
}

function makeBeanbag(parent, x, z, color) {
  const b = at(ball(0.55, color, { roughness: 0.9 }, 20, 14), x, 0.3, z, parent);
  b.scale.set(1, 0.6, 1);
  const back = at(ball(0.42, color, { roughness: 0.9 }, 16, 12), x, 0.55, z - 0.3, parent);
  back.scale.set(1.1, 0.9, 0.6);
}

// ---------- textures ----------
function floorTexture() {
  const t = canvasTex(512, 512);
  const { ctx } = t;
  ctx.fillStyle = 'hsl(33, 42%, 70%)';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 16; i++) {
    for (let j = -1; j < 4; j++) {
      const l = 66 + ((i * 7 + j * 13) % 8);
      ctx.fillStyle = `hsl(${31 + ((i + j) % 3)}, 40%, ${l}%)`;
      ctx.fillRect(j * 128 + (i % 2) * 64, i * 32, 128, 32);
      ctx.fillStyle = 'rgba(90,60,30,0.18)';
      ctx.fillRect(j * 128 + (i % 2) * 64, i * 32, 2, 32);
    }
    ctx.fillStyle = 'rgba(90,60,30,0.22)';
    ctx.fillRect(0, i * 32, 512, 2);
  }
  t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping;
  t.tex.repeat.set(5, 4);
  return t.tex;
}

function skylineTexture() {
  const t = canvasTex(512, 320);
  const c = t.ctx;
  const g = c.createLinearGradient(0, 0, 0, 320);
  g.addColorStop(0, '#f6b5a0');
  g.addColorStop(0.45, '#fbd6a6');
  g.addColorStop(1, '#ffe9c7');
  c.fillStyle = g;
  c.fillRect(0, 0, 512, 320);
  c.fillStyle = 'rgba(255,248,225,0.95)';
  c.beginPath();
  c.arc(360, 150, 34, 0, Math.PI * 2);
  c.fill();
  // two layers of buildings with lit windows
  let seed = 7;
  const r = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (const [base, col, hmin, hmax] of [[320, '#c9a0a8', 60, 150], [320, '#7d6a86', 40, 120]]) {
    let x = -10;
    while (x < 520) {
      const w = 26 + r() * 40;
      const h = hmin + r() * (hmax - hmin);
      c.fillStyle = col;
      c.fillRect(x, base - h, w, h);
      if (col === '#7d6a86') {
        c.fillStyle = 'rgba(255,214,140,0.85)';
        for (let wy = base - h + 8; wy < base - 8; wy += 12) for (let wx = x + 5; wx < x + w - 6; wx += 9) if (r() > 0.55) c.fillRect(wx, wy, 4, 5);
      }
      x += w + 4;
    }
  }
  return t.tex;
}

function rugTexture() {
  const t = canvasTex(256, 256);
  const c = t.ctx;
  c.fillStyle = '#f3e7d3';
  c.fillRect(0, 0, 256, 256);
  const cols = ['#e0855a', '#2f5d57', '#e8b64c', '#c9d6cf'];
  for (let i = 0; i < 40; i++) {
    c.fillStyle = cols[i % cols.length];
    const x = (i * 53) % 256;
    const y = (i * 97) % 256;
    c.beginPath();
    if (i % 3 === 0) c.arc(x, y, 10 + (i % 4) * 4, 0, Math.PI * 2);
    else c.rect(x, y, 14 + (i % 5) * 4, 6);
    c.fill();
  }
  c.strokeStyle = '#2f5d57';
  c.lineWidth = 10;
  c.strokeRect(8, 8, 240, 240);
  return t.tex;
}

function neon(text, { w = 1024, h = 256, color = '#ff6b9a', glow = '#ff2f7a', font = 'bold 150px "Space Grotesk", sans-serif' } = {}) {
  const t = canvasTex(w, h);
  const c = t.ctx;
  c.font = font;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.shadowColor = glow;
  for (const blur of [40, 20, 6]) {
    c.shadowBlur = blur;
    c.fillStyle = color;
    c.fillText(text, w / 2, h / 2);
  }
  c.shadowBlur = 0;
  c.fillStyle = '#fff6fa';
  c.fillText(text, w / 2, h / 2);
  return new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, toneMapped: false, depthWrite: false });
}

function poster(colors, label) {
  const t = canvasTex(256, 340);
  const c = t.ctx;
  c.fillStyle = colors[0];
  c.fillRect(0, 0, 256, 340);
  c.fillStyle = colors[1];
  c.beginPath();
  c.arc(128, 140, 80, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = colors[2];
  c.fillRect(40, 200, 176, 26);
  c.font = 'bold 34px "Space Grotesk", sans-serif';
  c.textAlign = 'center';
  c.fillStyle = colors[3];
  c.fillText(label, 128, 290);
  return new THREE.MeshStandardMaterial({ map: t.tex, roughness: 0.6 });
}

export function buildOffice(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const screens = [];

  // ---------- shell ----------
  const floor = new THREE.Mesh(geo('BoxGeometry', 26, 0.4, 20), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.5 }));
  floor.position.set(0, -0.2, 0);
  floor.receiveShadow = true;
  root.add(floor);
  at(box(26.4, 0.6, 20.4, '#3b2b22'), 0, -0.55, 0, root);

  at(box(26, 5, 0.3, '#f4f1ec'), 0, 2.5, -10.15, root);
  at(box(0.3, 5, 20, '#a7b8a0'), -13.15, 2.5, 0, root); // sage accent wall
  at(box(26, 0.2, 0.36, '#e2dccf'), 0, 0.1, -9.9, root);
  at(box(0.36, 0.2, 20, '#8fa287'), -12.9, 0.1, 0, root);

  // big windows with a sunset skyline
  const skyMat = new THREE.MeshBasicMaterial({ map: skylineTexture() });
  for (const x of [-8, -2, 9.5]) {
    at(new THREE.Mesh(geo('PlaneGeometry', 4.4, 2.9), skyMat), x, 2.65, -9.98, root);
    for (const dx of [-2.2, -0.73, 0.73, 2.2]) at(box(0.07, 3.0, 0.1, '#1d1f26'), x + dx, 2.65, -9.92, root);
    for (const dy of [-1.45, 1.45]) at(box(4.5, 0.07, 0.1, '#1d1f26'), x, 2.65 + dy, -9.92, root);
    at(box(4.6, 0.08, 0.35, '#e2dccf'), x, 1.16, -9.82, root);
  }

  // neon signs
  // the big name sits above the windows, where the HUD never covers it
  const sign = new THREE.Mesh(geo('PlaneGeometry', 4.8, 1.2), neon(OFFICE_NAME));
  sign.userData.live = true;
  at(sign, -5, 4.55, -9.95, root);
  const chill = new THREE.Mesh(geo('PlaneGeometry', 2.8, 0.7), neon('stay chill ☕', { color: '#9ff0d8', glow: '#2bb3a3', font: 'italic bold 130px "Space Grotesk", sans-serif' }));
  chill.rotation.y = Math.PI / 2;
  chill.userData.live = true;
  at(chill, -12.96, 3.6, 1.8, root);
  const ship = new THREE.Mesh(geo('PlaneGeometry', 2.6, 0.65), neon('ship it ⚡', { color: '#ffd27a', glow: '#ff9a2f', font: 'italic bold 140px "Space Grotesk", sans-serif' }));
  ship.userData.live = true;
  at(ship, 3.7, 4.4, -9.95, root);

  // live activity board between the windows
  const board = canvasTex(640, 448);
  at(box(3.8, 2.7, 0.12, '#0b0d12'), 3.7, 2.55, -9.93, root);
  at(new THREE.Mesh(geo('PlaneGeometry', 3.6, 2.52), new THREE.MeshBasicMaterial({ map: board.tex, toneMapped: false })), 3.7, 2.55, -9.86, root);

  // whiteboard on the accent wall (lead's mission + sticky notes per subagent)
  const wb = canvasTex(768, 512);
  const wbMesh = new THREE.Mesh(geo('PlaneGeometry', 3.3, 2.2), new THREE.MeshStandardMaterial({ map: wb.tex, roughness: 0.4 }));
  wbMesh.rotation.y = Math.PI / 2;
  at(box(0.1, 2.4, 3.5, '#d9dce2', { metalness: 0.3 }), -12.95, 2.0, -2.2, root);
  at(wbMesh, -12.88, 2.0, -2.2, root);
  at(box(0.12, 0.06, 1.4, '#9aa0aa'), -12.85, 0.85, -2.2, root);

  // posters under the neon
  for (const [z, cols, label] of [[0.9, ['#2f5d57', '#e8b64c', '#e0855a', '#f3e7d3'], 'STAY CHILL'], [2.7, ['#e0855a', '#f3e7d3', '#2f5d57', '#1d1f26'], 'SHIP DAILY']]) {
    at(box(0.06, 1.42, 1.08, '#1d1f26'), -12.97, 1.9, z, root);
    const p = new THREE.Mesh(geo('PlaneGeometry', 0.98, 1.3), poster(cols, label));
    p.rotation.y = Math.PI / 2;
    at(p, -12.93, 1.9, z, root);
  }

  makeBookshelf(root, -12.75, -7.4, Math.PI / 2);

  // door
  at(box(0.15, 2.6, 1.4, '#2f5d57'), -12.95, 1.3, 5.6, root);
  for (const dz of [-0.75, 0.75]) at(box(0.2, 2.75, 0.12, '#1d1f26'), -12.92, 1.37, 5.6 + dz, root);
  at(box(0.2, 0.12, 1.6, '#1d1f26'), -12.92, 2.68, 5.6, root);
  at(ball(0.06, '#d8b46a', { metalness: 0.8, roughness: 0.3 }, 10, 8), -12.82, 1.2, 6.05, root);
  const exitSign = new THREE.Mesh(geo('PlaneGeometry', 0.7, 0.25), new THREE.MeshBasicMaterial({ color: '#36d27a' }));
  exitSign.rotation.y = Math.PI / 2;
  at(exitSign, -12.95, 3.05, 5.6, root);
  const mat_ = at(box(1.2, 0.03, 0.9, '#2f5d57'), -12.2, 0.015, 5.6, root);
  mat_.receiveShadow = true;

  // ---------- desks ----------
  function makeDesk(x, z, { lead = false, accent = '#ff8a3d', laptop = false } = {}) {
    const g = new THREE.Group();
    const w = lead ? 2.6 : 2.2;
    at(box(w, 0.06, 1.1, lead ? '#6b4a35' : '#f7f5f0'), 0, 0.76, 0, g);
    at(box(w, 0.025, 1.1, '#c89b6d'), 0, 0.72, 0, g);
    // A-frame oak legs
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = at(box(0.06, 0.76, 0.06, '#c89b6d'), sx * (w / 2 - 0.14), 0.37, sz * 0.38, g);
        leg.rotation.x = sz * 0.08;
      }
      at(box(0.05, 0.05, 0.8, '#c89b6d'), sx * (w / 2 - 0.14), 0.15, 0, g);
    }
    at(box(0.9, 0.012, 0.42, accent, { roughness: 0.9 }), 0, 0.795, 0.12, g); // desk mat
    // monitors on arms, facing the chair (+z)
    const monitors = lead ? [-0.58, 0.58] : [0];
    const scr = [];
    for (const mx of monitors) {
      at(box(0.04, 0.42, 0.04, '#2a2d36'), mx, 1.0, -0.42, g);
      at(box(0.04, 0.04, 0.16, '#2a2d36'), mx, 1.2, -0.36, g);
      at(box(1.04, 0.62, 0.04, '#15161b'), mx, 1.34, -0.28, g);
      const t = canvasTex(256, 160);
      const s = new THREE.Mesh(geo('PlaneGeometry', 0.97, 0.56), new THREE.MeshBasicMaterial({ map: t.tex, toneMapped: false }));
      at(s, mx, 1.34, -0.257, g);
      scr.push({ ...t, accent, seed: Math.floor(Math.random() * 1e6) });
    }
    at(box(0.56, 0.025, 0.17, '#f2f2f5'), 0, 0.81, 0.14, g); // keyboard
    at(box(0.09, 0.03, 0.14, '#f2f2f5'), 0.42, 0.81, 0.16, g); // mouse
    if (laptop && !lead) {
      at(box(0.42, 0.02, 0.3, '#c5cad3', { metalness: 0.5, roughness: 0.35 }), -0.72, 0.8, 0.0, g);
      const lid = at(box(0.42, 0.28, 0.015, '#c5cad3', { metalness: 0.5, roughness: 0.35 }), -0.72, 0.94, -0.15, g);
      lid.rotation.x = -0.25;
    }
    at(cyl(0.055, 0.05, 0.12, ['#ff8a3d', '#2f5d57', '#ffffff', '#e8b64c'][Math.floor(Math.random() * 4)], 12), w / 2 - 0.3, 0.85, 0.22, g);
    const p = at(makePlant(0.38, '#f7f5f0', Math.random() > 0.5 ? 1 : 0), w / 2 - 0.25, 0.79, -0.3, g);
    p.rotation.y = Math.random() * 6;
    if (lead) {
      const plate = at(box(0.5, 0.12, 0.04, '#d8b46a', { metalness: 0.7, roughness: 0.3 }), 0, 0.85, 0.5, g);
      plate.rotation.x = -0.3;
      // little rocket trophy
      at(cyl(0.05, 0.07, 0.24, '#e0533d', 12), -1.05, 0.91, -0.25, g);
      at(mesh(geo('ConeGeometry', 0.05, 0.12, 12), '#f3e7d3'), -1.05, 1.09, -0.25, g);
    }
    at(makeChair(lead ? '#e0855a' : accent), 0, 0, 0.95, g);
    at(g, x, 0, z, root);
    return { group: g, screens: scr };
  }

  // the cat's spot on a desk corner, reached by hopping up from the floor beside it
  const deskPerch = (id, x, z, w, exitZ) => {
    const fx = x - w / 2 - 0.3;
    return { id: `cat-${id}`, kind: 'desk', pos: new THREE.Vector3(fx, 0, z + 0.5), hops: [new THREE.Vector3(x - w / 2 + 0.22, 0.79, z + 0.32)], face: 0.9, exit: { x: fx, z: exitZ } };
  };

  const desks = [];
  const deskCols = [-7.5, -4, -0.5, 3];
  const deskRows = [-1.5, -5]; // front row first: new agents sit closer to the camera
  const exitZ = { [-5]: -3.1, [-1.5]: 1.6 };
  const accents = ['#e0855a', '#7c9cff', '#2bb3a3', '#ff7aa2', '#e8b64c', '#9b8cff', '#62c454', '#5aa9e6'];
  let n = 0;
  for (const z of deskRows) {
    for (const x of deskCols) {
      const d = makeDesk(x, z, { accent: accents[n % accents.length], laptop: n % 3 === 1 });
      desks.push({
        id: `desk-${n}`,
        lead: false,
        ...d,
        seat: { id: `desk-${n}`, kind: 'seat', pos: new THREE.Vector3(x, 0, z + 0.95), face: Math.PI, exit: { x, z: exitZ[z] } },
        side: (k) => sideSpot(x, z + 0.95, k, { x, z: exitZ[z] }),
        perch: deskPerch(`desk-${n}`, x, z, 2.2, exitZ[z]),
      });
      n++;
    }
  }
  const leadDesks = [];
  for (const [i, x] of [-1.5, 2.6].entries()) {
    const d = makeDesk(x, 3.5, { lead: true, accent: '#e8b64c' });
    leadDesks.push({
      id: `lead-${i}`,
      lead: true,
      ...d,
      seat: { id: `lead-${i}`, kind: 'seat', pos: new THREE.Vector3(x, 0, 4.45), face: Math.PI, exit: { x, z: 5.6 } },
      side: (k) => sideSpot(x, 4.45, k, { x, z: 5.6 }),
      perch: deskPerch(`lead-${i}`, x, 3.5, 2.6, 5.6),
    });
  }

  // standing spots around someone's seat, for conversations
  function sideSpot(x, z, k, exit) {
    const offs = [[1.0, 0.35], [-1.0, 0.35], [1.0, 1.05], [-1.0, 1.05], [0.0, 1.35]];
    const [dx, dz] = offs[k % offs.length];
    const pos = new THREE.Vector3(x + dx, 0, z + dz);
    return { id: `side-${x}-${z}-${k}`, kind: 'stand', pos, face: yawTo(x - pos.x, z - pos.z), exit };
  }

  // ---------- lounge ----------
  const rug = new THREE.Mesh(geo('CylinderGeometry', 2.7, 2.7, 0.03, 48), new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1 }));
  rug.scale.z = 0.72;
  rug.receiveShadow = true;
  at(rug, 8.8, 0.015, -3.0, root);
  // modular sofa facing the camera
  const sofa = '#3f6f66';
  at(box(3.8, 0.42, 1.1, sofa), 8.8, 0.28, -4.6, root);
  at(box(3.8, 0.8, 0.32, sofa), 8.8, 0.78, -5.06, root);
  for (const sx of [-1, 1]) at(box(0.32, 0.66, 1.1, sofa), 8.8 + sx * 1.9, 0.4, -4.6, root);
  for (const cx of [-1.15, 0, 1.15]) at(box(1.1, 0.14, 0.95, '#4c8076'), 8.8 + cx, 0.56, -4.5, root);
  at(box(0.5, 0.42, 0.15, '#e8b64c'), 7.4, 0.86, -4.85, root).rotation.z = 0.2;
  at(box(0.45, 0.4, 0.15, '#f3e7d3'), 8.6, 0.86, -4.88, root).rotation.z = -0.1;
  at(box(0.45, 0.38, 0.15, '#e0855a'), 10.1, 0.86, -4.85, root).rotation.z = -0.15;
  // round oak coffee table
  at(cyl(0.65, 0.65, 0.06, '#c89b6d', 32), 8.8, 0.42, -2.4, root);
  at(cyl(0.08, 0.12, 0.4, '#1d1f26', 12), 8.8, 0.2, -2.4, root);
  at(box(0.42, 0.04, 0.3, '#c5cad3', { metalness: 0.5, roughness: 0.35 }), 8.55, 0.47, -2.35, root);
  at(makePlant(0.32, '#e0855a'), 9.15, 0.45, -2.5, root);
  // arc floor lamp
  at(cyl(0.22, 0.22, 0.05, '#1d1f26', 20), 11.4, 0.025, -5.0, root);
  at(cyl(0.02, 0.02, 2.4, '#1d1f26', 8), 11.4, 1.2, -5.0, root);
  const arm = at(cyl(0.02, 0.02, 1.4, '#1d1f26', 8), 10.9, 2.5, -4.75, root);
  arm.rotation.z = Math.PI / 2.6;
  const shade = at(cyl(0.12, 0.3, 0.3, '#f3e7d3', 20), 10.3, 2.3, -4.5, root);
  shade.castShadow = false;
  // bean bags
  makeBeanbag(root, 7.0, -1.25, '#e0855a');
  makeBeanbag(root, 10.6, -1.25, '#9b8cff');

  // coffee bar + drinks fridge
  at(box(1.0, 1.0, 2.6, '#2f5d57'), 11.9, 0.5, 1.6, root);
  at(box(1.12, 0.06, 2.72, '#f4f1ec'), 11.9, 1.03, 1.6, root);
  at(box(0.5, 0.6, 0.45, '#c0c5cc', { metalness: 0.6, roughness: 0.3 }), 11.95, 1.36, 1.2, root);
  at(box(0.36, 0.08, 0.3, '#1d1f26'), 11.8, 1.2, 1.2, root);
  for (let i = 0; i < 3; i++) at(cyl(0.06, 0.05, 0.12, ['#fff', '#e0855a', '#2f5d57'][i], 12), 11.9, 1.12, 1.9 + i * 0.18, root);
  at(makePlant(0.35, '#f4f1ec', 1), 11.9, 1.06, 2.65, root);
  at(box(0.9, 2.0, 0.85, '#e9edf2', { metalness: 0.3, roughness: 0.3 }), 12.15, 1.0, -0.6, root);
  const glass = at(box(0.02, 1.7, 0.7, '#1d2a33', { metalness: 0.2, roughness: 0.1 }), 11.69, 1.05, -0.6, root);
  glass.castShadow = false;
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4; i++) {
      at(cyl(0.04, 0.04, 0.2, ['#ff7aa2', '#e8b64c', '#62c454', '#5aa9e6'][(row + i) % 4], 8), 11.75, 0.55 + row * 0.5, -0.85 + i * 0.16, root).castShadow = false;
    }
  }

  // ping pong table
  const tt = new THREE.Group();
  at(box(2.7, 0.06, 1.5, '#2c5aa0'), 0, 0.76, 0, tt);
  at(box(2.7, 0.065, 0.025, '#ffffff'), 0, 0.76, 0, tt);
  at(box(0.025, 0.065, 1.5, '#ffffff'), 0, 0.76, 0, tt);
  at(box(0.02, 0.16, 1.6, '#e9edf2', { transparent: true, opacity: 0.85 }), 0, 0.86, 0, tt);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) at(box(0.06, 0.73, 0.06, '#1d1f26'), sx * 1.2, 0.365, sz * 0.62, tt);
  at(tt, 9, 0, 4.1, root);
  const pingBall = new THREE.Mesh(geo('SphereGeometry', 0.045, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  pingBall.visible = false;
  scene.add(pingBall);

  // arcade cabinet
  const arc = new THREE.Group();
  at(box(0.8, 1.9, 0.8, '#7c5cff'), 0, 0.95, 0, arc);
  at(box(0.82, 0.25, 0.82, '#1d1f26'), 0, 1.95, 0, arc);
  at(box(0.7, 0.12, 0.35, '#1d1f26'), 0, 1.08, 0.45, arc).rotation.x = 0.3;
  for (const [bx, c] of [[-0.15, '#ff5c8a'], [0.05, '#e8b64c'], [0.2, '#62c454']]) at(ball(0.04, c, undefined, 8, 6), bx, 1.16, 0.5, arc);
  const arcScr = new THREE.Mesh(geo('PlaneGeometry', 0.6, 0.5), new THREE.MeshBasicMaterial({ color: '#5ef2ff', toneMapped: false }));
  arcScr.rotation.x = -0.15;
  at(arcScr, 0, 1.5, 0.41, arc);
  arc.rotation.y = -Math.PI / 2;
  at(arc, 12.2, 0, 7.8, root);

  // office dog bed
  at(cyl(0.7, 0.75, 0.18, '#e0855a', 24), -6.5, 0.09, 8.0, root);
  at(cyl(0.55, 0.55, 0.1, '#f3e7d3', 24), -6.5, 0.16, 8.0, root);

  // cat tree between the bookshelf and the whiteboard
  const tree = new THREE.Group();
  at(box(0.8, 0.08, 0.8, '#8fd1c2'), 0, 0.04, 0, tree);
  at(cyl(0.08, 0.08, 1.9, '#d9c09a', 12), 0, 0.98, 0, tree);
  at(box(0.5, 0.42, 0.5, '#8fd1c2'), -0.12, 0.29, -0.1, tree);
  at(cyl(0.11, 0.11, 0.02, '#2f5d57', 16), -0.12, 0.27, 0.15, tree).rotation.x = Math.PI / 2;
  at(cyl(0.3, 0.3, 0.06, '#8fd1c2', 20), 0.35, 0.75, 0.25, tree);
  at(cyl(0.36, 0.36, 0.06, '#8fd1c2', 20), 0, 1.95, 0, tree);
  at(box(0.006, 0.4, 0.006, '#1d1f26'), 0.55, 0.52, 0.3, tree);
  at(ball(0.05, '#ff5c8a', undefined, 8, 6), 0.55, 0.3, 0.3, tree);
  at(tree, -12.35, 0, -5.3, root);

  // cardboard box (the cat's favourite) and a patch of sunlight by the window
  const cbox = new THREE.Group();
  const kraft = '#c99a63';
  at(box(0.72, 0.02, 0.58, kraft), 0, 0.01, 0, cbox);
  for (const s of [-1, 1]) {
    at(box(0.72, 0.32, 0.02, kraft), 0, 0.16, s * 0.29, cbox);
    at(box(0.02, 0.32, 0.58, kraft), s * 0.36, 0.16, 0, cbox);
    at(box(0.72, 0.02, 0.24, '#d6a970'), 0, 0.36, s * 0.38, cbox).rotation.x = s * 0.6;
    at(box(0.2, 0.02, 0.58, '#d6a970'), s * 0.44, 0.35, 0, cbox).rotation.z = -s * 0.7;
  }
  at(box(0.73, 0.06, 0.005, '#e8d4a8'), 0, 0.24, 0.296, cbox); // tape
  cbox.rotation.y = 0.25;
  at(cbox, -3.6, 0, 8.3, root);
  const sun = new THREE.Mesh(geo('PlaneGeometry', 1.7, 1.3), new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.32, depthWrite: false }));
  sun.rotation.set(-Math.PI / 2, 0, 0.35);
  at(sun, -1.5, 0.012, -8.15, root);

  // decor plants
  for (const [x, z, s, k] of [[-12.2, -9.3, 1.7, 0], [12.2, -9.3, 1.9, 1], [-12.2, 8.6, 1.5, 0], [12.3, -7.2, 1.3, 0], [6.2, -9.3, 1.1, 1], [0.8, -9.3, 1.0, 0], [-4.95, -9.3, 1.0, 1], [12.3, 5.4, 1.2, 1], [-9.0, 8.6, 1.1, 1]]) {
    at(makePlant(s, k ? '#2f5d57' : '#efe9df', k), x, 0, z, root);
  }
  for (const x of [-5.75, -2.25, 1.25]) makeGlobeLamp(x, -3.25, root);

  bake(root);

  // string lights along the top of both walls: one instanced draw call
  const bulbs = [];
  const swag = (from, to, n, sag) => {
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const seg = (f * 6) % 1;
      bulbs.push(new THREE.Vector3().lerpVectors(from, to, f).add({ x: 0, y: -Math.sin(seg * Math.PI) * sag, z: 0 }));
    }
  };
  swag(new THREE.Vector3(-12.85, 4.75, -9.85), new THREE.Vector3(12.8, 4.75, -9.85), 72, 0.3);
  swag(new THREE.Vector3(-12.85, 4.75, -9.85), new THREE.Vector3(-12.85, 4.75, 9.8), 56, 0.3);
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffe2a8', toneMapped: false }), bulbs.length);
  const m4 = new THREE.Matrix4();
  bulbs.forEach((p, i) => lights.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
  root.add(lights);

  // ---------- idle & special spots ----------
  const idleSpots = [
    ...[7.6, 8.8, 10.0].map((x, i) => ({ id: `sofa-${i}`, kind: 'sofa', pos: new THREE.Vector3(x, 0, -4.35), face: 0, exit: { x, z: -3.1 } })),
    { id: 'beanbag-0', kind: 'beanbag', pos: new THREE.Vector3(7.0, 0, -1.2), face: 0, exit: { x: 7.0, z: 1.6 } },
    { id: 'beanbag-1', kind: 'beanbag', pos: new THREE.Vector3(10.6, 0, -1.2), face: 0, exit: { x: 10.6, z: 1.6 } },
    { id: 'coffee', kind: 'stand', act: 'coffee', pos: new THREE.Vector3(10.9, 0, 1.6), face: Math.PI / 2, exit: { x: 10.9, z: 1.6 } },
    { id: 'coffee-2', kind: 'stand', act: 'coffee', pos: new THREE.Vector3(10.9, 0, 2.5), face: Math.PI / 2 + 0.4, exit: { x: 10.9, z: 1.6 } },
    { id: 'pingpong-0', kind: 'stand', act: 'pingpong', pos: new THREE.Vector3(7.15, 0, 4.1), face: Math.PI / 2, exit: { x: 7.15, z: 5.6 } },
    { id: 'pingpong-1', kind: 'stand', act: 'pingpong', pos: new THREE.Vector3(10.85, 0, 4.1), face: -Math.PI / 2, exit: { x: 10.85, z: 5.6 } },
    { id: 'arcade', kind: 'stand', act: 'arcade', pos: new THREE.Vector3(11.1, 0, 7.8), face: Math.PI / 2, exit: { x: 11, z: 5.6 } },
    ...[-8, -2.5, 9.5].map((x, i) => ({ id: `window-${i}`, kind: 'stand', act: 'window', pos: new THREE.Vector3(x, 0, -8.7), face: Math.PI, exit: { x, z: -7 } })),
    { id: 'bookshelf', kind: 'stand', act: 'reading-shelf', pos: new THREE.Vector3(-11.9, 0, -7.4), face: -Math.PI / 2, exit: { x: -10, z: -7.4 } },
  ];
  const whiteboard = { id: 'whiteboard', kind: 'stand', act: 'whiteboard', pos: new THREE.Vector3(-12.1, 0, -2.2), face: -Math.PI / 2, exit: { x: -10, z: -2.2 } };
  const door = { id: 'door', kind: 'stand', act: 'door', pos: new THREE.Vector3(-12.3, 0, 5.6), face: -Math.PI / 2, exit: { x: -10, z: 5.6 } };
  const dogSpots = [
    { id: 'dog-bed', kind: 'bed', pos: new THREE.Vector3(-6.5, 0, 8.0), face: 0.4, exit: { x: -6.5, z: 5.6 } },
    { id: 'dog-lounge', kind: 'sit', pos: new THREE.Vector3(8.8, 0, -1.3), face: 0, exit: { x: 8.8, z: 1.6 } },
    { id: 'dog-coffee', kind: 'sit', pos: new THREE.Vector3(10.2, 0, 3.2), face: Math.PI / 2, exit: { x: 10.2, z: 1.6 } },
    { id: 'dog-window', kind: 'sit', pos: new THREE.Vector3(-5.0, 0, -8.6), face: Math.PI, exit: { x: -5.0, z: -7 } },
    { id: 'dog-front', kind: 'sit', pos: new THREE.Vector3(0.5, 0, 7.2), face: 0, exit: { x: 0.5, z: 5.6 } },
  ];
  // `pos` is on the floor; `hops` are the jumps from there up to where the cat settles
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const catSpots = [
    { id: 'cat-box', kind: 'box', pos: V3(-3.45, 0, 7.6), hops: [V3(-3.63, 0.03, 8.2)], face: 0.25, exit: { x: -3.45, z: 5.6 } },
    { id: 'cat-sun', kind: 'sleep', pos: V3(-1.4, 0, -8.15), face: 2.2, exit: { x: -1.4, z: -7 } },
    { id: 'cat-tree', kind: 'loaf', pos: V3(-11.5, 0, -4.9), hops: [V3(-12.0, 0.78, -5.05), V3(-12.35, 1.98, -5.3)], face: Math.PI / 2, exit: { x: -10, z: -4.9 } },
    { id: 'cat-shelf', kind: 'loaf', pos: V3(-11.5, 0, -4.9), hops: [V3(-12.0, 0.78, -5.05), V3(-12.35, 1.98, -5.3), V3(-12.72, 2.88, -6.55)], face: Math.PI / 2, exit: { x: -10, z: -4.9 } },
    { id: 'cat-sofa', kind: 'loaf', pos: V3(6.3, 0, -4.2), hops: [V3(6.9, 0.73, -4.45), V3(7.4, 1.18, -5.06)], face: Math.PI / 2, exit: { x: 6.3, z: -3.1 } },
    { id: 'cat-window', kind: 'sit', pos: V3(10.7, 0, -8.5), face: Math.PI, exit: { x: 10.7, z: -7 } },
  ];

  for (const d of [...desks, ...leadDesks]) screens.push(...d.screens.map((s) => ({ ...s, desk: d })));

  return {
    root,
    desks,
    leadDesks,
    idleSpots,
    whiteboard,
    door,
    dogSpots,
    catSpots,
    screens,
    // ball flies between the two ping pong players while both are at the table
    updatePingPong(t, playing) {
      pingBall.visible = playing;
      if (!playing) return;
      const f = (Math.sin(t * 3.2) + 1) / 2;
      pingBall.position.set(7.75 + f * 2.5, 0.85 + Math.abs(Math.sin(t * 6.4)) * 0.45, 4.1 + Math.sin(t * 1.7) * 0.35);
    },
    drawScreens(t, modeForDesk) {
      for (const s of screens) {
        const mode = modeForDesk(s.desk);
        drawMonitor(s.ctx, 256, 160, mode, t, s.seed, s.accent);
        s.tex.needsUpdate = true;
      }
    },
    drawWhiteboard(lead, team) {
      drawWhiteboard(wb.ctx, 768, 512, lead, team);
      wb.tex.needsUpdate = true;
    },
    drawBoard(feed, counts) {
      drawBoard(board.ctx, 640, 448, feed, counts);
      board.tex.needsUpdate = true;
    },
  };
}
