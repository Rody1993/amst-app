export function cardViewModel(card) {
  return {
    id: card.id,
    code: card.code,
    name: card.ticker_name ?? card.code,
    catch: card.surface_claim ?? '',
    thesis: card.hidden_thesis ?? '',
    facts: card.facts ?? [],
    killCondition: card.kill_condition ?? '',
    verification: card.verification ?? '',
    entry: card.entry,
    target: card.target,
    stop: card.stop,
    targetPct: card.entry ? Math.round((card.target / card.entry - 1) * 100) : null,
    horizonWeeks: card.horizon_weeks ?? null,
    gate: card.gate ?? 'now',
    track: card.track ?? 'paper',
    reissue: card.reissue_count ?? 0,
    status: card.status ?? 'open',
    closeReason: card.close_reason ?? null,
    date: (card.created_at ?? '').slice(0, 10),
  };
}

export function cardsByDate(cards) {
  const map = new Map();
  for (const raw of cards) {
    const vm = cardViewModel(raw);
    if (!map.has(vm.date)) map.set(vm.date, []);
    map.get(vm.date).push(vm);
  }
  return map;
}

// track=liveのカードだけを残す。paper（観察・ペーパー計測のみ）は推奨として出さない
export function liveCards(cards) {
  return (cards ?? []).filter(c => c.track === 'live');
}

// liveCards の残り（paper＝観察・買わない・計測のみ）。本命と観察で全カードを分け切る
export function observationCards(cards) {
  return (cards ?? []).filter(c => c.track !== 'live');
}

// 通算スコアの分類。target+stop+noFill+open+other === total（other も画面に出す）。
// 不成立は「no_fill」で始まる理由すべて（resolve_cards は分割をまたぐと「no_fill (分割係数0.2換算)」と書く）
export function attackStats(cards) {
  const s = { total: cards.length, open: 0, noFill: 0, stop: 0, target: 0, other: 0 };
  for (const c of cards) {
    if (c.status !== 'closed') s.open += 1;
    else if ((c.close_reason ?? '').startsWith('no_fill')) s.noFill += 1;
    else if ((c.close_reason ?? '').includes('🎯')) s.target += 1;
    else if ((c.close_reason ?? '').includes('🛑')) s.stop += 1;
    else s.other += 1;
  }
  return s;
}

export function aggregateHoldings(transactions) {
  const acc = new Map();
  for (const t of transactions ?? []) {
    const key = t.ticker;
    if (!acc.has(key)) acc.set(key, { ticker: key, name: t.name, qty: 0, cost: 0, assetType: t.asset_type });
    const a = acc.get(key);
    if (t.side === 'buy') { a.qty += t.qty; a.cost += t.price * t.qty; }
    else if (t.side === 'sell') {
      const avg = a.qty > 0 ? a.cost / a.qty : 0;
      a.qty -= t.qty; a.cost -= avg * t.qty;
    }
  }
  return [...acc.values()]
    .filter(a => a.qty > 0.000001)
    .map(a => ({ ticker: a.ticker, name: a.name, qty: a.qty, avgPrice: Math.round(a.cost / a.qty * 100) / 100, assetType: a.assetType }));
}

// holdings_data.json を表示用に加工する純関数。
// 値はfraction/生値のまま返す（%表示や桁丸めはui.js側の責務）
export function enrichHoldings(data) {
  const holdings = (data?.holdings ?? []).map(h => {
    const hasDps = h.dps != null && !Number.isNaN(h.dps);
    const hasClose = h.close != null && !Number.isNaN(h.close);
    const annualDividend = hasDps ? h.qty * h.dps : null;
    const yieldNow = hasDps && hasClose && h.close !== 0 ? h.dps / h.close : null;
    const yieldOnCost = hasDps && h.avg_price ? h.dps / h.avg_price : null;
    const pnlAmount = hasClose ? (h.close - h.avg_price) * h.qty : null;
    const pnlPct = hasClose && h.avg_price ? h.close / h.avg_price - 1 : null;
    const value = hasClose ? h.qty * h.close : null;
    return { ...h, annualDividend, yieldNow, yieldOnCost, pnlAmount, pnlPct, value };
  });
  const totalDividend = holdings.reduce((s, h) => s + (h.annualDividend ?? 0), 0);
  const dividendMissing = holdings.filter(h => h.annualDividend == null).length;
  const totalValue = holdings.reduce((s, h) => s + (h.value ?? 0), 0);
  const totalPnl = holdings.reduce((s, h) => s + (h.pnlAmount ?? 0), 0);
  // manual: 米国株・投信は自動取得できないため手入力データを統合する（v1.2 Fix4）。
  // 無ければ従来どおり日本株の自動計算のみ
  const manual = data?.manual ?? null;
  const totalDividendAll = totalDividend + (manual ? (manual.us_total_jpy ?? 0) + (manual.fund_total_jpy ?? 0) : 0);
  return {
    asOf: data?.as_of ?? null,
    holdings,
    others: data?.others ?? [],
    totalDividend,
    totalDividendAll,
    dividendMissing,
    totalValue,
    totalPnl,
    manual,
  };
}

// 保有データの鮮度（B32）。as_of がこの日数より古ければ ⚠️（毎晩作り直す本体は QW T6）。
// 日付はスマホの暦日（JST）で数える
const HOLDINGS_STALE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
export function holdingsFreshness(asOf, now) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(asOf ?? '');
  if (!m) return { asOf: asOf ?? null, daysOld: null, stale: true };
  const asOfDay = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysOld = Math.round((today - asOfDay) / DAY_MS);
  return { asOf: `${m[1]}-${m[2]}-${m[3]}`, daysOld, stale: daysOld > HOLDINGS_STALE_DAYS };
}

// 保有一覧の並び替え（v1.2 Fix3）。純関数・非破壊（新しい配列を返す）。
// key: code(ticker昇順が既定)/yieldNow/yieldOnCost/annualDividend/pnlPct/value(qty×close)
// dir: asc/desc。値がnullの行は昇順・降順どちらでも常に末尾に置く
const SORT_ACCESSORS = {
  code: h => h.ticker,
  yieldNow: h => h.yieldNow,
  yieldOnCost: h => h.yieldOnCost,
  annualDividend: h => h.annualDividend,
  pnlPct: h => h.pnlPct,
  value: h => h.value,
};

export function sortHoldings(holdings, key, dir = 'asc') {
  const accessor = SORT_ACCESSORS[key] ?? SORT_ACCESSORS.code;
  const sign = dir === 'desc' ? -1 : 1;
  return [...(holdings ?? [])].sort((a, b) => {
    const av = accessor(a);
    const bv = accessor(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1; // nullは常に末尾
    if (bv == null) return -1;
    if (typeof av === 'string' || typeof bv === 'string') {
      return sign * String(av).localeCompare(String(bv));
    }
    return sign * (av - bv);
  });
}

export function sliceSection(md, headingPrefix) {
  const lines = (md ?? '').split('\n');
  const start = lines.findIndex(l => l.startsWith(headingPrefix));
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(l => l.startsWith('## '));
  return rest.slice(0, end === -1 ? rest.length : end).join('\n').trim();
}

// ---- 🛡️ 守り（B30）----
// 夜便の 🛡️ 節は書き方が毎晩違う（現値871円・**太字**・コード先頭・価格先頭…）。
// 銘柄名・利回りを読み取らず、行頭「- 」ごとのまとまりに分けるだけにする（AI の文章は AI のまま）。
// 字下げの説明行（「⚠️なぜ割安か」など）は、前の行がどんな書き方でも必ずそのまとまりに付ける
export function defenseBlocks(text) {
  const blocks = [];
  for (const line of (text ?? '').split('\n')) {
    if (!line.trim()) continue;
    if (line.startsWith('- ')) {
      blocks.push({ head: line.slice(2), body: [] });
    } else {
      if (!blocks.length) blocks.push({ head: '', body: [] }); // 最初の「- 」より前の前置き文
      blocks[blocks.length - 1].body.push(line.trim().replace(/^- /, ''));
    }
  }
  return blocks;
}

// 一覧の見出し用: 行頭「- 」の行の数と、1 行目の先頭 40 字。
// 銘柄の候補でない行は数えない: 「除外: …」「見送り…」と、⚠️ で始まる注意書き（「⚠️ 本日の増配3行…」など）。
// 銘柄名やコードの書き方は毎晩違う（【7949】・**5451ヨドコウ**・ヤマテック/5451 …）ので、そこでは判定しない
const LEAD_CHARS = 40;
const stripLeadMarks = s => s.replace(/^[^\p{L}\p{N}]+/u, ''); // 🆕・⏸・** などの印を外す（判定用）

function isDefenseNoteLine(head) {
  return head.replaceAll('**', '').trimStart().startsWith('⚠') || /^(除外|見送り)/.test(stripLeadMarks(head));
}

// hasText: 🛡️ 節に何か書いてあるか（表だけの日など、数えられなくても本文はある日を見分ける）
export function defenseDigest(text) {
  const blocks = defenseBlocks(text);
  const stocks = blocks.filter(b => b.head && !isDefenseNoteLine(b.head));
  if (!stocks.length) return { count: 0, lead: '', hasText: blocks.length > 0 };
  const chars = [...stocks[0].head.replaceAll('**', '')];
  const lead = chars.length > LEAD_CHARS ? chars.slice(0, LEAD_CHARS).join('') + '…' : chars.join('');
  return { count: stocks.length, lead, hasText: true };
}

const HOLDING_RE = /^- (.+?)\(([0-9A-Za-z]+)\) ¥([\d,]+)\(([+-][\d.]+)%\) → (.+)$/;
export function parseHoldingLines(text) {
  const rows = [];
  for (const line of (text ?? '').split('\n')) {
    const m = line.match(HOLDING_RE);
    if (m) rows.push({ name: m[1], code: m[2], price: parseInt(m[3].replaceAll(',', ''), 10), pnlPct: parseFloat(m[4]), note: m[5] });
    else if (line.startsWith('- ')) rows.push({ raw: line });
  }
  return rows;
}

const EXIT_RE = /^- (.+?)\(([0-9A-Za-z]+)\) \(([+-][\d.]+)%\) (.+)$/;
export function parseExitLines(text) {
  const rows = [];
  for (const line of (text ?? '').split('\n')) {
    const m = line.match(EXIT_RE);
    if (m) rows.push({ name: m[1], code: m[2], pnlPct: parseFloat(m[3]), reason: m[4] });
    else if (line.startsWith('- ')) rows.push({ raw: line });
  }
  return rows;
}

// 日報の攻めの節。「## ⚔️ 攻め…」の直後に「## ⚔️ 本日の仮説カード」が続く日は
// 1 つ目の見出しの中身が空になるため、仮説カードの見出しを優先する（B31）
export function attackSection(md) {
  return sliceSection(md, '## ⚔️ 本日の仮説カード') || sliceSection(md, '## ⚔️');
}

// ⚔️ セクションのテキストから「📖」行（観察枠）を抜く。見出しの # は外して判定する
// （7/6 以降は「### 📖 観察枠…」）。1行目が「観察枠」を含むラベル行の場合のみ label/items を返す（fail-soft）
export function parseObservationLines(attackSectionText) {
  const lines = (attackSectionText ?? '').split('\n')
    .map(l => l.replace(/^#{1,6}\s*/, ''))
    .filter(l => l.startsWith('📖'));
  if (lines.length === 0 || !lines[0].includes('観察枠')) return { label: '', items: [] };
  return { label: lines[0].trim(), items: lines.slice(1).map(l => l.trim()) };
}

// ⚔️ 攻めの日の詳細（B31）。本命も観察もカード JSON（型の決まったデータ）から出す。
// 日報の 📖 行は、その日の観察カードが JSON に無い時だけの予備
export function attackDayModel(cards, md) {
  const observe = observationCards(cards);
  const exitSection = sliceSection(md, '## ⚠️');
  return {
    live: liveCards(cards),
    observe,
    observeLines: observe.length ? [] : parseObservationLines(attackSection(md)).items,
    exits: exitSection ? parseExitLines(exitSection) : null,
    summary: sliceSection(md, '### 攻め分析サマリー'),
  };
}

// ---- 🔬 解剖（attack/autopsy/YYYY-MM.json、B32）----
// 集計の定義は ams_trade/attack/autopsy.py の aggregate(completed_entries(...)) と同じ:
//   skip 記録を除いた件数 n・primary_tag 別の件数（多い順、同数はタグ名順）・n<20 は「参考値」。
// 教訓（lesson）は AI の文のまま
export const AUTOPSY_TAG = {
  hypothesis_wrong: { emoji: '🧠', label: '仮説外れ' },
  catalyst_missed: { emoji: '🎈', label: 'カタリスト不発' },
  verification_gap: { emoji: '🔍', label: '裏取り不足' },
  timing: { emoji: '⏰', label: 'タイミング' },
  size_or_stop: { emoji: '📏', label: 'サイズ・撤退線' },
  execution_gap: { emoji: '🔧', label: '執行差' },
  external_shock: { emoji: '🌪️', label: '外部ショック' },
};
const AUTOPSY_MIN_SIGNIFICANT_N = 20;
const autopsyTag = tag => ({ tag, emoji: AUTOPSY_TAG[tag]?.emoji ?? '❓', label: AUTOPSY_TAG[tag]?.label ?? tag });

export function autopsySummary(file) {
  const entries = (file?.entries ?? []).filter(e => !e.skipped);
  const counts = new Map();
  for (const e of entries) {
    const tag = e.verdict?.primary_tag ?? '';
    if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  const byTag = [...counts]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([tag, count]) => ({ ...autopsyTag(tag), count }));
  const n = entries.length;
  return {
    month: file?.month ?? '',
    n,
    byTag,
    badge: n < AUTOPSY_MIN_SIGNIFICANT_N ? `n=${n}<${AUTOPSY_MIN_SIGNIFICANT_N} 参考値` : `n=${n}`,
    lessons: entries.map(e => ({
      ...autopsyTag(e.verdict?.primary_tag ?? ''),
      name: e.ticker_name || e.code || '',
      code: e.code ?? '',
      returnPct: e.return_pct ?? null,
      lesson: String(e.verdict?.lesson ?? ''),
    })),
  };
}

// ---- 🧪 本命v2（紙PF台帳 attack/v2/ledger/YYYY-MM.json）----
// 純関数。集計の定義は ams_trade/v2/report.py と同じ:
//   双子差 = 決着済みペア（候補 ret − 双子 ret）1組あたりの平均pt、勝率 = 差>0 の割合、
//   独立日 = 決着済みペアのコホート日の異なり数（同じ日に入った N 銘柄は N 回の独立した試行ではない）
export const V2_SOURCE_LABEL = { dividend_up_value: '増配型', state_value_income: '状態型' };
const V2_STATUS_LABEL = { pending: '待ち', open: '保有', closed: '決着' };
const round1 = v => v == null ? null : Math.round(v * 10) / 10;

function v2Stats(diffs, days) {
  const n = diffs.length;
  return {
    pairsClosed: n,
    twinDiffMean: n ? round1(diffs.reduce((s, d) => s + d, 0) / n) : null,
    twinDiffSum: n ? round1(diffs.reduce((s, d) => s + d, 0)) : null,
    twinWinRate: n ? Math.round(diffs.filter(d => d > 0).length / n * 100) : null,
    independentDays: days.size,
  };
}

function v2Pairs(ledgers) {
  const rows = (ledgers ?? []).flatMap(l => l?.rows ?? []);
  const twins = new Map(rows.filter(r => r.kind === 'twin').map(r => [`${r.cohort_date}|${r.twin_of}`, r]));
  return rows.filter(r => r.kind === 'candidate').map(c => ({ c, t: twins.get(`${c.cohort_date}|${c.code}`) ?? null }));
}

export function v2Summary(ledgers) {
  const pairs = v2Pairs(ledgers);
  const s = { pending: 0, open: 0, closed: 0, bySource: {} };
  const diffsBy = {}, daysBy = {};
  for (const { c, t } of pairs) {
    if (c.status in s) s[c.status] += 1;
    if (!(c.source in diffsBy)) { diffsBy[c.source] = []; daysBy[c.source] = new Set(); }
    if (c.status === 'closed' && t && t.status === 'closed' && c.ret_pct != null && t.ret_pct != null) {
      diffsBy[c.source].push(c.ret_pct - t.ret_pct);
      daysBy[c.source].add(c.cohort_date);
    }
  }
  for (const src of Object.keys(V2_SOURCE_LABEL)) {
    if (src in diffsBy) s.bySource[src] = v2Stats(diffsBy[src], daysBy[src]);
  }
  return s;
}

export function v2Groups(ledgers) {
  const byDate = new Map();
  for (const { c, t } of v2Pairs(ledgers)) {
    const row = {
      code: c.code, name: c.name ?? '', source: c.source, sourceLabel: V2_SOURCE_LABEL[c.source] ?? c.source,
      pbr: c.pbr ?? null, divChangePct: c.div_change_pct ?? null, yieldPct: c.yield_pct ?? null, roePct: c.roe_pct ?? null,
      status: c.status, statusLabel: V2_STATUS_LABEL[c.status] ?? c.status,
      entryDate: c.entry_date ?? null, entryPrice: c.entry_price ?? null,
      exitDate: c.exit_date ?? null, exitPrice: c.exit_price ?? null, exitReason: c.exit_reason ?? null,
      retPct: c.ret_pct ?? null, controlRetPct: c.control_ret_pct ?? null, excessPct: c.excess_pct ?? null,
      twinCode: t?.code ?? null, twinStatus: t?.status ?? null, twinRetPct: t?.ret_pct ?? null,
      diffPt: (c.ret_pct != null && t?.ret_pct != null) ? round1(c.ret_pct - t.ret_pct) : null,
    };
    if (!byDate.has(c.cohort_date)) byDate.set(c.cohort_date, []);
    byDate.get(c.cohort_date).push(row);
  }
  return [...byDate.keys()].sort().reverse().map(date => {
    const rows = byDate.get(date);
    return {
      date, rows,
      event: rows.filter(r => r.source === 'dividend_up_value').length,
      state: rows.filter(r => r.source === 'state_value_income').length,
    };
  });
}
