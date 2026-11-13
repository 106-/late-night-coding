// Small live touches over the baked room: a glow on each pressed keycap, dust drifting in the light.
import * as THREE from 'three';

const WHITE = new THREE.Color(1, 1, 1);

export class KeyGlow {
  constructor(scene, keymap, count = 10) {
    this.keymap = keymap;
    this.next = 0;
    const geometry = new THREE.PlaneGeometry(1, 1);
    this.quads = Array.from({ length: count }, () => {
      const m = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0 } },
        vertexShader: /* glsl */`varying vec2 vUv;
          void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); mv.xyz *= 0.996; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv;
          void main(){ vec2 d = abs(vUv - 0.5) * 2.0; float m = 1.0 - smoothstep(0.55, 1.0, max(d.x, d.y)); gl_FragColor = vec4(uColor * uAlpha * m, 1.0); }`,
        blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
      }));
      m.visible = false; m.matrixAutoUpdate = false; m.frustumCulled = false; m.renderOrder = 6;
      scene.add(m);
      return m;
    });
  }

  flash(key) {
    const km = this.keymap, m = this.quads[this.next++ % this.quads.length];
    const x = km.ax.clone().multiplyScalar(key.w * 1.25), y = km.ay.clone().multiplyScalar(key.d * 1.25);
    m.matrix.makeBasis(x, y, km.up).setPosition(key.pos.clone().addScaledVector(km.up, 0.0008));
    m.matrixWorldNeedsUpdate = true;
    m.material.uniforms.uAlpha.value = 1;
    m.visible = true;
  }

  // the glow takes the phosphor's colour, washed towards white
  update(dt, phosphor) {
    for (const m of this.quads) {
      if (!m.visible) continue;
      const u = m.material.uniforms;
      u.uAlpha.value *= Math.exp(-dt * 9);
      u.uColor.value.copy(phosphor).lerp(WHITE, 0.45).multiplyScalar(0.9);
      if (u.uAlpha.value < 0.02) m.visible = false;
    }
  }
}

export class Dust {
  constructor(scene, count = 160) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.pos.set([-2.0 + Math.random() * 2.6, 0.75 + Math.random() * 1.3, -1.6 + Math.random() * 2.8], i * 3);
      this.seed[i] = Math.random() * 100;
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.material = new THREE.PointsMaterial({
      size: 0.007, sizeAttenuation: true, map: moteTexture(), transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, color: 0x8f8cff,
    });
    const points = new THREE.Points(this.geometry, this.material);
    points.frustumCulled = false; points.renderOrder = 7;
    scene.add(points);
  }

  // light: the room's eased state (more light, more visible dust)
  update(time, light) {
    const p = this.pos;
    for (let i = 0; i < this.count; i++) {
      const s = this.seed[i], j = i * 3;
      p[j] += Math.sin(time * 0.21 + s) * 0.0004;
      p[j + 1] += (Math.sin(time * 0.13 + s * 2.0) * 0.6 - 0.25) * 0.0004;
      p[j + 2] += Math.cos(time * 0.17 + s * 1.3) * 0.0004;
      if (p[j + 1] < 0.74) p[j + 1] = 2.0;   // settled: start again at the top
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.material.opacity = 0.2 + 0.12 * light.lamp + 0.3 * light.ceil + 0.5 * light.day;
  }
}

function moteTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
