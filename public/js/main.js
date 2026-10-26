// Wires everything together: renderer, office, characters, live stream, UI.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildOffice, route } from './world.js';
import { Character } from './character.js';
import { decide, claim, release } from './behavior.js';
import { Fx } from './fx.js';
import { Dog, Cat } from './pet.js';
import { mountUI } from './ui.js';

// ---------- renderer & camera ----------
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
stage.appendChild(renderer.domElement);

const labels = new CSS2DRenderer();
labels.domElement.className = 'labels';
stage.appendChild(labels.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
const HOME_TARGET = new THREE.Vector3(0.5, 0.6, -0.5);
const homeCam = () => (innerWidth < 700 ? new THREE.Vector3(26, 26, 30) : new THREE.Vector3(16.5, 14, 18));
camera.position.copy(homeCam()).multiplyScalar(1.6);

const controls = new OrbitControls(camera, labels.domElement);
controls.target.copy(HOME_TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 7;
controls.maxDistance = 60;
controls.maxPolarAngle = 1.3;
controls.screenSpacePanning = false;

// ---------- light: warm late-afternoon ----------
scene.add(new THREE.HemisphereLight('#fff6ea', '#8a6a52', 1.25));
const sun = new THREE.DirectionalLight('#ffe0bd', 2.5);
sun.position.set(-14, 22, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 18, bottom: -18, near: 1, far: 70 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);
const fill = new THREE.DirectionalLight('#9fc0ff', 0.45);
fill.position.set(16, 9, -6);
scene.add(fill);
for (const x of [-8, -2, 9.5]) {
  const glow = new THREE.PointLight('#ffb070', 6, 9, 1.6);
  glow.position.set(x, 2.8, -8.6);
  scene.add(glow);
}

const world = buildOffice(scene);
const fx = new Fx(scene);
const dog = new Dog(scene, world);
const cat = new Cat(scene, world);
// handy in the console: officeStats() -> draw calls & triangles of the last frame
window.officeStats = () => ({ ...renderer.info.render, geometries: renderer.info.memory.geometries });

// ---------- characters ----------
const chars = new Map();
const deskOwner = new Map(); // deskId -> agentId
const gone = new Set(); // agents that already walked out; ignore until the server drops them
let selected = null;
let firstSnapshot = true;
let snapshot = { agents: [], feed: [] };

function assignDesk(agent) {
  const pools = agent.kind === 'lead' ? [world.leadDesks, world.desks] : [world.desks];
  for (const pool of pools) {
    const d = pool.find((x) => !deskOwner.has(x.id));
    if (d) {
      deskOwner.set(d.id, agent.id);
      return d;
    }
  }
  // office is full: share a desk
  return world.desks[chars.size % world.desks.length];
}

function think(c) {
  if (c.removing) return;
  const d = decide(c.agent, c, world, chars);
  if (!d?.spot) return;
  c.act = d.act;
  if (d.spot.id === c.spot?.id) return;
  claim(d.spot, c.id);
  const path = route(c.root.position, c.walking ? null : c.spot, d.spot);
  c.goTo(d.spot, path);
}

function removeChar(c) {
  if (c.removing) return;
  c.removing = true;
  release(c.id);
  for (const [k, v] of deskOwner) if (v === c.id) deskOwner.delete(k);
  c.goTo(world.door, route(c.root.position, c.walking ? null : c.spot, world.door));
  c.act = 'leaving';
}

function reconcile(s) {
  snapshot = s;
  const seen = new Set();
  for (const agent of s.agents) {
    seen.add(agent.id);
    let c = chars.get(agent.id);
    const prev = c?.agent;
    if (!c && gone.has(agent.id)) {
      if (agent.state === 'offline') continue;
      gone.delete(agent.id);
    }
    if (!c) {
      c = new Character(agent);
      c.desk = assignDesk(agent);
      c.onClick = select;
      scene.add(c.root);
      chars.set(agent.id, c);
      if (firstSnapshot) {
        c.setAgent(agent);
        const d = decide(agent, c, world, chars);
        c.placeAt(d.spot);
        c.act = d.act;
        claim(d.spot, c.id);
      } else {
        c.placeAt(world.door);
        fx.poof(world.door.pos, agent.color);
      }
    }
    c.setAgent(agent);
    if (prev) {
      if (agent.state === 'done' && prev.state !== 'done') fx.confetti(c.root.position);
      if (agent.stats.errors > prev.stats.errors) fx.sparks(c.root.position);
    }
  }
  for (const c of chars.values()) if (!seen.has(c.id)) removeChar(c);
  for (const c of chars.values()) think(c);
  firstSnapshot = false;

  ui.update(s);
  const lead = s.agents.find((a) => a.kind === 'lead' && a.state !== 'offline');
  world.drawWhiteboard(lead, s.agents.filter((a) => a.kind === 'sub' && (!lead || a.parentId === lead.id)));
  world.drawBoard(s.feed, {
    total: s.agents.length,
    active: s.agents.filter((a) => ['working', 'thinking', 'talking', 'waiting'].includes(a.state)).length,
    tools: s.agents.reduce((n, a) => n + a.stats.toolCalls, 0),
  });
}

// ---------- selection & camera focus ----------
let focus = null;
function select(id) {
  selected = id && chars.has(id) ? id : null;
  for (const c of chars.values()) c.setSelected(c.id === selected);
  ui.select(selected);
  focus = selected ? chars.get(selected) : null;
}
controls.addEventListener('start', () => (focus = null));

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects([...chars.values()].map((c) => c.root), true);
  return hits.find((h) => h.object.userData.charId)?.object.userData.charId || null;
}
let down = null;
labels.domElement.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
labels.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
  select(pick(e));
});
let hoverT = 0;
labels.domElement.addEventListener('pointermove', (e) => {
  const now = performance.now();
  if (now - hoverT < 60) return;
  hoverT = now;
  labels.domElement.style.cursor = pick(e) ? 'pointer' : '';
});

// ---------- UI & live stream ----------
const ui = mountUI({
  onSelect: select,
  onDemo: () => fetch('/api/demo', { method: 'POST' }),
  onReset: () => {
    select(null);
    fetch('/api/reset', { method: 'POST' });
  },
  onRecenter: () => {
    focus = null;
    camTween = { from: camera.position.clone(), to: homeCam(), tFrom: controls.target.clone(), t: 0 };
  },
});

function connect() {
  const es = new EventSource('/stream');
  es.addEventListener('snapshot', (e) => {
    ui.setConnection(true);
    reconcile(JSON.parse(e.data));
  });
  es.onerror = () => ui.setConnection(false);
}
connect();

// ---------- loop ----------
let camTween = { from: camera.position.clone(), to: homeCam(), tFrom: controls.target.clone(), t: 0 };
const SCREEN_MODE = {
  typing: 'typing', planning: 'typing', delegating: 'talking', terminal: 'terminal', reading: 'reading',
  searching: 'searching', browsing: 'browsing', supervising: 'supervising', thinking: 'thinking',
  asking: 'thinking', talking: 'talking', briefing: 'talking', reporting: 'talking', idle: 'idle',
};
function screenMode(desk) {
  const c = chars.get(deskOwner.get(desk.id));
  if (!c) return 'off';
  if (c.walking || c.spot !== desk.seat) return 'idle';
  return SCREEN_MODE[c.act] || 'idle';
}

function resize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  renderer.setSize(w, h);
  labels.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
let screenAcc = 0;
let thinkAcc = 0;
const ease = (x) => 1 - Math.pow(1 - x, 3);

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // intro dolly / recenter
  if (camTween) {
    camTween.t = Math.min(1, camTween.t + dt / 1.8);
    camera.position.lerpVectors(camTween.from, camTween.to, ease(camTween.t));
    controls.target.lerpVectors(camTween.tFrom, HOME_TARGET, ease(camTween.t));
    if (camTween.t >= 1) camTween = null;
  } else if (focus) {
    const p = focus.root.position;
    const desired = new THREE.Vector3(p.x, 0.8, p.z);
    const delta = desired.clone().sub(controls.target).multiplyScalar(1 - Math.exp(-dt * 3));
    controls.target.add(delta);
    camera.position.add(delta);
  }

  // who is someone talking to me? -> I turn my head to them
  for (const c of chars.values()) c.lookAt = null;
  for (const c of chars.values()) {
    const target = chars.get(c.agent.talkingTo);
    if (c.agent.state === 'talking' && target && !c.walking && c.root.position.distanceTo(target.root.position) < 3) {
      target.lookAt = c.root.position;
    }
  }

  // re-evaluate time-based behavior (celebration ending, etc.)
  thinkAcc += dt;
  if (thinkAcc > 1) {
    thinkAcc = 0;
    for (const c of chars.values()) think(c);
  }

  for (const c of [...chars.values()]) {
    c.update(dt, t);
    if (c.removing && !c.walking) {
      if (c.targetScale !== 0) fx.poof(c.root.position, c.agent.color);
      c.targetScale = 0;
      if (c.scale < 0.03) {
        c.dispose();
        chars.delete(c.id);
        gone.add(c.id);
        if (selected === c.id) select(null);
      }
    }
    if (c.agent.state === 'offline' && !c.walking && c.spot === world.door && !c.removing) {
      c.removing = true;
      release(c.id);
      for (const [k, v] of deskOwner) if (v === c.id) deskOwner.delete(k);
    }
  }

  screenAcc += dt;
  if (screenAcc > 1 / 12) {
    screenAcc = 0;
    world.drawScreens(t, screenMode);
  }

  // ping pong ball only flies when both players are at the table
  const atTable = [...chars.values()].filter((c) => c.act === 'pingpong' && !c.walking).length;
  world.updatePingPong(t, atTable === 2);
  const busy = [...chars.values()].filter((c) => !c.walking && c.desk && c.spot === c.desk.seat && c.agent.state === 'working').map((c) => c.desk);
  dog.update(dt, t, Date.now(), busy);
  cat.update(dt, t, Date.now(), busy, dog.root.position);

  fx.update(dt);
  controls.update();
  renderer.render(scene, camera);
  labels.render(scene, camera);
});
