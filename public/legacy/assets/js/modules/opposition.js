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

// ── Stat Counts ──────────────────────────────────────────────
function updateStatCounts(counts) {
  const map = {
    'Jan Suraaj':     'opp-count-jansuraaj',
    'INC':            'opp-count-inc',
    'RJD':            'opp-count-rjd',
    'Tejashwi Yadav': 'opp-count-tejashwi',
  };
  for (const [party, id] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.textContent = counts[party] ?? 0;
  }
}

// ── Party Switch (via clickable stat cards) ──────────────────
function switchOppParty(party) {
  oppCurrentParty = party;
  const cfg = PARTY_CONFIG[party];
  if (!cfg) return;

  // Highlight active party card
  document.querySelectorAll('.opp-stat-card').forEach(c => {
    c.classList.toggle('opp-stat-active', c.dataset.party === party);
  });

  // Update panel title
  const titleEl = document.getElementById('opp-news-panel-title');
  if (titleEl) titleEl.textContent = `${cfg.icon} ${cfg.label} — Live News`;

  // Update X pulse title
  const xTitleEl = document.getElementById('x-pulse-title');
  if (xTitleEl) xTitleEl.textContent = `𝕏 X Social Pulse — ${cfg.icon} ${cfg.label}`;

  // Show/hide panels using slugs
  document.querySelectorAll('.opp-party-panel').forEach(el => {
    el.style.display = 'none';
  });
  const panel = document.getElementById(`opp-panel-${cfg.slug}`);
  if (panel) panel.style.display = 'block';

  renderPartyPanel(party);
  renderXPulse();  // re-render X posts for the selected party
}

// ── News Category Filter (client-side classification) ────────
let oppCategoryFilter = 'All';

const CRITICAL_RE = /(attack|weaken|hasina|हमला|protest|प्रदर्शन|आंदोलन|agitation|arrest|गिरफ्तार|custody|scam|घोटाला|corrupt|भ्रष्ट|resign|इस्तीफा|strike|हिंसा|violence|clash|धरना|dharna|boycott|बहिष्कार|ultimatum|चेतावनी|warning|evm|election commission|चुनाव आयोग|bandh|बंद|riot|दागी|charge ?sheet|chargesheet|case filed|मुकदमा|ed\b|cbi|income tax|raid|छापा|threat|खतरा|warning)/i;
const HIGH_RE = /(rally|रैली|jali?an|sabri?yatra|yatra|यात्रा|march|कूच|campaign|अभियान|alliance|गठबंधन|mahagathbandhan|महागठबंधन|seat sharing|सीट|press conference|प्रेस कॉन्फ्रेंस|presser|statement|बयान|bjp|nitish|modi|shah|जेडीयू|jd\(u\)|hijack|target|निशाना|slogan|नारे|poster|होर्डिंग|meeting|बैठक|convention|सम्मेलन|padayatra|जन सुराज यात्रा|claim|दावा|challenge|चुनौती)/i;

function classifyNews(item) {
  const text = `${item.heading || ''} ${item.source_name || ''}`;
  if (CRITICAL_RE.test(text)) return 'Critical';
  if (HIGH_RE.test(text)) return 'High';
  return 'Normal';
}

function setOppCategory(cat) {
  oppCategoryFilter = cat;
  document.querySelectorAll('#opp-category-tabs .filter-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.cat === cat);
  });
  // Reset pagination for the current party when the filter changes
  oppVisibleCounts[`${oppCurrentParty}|${cat}`] = OPP_PAGE_SIZE;
  renderPartyPanel(oppCurrentParty);
}

// ── Render Party News Panel ──────────────────────────────────
const OPP_PAGE_SIZE = 5;
const oppVisibleCounts = {};

function oppCountKey(party) {
  return `${party}|${oppCategoryFilter}`;
}

function getOppVisibleCount(party) {
  const key = oppCountKey(party);
  if (typeof oppVisibleCounts[key] !== 'number') oppVisibleCounts[key] = OPP_PAGE_SIZE;
  return oppVisibleCounts[key];
}

function loadMoreOppNews(party) {
  const key = oppCountKey(party);
  oppVisibleCounts[key] = getOppVisibleCount(party) + OPP_PAGE_SIZE;
  renderPartyPanel(party);
}

function renderPartyPanel(party) {
  const cfg = PARTY_CONFIG[party];
  if (!cfg) return;

  const el = document.getElementById(`opp-panel-${cfg.slug}`);
  if (!el) return;

  const allItems = (oppNewsData[party] || []);
  const items = oppCategoryFilter === 'All'
    ? allItems
    : allItems.filter(it => classifyNews(it) === oppCategoryFilter);

  if (!items.length) {
    const msg = allItems.length && oppCategoryFilter !== 'All'
      ? `No ${esc(oppCategoryFilter)} news for ${esc(party)}.`
      : `No news yet for ${esc(party)}.`;
    el.innerHTML = `
      <div class="empty-state" style="padding:1.5rem;">
        <div class="empty-state-icon">📭</div>
        <p class="empty-state-text">${msg}</p>
        ${allItems.length ? '' : `
        <p style="font-size:.72rem;color:var(--text-muted);margin-top:.3rem;">
          Trigger the cron pipeline to fetch latest news from YouTube &amp; RSS.
        </p>`}
      </div>`;
    return;
  }

  const visibleCount = Math.min(getOppVisibleCount(party), items.length);
  const remaining    = items.length - visibleCount;

  const cards = items.slice(0, visibleCount).map((item, i) => {
    const isYt    = item.source_type === 'youtube';
    const srcIcon = isYt ? '▶️' : '📰';
    const badgeClr = isYt ? '#e63946' : '#4a9eff';
    const rawDate = item.published_at || item.created_at;
    const dateStr = rawDate
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

  const moreBtn = remaining > 0 ? `
    <button class="btn btn-ghost" onclick="loadMoreOppNews('${party}')"
            style="width:100%; margin-top:.5rem; padding:.55rem .9rem;
                   font-size:.72rem; font-weight:700; letter-spacing:.02em;">
      📰 Read ${Math.min(OPP_PAGE_SIZE, remaining)} More News ↓
      <span style="font-weight:500; color:var(--text-muted);">(${remaining} remaining)</span>
    </button>` : '';

  el.innerHTML = cards + moreBtn;
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
  loadOppositionXSocialPulse();

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
window.loadMoreOppNews   = loadMoreOppNews;
window.setOppCategory    = setOppCategory;


// ── X Social Pulse (party-wise) ──────────────────────────────
let xSocialPages = {
  xjansuraaj: 1,
  xinc: 1,
  xrahulgandi: 1,
  xrjd: 1,
  xtejwaniyd: 1
};

let xSocialData = null;

// Account → party mapping (party keys match PARTY_CONFIG)
const X_PULSE_ACCOUNTS = [
  { handle: '@jansuraajonline', table: 'xjansuraaj',   dataKey: 'jansuraaj',    party: 'Jan Suraaj' },
  { handle: '@INCBihar',        table: 'xinc',         dataKey: 'inc_bihar',    party: 'INC' },
  { handle: '@RahulGandhi',     table: 'xrahulgandi',  dataKey: 'rahul_gandhi', party: 'INC' },
  { handle: '@RJDforIndia',     table: 'xrjd',         dataKey: 'rjd_india',    party: 'RJD' },
  { handle: '@yadavtejashwi',   table: 'xtejwaniyd',   dataKey: 'tejashwi',     party: 'Tejashwi Yadav' },
];

async function loadOppositionXSocialPulse(force = false) {
  const container = document.getElementById('x-social-pulse-container');
  if (!container) return;

  if (force) {
    container.innerHTML = '<div class="empty-state" style="padding:1.5rem;"><div class="spinner"></div><p class="empty-state-text">Refreshing X Social Pulse...</p></div>';
    // Reset pages
    xSocialPages = { xjansuraaj: 1, xinc: 1, xrahulgandi: 1, xrjd: 1, xtejwaniyd: 1 };
  }

  try {
    const res = await fetch('/api/x-social?limit=5', { cache: 'no-store' });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const payload = await res.json();
    if (payload.error) throw new Error(payload.error);

    xSocialData = payload.data || {};
    renderXPulse();

  } catch (err) {
    console.error('[X-Social] fetch failed:', err.message);
    container.innerHTML = `<div class="empty-state" style="padding:1.5rem;"><p class="empty-state-text" style="color:var(--red);">Failed to load X Pulse: ${esc(err.message)}</p></div>`;
  }
}

function renderXPulse() {
  const container = document.getElementById('x-social-pulse-container');
  if (!container) return;

  if (!xSocialData) return; // still loading — fetch will render when done

  const cfg = PARTY_CONFIG[oppCurrentParty] || {};
  const accounts = X_PULSE_ACCOUNTS.filter(a => a.party === oppCurrentParty);

  if (!accounts.length) {
    container.innerHTML = `<div class="empty-state" style="padding:1.5rem;"><p class="empty-state-text">No X accounts mapped for ${esc(oppCurrentParty)}.</p></div>`;
    return;
  }

  container.innerHTML = `
    <div style="border-left: 2px solid ${cfg.color || 'var(--blue)'}; padding-left: 1rem;">
      <h3 style="margin-top:0; margin-bottom:1rem; font-size:1.1rem; color:var(--text-primary);">${cfg.icon || ''} ${esc(cfg.label || oppCurrentParty)}</h3>
      <div style="display:flex; flex-direction:column; gap:1.5rem;">
        ${accounts.map(acc => `
          <div id="x-group-${acc.table}">
            <div style="font-size:0.85rem; font-weight:600; color:var(--text-secondary); margin-bottom:0.75rem;">${acc.handle}</div>
            <div class="x-posts-grid" id="x-posts-${acc.table}" style="display:flex; flex-direction:column; gap:0.75rem; margin-bottom:0.75rem;">
              ${renderXPosts(xSocialData[acc.dataKey] || [])}
            </div>
            <button class="btn btn-ghost btn-sm" onclick="loadMoreXPosts('${acc.table}')" id="x-btn-${acc.table}">Read More ↓</button>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function renderXPosts(posts) {
  if (!posts || posts.length === 0) {
    return `<div style="font-size:0.8rem; color:var(--text-muted); padding:0.5rem; background:rgba(255,255,255,0.02); border-radius:var(--radius-sm);">No recent posts found.</div>`;
  }
  
  return posts.map(post => {
    const d = new Date(post.published_at);
    const dateStr = isNaN(d.getTime()) ? 'Recent' : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `
      <div style="padding:0.75rem; background:var(--glass-bg); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); transition:border-color 0.2s; display:flex; gap:0.65rem; align-items:flex-start;">
        <div style="flex:1; min-width:0;">
          <div style="font-size:0.85rem; color:var(--text-primary); margin-bottom:0.5rem; line-height:1.4;">
            ${esc(post.heading)}
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.7rem; color:var(--text-muted);">
            <span>${dateStr}</span>
            <a href="${esc(post.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--blue); text-decoration:none;">Source ↗</a>
          </div>
        </div>
        ${post.image_url ? `<img src="${esc(post.image_url)}" alt="" loading="lazy" onerror="this.style.display='none'"
              style="width:64px; height:64px; object-fit:cover; border-radius:6px; border:1px solid var(--border-subtle); flex-shrink:0;">` : ''}
      </div>
    `;
  }).join('');
}

async function loadMoreXPosts(table) {
  const btn = document.getElementById(`x-btn-${table}`);
  const grid = document.getElementById(`x-posts-${table}`);
  if (!btn || !grid) return;
  
  btn.innerText = 'Loading...';
  btn.disabled = true;
  
  const page = xSocialPages[table] || 1;
  const limit = 5;
  const offset = page * limit;
  
  try {
    const res = await fetch(`/api/x-social?table=${table}&limit=${limit}&offset=${offset}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const payload = await res.json();
    
    if (payload.data && payload.data.length > 0) {
      grid.insertAdjacentHTML('beforeend', renderXPosts(payload.data));
      xSocialPages[table] = page + 1;
      btn.innerText = 'Read More ↓';
      btn.disabled = false;
    } else {
      btn.innerText = 'No more posts';
      btn.disabled = true;
    }
  } catch (err) {
    console.error(`[X-Social] loadMore failed for ${table}:`, err.message);
    btn.innerText = 'Error loading more';
    setTimeout(() => { btn.innerText = 'Read More ↓'; btn.disabled = false; }, 2000);
  }
}
