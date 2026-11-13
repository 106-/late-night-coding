// The NIGHT SHIFT can: left out of the baked room and exported on its own (can.glb), so Rei can
// pick it up.  Its origin is the bottom centre; `rest` is its spot on the desk, `grip` its offset
// from her hand while held.
import * as THREE from 'three';

export class Can {
  constructor(gltf, meta) {
    this.obj = new THREE.Group();
    const model = gltf.scene;
    model.position.fromArray(meta.can.base).negate();
    this.obj.add(model);
    model.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      // no environment map here: tone the metal down so the room lights read on it
      const m = o.material;
      if (m.metalness !== undefined) { m.metalness = Math.min(m.metalness, 0.35); m.roughness = Math.max(m.roughness, 0.42); }
    });
    this.h = meta.can.top - meta.can.bottom;
    this.r = 0.036;
    this.held = null;                  // 'left' | 'right' while in her hand
    this.grip = new THREE.Matrix4();
    this.rest = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  }

  // where she aims her gaze when she looks at it
  lookPoint(out) { return out.copy(this.obj.position).setY(this.obj.position.y + this.h * 0.6); }

  // a box round it on the desk, for hovering and clicking
  box() {
    const centre = this.rest.pos.clone().setY(this.rest.pos.y + this.h / 2);
    return new THREE.Box3().setFromCenterAndSize(centre, new THREE.Vector3(0.1, this.h + 0.03, 0.1));
  }

  // on the desk it follows its spot (which moves with her seat); in her hand Rei moves it
  update(spot) {
    if (this.held) return;
    this.rest.pos.copy(spot);
    this.obj.position.copy(this.rest.pos);
    this.obj.quaternion.copy(this.rest.quat);
  }
}
