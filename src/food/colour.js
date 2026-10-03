/**
 * Colours as plain linear RGB triples, which is what vertex colours are. The
 * hex values below are written the way a person picks a colour — sRGB — and
 * converted once.
 */

const toLinear = (c) => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4));

export function hex(value) {
  return [toLinear(((value >> 16) & 255) / 255), toLinear(((value >> 8) & 255) / 255), toLinear((value & 255) / 255)];
}

export function mix(a, b, t, out = [0, 0, 0]) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

export function scale(a, k, out = [0, 0, 0]) {
  out[0] = a[0] * k;
  out[1] = a[1] * k;
  out[2] = a[2] * k;
  return out;
}

/**
 * A piecewise ramp through colour stops, `[at, colour]`, in ascending `at`.
 * Below the first stop is the first colour, past the last the last.
 */
export function ramp(stops) {
  return (t, out = [0, 0, 0]) => {
    if (t <= stops[0][0]) return mix(stops[0][1], stops[0][1], 0, out);
    for (let i = 1; i < stops.length; i++) {
      const [at, colour] = stops[i];
      if (t <= at) {
        const [from, previous] = stops[i - 1];
        return mix(previous, colour, (t - from) / (at - from), out);
      }
    }
    const last = stops[stops.length - 1][1];
    return mix(last, last, 0, out);
  };
}
