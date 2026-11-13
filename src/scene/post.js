// Post-processing: bloom, then the room's own night grade (violet shadows, contrast, vignette, grain).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uNight: { value: 1 }, uTime: { value: 0 },
    uExposure: { value: 1.11 }, uFade: { value: 0 }, uContrast: { value: 0.3 },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uNight, uTime, uExposure, uFade, uContrast; varying vec2 vUv;
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec3 c = max(texture2D(tDiffuse, vUv).rgb, 0.0);
      // night grade: violet shadows, blue-white highlights, 30% desaturation
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float f = clamp((lum - 0.018) / 0.162, 0.0, 1.0);
      vec3 tint = mix(vec3(0.64, 0.5, 1.0), vec3(0.67, 0.86, 1.0), f);
      vec3 g = mix(c, vec3(lum), 0.3) * tint * 0.574 + vec3(0.0055, 0.0048, 0.014);
      c = mix(c, g, uNight) * uExposure * uFade;
      // soft shoulder, then a medium-high contrast curve in display space
      c = mix(c, 0.8 + 0.2 * tanh((c - 0.8) / 0.2), step(0.8, c));
      vec3 s = toSRGB(clamp(c, 0.0, 1.0));
      s = mix(s, s * s * (3.0 - 2.0 * s), uContrast);
      vec2 q = vUv - 0.5;
      s *= 1.0 - 0.42 * smoothstep(0.35, 0.95, length(q * vec2(1.0, 0.82)));
      s += (hash(vUv * 917.0 + fract(uTime) * 61.0) - 0.5) * 0.022;
      gl_FragColor = vec4(s, 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    const target = new THREE.WebGLRenderTarget(64, 64, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.7, 0.8);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  setSize(w, h, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * pixelRatio, h * pixelRatio);
  }

  // fade 0..1 from black, night 0..1 strength of the grade, bloom settings from the tuning values
  set({ fade, night, time, bloom }) {
    const u = this.grade.uniforms;
    u.uFade.value = fade;
    if (night !== undefined) u.uNight.value = night;
    if (time !== undefined) u.uTime.value = time;
    if (bloom) {
      this.bloom.strength = bloom.strength;
      this.bloom.threshold = bloom.threshold;
      this.bloom.radius = bloom.radius;
      this.bloom.highPassUniforms.smoothWidth.value = Math.max(0.001, bloom.soft);
    }
  }

  render(dt) { this.composer.render(dt); }
}
