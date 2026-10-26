// The office pets: a dog that wanders between its bed, the lounge and busy desks,
// and a cat that hops onto furniture. Purely decorative, driven by their own
// little timers instead of hook events.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mat, route } from './world.js';

const part = (geo, color, shadow = false) => {
  const m = new THREE.Mesh(geo, mat(color));
  m.castShadow = shadow;
  return m;
};

export class Dog {
  constructor(scene, world) {
    this.world = world;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const fur = '#e3934a';
    const cream = '#fff3e6';

    const torso = part(new THREE.CapsuleGeometry(0.17, 0.32, 4, 10), fur, true);
    torso.rotation.x = Math.PI / 2;
    torso.position.y = 0.36;
    const belly = part(new THREE.CapsuleGeometry(0.12, 0.26, 4, 8), cream);
    belly.rotation.x = Math.PI / 2;
    belly.position.set(0, 0.3, 0.02);
    this.body.add(torso, belly);

    this.legs = [];
    for (const [x, z] of [[-0.1, 0.18], [0.1, 0.18], [-0.1, -0.18], [0.1, -0.18]]) {
      const leg = new THREE.Group();
      leg.position.set(x, 0.3, z);
      const l = part(new THREE.CapsuleGeometry(0.05, 0.14, 4, 8), fur);
      l.position.y = -0.14;
      const paw = part(new THREE.SphereGeometry(0.055, 8, 6), cream);
      paw.position.y = -0.24;
      leg.add(l, paw);
      this.body.add(leg);
      this.legs.push(leg);
    }

    this.head = new THREE.Group();
    this.head.position.set(0, 0.55, 0.3);
    const skull = part(new THREE.SphereGeometry(0.17, 16, 12), fur, true);
    const snout = part(new THREE.SphereGeometry(0.09, 12, 8), cream);
    snout.scale.set(1, 0.8, 1.2);
    snout.position.set(0, -0.04, 0.14);
    const nose = part(new THREE.SphereGeometry(0.03, 8, 6), '#1d1d22');
    nose.position.set(0, -0.01, 0.25);
    this.head.add(skull, snout, nose);
    for (const s of [-1, 1]) {
      const ear = part(new THREE.ConeGeometry(0.07, 0.14, 4), fur);
      ear.position.set(s * 0.1, 0.16, -0.02);
      ear.rotation.z = -s * 0.25;
      const eye = part(new THREE.SphereGeometry(0.025, 8, 6), '#1d1d22');
      eye.position.set(s * 0.07, 0.04, 0.14);
      this.head.add(ear, eye);
    }
    const collar = part(new THREE.TorusGeometry(0.13, 0.025, 6, 16), '#e0533d');
    collar.position.set(0, -0.1, -0.03);
    collar.rotation.x = Math.PI / 2 - 0.4;
    const tag = part(new THREE.SphereGeometry(0.03, 8, 6), '#f2c230');
    tag.position.set(0, -0.16, 0.1);
    this.head.add(collar, tag);
    this.body.add(this.head);

    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.48, -0.32);
    const t = part(new THREE.TorusGeometry(0.08, 0.035, 6, 12, Math.PI * 1.4), fur);
    t.rotation.y = Math.PI / 2;
    this.tail.add(t);
    this.body.add(this.tail);

    this.root.scale.setScalar(1.1);
    scene.add(this.root);

    this.spot = world.dogSpots[0];
    this.root.position.copy(this.spot.pos);
    this.root.rotation.y = this.spot.face;
    this.yaw = this.spot.face;
    this.path = [];
    this.restUntil = 0;
  }

  // pick somewhere new: usually the bed or lounge, sometimes next to a busy agent
  wander(now, busyDesks) {
    const spots = [...this.world.dogSpots];
    for (const d of busyDesks) spots.push({ ...d.side(4), id: `dog-${d.id}`, kind: 'sit' });
    let next = spots[Math.floor(Math.random() * spots.length)];
    if (next.id === this.spot.id) next = this.world.dogSpots[0];
    this.path = route(this.root.position, this.spot, next);
    this.spot = next;
    this.restUntil = now + 12000 + Math.random() * 20000;
  }

  update(dt, t, now, busyDesks) {
    if (!this.path.length && now > this.restUntil) this.wander(now, busyDesks);
    const walking = this.path.length > 0;
    if (walking) {
      const target = this.path[0];
      const p = this.root.position;
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const dist = Math.hypot(dx, dz);
      const step = 1.9 * dt;
      if (dist <= step) {
        p.set(target.x, 0, target.z);
        this.path.shift();
      } else {
        p.x += (dx / dist) * step;
        p.z += (dz / dist) * step;
        this.targetYaw = Math.atan2(dx, dz);
      }
    } else {
      this.targetYaw = this.spot.face;
    }
    let dy = (this.targetYaw ?? this.yaw) - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * (1 - Math.exp(-dt * 8));
    this.root.rotation.y = this.yaw;

    const lying = !walking && this.spot.kind === 'bed';
    const sitting = !walking && this.spot.kind === 'sit';
    const k = 1 - Math.exp(-dt * 8);
    const w = t * 14;
    this.legs.forEach((leg, i) => {
      const target = walking ? Math.sin(w + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.6 : lying ? (i < 2 ? -1.4 : 1.4) : sitting && i > 1 ? -1.2 : 0;
      leg.rotation.x += (target - leg.rotation.x) * k;
    });
    const bodyY = lying ? -0.2 : sitting ? -0.05 : walking ? Math.abs(Math.sin(w)) * 0.03 : 0;
    const bodyX = sitting ? -0.45 : 0;
    this.body.position.y += (bodyY - this.body.position.y) * k;
    this.body.rotation.x += (bodyX - this.body.rotation.x) * k;
    this.head.rotation.x = lying ? 0.35 : sitting ? 0.35 : 0;
    this.head.rotation.y = lying ? 0.2 : Math.sin(t * 0.7) * 0.4;
    this.tail.rotation.z = Math.sin(t * (walking || sitting ? 14 : 2)) * (lying ? 0.1 : 0.5);
  }
}

// ---------- the office cat ----------
// Tuxedo cat. Walks the corridors like everyone else, then hops up a chain of
// `hops` (cat tree -> bookshelf, armrest -> sofa back, floor -> desk corner).
const CROUCH = 0.18;
const REST_MS = { sleep: [30, 55], box: [20, 40], loaf: [18, 35], desk: [14, 26], sit: [10, 20] };
const hopTo = (p) => Object.assign(p.clone(), { hop: true });
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Cat {
  constructor(scene, world) {
    this.world = world;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const fur = '#2b2c35';
    const white = '#f7f3ec';
    const pink = '#f29bb0';

    const torso = part(new THREE.CapsuleGeometry(0.12, 0.3, 4, 10), fur, true);
    torso.rotation.x = Math.PI / 2;
    torso.position.y = 0.32;
    const belly = part(new THREE.CapsuleGeometry(0.085, 0.22, 4, 8), white);
    belly.rotation.x = Math.PI / 2;
    belly.position.set(0, 0.26, 0.03);
    const chest = part(new THREE.SphereGeometry(0.1, 10, 8), white);
    chest.scale.set(0.9, 1, 0.8);
    chest.position.set(0, 0.29, 0.2);
    this.body.add(torso, belly, chest);

    // front-left, front-right, hind-left, hind-right; white socks
    this.legs = [];
    const legGeo = new THREE.CapsuleGeometry(0.038, 0.13, 4, 8);
    const pawGeo = new THREE.SphereGeometry(0.042, 8, 6);
    for (const [x, z] of [[-0.07, 0.15], [0.07, 0.15], [-0.07, -0.16], [0.07, -0.16]]) {
      const leg = new THREE.Group();
      leg.position.set(x, 0.25, z);
      const l = part(legGeo, fur);
      l.position.y = -0.11;
      const paw = part(pawGeo, white);
      paw.position.y = -0.205;
      leg.add(l, paw);
      this.body.add(leg);
      this.legs.push(leg);
    }

    this.head = new THREE.Group();
    this.head.position.set(0, 0.47, 0.25);
    const skull = part(new THREE.SphereGeometry(0.145, 16, 12), fur, true);
    skull.scale.set(1.1, 0.95, 1);
    const blaze = part(new THREE.SphereGeometry(0.09, 12, 8), white);
    blaze.scale.set(1, 0.75, 0.9);
    blaze.position.set(0, -0.045, 0.07);
    const nose = part(new THREE.SphereGeometry(0.018, 8, 6), pink);
    nose.scale.set(1.3, 0.8, 0.8);
    nose.position.set(0, -0.022, 0.147);
    this.head.add(skull, blaze, nose);
    this.eyes = [];
    this.ears = [];
    for (const s of [-1, 1]) {
      const muzzle = part(new THREE.SphereGeometry(0.04, 10, 8), white);
      muzzle.position.set(s * 0.028, -0.05, 0.12);
      const eye = new THREE.Group();
      eye.position.set(s * 0.058, 0.02, 0.122);
      eye.rotation.y = s * 0.4;
      const iris = part(new THREE.SphereGeometry(0.034, 10, 8), '#a6e05a');
      iris.scale.set(1, 1.05, 0.55);
      const pupil = part(new THREE.SphereGeometry(0.03, 8, 6), '#111114');
      pupil.scale.set(0.32, 0.95, 0.5);
      pupil.position.z = 0.012;
      const glint = part(new THREE.SphereGeometry(0.009, 6, 4), '#ffffff');
      glint.position.set(0.01, 0.014, 0.02);
      eye.add(iris, pupil, glint);
      const ear = new THREE.Group();
      ear.position.set(s * 0.085, 0.11, -0.01);
      ear.rotation.z = -s * 0.32;
      const outer = part(new THREE.ConeGeometry(0.055, 0.12, 4), fur);
      outer.rotation.y = Math.PI / 4;
      outer.position.y = 0.05;
      const inner = part(new THREE.ConeGeometry(0.033, 0.08, 4), pink);
      inner.rotation.y = Math.PI / 4;
      inner.position.set(0, 0.04, 0.022);
      ear.add(outer, inner);
      this.head.add(muzzle, eye, ear);
      this.eyes.push(eye);
      this.ears.push(ear);
      for (const dy of [0, -0.02]) {
        const w = part(new THREE.BoxGeometry(0.13, 0.004, 0.004), white);
        w.position.set(s * 0.1, -0.045 + dy, 0.11);
        w.rotation.set(0, -s * 0.25, s * (dy ? -0.12 : 0.1));
        this.head.add(w);
      }
    }
    const collar = part(new THREE.TorusGeometry(0.095, 0.016, 6, 16), '#3d8bff');
    collar.position.set(0, -0.1, -0.01);
    collar.rotation.x = Math.PI / 2 - 0.4;
    const bell = part(new THREE.SphereGeometry(0.024, 8, 6), '#f2c230');
    bell.position.set(0, -0.145, 0.075);
    this.head.add(collar, bell);
    this.body.add(this.head);

    // tail is a 4-joint chain so it can stand up, hook at the tip or wrap around the paws
    this.tail = [];
    const tailGeo = new THREE.CapsuleGeometry(0.03, 0.09, 4, 8); // overlaps the next joint so bends show no gaps
    let parent = this.body;
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, i ? 0 : 0.36, i ? -0.12 : -0.27);
      const m = part(tailGeo, fur);
      m.rotation.x = Math.PI / 2;
      m.position.z = -0.06;
      m.scale.setScalar(1 - i * 0.08);
      seg.add(m);
      parent.add(seg);
      this.tail.push(seg);
      parent = seg;
    }

    const zzz = document.createElement('div');
    zzz.className = 'pet-zzz';
    zzz.innerHTML = '<i>z</i><i>z</i><i>Z</i>';
    this.zzz = new CSS2DObject(zzz);
    this.zzz.position.set(0.05, 0.6, 0.3);
    this.root.add(this.zzz);

    this.root.scale.setScalar(0.95);
    scene.add(this.root);

    this.spot = world.catSpots[0];
    this.root.position.copy(this.spot.hops?.at(-1) ?? this.spot.pos);
    this.yaw = this.targetYaw = this.spot.face;
    this.root.rotation.y = this.yaw;
    this.path = [];
    this.hop = null;
    this.arrived = true;
    this.restUntil = Date.now() + 10000;
    this.landAt = -1;
    this.blinkAt = 2;
    this.twitchAt = 3;
  }

  // usually one of its own spots; often a busy agent's desk, because cats
  wander(busyDesks) {
    const desks = busyDesks.map((d) => d.perch);
    const pool = desks.length && Math.random() < 0.45 ? desks : this.world.catSpots;
    const options = pool.filter((s) => s.id !== this.spot.id);
    const next = options[Math.floor(Math.random() * options.length)] ?? this.world.catSpots[0];
    // climb down the way it came up, walk over, climb up again
    const down = [...(this.spot.hops ?? [])].reverse().slice(1);
    if (this.spot.hops) down.push(this.spot.pos);
    this.path = [...down.map(hopTo), ...route(this.spot.pos, this.spot, next), ...(next.hops ?? []).map(hopTo)];
    this.spot = next;
    this.arrived = false;
  }

  update(dt, t, now, busyDesks, dogPos) {
    if (this.arrived && now > this.restUntil) this.wander(busyDesks);
    const p = this.root.position;
    let mode = 'rest';
    let hop = this.hop;
    if (!this.hop && this.path[0]?.hop) {
      const to = this.path.shift();
      const from = p.clone();
      const dist = Math.hypot(to.x - from.x, to.z - from.z);
      const up = to.y - from.y;
      this.hop = { from, to, t: 0, dur: 0.35 + dist * 0.12 + Math.abs(up) * 0.1, peak: 0.25 + Math.max(0, up) * 0.35, up: up > 0.05, down: up < -0.05 };
      if (dist > 0.05) this.targetYaw = Math.atan2(to.x - from.x, to.z - from.z);
      hop = this.hop;
    }
    if (hop) {
      const h = hop;
      h.t += dt;
      mode = 'crouch';
      if (h.t > CROUCH) {
        const f = Math.min(1, (h.t - CROUCH) / h.dur);
        p.lerpVectors(h.from, h.to, f);
        p.y += Math.sin(Math.PI * f) * h.peak;
        mode = 'air';
        if (f >= 1) {
          this.hop = null;
          this.landAt = t;
        }
      }
    } else if (this.path.length) {
      mode = 'walk';
      const target = this.path[0];
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const dist = Math.hypot(dx, dz);
      const step = 1.5 * dt;
      if (dist <= step) {
        p.set(target.x, 0, target.z);
        this.path.shift();
      } else {
        p.x += (dx / dist) * step;
        p.z += (dz / dist) * step;
        this.targetYaw = Math.atan2(dx, dz);
      }
    } else {
      if (!this.arrived) {
        this.arrived = true;
        const [a, b] = REST_MS[this.spot.kind];
        this.restUntil = now + (a + Math.random() * (b - a)) * 1000;
      }
      this.targetYaw = this.spot.face;
    }
    this.yaw += wrap(this.targetYaw - this.yaw) * (1 - Math.exp(-dt * (mode === 'crouch' ? 16 : 8)));
    this.root.rotation.y = this.yaw;

    // ----- pose targets -----
    const pose = mode === 'rest' ? this.spot.kind : mode;
    const w = t * 12;
    let y = 0, pitch = 0, legs = [0, 0, 0, 0], tailX = 1.1, curlX = 0.25, curlY = 0, sway = 0.12, swayF = 4;
    let headX = 0, headH = 0.47, eyes = 1, look = Math.sin(t * 0.4) * 0.35;
    if (pose === 'walk') {
      legs = [0, Math.PI, Math.PI, 0].map((ph) => Math.sin(w + ph) * 0.55);
      y = Math.abs(Math.sin(w)) * 0.015;
      look = 0;
    } else if (pose === 'crouch') {
      y = -0.06;
      legs = [0.25, 0.25, -0.35, -0.35];
      tailX = 0.3;
      curlX = 0;
      look = 0;
    } else if (pose === 'air') {
      const h = hop; // still set on the landing frame, after this.hop was cleared
      legs = h.down ? [-0.5, -0.5, 0.7, 0.7] : [-0.9, -0.9, 0.9, 0.9];
      pitch = h.up ? -0.35 : h.down ? 0.3 : 0;
      tailX = 0.2;
      curlX = 0;
      look = 0;
    } else if (pose === 'sit' || pose === 'desk') {
      y = -0.03;
      pitch = -0.5;
      legs = [0.5, 0.5, -1.2, -1.2];
      tailX = -0.15;
      curlX = 0;
      curlY = 0.5;
      sway = 0.18;
      swayF = 1.6;
      headX = 0.4;
      if (pose === 'desk') {
        // bats at the keyboard every few seconds
        const ph = t % 5;
        legs[1] = 0.5 - (ph < 1 ? Math.sin(ph * Math.PI) : 0) * 1.4;
      }
    } else {
      // loaf / box / sleep: paws tucked under
      y = pose === 'box' ? -0.13 : -0.17;
      legs = pose === 'box' ? [0, 0, 0, 0] : [-1.4, -1.4, 1.4, 1.4]; // in the box they just sink below its floor
      tailX = -0.1;
      curlX = 0;
      curlY = 0.55;
      sway = 0.08;
      swayF = 1.2;
      headX = pose === 'box' ? -0.15 : 0.1;
      eyes = pose === 'box' ? 1 : Math.sin(t * 0.6) > 0.75 ? 0.1 : 0.6; // slow blink = cat for "I trust you"
      if (pose === 'sleep') {
        headX = 0.55;
        headH = 0.37;
        look = 0.6;
        eyes = 0.06;
        curlY = 0.7;
        sway = 0.03;
      }
    }
    // keep an eye on the dog when it walks by
    if (dogPos && mode === 'rest' && pose !== 'sleep') {
      const dx = dogPos.x - p.x;
      const dz = dogPos.z - p.z;
      if (Math.hypot(dx, dz) < 3.5) look = THREE.MathUtils.clamp(wrap(Math.atan2(dx, dz) - this.yaw), -1.1, 1.1);
    }

    const k = 1 - Math.exp(-dt * 10);
    this.body.position.y += (y - this.body.position.y) * k;
    this.body.rotation.x += (pitch - this.body.rotation.x) * k;
    this.legs.forEach((leg, i) => (leg.rotation.x += (legs[i] - leg.rotation.x) * (mode === 'walk' ? 1 : k)));
    this.head.rotation.x += (headX - this.head.rotation.x) * k;
    this.head.rotation.y += (look - this.head.rotation.y) * k * 0.6;
    this.head.position.y += (headH - this.head.position.y) * k;
    this.tail.forEach((seg, i) => {
      const rx = i ? curlX : tailX;
      seg.rotation.x += (rx - seg.rotation.x) * k;
      const ry = curlY + Math.sin(t * swayF - i * 0.7) * sway * (1 + i * 0.5);
      seg.rotation.y += (ry - seg.rotation.y) * k;
    });

    // squash on take-off and landing, slow breathing while resting
    const land = Math.max(0, 1 - (t - this.landAt) / 0.18);
    const squash = mode === 'crouch' ? 0.12 : land * 0.18;
    const breathe = mode === 'rest' ? Math.sin(t * 2) * 0.025 : 0;
    this.body.scale.set(1 + squash * 0.5 + breathe, 1 - squash + breathe, 1 + squash * 0.5);

    if (t > this.blinkAt + 0.12) this.blinkAt = t + 2 + Math.random() * 4;
    const open = t > this.blinkAt ? 0.1 : eyes;
    for (const e of this.eyes) e.scale.y += (open - e.scale.y) * (1 - Math.exp(-dt * 30));
    if (t > this.twitchAt + 0.25) {
      this.twitchAt = t + 3 + Math.random() * 5;
      this.twitchEar = Math.random() < 0.5 ? 0 : 1;
    }
    const flick = t > this.twitchAt ? Math.sin(((t - this.twitchAt) / 0.25) * Math.PI) : 0;
    this.ears.forEach((ear, i) => (ear.rotation.x = i === this.twitchEar ? -flick * 0.6 : 0));

    this.zzz.visible = this.arrived && pose === 'sleep';
  }
}
