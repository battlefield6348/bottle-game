import { generateLevel } from './generator.js';
import { solve } from './solver.js';

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
    const result = solve(data.bottles, { nodeLimit: 400000 });
    self.postMessage({
      type: 'solution',
      requestId: data.requestId,
      moves: result.moves,
      provenUnsolvable: result.exhausted,
    });
  }
};
