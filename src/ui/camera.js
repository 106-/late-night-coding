// Camera views: the baked scene, a close-up of the hands, and inspection views (side, front, top,
// free orbit) where the room picture is swapped for simple guides and a studio light.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildGuides } from './guides.js';
import { $ } from '../util.js';

export const VIEWS = ['scene', 'hands', 'side', 'front', 'top', 'free'];
const INSPECT = new Set(['side', 'front', 'top', 'free']);

export class CameraViews {
  constructor(app) {
    this.app = app;
    const { camera, renderer, scene } = app;
    this.home = { pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov };
    this.view = 'scene';
    this.onChange = null;          // (view) => void

    this.guides = buildGuides(app.meta, app.keymap);
    this.guides.visible = false;
    scene.add(this.guides);
    this.studio = new THREE.HemisphereLight(0xdfe4ff, 0x30303a, 0);
    scene.add(this.studio);

    // free camera: drag to orbit, right-drag to pan, wheel to zoom
    const orbit = this.orbit = new OrbitControls(camera, renderer.domElement);
    Object.assign(orbit, { enabled: false, enableDamping: true, dampingFactor: 0.12, minDistance: 0.2, maxDistance: 6, zoomSpeed: 0.8, rotateSpeed: 0.7 });
    // OrbitControls aims the camera at the world origin when it is created: put the baked view back
    this.restoreHome();

    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', () => { if (this.view === 'free') canvas.style.cursor = 'grabbing'; });
    window.addEventListener('pointerup', () => { if (this.view === 'free') canvas.style.cursor = 'grab'; });
    // the Camera button is only shown (and only works) while `tweak` is on
    $('btn-cam').addEventListener('click', e => {
      e.currentTarget.blur();
      if (app.tuner?.enabled) this.set(this.view === 'free' ? 'scene' : 'free');
    });
  }

  get inspecting() { return INSPECT.has(this.view); }

  restoreHome() {
    const cam = this.app.camera;
    cam.position.copy(this.home.pos); cam.quaternion.copy(this.home.quat); cam.fov = this.home.fov;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  }

  set(view) {
    const { camera, rei, view: framing, keymap, room } = this.app;
    const prev = this.view, prevPos = camera.position.clone(), prevQuat = camera.quaternion.clone();
    this.view = view;
    const inspect = this.inspecting;
    $('btn-cam').setAttribute('aria-pressed', String(view === 'free'));
    $('cam-hint').hidden = view !== 'free';
    this.orbit.enabled = view === 'free';
    this.app.renderer.domElement.style.cursor = view === 'free' ? 'grab' : '';
    room.mesh.visible = !inspect;
    this.guides.visible = inspect;
    this.studio.intensity = inspect ? 2.2 : 0;
    this.restoreHome();
    framing.reset();

    if (view === 'hands') {
      const mid = keymap.home.L.pos.clone().lerp(keymap.home.R.pos, 0.5).add(new THREE.Vector3(0, 0.06, 0)).project(this.app.fullCam);
      framing.reset(2.6, { x: mid.x * 0.5 + 0.5, y: mid.y * 0.5 + 0.5 }, true);
    } else if (view === 'free') {
      camera.fov = 35;
      this.orbit.target.copy(rei.root.position).addScaledVector(rei.fwd, 0.15).setY(0.88);
      if (INSPECT.has(prev)) {
        camera.position.copy(prevPos); camera.quaternion.copy(prevQuat);   // carry on from the view you were in
      } else {
        // a three-quarter view in front of her, a little above
        const dir = rei.fwd.clone().addScaledVector(rei.left, -0.8).add(new THREE.Vector3(0, 0.45, 0)).normalize();
        camera.position.copy(this.orbit.target).addScaledVector(dir, 1.6);
      }
      camera.lookAt(this.orbit.target);
      this.orbit.update();
      framing.reset(1, { x: 0.5, y: 0.5 }, true);
    } else if (inspect) {
      this.aim();
      framing.reset(1, { x: 0.4, y: 0.5 }, true);     // keep her right of the panel when the window is narrow
    } else framing.zoom = 1.035;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    this.onChange?.(view);
  }

  // side / front / top: a fixed camera on Rei that follows her seat
  aim() {
    const { camera, rei } = this.app;
    const target = rei.root.position.clone().addScaledVector(rei.fwd, 0.1).setY(this.view === 'top' ? 0.8 : 0.93);
    const dir = this.view === 'side' ? rei.left.clone().addScaledVector(rei.fwd, 0.15)
      : this.view === 'front' ? rei.fwd.clone().addScaledVector(rei.left, -0.25).add(new THREE.Vector3(0, 0.35, 0))
        : new THREE.Vector3(0, 1, 0).addScaledVector(rei.fwd, 0.35);
    camera.fov = 30;
    camera.position.copy(target).addScaledVector(dir.normalize(), this.view === 'top' ? 1.9 : 2.1);
    if (this.view === 'top') camera.up.copy(rei.fwd);
    camera.lookAt(target);
    camera.up.set(0, 1, 0);
  }

  // the keyboard or chair moved: rebuild the stand-ins
  rebuildGuides() {
    const { scene, meta, keymap } = this.app;
    scene.remove(this.guides);
    this.guides.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
    this.guides = buildGuides(meta, keymap);
    this.guides.visible = this.inspecting;
    scene.add(this.guides);
  }

  update() {
    if (this.view === 'free') this.orbit.update();
    else if (this.inspecting) this.aim();
  }
}
