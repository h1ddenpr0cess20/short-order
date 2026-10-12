/**
 * Films a game a frame at a time, for scripts/reel.js: the game played by its
 * autopilot on an upright phone. Nothing here runs in real time. The page's
 * clock (its timers, Date.now, every CSS animation and transition) moves on
 * only when a frame is asked for, and the game's own sound is rendered
 * offline in step with the frames, so a frame that takes a second to draw
 * still lasts a thirtieth of one on film.
 *
 * The game comes in through an adapter (recorder.js), which says how to build
 * it, start a level, steer it and read it. `globalThis.recorder` is what the
 * script drives: `scout()` plays a level through undrawn and says what was
 * heard when (every sound the game made is something that happened);
 * `start()`, `cut()`, `frame()` and `finish()` film it; `hook()`, `pill()` and
 * `card()` put the words over it.
 *
 * This file is the same in every game that has reels; only recorder.js differs.
 */

export const FPS = 30;
const DT = 1 / FPS;
const RATE = 48000;

const realTimeout = globalThis.setTimeout.bind(globalThis);
/** A real turn of the event loop: every promise the game is waiting on gets to settle. */
const breathe = () => new Promise((r) => realTimeout(r, 0));
const settle = () => new Promise((r) => {
  const c = new MessageChannel();
  c.port1.onmessage = () => r();
  c.port2.postMessage(0);
});

// ——— the page's clock: timers that go off as the frames go by, not as the seconds do; and one date, always.

const clock = { now: 0, timers: new Map(), id: 1 };
const addTimer = (fn, ms, every, args) => {
  const id = clock.id++;
  const s = Math.max(0, Number(ms) || 0) / 1000;
  clock.timers.set(id, { fn, at: clock.now + s, every: every ? Math.max(0.001, s) : 0, args });
  return id;
};

function takeTheClock() {
  globalThis.setTimeout = (fn, ms, ...args) => addTimer(fn, ms, false, args);
  globalThis.setInterval = (fn, ms, ...args) => addTimer(fn, ms, true, args);
  globalThis.clearTimeout = globalThis.clearInterval = (id) => { clock.timers.delete(id); };
}

// Anything seeded from the time (a fight's dice, say) comes out the same every run.
Date.now = () => 1767225600000;

function advance(dt) {
  const end = clock.now + dt;
  for (;;) {
    let next = null;
    for (const [id, t] of clock.timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
    if (!next) break;
    const [id, t] = next;
    clock.now = Math.max(clock.now, t.at);
    if (t.every) t.at += t.every; else clock.timers.delete(id);
    try { t.fn(...t.args); } catch (err) { console.error(err); }
  }
  clock.now = end;
}

/**
 * Every CSS animation and transition held still (a playback rate of nought,
 * not pause(), which would cut it loose from its CSS), at where the page's
 * clock says it has got to. They are kept track of here until they end: one
 * held still in its delay isn't one the page lists.
 */
const born = new WeakMap();
const held = new Set();
function holdAnimations() {
  for (const a of document.getAnimations()) {
    if (born.has(a)) continue;
    born.set(a, clock.now);
    a.playbackRate = 0;
    held.add(a);
  }
  for (const a of held) {
    if (a.playState === 'idle' || !a.effect?.target?.isConnected) { held.delete(a); continue; }
    const t = (clock.now - born.get(a)) * 1000;
    a.currentTime = t;
    if (t >= a.effect.getComputedTiming().endTime) held.delete(a);
  }
}

/** The finished sound as a WAV file, base64. */
function wav(buffer) {
  const channels = buffer.numberOfChannels, frames = buffer.length;
  const bytes = new Uint8Array(44 + frames * channels * 2);
  const data = new DataView(bytes.buffer);
  const text = (at, s) => { for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i); };
  text(0, 'RIFF'); data.setUint32(4, 36 + frames * channels * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, channels, true);
  data.setUint32(24, buffer.sampleRate, true); data.setUint32(28, buffer.sampleRate * channels * 2, true);
  data.setUint16(32, channels * 2, true); data.setUint16(34, 16, true);
  text(36, 'data'); data.setUint32(40, frames * channels * 2, true);
  const chans = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      data.setInt16(at, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      at += 2;
    }
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

const PHONE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="18.5" r="1.1" fill="currentColor"/></svg>';
const DESKTOP_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M1.5 19h21" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const PLAY_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9.5-5.5z" fill="currentColor"/></svg>';

/**
 * The adapter:
 *   ready()              everything baked and loaded, before the clock is taken
 *   createAudio()        the game's own sound
 *   through              sound calls whose answer the game reads (a beat), let through always
 *   quiet                sound calls made every frame, not worth noting (the roll)
 *   build({ audio })     the game, its stage and GFX: { game, stage, GFX }
 *   start(game, level)   a level from the top
 *   pilot(game)          the autopilot for the level just started ({ next(), saw(out), stuck })
 *   attach(game, pilot)  puts it at the wheel (debug.pilot)
 *   ball(game)           what the player rolls: { x, y, z, vx, vz }
 *   phase(game)          'live' worth watching, 'wait' not much to see, 'end' the level is over
 *   presses(game, s)     one-shot presses for this frame, `s` seconds into the game's state
 *   update(game, dt, s)  one frame of the game, if not `game.update(dt, presses)` (a game that is
 *                        played by a script rather than an autopilot runs its script here)
 *   reached(game, mark)  whether a named moment has come (for clips cut at a mark, not a frame)
 *   touch(game, at)      where a thumb is on the glass now, if not steering: [x, y] or null
 *                        (`at(x, y, z)` puts a point in the scene on the screen)
 *   notes(game)          while scouting, names for what just happened that no sound says (a boss fight)
 *   music(audio, m)      starts the soundtrack the reel asks for
 *   wake(audio)          starts the sound, if not `audio.wake()`
 *   steering(game)       whether a thumb would be steering now (by default, while 'live')
 *   button               { selector, held(game, move, s) }: a thumb on an on-screen button
 *   card                 { logo: html, url }
 *   theme                CSS custom properties for the words over the film
 */
export async function createRecorder(adapter) {
  await adapter.ready?.();
  takeTheClock();

  // ——— the sound: the game's own, into an offline context rendered a frame at a time.
  let offline = null, rendering = null, started = false;
  globalThis.AudioContext = function AudioContext() { return offline; };
  const real = adapter.createAudio();
  /** Whether what the game plays is heard: not while it is run forward to the next cut. */
  let live = false;
  /** While scouting: told of every sound the game makes. */
  let heard = null;
  // The reel chooses the music; the game's own calls to start and stop it, and to wake the sound, go nowhere.
  const NOWHERE = new Set(['wake', 'startMusic', 'stopMusic', 'toggleMute', 'setVolume', ...(adapter.nowhere ?? [])]);
  const THROUGH = new Set(adapter.through ?? []);
  const QUIET = new Set(adapter.quiet ?? []);
  const audio = new Proxy(real, {
    get(target, key) {
      const v = Reflect.get(target, key);
      if (typeof v !== 'function') return v;
      if (THROUGH.has(key)) return (...args) => v.apply(target, args);
      if (NOWHERE.has(key)) return () => false;
      return (...args) => {
        if (heard && !QUIET.has(key)) heard(key, args);
        return live ? v.apply(target, args) : undefined;
      };
    },
  });

  const { game, stage, GFX } = await adapter.build({ audio });

  // ——— what goes over the film.
  const film = document.createElement('div');
  film.id = 'film';
  for (const [k, v] of Object.entries(adapter.theme ?? {})) film.style.setProperty(`--reel-${k}`, v);
  film.innerHTML = `
    <div class="thumb" id="thumb"></div>
    <div class="thumb" id="button-thumb"></div>
    <div id="hook"></div>
    <div id="pill">${PLAY_ICON}<b>Play free</b><span>${adapter.card.url}</span></div>
    <div id="card">
      <div class="logo">${adapter.card.logo}</div>
      <p class="cta">Play free in your browser</p>
      <div class="url">${adapter.card.url}</div>
      <div class="devices"><span>${PHONE_ICON}Phone</span><span>${DESKTOP_ICON}Desktop</span></div>
      <p class="small">no download · no sign-up</p>
    </div>`;
  document.body.appendChild(film);
  const $ = (s) => film.querySelector(s);
  const thumbEl = $('#thumb'), buttonThumbEl = $('#button-thumb'), hookEl = $('#hook'), pillEl = $('#pill'), cardEl = $('#card');
  const view = stage.renderer.domElement;

  const onScreen = (x, y, z) => {
    const rect = view.getBoundingClientRect();
    const v = new GFX.Vector3(x, y, z).project(stage.camera);
    return [rect.left + ((v.x + 1) / 2) * rect.width, rect.top + ((1 - v.y) / 2) * rect.height];
  };

  let lastMove = null;
  const thumb = { at: null, on: 0 };
  const buttonThumb = { on: 0 };
  const ease = (rate) => 1 - Math.exp(-rate * DT);
  const area = { top: 150, bottom: 40, ...adapter.thumbArea };

  /**
   * The hands: a thumb on the glass where a player's would be to push the
   * ball the way the autopilot is pushing it (toward it, harder the further
   * off, as the touch controls have it), held well off the ball so it isn't
   * hidden; and one on the game's button while that is pressed.
   */
  function hands() {
    const touching = live && adapter.touch ? adapter.touch(game, onScreen) : null;
    const b = adapter.ball(game);
    const steering = live && !adapter.touch && (adapter.steering?.(game) ?? adapter.phase(game) === 'live');
    const push = steering && lastMove?.push ? lastMove.push : null;
    const strength = touching ? 1 : push ? Math.min(1, Math.hypot(...push)) : 0;
    if (touching) {
      if (!thumb.at || thumb.on < 0.05) thumb.at = [...touching];
      else for (const i of [0, 1]) thumb.at[i] += (touching[i] - thumb.at[i]) * ease(16);
    } else if (strength > 0.06) {
      const [rx, ry] = onScreen(b.x, b.y, b.z);
      const [ax, ay] = onScreen(b.x + push[0], b.y, b.z + push[1]);
      const d = Math.hypot(ax - rx, ay - ry) || 1;
      const reach = 80 + strength * 60;
      const want = [
        Math.max(34, Math.min(innerWidth - 34, rx + ((ax - rx) / d) * reach)),
        Math.max(area.top, Math.min(innerHeight - area.bottom, ry + ((ay - ry) / d) * reach)),
      ];
      if (!thumb.at || thumb.on < 0.05) thumb.at = want;
      else for (const i of [0, 1]) thumb.at[i] += (want[i] - thumb.at[i]) * ease(16);
    }
    thumb.on += ((strength > 0.06 ? 1 : 0) - thumb.on) * ease(14);
    if (thumb.at) {
      thumbEl.style.transform = `translate(${thumb.at[0]}px, ${thumb.at[1]}px) scale(${0.9 + 0.1 * thumb.on})`;
      thumbEl.style.opacity = String(thumb.on);
    }
    const button = adapter.button && document.querySelector(adapter.button.selector);
    if (button) {
      const down = live && adapter.button.held(game, lastMove, since);
      button.classList.toggle('held', down);
      buttonThumb.on += ((down ? 1 : 0) - buttonThumb.on) * ease(20);
      const r = button.getBoundingClientRect();
      buttonThumbEl.style.transform = `translate(${r.left + r.width / 2 + 6}px, ${r.top + r.height / 2 + 8}px)`;
      buttonThumbEl.style.opacity = String(buttonThumb.on);
    }
  }

  // ——— running the game.

  let level = null;
  /** Frames since the level started: the clock clips are cut by. */
  let at = 0;
  let pilot = null;
  let phase = null, since = 0;

  /** Level `index` from the top, the autopilot at the wheel. */
  async function begin(index) {
    live = false;
    adapter.start(game, index);
    const steer = adapter.pilot(game);
    pilot = {
      next() { lastMove = steer.next(); return lastMove; },
      saw(out) { steer.saw(out); },
      get stuck() { return steer.stuck; },
    };
    adapter.attach(game, pilot);
    level = index;
    at = 0;
    phase = null;
    // What it is waiting on is baked already: let it see so before the first step.
    await breathe();
  }

  /** One frame of the game, and whatever it was waiting on settled. */
  async function tick() {
    at++;
    advance(DT);
    const state = adapter.state?.(game) ?? adapter.phase(game);
    if (state !== phase) { phase = state; since = 0; } else since += DT;
    if (adapter.update) adapter.update(game, DT, since);
    else game.update(DT, adapter.presses?.(game, since) ?? []);
    await settle();
  }

  let frames = 0;

  globalThis.recorder = {
    fps: FPS,

    /**
     * Plays level `index` through without drawing it, as far as its end or
     * `limit` seconds, and says what was heard when (by the frame), and every
     * frame how fast the ball went, whether it was worth watching, and where it was.
     */
    async scout(index, { limit = 300 } = {}) {
      const events = [];
      const track = [];
      await begin(index);
      heard = (name, args) => {
        const a = args[0];
        events.push({ f: at, name, arg: typeof a === 'string' || typeof a === 'number' ? a : null });
      };
      let ended = 0;
      try {
        while (at < limit * FPS) {
          await tick();
          for (const name of adapter.notes?.(game) ?? []) events.push({ f: at, name, arg: null });
          const b = adapter.ball(game), p = adapter.phase(game);
          track.push([+Math.hypot(b.vx, b.vz).toFixed(2), p === 'live' ? 1 : p === 'end' ? 2 : 0, +b.x.toFixed(3), +b.z.toFixed(3)]);
          // A little past the end, for the moment it ends.
          if (p === 'end' && ++ended > FPS * 3) break;
          if (pilot.stuck) break;
        }
      } finally {
        heard = null;
      }
      return { level: index, name: adapter.name?.(game) ?? String(index), state: adapter.state?.(game), stuck: pilot.stuck ?? null, events, track };
    },

    /**
     * Readies a reel `seconds` long, the soundtrack (`music`, as the reel
     * gives it) starting with it.
     */
    start({ seconds, music }) {
      offline = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil((seconds + 0.5) * RATE), sampleRate: RATE });
      started = false;
      frames = 0;
      if (adapter.wake) adapter.wake(real); else real.wake();
      adapter.music(real, music);
    },

    /**
     * Runs on, silently, to `frame` frames into level `level`, or (with
     * `mark`) until the adapter says that moment has come: from the top if it
     * has to.
     */
    async cut({ level: index, frame = Infinity, mark = null }) {
      live = false;
      if (index !== level || at > frame) await begin(index);
      const limit = at + FPS * 600;
      while (mark ? !adapter.reached(game, mark) && at < limit : at < frame) {
        await tick();
        holdAnimations();
      }
      const b = adapter.ball(game);
      return { frame: at, phase: adapter.phase(game), ball: [b.x, b.z] };
    },

    /** The opening line (`text`, and a smaller `sub` under it), or none. */
    hook(text, sub = '') {
      if (text) {
        hookEl.textContent = text;
        if (sub) {
          const small = document.createElement('small');
          small.textContent = sub;
          hookEl.appendChild(small);
        }
        hookEl.className = 'on';
        document.body.classList.add('hooked');
      } else {
        hookEl.className = 'off';
        document.body.classList.remove('hooked');
      }
    },

    /** The address, while it plays. */
    pill(on) { pillEl.className = on ? 'on' : ''; },

    /** The card to end on: the name, the address, phone and desktop. */
    card(on) {
      cardEl.className = on ? 'on' : '';
      document.body.classList.toggle('carded', on);
      if (on) pillEl.className = '';
    },

    /** One frame on: the game, what is over it, the picture drawn and a frame's worth of sound rendered. */
    async frame() {
      live = true;
      await tick();
      stage.look();
      hands();
      holdAnimations();
      stage.render();
      const reached = offline.suspend((frames + 1) / FPS);
      if (started) offline.resume();
      else { started = true; rendering = offline.startRendering(); }
      await reached;
      frames++;
      const b = adapter.ball(game);
      return { frame: at, phase: adapter.phase(game), ball: [b.x, b.z] };
    },

    /** The rest of the sound, as a WAV file in base64. */
    async finish() {
      live = false;
      if (started) offline.resume();
      else rendering = offline.startRendering();
      return wav(await rendering);
    },
  };
}
