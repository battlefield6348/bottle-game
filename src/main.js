import { Game } from './game.js';
import { isHalloween } from './season.js';

const SAVE_KEY = 'color-mart-water-sort';
const MECHANICS = {
  hidden: { title: '遮擋瓶', chip: '遮擋', text: '底層顏色以「?」隱藏，倒掉上層後才會揭露。' },
  bound: { title: '綁定色瓶', chip: '綁定', text: '瓶身與底座標示的顏色，就是這個瓶子唯一能接受的顏色。' },
  chain: { title: '鎖鏈瓶', chip: '鎖鏈', text: '鎖頭上的顏色集滿一瓶後，鎖鏈才會解開。' },
  ice: { title: '冰凍瓶', chip: '冰凍', text: '完成數字所示數量的顏色後才會解凍。' },
};

const elements = {
  canvas: document.getElementById('board'),
  levelLabel: document.getElementById('level-label'),
  chips: document.getElementById('mechanic-chips'),
  undo: document.getElementById('undo-button'),
  restart: document.getElementById('restart-button'),
  hint: document.getElementById('hint-button'),
  toast: document.getElementById('toast'),
  loading: document.getElementById('loading'),
  mechanicDialog: document.getElementById('mechanic-dialog'),
  mechanicTitle: document.getElementById('mechanic-title'),
  mechanicText: document.getElementById('mechanic-text'),
  mechanicOk: document.getElementById('mechanic-ok'),
  winDialog: document.getElementById('win-dialog'),
  winText: document.getElementById('win-text'),
  next: document.getElementById('next-button'),
};

// 瀏覽器儲存可能被停用（無痕模式等），讀寫失敗時退回預設值即可。
function loadSave() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (saved && Number.isInteger(saved.level) && Number.isInteger(saved.seed)) {
      return { seenMechanics: [], ...saved };
    }
  } catch {
    // 使用預設值
  }
  return { level: 1, seed: Math.floor(Math.random() * 2 ** 31), seenMechanics: [] };
}

function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // 無法儲存時仍可正常遊玩
  }
}

if (isHalloween(new Date(), window.location.search)) {
  document.body.classList.add('halloween');
  document.querySelector('meta[name="theme-color"]').content = '#0c0918';
  document.querySelector('#win-dialog .eyebrow').textContent = '🎃 不給糖就搗蛋';
  elements.next.textContent = '繼續搗蛋 👻';
}

const save = loadSave();
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
const pendingRequests = new Map();
const levelCache = new Map();
let nextRequestId = 1;

worker.onmessage = ({ data }) => {
  const resolve = pendingRequests.get(data.requestId);
  pendingRequests.delete(data.requestId);
  resolve?.(data);
};

function askWorker(message) {
  const requestId = nextRequestId++;
  return new Promise((resolve) => {
    pendingRequests.set(requestId, resolve);
    worker.postMessage({ ...message, requestId });
  });
}

function fetchLevel(level) {
  if (!levelCache.has(level)) {
    const request = askWorker({ type: 'generate', level, seed: save.seed }).then((data) => data.level);
    levelCache.set(level, request);
  }
  return levelCache.get(level);
}

let toastTimer = null;
function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove('visible'), 2200);
}

const game = new Game(elements.canvas, {
  onMessage: showToast,
  onMove: (moveCount) => {
    elements.undo.disabled = moveCount === 0;
  },
  onWin: (moveCount) => {
    save.level += 1;
    persist();
    fetchLevel(save.level);
    setTimeout(() => {
      elements.winText.textContent = `共使用 ${moveCount} 步完成第 ${save.level - 1} 關`;
      elements.winDialog.hidden = false;
    }, 900);
  },
});

function mechanicsIn(bottles) {
  const present = [];
  if (bottles.some((bottle) => bottle.hidden > 0)) present.push('hidden');
  if (bottles.some((bottle) => bottle.bound !== null)) present.push('bound');
  if (bottles.some((bottle) => bottle.chain !== null)) present.push('chain');
  if (bottles.some((bottle) => bottle.ice > 0)) present.push('ice');
  return present;
}

function introduceNewMechanic(present) {
  const unseen = present.find((key) => !save.seenMechanics.includes(key));
  if (!unseen) return;
  save.seenMechanics.push(unseen);
  persist();
  elements.mechanicTitle.textContent = MECHANICS[unseen].title;
  elements.mechanicText.textContent = MECHANICS[unseen].text;
  elements.mechanicDialog.hidden = false;
}

async function startLevel(level) {
  elements.loading.hidden = false;
  const levelData = await fetchLevel(level);
  elements.loading.hidden = true;
  elements.levelLabel.textContent = `第 ${level} 關`;

  const present = mechanicsIn(levelData.bottles);
  elements.chips.replaceChildren(
    ...present.map((key) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = MECHANICS[key].chip;
      return chip;
    }),
  );
  game.load(levelData, performance.now());
  introduceNewMechanic(present);
  fetchLevel(level + 1);
}

function resize() {
  game.resize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 3));
}

elements.canvas.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  game.tap(event.clientX, event.clientY, performance.now());
});

elements.undo.addEventListener('click', () => game.undo(performance.now()));
elements.restart.addEventListener('click', () => {
  if (game.isAnimating) return;
  game.load(game.levelData, performance.now());
});

let hintPending = false;
elements.hint.addEventListener('click', async () => {
  if (hintPending || game.isAnimating || game.won) return;
  hintPending = true;
  const result = await askWorker({ type: 'hint', bottles: game.bottles });
  hintPending = false;
  if (result.move) {
    game.showHint(result.move, performance.now());
    return;
  }
  showToast(result.provenUnsolvable ? '目前的盤面已無解，請復原幾步' : '找不到提示，試著復原幾步');
});

elements.mechanicOk.addEventListener('click', () => {
  elements.mechanicDialog.hidden = true;
});

elements.next.addEventListener('click', () => {
  elements.winDialog.hidden = true;
  startLevel(save.level);
});

window.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    game.undo(performance.now());
  }
});

window.addEventListener('resize', resize);
resize();

function loop(now) {
  game.frame(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
startLevel(save.level);
