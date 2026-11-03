// js/main.js — 配線層。データ取得→パース→描画の順に呼ぶだけにする
import { cardsByDate, liveCards, observationCards, attackStats, attackDayModel, autopsySummary, holdingsFreshness, enrichHoldings, sortHoldings, sliceSection, defenseBlocks, defenseDigest, v2Summary, v2Groups } from './data.js';
import { loadJson, loadText, loadMonthly, listDailyDates, dailyPath, monthsToFetch, monthsSince, getPat, setPat } from './gh.js';
import { attackListItemHtml, attackDayHtml, defenseDayHtml, defenseListItemHtml, learningHtml, holdingsAsOfHtml, holdingsTableHtml, treemapHtml, escapeHtml, v2SummaryHtml, v2GroupHtml } from './ui.js';

// 月ファイルの起点（B54）。ここから今月まで全部読む（2 か月窓だと 7 月の 🎯 や 9 月の v2 台帳が消えていた）
const CARDS_SINCE = '2026-07';  // attack/cards/YYYY-MM.json の最初の月＝通算スコアの起点
const V2_SINCE = '2026-09';     // attack/v2/ledger/YYYY-MM.json の最初の月

const $ = id => document.getElementById(id);
const state = { cardsByDate: new Map(), dailyDates: [], enrichedHoldings: null, sortKey: 'code', sortDir: 'asc' };

// v1.2 Fix1: タブ再タップ/切替時は必ず一覧に戻す（開封ビューを開いたまま置き去りにしない）
window.setTab = function (name) {
  for (const t of ['attack', 'defense', 'learning', 'holdings', 'v2']) {
    $('tab-' + t).classList.toggle('on', t === name);
    $('tb-' + t).classList.toggle('on', t === name);
  }
  closeDay('attack');
  closeDay('defense');
};
window.openDay = async function (kind, date) {
  $(kind + '-list').style.display = 'none';
  const view = $(kind + '-day');
  view.style.display = 'block';
  view.innerHTML = `<span class="backbtn" onclick="closeDay('${kind}')">‹ 一覧へ</span><p class="subnote">読み込み中…</p>`;
  try {
    const mdText = await loadText(dailyPath(date));
    let body = '';
    if (kind === 'attack') {
      body = attackDayHtml(attackDayModel(state.cardsByDate.get(date) ?? [], mdText));
    } else {
      body = defenseDayHtml(defenseBlocks(sliceSection(mdText, '## 🛡️')));
    }
    view.innerHTML = `<span class="backbtn" onclick="closeDay('${kind}')">‹ 一覧へ</span>` + body;
  } catch (e) {
    view.innerHTML = `<span class="backbtn" onclick="closeDay('${kind}')">‹ 一覧へ</span><div class="panel"><p class="subnote">読み込みに失敗しました: ${escapeHtml(e.message)}</p></div>`;
  }
};
window.closeDay = function (kind) {
  $(kind + '-day').style.display = 'none';
  $(kind + '-list').style.display = 'block';
};
window.savePat = function () {
  setPat($('pat-input').value.trim());
  location.reload();
};

// 保有タブ: holdings_data.json（数値データ）を描画する。未生成なら fail-soft 表示
async function renderHoldings() {
  try {
    const data = await loadJson('holdings_data.json');
    const enriched = enrichHoldings(data);
    state.enrichedHoldings = enriched;
    const manYenAll = (enriched.totalDividendAll / 10000).toFixed(1);
    const missingNote = enriched.dividendMissing > 0 ? `dps未取得${enriched.dividendMissing}銘柄を除く` : '';
    // v1.2 Fix4: 米国株・投信は手入力（manual）データがあれば内訳として合算表示する
    let breakdownHtml = '';
    if (enriched.manual) {
      const jpYen = (enriched.totalDividend / 10000).toFixed(1);
      const usYen = ((enriched.manual.us_total_jpy ?? 0) / 10000).toFixed(1);
      const fundYen = ((enriched.manual.fund_total_jpy ?? 0) / 10000).toFixed(1);
      const manualAsOfNote = enriched.manual.as_of ? `（手入力 as_of ${escapeHtml(enriched.manual.as_of)}）` : '';
      breakdownHtml = `<p class="subnote">日本株 ${jpYen}万（自動計算）・米国株 ${usYen}万（手入力）・投信 ${fundYen}万（手入力）${manualAsOfNote}</p>`;
    }
    const othersHtml = (enriched.others ?? []).map(o =>
      `<div class="holdrow"><span>${escapeHtml(o.name)} ${escapeHtml(o.ticker)}</span>` +
      `<span>${o.qty != null ? Number(o.qty).toLocaleString('ja-JP') : '—'}株 @ ${o.avg_price != null ? Number(o.avg_price).toLocaleString('ja-JP') : '—'}</span>` +
      `<span></span></div>`
    ).join('') || '<p class="subnote">なし</p>';
    // B32: 「{as_of} 時点」を先頭に大きく。古ければ ⚠️（8/15 で止まっていたのに小さな注記だけだった）
    $('holdings').innerHTML = holdingsAsOfHtml(holdingsFreshness(enriched.asOf, new Date())) +
      `<div class="panel"><h3>💰 年間配当（見込・税引前・合計）</h3><div class="bignum">${manYenAll}<span class="unit">万円/年</span></div>
         ${breakdownHtml}
         ${missingNote ? `<p class="subnote">${escapeHtml(missingNote)}</p>` : ''}</div>
       <div class="panel"><h3>ポートフォリオ構成</h3>${treemapHtml(enriched)}</div>
       <div class="panel"><h3>保有一覧</h3><div id="holdings-table"></div></div>
       <div class="panel"><h3>その他（投信・米国株）</h3>${othersHtml}</div>`;
    renderHoldingsTable();
  } catch (e) {
    // 404 だけが「未生成」。それ以外（通信・権限・JSON 破損）は理由をそのまま見せる
    $('holdings').innerHTML = /\(404\)/.test(String(e))
      ? '<div class="panel"><p class="subnote">保有データ未生成（export_holdings_data.py を実行してください）</p></div>'
      : `<div class="panel"><p class="subnote">保有データの読み込みに失敗しました: ${escapeHtml(e.message)}</p></div>`;
  }
}

// 保有一覧テーブルだけを再描画する（v1.2 Fix3: ヘッダクリックでのソート再描画用）。
// イベントは再描画のたびに付け直す
function renderHoldingsTable() {
  if (!state.enrichedHoldings) return;
  const sorted = { ...state.enrichedHoldings, holdings: sortHoldings(state.enrichedHoldings.holdings, state.sortKey, state.sortDir) };
  $('holdings-table').innerHTML = holdingsTableHtml(sorted, state.sortKey, state.sortDir);
  for (const th of $('holdings-table').querySelectorAll('[data-sort-key]')) {
    th.onclick = () => {
      const key = th.dataset.sortKey;
      state.sortDir = state.sortKey === key ? (state.sortDir === 'asc' ? 'desc' : 'asc') : 'asc';
      state.sortKey = key;
      renderHoldingsTable();
    };
  }
}

// 🧪 実験タブ: 本命v2 紙PF台帳（attack/v2/ledger/YYYY-MM.json、V2_SINCE から今月まで）。無い月は 404 を許容、
// 台帳が1つも無ければ fail-soft の案内文。日付グループはタップで開閉（最新の少数コホートだけ開く）
async function renderV2() {
  try {
    const { files: ledgers } = await loadMonthly('attack/v2/ledger', monthsSince(V2_SINCE, new Date()));
    if (!ledgers.length) {
      $('v2').innerHTML = '<div class="panel"><h3>🧪 本命v2（紙PF）</h3><p class="subnote">台帳がまだありません。平日21:00の便で候補が出た日から始まります</p></div>';
      return;
    }
    const groups = v2Groups(ledgers);
    const list = groups.map((g, i) => v2GroupHtml(g, i === 0 && g.rows.length <= 12)).join('')
      || '<p class="subnote">候補なし</p>';
    $('v2').innerHTML = v2SummaryHtml(v2Summary(ledgers)) +
      `<div class="panel"><h3>コホート（日付をタップで開閉）</h3>${list}</div>`;
    for (const h of $('v2').querySelectorAll('.v2head')) h.onclick = () => h.parentElement.classList.toggle('open');
  } catch (e) {
    $('v2').innerHTML = `<div class="panel"><p class="subnote">実験データの読み込みに失敗しました: ${escapeHtml(e.message)}</p></div>`;
  }
}

// 🔬 解剖: 当月→前月の順に読み、解剖済みの行がある最初の月を出す。無い月（404）は飛ばす
async function loadAutopsy() {
  for (const m of monthsToFetch(new Date())) {
    try {
      const summary = autopsySummary(await loadJson(`attack/autopsy/${m}.json`));
      if (summary.n) return summary;
    } catch (e) { if (!/\(404\)/.test(String(e))) throw e; }
  }
  return null;
}

async function renderLearning(statsAll, missingMonths) {
  const sample = await (await fetch('./sample/learning.json')).json();
  let autopsy = null, autopsyError = '';
  try { autopsy = await loadAutopsy(); } catch (e) { autopsyError = e.message; }
  $('learning').innerHTML = learningHtml({ stats: statsAll, since: CARDS_SINCE, sample, isDemo: !getPat(), autopsy, autopsyError, missingMonths });
}

async function boot() {
  const months = monthsSince(CARDS_SINCE, new Date());
  const { files, missing } = await loadMonthly('attack/cards', months);
  const thisMonth = months[months.length - 1];
  const missingPast = missing.filter(m => m !== thisMonth); // 今月のファイルが無いのは月初の正常（カード発行前）
  let all = files.flatMap(f => f.cards ?? []);
  const statsAll = attackStats(all); // 通算は却下カード・観察（paper）込みの全数（ごまかしなし）
  all = all.filter(c => c.gate !== 'reject'); // 一覧・開封表示は却下カードを出さない
  state.cardsByDate = cardsByDate(all);
  state.dailyDates = await listDailyDates();

  const dates = state.dailyDates.slice(0, 14);
  const latestMd = await loadText(dailyPath(state.dailyDates[0]));
  const defDigest = defenseDigest(sliceSection(latestMd, '## 🛡️'));

  $('attack-list').innerHTML = dates.map((d, i) => {
    const day = state.cardsByDate.get(d) ?? [];
    return attackListItemHtml({ date: d, unread: i === 0, live: liveCards(day).length, observe: observationCards(day).length });
  }).join('');
  $('defense-list').innerHTML = dates.map((d, i) =>
    defenseListItemHtml({ date: d, unread: i === 0, digest: i === 0 ? defDigest : null })).join('');
  for (const el of $('attack-list').querySelectorAll('.mailrow')) el.onclick = () => openDay('attack', el.dataset.date);
  for (const el of $('defense-list').querySelectorAll('.mailrow')) el.onclick = () => openDay('defense', el.dataset.date);

  await renderLearning(statsAll, missingPast);

  await renderHoldings();
  await renderV2();

  if (!getPat()) $('mode-note').textContent = 'デモモード（sampleデータ）— ⚙からPATを設定すると実データ';
}
boot().catch(e => {
  $('attack-list').innerHTML = `<div class="panel"><p class="subnote">読み込みに失敗しました: ${escapeHtml(e.message)}。⚙からPATを確認してください</p></div>`;
  $('mode-note').textContent = '接続エラー';
});
