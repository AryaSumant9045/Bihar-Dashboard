/* ============================================================
   OPPOSITION LIVE MODULE — v2 (live pipeline, slug-safe IDs)
   ============================================================
   Polls /api/opposition-live every 90 seconds.
   Renders: AI Summary card + Party tabs (Jan Suraaj/INC/RJD/Tejashwi)
   Design: War Room dark theme, orange accent, severity badges
   ============================================================ */

// ── State ────────────────────────────────────────────────────
let oppCurrentParty = 'Jan Suraaj';
let oppPollTimer    = null;
let oppNewsData     = {};
let oppSummaryData  = null;
// Pagination: how many items are visible per party
const oppPageState  = { 'Jan Suraaj': 5, 'INC': 5, 'RJD': 5, 'Tejashwi Yadav': 5 };
const OPP_INITIAL_COUNT = 5;
const OPP_LOAD_MORE     = 10;

// Party config — slug MUST match panel IDs in opposition.html
const PARTY_CONFIG = {
  'Jan Suraaj':     { slug: 'jansuraaj', color: 'var(--amber)', hex: '#ff9f43', icon: '🟠', label: 'Jan Suraaj' },
  'INC':            { slug: 'inc',       color: 'var(--blue)',  hex: '#4a9eff', icon: '🔵', label: 'INC Bihar'  },
  'RJD':            { slug: 'rjd',       color: 'var(--red)',   hex: '#e63946', icon: '🔴', label: 'RJD'        },
  'Tejashwi Yadav': { slug: 'tejashwi',  color: '#c084fc',     hex: '#c084fc', icon: '🟣', label: 'Tejashwi'   },
};

const SEVERITY_CFG = {
  Critical: { color: 'var(--red)',   bg: 'rgba(230,57,70,0.12)',  cls: 'tag-red',   icon: '🔴' },
  High:     { color: 'var(--amber)', bg: 'rgba(255,159,67,0.12)', cls: 'tag-amber', icon: '🟠' },
  Medium:   { color: 'var(--gold)',  bg: 'rgba(245,197,24,0.10)', cls: 'tag-gold',  icon: '🟡' },
  Low:      { color: 'var(--green)', bg: 'rgba(38,222,129,0.08)', cls: 'tag-green', icon: '🟢' },
};

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]
  ));
}

// ── Entry Point ──────────────────────────────────────────────
function initOpposition() {
  loadOppositionXActivity();
  fetchAndRenderOppositionLive();   // immediate first load
  startOppositionAutoPoll();        // auto-refresh every 90s
}

// ── Auto-Poll ────────────────────────────────────────────────
function startOppositionAutoPoll() {
  if (oppPollTimer) clearInterval(oppPollTimer);
  oppPollTimer = setInterval(fetchAndRenderOppositionLive, 90_000);
}

// ── Cleanup (called by app.js destroy hook on page leave) ────
function destroyOpposition() {
  if (oppPollTimer) { clearInterval(oppPollTimer); oppPollTimer = null; }
}

// ── Fetch & Render ───────────────────────────────────────────
async function fetchAndRenderOppositionLive() {
  try {
    const res = await fetch('/api/opposition-live', { cache: 'no-store' });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const payload = await res.json();
    if (payload.error) throw new Error(payload.error);

    oppNewsData    = payload.news    || {};
    oppSummaryData = payload.summary || null;

    updateStatCounts(payload.counts || {});
    renderOppositionSummary(oppSummaryData);
    renderPartyPanel(oppCurrentParty);  // re-render active tab
  } catch (err) {
    console.error('[Opposition] fetch failed:', err.message);
    showSummaryError('Live data unavailable — ' + err.message);
  }
}

// ── Stat Counts + Clickable Cards ────────────────────────────
function updateStatCounts(counts) {
  const map = {
    'Jan Suraaj':     { countId: 'opp-count-jansuraaj', cardId: 'opp-stat-jansuraaj' },
    'INC':            { countId: 'opp-count-inc',        cardId: 'opp-stat-inc'        },
    'RJD':            { countId: 'opp-count-rjd',        cardId: 'opp-stat-rjd'        },
    'Tejashwi Yadav': { countId: 'opp-count-tejashwi',   cardId: 'opp-stat-tejashwi'   },
  };
  for (const [party, ids] of Object.entries(map)) {
    const countEl = document.getElementById(ids.countId);
    if (countEl) countEl.textContent = counts[party] ?? 0;

    // Make the card clickable → switch party tab + scroll to news section
    const cardEl = document.getElementById(ids.cardId);
    if (cardEl) {
      cardEl.style.cursor = 'pointer';
      cardEl.onclick = () => {
        switchOppParty(party);
        const newsSection = document.getElementById('opp-news-section');
        if (newsSection) newsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    }
  }
}

// ── Party Tab Switch ─────────────────────────────────────────
function switchOppParty(party) {
  oppCurrentParty = party;
  const cfg = PARTY_CONFIG[party];
  if (!cfg) return;

  // Update tab pills
  document.querySelectorAll('#opp-party-tabs .filter-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.slug === cfg.slug);
  });

  // Update panel title
  const titleEl = document.getElementById('opp-news-panel-title');
  if (titleEl) titleEl.textContent = `${cfg.icon} ${cfg.label} — Live News`;

  // Show/hide panels using slugs
  document.querySelectorAll('.opp-party-panel').forEach(el => {
    el.style.display = 'none';
  });
  const panel = document.getElementById(`opp-panel-${cfg.slug}`);
  if (panel) panel.style.display = 'block';

  renderPartyPanel(party);
}

// ── Render Party News Panel ──────────────────────────────────
function renderPartyPanel(party) {
  const cfg = PARTY_CONFIG[party];
  if (!cfg) return;

  const el = document.getElementById(`opp-panel-${cfg.slug}`);
  if (!el) return;

  const items = (oppNewsData[party] || []);

  if (!items.length) {
    el.innerHTML = `
      <div class="empty-state" style="padding:1.5rem;">
        <div class="empty-state-icon">📭</div>
        <p class="empty-state-text">No news yet for ${esc(party)}.</p>
        <p style="font-size:.72rem;color:var(--text-muted);margin-top:.3rem;">
          Trigger the cron pipeline to fetch latest news from YouTube &amp; RSS.
        </p>
      </div>`;
    return;
  }

  // How many to show right now
  const visible = Math.min(oppPageState[party] || OPP_INITIAL_COUNT, items.length);
  const shownItems = items.slice(0, visible);
  const remaining  = items.length - visible;

  // Build news cards HTML
  const cardsHtml = shownItems.map((item, i) => {
    const isYt     = item.source_type === 'youtube';
    const srcIcon  = isYt ? '▶️' : '📰';
    const badgeClr = isYt ? '#e63946' : '#4a9eff';
    const rawDate  = item.published_at || item.created_at;
    const dateStr  = rawDate
      ? new Date(rawDate).toLocaleString('en-IN', {
          day: '2-digit', month: 'short',
          hour: '2-digit', minute: '2-digit', hour12: true,
        })
      : '';

    return `
      <div class="card card-shine"
        style="border-left:3px solid ${cfg.hex}; margin-bottom:.55rem; padding:.7rem .95rem;
               animation:slideInUp 0.3s ease both; animation-delay:${Math.min(i * 0.03, 0.4)}s;">
        <div style="display:flex; align-items:flex-start; gap:.6rem;">
          <span style="font-size:.72rem; font-weight:700; color:${cfg.hex}; flex-shrink:0;
                       min-width:1.4rem; text-align:right; margin-top:.15rem;">${i + 1}.</span>
          <span style="font-size:.85rem; flex-shrink:0; margin-top:.1rem;">${srcIcon}</span>
          <div style="flex:1; min-width:0;">
            <div style="font-size:.83rem; font-weight:600; color:var(--text-primary);
                        line-height:1.42; margin-bottom:.3rem;">
              ${item.url
                ? `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"
                      style="color:inherit; text-decoration:none;"
                      onmouseover="this.style.color='${cfg.hex}'"
                      onmouseout="this.style.color='inherit'">${esc(item.heading)}</a>`
                : esc(item.heading)}
            </div>
            <div style="display:flex; align-items:center; gap:.45rem; flex-wrap:wrap;">
              <span style="font-size:.62rem; font-weight:700; padding:.12rem .4rem;
                           background:${badgeClr}22; border:1px solid ${badgeClr}44;
                           border-radius:var(--radius-sm); color:${badgeClr};">
                ${srcIcon} ${esc(item.source_name || (isYt ? 'YouTube' : 'RSS'))}
              </span>
              ${dateStr
                ? `<span style="font-size:.66rem; color:var(--text-muted);">🕐 ${esc(dateStr)}</span>`
                : ''}
              ${item.url
                ? `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"
                      class="btn btn-ghost btn-sm"
                      style="font-size:.63rem; padding:.12rem .4rem; margin-left:auto;">
                      ${isYt ? '▶ Watch' : '↗ Read'}
                   </a>`
                : ''}
            </div>
          </div>
        </div>
      </div>`;
  }).join('');

  // "Load more" button if there are more items left
  const loadMoreHtml = remaining > 0 ? `
    <div style="text-align:center; margin-top:.75rem;">
      <button
        onclick="oppLoadMore('${party}')"
        style="background:${cfg.hex}18; border:1px solid ${cfg.hex}44; color:${cfg.hex};
               border-radius:var(--radius-md); padding:.55rem 1.4rem; font-size:.78rem;
               font-weight:600; cursor:pointer; transition:background .2s;"
        onmouseover="this.style.background='${cfg.hex}30'"
        onmouseout="this.style.background='${cfg.hex}18'">
        📰 Load ${Math.min(OPP_LOAD_MORE, remaining)} more
        <span style="opacity:.6; font-weight:400;">(${remaining} remaining)</span>
      </button>
    </div>` : `
    <div style="text-align:center; margin-top:.6rem;">
      <span style="font-size:.7rem; color:var(--text-muted);">✅ All ${items.length} news items loaded</span>
    </div>`;

  el.innerHTML = cardsHtml + loadMoreHtml;
}

// ── Load More ────────────────────────────────────────────────
function oppLoadMore(party) {
  oppPageState[party] = (oppPageState[party] || OPP_INITIAL_COUNT) + OPP_LOAD_MORE;
  renderPartyPanel(party);
}

// ── Render AI Summary Card ───────────────────────────────────
function renderOppositionSummary(summary) {
  const cardEl  = document.getElementById('opp-summary-card');
  const timeEl  = document.getElementById('opp-summary-time');
  const badgeEl = document.getElementById('opp-summary-badge');
  if (!cardEl) return;

  if (!summary) {
    cardEl.innerHTML = `
      <div class="empty-state" style="padding:.85rem;">
        <div class="empty-state-icon">🤖</div>
        <p class="empty-state-text">No AI summary yet.</p>
        <p style="font-size:.72rem; color:var(--text-muted); margin-top:.25rem;">
          Run <code style="background:rgba(255,255,255,0.07);padding:.1rem .3rem;border-radius:4px;">
          /api/cron/opposition-pipeline</code> to generate one.
        </p>
      </div>`;
    if (timeEl) timeEl.textContent = 'Not generated';
    return;
  }

  // Timestamp + count badge
  if (timeEl && summary.created_at) {
    timeEl.textContent = new Date(summary.created_at).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
    });
  }
  if (badgeEl && summary.news_count) {
    badgeEl.textContent = `${summary.news_count} headlines analysed`;
    badgeEl.style.display = 'inline-flex';
  }

  const parts = [];

  // ── Overall Situation ──
  if (summary.overall_situation) {
    parts.push(`
      <div style="padding:.8rem 1rem; background:rgba(168,85,247,0.08);
                  border:1px solid rgba(168,85,247,0.22); border-radius:var(--radius-md);
                  margin-bottom:.85rem;">
        <div style="font-size:.62rem; font-weight:700; text-transform:uppercase;
                    letter-spacing:.08em; color:#c084fc; margin-bottom:.35rem;">
          📊 Overall Situation
        </div>
        <p style="font-size:.83rem; color:var(--text-primary); line-height:1.65; margin:0;">
          ${esc(summary.overall_situation)}
        </p>
      </div>`);
  }

  // ── 3-column grid ──
  const cols = [];

  // Attacks on BJP
  const attacks = Array.isArray(summary.attacks_on_bjp) ? summary.attacks_on_bjp : [];
  if (attacks.length) {
    cols.push(`
      <div>
        <div style="font-size:.62rem; font-weight:700; text-transform:uppercase;
                    letter-spacing:.08em; color:var(--red); margin-bottom:.45rem;">⚔️ BJP पर Attack</div>
        <div style="display:flex; flex-direction:column; gap:.38rem;">
          ${attacks.map(a => {
            const s = SEVERITY_CFG[a.severity] || SEVERITY_CFG.Medium;
            return `
              <div style="padding:.5rem .7rem; background:${s.bg};
                          border-radius:var(--radius-md); border-left:3px solid ${s.color};">
                <div style="display:flex; align-items:center; gap:.35rem; margin-bottom:.18rem; flex-wrap:wrap;">
                  <span class="tag ${s.cls}" style="font-size:.58rem;">${s.icon} ${esc(a.severity)}</span>
                  <span style="font-size:.7rem; font-weight:600; color:var(--text-primary);">${esc(a.party)}</span>
                </div>
                <div style="font-size:.73rem; color:var(--text-secondary); line-height:1.48;">
                  ${esc(a.attack_summary)}
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`);
  }

  // Risk to BJP
  const risks = Array.isArray(summary.risk_to_bjp) ? summary.risk_to_bjp : [];
  if (risks.length) {
    cols.push(`
      <div>
        <div style="font-size:.62rem; font-weight:700; text-transform:uppercase;
                    letter-spacing:.08em; color:var(--amber); margin-bottom:.45rem;">⚠️ BJP के लिए Risk</div>
        <div style="display:flex; flex-direction:column; gap:.38rem;">
          ${risks.map(r => {
            const s = SEVERITY_CFG[r.risk_level] || SEVERITY_CFG.Medium;
            return `
              <div style="padding:.5rem .7rem; background:${s.bg};
                          border-radius:var(--radius-md); border-left:3px solid ${s.color};">
                <div style="margin-bottom:.18rem;">
                  <span class="tag ${s.cls}" style="font-size:.58rem;">${s.icon} ${esc(r.risk_level)}</span>
                </div>
                <div style="font-size:.73rem; font-weight:600; color:var(--text-primary); margin-bottom:.15rem;">
                  ${esc(r.issue)}
                </div>
                <div style="font-size:.7rem; color:var(--text-secondary); line-height:1.45;">
                  ${esc(r.reason)}
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`);
  }

  // Counter Strategy
  const counter = Array.isArray(summary.counter_strategy_points) ? summary.counter_strategy_points : [];
  if (counter.length) {
    cols.push(`
      <div>
        <div style="font-size:.62rem; font-weight:700; text-transform:uppercase;
                    letter-spacing:.08em; color:var(--green); margin-bottom:.45rem;">🛡 Counter Strategy</div>
        <div style="display:flex; flex-direction:column; gap:.38rem;">
          ${counter.map((pt, i) => `
            <div style="padding:.5rem .7rem; background:rgba(38,222,129,0.06);
                        border-radius:var(--radius-md); border-left:3px solid rgba(38,222,129,0.4);
                        display:flex; gap:.45rem; align-items:flex-start;">
              <span style="font-size:.68rem; font-weight:700; color:var(--green); flex-shrink:0;">${i+1}.</span>
              <span style="font-size:.73rem; color:var(--text-secondary); line-height:1.48;">${esc(pt)}</span>
            </div>`).join('')}
        </div>
      </div>`);
  }

  if (cols.length) {
    parts.push(`
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr));
                  gap:.8rem; margin-bottom:.85rem;">
        ${cols.join('')}
      </div>`);
  }

  // ── Party-wise Activity ──
  const partyAct = Array.isArray(summary.party_wise_activity) ? summary.party_wise_activity : [];
  if (partyAct.length) {
    parts.push(`
      <div style="border-top:1px solid var(--border-subtle); padding-top:.75rem; margin-top:.1rem;">
        <div style="font-size:.62rem; font-weight:700; text-transform:uppercase;
                    letter-spacing:.08em; color:var(--text-muted); margin-bottom:.45rem;">
          🏛️ Party-wise Activity
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:.45rem;">
          ${partyAct.map(p => {
            const cfg = PARTY_CONFIG[p.party] || { hex: '#a855f7', icon: '🔹' };
            const issues = Array.isArray(p.key_issues_raised) ? p.key_issues_raised : [];
            return `
              <div style="padding:.6rem .8rem; background:var(--glass-bg);
                          border:1px solid ${cfg.hex}33; border-top:2px solid ${cfg.hex};
                          border-radius:var(--radius-md);">
                <div style="font-size:.72rem; font-weight:700; color:${cfg.hex}; margin-bottom:.25rem;">
                  ${cfg.icon} ${esc(p.party)}
                </div>
                <div style="font-size:.73rem; color:var(--text-secondary); line-height:1.48; margin-bottom:.25rem;">
                  ${esc(p.activity_summary)}
                </div>
                ${issues.length
                  ? `<div style="display:flex; flex-wrap:wrap; gap:.2rem;">
                       ${issues.slice(0,3).map(iss => `<span class="tag" style="font-size:.58rem;">${esc(iss)}</span>`).join('')}
                     </div>`
                  : ''}
              </div>`;
          }).join('')}
        </div>
      </div>`);
  }

  // ── BJP Advantage Points ──
  const adv = Array.isArray(summary.bjp_advantage_points) ? summary.bjp_advantage_points : [];
  if (adv.length) {
    parts.push(`
      <div style="border-top:1px solid var(--border-subtle); padding-top:.75rem; margin-top:.5rem;">
        <div style="font-size:.62rem; font-weight:700; text-transform:uppercase;
                    letter-spacing:.08em; color:var(--gold); margin-bottom:.45rem;">
          ✅ BJP Advantage (Opposition Weakness)
        </div>
        <div style="display:flex; flex-direction:column; gap:.32rem;">
          ${adv.map(pt => `
            <div style="padding:.45rem .7rem; background:rgba(245,197,24,0.07);
                        border-radius:var(--radius-md); border-left:3px solid rgba(245,197,24,0.4);
                        display:flex; gap:.4rem; align-items:flex-start;">
              <span style="color:var(--gold); flex-shrink:0; font-size:.75rem;">✓</span>
              <span style="font-size:.73rem; color:var(--text-secondary); line-height:1.48;">${esc(pt)}</span>
            </div>`).join('')}
        </div>
      </div>`);
  }

  cardEl.innerHTML = parts.join('') ||
    `<p style="color:var(--text-muted); font-size:.8rem; padding:.5rem;">Summary data incomplete.</p>`;
}

function showSummaryError(msg) {
  const el = document.getElementById('opp-summary-card');
  if (el) el.innerHTML = `
    <div class="empty-state" style="padding:.75rem;">
      <div class="empty-state-icon">⚠️</div>
      <p class="empty-state-text">${esc(msg)}</p>
    </div>`;
}

// ── X Social Section ─────────────────────────────────────────
const OPP_X_ACCOUNTS = [
  { party: 'INC',        label: '@INCBihar',        url: 'https://x.com/INCBihar' },
  { party: 'RJD',        label: '@RJDforIndia',     url: 'https://x.com/RJDforIndia' },
  { party: 'RJD',        label: '@yadavtejashwi',   url: 'https://x.com/yadavtejashwi' },
  { party: 'Jan Suraaj', label: '@jansuraajonline',  url: 'https://x.com/jansuraajonline' },
  { party: 'INC',        label: '@RahulGandhi',     url: 'https://x.com/RahulGandhi' },
];

const OPP_X_PARTIES = [
  { name: 'Jan Suraaj',    color: 'var(--amber)', desc: 'Prashant Kishor / Jan Suraaj', keys: ['Jan Suraaj'] },
  { name: 'INC / Congress', color: 'var(--blue)', desc: 'Bihar Congress & Rahul Gandhi',  keys: ['INC'] },
  { name: 'RJD',            color: 'var(--red)',  desc: 'RJD & Tejashwi Yadav',          keys: ['RJD'] },
];

function loadOppositionXActivity() {
  const el = document.getElementById('opp-x-accounts');
  if (el) {
    el.innerHTML = OPP_X_PARTIES.map(p => {
      const accs = OPP_X_ACCOUNTS.filter(a => p.keys.includes(a.party));
      return `
        <article style="padding:.8rem; border:1px solid ${p.color}55; border-top:3px solid ${p.color};
                        border-radius:var(--radius-lg); background:var(--glass-bg);">
          <div style="display:flex; justify-content:space-between; align-items:center;
                      gap:.5rem; margin-bottom:.3rem;">
            <strong style="color:${p.color}; font-size:.82rem;">𝕏 ${p.name}</strong>
            <span class="tag">${accs.length} accounts</span>
          </div>
          <div style="font-size:.68rem; color:var(--text-muted); line-height:1.4; margin-bottom:.55rem;">
            ${p.desc}
          </div>
          <div style="display:flex; flex-direction:column; gap:.3rem;">
            ${accs.map(a =>
              `<a class="tag" href="${a.url}" target="_blank" rel="noopener noreferrer">↗ ${a.label}</a>`
            ).join('')}
          </div>
        </article>`;
    }).join('');
  }

  // Load Twitter widget
  const feedEl = document.getElementById('opp-twitter-feed');
  if (feedEl) {
    if (window.twttr && window.twttr.widgets) {
      window.twttr.widgets.load(feedEl);
    } else {
      const s = document.createElement('script');
      s.async = true; s.charset = 'UTF-8';
      s.src = 'https://platform.twitter.com/widgets.js';
      document.head.appendChild(s);
    }
  }
}

// ── Global Exports ───────────────────────────────────────────
window.initOpposition    = initOpposition;
window.destroyOpposition = destroyOpposition;
window.switchOppParty    = switchOppParty;
window.oppLoadMore       = oppLoadMore;
