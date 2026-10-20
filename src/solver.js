import { CAPACITY, canPour, pour, isWon, pourableRun } from './rules.js';

function isPlain(bottle) {
  return bottle.bound === null && bottle.chain === null && bottle.ice === 0;
}

function encodeBottle(bottle) {
  return `${bottle.layers.join('.')}/${bottle.hidden}`;
}

// 一般瓶子彼此可互換位置，排序後可合併等價盤面；特殊瓶依原位置編碼。
function stateKey(bottles) {
  const plain = [];
  const special = [];
  bottles.forEach((bottle, index) => {
    if (isPlain(bottle)) plain.push(encodeBottle(bottle));
    else special.push(`${index}:${encodeBottle(bottle)}`);
  });
  return `${plain.sort().join('|')}#${special.join('|')}`;
}

function isUniformAndVisible(bottle) {
  if (bottle.hidden > 0) return false;
  return pourableRun(bottle) === bottle.layers.length;
}

function candidateMoves(bottles) {
  const moves = [];
  for (let from = 0; from < bottles.length; from++) {
    let triedPlainEmpty = false;
    for (let to = 0; to < bottles.length; to++) {
      if (!canPour(bottles, from, to)) continue;

      const source = bottles[from];
      const target = bottles[to];
      const targetIsPlainEmpty = target.layers.length === 0 && isPlain(target);
      if (targetIsPlainEmpty) {
        // 所有一般空瓶等價，只需嘗試一個；把單色瓶整瓶搬到一般空瓶毫無進展。
        if (triedPlainEmpty) continue;
        triedPlainEmpty = true;
        if (isPlain(source) && isUniformAndVisible(source)) continue;
      }

      const amount = Math.min(pourableRun(source), CAPACITY - target.layers.length);
      const completesTarget = target.layers.length + amount === CAPACITY;
      let priority = 0;
      if (target.layers.length > 0) priority += 2;
      if (completesTarget && target.layers.length > 0) priority += 3;
      if (amount === pourableRun(source)) priority += 1;
      moves.push({ from, to, priority });
    }
  }
  return moves.sort((a, b) => b.priority - a.priority);
}

// 深度優先搜尋。exhausted=true 代表已窮舉完所有狀態，可確定無解。
export function solve(bottles, { nodeLimit = 200000 } = {}) {
  const visited = new Set();
  const path = [];
  let nodes = 0;
  let hitLimit = false;

  function search(current) {
    if (isWon(current)) return true;
    if (nodes >= nodeLimit) {
      hitLimit = true;
      return false;
    }
    const key = stateKey(current);
    if (visited.has(key)) return false;
    visited.add(key);
    nodes++;

    for (const move of candidateMoves(current)) {
      path.push([move.from, move.to]);
      if (search(pour(current, move.from, move.to).bottles)) return true;
      path.pop();
      if (hitLimit) return false;
    }
    return false;
  }

  const solved = search(bottles);
  return { moves: solved ? path.slice() : null, nodes, exhausted: !solved && !hitLimit };
}
