/**
 * The bar along the bottom: the heat, and the moves that are buttons as well
 * as gestures. Everything here can also be done in the kitchen itself — the
 * knob turns, the bottle pours, a drag scrapes — so the bar is for the cook
 * who would rather press something, and for a phone.
 */

import { SETTINGS } from '../sim/heat.js';

export function createHud({ game, root = document.body }) {
  const bar = document.createElement('div');
  bar.id = 'bar';
  bar.innerHTML = `
    <div class="group heat" role="group" aria-label="Burner">
      <button class="chip round" data-act="cooler" aria-label="Turn the burner down" title="Down (Q)">−</button>
      <div class="dial">
        <span class="label chip">burner</span>
        <span class="level" data-out="level">off</span>
      </div>
      <button class="chip round" data-act="hotter" aria-label="Turn the burner up" title="Up (E)">+</button>
      <div class="thermo" aria-label="Pan temperature">
        <span class="chip label">pan</span>
        <span class="temp" data-out="temp">22°</span>
      </div>
    </div>
    <div class="group moves">
      <button class="chip" data-act="turn" title="Turn the pile a quarter turn (R)">turn</button>
      <button class="chip" data-act="scrape" title="Scrape the board into the pan (S)">into pan</button>
      <button class="chip" data-act="oil" title="Oil the pan (O)">oil</button>
      <button class="chip" data-act="toss" title="Toss the pan (space)">toss</button>
    </div>
    <div class="group eggs">
      <button class="chip" data-act="egg" title="Crack an egg into the bowl (G)">egg</button>
      <button class="chip" data-act="pour" title="Pour the eggs into the pan (P)">pour</button>
    </div>
  `;
  root.appendChild(bar);

  const hint = document.createElement('p');
  hint.id = 'hint';
  hint.setAttribute('role', 'status');
  root.appendChild(hint);

  const out = (name) => bar.querySelector(`[data-out="${name}"]`);
  const act = (name) => bar.querySelector(`[data-act="${name}"]`);

  bar.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-act]');
    if (!button) return;
    const name = button.dataset.act;
    if (name === 'cooler') game.heat(-1);
    else if (name === 'hotter') game.heat(1);
    else if (name === 'oil') game.oil();
    else if (name === 'turn') game.turn();
    else if (name === 'scrape') game.scrapeIntoPan();
    else if (name === 'toss') game.startToss();
    else if (name === 'egg') game.crackEgg();
    else if (name === 'pour') game.pourEggs();
  });
  /** A tap on the bar is not a tap on the kitchen behind it. */
  for (const type of ['pointerdown', 'pointerup', 'pointermove']) bar.addEventListener(type, (e) => e.stopPropagation());

  const HINTS = {
    board: 'click to chop · drag the pile to carry it · right-click to turn it',
    pan: 'drag to stir · click to flip what is under the spatula · space to toss',
    knob: 'click to turn the burner up · right-click to turn it down',
    oil: 'click to oil the pan',
    carton: 'click to crack an egg into the bowl',
    bowl: 'drag round and round to whisk',
  };

  return {
    update() {
      const level = game.pan.heat.level;
      out('level').textContent = SETTINGS[level].name;
      out('level').dataset.level = String(level);
      const t = Math.round(game.pan.heat.temp);
      out('temp').textContent = `${t}°`;
      out('temp').dataset.hot = t > 240 ? 'smoking' : t > 160 ? 'hot' : t > 60 ? 'warm' : 'cold';
      act('turn').disabled = game.board.pieces.length === 0;
      act('scrape').disabled = game.board.pieces.length === 0;
      act('toss').disabled = game.pan.pieces.length === 0;
      act('egg').disabled = game.eggs.eggsLeft === 0 || game.eggs.bowl.eggs >= 4 || game.eggs.pouring;
      act('pour').disabled = game.eggs.bowl.eggs === 0 || game.eggs.pouring || game.eggs.cracking;
      hint.textContent = HINTS[game.zone.zone] ?? '';
    },
  };
}
