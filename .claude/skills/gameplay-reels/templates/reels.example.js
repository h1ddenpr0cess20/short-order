/**
 * The reels scripts/reel.js makes. Each is a soundtrack (the arguments to
 * the game's startMusic, and its tempo), a line to open on, and clips cut on
 * its bar lines: from a level (they count from 0), so many bars long, the
 * best stretch of it the autopilot played. Every one ends on the card with
 * the address. The boss theme opens with the assault, the full drums, choir
 * and brass, so it is the soundtrack for both.
 */

const BOSS_THEME = { args: [12, { boss: true }], tempo: 96, lead: 0.1 };

export const REELS = {
  delve: {
    hook: ['Your party is a d20', 'what lands on top is your roll'],
    music: BOSS_THEME,
    // Five of the twelve, the best each has to show, in order going down; the Dragon's Lair to finish.
    clips: { from: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], take: 5, keep: [11], bars: 2 },
  },
  bosses: {
    hook: ['Two bosses. One die.', 'eggdreessen · the dragon'],
    music: BOSS_THEME,
    worth: { boss: 120 },
    clips: [
      { level: 7, bars: 4 },
      { level: 11, bars: 4 },
    ],
  },
};

/**
 * What each sound the game makes is worth to a reel: a number, or a function
 * of what it was called with. A fight's sound says how it went; `fight` and
 * `boss` are noted by recorder.js as each fight begins.
 */
export const WORTH = {
  battle: (grade) => ({ critical: 40, fumble: 30, success: 16, struggle: 14 })[grade] ?? 12,
  fight: 8,
  coin: 3,
  potion: 5,
  key: 10,
  gate: 12,
  locked: 2,
  hurt: 3,
  spikes: 5,
  slam: 4,
  sizzle: 6,
  fall: 6,
  goal: 25,
  over: 10,
  clatter: 0.5,
};

/** A fight is worth seeing only with its battle screen up long enough to read (the autopilot carries on after 2.2 seconds). */
export const AFTER = { battle: 2.6, fight: 2.6, boss: 2.6 };

/**
 * The sound, before it goes out: the war drums are deep sines hit up to seven
 * times a bar, which is all rumble on a phone, so the bottom is cut and the
 * top lifted, to about the balance of the other games' reels.
 */
export const MIX = 'highpass=f=40,bass=g=-10:f=120:w=0.7,treble=g=5:f=3000:w=0.6';

/** How long the card to end on stays up, in seconds. */
export const CARD = 4.6;

/** How long the opening line stays up, and when the address comes in under the HUD. */
export const HOOK = 2.4;
export const PILL = 2.7;
