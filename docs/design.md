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

Each cut fills its face with a fan of long thin triangles out to every point
of the outline, and the next cut slices through all of them; left alone, a
potato of under five thousand triangles dices into three hundred thousand, and
everything after — drawing, painting, measuring, the next cut — pays for it.
So every piece the knife makes is simplified
([`geometry/simplify.js`](../src/geometry/simplify.js)): each flat face is put
back together as one outline and filled again with as few triangles as it
needs, and the points along a straight edge where two flat faces meet, which
nothing else uses, come out of both faces at once, so they still meet edge to
edge. Skin points stay. A face it cannot be sure of — a hole, an outline that
touches itself, a refill whose area does not match — keeps the triangles it
had. A cube from the middle of the potato is twelve triangles; the whole
diced potato is about four times the whole one.

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
the piece is still wet; the sides standing up from it are half in the oil and
take a fifth as much (less on a dry pan), and the top only a trace. The
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

An egg broken straight into the pan is poured into the sheet as white — thick
white, which runs a sixth as freely as beaten egg, so it stays round its
yolk — and its yolk is kept apart, as a dome with its own set. The yolk is
cooked from below, through the white, at a fifth the pace of the white; the
white close round a yolk still face up sets at about half pace, since it is
deep there and its top never touches the iron. A spatula drawn through a yolk
breaks it, and it runs out into the sheet. Turning an egg over takes every
patch nearer its yolk than any other: if they have set enough to hold, the
browning on their two faces swaps and the yolk is face down, setting five
times as fast; if not, the white tears and the yolk breaks. A toss turns
every egg at once.

Folding lifts the whole sheet off the floor as one piece — rolled, or in
half — with how set it was as its middle and its underside's browning as its
outside, and from then on it is a piece like any other.

## The extras

Grated cheese, diced tomato, ham, green pepper and onion, and snipped chives
sit in ramekins along the counter, each heaped with bits of the same solids
the pan gets. A handful goes in as small pieces
([`food/fillings.js`](../src/food/fillings.js)), which slide, toss and cook
like any others: they brown on the face that is down, and their middles cook
through, which for onion and pepper is softening, for cheese melting — it
slumps as it does. A fold takes every bit lying on the egg inside the
omelette with it; a diner omelette shows flecks of them along its fold.

## The menu

[`game/dishes.js`](../src/game/dishes.js) is plain data: for every dish, what
is on the counter (a potato or not), whether eggs go to the bowl or the pan,
how it is folded, its par time, and its ticket — each step with a function
from the game's measurements to a line, a bar and whether it is done.

## The marking

Butter is fat with water and milk solids in it. A pat melts at a pace set by
the iron's temperature — a few seconds at frying heat, not at all cold — and
as it melts it adds to the pan's fat, so it greases like oil. The water foams
off, the foam dying away the faster the hotter the iron. The solids brown from
140°, nutty by about one, and burnt at 1.6: on medium-low that takes most of a
minute, on high a few seconds. Food or egg over the floor keeps them off the
iron and slows it to a quarter. Eggs poured into butter are marked as buttered;
burnt butter in the pan with the food makes the plate bitter.

Salt and pepper are counted in pinches and twists and kept on each piece. A
pinch over the pan is shared by footprint over the pieces and the egg on the
floor; the egg holds its seasoning all through, and a curd torn off it takes
its share by volume. With the pan empty, or when the salt is dragged there,
it goes into the bowl and into the pan with the eggs.
[`sim/season.js`](../src/sim/season.js)

[`game/grade.js`](../src/game/grade.js) is plain functions over the food, used
both for the plate and for the ticket's running commentary:

| | |
|---|---|
| dice | the share of the potato, by volume, in pieces no side of which is a sliver or longer than a mouthful; and how alike those are |
| fry | the share golden all round — every face coloured, none burnt — and cooked through, against pale, one-sided, burnt and raw in the middle |
| eggs | how smooth they were beaten, how much is in curds rather than set flat, and how much is set soft against runny, rubbery or brown |
| season | salt against right for the potato and for the egg, each by its own volume — a pinch to every eight — and pepper the same, more forgivingly; bitter if the butter burnt |
| time | from the first thing the cook did to the plate, against the dish's par |
| fried eggs | per egg: the white set through, not glassy round the yolk, not brown and leathery; the yolk whole, runny, and turned or not as ordered |
| omelette | French: just set inside, smooth, unbroken, and pale; diner: set through, golden at most, with its filling folded in |
| extras | whether they suit the dish, whether onion and pepper were cooked and the cheese melted, how much, and — for a diner omelette — how much went inside |

## The picture

The pieces are one mesh each, painted per vertex from their six sides: flesh
goes from cream through gold to a deep fried brown and then black, skin only
darkens, and every vertex has a little jitter of its own so a face browns
mottled. A piece is only repainted when its browning or cooking has moved
enough to show — a few pieces a frame at most — so a potato lying on the board,
or one that has stopped changing, costs nothing.

The stage draws at no more than sixty frames a second, whatever the display;
when nothing is moving and nobody has touched anything for a moment — the
title, a cold kitchen, the plate served — it drops to twelve. A machine that
cannot keep forty or so at full rate is given fewer pixels, a step at a time.

The egg sheet is a heightfield over the sheet's grid. Where there is no egg
the surface dips under the iron, so the edge of the egg is wherever the
surface comes up through the floor — a smooth line rather than the grid's
steps. Steam comes off anything wet on hot iron and thins as the food dries,
which is the best clue that browning has started; smoke means something is
burning.

The kitchen is dressed like a brunch place's menu board: bottle-green tile
and glaze, cream china and card, gilt and brass, walnut handles. Every surface
is painted on a canvas at load ([`textures.js`](../src/scene/textures.js)) —
the marble, the tile, the grain, the labels on the oil and the eggs — and the
props that are no primitive, the carton, the butter dish, the towel and the
slotted blade of the spatula, are cast from distances
([`sdf.js`](../src/scene/sdf.js)) the way the pan's handle is, with any face
that rests on the counter left open. The page's faces — Playfair Display,
Oswald and Caveat — are bundled with it, and loaded before the labels are
painted.

The renderer is the one [debater](https://github.com/h1ddenpr0cess20/debater)
draws with, vendored, with a few additions: a per-frame hook on the stage,
its pacing, and repeat wrapping for textures. The gas flame is its first
hand-written `ShaderMaterial`, in GLSL and WGSL both.

## The layout

The kitchen has two arrangements: on a wide window the board stands beside
the range with the ticket down the left; on a tall one the board is above the
range and the ticket is a strip across the top. The camera is framed by
asking — walked back until every corner that has to be in shot is on screen
and clear of the ticket and the bar — and re-framed when the window changes
shape. Every station's simulation runs in that station's own frame, so moving
a station moves everything on it with it.
