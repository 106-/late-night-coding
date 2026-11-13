// Simple stand-ins for the baked room (desk, keycaps, chair) in the side / front / top / free views,
// where the background picture is hidden.
import * as THREE from 'three';

const material = (color, opacity) => new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity });

export function buildGuides(meta, km) {
  const g = new THREE.Group();

  const desk = meta.desk.find(d => d.name.includes('core')) || meta.desk[0];
  if (desk) {
    const a = new THREE.Vector3().fromArray(desk.min), b = new THREE.Vector3().fromArray(desk.max);
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(b.x - a.x), Math.abs(b.y - a.y), Math.abs(b.z - a.z)), material(0x8a7560, 0.85));
    m.position.copy(a).add(b).multiplyScalar(0.5);
    g.add(m);
  }

  // keycaps, with the F and J bumps
  const keys = [...new Set(km.keys.values())];
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material(0xe8e8ee, 1), keys.length);
  const m4 = new THREE.Matrix4();
  keys.forEach((k, i) => {
    m4.makeBasis(km.ax.clone().multiplyScalar(k.w * 0.92), km.up.clone().multiplyScalar(0.012), km.ay.clone().multiplyScalar(k.d * 0.92))
      .setPosition(k.pos.clone().addScaledVector(km.up, -0.006));
    caps.setMatrixAt(i, m4);
  });
  g.add(caps);
  for (const code of ['KeyF', 'KeyJ']) {
    const dot = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.002, 0.004), material(0x40ff90, 1));
    dot.position.copy(km.keys.get(code).pos).addScaledVector(km.up, 0.001);
    g.add(dot);
  }

  // chair: seat and backrest bands, in the chair's own frame
  const ch = meta.chair;
  const o = new THREE.Vector3().fromArray(ch.origin), cx = new THREE.Vector3().fromArray(ch.x), cy = new THREE.Vector3().fromArray(ch.y);
  const up = new THREE.Vector3(0, 1, 0);
  const box = ([x0, x1], [y0, y1], [z0, z1], color, opacity) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material(color, opacity));
    const c = o.clone().addScaledVector(cx, (x0 + x1) / 2).addScaledVector(cy, (y0 + y1) / 2).addScaledVector(up, (z0 + z1) / 2);
    m.matrix.makeBasis(cx.clone().multiplyScalar(x1 - x0), up.clone().multiplyScalar(z1 - z0), cy.clone().multiplyScalar(y1 - y0)).setPosition(c);
    m.matrixAutoUpdate = false;
    g.add(m);
  };
  const [sx, sy, sz] = ch.seatLocal;
  box(sx, sy, [sz[0], ch.seatTopCentre], 0x3a3f55, 0.75);
  for (const [z, front, back] of ch.backProfileLocalY) box(ch.backLocal[0], [front, Math.max(back, front + 0.02)], [z - 0.05, z + 0.05], 0x3a3f55, 0.55);
  return g;
}
