import { Game } from './game.js';
import { isHalloween } from './season.js';
import { pour } from './rules.js';
import { COLORS } from './palette.js';

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
  solve: document.getElementById('solve-button'),
  autoplay: document.getElementById('autoplay'),
  autoplayToggle: document.getElementById('autoplay-toggle'),
  autoplayCount: document.getElementById('autoplay-count'),
  autoplayCurrent: document.getElementById('autoplay-current'),
  autoplayPause: document.getElementById('autoplay-pause'),
  autoplayStop: document.getElementById('autoplay-stop'),
  stepsList: document.getElementById('steps-list'),
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

// 自動通關狀態：steps 為完整解法，index 為下一步要執行的位置。
const STEP_GAP = 260;
const autoplay = { active: false, paused: false, steps: [], index: 0, idleSince: null, items: [] };

function refreshControls() {
  const locked = autoplay.active;
  elements.undo.disabled = locked || game.history.length === 0;
  elements.restart.disabled = locked;
  elements.hint.disabled = locked;
  elements.solve.disabled = locked;
}

const game = new Game(elements.canvas, {
  onMessage: showToast,
  onMove: () => refreshControls(),
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
  stopAutoplay();
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
  if (autoplay.active) return;
  game.tap(event.clientX, event.clientY, performance.now());
});

elements.undo.addEventListener('click', () => {
  if (!autoplay.active) game.undo(performance.now());
});
elements.restart.addEventListener('click', () => {
  if (game.isAnimating || autoplay.active) return;
  game.load(game.levelData, performance.now());
});

let hintPending = false;
elements.hint.addEventListener('click', async () => {
  if (hintPending || game.isAnimating || game.won || autoplay.active) return;
  hintPending = true;
  const result = await askWorker({ type: 'hint', bottles: game.bottles });
  hintPending = false;
  if (result.move) {
    game.showHint(result.move, performance.now());
    return;
  }
  showToast(result.provenUnsolvable ? '目前的盤面已無解，請復原幾步' : '找不到提示，試著復原幾步');
});

// 依目前盤面模擬整條解法，算出每一步倒出的顏色與數量供步驟清單顯示。
function describeSteps(bottles, moves) {
  let current = bottles;
  return moves.map(([from, to]) => {
    const result = pour(current, from, to);
    current = result.bottles;
    return { from, to, color: result.color, amount: result.amount };
  });
}

function stepContent(step) {
  const swatch = document.createElement('span');
  swatch.className = 'swatch';
  swatch.style.background = COLORS[step.color].fill;
  const text = document.createElement('span');
  text.textContent = `瓶 ${step.from + 1} → 瓶 ${step.to + 1}　${COLORS[step.color].name} ×${step.amount}`;
  return [swatch, text];
}

function renderStepList() {
  autoplay.items = autoplay.steps.map((step, index) => {
    const item = document.createElement('li');
    item.className = 'step';
    const number = document.createElement('span');
    number.className = 'step-index';
    number.textContent = `${index + 1}.`;
    item.append(number, ...stepContent(step));
    return item;
  });
  elements.stepsList.replaceChildren(...autoplay.items);
}

// current 為正在執行（或剛執行完）的步驟索引；-1 代表尚未開始。
function renderStepProgress(current) {
  const total = autoplay.steps.length;
  autoplay.items.forEach((item, index) => {
    item.classList.toggle('done', index < current);
    item.classList.toggle('current', index === current);
  });
  if (current < 0) {
    elements.autoplayCount.textContent = `完整解法共 ${total} 步`;
    elements.autoplayCurrent.textContent = '準備開始…';
    game.labels = { active: [] };
    return;
  }
  const step = autoplay.steps[current];
  elements.autoplayCount.textContent = `第 ${current + 1} / ${total} 步`;
  elements.autoplayCurrent.replaceChildren(...stepContent(step));
  game.labels = { active: [step.from, step.to] };
  autoplay.items[current].scrollIntoView({ block: 'nearest' });
}

function setPaused(paused) {
  autoplay.paused = paused;
  const label = paused ? '繼續' : '暫停';
  elements.autoplayPause.setAttribute('aria-label', label);
  elements.autoplayPause.title = label;
  elements.autoplayPause.querySelector('path').setAttribute('d', paused ? 'M8 5v14l11-7Z' : 'M8 5v14M16 5v14');
}

function stopAutoplay() {
  if (!autoplay.active) return;
  autoplay.active = false;
  autoplay.steps = [];
  autoplay.items = [];
  game.labels = null;
  elements.autoplay.hidden = true;
  refreshControls();
}

function startAutoplay(steps) {
  autoplay.active = true;
  autoplay.steps = steps;
  autoplay.index = 0;
  autoplay.idleSince = null;
  setPaused(false);
  renderStepList();
  renderStepProgress(-1);
  // 窄螢幕預設收合，避免步驟清單擋住瓶子；點擊目前步驟可展開完整清單。
  const collapsed = window.innerWidth < 900;
  elements.autoplay.classList.toggle('collapsed', collapsed);
  elements.autoplayToggle.setAttribute('aria-expanded', String(!collapsed));
  elements.autoplay.hidden = false;
  refreshControls();
}

// 每幀檢查：上一步動畫結束並稍作停頓後，才執行下一步。
function stepAutoplay(now) {
  if (!autoplay.active || autoplay.paused) return;
  if (game.isAnimating) {
    autoplay.idleSince = null;
    return;
  }
  autoplay.idleSince ??= now;
  if (now - autoplay.idleSince < STEP_GAP) return;
  autoplay.idleSince = null;

  if (autoplay.index >= autoplay.steps.length) {
    stopAutoplay();
    return;
  }
  const step = autoplay.steps[autoplay.index];
  if (!game.autoPour(step.from, step.to, now)) {
    stopAutoplay();
    showToast('自動通關中斷，請再試一次');
    return;
  }
  renderStepProgress(autoplay.index);
  autoplay.index += 1;
}

let solvePending = false;
elements.solve.addEventListener('click', async () => {
  if (solvePending || autoplay.active || game.isAnimating || game.won) return;
  solvePending = true;
  elements.loading.hidden = false;
  const bottles = game.bottles;
  const result = await askWorker({ type: 'solve', bottles });
  elements.loading.hidden = true;
  solvePending = false;
  // 求解期間盤面若已改變（例如切換關卡），這份解法就不再適用。
  if (game.bottles !== bottles) return;
  if (!result.moves) {
    showToast(result.provenUnsolvable ? '目前的盤面已無解，請復原幾步' : '找不到解法，試著復原幾步或重玩');
    return;
  }
  game.deselect(performance.now());
  startAutoplay(describeSteps(bottles, result.moves));
});

elements.autoplayPause.addEventListener('click', () => setPaused(!autoplay.paused));
elements.autoplayStop.addEventListener('click', stopAutoplay);
elements.autoplayToggle.addEventListener('click', () => {
  const collapsed = elements.autoplay.classList.toggle('collapsed');
  elements.autoplayToggle.setAttribute('aria-expanded', String(!collapsed));
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
    if (!autoplay.active) game.undo(performance.now());
  }
});

window.addEventListener('resize', resize);
resize();

function loop(now) {
  stepAutoplay(now);
  game.frame(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
startLevel(save.level);
