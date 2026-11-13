// Framing: the baked frame is cover-fitted to the window and slightly zoomed; the camera's view
// offset and the room shader read the same crop rectangle, so live objects stay registered with
// the picture.
import { clamp, damp } from '../util.js';

export const FRAME_W = 1600, FRAME_H = 900, ASPECT = FRAME_W / FRAME_H;
const SCENE_ZOOM = 1.035;

export class View {
  constructor(camera, room) {
    this.camera = camera;
    this.room = room;
    this.zoom = 1.5;              // starts close and settles out
    this.zoomGoal = SCENE_ZOOM;
    this.lock = null;             // { x, y }: centre the crop here instead of following Rei
    this.focus = { x: 0.55, y: 0.55 };   // kept in frame when the window is narrower than the picture
    this.rect = { x: 0, y: 0, w: 1, h: 1 };
  }

  // the default framing (or a fixed one for the inspection views)
  reset(zoom = SCENE_ZOOM, lock = null, jump = false) {
    this.zoomGoal = zoom;
    this.lock = lock;
    if (jump) this.zoom = zoom;
  }

  // ease the zoom (with a very slow breathing drift) towards its goal
  update(dt, time) {
    this.zoom = damp(this.zoom, this.zoomGoal + Math.sin(time * 0.11) * 0.006, 0.9, dt);
    this.apply();
  }

  apply() {
    const a = Math.max(2, window.innerWidth) / Math.max(2, window.innerHeight);
    let w = 1, h = 1;
    if (a >= ASPECT) h = ASPECT / a; else w = a / ASPECT;
    w /= this.zoom; h /= this.zoom;
    const cx = this.lock ? this.lock.x : 0.5 + (this.focus.x - 0.5) * (1 - w);
    const cy = this.lock ? this.lock.y : 0.5 + (this.focus.y - 0.5) * (1 - h) * 0.7;
    const x = clamp(cx - w / 2, 0, 1 - w), y = clamp(cy - h / 2, 0, 1 - h);
    this.rect = { x, y, w, h };
    this.camera.setViewOffset(FRAME_W, FRAME_H, x * FRAME_W, (1 - (y + h)) * FRAME_H, w * FRAME_W, h * FRAME_H);
    this.room.setRect(x, y, w, h);
  }
}
