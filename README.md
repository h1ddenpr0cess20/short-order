# Short Order

A cooking game in one cast iron pan. There is one ticket on the rail — a potato
and egg scramble — and everything on the counter to make it with: a russet on
the board, a chef's knife, a carton of eggs, a bowl and a whisk, a bottle of
oil, and the pan on a gas burner that starts cold.

Dice the potato, fry it golden, beat three eggs and scramble them in, and plate
it. The plate is marked on what is actually on it.

![The kitchen: the board, the pan on its burner, and the ticket](docs/screenshots/desktop.png)

<img src="docs/screenshots/mobile.png" alt="The same kitchen on a phone, the board above the pan" width="300">

## Run

```sh
npm install
npm run dev       # → http://localhost:5173
```

It is a static page and nothing else — no server, no keys, no network. `npm run
build` puts it in `dist/`, and the Pages workflow publishes that on every push
to `main` once Pages is switched on (Settings → Pages → Source: GitHub Actions).

## Playing

| | |
|---|---|
| **knife** | Over the board the knife follows the pointer. Click to chop where the blade is — it goes through whatever is under it. |
| **turn** | Right-click the board, or `R`, turns the pile a quarter turn so the next cuts go the other way. |
| **carry** | Drag the pile and it comes up on the flat of the knife; let go over the pan to drop it in. `S` scrapes the board straight in. |
| **burner** | Click the knob to turn it up, right-click to turn it down — or `Q` and `E`. The pan's temperature is in the bar. |
| **oil** | Click the bottle, or `O`. |
| **spatula** | Over the pan, drag to stir and click to flip what is under it. `space` tosses the whole pan. |
| **handle** | Drag the pan's handle to shake it — the food slides — and flick upward as you let go to toss. |
| **eggs** | Click the carton to break an egg into the bowl (`G`). Drag round and round in the bowl to whisk. `P` pours. |
| **plate** | The button on the ticket, or `enter`, whenever it looks right. |

Everything in that list is also a button in the bar along the bottom, so it all
works on a phone: a tap on the board chops, a drag carries or stirs or whisks.
And it all works from the keys: `↑` `↓` aim the knife along the pile and `C`
chops, `S` scrapes, holding `W` whisks and holding `X` stirs, `G` cracks an egg,
`enter` plates, `M` mutes.

### What it takes

A potato goes to dice in three passes. Cut it into rounds; they are too tall to
stand on their cut faces and fall over flat, shingled on each other. Cut across
the rounds into strips. Turn the pile and cut across the strips. The knife does
not know any of that — it only ever makes one flat cut — so how even the dice
come out is how evenly you cut.

In the pan a piece browns on the face that is down, and only that face. Leave
it and it is golden on one side and pale on five; toss it, or stir it, and it
comes down on another. Small pieces cook through in half a minute; a whole
potato never does. Wet potato on iron that is not hot yet steams instead of
browning, and a pan full of it pulls the iron's temperature down until the
water is gone. Oil first. Too hot and the faces that stay down burn.

Eggs poured into the pan run out across the floor, and set from the bottom up.
Drag the spatula through egg that has started to set and it comes away in
curds — slow strokes make big soft ones — and those cook on like any other
piece. Leave it alone and it sets flat, which is an omelette. Egg wants less
heat than potato: turn the burner down before it goes in.

The ticket keeps a running commentary on all of this, read off the food rather
than ticked by hand — down to what the knife should do next, from the shapes
lying on the board — and a note pops up over the bar when the pan needs you:
something catching, a dry pan, a cold one, or eggs going into one too hot for
them. The plate is marked on the same measurements: how much
of the potato is a good bite and how even, how much of it is golden and cooked
through against pale, burnt or raw, whether the eggs were beaten smooth,
scrambled rather than set flat, and soft rather than runny, rubbery or brown —
and how long the ticket waited.

## How it works

See [design](docs/design.md) for the long version. In short:

- **The knife cuts the mesh.** Every piece of food is a closed triangle mesh.
  A chop is a plane through every piece under the blade: triangles are sorted
  to either side, the ones it crosses are split, and the hole it leaves in each
  half is found from the half's own open edges and filled with flesh. Both
  halves are closed solids again, so they can be cut again, measured, and
  browned. [`src/geometry/slice.js`](src/geometry/slice.js)
- **Browning lives on six sides.** Each piece keeps how browned each of the six
  directions of its own frame is. Whichever is down in the pan takes the heat;
  every vertex is painted from the six by the way it faces.
  [`src/sim/pan.js`](src/sim/pan.js), [`src/view/pieces.js`](src/view/pieces.js)
- **Egg is a sheet until it is not.** Liquid egg is a heightfield over the
  pan's floor that runs, sets and browns per patch; the spatula tears set egg
  off it into curds, which become pieces. [`src/sim/eggs.js`](src/sim/eggs.js)
- **Sound is synthesised.** The sizzle is filtered noise and a crackle of tiny
  pops, both following how much wet food is on hot iron.
  [`src/audio/sound.js`](src/audio/sound.js)

The renderer, the pan and both ingredients come from
[debater](https://github.com/h1ddenpr0cess20/debater): its WebGPU / WebGL 2
renderer is in [`src/vendor/gfx`](src/vendor/gfx) (with the three.js licence it
is partly ported under), the cast iron skillet is the one the debate was held
in, the potato is Tater's russet surface with his face taken off, and every
egg is Marc's shell.

| Script | |
|---|---|
| `npm run dev` | Vite, with hot reload |
| `npm run build` | Bundles the game to `dist/` |
| `npm run preview` | `build`, then serve `dist/` |
| `npm test` | `node:test` over the slicer, the simulations and the marking |
| `npm run lint` | ESLint |

`?renderer=webgl` in the address forces the WebGL 2 backend where WebGPU would
otherwise be used.
