const REPO = 'Rody1993/AMST-data';

export function ghUrl(path) {
  return `https://api.github.com/repos/${REPO}/contents/${path}?ref=main`;
}

export function samplePath(path) {
  return `./sample/${path.replaceAll('/', '__')}`;
}

// 当月と前月（新しい順）。解剖の「当月か前月」用。通算・台帳には使わない（B54: 2 か月窓で古い月が消えていた）
export function monthsToFetch(now) {
  const y = now.getFullYear(), m = now.getMonth(); // m: 0-11
  const cur = `${y}-${String(m + 1).padStart(2, '0')}`;
  const py = m === 0 ? y - 1 : y, pm = m === 0 ? 12 : m;
  return [cur, `${py}-${String(pm).padStart(2, '0')}`];
}

// 起点の月（'YYYY-MM'）から今月まで全部（古い順）。月ファイルを全期間読むときに使う（B54）
export function monthsSince(start, now) {
  let [y, m] = start.split('-').map(Number);
  const endY = now.getFullYear(), endM = now.getMonth() + 1;
  const months = [];
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    if (m === 12) { y += 1; m = 1; } else { m += 1; }
  }
  return months;
}

export function getPat() { return localStorage.getItem('amst_pat') ?? ''; }
export function setPat(v) { localStorage.setItem('amst_pat', v); }

async function fetchGh(path, pat, accept) {
  const res = await fetch(ghUrl(path), {
    headers: { Authorization: `Bearer ${pat}`, Accept: accept },
  });
  if (!res.ok) throw new Error(`GitHub取得失敗: ${path} (${res.status})`);
  return res;
}

// PATがあればGitHubから、なければ sample/ から読む
export async function loadText(path) {
  const pat = getPat();
  if (pat) return (await fetchGh(path, pat, 'application/vnd.github.raw+json')).text();
  const res = await fetch(samplePath(path));
  if (!res.ok) throw new Error(`サンプル取得失敗: ${path} (${res.status})`);
  return res.text();
}

export async function loadJson(path) { return JSON.parse(await loadText(path)); }

// 月ファイル（{prefix}/YYYY-MM.json）をまとめて読む。無い月（404）は missing に入れて飛ばし、
// それ以外の失敗（通信・権限・JSON 破損）は投げる（黙って欠けさせない）。files は months の順
export async function loadMonthly(prefix, months, load = loadJson) {
  const results = await Promise.all(months.map(async month => {
    try { return { month, file: await load(`${prefix}/${month}.json`) }; }
    catch (e) { if (/\(404\)/.test(String(e))) return { month, file: null }; throw e; }
  }));
  return {
    files: results.filter(r => r.file).map(r => r.file),
    missing: results.filter(r => !r.file).map(r => r.month),
  };
}

// daily/ の一覧（GitHubはdir listing、サンプルは daily-index.json）
export async function listDailyDates() {
  const pat = getPat();
  if (pat) {
    const res = await fetchGh('daily', pat, 'application/vnd.github+json');
    const items = await res.json();
    return items
      .map(i => i.name)
      .filter(n => /^\d{4}-\d{2}-\d{2}-jp-morning-deep\.md$/.test(n))
      .map(n => n.slice(0, 10))
      .sort()
      .reverse();
  }
  const res = await fetch('./sample/daily-index.json');
  return res.json();
}

export function dailyPath(date) { return `daily/${date}-jp-morning-deep.md`; }
