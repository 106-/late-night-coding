// Small helpers shared by every module.

export const pick = list => list[Math.floor(Math.random() * list.length)];
export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// smoothstep from a to b
export function smooth(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// frame-rate independent approach of `cur` towards `target`
export const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

// share of the remaining distance to cover this frame at `rate`
export const follow = (rate, dt) => 1 - Math.exp(-rate * dt);

export const $ = id => document.getElementById(id);
