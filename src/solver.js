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

// 最短步數的下界：每種顏色要合併成「需要的瓶數」段，且至少要有那麼多段位在瓶底；
// 每一步只能讓其中一項減一，因此不會高估，A* 找到的解保證最短。
function remainingMovesLowerBound(bottles) {
  const units = new Map();
  const runs = new Map();
  const bottoms = new Map();
  for (const bottle of bottles) {
    bottle.layers.forEach((color, index) => {
      units.set(color, (units.get(color) ?? 0) + 1);
      if (index > 0 && bottle.layers[index - 1] === color) return;
      runs.set(color, (runs.get(color) ?? 0) + 1);
      if (index === 0) bottoms.set(color, (bottoms.get(color) ?? 0) + 1);
    });
  }
  let estimate = 0;
  for (const [color, count] of units) {
    const needed = Math.ceil(count / CAPACITY);
    estimate += runs.get(color) - needed + Math.max(needed - (bottoms.get(color) ?? 0), 0);
  }
  return estimate;
}

// f 小者優先；f 相同時優先展開較深的節點，較快抵達終點。
function before(a, b) {
  return a.f < b.f || (a.f === b.f && a.g > b.g);
}

function heapPush(heap, node) {
  heap.push(node);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (!before(heap[i], heap[parent])) break;
    [heap[i], heap[parent]] = [heap[parent], heap[i]];
    i = parent;
  }
}

function heapPop(heap) {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length > 0) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = i;
      if (left < heap.length && before(heap[left], heap[smallest])) smallest = left;
      if (right < heap.length && before(heap[right], heap[smallest])) smallest = right;
      if (smallest === i) break;
      [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
      i = smallest;
    }
  }
  return top;
}

// A* 搜尋最短解，回傳格式與 solve 相同。超過 nodeLimit 時 moves 為 null 且 exhausted=false。
export function solveShortest(bottles, { nodeLimit = 200000 } = {}) {
  const bestCost = new Map([[stateKey(bottles), 0]]);
  const closed = new Set();
  const heap = [];
  heapPush(heap, { bottles, g: 0, f: remainingMovesLowerBound(bottles), parent: null, move: null });
  let nodes = 0;

  while (heap.length > 0) {
    const node = heapPop(heap);
    const key = stateKey(node.bottles);
    if (closed.has(key)) continue;
    closed.add(key);

    if (isWon(node.bottles)) {
      const moves = [];
      for (let step = node; step.parent; step = step.parent) moves.push(step.move);
      return { moves: moves.reverse(), nodes, exhausted: false };
    }
    if (nodes >= nodeLimit) return { moves: null, nodes, exhausted: false };
    nodes++;

    for (const { from, to } of candidateMoves(node.bottles)) {
      const next = pour(node.bottles, from, to).bottles;
      const nextKey = stateKey(next);
      const g = node.g + 1;
      if (closed.has(nextKey) || (bestCost.get(nextKey) ?? Infinity) <= g) continue;
      bestCost.set(nextKey, g);
      heapPush(heap, { bottles: next, g, f: g + remainingMovesLowerBound(next), parent: node, move: [from, to] });
    }
  }
  return { moves: null, nodes, exhausted: true };
}
