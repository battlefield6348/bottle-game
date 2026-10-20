export const BOTTLE_ASPECT = 3.2;
const MAX_BOTTLE_WIDTH = 72;
const SIDE_GUTTER = 16;
const GAP_X_RATIO = 0.6;
const ROW_GAP_RATIO = 0.45;
const POUR_ROOM_RATIO = 0.6;
const BOTTOM_ROOM_RATIO = 0.25;

function widthForRows(count, rows, { width, height, top }) {
  const perRow = Math.ceil(count / rows);
  const usedRows = Math.ceil(count / perRow);
  const byWidth = (width - SIDE_GUTTER * 2) / (perRow * (1 + GAP_X_RATIO) - GAP_X_RATIO);
  const heightUnits = POUR_ROOM_RATIO + usedRows + ROW_GAP_RATIO * (usedRows - 1) + BOTTOM_ROOM_RATIO;
  const byHeight = (height - top) / heightUnits / BOTTLE_ASPECT;
  return Math.min(byWidth, byHeight, MAX_BOTTLE_WIDTH);
}

// slot.x 為瓶子中心、slot.y 為瓶口頂端。選擇能讓瓶子最大的排數。
export function layoutBottles(count, viewport) {
  let rows = 1;
  let bottleWidth = widthForRows(count, 1, viewport);
  for (let candidate = 2; candidate <= 4; candidate++) {
    const candidateWidth = widthForRows(count, candidate, viewport);
    if (candidateWidth > bottleWidth) {
      rows = candidate;
      bottleWidth = candidateWidth;
    }
  }

  const perRow = Math.ceil(count / rows);
  rows = Math.ceil(count / perRow);
  const bottleHeight = bottleWidth * BOTTLE_ASPECT;
  const gapX = bottleWidth * GAP_X_RATIO;
  const rowGap = bottleHeight * ROW_GAP_RATIO;
  const blockHeight = rows * bottleHeight + (rows - 1) * rowGap;
  const freeHeight = viewport.height - viewport.top - blockHeight;
  const pourRoom = bottleHeight * POUR_ROOM_RATIO;
  const bottomRoom = bottleHeight * BOTTOM_ROOM_RATIO;
  const firstRowTop = viewport.top + pourRoom + (freeHeight - pourRoom - bottomRoom) / 2;

  const slots = [];
  for (let row = 0; row < rows; row++) {
    const inThisRow = Math.min(perRow, count - row * perRow);
    const rowWidth = inThisRow * bottleWidth + (inThisRow - 1) * gapX;
    const firstCenter = (viewport.width - rowWidth) / 2 + bottleWidth / 2;
    for (let column = 0; column < inThisRow; column++) {
      slots.push({
        x: firstCenter + column * (bottleWidth + gapX),
        y: firstRowTop + row * (bottleHeight + rowGap),
      });
    }
  }
  return { bottleWidth, bottleHeight, slots };
}
