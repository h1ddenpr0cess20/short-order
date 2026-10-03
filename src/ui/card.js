/**
 * The ticket: what the dish is, the steps to it, and how each is going — read
 * off the food, not ticked by the cook. A step is done when the food says so.
 */

const pct = (v) => `${Math.round(v * 100)}%`;

/** Salt and pepper in words, from how they sit against right (1). */
function saltWord(r) {
  if (r < 0.05) return 'no salt yet';
  if (r < 0.35) return 'needs salt';
  if (r < 0.65) return 'a little more salt';
  if (r <= 1.45) return 'salted right';
  if (r <= 2) return 'well salted';
  return 'too salty';
}
/** One part's salt, in a word or two: 'potatoes salted, eggs need salt'. */
function partSalt(r) {
  if (r < 0.05) return 'no salt';
  if (r < 0.65) return 'need salt';
  if (r <= 1.45) return 'salted';
  if (r <= 2) return 'well salted';
  return 'too salty';
}

/** Salt for the dish, or for each part when the potatoes and the eggs are not alike. */
function seasonWords(s) {
  const both = s.potato.volume > 0 && s.egg.volume > 0;
  const salt = both && partSalt(s.potato.salt) !== partSalt(s.egg.salt)
    ? `potatoes ${partSalt(s.potato.salt)}, eggs ${partSalt(s.egg.salt)}`
    : saltWord(s.salt);
  return `${salt} · ${pepperWord(s.pepper)}`;
}
function pepperWord(r) {
  if (r < 0.05) return 'no pepper';
  if (r < 0.35) return 'a little pepper';
  if (r <= 2.2) return 'peppered';
  return 'peppery';
}

export function clockText(seconds) {
  const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** No right button and no R under a finger: the pile is turned with two of them, or the bar. */
const touch = globalThis.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false;
const advice = (next) => (touch && next === 'turn the pile, then cut across' ? 'twist two fingers to turn the pile, then cut across' : next);

export function createCard({ game, root = document.body }) {
  const card = document.createElement('section');
  card.id = 'ticket';
  card.className = 'framed';
  card.setAttribute('aria-label', 'The order');
  card.innerHTML = `
    <header>
      <span class="chip"><i class="star" aria-hidden="true">★</i> today's order</span>
      <span class="chip no">no. 01</span>
    </header>
    <h1>Potato &amp; egg scramble</h1>
    <p class="tag">Golden dice, soft curds, one cast iron pan.</p>
    <ol>
      <li data-step="dice"><span class="what">Dice the potato</span><span class="short">dice</span><span class="how"></span><i class="bar"><b></b></i></li>
      <li data-step="fry"><span class="what">Fry it golden</span><span class="short">fry</span><span class="how"></span><i class="bar"><b></b></i></li>
      <li data-step="whisk"><span class="what">Whisk three eggs</span><span class="short">whisk</span><span class="how"></span><i class="bar"><b></b></i></li>
      <li data-step="scramble"><span class="what">Scramble them in</span><span class="short">scramble</span><span class="how"></span><i class="bar"><b></b></i></li>
      <li data-step="season"><span class="what">Season it</span><span class="short">season</span><span class="how"></span><i class="bar"><b></b></i></li>
      <li data-step="plate"><span class="what">Plate it</span><span class="short">plate</span><span class="how"></span></li>
    </ol>
    <p class="now" aria-hidden="true"></p>
    <footer>
      <span class="clock chip" data-out="clock">0:00</span>
      <button class="chip plate" data-act="plate" disabled title="Plate it (enter)">plate it</button>
    </footer>
  `;
  root.appendChild(card);

  const step = (name) => card.querySelector(`[data-step="${name}"]`);
  const plate = card.querySelector('[data-act="plate"]');
  plate.addEventListener('click', () => game.plateIt());
  for (const type of ['pointerdown', 'pointerup', 'pointermove']) card.addEventListener(type, (e) => e.stopPropagation());

  function show(name, { how, fill, done }) {
    const li = step(name);
    li.querySelector('.how').textContent = how;
    const bar = li.querySelector('.bar b');
    if (bar) bar.style.width = `${Math.round(Math.max(0, Math.min(1, fill)) * 100)}%`;
    li.dataset.done = done ? 'true' : 'false';
  }

  let last = '';

  return {
    update() {
      const p = game.progress;
      if (!p) return;
      const key = JSON.stringify(p) + Math.floor(game.clock);
      if (key === last) return;
      last = key;

      show('dice', {
        how: p.dice.pieces <= 1 ? 'rounds, then strips, turn, then cubes'
          : `${p.dice.pieces} pieces · ${pct(p.dice.bite)} bite-size${p.dice.next ? ` — ${advice(p.dice.next)}` : ''}`,
        fill: p.dice.bite / 0.7,
        done: p.dice.done,
      });
      show('fry', {
        how: p.fry.inPan === 0 ? 'oil a hot pan; toss to brown every side'
          : `${pct(p.fry.golden)} golden · ${pct(p.fry.cooked)} cooked through${p.fry.burnt > 0.05 ? ` · ${pct(p.fry.burnt)} burnt` : ''}`,
        fill: p.fry.golden / 0.7,
        done: p.fry.done,
      });
      show('whisk', {
        how: p.whisk.eggs === 0 ? 'crack them into the bowl, beat them smooth' : `${Math.min(p.whisk.eggs, 9)} of 3 · ${pct(p.whisk.mix)} beaten`,
        fill: (Math.min(3, p.whisk.eggs) / 3) * 0.4 + p.whisk.mix * 0.6,
        done: p.whisk.done,
      });
      show('scramble', {
        how: p.scramble.poured === 0 ? 'pour over the potatoes, gentle heat, keep it moving'
          : `${pct(p.scramble.scrambled)} in curds · ${pct(p.scramble.soft)} set soft`,
        fill: p.scramble.poured ? Math.min(p.scramble.scrambled, p.scramble.soft) / 0.6 : 0,
        done: p.scramble.done,
      });
      const s = p.season;
      show('season', {
        how: s.score > 0 && p.butter.burnt ? 'the butter burnt — bitter'
          : !s.food ? 'salt and pepper: some on the potatoes, some in the eggs'
            : seasonWords(s),
        fill: s.salted * 0.72 + s.peppered * 0.28,
        done: s.done,
      });
      show('plate', {
        how: p.plated ? 'served' : p.ready ? 'whenever it looks right' : '',
        done: p.plated,
      });
      plate.disabled = !p.ready || p.plated;
      card.querySelector('[data-out="clock"]').textContent = clockText(game.clock);

      /** On a narrow screen only the step in hand is spelled out. */
      const next = ['dice', 'fry', 'whisk', 'scramble', 'season', 'plate'].find((name) => step(name).dataset.done !== 'true') ?? 'plate';
      const li = step(next);
      card.querySelector('.now').textContent = `${li.querySelector('.what').textContent} — ${li.querySelector('.how').textContent || 'ready when you are'}`;
    },
  };
}
