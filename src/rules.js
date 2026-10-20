export const CAPACITY = 4;

// layers 由底到頂；hidden 為底部被遮擋的單位數（頂層永遠可見）。
// bound：只接受此顏色；chain：此顏色完成前鎖住；ice：完成此數量顏色前鎖住。
export function makeBottle(layers, { hidden = 0, bound = null, chain = null, ice = 0 } = {}) {
  return { layers: [...layers], hidden, bound, chain, ice };
}

export function topColor(bottle) {
  return bottle.layers[bottle.layers.length - 1];
}

export function isComplete(bottle) {
  if (bottle.layers.length !== CAPACITY) return false;
  return bottle.layers.every((color) => color === bottle.layers[0]);
}

export function completedColors(bottles) {
  const colors = new Set();
  for (const bottle of bottles) {
    if (isComplete(bottle)) colors.add(bottle.layers[0]);
  }
  return colors;
}

export function isLocked(bottle, bottles) {
  if (bottle.chain === null && bottle.ice === 0) return false;
  const done = completedColors(bottles);
  if (bottle.chain !== null && !done.has(bottle.chain)) return true;
  return done.size < bottle.ice;
}

// 只有可見的連續同色單位會一起倒出，遮擋層要等揭露後才能移動。
export function pourableRun(bottle) {
  const color = topColor(bottle);
  let run = 0;
  for (let i = bottle.layers.length - 1; i >= bottle.hidden; i--) {
    if (bottle.layers[i] !== color) break;
    run++;
  }
  return run;
}

export function canPour(bottles, from, to) {
  if (from === to) return false;
  const source = bottles[from];
  const target = bottles[to];
  if (source.layers.length === 0) return false;
  if (target.layers.length >= CAPACITY) return false;
  if (isComplete(source)) return false;
  if (isLocked(source, bottles) || isLocked(target, bottles)) return false;

  const color = topColor(source);
  if (target.bound !== null && target.bound !== color) return false;
  return target.layers.length === 0 || topColor(target) === color;
}

export function pour(bottles, from, to) {
  if (!canPour(bottles, from, to)) return null;

  const source = bottles[from];
  const target = bottles[to];
  const amount = Math.min(pourableRun(source), CAPACITY - target.layers.length);
  const color = topColor(source);

  const sourceLayers = source.layers.slice(0, source.layers.length - amount);
  const newSource = {
    ...source,
    layers: sourceLayers,
    hidden: Math.min(source.hidden, Math.max(sourceLayers.length - 1, 0)),
  };
  const newTarget = { ...target, layers: [...target.layers, ...Array(amount).fill(color)] };

  const next = bottles.slice();
  next[from] = newSource;
  next[to] = newTarget;
  return { bottles: next, amount, color };
}

export function isWon(bottles) {
  return bottles.every((bottle) => bottle.layers.length === 0 || isComplete(bottle));
}
