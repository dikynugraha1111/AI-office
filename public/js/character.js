// Procedural chibi characters. No model files: every part is a primitive, and
// every animation is a pose computed per frame from (mode, activity, time).
// Geometries are shared between all characters, and only the big parts cast
// shadows, so extra detail stays cheap.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mat } from './world.js';

const FUR = {
  cat: '#f4a259', bear: '#9a6a45', bunny: '#f3eee6', frog: '#7cc66b',
  robot: '#b9c5d6', panda: '#f7f6f2', fox: '#f08a3c',
};
const JEANS = ['#3b4a6b', '#2d3446', '#5b6b8c', '#4a3f35'];
const SHOE = ['#e0533d', '#2bb3a3', '#e8b64c', '#7c5cff', '#1d1f26'];

export const ACT_LABEL = {
  typing: 'Ngoding', terminal: 'Di terminal', reading: 'Membaca', searching: 'Mencari',
  browsing: 'Browsing', planning: 'Merencanakan', delegating: 'Membagi tugas',
  supervising: 'Mengawasi tim', thinking: 'Berpikir', briefing: 'Briefing', reporting: 'Melapor',
  talking: 'Ngobrol', asking: 'Butuh kamu!', celebrating: 'Selesai!', idle: 'Santai', leaving: 'Pulang',
};

const geos = new Map();
function G(kind, ...args) {
  const key = kind + args.join(',');
  if (!geos.has(key)) geos.set(key, kind === 'RoundedBox' ? new RoundedBoxGeometry(...args) : new THREE[kind](...args));
  return geos.get(key);
}
function part(geo, color, { shadow = false, ...opts } = {}) {
  const m = new THREE.Mesh(geo, typeof color === 'string' ? mat(color, opts) : color);
  m.castShadow = shadow;
  return m;
}
const sphere = (r, c, o) => part(G('SphereGeometry', r, 16, 12), c, o);
const capsule = (r, l, c, o) => part(G('CapsuleGeometry', r, l, 4, 10), c, o);
const boxp = (w, h, d, c, o) => part(G('BoxGeometry', w, h, d), c, o);
const add = (parent, m, x = 0, y = 0, z = 0) => {
  m.position.set(x, y, z);
  parent.add(m);
  return m;
};

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return '#' + c.getHexString();
}

function accessoryFor(agent) {
  if (agent.kind === 'lead') return 'sunglasses';
  if (agent.species === 'robot') return 'none';
  const r = String(agent.role || '');
  if (/explor|research|search/i.test(r)) return 'cap';
  if (/front|web|ui|design|css/i.test(r)) return 'beanie';
  if (/test|qa|review|plan|architect/i.test(r)) return 'glasses';
  return 'headphones';
}

const POSE_KEYS = ['bodyY', 'lean', 'legL', 'legR', 'armLx', 'armLz', 'armRx', 'armRz', 'headX', 'headY', 'headZ', 'brow', 'mouth'];

export class Character {
  constructor(agent) {
    this.id = agent.id;
    this.agent = agent;
    this.seed = [...agent.id].reduce((s, c) => s * 31 + c.charCodeAt(0), 7) >>> 0;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.pose = Object.fromEntries(POSE_KEYS.map((k) => [k, 0]));
    this.path = [];
    this.speed = 2.6;
    this.yaw = 0;
    this.targetYaw = 0;
    this.spot = null;
    this.mode = 'stand';
    this.act = 'idle';
    this.lookAt = null;
    this.scale = 0;
    this.targetScale = 1;
    this.nextBlink = 1 + Math.random() * 3;
    this.build(agent);
    this.buildTag(agent);
    this.root.traverse((o) => (o.userData.charId = this.id));
  }

  build(agent) {
    const species = agent.species || 'cat';
    const fur = FUR[species] || '#f4a259';
    const hoodie = agent.color || '#1f2433';
    const cuff = shade(hoodie, -0.08);
    const pants = agent.kind === 'lead' ? '#2a2d36' : JEANS[this.seed % JEANS.length];
    const shoe = agent.kind === 'lead' ? '#f2c230' : SHOE[(this.seed >> 3) % SHOE.length];
    const B = this.body;

    // legs + two-tone sneakers
    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    for (const [leg, x] of [[this.legL, -0.11], [this.legR, 0.11]]) {
      leg.position.set(x, 0.42, 0);
      add(leg, capsule(0.088, 0.2, pants, { shadow: true }), 0, -0.18, 0);
      const top = add(leg, sphere(0.095, shoe), 0, -0.35, 0.04);
      top.scale.set(1, 0.65, 1.35);
      const sole = add(leg, boxp(0.17, 0.05, 0.27, '#ffffff'), 0, -0.4, 0.05);
      sole.scale.y = 1;
      B.add(leg);
    }

    // torso (hoodie) with hood, pocket, strings
    const torso = add(B, capsule(0.25, 0.22, hoodie, { shadow: true }), 0, 0.68, 0);
    torso.scale.set(1.08, 1, 0.92);
    const hood = add(B, sphere(0.2, cuff), 0, 0.93, -0.16);
    hood.scale.set(1.35, 0.65, 0.8);
    add(B, boxp(0.3, 0.11, 0.04, cuff), 0, 0.57, 0.225);
    for (const x of [-0.06, 0.06]) add(B, part(G('CylinderGeometry', 0.008, 0.008, 0.16, 4), '#ffffff'), x, 0.86, 0.23);
    const patch = add(B, part(G('CircleGeometry', 0.05, 16), shade(hoodie, 0.25)), -0.12, 0.8, 0.236);
    patch.rotation.y = -0.15;
    if (agent.kind === 'lead') {
      add(B, part(G('OctahedronGeometry', 0.06), '#f2c230', { metalness: 0.8, roughness: 0.25 }), 0.12, 0.8, 0.24);
      const chain = add(B, part(G('TorusGeometry', 0.17, 0.012, 6, 24), '#f2c230', { metalness: 0.9, roughness: 0.2 }), 0, 0.93, 0.05);
      chain.rotation.x = Math.PI / 2 - 0.35;
    }

    // tail
    if (species === 'cat' || species === 'fox') {
      const tail = new THREE.Group();
      tail.position.set(0, 0.5, -0.22);
      const t1 = add(tail, capsule(species === 'fox' ? 0.08 : 0.05, 0.3, fur), 0, 0.12, -0.08);
      t1.rotation.x = -0.7;
      if (species === 'fox') add(tail, sphere(0.075, '#fff3e6'), 0, 0.3, -0.24);
      B.add(tail);
      this.tail = tail;
    } else if (['bear', 'panda', 'bunny'].includes(species)) {
      add(B, sphere(species === 'bunny' ? 0.08 : 0.06, species === 'panda' ? '#1d1d22' : species === 'bunny' ? '#ffffff' : fur), 0, 0.48, -0.24);
    } else if (species === 'robot') {
      add(B, part(G('RoundedBox', 0.3, 0.32, 0.12, 2, 0.03), '#8e9aad', { metalness: 0.5, roughness: 0.35 }), 0, 0.72, -0.27);
    }

    // arms with cuffs and paws
    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    for (const [arm, x] of [[this.armL, -0.3], [this.armR, 0.3]]) {
      arm.position.set(x, 0.86, 0);
      add(arm, capsule(0.078, 0.22, hoodie), 0, -0.15, 0);
      add(arm, part(G('CylinderGeometry', 0.082, 0.082, 0.05, 12), cuff), 0, -0.29, 0);
      add(arm, sphere(0.072, species === 'robot' ? '#8e9aad' : fur), 0, -0.36, 0);
      B.add(arm);
    }
    // props held in the right / left paw
    this.props = {
      mug: add(this.armR, part(G('CylinderGeometry', 0.055, 0.045, 0.12, 12), '#ffffff'), 0, -0.4, 0.06),
      phone: add(this.armR, boxp(0.1, 0.17, 0.02, '#15161b'), -0.02, -0.42, 0.07),
      paddle: add(this.armR, part(G('CylinderGeometry', 0.1, 0.1, 0.02, 16), '#e0533d'), 0, -0.52, 0.04),
      book: add(this.armL, boxp(0.2, 0.26, 0.05, '#2bb3a3'), 0.05, -0.42, 0.08),
    };
    this.props.phone.rotation.x = -0.6;
    this.props.paddle.rotation.x = Math.PI / 2;
    for (const p of Object.values(this.props)) p.visible = false;

    // head
    this.head = new THREE.Group();
    this.head.position.y = 1.0;
    B.add(this.head);
    const H = this.head;
    this.eyes = [];
    this.brows = [];

    if (species === 'robot') {
      add(H, part(G('RoundedBox', 0.62, 0.52, 0.52, 4, 0.12), fur, { metalness: 0.5, roughness: 0.35, shadow: true }), 0, 0.3, 0);
      add(H, part(G('RoundedBox', 0.5, 0.24, 0.05, 3, 0.04), '#14161f', { metalness: 0.2, roughness: 0.2 }), 0, 0.32, 0.25);
      for (const x of [-0.11, 0.11]) {
        const e = add(H, new THREE.Mesh(G('CapsuleGeometry', 0.03, 0.04, 4, 8), new THREE.MeshBasicMaterial({ color: '#5ef2ff' })), x, 0.33, 0.28);
        this.eyes.push(e);
      }
      for (const x of [-0.33, 0.33]) {
        const bolt = add(H, part(G('CylinderGeometry', 0.05, 0.05, 0.06, 12), '#8e9aad', { metalness: 0.6 }), x, 0.3, 0);
        bolt.rotation.z = Math.PI / 2;
      }
      add(H, part(G('CylinderGeometry', 0.015, 0.015, 0.2, 6), '#888'), 0, 0.65, 0);
      this.antenna = add(H, new THREE.Mesh(G('SphereGeometry', 0.05, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff5c8a' })), 0, 0.77, 0);
      this.mouthOpen = add(H, boxp(0.12, 0.03, 0.02, '#5ef2ff'), 0, 0.23, 0.28);
      this.mouthOpen.material = new THREE.MeshBasicMaterial({ color: '#5ef2ff' });
    } else {
      const skull = add(H, sphere(0.33, fur, { shadow: true }), 0, 0.3, 0);
      skull.scale.set(1.06, 0.93, 0.96);
      const muzzleY = 0.2;
      if (species !== 'frog') {
        const muzzle = add(H, sphere(0.13, species === 'fox' || species === 'cat' ? '#fff3e6' : shade(fur, 0.12)), 0, muzzleY, 0.27);
        muzzle.scale.set(1.2, 0.8, 0.7);
        const nose = add(H, sphere(0.035, species === 'bunny' ? '#ff8fa8' : '#2a1f1d'), 0, 0.25, 0.37);
        nose.scale.set(1.2, 0.8, 0.8);
      }
      if (species === 'cat') {
        for (const s of [-1, 1]) {
          for (const dy of [-0.02, 0.02]) {
            const w = add(H, boxp(0.14, 0.006, 0.006, '#5a4030'), s * 0.2, 0.22 + dy, 0.31);
            w.rotation.z = s * dy * 4;
          }
        }
      }
      // mouth: a little smile, swapped for an open mouth while talking
      const smileZ = species === 'frog' ? 0.31 : 0.355;
      const smileY = species === 'frog' ? 0.2 : 0.155;
      this.smile = add(H, part(G('TorusGeometry', 0.035, 0.009, 6, 12, Math.PI), '#2a1f1d'), 0, smileY + 0.02, smileZ);
      this.smile.rotation.z = Math.PI;
      this.mouthOpen = add(H, sphere(0.04, '#5c2a2a'), 0, smileY, smileZ - 0.01);
      this.mouthOpen.scale.set(1, 0.1, 0.4);

      const eyeY = species === 'frog' ? 0.58 : 0.35;
      const eyeZ = species === 'frog' ? 0.22 : 0.29;
      for (const x of [-0.12, 0.12]) {
        const ex = species === 'frog' ? x * 1.3 : x;
        if (species === 'frog') add(H, sphere(0.11, fur), ex, 0.52, 0.1);
        if (species === 'panda') {
          const patchE = add(H, sphere(0.078, '#1d1d22'), x, 0.34, 0.27);
          patchE.scale.set(1, 1.3, 0.6);
          patchE.rotation.z = x > 0 ? -0.5 : 0.5;
        }
        const e = add(H, sphere(0.05, '#16171d'), ex, eyeY, eyeZ);
        add(e, sphere(0.017, '#ffffff'), 0.017, 0.02, 0.038);
        add(e, sphere(0.008, '#ffffff'), -0.015, -0.015, 0.042);
        this.eyes.push(e);
        const brow = add(H, capsule(0.011, 0.06, species === 'panda' ? '#1d1d22' : shade(fur, -0.3)), ex, eyeY + 0.09, eyeZ - 0.01);
        brow.rotation.z = Math.PI / 2;
        brow.userData.side = Math.sign(x);
        this.brows.push(brow);
        const cheek = add(H, sphere(0.05, '#ff9db0'), x * 1.65, 0.2, 0.25);
        cheek.scale.set(1, 0.6, 0.4);
      }
      // ears
      if (species === 'cat' || species === 'fox') {
        for (const s of [-1, 1]) {
          const ear = add(H, part(G('ConeGeometry', 0.11, 0.24, 4), fur), s * 0.2, 0.6, 0);
          ear.rotation.z = -s * 0.35;
          const inner = add(H, part(G('ConeGeometry', 0.06, 0.14, 4), species === 'fox' ? '#2a1f1d' : '#ffb3c4'), s * 0.21, 0.6, 0.04);
          inner.rotation.z = -s * 0.35;
        }
      } else if (species === 'bear' || species === 'panda') {
        for (const s of [-1, 1]) {
          const ear = add(H, sphere(0.1, species === 'panda' ? '#1d1d22' : fur), s * 0.25, 0.55, 0);
          ear.scale.z = 0.6;
          if (species === 'bear') add(H, sphere(0.055, '#d9a77c'), s * 0.25, 0.55, 0.04).scale.z = 0.4;
        }
      } else if (species === 'bunny') {
        for (const s of [-1, 1]) {
          const ear = add(H, capsule(0.07, 0.3, fur), s * 0.13, 0.75, -0.02);
          ear.rotation.z = -s * 0.15;
          add(ear, capsule(0.035, 0.24, '#ffb3c4'), 0, 0, 0.04);
        }
      }
    }

    // accessory by role
    const acc = accessoryFor(agent);
    if (acc === 'sunglasses') {
      for (const x of [-0.12, 0.12]) add(H, part(G('RoundedBox', 0.18, 0.11, 0.03, 2, 0.03), '#101114', { metalness: 0.6, roughness: 0.15 }), x, 0.36, 0.31);
      add(H, boxp(0.08, 0.02, 0.02, '#101114'), 0, 0.38, 0.32);
      this.brows.forEach((b) => (b.visible = false));
    } else if (acc === 'glasses') {
      for (const x of [-0.12, 0.12]) add(H, part(G('TorusGeometry', 0.068, 0.011, 6, 18), '#2a1f1d'), x, 0.35, 0.32);
      add(H, boxp(0.1, 0.012, 0.012, '#2a1f1d'), 0, 0.36, 0.33);
    } else if (acc === 'cap') {
      const dome = add(H, part(G('SphereGeometry', 0.345, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), hoodie), 0, 0.38, 0);
      dome.scale.y = 0.75;
      const brim = add(H, part(G('CylinderGeometry', 0.2, 0.2, 0.025, 16, 1, false, -Math.PI / 2, Math.PI), shade(hoodie, -0.12)), 0, 0.39, -0.28);
      brim.rotation.y = Math.PI;
      add(H, sphere(0.03, shade(hoodie, -0.12)), 0, 0.64, 0);
    } else if (acc === 'beanie') {
      const dome = add(H, part(G('SphereGeometry', 0.35, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), '#e8b64c'), 0, 0.4, 0);
      dome.scale.y = 0.85;
      const fold = add(H, part(G('CylinderGeometry', 0.36, 0.36, 0.09, 20), '#d9a33a'), 0, 0.42, 0);
      fold.scale.z = 0.98;
      add(H, sphere(0.07, '#f3e7d3'), 0, 0.72, 0);
    } else if (acc === 'headphones') {
      add(H, part(G('TorusGeometry', 0.34, 0.03, 8, 24, Math.PI), '#1d1f26'), 0, 0.32, 0);
      for (const s of [-1, 1]) {
        const cup = add(H, part(G('CylinderGeometry', 0.09, 0.09, 0.08, 16), '#1d1f26'), s * 0.34, 0.3, 0);
        cup.rotation.z = Math.PI / 2;
        const pad = add(H, part(G('CylinderGeometry', 0.06, 0.06, 0.02, 12), hoodie), s * 0.385, 0.3, 0);
        pad.rotation.z = Math.PI / 2;
      }
    }

    // selection ring + soft contact shadow blob
    this.ring = new THREE.Mesh(
      G('RingGeometry', 0.45, 0.55, 40),
      new THREE.MeshBasicMaterial({ color: '#ff8a3d', transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.ring.visible = false;
    this.root.add(this.ring);
    this.root.scale.setScalar(0.001);
  }

  buildTag() {
    const el = document.createElement('div');
    el.className = 'agent-tag';
    el.innerHTML = `
      <div class="bubble"><span class="text"></span></div>
      <div class="pill"><i class="dot"></i><b class="name"></b><em class="status"></em></div>`;
    this.tagEl = el;
    this.bubbleEl = el.querySelector('.bubble');
    this.tag = new CSS2DObject(el);
    this.tag.position.set(0, 2.05, 0);
    this.root.add(this.tag);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onClick?.(this.id);
    });
  }

  setAgent(agent) {
    this.agent = agent;
    const el = this.tagEl;
    el.dataset.state = agent.state;
    el.dataset.kind = agent.kind;
    el.querySelector('.name').textContent = agent.name;
    el.querySelector('.status').textContent = ACT_LABEL[agent.activity] || agent.activity;
    const text = agent.bubble?.text || (agent.state === 'thinking' ? '' : null);
    if (text === null) {
      this.bubbleEl.classList.remove('show');
    } else {
      this.bubbleEl.classList.add('show');
      this.bubbleEl.classList.toggle('dots', !agent.bubble);
      this.bubbleEl.querySelector('.text').textContent = agent.bubble?.text || '';
    }
  }

  setSelected(on) {
    this.ring.visible = on;
    this.tagEl.classList.toggle('selected', on);
  }

  // walk along waypoints, then settle into `spot`
  goTo(spot, path) {
    this.spot = spot;
    this.path = path;
  }

  placeAt(spot) {
    this.spot = spot;
    this.path = [];
    this.root.position.copy(spot.pos);
    this.yaw = this.targetYaw = spot.face;
  }

  get walking() {
    return this.path.length > 0;
  }

  get talking() {
    return !this.walking && (this.act === 'talk' || (this.agent.state === 'talking' && this.agent.bubble));
  }

  update(dt, t) {
    // scale in/out (spawn & leave)
    this.scale += (this.targetScale - this.scale) * (1 - Math.exp(-dt * 7));
    this.root.scale.setScalar(Math.max(0.001, this.scale));

    // movement
    if (this.path.length) {
      const target = this.path[0];
      const p = this.root.position;
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const dist = Math.hypot(dx, dz);
      const step = this.speed * dt;
      if (dist <= step) {
        p.set(target.x, 0, target.z);
        this.path.shift();
      } else {
        p.x += (dx / dist) * step;
        p.z += (dz / dist) * step;
      }
      if (dist > 0.01) this.targetYaw = Math.atan2(dx, dz);
      if (!this.path.length && this.spot) this.targetYaw = this.spot.face;
    } else if (this.spot) {
      this.targetYaw = this.spot.face;
    }
    let dy = this.targetYaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * (1 - Math.exp(-dt * 9));
    this.root.rotation.y = this.yaw;

    // pose
    const target = this.targetPose(t);
    const k = 1 - Math.exp(-dt * (this.walking ? 14 : 8));
    for (const key of POSE_KEYS) this.pose[key] += (target[key] - this.pose[key]) * k;
    const P = this.pose;
    this.body.position.y = P.bodyY + (target.bob || 0);
    this.body.rotation.x = P.lean;
    this.legL.rotation.x = P.legL;
    this.legR.rotation.x = P.legR;
    this.armL.rotation.set(P.armLx, 0, P.armLz);
    this.armR.rotation.set(P.armRx, 0, P.armRz);
    this.head.rotation.set(P.headX, P.headY, P.headZ);
    this.tag.position.y = 2.1 + P.bodyY;

    // props
    const still = !this.walking;
    this.props.mug.visible = still && this.act === 'coffee';
    this.props.phone.visible = still && (this.mode === 'sofa' || this.mode === 'beanbag') && this.seed % 3 === 0;
    this.props.paddle.visible = still && this.act === 'pingpong';
    this.props.book.visible = still && this.act === 'reading-shelf';

    // face: brows (worried / raised / relaxed) and a talking mouth
    for (const b of this.brows) {
      b.rotation.z = Math.PI / 2 + b.userData.side * P.brow * 0.5;
      b.position.y = (this.agent.species === 'frog' ? 0.67 : 0.44) + Math.abs(P.brow) * 0.03;
    }
    if (this.mouthOpen) {
      this.mouthOpen.scale.y = this.smile ? 0.1 + P.mouth : 0.6 + P.mouth * 2.5;
      if (this.smile) this.smile.visible = P.mouth < 0.25;
    }
    if (this.tail) this.tail.rotation.z = Math.sin(t * (this.walking ? 8 : 2.2) + this.seed) * 0.35;

    // blink, or happy closed eyes while celebrating
    this.nextBlink -= dt;
    const closed = this.nextBlink < 0.12 && this.nextBlink > 0;
    const happy = this.act === 'celebrate';
    for (const e of this.eyes) e.scale.y = happy ? 0.3 : closed ? 0.15 : 1;
    if (this.nextBlink < 0) this.nextBlink = 2 + Math.random() * 3.5;
    if (this.antenna) this.antenna.material.color.setHSL((t * 0.2) % 1, 0.9, 0.6);
    if (this.ring.visible) this.ring.material.opacity = 0.6 + 0.3 * Math.sin(t * 5);
  }

  targetPose(t) {
    const s = Math.sin;
    const P = { bodyY: 0, lean: 0, legL: 0, legR: 0, armLx: 0, armLz: -0.12, armRx: 0, armRz: 0.12, headX: 0, headY: 0, headZ: 0, brow: 0, mouth: 0, bob: 0 };
    const ph = (this.seed % 100) / 10;

    if (this.walking) {
      const w = t * 11;
      P.legL = s(w) * 0.65;
      P.legR = -s(w) * 0.65;
      P.armLx = -s(w) * 0.5;
      P.armRx = s(w) * 0.5;
      P.bob = Math.abs(s(w)) * 0.06;
      P.headX = 0.05;
      return P;
    }

    const mode = this.spot?.kind || 'stand';
    const act = this.act;
    this.mode = mode;
    P.bob = s(t * 2 + ph) * 0.012;
    if (this.talking) P.mouth = Math.max(0, s(t * 13 + ph)) * 0.75;

    if (mode === 'seat') {
      P.bodyY = 0.18;
      P.legL = P.legR = -1.45;
      switch (act) {
        case 'typing':
        case 'planning':
        case 'delegating':
        case 'terminal': {
          const f = act === 'terminal' ? 24 : 17;
          P.armLx = -1.2 + 0.1 * s(t * f);
          P.armRx = -1.2 + 0.1 * s(t * f + Math.PI);
          P.armLz = 0.15;
          P.armRz = -0.15;
          P.headX = (act === 'terminal' ? 0.2 : 0.14) + 0.03 * s(t * 9);
          P.lean = 0.08;
          P.brow = act === 'terminal' ? 0.25 : 0.1;
          break;
        }
        case 'reading':
          P.armRx = -2.3; P.armRz = 0.4; P.armLx = -1.0;
          P.headX = 0.28; P.headY = 0.1 * s(t * 0.8);
          break;
        case 'searching':
          P.armRx = -1.1 + 0.05 * s(t * 6); P.armLx = -0.5;
          P.headX = 0.12; P.headY = 0.35 * s(t * 1.4);
          P.brow = -0.2;
          break;
        case 'browsing':
          P.armRx = -1.15 + 0.08 * s(t * 3); P.armLx = -0.5;
          P.headX = 0.1; P.headZ = 0.08 * s(t * 1.2);
          break;
        case 'supervising':
          P.lean = -0.2;
          P.armLx = P.armRx = -2.8; P.armLz = -0.6; P.armRz = 0.6;
          P.headY = 0.5 * s(t * 0.7);
          break;
        case 'thinking':
          P.armRx = -2.4; P.armRz = 0.35; P.armLx = -0.8;
          P.headZ = 0.18; P.headX = -0.12; P.headY = 0.2 * s(t * 0.6);
          P.brow = 0.45;
          break;
        case 'asking':
          P.armRz = 2.6 + 0.3 * s(t * 9); P.armLx = -0.8;
          P.headX = -0.15; P.brow = -0.5; P.mouth = 0.5;
          break;
        default:
          P.lean = -0.15;
          P.armLx = P.armRx = -0.7;
          P.headX = 0.05;
      }
    } else if (mode === 'sofa' || mode === 'beanbag') {
      const bag = mode === 'beanbag';
      P.bodyY = bag ? 0.05 : 0.25;
      P.lean = bag ? -0.42 : -0.28;
      P.legL = bag ? -1.15 : -1.35;
      P.legR = bag ? -1.0 : -1.35;
      const v = this.seed % 3;
      if (v === 0) { P.armRx = -1.4; P.armLx = -1.2; P.headX = 0.35; }
      else if (v === 1) { P.armLx = P.armRx = -2.8; P.armLz = -0.5; P.armRz = 0.5; P.headX = -0.1; P.mouth = 0.15; }
      else { P.headZ = 0.35; P.headX = 0.2; P.armLx = P.armRx = -0.5; P.bob = s(t * 1.2) * 0.02; }
    } else {
      switch (act) {
        case 'talk':
          P.armRx = -0.7 + 0.45 * s(t * 4.5); P.armRz = 0.3;
          P.armLx = -0.3 + 0.25 * s(t * 3.3 + 1);
          P.headX = 0.06 * s(t * 7);
          P.bob = Math.abs(s(t * 4.5)) * 0.03;
          P.brow = -0.15 * Math.max(0, s(t * 2));
          break;
        case 'wave':
          P.armRz = 2.6 + 0.3 * s(t * 9);
          P.bob = Math.abs(s(t * 4)) * 0.05;
          P.headX = -0.15; P.brow = -0.5; P.mouth = 0.45;
          break;
        case 'whiteboard':
          P.armRx = -1.9 + 0.2 * s(t * 3); P.armRz = 0.15 + 0.15 * s(t * 2.3);
          P.headX = -0.1; P.headY = 0.15 * s(t); P.brow = 0.2;
          break;
        case 'coffee': {
          const sip = s(t * 0.8 + ph) > 0.6;
          P.armRx = sip ? -2.1 : -1.2; P.armRz = sip ? -0.3 : 0;
          P.headX = sip ? -0.2 : 0;
          break;
        }
        case 'pingpong': {
          const side = this.spot?.id === 'pingpong-1' ? Math.PI : 0;
          const swing = s(t * 3.2 + side);
          P.armRx = -0.9 - 0.6 * swing; P.armRz = 0.5;
          P.armLx = -0.4;
          P.legL = 0.25; P.legR = -0.2; P.bodyY = -0.04;
          P.lean = 0.12; P.headY = 0.3 * s(t * 3.2 + side);
          P.bob = Math.abs(s(t * 6.4)) * 0.04;
          P.mouth = swing > 0.85 ? 0.4 : 0;
          break;
        }
        case 'arcade':
          P.armLx = -1.3 + 0.12 * s(t * 20); P.armRx = -1.3 + 0.15 * s(t * 26);
          P.armLz = 0.2; P.armRz = -0.2;
          P.headX = -0.05; P.bob = Math.abs(s(t * 5)) * 0.03; P.brow = 0.3;
          break;
        case 'reading-shelf':
          P.armLx = -1.25; P.armLz = 0.35; P.armRx = -1.0; P.armRz = -0.25;
          P.headX = 0.3; P.headY = 0.12 * s(t * 0.7);
          break;
        case 'window':
          P.armLx = P.armRx = 0.35; P.armLz = -0.25; P.armRz = 0.25;
          P.headX = -0.12; P.headY = 0.3 * s(t * 0.3 + ph);
          break;
        case 'celebrate':
          P.bob = Math.abs(s(t * 7)) * 0.3;
          P.armLz = -2.7 + 0.3 * s(t * 14); P.armRz = 2.7 - 0.3 * s(t * 14);
          P.headX = -0.2; P.mouth = 0.6; P.brow = -0.4;
          break;
        case 'leaving':
          P.armRz = 2.3 + 0.35 * s(t * 8);
          P.mouth = 0.3;
          break;
        default:
          P.headY = 0.3 * s(t * 0.5 + ph);
      }
    }

    // turn head toward whoever is talking to me
    if (this.lookAt) {
      const p = this.root.position;
      let a = Math.atan2(this.lookAt.x - p.x, this.lookAt.z - p.z) - this.yaw;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      P.headY = THREE.MathUtils.clamp(a, -1.1, 1.1);
      P.headX = Math.min(P.headX, 0.05);
    }
    return P;
  }

  dispose() {
    this.root.removeFromParent();
    this.tag.element.remove();
  }
}
