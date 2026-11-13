// What is under the mouse: Rei, the lamp, the CRT, the penguins, the can, the city outside.
// The baked room's depth tells where the pointer lands; hovering shows a label, clicking reacts.
import * as THREE from 'three';
import { t } from '../i18n.js';
import { $ } from '../util.js';

// fixed points in the room (the penguins sit on top of the CRT)
const PENGUIN_BOX = new THREE.Box3(new THREE.Vector3(-2.12, 1.218, 0.04), new THREE.Vector3(-1.42, 1.42, 0.74));
export const PENGUIN_POINT = new THREE.Vector3(-1.72, 1.28, 0.45);
export const WINDOW_POINT = new THREE.Vector3(0.6, 1.5, -2.2);

const boxOf = (hs, pad) => new THREE.Box3(new THREE.Vector3().fromArray(hs.min), new THREE.Vector3().fromArray(hs.max)).expandByScalar(pad);

// world position (and distance) of a pixel of the baked frame, read from the depth picture
export function depthReader(depthImage, meta, fullCam) {
  const c = document.createElement('canvas');
  c.width = depthImage.width; c.height = depthImage.height;
  const g = c.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
  g.drawImage(depthImage, 0, 0);
  const { data, width: w, height: h } = g.getImageData(0, 0, c.width, c.height);
  return (u, v, out = new THREE.Vector3()) => {   // u, v with v up
    const x = Math.min(w - 1, Math.max(0, Math.floor(u * w))), y = Math.min(h - 1, Math.max(0, Math.floor((1 - v) * h)));
    const i = (y * w + x) * 4;
    const d = (data[i] * 256 + data[i + 1]) / 65535;                      // inverse depth, 1 = near plane
    const dist = 1 / (d * (1 / meta.near - 1 / meta.far) + 1 / meta.far);
    out.set(u * 2 - 1, v * 2 - 1, 2 * (1 - d) - 1).unproject(fullCam);
    return { point: out, dist };
  };
}

export class Hotspots {
  constructor(app, worldAt) {
    this.app = app;
    this.worldAt = worldAt;
    const hs = app.meta.hotspots;
    this.boxes = {
      lamp: boxOf(hs.lamp, 0.03),
      screen: boxOf(hs.screen, 0.03),
      penguin: PENGUIN_BOX,
    };
    this.lampPoint = this.boxes.lamp.getCenter(new THREE.Vector3());
    this.raycaster = new THREE.Raycaster();
    this.pointer = { x: 0, y: 0, nx: 0, ny: 0, inside: false, movedAt: -10 };
    this.hover = null;
    this.hint = $('hint');

    window.addEventListener('pointermove', e => {
      const p = this.pointer;
      p.x = e.clientX; p.y = e.clientY;
      p.nx = e.clientX / Math.max(2, window.innerWidth); p.ny = 1 - e.clientY / Math.max(2, window.innerHeight);
      p.movedAt = performance.now() / 1000; p.inside = true;
    });
    document.addEventListener('pointerleave', () => { this.pointer.inside = false; });
    app.renderer.domElement.addEventListener('click', () => this.click());
  }

  // which thing is under the pointer (id null for nothing)
  probe() {
    const { camera, view, rei, can } = this.app;
    const p = this.pointer, r = view.rect;
    const hit = this.worldAt(r.x + p.nx * r.w, r.y + p.ny * r.h);
    this.raycaster.setFromCamera(new THREE.Vector2(p.nx * 2 - 1, p.ny * 2 - 1), camera);
    const ray = this.raycaster.ray;
    // the can is a real mesh: an exact hit wins over the rough tests below
    const canHit = this.raycaster.intersectObject(can.obj, true)[0];
    if (canHit && canHit.distance < hit.dist + 0.02) return 'can';
    // Rei: a cheap test against head and chest spheres, in front of the baked surface
    const head = rei.points.head;
    if (head && head.distanceTo(camera.position) < hit.dist + 0.1) {
      if (ray.distanceToPoint(head.clone().add(new THREE.Vector3(0, 0.05, 0))) < 0.12) return 'head';
      if (ray.distanceToPoint(head.clone().add(new THREE.Vector3(0, -0.27, 0))) < 0.15) return 'rei';
    }
    if (can.box().containsPoint(hit.point)) return 'can';
    for (const [id, box] of Object.entries(this.boxes)) if (box.containsPoint(hit.point)) return id;
    if (hit.dist > 30) return 'window';
    return null;
  }

  label(id) { return t(`hotspot.${id === 'head' ? 'rei' : id}`); }

  click() {
    const app = this.app, { actions, rei } = app;
    if (!app.started || app.cameraViews.inspecting) return;   // no clicks while the camera is moved
    app.idle = 0;
    switch (this.probe()) {
      case 'lamp': actions.setLamp(!actions.lampOn); rei.lookAt('lamp', 1.8); break;
      case 'screen': app.term.onCommand(`crt ${actions.nextCrtName()}`); break;   // shows on the terminal too
      case 'penguin': actions.penguins(); break;
      case 'can': actions.tapCan(); break;
      case 'window': rei.lookAt('window', 4); break;
      case 'head': actions.patHead(); break;
      case 'rei': actions.poke(); break;
    }
  }

  // hover label, while the pointer has moved recently
  update() {
    const app = this.app, p = this.pointer;
    const active = p.inside && performance.now() / 1000 - p.movedAt < 2.5;
    if (app.cameraViews.inspecting) { this.hint.hidden = true; this.hover = null; return; }
    if (!active && !this.hover) return;
    this.hover = this.probe();
    app.renderer.domElement.style.cursor = this.hover ? 'pointer' : 'default';
    this.hint.hidden = !(this.hover && p.inside);
    if (!this.hint.hidden) {
      this.hint.textContent = this.label(this.hover);
      this.hint.style.left = `${p.x}px`;
      this.hint.style.top = `${p.y}px`;
    }
  }
}
