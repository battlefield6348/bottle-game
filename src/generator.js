import { CAPACITY, makeBottle } from './rules.js';
import { solve } from './solver.js';

export const MAX_COLORS = 12;
const ATTEMPTS_PER_STAGE = 40;
const SOLVER_NODE_LIMIT = 40000;

export const MECHANIC_UNLOCK_LEVEL = { hidden: 4, bound: 8, chain: 12, ice: 16 };

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mixSeed(...parts) {
  let hash = 2166136261;
  for (const part of parts) {
    hash ^= part >>> 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffle(items, random) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function stepsSince(level, unlockLevel, every) {
  if (level < unlockLevel) return 0;
  return 1 + Math.floor((level - unlockLevel) / every);
}

export function levelConfig(level) {
  const colors = Math.min(3 + Math.floor((level - 1) / 2), MAX_COLORS);
  const maxHidden = Math.ceil(colors * 0.75);
  const hiddenBottles = Math.min(stepsSince(level, MECHANIC_UNLOCK_LEVEL.hidden, 3), maxHidden);
  return {
    colors,
    emptyBottles: 2,
    hiddenBottles,
    // 綁定瓶前期是額外空瓶（較友善），第 20 關起取代一般空瓶，留給玩家的空間變少。
    boundBottles: Math.min(stepsSince(level, MECHANIC_UNLOCK_LEVEL.bound, 16), 2),
    boundReplacesEmpty: level >= 20,
    chainBottles: Math.min(stepsSince(level, MECHANIC_UNLOCK_LEVEL.chain, 16), 2),
    iceBottles: Math.min(stepsSince(level, MECHANIC_UNLOCK_LEVEL.ice, 16), 2),
    // 從多個有解候選中挑求解最費力的，關卡越後面挑得越多。
    candidates: Math.min(1 + Math.floor(level / 4), 8),
  };
}

// 找不到有解盤面時依序放寬條件，確保一定能產出關卡。
function relax(config) {
  if (config.iceBottles > 0) return { ...config, iceBottles: config.iceBottles - 1 };
  if (config.chainBottles > 0) return { ...config, chainBottles: config.chainBottles - 1 };
  if (config.boundReplacesEmpty) return { ...config, boundReplacesEmpty: false };
  return { ...config, emptyBottles: config.emptyBottles + 1 };
}

function isUniformFull(bottle) {
  return bottle.layers.length === CAPACITY && bottle.layers.every((color) => color === bottle.layers[0]);
}

function buildCandidate(config, random) {
  const units = [];
  for (let color = 0; color < config.colors; color++) {
    for (let i = 0; i < CAPACITY; i++) units.push(color);
  }
  shuffle(units, random);

  const filled = [];
  for (let i = 0; i < config.colors; i++) {
    filled.push(makeBottle(units.slice(i * CAPACITY, (i + 1) * CAPACITY)));
  }

  const specialOrder = shuffle([...filled.keys()], random);
  for (const index of specialOrder.slice(0, config.hiddenBottles)) {
    filled[index].hidden = CAPACITY - 1;
  }

  let lockable = shuffle([...filled.keys()], random);
  for (const index of lockable.splice(0, config.chainBottles)) {
    const bottle = filled[index];
    // 鑰匙顏色若在鎖鏈瓶內必定無法完成，因此只從瓶外顏色挑選。
    const keyChoices = [...Array(config.colors).keys()].filter((c) => !bottle.layers.includes(c));
    if (keyChoices.length === 0) continue;
    bottle.chain = keyChoices[Math.floor(random() * keyChoices.length)];
  }
  for (const index of lockable.splice(0, config.iceBottles)) {
    filled[index].ice = 1 + Math.floor(random() * 2);
  }

  const boundColors = shuffle([...Array(config.colors).keys()], random).slice(0, config.boundBottles);
  const bound = boundColors.map((color) => makeBottle([], { bound: color }));
  const emptyCount = config.boundReplacesEmpty
    ? Math.max(config.emptyBottles - bound.length, 1)
    : config.emptyBottles;
  const empties = Array.from({ length: emptyCount }, () => makeBottle([]));

  return shuffle([...filled, ...bound], random).concat(empties);
}

export function generateLevel(level, seed) {
  let config = levelConfig(level);
  let stage = 0;

  for (;;) {
    const random = mulberry32(mixSeed(seed, level, stage));
    let best = null;
    let found = 0;

    for (let attempt = 0; attempt < ATTEMPTS_PER_STAGE && found < config.candidates; attempt++) {
      const bottles = buildCandidate(config, random);
      // 開局不放已經整瓶同色的瓶子，即使底層被遮擋也一樣（否則只是白白要玩家倒出再倒回）。
      if (bottles.some(isUniformFull)) continue;

      const result = solve(bottles, { nodeLimit: SOLVER_NODE_LIMIT });
      if (!result.moves) continue;

      found++;
      if (!best || result.nodes > best.difficulty) {
        best = { bottles, solution: result.moves, difficulty: result.nodes };
      }
    }

    if (best) return { level, ...best, config };
    config = relax(config);
    stage++;
  }
}
