/**
 * The reels scripts/reel.js makes. There is no autopilot in this game and
 * no levels to scout: a cook (src/reel/recorder.js) makes a dish from the
 * keys, start to finish, and names the moments along the way, and each clip
 * starts at one of them (`mark`) and runs `seconds`. There is no music in
 * the kitchen either: what is heard is the kitchen, the knife, the sizzle.
 * Every reel ends on the card with the address.
 */

export const REELS = {
  scramble: {
    hook: ['One ticket.\nOne pan.', 'hand diced · cast-iron fried · softly scrambled'],
    // No soundtrack; the tempo only counts the bars, which these clips don't use.
    music: { args: [], tempo: 120, lead: 0 },
    clips: [
      { level: 'hash', mark: 'dice', seconds: 5.5 },
      { level: 'hash', mark: 'pan', seconds: 3 },
      { level: 'hash', mark: 'fry', seconds: 3 },
      { level: 'hash', mark: 'crack', seconds: 2 },
      { level: 'hash', mark: 'whisk', seconds: 2 },
      { level: 'hash', mark: 'pour', seconds: 3 },
      { level: 'hash', mark: 'stir', seconds: 3.5 },
      // Onto the plate, and the verdict over it.
      { level: 'hash', mark: 'plate', seconds: 4.5 },
    ],
    // Plated, the pan is empty and the kitchen goes quiet: the sizzle from the pan and fry clips (5.5 to 11.5 s
    // on film), laid quietly under the verdict and the card.
    bed: { from: 5.8, to: 11.5, at: 24.6, gain: 0.5 },
  },
};

/** Nothing is scouted, so nothing is weighed. */
export const WORTH = {};

/** How long the card to end on stays up, in seconds. */
export const CARD = 4.6;

/** How long the opening line stays up, and when the address comes in under the HUD. */
export const HOOK = 2.4;
export const PILL = 2.7;
