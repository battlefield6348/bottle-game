// 萬聖節主題：10 月整月到 11/1 自動開啟；網址加 ?theme=halloween 或 ?theme=default 可強制切換。
export function isHalloween(date, search = '') {
  const theme = new URLSearchParams(search).get('theme');
  if (theme === 'halloween') return true;
  if (theme === 'default') return false;
  const month = date.getMonth();
  return month === 9 || (month === 10 && date.getDate() === 1);
}
