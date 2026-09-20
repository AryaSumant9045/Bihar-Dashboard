/* ============================================================
   WAR ROOM MODULE — live NewsDashboard records via Supabase
   ============================================================ */

'use strict';

const WR_LEVEL_CONFIG = {
  critical: { color: 'var(--red)', dim: 'var(--red-dim)', label: '🔴 CRITICAL' },
  developing: { color: 'var(--amber)', dim: 'var(--amber-dim)', label: '🟠 DEVELOPING' },
  watch: { color: 'var(--gold)', dim: 'var(--gold-dim)', label: '🟡 WATCH' },
  routine: { color: 'var(--green)', dim: 'var(--green-dim)', label: '🟢 ROUTINE' }
};

let wrCurrentLevel = 'all';
let wrCurrentCategory = 'all';
let wrCurrentDistrict = 'all';
let wrAllNews = [];
let wrDisplayedNews = [];
let wrClient = null;
let wrChannel = null;
let wrThreatChart = null;
let wrCategoryChart = null;
let wrNewsVisibleCount = 4;
let wrYoutubeVisibleCount = 1;
let wrYoutubeVideoCounts = {};
let wrRssItems = [];
let wrRssExpanded = false;
let wrRssSourceName = 'Bihar News';
let wrRssPanelId = 'wr-rss-panel';
let wrRssSource = '';
let wrYoutubeExpanded = {};
let wrActionState = {};
let wrGeminiRunning = false;

const WR_ACTION_LABELS = { new: 'New', review: 'Review', assigned: 'Assigned', report: 'Report requested', monitor: 'Monitor', closed: 'Closed' };
const WR_ACTION_LABELS_HI = { new: 'नया', review: 'समीक्षा', assigned: 'सौंपा गया', report: 'रिपोर्ट अनुरोधित', monitor: 'मॉनिटर', closed: 'बंद' };

function wrEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
}

function wrTimeAgo(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const [unit, size] = Math.abs(seconds) < 60 ? ['second', 1] : Math.abs(seconds) < 3600 ? ['minute', 60] : Math.abs(seconds) < 86400 ? ['hour', 3600] : ['day', 86400];
  const locale = wrIsHi() ? 'hi-IN-u-nu-latn' : 'en';
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(Math.round(seconds / size), unit);
}

function wrCategory(item) {
  const text = `${item.title || ''} ${item.content || ''}`.toLowerCase();
  if (/flood|disaster|rainfall|relief/.test(text)) return 'Flood & Disaster';
  if (/opposition|rjd|congress|mahagathbandhan|cpi/.test(text)) return 'Opposition';
  if (/media|viral|social media|twitter|video/.test(text)) return 'Media';
  if (/economy|employment|job|industry|investment/.test(text)) return 'Economy';
  if (/crime|arrest|violence|attack|court|police/.test(text)) return 'Law & Order';
  return 'Political';
}

function wrLevel(item) {
  const configured = String([item.severity, item.priority, item.status, item.risk_level].find(Boolean) || '').toLowerCase();
  if (configured === 'critical' || configured === 'high') return 'critical';
  if (configured === 'developing' || configured === 'medium') return 'developing';
  if (configured === 'watch' || configured === 'low') return 'watch';
  if (configured === 'routine') return 'routine';
  const text = `${item.title || ''} ${item.content || ''}`.toLowerCase();
  if (/violence|attack|death|killed|arrest|critical|riot|flood|security alert/.test(text)) return 'critical';
  if (/election|rally|protest|dharna|campaign|nomination|scam|corruption/.test(text)) return 'developing';
  return 'watch';
}

function wrTags(item) {
  const text = `${item.title || ''} ${item.content || ''}`.toLowerCase();
  return ['BJP', 'RJD', 'JDU', 'Congress', 'NDA', 'Mahagathbandhan', 'Nitish Kumar', 'Tejashwi Yadav', 'Prashant Kishor', 'Election']
    .filter(tag => text.includes(tag.toLowerCase())).slice(0, 4);
}

/* Return first sentence of text, capped at 120 chars. */
function wrCrispSummary(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const sentenceEnd = clean.search(/[.!?]/);
  const firstSentence = sentenceEnd > 10 ? clean.slice(0, sentenceEnd + 1) : clean;
  if (firstSentence.length <= 120) return firstSentence;
  const truncated = firstSentence.slice(0, 120);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 60 ? truncated.slice(0, lastSpace) : truncated) + '…';
}

/**
 * Returns true if `summary` is essentially a restatement of `title`.
 * Used to suppress redundant "Executive Summary" blocks.
 * Checks: word overlap > 70%, or summary starts with the first 5 words of title.
 */
function wrSummaryIsRedundant(summary, title) {
  if (!summary || !title) return true;
  const clean = s => String(s).toLowerCase().replace(/[^\w\u0900-\u097f]+/gi, ' ').trim();
  const s = clean(summary);
  const t = clean(title);
  /* Prefix check — summary begins with same 5 words as title */
  const titleStart = t.split(' ').slice(0, 5).join(' ');
  if (s.startsWith(titleStart)) return true;
  /* Word-overlap check — meaningful words only (length > 2) */
  const sWords = new Set(s.split(' ').filter(w => w.length > 2));
  const tWords = new Set(t.split(' ').filter(w => w.length > 2));
  if (!sWords.size || !tWords.size) return true;
  const overlap = [...sWords].filter(w => tWords.has(w)).length;
  return (overlap / Math.max(sWords.size, tWords.size)) > 0.70;
}

/**
 * Pick the best displayable summary for a card:
 * 1. Gemini-generated summary (from analyzed_items via enrichment) — if not redundant with title
 * 2. First sentence of raw body — if not redundant with title
 * 3. null → caller shows "🔄 Gemini analysis pending"
 */
function wrBestSummary(item) {
  /* Priority 1: real Gemini summary */
  if (item.gemini_summary && !item.gemini_summary.startsWith('Summary pending')) {
    const gs = String(item.gemini_summary).trim();
    if (gs && !wrSummaryIsRedundant(gs, item.title)) return gs;
  }
  /* Priority 2: first-sentence of raw body */
  const crisp = wrCrispSummary(item.body);
  if (crisp && !wrSummaryIsRedundant(crisp, item.title)) return crisp;
  /* Nothing useful — analysis pending */
  return null;
}

function wrNormalise(item) {
  return {
    id: item.id,
    title: item.title || 'Untitled update',
    body: item.content || item.body || '',
    gemini_summary: item.gemini_summary || null,
    district: item.author || item.district || 'General',
    source: item.source || 'NewsData.io',
    created_at: item.created_at || item.time,
    url: item.url || item.link || '',
    category: wrCategory(item),
    level: wrLevel(item),
    tags: wrTags(item)
  };
}

/* ── Hindi news translation (server AI + localStorage cache) ── */
const WR_TR_LS_KEY = 'bcc_wr_tr_v1';
let wrTrCache = (() => {
  try { return JSON.parse(localStorage.getItem(WR_TR_LS_KEY)) || {}; } catch { return {}; }
})();

function wrIsHi() {
  return typeof window.getLang === 'function' && window.getLang() === 'hi';
}

function wrT(en, hi) {
  return wrIsHi() ? hi : en;
}

function wrTitle(item) {
  if (wrIsHi()) {
    const tr = wrTrCache[item.id];
    if (tr && tr.t && tr.st === item.title) return tr.t;
  }
  return item.title;
}

function wrLocSummary(item, best) {
  if (!best || !wrIsHi()) return best;
  const tr = wrTrCache[item.id];
  return tr && tr.s && tr.ss === best ? tr.s : best;
}

function wrLocBody(item) {
  if (!wrIsHi()) return item.body;
  const tr = wrTrCache[item.id];
  return tr && tr.b && tr.sb === item.body ? tr.b : item.body;
}

function wrTrSave() {
  try {
    const ids = Object.keys(wrTrCache);
    if (ids.length > 200) for (const id of ids.slice(0, ids.length - 200)) delete wrTrCache[id];
    localStorage.setItem(WR_TR_LS_KEY, JSON.stringify(wrTrCache));
  } catch { /* storage full — cache simply won't persist */ }
}

async function wrLoadTranslations(items, includeBody) {
  if (!wrIsHi() || !items.length) return false;
  let changed = false;
  for (let batch = 0; batch < 5; batch++) {
    const pending = [];
    for (const item of items) {
      const best = wrBestSummary(item);
      const tr = wrTrCache[item.id];
      const titleOk = tr && tr.t && tr.st === item.title;
      const summaryOk = !best || (tr && tr.s && tr.ss === best);
      const bodyOk = !includeBody || !item.body || (tr && tr.b && tr.sb === item.body);
      if (titleOk && summaryOk && bodyOk) continue;
      pending.push({ id: String(item.id), title: item.title, summary: best || '', body: includeBody ? (item.body || '') : '' });
      if (pending.length >= 12) break;
    }
    if (!pending.length) break;
    try {
      const res = await fetch('/api/translate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: pending }),
        cache: 'no-store'
      });
      if (!res.ok) break;
      const payload = await res.json();
      const translations = payload.translations || {};
      let batchChanged = false;
      for (const p of pending) {
        const t = translations[p.id];
        if (!t || !t.title) continue;
        const prev = wrTrCache[p.id] || {};
        wrTrCache[p.id] = {
          t: t.title,
          s: p.summary ? (t.summary || null) : (prev.s || null),
          b: p.body ? (t.body || null) : (prev.b || null),
          st: p.title,
          ss: p.summary || null,
          sb: p.body || prev.sb || null
        };
        batchChanged = true;
      }
      if (!batchChanged) break;
      changed = true;
      wrTrSave();
      wrRerenderNews();
    } catch (err) {
      console.error('[WR-translate] fetch error:', err);
      break;
    }
  }
  return changed;
}

function wrRerenderNews() {
  renderTicker();
  renderTopAttention();
  applyFilters();
}

/* ── AI Executive Summary Feed ─────────────────────────────── */

async function loadAnalyzedSummaries(forceRefresh = false) {
  const list = document.getElementById('wr-summary-list');
  const countEl = document.getElementById('wr-summary-count');
  if (!list) return;

  // Always show spinner when triggered (it's now on-demand only)
  list.innerHTML = '<div class="empty-state" style="padding:.75rem;"><div class="spinner"></div><p class="empty-state-text" style="margin-top:.5rem;">Loading analyzed summaries…</p></div>';


  try {
    const response = await fetch('/api/analyzed-items?limit=30', { cache: 'no-store' });
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const result = await response.json();
    const items = (result.data || []).filter(item => item.summary && !item.summary.startsWith('Summary pending'));

    if (countEl) countEl.textContent = `${items.length} analyzed`;

    if (!items.length) {
      list.innerHTML = `<div style="text-align:center;padding:1.25rem 0;">
        <div style="font-size:1.5rem;margin-bottom:.5rem;">🧠</div>
        <p style="font-size:.78rem;color:var(--text-muted);">No analyzed summaries yet.</p>
        <p style="font-size:.72rem;color:var(--text-muted);margin-top:.2rem;">Click <b>⚡ Analyse</b> above to process the news queue.</p>
      </div>`;
      return;
    }

    const priorityConfig = {
      Critical:   { color: 'var(--red)',   bg: 'rgba(230,57,70,0.1)',  border: 'rgba(230,57,70,0.3)',  icon: '🔴' },
      Developing: { color: 'var(--amber)', bg: 'rgba(255,159,67,0.1)', border: 'rgba(255,159,67,0.3)', icon: '🟠' },
      Watch:      { color: 'var(--gold)',  bg: 'rgba(245,197,24,0.08)', border: 'rgba(245,197,24,0.25)', icon: '🟡' },
      Routine:    { color: 'var(--green)', bg: 'rgba(38,222,129,0.06)', border: 'rgba(38,222,129,0.2)', icon: '🟢' },
    };

    list.innerHTML = items.map(item => {
      const pc = priorityConfig[item.priority] || priorityConfig.Watch;
      const title = item.raw_items?.title || item.event_type || 'Update';
      const source = item.raw_items?.source_name || '';
      const url = item.raw_items?.url || '';
      const district = item.district && item.district !== 'General' ? `📍 ${wrEscape(item.district)}` : '';
      const who = item.who ? `👤 ${wrEscape(item.who)}` : '';
      return `<div style="padding:.65rem .75rem;border:1px solid ${pc.border};border-left:3px solid ${pc.color};border-radius:var(--radius-md);background:${pc.bg};">
        <div style="display:flex;gap:.4rem;align-items:center;margin-bottom:.3rem;flex-wrap:wrap;">
          <span style="font-size:.6rem;font-weight:800;color:${pc.color};letter-spacing:.05em;">${pc.icon} ${(item.priority || 'WATCH').toUpperCase()}</span>
          ${district ? `<span style="font-size:.62rem;color:var(--text-muted);">${district}</span>` : ''}
          ${who ? `<span style="font-size:.62rem;color:var(--text-muted);">${who}</span>` : ''}
          ${source ? `<span style="font-size:.62rem;color:var(--text-muted);">📡 ${wrEscape(source)}</span>` : ''}
        </div>
        <div style="font-size:.78rem;font-weight:700;color:var(--text-primary);line-height:1.35;margin-bottom:.3rem;">${wrEscape(title)}</div>
        <div style="font-size:.75rem;color:var(--text-secondary);line-height:1.55;border-left:2px solid ${pc.color}44;padding-left:.5rem;">${wrEscape(item.summary)}</div>
        ${url ? `<a href="${wrEscape(url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:.4rem;font-size:.65rem;color:var(--primary-light);text-decoration:none;">Source ↗</a>` : ''}
      </div>`;
    }).join('');

  } catch (e) {
    if (list) list.innerHTML = `<p style="font-size:.72rem;color:var(--red);padding:.5rem 0;">Could not load summaries: ${wrEscape(e.message)}</p>`;
    if (countEl) countEl.textContent = 'Error';
  }
}

/* ── Intelligence Summary (Rolling Pipeline) ─────────────── */

let wrIntelAutoRefreshTimer = null;

/**
 * Fetch and render the latest intelligence summary from the pipeline.
 * @param {boolean} forceRefresh — show loading spinner on manual refresh
 */
async function loadIntelligenceSummary(forceRefresh = false) {
  const card       = document.getElementById('wr-intel-summary-card');
  const badge      = document.getElementById('wr-intel-session-badge');
  const provBadge  = document.getElementById('wr-intel-provider-badge');
  const progress   = document.getElementById('wr-pipeline-progress');
  const statusText = document.getElementById('wr-pipeline-status-text');
  const histDiv    = document.getElementById('wr-intel-history');

  if (!card) return;

  if (forceRefresh) {
    card.innerHTML = '<div class="empty-state" style="padding:.75rem;"><div class="spinner"></div><p class="empty-state-text" style="margin-top:.5rem;">Refreshing…</p></div>';
  }

  try {
    const response = await fetch('/api/news-summaries?latest=true&limit=5', { cache: 'no-store' });
    if (!response.ok) throw new Error(`API ${response.status}`);
    const result = await response.json();

    const summaries      = result.data || [];
    const currentSession = result.current_session;

    // Show pipeline progress if running
    if (currentSession && currentSession.status === 'processing' && progress && statusText) {
      const pct = currentSession.total_fetched
        ? Math.round((currentSession.total_processed / currentSession.total_fetched) * 100)
        : 0;
      progress.style.display = 'block';
      statusText.textContent = `${currentSession.total_processed}/${currentSession.total_fetched} items · Batch ${currentSession.total_batches} · ${pct}% complete`;
    } else if (progress) {
      progress.style.display = 'none';
    }

    // Session badge
    if (badge && currentSession) {
      const slot = currentSession.schedule_slot || 'manual';
      const slotEmoji = { morning: '🌅', noon: '🌞', evening: '🌆', manual: '⚡' }[slot] || '📡';
      badge.textContent = `${slotEmoji} ${slot.charAt(0).toUpperCase() + slot.slice(1)} · ${currentSession.total_fetched || 0} fetched`;
    }

    if (!summaries.length) {
      card.innerHTML = `<div style="text-align:center;padding:1.25rem 0;">
        <div style="font-size:1.5rem;margin-bottom:.5rem;">📡</div>
        <p style="font-size:.78rem;color:var(--text-muted);">No intelligence summary yet.</p>
        <p style="font-size:.72rem;color:var(--text-muted);margin-top:.2rem;">Summaries are generated automatically at 7 AM, 1 PM and 8 PM IST.</p>
      </div>`;
      return;
    }

    // Render latest summary
    const latest = summaries[0];
    renderIntelligenceSummary(latest, card);

    // Provider badge
    if (provBadge && latest.llm_provider) {
      const provLabels = { gemini: '🟣 Gemini', groq: '🟢 Groq', plugsky: '🔵 PlugSky' };
      provBadge.textContent = provLabels[latest.llm_provider] || latest.llm_provider;
      provBadge.style.display = 'inline-flex';
    }

    // Render previous sessions history (summaries[1..])
    let history = summaries.slice(1);
    
    // Only show summaries from TODAY, and limit to max 2 items (so total max 3 on page)
    const todayStr = new Date().toDateString();
    history = history.filter(s => new Date(s.created_at).toDateString() === todayStr).slice(0, 2);

    const historyList = document.getElementById('wr-intel-history-list');
    if (histDiv && historyList) {
      if (history.length) {
        histDiv.style.display = 'block';
        historyList.innerHTML = history.map((s) => {
          const dateStr = new Date(s.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
          return `<div style="padding:.45rem .65rem;border:1px solid var(--border-subtle);border-radius:var(--radius-sm);display:flex;justify-content:space-between;align-items:center;font-size:.68rem;">
            <span style="color:var(--text-secondary);">📡 AI Insight · ${dateStr}</span>
            <span style="color:var(--text-muted);">${s.news_count || s.batch_size || 0} news analyzed</span>
          </div>`;
        }).join('');
      } else {
        histDiv.style.display = 'none';
      }
    }

  } catch (e) {
    if (card) card.innerHTML = `<p style="font-size:.72rem;color:var(--red);padding:.5rem 0;">Could not load intelligence summary: ${wrEscape(e.message)}</p>`;
    if (badge) badge.textContent = 'Error';
  }
}

/**
 * Render a single intelligence summary into the target container.
 */
function renderIntelligenceSummary(summary, container) {
  const timeStr = new Date(summary.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  // ── Health score ring (score can be number or {score, reason, trend_arrow}) ──
  const hsRaw = summary.overall_political_health_score;
  const score = typeof hsRaw === 'number' ? hsRaw
    : (hsRaw && typeof hsRaw.score === 'number' ? hsRaw.score : null);
  const hsReason = hsRaw && typeof hsRaw === 'object' ? (hsRaw.reason || '') : '';
  const scoreColor = score === null ? 'var(--text-muted)' : score >= 70 ? 'var(--green)' : score >= 45 ? 'var(--gold)' : 'var(--red)';
  const trendArrow = hsRaw && typeof hsRaw === 'object' ? (hsRaw.trend_arrow || '') : '';
  const trendBadge = trendArrow.includes('improv') || trendArrow.includes('up') ? '📈 Improving'
    : trendArrow.includes('declin') || trendArrow.includes('down') || trendArrow.includes('wors') ? '📉 Declining'
    : trendArrow ? '➡️ Stable' : '';
  const ring = score !== null ? `
    <div style="display:flex;align-items:center;gap:.7rem;flex-wrap:wrap;">
      <div style="position:relative;width:58px;height:58px;flex-shrink:0;">
        <svg viewBox="0 0 36 36" style="width:58px;height:58px;transform:rotate(-90deg);">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="3.5"/>
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="${scoreColor}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${(score / 100) * 97.4} 97.4"/>
        </svg>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:'Outfit',sans-serif;font-weight:800;font-size:.95rem;color:${scoreColor};">${score}</div>
      </div>
      <div>
        <div style="font-size:.6rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;">Political Health</div>
        ${trendBadge ? `<div style="font-size:.68rem;font-weight:700;color:${scoreColor};margin-top:.15rem;">${trendBadge}</div>` : ''}
      </div>
      ${hsReason ? `<div style="font-size:.68rem;color:var(--text-secondary);line-height:1.45;flex:1 1 220px;min-width:0;overflow-wrap:anywhere;">${wrEscape(hsReason)}</div>` : ''}
    </div>` : '';

  // ── Interactive card helper (expandable <details>) ──
  const intelCard = (emoji, title, color, bg, inner, open = false) => `
    <details ${open ? 'open' : ''} style="background:${bg};border:1px solid ${color}33;border-left:3px solid ${color};border-radius:var(--radius-md);overflow:hidden;">
      <summary style="cursor:pointer;list-style:none;padding:.55rem .7rem;display:flex;align-items:center;justify-content:space-between;user-select:none;">
        <span style="font-size:.7rem;font-weight:800;color:${color};text-transform:uppercase;letter-spacing:.06em;">${emoji} ${title}</span>
        <span style="font-size:.6rem;color:var(--text-muted);">▼</span>
      </summary>
      <div style="padding:0 .7rem .6rem;">${inner}</div>
    </details>`;

  const asText = (v) => typeof v === 'string' ? v : (v.action || v.issue || v.title || v.name || v.leader || '');
  const list = (arr, cls = '') => `<ul style="margin:0;padding-left:1.05rem;display:flex;flex-direction:column;gap:.25rem;">${arr.map(p => `<li style="font-size:.72rem;color:var(--text-secondary);line-height:1.45;${cls}">${wrEscape(asText(p))}</li>`).join('')}</ul>`;

  const cards = [];

  // 🎯 Top Priority Today (structured: rank + urgency + action)
  if (Array.isArray(summary.top_priority_today) && summary.top_priority_today.length) {
    const inner = `<div style="display:flex;flex-direction:column;gap:.35rem;">${summary.top_priority_today.map((t, i) => {
      const act = asText(t);
      const urg = t && typeof t === 'object' ? (t.urgency || '') : '';
      const uc = /immediate|तुरंत/i.test(urg) ? 'var(--red)' : /24/i.test(urg) ? 'var(--amber)' : 'var(--gold)';
      return `<div style="display:flex;gap:.5rem;align-items:flex-start;padding:.4rem .55rem;background:rgba(255,255,255,0.02);border-left:3px solid ${uc};border-radius:0 var(--radius-sm) var(--radius-sm) 0;">
        <b style="color:var(--amber);font-size:.75rem;flex-shrink:0;">${(t && typeof t === 'object' && t.rank) ? t.rank : i + 1}</b>
        <div style="flex:1;">
          <div style="font-size:.72rem;color:var(--text-secondary);line-height:1.45;">${wrEscape(act)}</div>
          ${urg ? `<span style="font-size:.58rem;font-weight:700;color:${uc};text-transform:uppercase;">${wrEscape(urg)}</span>` : ''}
        </div>
      </div>`;
    }).join('')}</div>`;
    cards.push(intelCard('🎯', 'आज की टॉप प्रायोरिटी', 'var(--amber)', 'rgba(255,159,67,0.06)', inner, true));
  }

  // ✅ BJP Action Points
  if (Array.isArray(summary.bjp_action_points) && summary.bjp_action_points.length) {
    cards.push(intelCard('✅', 'BJP रणनीतिक कार्रवाई', 'var(--green)', 'rgba(38,222,129,0.05)', list(summary.bjp_action_points)));
  }

  // 💪 BJP Advantage Points
  if (Array.isArray(summary.bjp_advantage_points) && summary.bjp_advantage_points.length) {
    cards.push(intelCard('💪', 'BJP के मजबूत पॉइंट्स', 'var(--green)', 'rgba(38,222,129,0.05)', list(summary.bjp_advantage_points)));
  }

  // ⚠️ Political Risks (structured cards)
  if (Array.isArray(summary.political_risks) && summary.political_risks.length) {
    const inner = `<div style="display:flex;flex-direction:column;gap:.35rem;">${summary.political_risks.map(r => {
      const lv = (r.risk_level || '').toLowerCase();
      const rc = lv === 'critical' ? 'var(--red)' : lv === 'high' ? 'var(--amber)' : lv === 'medium' ? 'var(--gold)' : 'var(--green)';
      return `<div style="padding:.4rem .55rem;background:rgba(255,255,255,0.02);border-left:3px solid ${rc};border-radius:0 var(--radius-sm) var(--radius-sm) 0;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:.4rem;">
          <span style="font-size:.7rem;font-weight:800;color:var(--text-primary);">${wrEscape(r.issue)}</span>
          <span style="font-size:.55rem;font-weight:700;padding:2px 6px;background:${rc};color:#fff;border-radius:3px;white-space:nowrap;">${wrEscape(r.risk_level)}</span>
        </div>
        <div style="font-size:.66rem;color:var(--text-secondary);line-height:1.35;margin-top:.15rem;">${wrEscape(r.reason)}</div>
      </div>`;
    }).join('')}</div>`;
    cards.push(intelCard('⚠️', 'राजनीतिक जोखिम व कमजोर पॉइंट्स', 'var(--red)', 'rgba(230,57,70,0.05)', inner));
  }

  // 🎯 Opposition Strategy (structured cards)
  if (Array.isArray(summary.opposition_activity) && summary.opposition_activity.length) {
    const inner = `<div style="display:flex;flex-direction:column;gap:.35rem;">${summary.opposition_activity.map(o => {
      const im = (o.potential_impact || '').toLowerCase();
      const bc = im === 'high' ? 'var(--red)' : im === 'medium' ? 'var(--amber)' : 'var(--text-muted)';
      return `<div style="padding:.4rem .55rem;background:rgba(255,255,255,0.02);border-left:3px solid ${bc};border-radius:0 var(--radius-sm) var(--radius-sm) 0;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:.4rem;">
          <span style="font-size:.7rem;font-weight:800;color:var(--text-primary);">${wrEscape(o.party_or_leader)}</span>
          <span style="font-size:.56rem;color:var(--text-muted);white-space:nowrap;">Impact: ${wrEscape(o.potential_impact)}</span>
        </div>
        <div style="font-size:.66rem;color:var(--text-secondary);line-height:1.35;margin-top:.15rem;">${wrEscape(o.action_summary)}</div>
      </div>`;
    }).join('')}</div>`;
    cards.push(intelCard('🎯', 'विपक्ष की रणनीति', 'var(--primary-light)', 'rgba(74,158,255,0.05)', inner));
  }

  // 🛡️ Counter Strategy
  if (Array.isArray(summary.counter_strategy_points) && summary.counter_strategy_points.length) {
    cards.push(intelCard('🛡️', 'BJP की काउंटर रणनीति', 'var(--primary-light)', 'rgba(74,158,255,0.05)', list(summary.counter_strategy_points)));
  }

  // 🔥 Most Active Opposition Voices
  if (Array.isArray(summary.most_active_opposition_voices_this_cycle) && summary.most_active_opposition_voices_this_cycle.length) {
    const inner = `<div style="display:flex;flex-wrap:wrap;gap:.35rem;">${summary.most_active_opposition_voices_this_cycle.map(v => {
      const name = typeof v === 'string' ? v : (v.name || v.leader || JSON.stringify(v));
      return `<span class="tag" style="font-size:.66rem;border-color:rgba(230,57,70,0.4);color:var(--red);">🔥 ${wrEscape(name)}</span>`;
    }).join('')}</div>`;
    cards.push(intelCard('🔥', 'सबसे सक्रिय विपक्षी आवाज़ें', 'var(--red)', 'rgba(230,57,70,0.05)', inner));
  }

  // 🔄 Trend Since Last Cycle (escalated / de-escalated / new developments)
  const tr = summary.trend_since_last_cycle;
  if (tr && typeof tr === 'object') {
    const esc = Array.isArray(tr.escalated) ? tr.escalated : [];
    const newDev = Array.isArray(tr.new_developments) ? tr.new_developments : [];
    if (esc.length || newDev.length) {
      const inner =
        (esc.length ? `<div style="font-size:.6rem;font-weight:800;color:var(--red);text-transform:uppercase;margin-bottom:.25rem;">▲ Escalating</div>` + list(esc) : '') +
        (newDev.length ? `<div style="font-size:.6rem;font-weight:800;color:var(--amber);text-transform:uppercase;margin:.45rem 0 .25rem;">✦ New Developments</div>` + list(newDev) : '');
      cards.push(intelCard('🔄', 'पिछले साइकिल से ट्रेंड', 'var(--amber)', 'rgba(255,159,67,0.05)', inner));
    }
  }

  // 🗳️ Election Watch
  if (Array.isArray(summary.election_watch_items) && summary.election_watch_items.length) {
    cards.push(intelCard('🗳️', 'चुनावी निगरानी', 'var(--gold)', 'rgba(245,197,24,0.05)', list(summary.election_watch_items)));
  }

  container.innerHTML = `
    <div style="padding:.85rem;border:1px solid rgba(168,85,247,0.3);border-left:4px solid #a855f7;border-radius:var(--radius-md);background:rgba(168,85,247,0.04);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.7rem;flex-wrap:wrap;gap:.5rem;">
        <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">
          <span style="font-size:.68rem;font-weight:800;color:#c084fc;letter-spacing:.05em;">⚡ LATEST INTELLIGENCE</span>
          ${trendBadge && score === null ? `<span class="tag" style="font-size:.6rem;">${trendBadge}</span>` : ''}
        </div>
        <span style="font-size:.63rem;color:var(--text-muted);">🕐 ${timeStr} · ${summary.news_count || 0} news analyzed</span>
      </div>

      ${ring ? `<div style="margin-bottom:.7rem;padding:.6rem .7rem;background:rgba(255,255,255,0.02);border-radius:var(--radius-md);border:1px solid rgba(255,255,255,0.05);">${ring}</div>` : ''}

      ${summary.overall_situation ? `<div style="font-size:.82rem;line-height:1.65;color:var(--text-primary);font-weight:500;padding:.65rem .7rem;background:rgba(255,255,255,0.02);border-radius:var(--radius-md);border-left:3px solid #a855f7;margin-bottom:.7rem;overflow-wrap:anywhere;word-break:break-word;">${wrEscape(summary.overall_situation)}</div>` : ''}

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:.6rem;">
        ${cards.join('')}
      </div>
    </div>`;
}

/**
 * Start 5-minute auto-refresh timer for intelligence summary.
 */
function startSummaryAutoRefresh() {
  if (wrIntelAutoRefreshTimer) clearInterval(wrIntelAutoRefreshTimer);
  wrIntelAutoRefreshTimer = setInterval(() => {
    loadIntelligenceSummary(false); // silent refresh (no spinner)
  }, 5 * 60 * 1000);
}

function initWarRoom() {
  setupWarRoomControls();
  loadActionState();
  refreshGeminiStatus();
  loadIntelligenceSummary();     // NEW — load pipeline summary first
  startSummaryAutoRefresh();     // NEW — auto-refresh every 5 min
  connectWarRoom();
  window.addEventListener('bcc:langchange', () => {
    if (!wrAllNews.length) return;
    if (wrIsHi()) wrLoadTranslations(wrAllNews, false).then(() => wrRerenderNews());
    else wrRerenderNews();
  });
  // Note: loadAnalyzedSummaries() is now on-demand only (via ↻ Refresh button)
}


function setGeminiStatus(message, tone = 'muted') {
  /* Only show the status div during active analysis — not for idle queue messages */
  const status = document.getElementById('wr-gemini-status');
  if (!status) return;
  if (message) {
    status.textContent = message;
    status.style.color = tone === 'error' ? 'var(--red)' : tone === 'success' ? 'var(--green)' : 'var(--text-muted)';
    status.style.display = 'block';
  } else {
    status.style.display = 'none';
    status.textContent = '';
  }
}

function setGeminiResult(message, tone = 'default') {
  const result = document.getElementById('wr-gemini-result');
  if (!result) return;
  result.textContent = message;
  result.style.display = message ? 'inline-flex' : 'none';
  result.className = `tag${tone === 'success' ? ' tag-green' : tone === 'error' ? ' tag-red' : ''}`;
}

async function refreshGeminiStatus() {
  try {
    const response = await fetch('/api/analyze-news', { cache: 'no-store' });
    if (!response.ok) return; /* silent fail — don't show API errors in the UI */
    const result = await response.json();
    const pending = Number(result.pending || 0);
    const pendingLabel = document.getElementById('wr-gemini-pending');
    if (pendingLabel) {
      pendingLabel.textContent = pending ? `${pending} pending` : '';
      pendingLabel.style.display = pending ? 'inline-flex' : 'none';
    }
    /* Only update button label if not currently running */
    if (!wrGeminiRunning) {
      const button = document.getElementById('wr-gemini-trigger');
      if (button) button.textContent = '⚡ Analyse';
      setGeminiStatus(''); /* hide status when idle */
    }
  } catch (_) {
    /* Network errors during status check are silently ignored */
  }
}

async function triggerGeminiAnalysis() {
  if (wrGeminiRunning) return;
  const button = document.getElementById('wr-gemini-trigger');
  wrGeminiRunning = true;
  if (button) { button.disabled = true; button.textContent = '⏳ Analyzing…'; }
  setGeminiResult('', 'default');
  setGeminiStatus('Gemini is analyzing the next batch of news items…', 'muted');

  try {
    const response = await fetch('/api/analyze-news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 10 })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Gemini analysis failed');
    const message = result.processed
      ? `✅ ${result.processed} analyzed · ${result.alerts_created || 0} alerts created${result.failed ? ` · ${result.failed} errors` : ''}`
      : (result.message || 'No pending items to analyze');
    setGeminiResult(message, result.failed ? 'error' : 'success');
    setGeminiStatus(''); /* hide status when done */
    await refreshGeminiStatus();
    await loadAnalyzedSummaries(true);
  } catch (error) {
    setGeminiResult(`❌ ${error.message}`, 'error');
    setGeminiStatus('');
  } finally {
    wrGeminiRunning = false;
    if (button) { button.textContent = '⚡ Analyse'; button.disabled = false; }
  }
}



function loadActionState() {
  try { wrActionState = JSON.parse(localStorage.getItem('bihar-war-room-actions') || '{}'); } catch { wrActionState = {}; }
}

function getAlertAction(id) {
  return wrActionState[String(id)] || 'new';
}

function updateAlertAction(id, status) {
  wrActionState[String(id)] = status;
  localStorage.setItem('bihar-war-room-actions', JSON.stringify(wrActionState));
  renderActionCentre();
  renderTopAttention();
  applyFilters();
}

function setupWarRoomControls() {
  const districtSelect = document.getElementById('wr-district-filter');
  if (!districtSelect) return;
  const districts = typeof BIHAR_DISTRICTS !== 'undefined'
    ? BIHAR_DISTRICTS
    : (typeof DISTRICTS_DATA !== 'undefined' ? DISTRICTS_DATA.map(item => item.name) : []);
  districtSelect.innerHTML = '<option value="all">All Districts</option>' + districts.map(district => `<option value="${wrEscape(district)}">${wrEscape(district)}</option>`).join('');
}

async function connectWarRoom() {
  const grid = document.getElementById('wr-alerts-grid');
  if (grid) grid.innerHTML = '<div class="empty-state"><div class="spinner"></div><p class="empty-state-text">Loading live news feed…</p></div>';

  try {
    const endpoints = ['/api/live-news', 'http://localhost:8000/api/live-news'];
    let response;
    let lastError;
    for (const endpoint of endpoints) {
      try {
        const candidate = await fetch(endpoint);
        if (candidate.ok) { response = candidate; break; }
        lastError = new Error(`Live news returned ${candidate.status}`);
      } catch (error) {
        lastError = error;
      }
    }
    if (!response) throw lastError || new Error('Live news backend is unavailable.');
    const result = await response.json();

    if (result.status === 'success') {
      wrAllNews = result.data.map(wrNormalise);
      wrDisplayedNews = wrAllNews;
      renderTicker();
      renderTopAttention();
      renderActionCentre();
      applyFilters();
      renderSources();
      renderThreatGauge();
      renderCategoryChart();
      setupSearch();
      wrLoadTranslations(wrAllNews, false).then(changed => { if (changed) wrRerenderNews(); });
    } else {
      throw new Error('API returned failure status');
    }
  } catch (error) {
    renderWarRoomError(error.message);
  }
}

function renderActionCentre() {
  const summary = document.getElementById('wr-action-summary');
  const count = document.getElementById('wr-action-summary-count');
  if (!summary || !count) return;
  const openItems = wrAllNews.filter(item => getAlertAction(item.id) !== 'closed');
  count.textContent = wrT(`${openItems.length} open`, `${openItems.length} खुले`);
  if (!openItems.length) { summary.textContent = 'No open actions.'; return; }
  const grouped = openItems.reduce((result, item) => {
    const status = getAlertAction(item.id);
    result[status] = (result[status] || 0) + 1;
    return result;
  }, {});
  summary.innerHTML = Object.entries(grouped).map(([status, total]) => `<span class="tag ${status === 'review' || status === 'report' ? 'tag-red' : 'tag-blue'}">${wrEscape(wrT(WR_ACTION_LABELS[status], WR_ACTION_LABELS_HI[status]))}: ${total}</span>`).join('');
}

function renderTopAttention() {
  const list = document.getElementById('wr-top-attention-list');
  if (!list) return;
  const order = { critical: 0, developing: 1, watch: 2, routine: 3 };
  const news = wrAllNews.filter(item => !item.source.toLowerCase().includes('youtube'));
  const candidates = (news.length ? news : wrAllNews).slice().sort((a, b) => {
    const levelDifference = order[a.level] - order[b.level];
    if (levelDifference) return levelDifference;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  }).slice(0, 3);
  if (!candidates.length) {
    list.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:1rem;"><p class="empty-state-text">No priority developments available.</p></div>';
    return;
  }
  list.innerHTML = candidates.map((item, index) => {
    const level = WR_LEVEL_CONFIG[item.level];
    const bestSummary = wrBestSummary(item);
    const districtLabel = /multiple/i.test(item.district || '') ? '🌐 All Sources' : `📍 ${item.district}`;
    const summaryBlock = bestSummary
      ? `<div style="margin-top:.45rem;"><span style="font-size:.6rem;font-weight:800;color:var(--gold);text-transform:uppercase;letter-spacing:.07em;">Executive Summary</span><div style="font-size:.75rem;color:var(--text-secondary);line-height:1.5;margin-top:.2rem;">${wrEscape(wrLocSummary(item, bestSummary))}</div></div>`
      : `<div style="margin-top:.4rem;font-size:.65rem;color:var(--text-muted);font-style:italic;">🔄 Gemini analysis pending</div>`;
    return `<article style="padding:.85rem;border:1px solid ${level.color}44;border-left:3px solid ${level.color};border-radius:var(--radius-md);background:var(--glass-bg);animation:slideInUp .3s ease both;animation-delay:${index * .05}s;">
      <div style="display:flex;justify-content:space-between;gap:.5rem;align-items:flex-start;"><span style="font-size:.68rem;font-weight:800;color:${level.color};">${index + 1}. ${level.label}</span><span style="font-size:.65rem;color:var(--text-muted);">${wrTimeAgo(item.created_at)}</span></div>
      <div style="font-size:.82rem;font-weight:700;line-height:1.35;margin-top:.55rem;">${wrEscape(wrTitle(item))}</div>
      ${summaryBlock}
      <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-top:.55rem;"><span class="tag">${wrEscape(districtLabel)}</span></div>
      <div style="display:flex;gap:.4rem;margin-top:.7rem;align-items:center;">${item.url ? `<a class="btn btn-ghost btn-sm" href="${wrEscape(item.url)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ''}<button class="btn btn-ghost btn-sm" style="margin-left:auto;" onclick="openAlertDetail('${wrEscape(item.id)}')">Details</button></div>
    </article>`;
  }).join('');
}



async function filterByDistrict() {
  const select = document.getElementById('wr-district-filter');
  wrCurrentDistrict = select ? select.value : 'all';
  if (wrCurrentDistrict === 'all') {
    wrDisplayedNews = wrAllNews;
    applyFilters();
    return;
  }

  // Client-side filter since our API returns everything at once
  wrDisplayedNews = wrAllNews.filter(item =>
    item.district.toLowerCase().includes(wrCurrentDistrict.toLowerCase()) ||
    item.district.toLowerCase() === 'multiple'
  );
  applyFilters();
}

function renderTicker() {
  const el = document.getElementById('wr-ticker-content');
  if (!el) return;
  const titles = wrAllNews.slice(0, 8).map(item => `📡 ${wrTitle(item)}`);
  el.innerHTML = [...titles, ...titles].map(title => `<span class="ticker-item">${wrEscape(title)}</span>`).join('') || '<span class="ticker-item">Waiting for live political news…</span>';
}

function filterByLevel(level) {
  wrCurrentLevel = level;
  document.querySelectorAll('#wr-filter-group .filter-pill').forEach(pill => pill.classList.toggle('active', pill.dataset.level === level));
  applyFilters();
  
  // On mobile, scroll down to the alerts so the user can immediately see the filtered results
  if (window.innerWidth <= 900) {
    const filterSection = document.getElementById('wr-filter-group');
    if (filterSection) {
      // Small delay to allow rendering to complete
      setTimeout(() => {
        filterSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }
}

function filterByCategory() {
  const select = document.getElementById('wr-category-filter');
  wrCurrentCategory = select ? select.value : 'all';
  applyFilters();
}

function applyFilters() {
  let data = [...wrDisplayedNews];
  if (wrCurrentLevel !== 'all') data = data.filter(item => item.level === wrCurrentLevel);
  if (wrCurrentCategory !== 'all') data = data.filter(item => item.category === wrCurrentCategory);
  renderAlerts(data);
  updateLevelCounts();
  renderCategoryChart();
}

function toggleYoutubeExpansion(source) {
  wrYoutubeExpanded[source] = !wrYoutubeExpanded[source];
  applyFilters();
}

function loadMoreYoutubeVideos(source) {
  if (!wrYoutubeVideoCounts[source]) wrYoutubeVideoCounts[source] = 5;
  wrYoutubeVideoCounts[source] += 5;
  applyFilters();
}

function renderYoutubeChannel(videos, channelIndex) {
  const source = videos[0].source;
  const sourceId = source.replace(/[^a-zA-Z0-9]/g, '');
  
  const visibleCount = wrYoutubeVideoCounts[source] || 5;
  const visibleVideos = videos.slice(0, visibleCount);
  
  const videoHTML = visibleVideos.map((item, index) => {
    const level = WR_LEVEL_CONFIG[item.level] || WR_LEVEL_CONFIG.watch;
    const bestSummary = wrBestSummary(item);
    const summaryBlock = bestSummary
      ? '<div style="margin-top:.35rem;"><span style="font-size:.6rem;font-weight:800;color:var(--gold);text-transform:uppercase;letter-spacing:.07em;">Executive Summary</span><div style="font-size:.78rem;color:var(--text-secondary);line-height:1.5;margin-top:.15rem;">' + wrEscape(wrLocSummary(item, bestSummary)) + '</div></div>'
      : '<div style="margin-top:.3rem;font-size:.65rem;color:var(--text-muted);font-style:italic;">🔄 Gemini analysis pending</div>';
    
    const tagsHTML = (item.tags || []).map(tag => '<span class="tag">' + wrEscape(tag) + '</span>').join('');
    const watchLink = item.url ? '<a class="btn btn-ghost btn-sm" href="' + wrEscape(item.url) + '" target="_blank" rel="noopener noreferrer">▶ Watch</a>' : '';

    return '<article class="card card-shine" style="border-left:4px solid ' + level.color + '; animation:slideInUp .3s ease both; animation-delay:' + (index * 0.04) + 's;">' +
      '<div class="card-content-wrapper"><div style="min-width:0;flex:1;">' +
      '<div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.45rem;"><span style="padding:.2rem .55rem;background:' + level.dim + ';border:1px solid ' + level.color + '44;border-radius:999px;color:' + level.color + ';font-size:.65rem;font-weight:700;">' + level.label + '</span><span class="tag tag-blue">' + wrEscape(item.category || 'Media') + '</span><span class="tag">📍 ' + wrEscape(item.district || 'Bihar') + '</span><span class="tag" style="border-color:var(--primary);color:var(--primary-light);">📡 ' + wrEscape(item.source) + '</span></div>' +
      '<div style="font-size:.9rem;font-weight:700;line-height:1.35;margin-top:.4rem;">' + wrEscape(wrTitle(item)) + '</div>' +
      summaryBlock +
      '<div style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;margin-top:.55rem;">' + tagsHTML + '<span style="margin-left:auto;font-size:.68rem;color:var(--text-muted);">🕐 ' + wrTimeAgo(item.created_at) + '</span></div>' +
      '</div><div style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;justify-content:flex-end;">' + watchLink + '<button class="btn btn-ghost btn-sm" onclick="openAlertDetail(\'' + wrEscape(item.id) + '\')">Details</button></div></div></article>';
  }).join('');

  let moreVideosBtn = '';
  if (videos.length > visibleCount) {
    moreVideosBtn = `<button class="btn btn-ghost" style="align-self:center;margin-top:.5rem;" onclick="loadMoreYoutubeVideos('${wrEscape(source)}')">${wrT(`See more YT news (${Math.min(visibleCount + 5, videos.length)}/${videos.length})`, `और YT खबरें देखें (${Math.min(visibleCount + 5, videos.length)}/${videos.length})`)}</button>`;
  }

  // Open all channels by default
  const displayStyle = 'flex';

  return `
  <div style="margin-bottom:0.75rem;">
    <button class="btn btn-ghost w-full" style="justify-content:space-between; background:var(--glass-bg); border:1px solid var(--border-subtle);" onclick="const el = document.getElementById('yt-channel-${sourceId}'); el.style.display = el.style.display === 'none' ? 'flex' : 'none';">
      <span>▶️ ${wrEscape(source.replace('YouTube: ', ''))} (${videos.length} videos)</span>
      <span style="font-size:0.8rem;">▼</span>
    </button>
    <div id="yt-channel-${sourceId}" style="display:${displayStyle}; flex-direction:column; gap:0.75rem; margin-top:0.75rem;">
      ${videoHTML}
      ${moreVideosBtn}
    </div>
  </div>`;
}



function renderAlerts(data) {
  const newsGrid = document.getElementById('wr-alerts-grid');
  const ytGrid = document.getElementById('wr-yt-grid');
  if (!newsGrid) return;

  const newsData = data.filter(item => !item.source.toLowerCase().includes('youtube'));
  const ytData = data.filter(item => item.source.toLowerCase().includes('youtube'));
  const order = { critical: 0, developing: 1, watch: 2, routine: 3 };

  if (!newsData.length) {
    newsGrid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><h3>No News Alerts</h3><p class="empty-state-text">No live news matches these filters.</p></div>';
  } else {
    const sortedNews = [...newsData].sort((a, b) => order[a.level] - order[b.level]);
    const visibleNews = sortedNews.slice(0, wrNewsVisibleCount);
    newsGrid.innerHTML = visibleNews.map((item, index) => {
      const level = WR_LEVEL_CONFIG[item.level];
      const action = getAlertAction(item.id);
      const bestSummary = wrBestSummary(item);
      const summaryBlock = bestSummary
        ? `<div style="margin-top:.35rem;"><span style="font-size:.6rem;font-weight:800;color:var(--gold);text-transform:uppercase;letter-spacing:.07em;">Executive Summary</span><div style="font-size:.78rem;color:var(--text-secondary);line-height:1.5;margin-top:.15rem;">${wrEscape(wrLocSummary(item, bestSummary))}</div></div>`
        : `<div style="margin-top:.3rem;font-size:.65rem;color:var(--text-muted);font-style:italic;">🔄 Gemini analysis pending</div>`;
      return `<article class="card card-shine" onclick="wrOpenCard('${wrEscape(item.id)}')" style="cursor:pointer; border-left:4px solid ${level.color}; animation:slideInUp .3s ease both; animation-delay:${index * .04}s;">
        <div class="card-content-wrapper"><div style="min-width:0;flex:1;">
          <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.45rem;"><span style="padding:.2rem .55rem;background:${level.dim};border:1px solid ${level.color}44;border-radius:999px;color:${level.color};font-size:.65rem;font-weight:700;">${level.label}</span><span class="tag tag-blue">${wrEscape(item.category)}</span><span class="tag">📍 ${wrEscape(wrDistrictLabel(item.district))}</span></div>
          <div style="font-size:.9rem;font-weight:700;line-height:1.35;margin-top:.4rem;">${wrEscape(wrTitle(item))}</div>
          ${summaryBlock}
          <div style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;margin-top:.55rem;">${item.tags.map(tag => `<span class="tag">${wrEscape(tag)}</span>`).join('')}<span style="margin-left:auto;font-size:.68rem;color:var(--text-muted);">🕐 ${wrTimeAgo(item.created_at)}</span></div>
        </div><div style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;justify-content:flex-end;" onclick="event.stopPropagation();"><select class="select-dropdown" style="max-width:9rem;font-size:.7rem;" aria-label="Action status" onchange="updateAlertAction('${wrEscape(item.id)}', this.value)">${Object.entries(WR_ACTION_LABELS).map(([value, label]) => `<option value="${value}"${action === value ? ' selected' : ''}>${wrT(label, WR_ACTION_LABELS_HI[value])}</option>`).join('')}</select><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); openAlertDetail('${wrEscape(item.id)}')">Details</button></div></div></article>`;
    }).join('') + (sortedNews.length > wrNewsVisibleCount ? `<button class="btn btn-ghost" style="align-self:center;margin-top:.25rem;" onclick="loadMoreNews()">${wrT(`Read more ${Math.min(wrNewsVisibleCount + 4, sortedNews.length)}/${sortedNews.length} news`, `और पढ़ें ${Math.min(wrNewsVisibleCount + 4, sortedNews.length)}/${sortedNews.length} खबरें`)}</button>` : '');
  }

  if (ytGrid) {
    if (!ytData.length) {
      ytGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><p class="empty-state-text">No YouTube videos available.</p></div>';
    } else {
      const channels = [...new Map(ytData.map(item => [item.source, ytData.filter(video => video.source === item.source)])).values()];
      const visibleChannels = channels.slice(0, wrYoutubeVisibleCount);
      ytGrid.innerHTML = visibleChannels.map((channel, idx) => renderYoutubeChannel(channel, idx)).join('') + 
        (channels.length > wrYoutubeVisibleCount ? `<button class="btn btn-ghost" style="align-self:center;margin-top:.25rem;" onclick="loadMoreYoutube()">See more YT channel news (${Math.min(wrYoutubeVisibleCount + 1, channels.length)}/${channels.length})</button>` : '');
    }
  }
}

function loadMoreNews() {
  wrNewsVisibleCount += 4;
  applyFilters();
}

function loadMoreYoutube() {
  wrYoutubeVisibleCount += 1;
  applyFilters();
}

function updateLevelCounts() {
  const counts = { critical: 0, developing: 0, watch: 0, routine: 0 };
  wrDisplayedNews.forEach(item => { counts[item.level]++; });
  Object.entries(counts).forEach(([level, count]) => { const el = document.getElementById(`wr-count-${level}`); if (el) el.textContent = count; });
}

function renderSources() {
  const el = document.getElementById('wr-sources');
  if (!el) return;
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:0.6rem;padding:0.4rem 0;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:0.85rem;color:var(--text-secondary);font-weight:600;">📡 NewsData.io (Primary)</span>
        <span style="font-size:0.75rem;color:var(--green);">● Live</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:0.85rem;color:var(--text-secondary);font-weight:600;">📰 Google News (Aggregator)</span>
        <span style="font-size:0.75rem;color:var(--green);">● Live</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:0.85rem;color:var(--text-secondary);font-weight:600;">▶️ YouTube API</span>
        <span style="font-size:0.75rem;color:var(--amber);">● Fallback</span>
      </div>
    </div>
    <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.8rem;line-height:1.4;">
      FastAPI backend merging multiple verified sources, categorizing by severity.
    </div>
  `;
}

function renderThreatGauge() {
  const canvas = document.getElementById('wr-threat-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (wrThreatChart) wrThreatChart.destroy();
  const critical = wrDisplayedNews.filter(item => item.level === 'critical').length;
  const score = Math.min(100, 20 + critical * 20 + wrDisplayedNews.filter(item => item.level === 'developing').length * 8);
  wrThreatChart = new Chart(canvas, { type: 'doughnut', data: { datasets: [{ data: [score, 100 - score], backgroundColor: ['#e63946', 'rgba(255,255,255,.05)'], borderWidth: 0, circumference: 180, rotation: 270 }] }, options: { responsive: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, cutout: '70%' } });
}

function renderCategoryChart() {
  const canvas = document.getElementById('wr-category-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (wrCategoryChart) wrCategoryChart.destroy();
  const categories = {};
  wrDisplayedNews.forEach(item => { categories[item.category] = (categories[item.category] || 0) + 1; });
  wrCategoryChart = new Chart(canvas, { type: 'bar', data: { labels: Object.keys(categories), datasets: [{ data: Object.values(categories), backgroundColor: 'rgba(74,158,255,.7)', borderRadius: 4 }] }, options: { responsive: true, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#5a6a84', precision: 0 }, grid: { color: 'rgba(255,255,255,.04)' } }, y: { ticks: { color: '#a8b4cc' }, grid: { display: false } } } } });
}

function setupSearch() {
  const input = document.getElementById('wr-search');
  if (!input || input.dataset.liveBound) return;
  input.dataset.liveBound = 'true';
  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    if (!query) { applyFilters(); return; }
    renderAlerts(wrDisplayedNews.filter(item => `${item.title} ${item.body} ${item.district} ${item.category}`.toLowerCase().includes(query)));
  });
}

// (District buttons use loadWarRoomRss — direct Live Hindustan RSS feeds)


async function loadWarRoomRss(source) {
  wrRssPanelId = source.startsWith('livehindustan') ? 'wr-livehindustan-panel' : 'wr-rss-panel';
  const panel = document.getElementById(wrRssPanelId);
  if (!panel) return;
  if (wrRssSource === source && wrRssItems.length) {
    const modal = document.getElementById('global-modal');
    if (modal?.classList.contains('open')) closeModal();
    else renderWarRoomRss(wrRssSourceName);
    return;
  }
  wrRssSource = source;
  wrRssExpanded = false;
  panel.innerHTML = '';
  try {
    const query = `?source=${encodeURIComponent(source)}`;
    let response;
    let lastError;
    for (const endpoint of [`/api/rss-news${query}`, `http://localhost:8000/api/rss-news${query}`]) {
      try {
        const candidate = await fetch(endpoint);
        if (candidate.ok) { response = candidate; break; }
        lastError = new Error(`RSS feed returned ${candidate.status}`);
      } catch (error) {
        lastError = error;
      }
    }
    if (!response) throw lastError || new Error('RSS feed is unavailable');
    if (!response.ok) throw new Error('RSS feed unavailable');
    const result = await response.json();
    wrRssItems = result.data || [];
    wrRssSourceName = result.source || source;
    renderWarRoomRss(result.source || source);
  } catch (error) {
    panel.innerHTML = `<p style="font-size:.72rem;color:var(--red);margin:0;">${wrEscape(error.message)}</p>`;
  }
}

function toggleWarRoomRssSource(source) {
  const panelId = source.startsWith('livehindustan') ? 'wr-livehindustan-panel' : 'wr-rss-panel';
  const panel = document.getElementById(panelId);
  if (!panel) return;
  if (wrRssSource === source && wrRssItems.length) {
    const modal = document.getElementById('global-modal');
    if (modal?.classList.contains('open')) closeModal();
    else renderWarRoomRss(wrRssSourceName);
    return;
  }
  loadWarRoomRss(source);
}

function renderWarRoomRss(sourceName) {
  const visibleItems = wrRssExpanded ? wrRssItems : wrRssItems.slice(0, 7);
  const content = `<div style="display:flex;flex-direction:column;gap:.25rem;max-height:65vh;overflow:auto;">${visibleItems.map((item, index) => `<a href="${wrEscape(item.url)}" target="_blank" rel="noopener noreferrer" style="display:block;padding:.8rem .25rem;border-top:1px solid var(--border-subtle);color:var(--text-secondary);font-size:.82rem;line-height:1.45;text-decoration:none;"><span style="display:flex;gap:.6rem;"><b style="color:var(--gold);min-width:1.3rem;">${index + 1}</b><span>${wrEscape(item.title)}<small style="display:block;color:var(--text-muted);margin-top:.25rem;">${wrEscape(item.published)} · Open article ↗</small></span></span></a>`).join('') || '<p style="color:var(--text-muted);margin:0;">No news available.</p>'}${wrRssItems.length > 7 ? `<button class="btn btn-ghost w-full" style="margin-top:.75rem;" onclick="toggleWarRoomRss()">${wrRssExpanded ? 'Show less' : `Full News (${wrRssItems.length - 7} more)`}</button>` : ''}</div>`;
  openModal(content, `📰 ${sourceName}`);
}

function toggleWarRoomRss() {
  wrRssExpanded = !wrRssExpanded;
  renderWarRoomRss(wrRssSourceName);
}

function wrDistrictLabel(district) {
  return /multiple/i.test(district || '') ? 'Bihar' : (district || 'General');
}

function wrOpenCard(id) {
  const item = (wrDisplayedNews.find(n => String(n.id) === String(id)) ||
                wrAllNews.find(n => String(n.id) === String(id)));
  if (item && item.url) window.open(item.url, '_blank', 'noopener,noreferrer');
  else openAlertDetail(id);
}

async function openAlertDetail(id) {
  const item = wrDisplayedNews.find(news => String(news.id) === String(id));
  if (!item) return;
  await wrLoadTranslations([item], true);
  const bestSum=wrLocSummary(item, wrBestSummary(item));const insightHtml=bestSum?`<div style="margin-bottom:1rem;padding:0.75rem;background:rgba(245,197,24,0.1);border-left:4px solid var(--gold);border-radius:4px;"><strong style="color:var(--gold);font-size:0.8rem;text-transform:uppercase;">Executive Insight</strong><p style="margin:0.25rem 0 0 0;font-size:0.9rem;line-height:1.5;">${wrEscape(bestSum)}</p></div>`:"";
  openModal(`${insightHtml}<p style="line-height:1.7;color:var(--text-secondary);">${wrEscape(wrLocBody(item))}</p><p style="font-size:.78rem;color:var(--text-muted);">📍 ${wrEscape(wrDistrictLabel(item.district))} · ${wrTimeAgo(item.created_at)}</p>`, wrEscape(wrTitle(item)));
}

function renderWarRoomError(message) {
  const grid = document.getElementById('wr-alerts-grid');
  if (grid) grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Live feed unavailable</h3><p class="empty-state-text">${wrEscape(message)}</p></div>`;
  const list = document.getElementById('wr-top-attention-list');
  if (list) list.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:1rem;"><p class="empty-state-text">${wrEscape(message)}</p></div>`;
  const ytGrid = document.getElementById('wr-yt-grid');
  if (ytGrid) ytGrid.innerHTML = '<div class="empty-state"><p class="empty-state-text">YouTube monitoring is temporarily unavailable.</p></div>';
}

window.openAlertDetail = openAlertDetail;
window.wrOpenCard = wrOpenCard;
window.filterByLevel = filterByLevel;
window.filterByCategory = filterByCategory;
window.filterByDistrict = filterByDistrict;
window.loadMoreNews = loadMoreNews;
window.loadMoreYoutube = loadMoreYoutube;
window.loadWarRoomRss = loadWarRoomRss;
window.toggleWarRoomRssSource = toggleWarRoomRssSource;
window.toggleWarRoomRss = toggleWarRoomRss;
window.toggleYoutubeExpansion = toggleYoutubeExpansion;
window.updateAlertAction = updateAlertAction;
window.triggerGeminiAnalysis = triggerGeminiAnalysis;
window.loadAnalyzedSummaries = loadAnalyzedSummaries;
window.loadIntelligenceSummary = loadIntelligenceSummary;


