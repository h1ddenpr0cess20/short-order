/**
 * The burner and the pan's heat.
 *
 * Cast iron is slow: it takes the best part of half a minute to come up to
 * temperature, it holds it, and a pan full of wet potato knocks it down until
 * the water has cooked off. That is what makes preheating matter and what
 * makes crowding the pan matter, and both are things a cook learns.
 *
 * Temperatures are in °C, because that is what the thermometer says.
 */

/** Where the pan settles at each mark on the knob, empty. */
export const SETTINGS = Object.freeze([
  { name: 'off', temp: 22 },
  { name: 'low', temp: 135 },
  { name: 'medium-low', temp: 165 },
  { name: 'medium', temp: 195 },
  { name: 'medium-high', temp: 222 },
  { name: 'high', temp: 252 },
]);

export const ROOM = 22;

/** How long the iron takes to get two-thirds of the way to where the burner is taking it. */
const LAG = 9;

/** How hard wet food pulls the heat out of it, per unit of floor it covers. */
const LOAD = 0.0021;

/**
 * How fast food browns at a temperature, relative to a pan at 200°: nothing
 * much below 120°, where the water is still boiling off, and quickly hotter
 * than that above it.
 */
export function browning(t) {
  return Math.max(0, (t - 120) / 80) ** 1.3;
}

/** How fast heat gets into the middle of something, relative to 200°. */
export function cooking(t) {
  return Math.max(0, (t - 90) / 110);
}

/** How fast egg sets, relative to 200°: it starts well below anything browning. */
export function setting(t) {
  return Math.max(0, (t - 70) / 130);
}

/**
 * Hotter in the middle, over the flame, than out at the wall: the far edge
 * of the floor runs about a fifth cooler.
 */
export function spread(temp, r, flat) {
  const k = Math.min(1, r / flat);
  return ROOM + (temp - ROOM) * (1 - 0.2 * k * k);
}

export function createHeat({ temp = ROOM } = {}) {
  const state = { level: 0, temp };

  return {
    state,
    get level() { return state.level; },
    get temp() { return state.temp; },
    get setting() { return SETTINGS[state.level]; },

    set(level) {
      state.level = Math.max(0, Math.min(SETTINGS.length - 1, Math.round(level)));
      return state.level;
    },

    /**
     * One step. `load` is how much wet food is on the floor — area times how
     * wet it still is — which the iron spends heat boiling off.
     */
    update(dt, load = 0) {
      const target = SETTINGS[state.level].temp;
      state.temp += ((target - state.temp) / LAG) * dt;
      state.temp -= LOAD * load * Math.max(0, state.temp - 100) * dt;
      if (state.temp < ROOM) state.temp = ROOM;
    },

    /** Cold food going in takes some heat with it at once. */
    shock(area) {
      state.temp -= Math.min(40, area * 1.1) * Math.max(0, (state.temp - ROOM) / 200);
    },
  };
}
