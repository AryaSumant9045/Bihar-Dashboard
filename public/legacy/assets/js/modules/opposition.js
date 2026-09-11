/* ============================================================
   OPPOSITION MODULE — Intel Cards + Analysis
   ============================================================ */

let oppCurrentView = 'intel';
let oppIntelFilter = 'all';
let oppPartyFilter = 'all';
let oppSentimentChartInst = null;

function initOpposition() {
  loadLiveOppositionActivity();
  loadOppositionXActivity();
  renderIntelCards();
  renderPartyCards();
  renderNarratives();
  renderHeatmap();
  renderSentimentChart();
  renderCounterStrategy();
  renderWeakness();
  setupIntelFilters();
}

const OPPOSITION_X_ACCOUNTS = [
  { party: 'INC', label: '@INCBihar', url: 'https://x.com/INCBihar' },
  { party: 'RJD', label: '@RJDforIndia', url: 'https://x.com/RJDforIndia' },
  { party: 'RJD', label: '@yadavtejashwi', url: 'https://x.com/yadavtejashwi' },
  { party: 'Jan Suraaj', label: '@jansuraajonline', url: 'https://x.com/jansuraajonline' },
  { party: 'Congress', label: '@RahulGandhi', url: 'https://x.com/RahulGandhi' }
];

const OPPOSITION_X_PARTIES = [
  { name: 'Jan Suraaj', color: 'var(--amber)', description: 'Jan Suraaj / Prashant Kishor public updates', accounts: ['Jan Suraaj'] },
  { name: 'INC / Congress', color: 'var(--blue)', description: 'Bihar Congress and national leadership', accounts: ['INC', 'Congress'] },
  { name: 'RJD', color: 'var(--red)', description: 'Official RJD and Tejashwi Yadav', accounts: ['RJD'] }
];

function renderOppositionXAccounts() {
  const el = document.getElementById('opp-x-accounts');
  if (!el) return;
  el.innerHTML = OPPOSITION_X_PARTIES.map(party => {
    const accounts = OPPOSITION_X_ACCOUNTS.filter(account => party.accounts.includes(account.party));
    return `<article style="padding:.85rem;border:1px solid ${party.color}55;border-top:3px solid ${party.color};border-radius:var(--radius-lg);background:var(--glass-bg);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.35rem;"><strong style="color:${party.color};font-size:.85rem;">𝕏 ${party.name}</strong><span class="tag">${accounts.length} accounts</span></div>
      <div style="font-size:.7rem;color:var(--text-muted);line-height:1.4;margin-bottom:.65rem;">${party.description}</div>
      <div style="display:flex;flex-direction:column;gap:.35rem;">${accounts.map(account => `<a class="tag" href="${account.url}" target="_blank" rel="noopener noreferrer" title="Open ${account.label}">↗ ${account.label}</a>`).join('')}</div>
    </article>`;
  }).join('');
}

function loadOppositionXActivity() {
  renderOppositionXAccounts();
  const feed = document.getElementById('curator-feed-default-feed-layout');
  if (!feed || feed.dataset.curatorLoaded === 'true') return;
  feed.dataset.curatorLoaded = 'true';
  feed.innerHTML = '<a href="https://curator.io" target="_blank" rel="noopener noreferrer" class="crt-logo crt-tag">Powered by Curator.io</a>';
  const script = document.createElement('script');
  script.async = true;
  script.charset = 'UTF-8';
  script.src = 'https://cdn.curator.io/published/9c99d3de-c526-4613-93e2-12ba597ad503.js';
  feed.appendChild(script);
}

let oppLiveExpanded = {};

function renderLiveOppositionActivity(items) {
  const el = document.getElementById('opp-live-feed');
  if (!el) return;
  const groups = [...new Map(items.map(item => [item.who, items.filter(video => video.who === item.who)])).values()];
  if (!groups.length) { el.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:1rem;"><p class="empty-state-text">No live public activity available.</p></div>'; return; }
  const colors = { RJD: 'var(--red)', INC: 'var(--blue)', 'Jan Suraaj': 'var(--amber)' };
  el.innerHTML = groups.map(group => {
    const name = group[0].who;
    const visible = group.slice(0, oppLiveExpanded[name] ? 10 : 3);
    return `<div style="grid-column:1/-1;padding:.85rem;border:1px solid var(--border-subtle);border-radius:var(--radius-lg);background:var(--glass-bg);"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.65rem;"><strong style="color:${colors[group[0].party] || 'var(--text-primary)'};">▶ ${wrOppEscape(name)} <span class="tag">${wrOppEscape(group[0].party)}</span></strong><span class="tag tag-red">${group.length} updates</span></div><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem;">${visible.map(item => `<article class="card card-shine" style="border-left:3px solid ${colors[item.party] || 'var(--red)'};"><div style="font-size:.8rem;font-weight:700;line-height:1.35;">${wrOppEscape(item.title)}</div><div style="font-size:.7rem;color:var(--text-muted);margin-top:.45rem;">📍 ${wrOppEscape(item.where)} · ${wrOppEscape(item.published)}</div><div style="display:flex;gap:.35rem;margin-top:.65rem;"><a class="btn btn-ghost btn-sm" href="${wrOppEscape(item.url)}" target="_blank" rel="noopener noreferrer">▶ Watch</a><button class="btn btn-ghost btn-sm" onclick="showToast('Public Activity','Added to opposition review queue','info')">Review</button></div></article>`).join('')}${group.length > 3 ? `<button class="btn btn-ghost btn-sm" style="grid-column:1/-1;justify-self:center;" onclick="toggleOppLive('${wrOppEscape(name)}')">${oppLiveExpanded[name] ? 'Show less' : `See more (${Math.min(group.length, 10) - 3} more)`}</button>` : ''}</div></div>`;
  }).join('');
}

function wrOppEscape(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]); }
function toggleOppLive(channel) { oppLiveExpanded[channel] = !oppLiveExpanded[channel]; loadLiveOppositionActivity(); }
async function loadLiveOppositionActivity() {
  try {
    const response = await fetch('/api/opposition', { cache: 'no-store' });
    if (!response.ok) throw new Error('Live opposition feed unavailable');
    renderLiveOppositionActivity((await response.json()).data || []);
  } catch (error) {
    const el = document.getElementById('opp-live-feed');
    if (el) el.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:1rem;"><p class="empty-state-text">${wrOppEscape(error.message)}</p></div>`;
  }
}

/* ── View Switch ───────────────────────────────────────────── */
function switchOppView(view) {
  oppCurrentView = view;
  document.querySelectorAll('#opp-view-tabs .filter-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.view === view);
  });
  document.getElementById('opp-intel-view').style.display = view === 'intel' ? 'block' : 'none';
  document.getElementById('opp-analysis-view').style.display = view === 'analysis' ? 'block' : 'none';
  if (view === 'analysis') {
    setTimeout(() => { renderSentimentChart(); }, 80);
  }
}

/* ── Intel Cards ────────────────────────────────────────────── */
function renderIntelCards(filter = 'all', partyF = 'all') {
  const el = document.getElementById('opp-intel-cards');
  if (!el) return;
  let data = OPPOSITION_DATA.intelCards;
  if (filter !== 'all') data = data.filter(c => c.status === filter);
  if (partyF !== 'all') data = data.filter(c => c.party === partyF);
  if (!data.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">✅</div><p>No intel cards match filter.</p></div>`;
    return;
  }
  const statusConfig = {
    critical: { color: 'var(--red)', bg: 'var(--red-dim)', label: '🔴 CRITICAL', glow: true },
    developing: { color: 'var(--amber)', bg: 'var(--amber-dim)', label: '🟠 DEVELOPING', glow: false },
    watch: { color: 'var(--gold)', bg: 'var(--gold-dim)', label: '🟡 WATCH', glow: false },
    routine: { color: 'var(--green)', bg: 'var(--green-dim)', label: '🟢 ROUTINE', glow: false },
  };
  el.innerHTML = data.map((card, i) => {
    const sc = statusConfig[card.status] || statusConfig.watch;
    const partyColor = { RJD: '#e63946', INC: '#4a9eff', 'Jan Suraaj': '#ff9f43', Left: '#ff4d4d' }[card.party] || '#a855f7';
    return `
      <div class="card card-shine" style="border-left:4px solid ${sc.color}; animation:slideInUp 0.35s ease both; animation-delay:${i * 0.08}s; ${sc.glow ? 'box-shadow:0 0 20px rgba(230,57,70,0.15)' : ''};">

        <!-- Intel Card Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:0.5rem;">
          <div style="display:flex;align-items:center;gap:0.75rem;">
            <div style="padding:0.3rem 0.6rem;background:${partyColor}22;border:1px solid ${partyColor}44;border-radius:var(--radius-sm);font-size:0.72rem;font-weight:700;color:${partyColor};">${card.party}</div>
            <span style="font-size:0.7rem;color:var(--text-muted);">${card.time}</span>
          </div>
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <span style="padding:0.25rem 0.65rem;background:${sc.bg};border:1px solid ${sc.color}44;border-radius:var(--radius-full);font-size:0.68rem;font-weight:700;color:${sc.color};">${sc.label}</span>
            <button class="btn btn-ghost btn-icon btn-sm" onclick="showToast('Brief Shared','Intel card sent to War Room','success')" title="Share">📤</button>
          </div>
        </div>

        <!-- Intel Grid: WHO → WHERE → EVENT → ISSUE -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:0.6rem;margin-bottom:0.85rem;padding:0.75rem;background:var(--glass-bg);border-radius:var(--radius-md);border:1px solid var(--border-subtle);">
          ${[
        { label: 'WHO', val: card.who, icon: '👤' },
        { label: 'WHERE', val: card.where, icon: '📍' },
        { label: 'EVENT', val: card.event, icon: '📅' },
        { label: 'ISSUE', val: card.issue, icon: '⚠️' },
      ].map(f => `
            <div>
              <div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:0.2rem;">${f.icon} ${f.label}</div>
              <div style="font-size:0.78rem;font-weight:500;color:var(--text-primary);line-height:1.35;">${f.val}</div>
            </div>
          `).join('')}
        </div>

        <!-- Statement -->
        <div style="padding:0.65rem 0.9rem;background:rgba(230,57,70,0.06);border-radius:var(--radius-md);border-left:2px solid ${partyColor};margin-bottom:0.75rem;">
          <div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:${partyColor};margin-bottom:0.2rem;">💬 PUBLIC STATEMENT</div>
          <p style="font-size:0.82rem;color:var(--text-primary);font-style:italic;line-height:1.55;">${card.statement}</p>
        </div>

        <!-- Reach + Context -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;margin-bottom:0.75rem;">
          <div>
            <div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:0.25rem;">📡 REACH / TRACTION</div>
            <div style="font-size:0.78rem;color:var(--text-secondary);line-height:1.45;">${card.reach}</div>
          </div>
          <div>
            <div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:0.25rem;">🔎 FACTUAL CONTEXT</div>
            <div style="font-size:0.78rem;color:var(--text-secondary);line-height:1.45;">${card.context}</div>
          </div>
        </div>

        <!-- Actions -->
        <div style="display:flex;gap:0.5rem;padding-top:0.6rem;border-top:1px solid var(--border-subtle);">
          <button class="btn btn-ghost btn-sm" style="font-size:0.7rem;" onclick="showToast('Counter Brief','Counter-narrative prepared for War Room','success')">🛡 Counter Brief</button>
          <button class="btn btn-ghost btn-sm" style="font-size:0.7rem;" onclick="navigateTo('speech-intelligence')">🎙 Speech Input</button>
          <button class="btn btn-ghost btn-sm" style="font-size:0.7rem;" onclick="showToast('Flagged','Added to President attention list','info')">⭐ Flag for President</button>
        </div>
      </div>
    `;
  }).join('');
}

function setupIntelFilters() {
  document.querySelectorAll('#opp-intel-filter .filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#opp-intel-filter .filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      oppIntelFilter = pill.dataset.status;
      renderIntelCards(oppIntelFilter, oppPartyFilter);
    });
  });
}

function filterIntelCards() {
  const sel = document.getElementById('opp-party-filter-sel');
  oppPartyFilter = sel ? sel.value : 'all';
  renderIntelCards(oppIntelFilter, oppPartyFilter);
}

/* ── Analysis View ─────────────────────────────────────────── */
function renderPartyCards() {
  const el = document.getElementById('opp-party-cards');
  if (!el) return;
  el.innerHTML = OPPOSITION_DATA.parties.map(p => `
    <div class="card-glass card-shine" style="padding:1rem;border-radius:var(--radius-lg);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
        <div style="display:flex;align-items:center;gap:0.75rem;">
          <div style="width:42px;height:42px;border-radius:var(--radius-md);background:${p.color}22;border:2px solid ${p.color}55;display:flex;align-items:center;justify-content:center;font-size:0.9rem;font-weight:800;color:${p.color};">${p.name}</div>
          <div>
            <div style="font-weight:700;font-size:0.9rem;color:var(--text-primary);">${p.fullName}</div>
            <div style="font-size:0.73rem;color:var(--text-muted);">Leader: ${p.leader}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <span class="tag ${p.activityLevel === 'high' ? 'tag-red' : p.activityLevel === 'medium' ? 'tag-amber' : 'tag-green'}" style="font-size:0.65rem;">${p.activityLevel.toUpperCase()}</span>
          <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.2rem;">${p.seats} seats</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:0.73rem;color:var(--text-muted);margin-bottom:0.3rem;">
        <span>Party Strength</span><span style="color:${p.color};font-weight:600;">${p.strength}%</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${p.strength}%;background:linear-gradient(90deg,${p.color},${p.color}aa);"></div></div>
      <div style="display:flex;gap:0.35rem;flex-wrap:wrap;margin-top:0.6rem;">
        ${p.narratives.map(n => `<span class="tag" style="font-size:0.65rem;">${n}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

function renderNarratives() {
  const el = document.getElementById('opp-narratives');
  if (!el) return;
  el.innerHTML = OPPOSITION_DATA.attackNarratives.map((n, i) => `
    <div style="animation:slideInUp 0.3s ease both;animation-delay:${i * 0.06}s;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.3rem;">
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <span class="tag ${n.severity === 'high' ? 'tag-red' : n.severity === 'medium' ? 'tag-amber' : 'tag-green'}" style="font-size:0.65rem;">${n.severity.toUpperCase()}</span>
          <span style="font-size:0.82rem;font-weight:600;color:var(--text-primary);">${n.topic}</span>
        </div>
        <div style="display:flex;align-items:center;gap:0.4rem;">
          <span style="font-size:0.7rem;color:var(--text-muted);">${n.heat}%</span>
          <span style="font-size:0.8rem;color:${n.trend === 'up' ? 'var(--red)' : n.trend === 'down' ? 'var(--green)' : 'var(--text-muted)'};">${n.trend === 'up' ? '↑' : n.trend === 'down' ? '↓' : '→'}</span>
        </div>
      </div>
      <div class="progress-bar" style="height:5px;"><div class="progress-fill" style="width:${n.heat}%;background:${n.severity === 'high' ? 'linear-gradient(90deg,var(--red),var(--amber))' : n.severity === 'medium' ? 'linear-gradient(90deg,var(--amber),var(--gold))' : 'linear-gradient(90deg,var(--green),var(--blue))'}; animation:progressFill 1s ease both; animation-delay:${i * 0.1}s;"></div></div>
      <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.2rem;">${n.description}</div>
    </div>
  `).join('');
}

function renderHeatmap() {
  const el = document.getElementById('opp-heatmap');
  if (!el) return;
  const colorMap = { 'very-high': '#7f1d1d', 'high': '#e63946', 'medium': '#ff9f43', 'low': 'rgba(38,222,129,0.15)' };
  const textMap = { 'very-high': '#fca5a5', 'high': '#fca5a5', 'medium': '#fed7aa', 'low': '#6ee7b7' };
  el.innerHTML = Object.entries(OPPOSITION_DATA.districtActivity).slice(0, 24).map(([dist, level]) => `
    <div style="background:${colorMap[level] || '#1a2035'};border-radius:6px;padding:0.3rem 0.25rem;text-align:center;cursor:pointer;transition:transform 0.15s;" title="${dist}: ${level}" onclick="showToast('District','${dist} — ${level} opposition activity','info')" onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform='scale(1)'">
      <div style="font-size:0.58rem;font-weight:600;color:${textMap[level]};line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${dist.length > 8 ? dist.substring(0, 7) + '…' : dist}</div>
    </div>
  `).join('');
}

function renderSentimentChart() {
  const canvas = document.getElementById('opp-sentiment-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (oppSentimentChartInst) { oppSentimentChartInst.destroy(); oppSentimentChartInst = null; }
  oppSentimentChartInst = new Chart(canvas, {
    type: 'line',
    data: {
      labels: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
      datasets: [{
        label: 'Opp. Sentiment', data: [30, 38, 47, 55, 65, 75],
        borderColor: '#e63946', backgroundColor: 'rgba(230,57,70,0.1)',
        borderWidth: 2, pointRadius: 4, tension: 0.4, fill: true, pointBackgroundColor: '#e63946'
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f1829', titleColor: '#e8edf8', bodyColor: '#a8b4cc', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 } },
      scales: {
        y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#5a6a84', font: { size: 10 } } },
        x: { grid: { display: false }, ticks: { color: '#a8b4cc', font: { size: 10 } } }
      }
    }
  });
}

function renderCounterStrategy() {
  const el = document.getElementById('opp-strategy');
  if (!el) return;
  el.innerHTML = OPPOSITION_DATA.counterStrategies.map((s, i) => `
    <div style="padding:0.75rem;border-radius:var(--radius-md);border-left:3px solid ${s.priority === 'red' ? 'var(--red)' : 'var(--amber)'};background:${s.priority === 'red' ? 'var(--red-dim)' : 'var(--amber-dim)'};animation:slideInUp 0.3s ease both;animation-delay:${i * 0.07}s;">
      <div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.3rem;">
        <span class="tag ${s.priority === 'red' ? 'tag-red' : 'tag-amber'}" style="font-size:0.6rem;">${s.priority === 'red' ? '🔴 HIGH' : '🟠 MED'}</span>
        <span style="font-size:0.82rem;font-weight:600;color:var(--text-primary);">${s.narrative}</span>
      </div>
      <div style="font-size:0.75rem;color:var(--text-secondary);line-height:1.5;">${s.action}</div>
      <button class="btn btn-ghost btn-sm" style="margin-top:0.5rem;font-size:0.7rem;padding:0.2rem 0.5rem;" onclick="showToast('Action','Strategy assigned to team','success')">→ Assign</button>
    </div>
  `).join('');
}

function renderWeakness() {
  const el = document.getElementById('opp-weakness');
  if (!el) return;
  el.innerHTML = OPPOSITION_DATA.weaknesses.map((w, i) => `
    <div style="padding:0.6rem 0.75rem;border-radius:var(--radius-md);background:var(--glass-bg);border:1px solid var(--border-subtle);animation:slideInUp 0.3s ease both;animation-delay:${i * 0.07}s;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.25rem;">
        <span style="font-size:0.82rem;font-weight:600;color:var(--text-primary);">${w.title}</span>
        <span class="tag ${w.impact === 'high' ? 'tag-red' : 'tag-amber'}" style="font-size:0.6rem;">${w.impact.toUpperCase()}</span>
      </div>
      <div style="font-size:0.73rem;color:var(--text-secondary);line-height:1.5;">${w.desc}</div>
    </div>
  `).join('');
}

window.switchOppView = switchOppView;
window.filterIntelCards = filterIntelCards;
