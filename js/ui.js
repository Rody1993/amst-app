// js/ui.js — HTML文字列を組み立てる純関数だけを置く（DOM操作はmain.js）
export function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
const yen = n => n == null ? '—' : '¥' + Number(n).toLocaleString('ja-JP');
const pctS = v => v == null ? '—' : (v >= 0 ? '+' : '') + Number(v).toFixed(1) + '%';
const md = d => `${parseInt(d.slice(5, 7), 10)}/${parseInt(d.slice(8, 10), 10)}`;
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const wd = d => WD[new Date(d + 'T00:00:00+09:00').getDay()];

export function listItemHtml({ date, count, unread, extra, label }) {
  const digestLabel = label ? escapeHtml(label) : `推奨${count}件`;
  return `<div class="mailrow${unread ? ' unread' : ''}" data-date="${date}">
    <span class="date">${md(date)}<small>${wd(date)}</small></span>
    <span class="digest"><b>${digestLabel}</b>${extra ? '（' + escapeHtml(extra) + '）' : ''}</span>
    <span class="chev">›</span></div>`;
}

const VERIFY_LABEL = {
  unpriced: '⏳ 裏取り済み・株価は未反映',
  partial: '🟡 部分的に確認',
  confirmed: '✅ 一次情報で確認済み',
};

export function cardHtml(vm) {
  const tags = [];
  if (vm.track && vm.track !== 'live') tags.push('<span class="badge-new">観察</span>');
  if (vm.gate === 'pullback') tags.push('<span class="badge-new">指値待ち</span>');
  if (vm.reissue > 0) tags.push('<span class="badge-new">継続</span>');
  if (vm.status === 'closed') tags.push('<span class="badge-new">決着済み</span>');
  const facts = (vm.facts ?? []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  const verifyText = vm.verification ? (VERIFY_LABEL[vm.verification] ?? escapeHtml(vm.verification)) : '';
  return `<div class="stockcard" data-card="${escapeHtml(vm.id)}">
    <div class="head" onclick="this.parentElement.classList.toggle('open')">
      <div class="tickerline">${tags.join('')}
        <span class="tickername">${escapeHtml(vm.name)}</span>
        <span class="tickercode">${escapeHtml(vm.code)}</span></div>
      <p class="catch">${escapeHtml(vm.catch)}</p>
      <div class="ifdoco">
        <span class="pricechip">指値 ${yen(vm.entry)}</span>
        <span class="pricechip target">目標 ${yen(vm.target)}${vm.targetPct != null ? ` (+${vm.targetPct}%)` : ''}</span>
        <span class="pricechip stop">撤退 ${yen(vm.stop)}</span>
        <span class="pricechip">期限 ${vm.horizonWeeks ?? '—'}週</span></div></div>
    <div class="detail">
      <h4>根拠</h4><p>${escapeHtml(vm.thesis)}</p>
      ${(verifyText || facts) ? `<h4>裏取り</h4>${verifyText ? `<p class="verify">${verifyText}</p>` : ''}${facts ? `<ul class="facts">${facts}</ul>` : ''}` : ''}
      <h4>撤回条件</h4><p class="skull">${escapeHtml(vm.killCondition)}</p></div>
    <div class="openbtn" onclick="this.parentElement.classList.toggle('open')"><span>根拠を読む</span><span class="arrow">▾</span></div>
  </div>`;
}

// AI の文章を 1 行そのまま見せる。エスケープした上で Markdown の太字 **…** だけ <b> にする
const inlineText = s => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

// 🛡️ 守りの日の詳細（B30）: defenseBlocks のまとまりを、文章を変えずに並べる
export function defenseDayHtml(blocks) {
  const rows = (blocks ?? []).map(b =>
    `<div class="shieldrow">${b.head ? `<div class="sr-line">${inlineText(b.head)}</div>` : ''}` +
    `${b.body.length ? `<p>${b.body.map(inlineText).join('\n')}</p>` : ''}</div>`).join('');
  return `<div class="panel"><h3>🛡️ 今日、高配当に移すならこの株</h3>${rows || '<p class="subnote">この日の守りの節はありません</p>'}</div>`;
}

// 守り一覧の 1 行（B30）。digest が無い日（最新以外）は件数を出さない。
// 数えられない日は「0銘柄」と言わない（表だけの日もある）。節が空なら空と言う
export function defenseListItemHtml({ date, unread, digest }) {
  const row = (label, extra = '') => listItemHtml({ date, count: 0, unread, label, extra });
  if (!digest) return row('守り銘柄');
  if (!digest.hasText) return row('守りの節なし');
  if (!digest.count) return row('守り（件数は本文で）');
  return row(`守り${digest.count}銘柄`, `首位: ${digest.lead}`);
}

// ⚔️ 攻め一覧の 1 行（B31）: 本命（live）と観察（paper）の枚数
export function attackListItemHtml({ date, unread, live, observe }) {
  return listItemHtml({ date, count: live, unread, label: `本命${live}・観察${observe}`, extra: '' });
}

// ⚔️ 攻めの日の詳細（B31）: attackDayModel を並べるだけ
export function attackDayHtml(m) {
  let body = m.live.map(cardHtml).join('') ||
    '<div class="panel"><p class="subnote">この日の本命カード（買い推奨）はありません</p></div>';
  if (m.observe.length) {
    body += `<div class="weekband">📖 観察（買わない・計測のみ）</div>${m.observe.map(cardHtml).join('')}`;
  } else if (m.observeLines.length) {
    body += `<div class="panel"><h3>📖 観察（買わない・計測のみ・日報から）</h3>` +
      `${m.observeLines.map(i => `<div class="obsrow">${escapeHtml(i)}</div>`).join('')}</div>`;
  }
  if (m.exits) {
    body += `<div class="panel"><h3>⚠️ EXIT推奨</h3>${m.exits.map(exitCardHtml).join('') || '<p class="subnote">なし</p>'}</div>`;
  }
  if (m.summary) body += `<div class="panel"><h3>📊 攻め分析サマリー</h3><p class="subnote pre">${escapeHtml(m.summary)}</p></div>`;
  return body;
}

export function holdingRowHtml(r) {
  if (r.raw) return `<div class="holdrow"><span>${escapeHtml(r.raw)}</span><span></span><span></span></div>`;
  const cls = (r.pnlPct ?? 0) >= 0 ? 'up' : 'down';
  const sign = (r.pnlPct ?? 0) >= 0 ? '+' : '';
  return `<div class="holdrow"><span>${escapeHtml(r.name)} ${escapeHtml(r.code)}</span>
    <span>${r.avgPrice != null ? Number(r.avgPrice).toLocaleString('ja-JP') : '—'} → ${Number(r.price).toLocaleString('ja-JP')}</span>
    <span class="${cls}">${sign}${r.pnlPct}%</span></div>`;
}

export function exitCardHtml(r) {
  if (r.raw) return `<div class="exitcard">${escapeHtml(r.raw)}</div>`;
  return `<div class="exitcard"><span class="who">${escapeHtml(r.name)} ${escapeHtml(r.code)}</span>（${r.pnlPct >= 0 ? '+' : ''}${r.pnlPct}%）${escapeHtml(r.reason)}</div>`;
}

// 保有タブ: 数値データの表とツリーマップ（v1.1 Fix4）
const pct1 = v => v == null ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
const yenSigned = n => n == null ? '—' : (n >= 0 ? '+¥' : '-¥') + Math.abs(n).toLocaleString('ja-JP');
const qtyStr = n => n == null ? '—' : Number(n).toLocaleString('ja-JP');

// ソート可能な列見出し（v1.2 Fix3）。sortHoldingsのkey語彙と対応する列のみdata-sort-keyを持つ
const SORT_ARROW = { asc: ' ▲', desc: ' ▼' };
function sortTh(key, label, sortKey, sortDir) {
  const arrow = key === sortKey ? (SORT_ARROW[sortDir] ?? SORT_ARROW.asc) : '';
  return `<th data-sort-key="${key}" class="sortable">${escapeHtml(label)}${arrow}</th>`;
}

export function holdingsTableHtml(enriched, sortKey = 'code', sortDir = 'asc') {
  const rows = (enriched?.holdings ?? []).map(h => {
    const cls = h.pnlPct == null ? '' : (h.pnlPct >= 0 ? 'up' : 'down');
    const pnlCell = h.pnlAmount == null ? '—' : `${yenSigned(h.pnlAmount)} (${pct1(h.pnlPct)})`;
    return `<tr>
      <td>${escapeHtml(h.name)}<br><small>${escapeHtml(h.ticker)}</small></td>
      <td>${qtyStr(h.qty)}</td>
      <td>${yen(h.avg_price)}</td>
      <td>${yen(h.close)}</td>
      <td>${pct1(h.yieldNow)}</td>
      <td>${pct1(h.yieldOnCost)}</td>
      <td>${h.annualDividend == null ? '—' : yen(h.annualDividend)}</td>
      <td class="${cls}">${pnlCell}</td>
    </tr>`;
  }).join('');
  return `<div class="tablewrap" style="overflow-x:auto">
    <table class="holdtable" style="min-width:640px;">
      <thead><tr>
        ${sortTh('code', '銘柄', sortKey, sortDir)}<th>株数</th><th>取得単価</th><th>現在値</th>
        ${sortTh('yieldNow', '利回り(現在)', sortKey, sortDir)}${sortTh('yieldOnCost', 'YoC', sortKey, sortDir)}${sortTh('annualDividend', '年間配当', sortKey, sortDir)}${sortTh('pnlPct', '含み損益', sortKey, sortDir)}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function tmClass(h) {
  if (h.close == null || h.pnlPct == null) return 'flat';
  if (h.pnlPct > 0.5) return 'up2';
  if (h.pnlPct > 0) return 'up1';
  return 'down1';
}

export function treemapHtml(enriched) {
  const list = (enriched?.holdings ?? []).slice().sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const items = list.slice(0, 8).map(h => ({ name: h.name, value: h.value ?? 0, cls: tmClass(h) }));
  const rest = list.slice(8);
  if (rest.length) {
    items.push({ name: 'その他', value: rest.reduce((s, h) => s + (h.value ?? 0), 0), cls: 'flat' });
  }
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const boxes = items.map(i => {
    const pct = Math.round(i.value / total * 100);
    const flex = i.value > 0 ? i.value : 0.0001;
    return `<div class="tm ${i.cls}" style="flex:${flex};">${escapeHtml(i.name)}<small>${pct}%</small></div>`;
  });
  const half = Math.ceil(boxes.length / 2);
  const row1 = boxes.slice(0, half).join('');
  const row2 = boxes.slice(half).join('');
  return `<div class="treemap">
    <div class="tmrow" style="height:92px;">${row1}</div>
    ${row2 ? `<div class="tmrow" style="height:64px;">${row2}</div>` : ''}
  </div>`;
}

// 🧠 学習タブ（B32）。sample は ./sample/learning.json（8/14 の手書きの固定値）。
// 実データ（PAT）では固定値のタイルを出さず、固定の文は「見本」の見出しで折りたたむ
const sampleAsOfLabel = d => d ? `${md(d)} 時点・` : '';
// stats は attackStats、since は通算の起点の月、missingMonths は読めなかった過去の月（今月を除く）
export function learningHtml({ stats, since, sample, isDemo, autopsy, autopsyError, missingMonths }) {
  const { rules, prophecies, extraStats } = sample ?? {};
  const rulesHtml = (rules ?? []).map(r =>
    `<div class="rulerow"><b>${escapeHtml(r.title)}</b><span class="rulemeta">${escapeHtml(r.meta)}</span></div>`).join('');
  const prophHtml = (prophecies ?? []).map(p => `<div class="prophecy">${escapeHtml(p)}</div>`).join('');
  const statsHtml = (extraStats ?? []).map(s =>
    `<div class="stat"><div class="label">${escapeHtml(s.label)}</div><div class="value ${escapeHtml(s.cls ?? '')}">${escapeHtml(s.value)}</div></div>`).join('');
  let autopsyPanel = '';
  if (autopsyError) autopsyPanel = `<div class="panel"><h3>🔬 今月の解剖</h3><p class="subnote">解剖データの読み込みに失敗しました: ${escapeHtml(autopsyError)}</p></div>`;
  else if (autopsy?.n) autopsyPanel = autopsyHtml(autopsy);
  const breakdown = `不成立${stats.noFill}・進行中${stats.open}` + (stats.other > 0 ? `・その他${stats.other}` : '');
  const missingHtml = (missingMonths ?? []).length
    ? `<p class="subnote">⚠️ ${escapeHtml(missingMonths.join('・'))} のカードが読めませんでした（通算から抜けています）</p>` : '';
  return `<div class="panel"><h3>通算スコア（${since ? `${escapeHtml(since)}〜・` : ''}観察込み）</h3>
      <div class="bignum">${stats.target}勝${stats.stop}敗</div>
      <p class="subnote">${breakdown}</p>${missingHtml}</div>
    ${isDemo && statsHtml ? `<div class="statgrid">${statsHtml}</div>` : ''}
    ${autopsyPanel}
    <div class="panel"><h3>🔮 秋の予言（ブクマ ${(prophecies ?? []).length} 仮説）</h3>
      <p class="subnote">判定方法を見直し中（オーナー判断待ち）</p>${prophHtml}</div>
    <details class="panel samplefold"><summary>見本（${sampleAsOfLabel(sample?.as_of)}固定。実データ化は今後）</summary>
      <h4>🔬 解剖（見本）</h4><p class="subnote">${escapeHtml(sample?.autopsy)}</p>
      <h4>📜 ルール台帳（見本）</h4>${rulesHtml}</details>`;
}

// 🔬 解剖の実データ（attack/autopsy の当月か前月）。内訳は Python の 💀集計 と同じ並び、教訓は AI の文のまま
export function autopsyHtml(a) {
  const tags = a.byTag.map(t => `${t.emoji}${t.label}×${t.count}`).join(' / ');
  const rows = a.lessons.map(l =>
    `<div class="lessonrow"><b>${escapeHtml(`${l.emoji}${l.label} ${l.name}(${l.code})${l.returnPct != null ? ` ${pctS(l.returnPct)}` : ''}`)}</b>` +
    `<p>${escapeHtml(l.lesson)}</p></div>`).join('');
  return `<div class="panel"><h3>🔬 今月の解剖（${escapeHtml(a.month)}）</h3>
    <p class="subnote">${escapeHtml(`${tags}（${a.badge}）`)}</p>
    <details class="lessons"><summary>教訓を読む（${a.n} 件・AI の文のまま）</summary>${rows}</details></div>`;
}

// 💼 保有タブの先頭（B32）: 「{as_of} 時点」を大きく。古ければ ⚠️ の帯
export function holdingsAsOfHtml(f) {
  if (!f.asOf) return '<div class="panel"><div class="warnband">⚠️ 保有データの日付（as_of）がありません</div></div>';
  const warn = f.stale ? `<div class="warnband">⚠️ 保有データが ${escapeHtml(f.asOf)} から更新されていません（${f.daysOld} 日前）</div>` : '';
  return `<div class="panel"><div class="asofbig">${escapeHtml(f.asOf)} 時点</div>${warn}</div>`;
}

// ---- 🧪 本命v2 タブ ----
const pt1 = v => v == null ? '—' : (v >= 0 ? '+' : '') + Number(v).toFixed(1) + 'pt';
const V2_SRC_ORDER = [['dividend_up_value', '増配型'], ['state_value_income', '状態型']];

export function v2SummaryHtml(s) {
  const stats = V2_SRC_ORDER.filter(([src]) => s.bySource[src]).map(([src, label]) => {
    const b = s.bySource[src];
    if (!b.pairsClosed) {
      return `<div class="stat"><div class="label">${label} 双子差</div><div class="value">未決着</div><div class="label">決着した組がまだありません</div></div>`;
    }
    const cls = b.twinDiffMean > 0 ? 'up' : (b.twinDiffMean < 0 ? 'down' : '');
    return `<div class="stat"><div class="label">${label} 双子差（平均）</div><div class="value ${cls}">${pt1(b.twinDiffMean)}</div>` +
      `<div class="label">勝率${b.twinWinRate}%・${b.pairsClosed}組/独立日${b.independentDays}・累計${pt1(b.twinDiffSum)}</div></div>`;
  }).join('');
  return `<div class="panel"><h3>🧪 本命v2（紙PF・機械抽出・AIは選ばない）</h3>
    <p class="subnote">増配×PBR1倍以下（金曜は割安×高配当×ROEの状態型も）を機械で拾い、同じ体格の双子と60営業日で比べる実験。買い推奨ではありません</p>
    <p class="subnote">待ち${s.pending}・保有${s.open}・決着${s.closed}</p></div>
    ${stats ? `<div class="statgrid">${stats}</div>` : '<div class="panel"><p class="subnote">まだ候補がありません</p></div>'}`;
}

function v2RowHtml(r) {
  const meta = [];
  if (r.pbr != null) meta.push(`PBR${Number(r.pbr).toFixed(2)}`);
  if (r.divChangePct != null) meta.push(`増配${pctS(r.divChangePct)}`);
  if (r.yieldPct != null) meta.push(`利回り${Number(r.yieldPct).toFixed(1)}%`);
  if (r.roePct != null) meta.push(`ROE${Number(r.roePct).toFixed(1)}%`);
  let sub;
  if (r.status === 'pending') sub = '翌営業日の寄値で約定予定';
  else {
    const entry = `約定 ${md(r.entryDate)} ${yen(r.entryPrice)}`;
    if (r.status === 'open') sub = `${entry} → 保有中（60営業日で決着）`;
    else sub = `${entry} → 決着 ${md(r.exitDate)} ${yen(r.exitPrice)} ｜ 候補 ${pctS(r.retPct)} / 双子 ${pctS(r.twinRetPct)} / 対照 ${pctS(r.controlRetPct)} → 双子差 <b>${pt1(r.diffPt)}</b>`;
  }
  const twin = r.twinCode ? `<span class="v2twin">双子 ${escapeHtml(r.twinCode)}</span>` : '<span class="v2twin">双子なし</span>';
  return `<div class="v2row">
    <div class="v2main"><span class="v2status s-${escapeHtml(r.status)}">${escapeHtml(r.statusLabel)}</span>
      <b>${escapeHtml(r.code)}</b>${r.name ? ` <span class="tickercode">${escapeHtml(r.name)}</span>` : ''}
      <span class="v2src">${escapeHtml(r.sourceLabel)}</span>${twin}</div>
    <div class="v2meta">${escapeHtml(meta.join('・'))}</div>
    <div class="v2sub">${sub}</div></div>`;
}

export function v2GroupHtml(g, open) {
  const parts = [];
  if (g.event) parts.push(`増配${g.event}`);
  if (g.state) parts.push(`状態型${g.state}`);
  return `<div class="v2group${open ? ' open' : ''}" data-date="${g.date}">
    <div class="v2head"><span class="date">${md(g.date)}<small>${wd(g.date)}</small></span>
      <span class="digest"><b>${parts.join('・') || '候補0'}</b></span><span class="arrow">▾</span></div>
    <div class="v2rows">${g.rows.map(v2RowHtml).join('')}</div></div>`;
}
