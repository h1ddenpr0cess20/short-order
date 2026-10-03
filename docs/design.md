# Design

## What is where

```
main.js ──▶ scene/     the kitchen: counter, range, pan, board, knife, bowl, carton…
        ──▶ game/      the hand (pointer and keys), the egg station, the marking
        ──▶ sim/       the board, the pan, the heat, the eggs — plain numbers
        ──▶ geometry/  the plane cut and the ear clipping it caps with
        ──▶ food/      what a potato, an egg and a curd are, and their colours
        ──▶ view/      meshes for pieces, the egg sheet, steam and smoke
        ──▶ ui/        the ticket, the bar, the verdict, the title, the menu
        ──▶ audio/     the synthesiser, and which sound goes with what
```

Nothing under `sim/`, `geometry/`, `food/` or `game/grade.js` touches the scene
or the page, so all of it runs under Node, and that is what the tests exercise.

## A piece of food

Every piece is a closed triangle soup — no index, three vertices to a
triangle, each with its own copy — with a normal and a base colour per vertex,
and a flag per triangle saying whether it is the original skin or a face the
knife made. It is kept in its own frame with the middle of its volume at the
origin, and carries a position and a rotation in whatever frame it is in now:
the board's top, the pan's floor, the plate.

How cooked it is lives on six sides — the six directions of its own frame —
plus how cooked its middle is and how wet it still is. That is the whole of
it. A diced cube has an obvious six; a curved bit of skin is shared between
the ones it faces.

## The cut

[`slice.js`](../src/geometry/slice.js) cuts a solid with a plane and closes up
both halves.

Vertices within a hair of the plane are moved onto it exactly, every copy the
same way, which takes the zero case off the table and lets a knife come down on
a face it has already cut, or on a corner. A triangle with corners either side
is split — one corner alone on its side gives one triangle there and two on the
other; one corner on the plane gives one each side. The crossing point on an
edge is always worked out from the same end of the edge, so the two triangles
that share it get bit-for-bit the same point.

The hole each half is left with is found from the half itself rather than from
the cut: its rim is the edges lying in the plane that no other triangle on that
side runs back along. A surface that only touched the plane has both directions
and leaves nothing. The rim runs the opposite way to the face that closes it,
which says which outline is the edge of a face and which is a hole in one. The
outline is projected into the plane, ear clipped, and filled with flesh coloured
by asking the ingredient what its inside looks like there.

Then the half is split into the separate lumps it is made of — one cut through
a dented outline can leave two — and every lump is a closed solid again, so it
can be cut again, measured by the divergence theorem, and browned.

Meshes off a sphere are not quite closed at the seam — cos(2π) is not cos(0) —
so a solid is welded once, when it is made, and from then on every cut keeps it
exactly closed. The tests dice a ball and a potato through every axis and check
that no edge is unpaired and no volume went missing.

## The board

[`sim/board.js`](../src/sim/board.js) is the board's frame: y up from its top,
x left to right, z toward the cook. The knife only ever cuts across — a plane
z = constant — through whatever lies under the length of its blade, and pushes
the two sides apart by the width of the blade.

Pieces rest on the board or on each other. A piece much taller than it is thin
cannot stand on its cut face, so it falls over, away from the cut, about the
edge it stands on, and lands on top of whatever it falls across — which is how
rounds shingle off the end of a potato. Pieces at the same height are kept out
of each other. That is the whole of the physics on the board: nothing slides or
bounces, it only falls into place, and that is enough to make the three passes
of dicing work the way they do with a real knife.

## The pan

[`sim/pan.js`](../src/sim/pan.js) is the pan's frame: the middle of the cooking
surface is the origin, and the floor is level out to `FLAT` and rolls up into
the wall beyond it ([`floorHeight`](../src/scene/pan.js)).

A piece is on the floor or in the air. On the floor it slides and slows — less
on oil — bumps the others as discs, and rides up the curve of the wall and back.
In the air it tumbles; wherever it lands it settles onto whichever of its sides
is nearest straight down. A toss throws everything up spinning, a flip throws
up whatever is under the spatula with half a turn, and the spatula pushed
through the pan shoves pieces along and rolls some of them onto the next face.

Cooking: the side down browns at the heat of the iron under it, slowed while
the piece is still wet; the other sides get a little through the oil. The
middle cooks through at a pace that goes with thickness to a power more than
one, so dice are done in half a minute and a whole potato is not done at all.
Water cooks out over time, and the wet load on the floor is what pulls the
pan's temperature down.

[`sim/heat.js`](../src/sim/heat.js) is the burner and the iron. Each mark on
the knob is a temperature the empty pan settles at; it gets two-thirds of the
way there in nine seconds, which is slow, and is the reason preheating matters.
The floor runs about a fifth cooler at the wall than over the flame.

## The eggs

[`sim/eggs.js`](../src/sim/eggs.js). In the bowl, eggs are a count and how well
beaten they are: the whisk's travel through them, more needed for more eggs, and
less beaten again for every fresh egg broken in.

In the pan they are a sheet on a grid over the flat of the floor: how much
liquid egg lies on each patch, how set it is, how much of it is yolk, how brown
it has gone underneath. Liquid runs into the patches round it as far as both
still run; heat sets it — a thin film at once, a deep puddle slower — and a
patch that has started to set no longer runs. The spatula through it pushes
liquid ahead and stirs it together, and tears egg that is setting off the iron;
what it gathers drops off as a curd when there is a curd's worth, bigger for a
slow stroke. Curds are pieces from then on.

What is left set flat at the end is counted as omelette, not scramble.

## The marking

[`game/grade.js`](../src/game/grade.js) is plain functions over the food, used
both for the plate and for the ticket's running commentary:

| | |
|---|---|
| dice | the share of the potato, by volume, in pieces no side of which is a sliver or longer than a mouthful; and how alike those are |
| fry | the share golden all round and cooked through, against pale, burnt — one bad side is enough — and raw in the middle |
| eggs | how smooth they were beaten, how much is in curds rather than set flat, and how much is set soft against runny, rubbery or brown |
| time | from the first thing the cook did to the plate |

## The picture

The pieces are one mesh each, painted per vertex from their six sides: flesh
goes from cream through gold to a deep fried brown and then black, skin only
darkens, and every vertex has a little jitter of its own so a face browns
mottled. Repainting is spread over frames, a few pieces at a time.

The egg sheet is a heightfield over the sheet's grid. Where there is no egg
the surface dips under the iron, so the edge of the egg is wherever the
surface comes up through the floor — a smooth line rather than the grid's
steps. Steam comes off anything wet on hot iron and thins as the food dries,
which is the best clue that browning has started; smoke means something is
burning.

The renderer is the one [debater](https://github.com/h1ddenpr0cess20/debater)
draws with, vendored, with three additions: a per-frame hook on the stage,
repeat wrapping for textures, and nothing else. The gas flame is its first
hand-written `ShaderMaterial`, in GLSL and WGSL both.

## The layout

The kitchen has two arrangements: on a wide window the board stands beside
the range with the ticket down the left; on a tall one the board is above the
range and the ticket is a strip across the top. The camera is framed by
asking — walked back until every corner that has to be in shot is on screen
and clear of the ticket and the bar — and re-framed when the window changes
shape. Every station's simulation runs in that station's own frame, so moving
a station moves everything on it with it.
