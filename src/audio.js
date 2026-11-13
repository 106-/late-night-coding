// All sound is synthesised: key clicks, switches, tube hum and an optional slow night tune.
export class Sound {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.music = null;
  }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);

    // one second of white noise reused by every percussive sound
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    this.noise = buf;

    // room tone: a faint tube hum and air
    const hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 100;
    const humF = ctx.createBiquadFilter(); humF.type = 'lowpass'; humF.frequency.value = 220;
    this.humGain = ctx.createGain(); this.humGain.gain.value = 0.012;
    hum.connect(humF).connect(this.humGain).connect(this.master); hum.start();
    const air = ctx.createBufferSource(); air.buffer = buf; air.loop = true;
    const airF = ctx.createBiquadFilter(); airF.type = 'bandpass'; airF.frequency.value = 420; airF.Q.value = 0.4;
    const airG = ctx.createGain(); airG.gain.value = 0.012;
    air.connect(airF).connect(airG).connect(this.master); air.start();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  burst({ freq = 2000, q = 1, dur = 0.04, gain = 0.2, type = 'bandpass', delay = 0, offset = Math.random() * 0.8 }) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, offset, dur + 0.02);
  }

  tone({ freq = 440, to = null, dur = 0.2, gain = 0.1, type = 'sine', delay = 0, attack = 0.005, dest = null }) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  key(code) {
    if (!this.ctx) return;
    const big = code === 'Space' || code === 'Enter' || code === 'Backspace';
    const v = 0.85 + Math.random() * 0.3;
    this.burst({ freq: (big ? 1500 : 2600) * v, q: 1.4, dur: 0.03, gain: 0.16 });
    this.burst({ freq: (big ? 240 : 420) * v, q: 2.5, dur: big ? 0.09 : 0.06, gain: big ? 0.3 : 0.2 });
    // the key coming back up
    this.burst({ freq: 3200 * v, q: 1.2, dur: 0.02, gain: 0.05, delay: 0.07 + Math.random() * 0.03 });
  }

  switchClick() {
    this.burst({ freq: 1800, q: 3, dur: 0.03, gain: 0.3 });
    this.burst({ freq: 500, q: 2, dur: 0.06, gain: 0.25, delay: 0.012 });
  }

  squeak() {
    this.tone({ freq: 760, to: 1500, dur: 0.11, gain: 0.12, type: 'triangle' });
    this.tone({ freq: 1500, to: 900, dur: 0.14, gain: 0.1, type: 'triangle', delay: 0.11 });
  }

  bell() { this.tone({ freq: 1320, dur: 0.5, gain: 0.07 }); this.tone({ freq: 1980, dur: 0.35, gain: 0.03 }); }
  error() { this.tone({ freq: 196, dur: 0.16, gain: 0.08, type: 'square' }); }
  can() { this.burst({ freq: 5200, q: 0.8, dur: 0.25, gain: 0.12, type: 'highpass' }); this.tone({ freq: 240, to: 120, dur: 0.08, gain: 0.12, type: 'triangle' }); }
  // aluminium on the desk: a light knock with a short ring
  canTap(gain = 1) { this.burst({ freq: 2100, q: 7, dur: 0.05, gain: 0.12 * gain }); this.tone({ freq: 1240, to: 1180, dur: 0.18, gain: 0.018 * gain, type: 'sine', delay: 0.004 }); }
  sip() { this.tone({ freq: 190, to: 115, dur: 0.13, gain: 0.07, type: 'triangle' }); this.burst({ freq: 700, q: 1.5, dur: 0.08, gain: 0.03, delay: 0.02 }); }
  chime() { [659, 784, 988, 1319].forEach((f, i) => this.tone({ freq: f, dur: 0.9, gain: 0.05, delay: i * 0.09 })); }
  degauss() { this.tone({ freq: 60, to: 38, dur: 0.9, gain: 0.22, type: 'sawtooth' }); this.burst({ freq: 300, q: 0.5, dur: 0.6, gain: 0.08 }); }

  // a slow generative tune: soft pad chords and sparse high notes over a feedback delay
  toggleMusic(on = !this.music) {
    const ctx = this.ctx; if (!ctx) return false;
    if (!on) {
      if (this.music) {
        const m = this.music; this.music = null;
        clearInterval(m.timer);
        m.out.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
        setTimeout(() => m.out.disconnect(), 4000);
      }
      return false;
    }
    if (this.music) return true;
    const out = ctx.createGain(); out.gain.value = 0;
    out.gain.setTargetAtTime(0.5, ctx.currentTime, 1.2);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
    const delay = ctx.createDelay(1.5); delay.delayTime.value = 0.46;
    const fb = ctx.createGain(); fb.gain.value = 0.42;
    lp.connect(out); lp.connect(delay); delay.connect(fb).connect(delay); delay.connect(out);
    out.connect(this.master);
    const chords = [[220, 261.6, 329.6, 392], [174.6, 220, 261.6, 329.6], [196, 246.9, 293.7, 392], [164.8, 207.7, 246.9, 329.6]];
    const scale = [523.3, 587.3, 659.3, 784, 880, 1046.5];
    let step = 0;
    const tick = () => {
      if (!this.music) return;
      const chord = chords[Math.floor(step / 8) % chords.length];
      if (step % 8 === 0) chord.forEach((f, i) => this.tone({ freq: f / 2, dur: 4.4, gain: 0.05, type: i % 2 ? 'triangle' : 'sine', attack: 0.9, dest: lp }));
      if (Math.random() < 0.55) this.tone({ freq: scale[Math.floor(Math.random() * scale.length)], dur: 1.4, gain: 0.035, type: 'sine', attack: 0.02, dest: lp });
      if (step % 4 === 0) this.tone({ freq: chord[0] / 4, dur: 1.6, gain: 0.07, type: 'sine', attack: 0.03, dest: lp });
      step++;
    };
    this.music = { out, timer: setInterval(tick, 560) };
    tick();
    return true;
  }
}
