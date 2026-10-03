/**
 * Which sound goes with which thing that happens in the kitchen. The game
 * says what happened; this decides what it sounds like.
 */

export function wireSound({ game, sound }) {
  const heat = () => Math.max(0, Math.min(1.5, (game.pan.heat.temp - 110) / 100));
  let lastLevel = 0;
  let whiskTick = 0;

  game.on((e) => {
    switch (e.type) {
      case 'chop': sound.play('chop', e.cut > 0); break;
      case 'turn': sound.play('scrape'); break;
      case 'pickup': sound.play('scrape'); break;
      case 'scrape': sound.play('scrape'); break;
      case 'add': sound.play('splash', heat(), e.count / 10); break;
      case 'toss': sound.play('toss'); break;
      case 'land': if (e.speed > 4) sound.play('land', heat()); break;
      case 'flip': sound.play('flip'); break;
      case 'egg-tap': sound.play('crack'); break;
      case 'egg-drop': sound.play('plop'); break;
      case 'egg-in-pan': sound.play('splash', heat(), 0.35); break;
      case 'yolk-flip': sound.play('flip'); break;
      case 'yolk-tear': sound.play('flip'); break;
      case 'fold': sound.play('flip'); break;
      case 'whisk':
        whiskTick += e.speed;
        if (whiskTick > 0.35) {
          whiskTick = 0;
          sound.play('whisk', Math.min(1, e.speed * 4));
        }
        break;
      case 'pour-start': sound.play('pour'); break;
      case 'oil': sound.play('oil'); break;
      case 'salt': sound.play('salt'); break;
      case 'pepper': sound.play('pepper'); break;
      case 'butter': sound.play('butter', heat()); break;
      case 'heat':
        if (lastLevel === 0 && e.level > 0) sound.play('ignite');
        else sound.play('knob');
        lastLevel = e.level;
        break;
      case 'land-plate': if (Math.random() < 0.3) sound.play('clink'); break;
      case 'plated': sound.play('bell'); break;
      case 'reset': lastLevel = 0; break;
      default: break;
    }
  });

  return {
    update(dt) {
      const pan = game.pan;
      /** Egg running onto a hot pan sizzles hard, on top of whatever is frying. */
      const liquid = game.sheet.empty ? 0 : Math.min(1, game.sheet.summary().liquid / 4) * heat();
      sound.update(dt, {
        sizzle: Math.min(1, pan.sizzle + liquid * 0.8 + Math.min(0.3, pan.oil * 0.25) * heat() * 0.6),
        burner: pan.heat.level / 5,
        stir: game.stirring ?? 0,
      });
    },
  };
}
