/**
 * The ticket: what the dish is, the steps to it, and how each is going — read
 * off the food, not ticked by the cook. A step is done when the food says so.
 * The steps are the dish's own (see game/dishes.js); a new order on the rail
 * writes a new ticket.
 */

import { ticket } from '../game/dishes.js';

export function clockText(seconds) {
  const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** No right button and no keys under a finger: the moves are spelled the way this screen makes them. */
const touch = globalThis.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false;
const WORDS = Object.freeze({
  advice: (next) => (touch && next === 'turn the pile, then cut across' ? 'twist two fingers to turn the pile, then cut across' : next),
  flip: touch ? 'tap an egg to turn it, or toss the pan' : 'click an egg to turn it, or toss (space)',
  fold: (when) => (touch ? `${when} — tap fold` : `${when} — fold, or L`),
});

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function createCard({ game, root = document.body }) {
  const card = document.createElement('section');
  card.id = 'ticket';
  card.className = 'framed';
  card.setAttribute('aria-label', 'The order');
  card.innerHTML = `
    <header>
      <span class="chip"><i class="star" aria-hidden="true">★</i> today's order</span>
      <span class="chip no"></span>
    </header>
    <h1><button type="button" class="dish" title="Change the order"></button></h1>
    <p class="tag"></p>
    <ol></ol>
    <p class="now" aria-hidden="true"></p>
    <footer>
      <span class="clock chip" data-out="clock">0:00</span>
      <button class="chip plate" data-act="plate" disabled title="Plate it (enter)">plate it</button>
    </footer>
  `;
  root.appendChild(card);

  const plate = card.querySelector('[data-act="plate"]');
  plate.addEventListener('click', () => game.plateIt());
  /** The dish's name is the way back to the menu: tap it for another order. */
  card.querySelector('.dish').addEventListener('click', () => api.onChange?.());
  for (const type of ['pointerdown', 'pointerup', 'pointermove']) card.addEventListener(type, (e) => e.stopPropagation());

  let written = null;
  let last = '';

  /** The ticket for the dish on the rail: its name, its line, and a row for every step. */
  function write(dish) {
    written = dish;
    last = '';
    card.querySelector('.no').textContent = `no. ${dish.no}`;
    card.querySelector('.dish').textContent = dish.name;
    card.querySelector('.tag').textContent = dish.tag;
    card.querySelector('ol').innerHTML = dish.steps.map((s) => `
      <li data-step="${s.id}"><span class="what">${escape(s.what)}</span><span class="short">${escape(s.short)}</span><span class="how"></span>${s.id === 'plate' ? '' : '<i class="bar"><b></b></i>'}</li>`).join('');
  }

  const step = (name) => card.querySelector(`[data-step="${name}"]`);

  function show({ id, how = '', fill = 0, done = false }) {
    const li = step(id);
    li.querySelector('.how').textContent = how;
    const bar = li.querySelector('.bar b');
    if (bar) bar.style.width = `${Math.round(Math.max(0, Math.min(1, fill)) * 100)}%`;
    li.dataset.done = done ? 'true' : 'false';
  }

  const api = {
    /** Set by whoever owns the menu: what a tap on the dish's name does. */
    onChange: null,
    /** Where the ticket is, for the kitchen's camera to keep clear of. */
    covers: () => [card.getBoundingClientRect()],
    update() {
      const dish = game.dish;
      if (dish !== written) write(dish);
      const p = game.progress;
      if (!p) return;
      const key = JSON.stringify(p) + Math.floor(game.clock);
      if (key === last) return;
      last = key;

      const lines = ticket(dish, p, WORDS);
      for (const line of lines) show(line);
      plate.disabled = !p.ready || p.plated;
      card.querySelector('[data-out="clock"]').textContent = clockText(game.clock);

      /** On a narrow screen only the step in hand is spelled out. */
      const next = lines.find((l) => !l.done) ?? lines[lines.length - 1];
      const li = step(next.id);
      card.querySelector('.now').textContent = `${li.querySelector('.what').textContent} — ${next.how || 'ready when you are'}`;
    },
  };
  return api;
}
