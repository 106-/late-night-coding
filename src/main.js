// 夜の作業 / Night Work: Rei, a VRM character, types at a CRT in a path-traced room.
// The room is a set of pictures baked in Blender with depth, so Rei, the CRT
// image, the can and the dust can sit inside it in real time.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { setText, translatePage, setLang, nextLang } from './i18n.js';
import { $ } from './util.js';
import { Room, loadRoomTextures } from './scene/room.js';
import { CrtScreen } from './scene/crt.js';
import { Can } from './scene/can.js';
import { KeyGlow, Dust } from './scene/effects.js';
import { Post } from './scene/post.js';
import { View, ASPECT } from './scene/view.js';
import { buildKeyMap } from './keyboard/keymap.js';
import { Layout } from './keyboard/layout.js';
import { Rei } from './rei/rei.js';
import { Terminal, drawMirror } from './terminal/terminal.js';
import { installShell } from './terminal/shell.js';
import { Autopilot } from './terminal/autopilot.js';
import { Sound } from './audio.js';
import { createActions } from './actions.js';
import { Hotspots, depthReader, PENGUIN_POINT, WINDOW_POINT } from './ui/hotspots.js';
import { CameraViews } from './ui/camera.js';
import { Tuner } from './ui/tuner.js';
import { installInput } from './ui/input.js';
import { installHud } from './ui/hud.js';

const ROOM = './assets/room';
const params = new URLSearchParams(location.search);

// everything the modules share; also on window for poking at from the console
const app = {
  started: false,
  idle: 0,                 // seconds since the viewer last did something
  typedSinceBoot: false,
  timers: [],
  later(sec, fn) { this.timers.push({ t: sec, fn }); },
};
window.app = app;

translatePage();
$('boot-lang').addEventListener('click', e => { setLang(nextLang()); e.currentTarget.blur(); });
main().catch(err => {
  console.error(err);
  setText($('boot-msg'), 'boot.failed', { msg: err.message });
});

async function loadAssets() {
  const progress = { room: 0, rei: 0 };
  const show = () => { $('boot-bar').style.width = `${Math.round((progress.room * 0.45 + progress.rei * 0.55) * 100)}%`; };
  const gltf = new GLTFLoader();
  gltf.register(parser => new VRMLoaderPlugin(parser));
  const json = (url, fallback) => fetch(url, { cache: 'no-store' }).then(r => (r.ok ? r.json() : fallback)).catch(() => fallback);
  const [meta, gains, textures, crt, vrm, can, layout, pose] = await Promise.all([
    fetch(`${ROOM}/meta.json`).then(r => r.json()),
    fetch(`${ROOM}/gains.json`).then(r => r.json()),
    loadRoomTextures(ROOM, p => { progress.room = p; show(); }),
    gltf.loadAsync(`${ROOM}/crt_screen.glb`),
    gltf.loadAsync('./assets/rei.vrm', e => { if (e.total) { progress.rei = e.loaded / e.total; show(); } }),
    gltf.loadAsync(`${ROOM}/can.glb`),
    json('./assets/layout.json', null),     // desk layout saved from the tuning panel
    json('./assets/pose.json', {}),         // posture saved from the tuning panel
  ]);
  progress.room = progress.rei = 1; show();
  return { meta, gains, textures, crt, vrm, can, layout, pose };
}

async function main() {
  const assets = await loadAssets();
  setText($('boot-msg'), 'boot.building');
  const { meta } = assets;

  // renderer, camera (the baked one), scene
  const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(meta.vfov, ASPECT, meta.near, meta.far);
  camera.position.fromArray(meta.camera.position);
  camera.quaternion.fromArray(meta.camera.quaternion);
  camera.updateMatrixWorld();
  const fullCam = camera.clone();                 // un-cropped projection, for unprojecting baked pixels
  fullCam.updateProjectionMatrix(); fullCam.updateMatrixWorld();

  const room = new Room(meta, assets.gains, assets.textures);
  scene.add(room.mesh, room.lights);
  room.state.crt = room.target.crt = 0;           // the tube is off until you enter

  const term = new Terminal();
  const crt = new CrtScreen(assets.crt, term.canvas, room.crtColor);
  scene.add(crt.object);

  // Rei, seated for the saved desk layout
  const vrm = assets.vrm.userData.vrm;
  VRMUtils.removeUnnecessaryVertices(assets.vrm.scene);
  vrm.scene.traverse(o => { o.frustumCulled = false; });
  scene.add(vrm.scene);
  const keymap = buildKeyMap(meta);
  const layout = new Layout(meta, keymap);
  if (assets.layout) layout.set(assets.layout);
  const rei = new Rei(vrm, meta, keymap, assets.pose);
  scene.add(rei.lookTarget);

  const can = new Can(assets.can, meta);
  can.update(rei.canSpot());
  scene.add(can.obj);

  const glow = new KeyGlow(scene, keymap);
  const dust = new Dust(scene);
  const post = new Post(renderer, scene, camera);
  const view = new View(camera, room);
  const sound = new Sound();

  Object.assign(app, { meta, renderer, scene, camera, fullCam, room, term, crt, vrm, keymap, layout, rei, can, glow, sound, view });
  app.actions = createActions(app);
  app.autopilot = new Autopilot(app);
  const hotspots = new Hotspots(app, depthReader(assets.textures.depth.image, meta, fullCam));
  app.cameraViews = new CameraViews(app);
  app.tuner = new Tuner(app);
  installShell(app);
  installInput(app);
  installHud(app);
  if (params.has('tweak')) app.tuner.enable(true);

  // what Rei can look at
  const world = {
    can, cameraPos: camera.position.clone(), screenPoint: room.screenCentre.clone(),
    lampPoint: hotspots.lampPoint, penguinPoint: PENGUIN_POINT, windowPoint: WINDOW_POINT, canPoint: new THREE.Vector3(),
  };

  function resize() {
    // a hidden tab can report a 0x0 viewport: never build zero-sized framebuffers
    const w = Math.max(2, window.innerWidth), h = Math.max(2, window.innerHeight);
    // cap the internal resolution (the baked frame is 2400 px wide and the buffers are 4x MSAA float)
    const pr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(3.8e6 / (w * h)));
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    post.setSize(w, h, pr);
  }
  window.addEventListener('resize', resize);
  resize();

  // the start screen
  const start = $('boot-start');
  setText($('boot-msg'), 'boot.ready');
  start.hidden = false;
  start.focus();
  const enter = () => {
    if (app.started) return;
    app.started = true;
    sound.start();
    $('boot').classList.add('gone');
    setTimeout(() => $('boot').remove(), 1400);
    app.later(0.9, () => app.actions.powerOn());
    app.later(1.6, () => app.boot({ auto: !params.has('manual') }));
  };
  start.addEventListener('click', enter);
  if (params.has('autostart')) enter();

  // let hair and jacket settle into the seated pose before the first visible frame
  rei.update(1 / 60, world);
  vrm.springBoneManager?.reset();
  for (let i = 0; i < 90; i++) rei.update(1 / 60, world);

  // --- the frame ------------------------------------------------------------------------
  const mirror = $('term-mirror');
  let elapsed = 0, fade = 0, termVersion = -1, mirrorColor = -1;

  function tick(dt) {
    if (!app.started) { view.apply(); post.set({ fade: 0 }); post.render(dt); return; }
    elapsed += dt;
    app.idle += dt;
    for (let i = app.timers.length - 1; i >= 0; i--) {
      const timer = app.timers[i];
      if ((timer.t -= dt) <= 0) { app.timers.splice(i, 1); timer.fn(); }
    }
    app.onIdle?.(app.idle);
    app.autopilot.update(dt);
    app.tuner.update(dt);
    view.update(dt, elapsed);
    hotspots.update();

    // terminal -> tube and HUD mirror
    term.update(dt);
    if (term.version !== termVersion) crt.refresh();
    if (term.version !== termVersion || room.crtColor.getHex() !== mirrorColor) {
      termVersion = term.version;
      mirrorColor = room.crtColor.getHex();
      drawMirror(mirror, term, `#${room.crtColor.clone().convertLinearToSRGB().getHexString()}`);
    }

    // room, can, Rei
    room.target.crt = crt.power;
    room.applyToon(rei);
    room.markers.visible = document.body.classList.contains('tuning') && !!app.showLightMarkers;
    room.update(dt, elapsed);
    crt.update(dt, elapsed, room.flicker);
    can.update(rei.canSpot());
    can.lookPoint(world.canPoint);
    rei.update(dt, world);
    app.cameraViews.update();

    glow.update(dt, room.crtColor);
    dust.update(elapsed, room.state);
    fade += (1 - fade) * (1 - Math.exp(-dt * 1.4));
    const c = rei.cfg;
    post.set({
      fade, time: elapsed,
      night: app.cameraViews.inspecting ? 0 : room.nightGrade,
      bloom: { strength: c.bloomStrength + 0.2 * room.state.day, threshold: c.bloomThreshold, radius: c.bloomRadius, soft: c.bloomSoft },
    });
    post.render(dt);
  }

  // debugging aid: run the simulation forward without waiting for real time
  app.advance = (sec, step = 1 / 30) => { for (let s = 0; s < sec; s += step) tick(step); };

  let last = performance.now();
  const frame = now => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    tick(dt);
  };
  requestAnimationFrame(frame);
}
