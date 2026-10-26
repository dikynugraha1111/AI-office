// Small particle bursts: confetti when a task finishes, a poof when someone
// arrives or leaves, and sparks when a tool call errors.
import * as THREE from 'three';

const COLORS = ['#ff8a3d', '#7c5cff', '#2bb3a3', '#ff5c8a', '#3d8bff', '#f2c230', '#62c454'];
const confettiGeo = new THREE.PlaneGeometry(0.08, 0.14);
const puffGeo = new THREE.SphereGeometry(0.18, 10, 8);

export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  confetti(pos, n = 70) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(confettiGeo, new THREE.MeshBasicMaterial({ color: COLORS[i % COLORS.length], side: THREE.DoubleSide, transparent: true }));
      m.position.set(pos.x, 1.8, pos.z);
      const a = Math.random() * Math.PI * 2;
      const sp = 1.2 + Math.random() * 2.2;
      this.add(m, {
        vel: new THREE.Vector3(Math.cos(a) * sp, 3 + Math.random() * 3, Math.sin(a) * sp),
        spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
        gravity: 6,
        drag: 1.6,
        life: 2.2 + Math.random(),
      });
    }
  }

  poof(pos, color = '#ffffff') {
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
      const a = (i / 14) * Math.PI * 2;
      m.position.set(pos.x + Math.cos(a) * 0.2, 0.3 + Math.random() * 0.8, pos.z + Math.sin(a) * 0.2);
      this.add(m, {
        vel: new THREE.Vector3(Math.cos(a) * 1.4, 0.6 + Math.random(), Math.sin(a) * 1.4),
        grow: 2.2,
        drag: 3,
        life: 0.9,
      });
    }
  }

  sparks(pos) {
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: i % 2 ? '#ff5c5c' : '#ffd479', transparent: true }));
      m.scale.setScalar(0.25);
      m.position.set(pos.x, 1.7, pos.z);
      const a = Math.random() * Math.PI * 2;
      this.add(m, { vel: new THREE.Vector3(Math.cos(a) * 2, 2 + Math.random() * 2, Math.sin(a) * 2), gravity: 9, life: 0.8 });
    }
  }

  add(mesh, o) {
    this.scene.add(mesh);
    this.items.push({ mesh, age: 0, gravity: 0, drag: 0, grow: 0, ...o });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        p.mesh.removeFromParent();
        p.mesh.material.dispose();
        this.items.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.02) {
        p.mesh.position.y = 0.02;
        p.vel.set(0, 0, 0);
      }
      if (p.spin) p.mesh.rotation.set(p.spin.x * p.age, p.spin.y * p.age, p.spin.z * p.age);
      if (p.grow) p.mesh.scale.setScalar(1 + p.grow * k);
      p.mesh.material.opacity = 1 - k * k;
    }
  }
}
