// The live picture on the CRT: the terminal canvas drawn onto the tube's glass (exported from the
// scene as crt_screen.glb), tinted with the phosphor colour, with scanlines and a slow roll bar.
import * as THREE from 'three';
import { damp } from '../util.js';

const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main(){
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    mv.xyz *= 0.988;                      // sit just in front of the baked glass depth
    gl_Position = projectionMatrix * mv;
  }`;

const fragmentShader = /* glsl */`
  uniform sampler2D tScreen; uniform vec3 uColor; uniform float uGain, uTime; varying vec2 vUv;
  void main(){
    vec2 uv = vUv;
    float v = texture2D(tScreen, uv).r;
    float halo = 0.0;
    for (int i = 0; i < 6; i++) {
      float a = float(i) * 1.0472;
      halo += texture2D(tScreen, uv + vec2(cos(a), sin(a)) * 0.006, 2.0).r;
    }
    halo /= 6.0;
    float scan = 0.8 + 0.2 * sin(uv.y * 3.14159 * 480.0);
    float bar = fract(uv.y * 0.9 + uTime * 0.11);
    float roll = 1.0 + 0.1 * smoothstep(0.0, 0.03, bar) * smoothstep(0.12, 0.03, bar);
    vec2 e = abs(uv - 0.5) * 2.0;
    float edge = 1.0 - smoothstep(0.86, 1.0, max(e.x, e.y));
    vec3 col = uColor * (v * 1.5 + halo * 0.55 + 0.02) * scan * roll;
    col += vec3(v * v) * 0.35;
    gl_FragColor = vec4(col * uGain * edge, 1.0);
  }`;

export class CrtScreen {
  constructor(gltf, canvas, color) {
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.flipY = false;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.anisotropy = 8;
    this.material = new THREE.ShaderMaterial({
      uniforms: { tScreen: { value: this.texture }, uColor: { value: color }, uGain: { value: 0 }, uTime: { value: 0 } },
      vertexShader, fragmentShader,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    });
    gltf.scene.traverse(o => { if (o.isMesh) { o.material = this.material; o.frustumCulled = false; o.renderOrder = 5; } });
    this.object = gltf.scene;
    this.power = 0;   // 0 off, 1 on (eases in)
    this.gain = 0;
  }

  powerOn() { this.power = 1; }

  // the terminal canvas changed
  refresh() { this.texture.needsUpdate = true; }

  update(dt, time, flicker) {
    this.gain = damp(this.gain, this.power, 3, dt);
    this.material.uniforms.uGain.value = this.gain * flicker * 2.6;
    this.material.uniforms.uTime.value = time;
  }
}
