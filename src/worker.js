import { generateLevel } from './generator.js';
import { solve, solveShortest } from './solver.js';

// 關卡產生與提示求解可能耗時數百毫秒，放在 Worker 才不會讓動畫掉幀。
self.onmessage = ({ data }) => {
  if (data.type === 'generate') {
    const level = generateLevel(data.level, data.seed);
    self.postMessage({ type: 'level', requestId: data.requestId, level });
    return;
  }
  if (data.type === 'hint') {
    const result = solve(data.bottles, { nodeLimit: 150000 });
    self.postMessage({
      type: 'hint',
      requestId: data.requestId,
      move: result.moves ? result.moves[0] ?? null : null,
      provenUnsolvable: result.exhausted,
    });
    return;
  }
  if (data.type === 'solve') {
    // 先找最短解；盤面太複雜超過上限時，退回較快但不保證最短的深度優先搜尋。
    const shortest = solveShortest(data.bottles, { nodeLimit: 300000 });
    const result = shortest.moves || shortest.exhausted ? shortest : solve(data.bottles, { nodeLimit: 400000 });
    self.postMessage({
      type: 'solution',
      requestId: data.requestId,
      moves: result.moves,
      shortest: result === shortest,
      provenUnsolvable: result.exhausted,
    });
  }
};
