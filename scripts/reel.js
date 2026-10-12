/**
 * Gameplay reels for social media: upright films, 1080 by 1920 at 30 frames
 * a second, of the game as a phone shows it (the touch HUD and a thumb on the
 * glass steering), played by the autopilot, with its own music and sound,
 * ending on a card with the address. The reels are in scripts/reels.js.
 *
 *   node scripts/reel.js               every reel, into reels/
 *   node scripts/reel.js <name>...     just those
 *   --out <dir>                        somewhere else
 *   --frames <n>                       only the first n frames, for a look
 *
 * Each level is first played through without being drawn, to hear where the
 * fights, finds and falls are (every sound the game makes is something that
 * happened); then each reel is filmed from the best of those moments, a frame
 * at a time (reel.html, src/reel/), so it needs no GPU, only time: a quarter
 * of an hour or so a reel, one at a time (two at once is slower, not faster).
 * It needs ffmpeg, and a Chromium for playwright-core (`npx playwright-core
 * install chromium-headless-shell` if there isn't one).
 *
 * The same in every game that has reels; only scripts/reels.js differs.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import * as config from './reels.js';

const { CARD, HOOK, PILL, REELS, WORTH } = config;
/** Anything the game's sound wants doing to it before it goes out (an ffmpeg audio filter chain, from reels.js). */
const MIX = config.MIX ?? '';
/** How long after each kind of moment the clip has to run on for it to count, in seconds: a second, unless reels.js says (a battle screen wants time to be read). */
const AFTER = config.AFTER ?? {};
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FPS = 30;
/** An upright phone: 405 by 720, at a pixel ratio that makes the picture 1080 by 1920. */
const PHONE = { viewport: { width: 405, height: 720 }, deviceScaleFactor: 8 / 3, isMobile: true, hasTouch: true };
/** WebGL on the CPU, as there may be no GPU. */
const FLAGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

const args = process.argv.slice(2);
let out = 'reels', most = Infinity;
const names = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') out = args[++i];
  else if (args[i] === '--frames') most = Number(args[++i]);
  else names.push(args[i]);
}
const OUT = resolve(ROOT, out);
for (const n of names) if (!REELS[n]) throw new Error(`no reel called ${n}: there are ${Object.keys(REELS).join(', ')}`);

// ——— what is worth filming.

/** What a sound the game made is worth: WORTH (or the reel's own `worth`) has a number for it, or a function of its first argument. */
const worth = (e, own = {}) => {
  const w = own[e.name] ?? WORTH[e.name];
  return typeof w === 'function' ? w(e.arg) : w ?? 0;
};

/**
 * How good `len` frames of a level's run are from frame `s`: what was heard in
 * them (by WORTH, and the reel's `own` worth over it), with time enough after
 * each to see it (AFTER), and the ball rolling rather than waiting about.
 * Nothing that runs on long after the level is over.
 */
function score(run, s, len, own) {
  const end = s + len;
  const over = run.track.findIndex(([, p]) => p === 2);
  if (end > run.track.length || (over >= 0 && end > over + FPS * 1.5)) return -Infinity;
  let total = 0;
  for (const e of run.events) if (e.f >= s + 6 && e.f <= end - (AFTER[e.name] ?? 1) * FPS) total += worth(e, own);
  let speed = 0, idle = 0, wait = 0;
  for (let f = s; f < end; f++) {
    const [v, p] = run.track[f];
    speed += v;
    if (p === 1 && v < 0.6) idle++;
    if (p === 0) wait++;
  }
  return total + (speed / len) * 2 - (idle / FPS) * 5 - (wait / FPS) * 3;
}

/** The best `len` frames of `run`, clear of `taken`. */
function best(run, len, taken = [], own = {}) {
  let top = null;
  for (let s = FPS * 2; s + len <= run.track.length; s += FPS / 2) {
    if (taken.some(([a, b]) => s < b && s + len > a)) continue;
    const v = score(run, s, len, own);
    if (v > -Infinity && (!top || v > top.score)) top = { s, score: v };
  }
  return top;
}

// ——— the browser.

const server = await createServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: FLAGS });

async function phone() {
  const page = await browser.newPage(PHONE);
  page.on('pageerror', (e) => console.error('  page:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('  page:', m.text()); });
  await page.goto(new URL('reel.html', base).href);
  await page.waitForFunction(() => globalThis.recorder?.scout, null, { timeout: 600_000 });
  return page;
}

const runs = new Map();
let scoutPage = null;
/** Level `index` played through, undrawn: what was heard, and when. */
async function run(index) {
  if (!runs.has(index)) {
    scoutPage ??= await phone();
    const r = await scoutPage.evaluate((i) => globalThis.recorder.scout(i), index);
    if (r.track.every(([, p]) => p !== 2)) console.warn(`  ${r.name}: the autopilot didn't get to the end (${r.state}, ${JSON.stringify(r.stuck)})`);
    runs.set(index, r);
  }
  return runs.get(index);
}

// ——— choosing the clips.

/** The clips of `reel`, each with the stretch of its level it shows, from frame `s`. */
async function choose(reel) {
  const bar = (240 / reel.music.tempo) * FPS;
  const c = reel.clips;
  if (Array.isArray(c)) {
    const out = [];
    // A clip at a mark (a moment the adapter names) needs no scouting: it starts when that moment comes.
    for (const clip of c) out.push(clip.mark ? { ...clip } : { ...clip, s: best(await run(clip.level), Math.round(lengthOf(clip, bar)), [], reel.worth).s });
    return out;
  }
  if (c.from) {
    const each = [];
    for (const level of c.from) {
      const top = best(await run(level), Math.round(c.bars * bar), [], reel.worth);
      if (top) each.push({ level, bars: c.bars, s: top.s, score: top.score });
    }
    const keep = each.filter((x) => c.keep?.includes(x.level));
    const rest = each.filter((x) => !keep.includes(x)).sort((a, b) => b.score - a.score).slice(0, c.take - keep.length);
    return [...rest, ...keep].sort((a, b) => a.level - b.level);
  }
  // Several stretches of one level, the best that don't overlap, in the order they happened.
  const r = await run(c.level);
  const taken = [], out = [];
  for (let i = 0; i < c.count; i++) {
    const len = Math.round(c.bars * bar);
    const top = best(r, len, taken, reel.worth);
    if (!top) break;
    taken.push([top.s - FPS, top.s + len + FPS]);
    out.push({ level: c.level, bars: c.bars, s: top.s });
  }
  return out.sort((a, b) => a.s - b.s);
}

/** A clip's length in frames: so many bars (`bar` frames long) of the soundtrack, or `seconds`. */
const lengthOf = (clip, bar) => (clip.seconds ? clip.seconds * FPS : clip.bars * bar);

// ——— filming.

/** Runs `cmd` with `argv`; resolves when it exits cleanly. */
function exec(cmd, argv, { input = false } = {}) {
  const child = spawn(cmd, argv, { stdio: [input ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
  const done = new Promise((ok, fail) => child.on('close', (code) => (code === 0 ? ok() : fail(new Error(`${cmd} failed (${code}):\n${err}`)))));
  return { child, done };
}

const write = (stream, data) => new Promise((ok) => (stream.write(data) ? ok() : stream.once('drain', ok)));

async function film(name, reel) {
  const bar = 240 / reel.music.tempo;
  console.log(`${name}: choosing the clips`);
  const clips = await choose(reel);
  const length = clips.reduce((n, c) => n + lengthOf(c, bar * FPS) / FPS, 0);
  const page = await phone();
  await page.evaluate((o) => globalThis.recorder.start(o), { seconds: 0.25 + length + CARD, music: reel.music });

  // Where each clip starts and ends on the film: on the soundtrack's bar lines, the first from the very start.
  const first = reel.music.lead ?? 0.1;
  let at = first;
  const lines = [];
  for (const c of clips) { lines.push(at); at += lengthOf(c, bar * FPS) / FPS; }
  const cardAt = Math.round(at * FPS);
  const total = Math.min(most, cardAt + Math.round(CARD * FPS));
  clips.forEach((c, i) => {
    c.from = i === 0 ? 0 : Math.round(lines[i] * FPS);
    c.to = i + 1 < clips.length ? Math.round(lines[i + 1] * FPS) : cardAt;
    // The best stretch was found by its length on film; the first clip also has the lead-in before the first bar.
    if (!c.mark) c.at = Math.max(0, c.s - (i === 0 ? Math.round(first * FPS) : 0));
  });
  for (const c of clips) {
    const where = c.mark ? `at "${c.mark}"` : `${(c.at / FPS).toFixed(1)}s in`;
    console.log(`  ${runs.get(c.level)?.name ?? c.level}, ${where}, ${c.seconds ? `${c.seconds}s` : `${c.bars} bars`}`);
  }

  mkdirSync(OUT, { recursive: true });
  const work = join(OUT, `.${name}`);
  mkdirSync(work, { recursive: true });
  const silent = join(work, 'picture.mp4');
  const sound = join(work, 'sound.wav');
  const video = exec('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-maxrate', '7M', '-bufsize', '14M', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', String(FPS * 2), silent], { input: true });

  const began = Date.now();
  let frame = 0;
  for (const c of clips) {
    if (frame >= total) break;
    const cut = await page.evaluate((o) => globalThis.recorder.cut(o), c.mark ? { level: c.level, mark: c.mark } : { level: c.level, frame: c.at });
    // The film has to be the run that was scouted: the same place at the same moment.
    const run = runs.get(c.level);
    const then = run?.track[cut.frame - 1];
    if (run && (!then || Math.hypot(then[2] - cut.ball[0], then[3] - cut.ball[1]) > 1e-2)) console.warn(`  ${run.name}: not where the scouting run was at frame ${cut.frame}`);
    const end = Math.min(total, c === clips.at(-1) ? total : c.to);
    for (; frame < end; frame++) {
      const say = [];
      if (frame === 0) say.push(['hook', ...reel.hook]);
      if (frame === Math.round(HOOK * FPS)) say.push(['hook', null]);
      if (frame === Math.round(PILL * FPS)) say.push(['pill', true]);
      if (frame === cardAt) say.push(['card', true]);
      await page.evaluate(async (said) => {
        for (const [what, ...how] of said) globalThis.recorder[what](...how);
        return globalThis.recorder.frame();
      }, say);
      // A heavy scene on the CPU can take seconds to draw, and more the first time its shaders compile.
      const shot = await page.screenshot({ type: 'jpeg', quality: 95, timeout: 300_000 });
      await write(video.child.stdin, shot);
      if (frame === Math.round((HOOK - 0.5) * FPS)) writeFileSync(join(OUT, `${name}.jpg`), shot);
      if ((frame + 1) % 60 === 0) {
        const each = (Date.now() - began) / (frame + 1) / 1000;
        console.log(`  ${frame + 1}/${total} frames, ${each.toFixed(2)}s a frame, ${Math.ceil(((total - frame - 1) * each) / 60)} min to go`);
      }
    }
  }
  writeFileSync(sound, Buffer.from(await page.evaluate(() => globalThis.recorder.finish()), 'base64'));
  video.child.stdin.end();
  await video.done;
  await page.close();

  // The sound under the picture: mixed as reels.js asks, as loud as the apps play things, and faded out under the card.
  // A reel with a quiet stretch can have a bed under it: its own sound from `from` to `to` seconds, laid again, quietly, from `at`.
  const seconds = total / FPS;
  const end = `${MIX ? `${MIX},` : ''}afade=t=out:st=${(seconds - 1.6).toFixed(3)}:d=1.6,loudnorm=I=-14:TP=-1.5:LRA=11[a]`;
  const b = reel.bed;
  const graph = b
    ? `[1:a]atrim=0:${seconds},asplit[m][s];[s]atrim=${b.from}:${b.to},asetpts=N/SR/TB,volume=${b.gain ?? 0.5},afade=t=in:d=0.8,`
      + `afade=t=out:st=${(b.to - b.from - 0.8).toFixed(3)}:d=0.8,adelay=${Math.round(b.at * 1000)}|${Math.round(b.at * 1000)}[bed];`
      + `[m][bed]amix=inputs=2:duration=first:normalize=0,${end}`
    : `[1:a]atrim=0:${seconds},${end}`;
  await exec('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', sound,
    '-filter_complex', graph,
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-shortest',
    join(OUT, `${name}.mp4`)]).done;
  rmSync(work, { recursive: true, force: true });
  console.log(`${name}: ${join(OUT, `${name}.mp4`)}, ${seconds.toFixed(1)}s, in ${((Date.now() - began) / 60000).toFixed(1)} min`);
}

try {
  for (const name of names.length ? names : Object.keys(REELS)) await film(name, REELS[name]);
} finally {
  await browser.close();
  await server.close();
}
