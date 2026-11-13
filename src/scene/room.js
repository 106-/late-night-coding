// The room: path-traced light layers summed in a shader, with per-pixel depth so
// real-time objects (Rei, the CRT image, dust) sit inside the baked picture.
import * as THREE from 'three';
import { smooth } from '../util.js';

export const LAYERS = ['base', 'crt', 'lamp', 'ceil', 'day'];
const UP = new THREE.Vector3(0, 1, 0);
const _f = new THREE.Vector3(), _l = new THREE.Vector3(), _d = new THREE.Vector3();

const bgVert = /* glsl */`
uniform vec4 uRect;      // x, y, w, h of the visible part of the full frame (uv, y up)
varying vec2 vUv;
void main() {
  vUv = uRect.xy + uv * uRect.zw;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const bgFrag = /* glsl */`
precision highp float;
uniform sampler2D tBase, tCrt, tLamp, tCeil, tDay, tDepth;
uniform vec3 uW[5];      // per-layer colour weights (already divided by bake gain)
uniform float uTime;
uniform float uCity;     // 0..1 how lit the city windows are
uniform vec3 uSkyTint;
varying vec2 vUv;

vec3 hdr(sampler2D t, vec2 uv) {
  vec3 r = min(texture2D(t, uv).rgb, vec3(0.985));
  return r / (1.0 - r);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec4 dz = texture2D(tDepth, vUv);
  float d = (dz.r * 255.0 * 256.0 + dz.g * 255.0) / 65535.0;   // inverse depth, 1 = near plane
  float z = 1.0 / (d * (1.0 / 0.1 - 1.0 / 1000.0) + 1.0 / 1000.0);
  float far = smoothstep(40.0, 70.0, z);                       // city and sky

  vec3 base = hdr(tBase, vUv);
  // lit windows of the far city breathe a little and can be dimmed towards morning
  float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
  float cell = hash(floor(vUv * vec2(600.0, 340.0)));
  float tw = 0.86 + 0.14 * sin(uTime * (0.4 + cell * 1.7) + cell * 40.0);
  float lit = far * smoothstep(0.004, 0.03, lum);
  base *= mix(1.0, mix(0.04, tw, uCity), lit);

  vec3 day = hdr(tDay, vUv);
  day *= mix(vec3(1.0), uSkyTint, far);
  day /= 1.0 + dot(day, vec3(0.3333)) * 0.55;        // keep the sky from burning out

  // the keys right under the tube are far hotter than anything else: give that layer a knee
  vec3 crt = hdr(tCrt, vUv) * uW[1];
  crt /= 1.0 + dot(crt, vec3(0.3333)) * 1.1;
  vec3 c = base * uW[0] + crt + hdr(tLamp, vUv) * uW[2]
         + hdr(tCeil, vUv) * uW[3] + day * uW[4];
  gl_FragColor = vec4(c, 1.0);
  gl_FragDepth = 1.0 - d;
}`;

export class Room {
  constructor(meta, gains, textures) {
    this.meta = meta;
    this.gains = gains;
    // artistic state, eased every frame
    this.state = { lamp: 1, ceil: 0, crt: 1, day: 0, city: 1 };
    this.target = { lamp: 1, ceil: 0, crt: 1, day: 0, city: 1 };
    this.crtColor = new THREE.Color(0.25, 1.0, 0.55);
    this.crtColorTarget = this.crtColor.clone();
    this.crtPulse = 0;      // extra CRT light right after a degauss (power-on, colour change)
    // strength of the real-time lights on the character
    this.k = { crt: 0.75, ambient: 0.3, window: 0.75, fill: 0.55, lamp: 0.16, ceil: 2.2, ceilAmb: 0.35, dayAmb: 0.5, sun: 1.1, dayLayer: 0.56 };
    this.flicker = 1;

    const u = {
      uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uW: { value: LAYERS.map(() => new THREE.Vector3()) },
      uTime: { value: 0 },
      uCity: { value: 1 },
      uSkyTint: { value: new THREE.Vector3(1, 1, 1) },
      tDepth: { value: textures.depth },
    };
    const names = { base: 'tBase', crt: 'tCrt', lamp: 'tLamp', ceil: 'tCeil', day: 'tDay' };
    for (const k of LAYERS) u[names[k]] = { value: textures[k] };
    this.uniforms = u;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: u, vertexShader: bgVert, fragmentShader: bgFrag,
        depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;

    // lights that fall on Rei, mirroring the baked layers
    const L = meta.lights;
    const p = n => new THREE.Vector3().fromArray(L[n].position);
    this.lights = new THREE.Group();
    this.ambient = new THREE.AmbientLight(0x6f66ff, 0.5);
    this.windowLight = new THREE.DirectionalLight(0x8090ff, 0.6);
    this.windowLight.position.copy(p('REAL window diffuse night'));
    this.windowLight.target.position.set(-1.2, 0.9, 0.6);
    this.fill = new THREE.DirectionalLight(0x9a94ff, 0.5);
    this.fill.position.copy(p('REAL room soft front fill'));
    this.fill.target.position.set(-1.2, 0.9, 0.6);
    const sc = meta.hotspots.screen;
    this.screenCentre = new THREE.Vector3().fromArray(sc.min).add(new THREE.Vector3().fromArray(sc.max)).multiplyScalar(0.5);
    this.crtLight = new THREE.PointLight(0x40ff8c, 1, 0, 2);
    // a tube is a broad source: park the point light behind the glass so its falloff is gentle
    this.crtLight.position.copy(this.screenCentre).add(new THREE.Vector3(-0.2, 0.03, -0.2));
    this.lampLight = new THREE.PointLight(0xffa161, 1, 0, 2);
    this.lampLight.position.copy(p('ROOM_Lamp_warm_bulb'));
    this.ceilLight = new THREE.PointLight(0xffe0bd, 1, 0, 2);
    this.ceilLight.position.set(-0.35, 2.62, 0.3);
    this.sun = new THREE.DirectionalLight(0xffb080, 0);
    this.sun.position.set(-1.2 + 0.42 * 6, 0.9 + 0.26 * 6, 0.6 - 0.86 * 6);
    this.sun.target.position.set(-1.2, 0.9, 0.6);
    this.lights.add(this.ambient, this.windowLight, this.windowLight.target, this.fill, this.fill.target,
      this.crtLight, this.lampLight, this.ceilLight, this.sun, this.sun.target);
    this.k0 = { ...this.k };

    // markers shown while tuning: where each toon light comes from
    this.markers = new THREE.Group();
    this.markers.visible = false;
    const dot = (hex, r) => new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12),
      new THREE.MeshBasicMaterial({ color: hex, toneMapped: false, depthTest: false, transparent: true, opacity: 0.9 }));
    this.mark = { window: dot(0x8090ff, 0.03), fill: dot(0xc8c2ff, 0.03), crt: dot(0x40ff8c, 0.022) };
    for (const m of Object.values(this.mark)) { m.renderOrder = 50; this.markers.add(m); }
    this.lights.add(this.markers);
  }

  // Place the lights that shade Rei's toon material from the tuning values (rei.cfg):
  // directional lights by azimuth/elevation around her, the CRT point light as an offset from her head.
  applyToon(rei) {
    const c = rei.cfg, head = rei.points.head;
    if (!head) return;
    const f = _f.copy(rei.fwd).setY(0).normalize(), l = _l.crossVectors(UP, f).normalize();
    const dir = (az, el) => {
      const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
      return _d.copy(f).multiplyScalar(Math.cos(a)).addScaledVector(l, Math.sin(a)).multiplyScalar(Math.cos(e)).addScaledVector(UP, Math.sin(e));
    };
    for (const [L, m, az, el] of [[this.windowLight, this.mark.window, c.winAz, c.winEl], [this.fill, this.mark.fill, c.fillAz, c.fillEl]]) {
      const d = dir(az, el);
      L.target.position.copy(head);
      L.position.copy(head).addScaledVector(d, 4);
      m.position.copy(head).addScaledVector(d, 0.45);
    }
    this.crtLight.position.copy(head).addScaledVector(f, c.crtFwd).addScaledVector(l, c.crtLeft).addScaledVector(UP, c.crtUp);
    this.mark.crt.position.copy(this.crtLight.position);
    this.k.window = this.k0.window * c.winPower;
    this.k.fill = this.k0.fill * c.fillPower;
    this.k.crt = this.k0.crt * c.crtPower;
    this.k.lamp = this.k0.lamp * c.lampPower;
    this.k.ambient = this.k0.ambient * c.ambientPower;
  }

  setRect(x, y, w, h) { this.uniforms.uRect.value.set(x, y, w, h); }

  update(dt, t) {
    const s = this.state, g = this.target;
    const ease = (k, rate) => { s[k] += (g[k] - s[k]) * (1 - Math.exp(-dt * rate)); };
    ease('lamp', 9); ease('ceil', 14); ease('crt', 6); ease('day', 0.22); ease('city', 0.6);
    this.crtColor.lerp(this.crtColorTarget, 1 - Math.exp(-dt * 5));
    this.crtPulse *= Math.exp(-dt * 9);
    // steady tube: no mains flicker and no pulse while typing; only the one-off degauss flash
    // (power-on, `crt <colour>`) still brightens it for a moment
    this.flicker = 1 + this.crtPulse * 0.12;

    const day = s.day;
    // dawn: orange and dim first, neutral and bright later
    const dawnTint = new THREE.Color().setRGB(1.0, 0.56, 0.34).lerp(new THREE.Color(1, 0.97, 0.92), smooth(0.35, 1.0, day));
    const dayGain = 0.03 + 0.97 * Math.pow(day, 1.5);
    const night = 1 - 0.82 * smooth(0.1, 0.9, day);

    // the baked CRT layer is lit by a green lamp; re-tint it by luminance-preserving colour
    const cc = this.crtColor, k = s.crt * this.flicker;
    const W = this.uniforms.uW.value, G = this.gains;
    W[0].setScalar(night / G.base);
    W[1].set(cc.r / 0.25, cc.g / 1.0, cc.b / 0.55).multiplyScalar(0.62 * k / G.crt);
    W[2].setScalar(s.lamp * 1.0 / G.lamp);
    W[3].setScalar(s.ceil * 0.4 / G.ceil);
    W[4].set(dawnTint.r, dawnTint.g, dawnTint.b).multiplyScalar(day > 0.001 ? this.k.dayLayer * dayGain / G.day : 0);
    this.uniforms.uTime.value = t;
    this.uniforms.uCity.value = s.city * (1 - smooth(0.25, 0.8, day));
    this.uniforms.uSkyTint.value.set(1.0, 0.8 + 0.2 * day, 0.62 + 0.38 * day).multiplyScalar(0.5 + 0.5 * day);

    // matching light on the character
    this.ambient.intensity = this.k.ambient * night + this.k.ceilAmb * s.ceil + this.k.dayAmb * dayGain;
    this.ambient.color.setRGB(0.42, 0.4, 1.0).lerp(new THREE.Color(1, 0.95, 0.9), Math.max(s.ceil * 0.8, day * 0.7));
    this.windowLight.intensity = this.k.window * night;
    this.fill.intensity = this.k.fill * night;
    this.crtLight.color.copy(cc);
    this.crtLight.intensity = this.k.crt * k;
    this.lampLight.intensity = this.k.lamp * s.lamp;
    this.ceilLight.intensity = this.k.ceil * s.ceil;
    this.sun.intensity = this.k.sun * dayGain;
    this.sun.color.copy(dawnTint);
  }

  // how strongly the violet night grade should apply (1 = full night look)
  get nightGrade() {
    return 1 - 0.8 * Math.max(this.state.ceil, smooth(0.2, 1.0, this.state.day));
  }
}


export async function loadRoomTextures(base, onProgress) {
  const loader = new THREE.TextureLoader();
  const out = {};
  let done = 0;
  const all = [...LAYERS, 'depth'];
  await Promise.all(all.map(async k => {
    const tex = await loader.loadAsync(`${base}/${k}.${k === 'depth' ? 'png' : 'jpg'}`);
    if (k === 'depth') {
      tex.colorSpace = THREE.NoColorSpace;
      tex.minFilter = tex.magFilter = THREE.NearestFilter;
    } else {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
    }
    tex.generateMipmaps = false;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    out[k] = tex;
    onProgress(++done / all.length);
  }));
  return out;
}
