/**
 * The kitchen's sound, made on the spot: no files, only noise and oscillators
 * shaped by filters and envelopes.
 *
 * The sizzle is what matters most. It is two things at once: a steady hiss
 * of fat and steam, bandpassed high, and a crackle of tiny pops on top, as
 * many a second as the pan is busy. Both follow how much wet food is on hot
 * iron, so the pan sounds the way it looks — quiet when it is cold, a roar
 * when a bowl of egg hits it, and a dry tick when the potatoes are nearly
 * done. Everything else is a short shaped burst: the knife, the shell, the
 * whisk on the bowl, the bell.
 *
 * Nothing here runs until `start()` — the first click — since browsers will
 * not make sound before somebody has asked them to.
 */

export function createSound() {
  let ctx = null;
  let master = null;
  let noise = null;
  let sizzle = null;
  let hiss = null;
  let muted = false;
  let crackleDebt = 0;
  let level = { sizzle: 0, burner: 0, stir: 0 };

  function start() {
    if (ctx) {
      ctx.resume?.();
      return;
    }
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    const squash = ctx.createDynamicsCompressor();
    squash.threshold.value = -16;
    squash.ratio.value = 4;
    master.connect(squash).connect(ctx.destination);

    /** Two seconds of white noise, looped wherever a steady noise is wanted. */
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    sizzle = loop({ type: 'bandpass', frequency: 5200, Q: 0.7 }, { type: 'highpass', frequency: 1800 });
    hiss = loop({ type: 'lowpass', frequency: 900 }, { type: 'highpass', frequency: 160 });
  }

  /** A looping noise through two filters into a gain that starts silent. */
  function loop(a, b) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f1 = filter(a), f2 = filter(b);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(f1).connect(f2).connect(gain).connect(master);
    src.start();
    return { gain, f1 };
  }

  function filter({ type, frequency, Q = 1 }) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = Q;
    return f;
  }

  /** A burst of noise, `length` seconds, through a filter, with a fast attack and a decay. */
  function burst({ at = 0, length = 0.05, type = 'bandpass', frequency = 2000, Q = 1, gain = 0.3, sweep = null }) {
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = filter({ type, frequency, Q });
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + length);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.01, length / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + length + 0.05);
  }

  /** A tone that falls from `from` to `to` hertz as it fades. */
  function tone({ at = 0, from = 440, to = from, length = 0.2, gain = 0.2, type = 'sine' }) {
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + length);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }

  const jitter = (v, k = 0.1) => v * (1 + (Math.random() - 0.5) * 2 * k);

  const play = {
    /** The knife through potato and into maple: a squelch, then a woody knock. */
    chop(cut) {
      if (cut) burst({ length: 0.045, frequency: jitter(1800, 0.2), Q: 1.4, gain: 0.25 });
      tone({ at: 0.012, from: jitter(210), to: 90, length: 0.09, gain: 0.5 });
      burst({ at: 0.012, length: 0.03, type: 'lowpass', frequency: 1400, gain: 0.35 });
    },
    scrape() {
      burst({ length: 0.32, frequency: 2600, Q: 2, gain: 0.12, sweep: 1500 });
    },
    /** Food into a hot pan: a rush of sizzle, louder the hotter it is. */
    splash(heat = 1, size = 1) {
      const g = Math.min(0.5, 0.15 + 0.3 * heat) * Math.min(1, 0.4 + size * 0.1);
      burst({ length: 0.7, frequency: 4800, Q: 0.6, gain: g });
      crackleDebt += 12 * heat;
    },
    toss() {
      burst({ length: 0.34, frequency: 420, Q: 0.8, gain: 0.32, sweep: 1600 });
      tone({ from: 120, to: 70, length: 0.12, gain: 0.25, type: 'triangle' });
    },
    land(heat = 1) {
      burst({ length: 0.08, type: 'lowpass', frequency: 700, gain: 0.2 });
      crackleDebt += 10 * heat;
    },
    flip() {
      burst({ length: 0.06, frequency: 3200, Q: 2, gain: 0.08 });
    },
    /** The shell on the rim: a crisp tap with a crunch in it. */
    crack() {
      tone({ from: jitter(1800), to: 900, length: 0.03, gain: 0.25, type: 'triangle' });
      burst({ length: 0.05, frequency: 3400, Q: 1.5, gain: 0.3 });
      burst({ at: 0.03, length: 0.06, frequency: 2600, Q: 2, gain: 0.18 });
    },
    plop() {
      tone({ from: jitter(320), to: 110, length: 0.12, gain: 0.35 });
    },
    /** Wire on glazed stoneware, now and then, as the whisk goes round. */
    whisk(speed) {
      if (Math.random() < Math.min(0.9, speed * 3)) tone({ from: jitter(3200, 0.25), length: 0.05, gain: 0.04 + speed * 0.04, type: 'triangle' });
      burst({ length: 0.06, frequency: 1200, Q: 0.8, gain: Math.min(0.08, speed * 0.1) });
    },
    pour() {
      for (let k = 0; k < 8; k++) tone({ at: k * 0.16, from: jitter(260, 0.2), to: 140, length: 0.1, gain: 0.12 });
    },
    oil() {
      for (let k = 0; k < 5; k++) tone({ at: k * 0.11, from: jitter(380, 0.15), to: 200, length: 0.08, gain: 0.1 });
      crackleDebt += 6;
    },
    /** The burner: clicks of the igniter, then the gas catching. */
    ignite() {
      for (let k = 0; k < 3; k++) burst({ at: k * 0.09, length: 0.012, type: 'highpass', frequency: 3000, gain: 0.3 });
      burst({ at: 0.28, length: 0.45, type: 'lowpass', frequency: 600, gain: 0.3, sweep: 250 });
    },
    knob() {
      burst({ length: 0.015, type: 'highpass', frequency: 2500, gain: 0.12 });
    },
    clink() {
      tone({ from: jitter(2400, 0.2), length: 0.08, gain: 0.05, type: 'triangle' });
    },
    /** Order up. */
    bell() {
      for (const [mult, g, len] of [[1, 0.3, 1.6], [2.76, 0.12, 1.0], [5.4, 0.05, 0.6]]) {
        tone({ from: 1320 * mult, length: len, gain: g });
        tone({ at: 0.18, from: 1100 * mult, length: len, gain: g * 0.8 });
      }
    },
    ui() {
      burst({ length: 0.02, type: 'bandpass', frequency: 2200, Q: 3, gain: 0.06 });
    },
  };

  return {
    start,
    play: (name, ...args) => {
      if (ctx && !muted) play[name]?.(...args);
    },

    /**
     * Once a frame: the steady sounds follow the kitchen. `sizzle` and
     * `burner` are 0 to 1, `stir` is how hard the spatula is working.
     */
    update(dt, next) {
      if (!ctx) return;
      level = next;
      const t = ctx.currentTime;
      sizzle.gain.gain.setTargetAtTime(Math.min(0.32, next.sizzle * 0.34), t, 0.15);
      sizzle.f1.frequency.setTargetAtTime(4200 + next.sizzle * 2200, t, 0.3);
      hiss.gain.gain.setTargetAtTime(next.burner * 0.05, t, 0.2);

      /** The crackle: tiny pops, scattered, more of them the busier the pan. */
      crackleDebt += dt * next.sizzle * 55;
      let pops = 0;
      while (crackleDebt >= 1 && pops < 12) {
        crackleDebt -= Math.random() * 2;
        pops += 1;
        burst({
          at: Math.random() * dt,
          length: 0.004 + Math.random() * 0.01,
          type: 'highpass',
          frequency: 2000 + Math.random() * 4000,
          gain: 0.05 + Math.random() * 0.18 * Math.min(1, next.sizzle + 0.3),
        });
      }
      if (crackleDebt > 20) crackleDebt = 20;
      if (next.stir > 0.01 && Math.random() < next.stir * dt * 20) burst({ length: 0.08, frequency: 2200, Q: 2, gain: 0.05 * Math.min(1, next.stir) });
    },

    get muted() { return muted; },
    set muted(on) {
      muted = Boolean(on);
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.05);
    },
    get level() { return level; },
  };
}
