/* ============================================================
   LEADERSHIP MODULE
   ============================================================ */

let lsActiveLeader = null;
let lsInfluenceChart = null;
let lsPartyFilter = 'all';
let lsSentimentFilter = 'all';
let lsCategoryFilter = 'all';
let lsSearchQuery = '';

/* ── LIVE data from Supabase (populated by /api/cron/leadership-pipeline) ── */
let LS_LIVE_LEADERS = [];
let LS_LIVE_ACTIVITIES = [];
let lsLiveOn = false;

function initLeadership() {
  renderFeaturedLeaders();
  renderLeaderGrid(LEADERS_DATA);
  renderTimeline(LEADERS_DATA[0]);
  renderInfluenceChart();
  setupLeadershipFilters();
  loadLiveLeadership(); // overlay live data when available
}

function lsEsc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}


function loadLiveLeadership() {
  return fetch('/api/leadership', { cache: 'no-store' })
    .then(res => res.json())
    .then(payload => {
      if (!payload || !payload.has_data) return;
      LS_LIVE_LEADERS = payload.leaders || [];
      LS_LIVE_ACTIVITIES = payload.activities || [];
      if (!LS_LIVE_LEADERS.length && !LS_LIVE_ACTIVITIES.length) return;
      lsLiveOn = true;

      const badge = document.getElementById('ls-live-badge');
      if (badge) badge.style.display = 'inline-flex';
      const stamp = document.getElementById('ls-live-stamp');
      if (stamp && payload.updated_at) {
        stamp.textContent = '🔄 Live · ' + new Date(payload.updated_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      }

      renderLiveLeaderGrid();
      renderLiveLpiChart();
      renderLiveTimeline(LS_LIVE_ACTIVITIES[0]);
      renderHeatmap(payload.heatmap || {});
      renderTopPerformers();
      renderLiveStats(payload.stats || {});
    })
    .catch(err => console.error('[Leadership] live fetch failed, using static:', err));
}

function lsToCard(l) {
  const initials = l.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return {
    id: l.id, name: l.name, initials,
    role: `${l.designation} • ${l.category}`,
    party: ['BJP', 'JDU', 'RJD', 'INC'].includes(l.party) ? l.party : 'Other',
    influence: l.lpi, sentiment: l.sentiment || 'neutral',
    constituency: l.district, active_flag: l.active_flag, activity_count: l.activity_count,
  };
}

function renderLiveLeaderGrid() {
  const grid = document.getElementById('ls-leader-grid');
  if (!grid || !LS_LIVE_LEADERS.length) return;
  // Apply category / party / sentiment / search filters to live data
  let data = LS_LIVE_LEADERS;
  if (lsCategoryFilter !== 'all') data = data.filter(l => l.category === lsCategoryFilter);
  if (lsPartyFilter !== 'all') data = data.filter(l => l.party === lsPartyFilter);
  if (lsSentimentFilter !== 'all') data = data.filter(l => l.sentiment === lsSentimentFilter);
  if (lsSearchQuery) data = data.filter(l => l.name.toLowerCase().includes(lsSearchQuery));

  if (!data.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-icon">🔍</div><p>No leaders match this filter.</p></div>`;
    return;
  }

  grid.innerHTML = data.map((l, i) => {
    const c = lsToCard(l);
    const flagColor = { ROUTINE: 'var(--green)', WATCH: 'var(--gold)', DEVELOPING: 'var(--amber)', CRITICAL: 'var(--red)' }[l.active_flag] || 'var(--green)';
    return `
    <div class="leader-card card-shine" style="animation:slideInUp 0.35s ease both; animation-delay:${i * 0.05}s; cursor:pointer;" onclick="lsSelectLiveActivity('${lsEsc(l.name)}')">
      <div class="leader-card-top">
        <div class="leader-avatar" style="background:${partyGrad(c.party)}; color:white;">${c.initials}</div>
        <div class="leader-info">
          <div class="leader-name">${lsEsc(c.name)}</div>
          <div class="leader-role">${lsEsc(c.role)}</div>
          <div style="margin-top:0.3rem; display:flex; gap:0.3rem; align-items:center;">
            <span class="leader-party-badge party-${c.party.toLowerCase()}">${c.party}</span>
            <span class="tag" style="font-size:0.58rem; color:${flagColor}; border-color:${flagColor};">${l.active_flag}</span>
          </div>
        </div>
      </div>
      <div style="display:flex; align-items:center; justify-content:space-between; margin-top:0.6rem;">
        <span style="font-size:0.68rem; color:var(--text-muted);">LPI</span>
        <span style="font-family:'Outfit',sans-serif; font-weight:800; color:var(--gold);">${c.influence}<small style="color:var(--text-muted); font-weight:400;">/100</small></span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${c.influence}%;"></div></div>
      <div style="display:flex; align-items:center; justify-content:space-between; margin-top:0.6rem;">
        <span class="sentiment-badge sentiment-${c.sentiment}">${c.sentiment === 'positive' ? '↑ Positive' : c.sentiment === 'negative' ? '↓ Negative' : '→ Neutral'}</span>
        <span style="font-size:0.7rem; color:var(--text-muted);">📍 ${lsEsc(c.constituency)} · ${l.activity_count} acts</span>
      </div>
    </div>`;
  }).join('');
}

function renderFeaturedLeaders() {
  const el = document.getElementById('ls-featured-cards');
  if (!el) return;
  const featured = LEADERS_DATA.slice(0, 2);
  el.innerHTML = featured.map(l => `
    <div class="card card-gold card-shine" style="cursor:pointer; position:relative; overflow:hidden; padding:1.5rem;" onclick="selectLeader(${l.id})">
      <div style="position:absolute; top:0; right:0; width:80px; height:80px; background:radial-gradient(circle, ${partyGradient(l.party)}, transparent); opacity:0.15; border-radius:0 0 0 100%;"></div>
      <div style="display:flex; align-items:center; gap:1rem; margin-bottom:1rem;">
        <div class="leader-avatar" style="width:64px; height:64px; font-size:1.4rem; background:${partyGrad(l.party)}; color:white; flex-shrink:0;">${l.initials}</div>
        <div>
          <div style="font-family:'Outfit',sans-serif; font-size:1.1rem; font-weight:800; color:var(--text-primary);">${l.name}</div>
          <div style="font-size:0.78rem; color:var(--text-muted); margin-top:0.1rem;">${l.role}</div>
          <div style="margin-top:0.35rem;"><span class="leader-party-badge party-${l.party.toLowerCase()}">${l.party}</span></div>
        </div>
      </div>
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.4rem;">
        <span style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em;">Influence Score</span>
        <span style="font-family:'Outfit',sans-serif; font-size:1rem; font-weight:800; color:var(--gold);">${l.influence}/100</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${l.influence}%;"></div></div>
      <div style="display:flex; align-items:center; justify-content:space-between; margin-top:0.75rem;">
        <span class="sentiment-badge sentiment-${l.sentiment}">${l.sentiment === 'positive' ? '↑ Positive' : l.sentiment === 'negative' ? '↓ Negative' : '→ Neutral'}</span>
        <span style="font-size:0.72rem; color:var(--text-muted);">📍 ${l.constituency}</span>
      </div>
    </div>
  `).join('');
}

function renderLeaderGrid(data) {
  const grid = document.getElementById('ls-leader-grid');
  if (!grid) return;
  if (!data.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-icon">🔍</div><p>No leaders match your filter.</p></div>`;
    return;
  }
  grid.innerHTML = data.map((l, i) => `
    <div class="leader-card card-shine" style="animation:slideInUp 0.35s ease both; animation-delay:${i*0.06}s;" onclick="selectLeader(${l.id})">
      <div class="leader-card-top">
        <div class="leader-avatar" style="background:${partyGrad(l.party)}; color:white;">${l.initials}</div>
        <div class="leader-info">
          <div class="leader-name">${l.name}</div>
          <div class="leader-role">${l.role}</div>
          <div style="margin-top:0.3rem;"><span class="leader-party-badge party-${l.party.toLowerCase()}">${l.party}</span></div>
        </div>
        <span class="sentiment-badge sentiment-${l.sentiment}" style="flex-shrink:0;">${l.sentiment === 'positive' ? '↑' : l.sentiment === 'negative' ? '↓' : '→'}</span>
      </div>
      <div class="influence-bar-container">
        <div class="influence-label"><span>Influence</span><span>${l.influence}/100</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${l.influence}%;"></div></div>
      </div>
      <div style="display:flex; align-items:center; justify-content:space-between; font-size:0.72rem; color:var(--text-muted);">
        <span>📍 ${l.constituency}</span>
        <span>🕐 ${l.lastActivityTime}</span>
      </div>
    </div>
  `).join('');
}

function selectLeader(id) {
  const leader = LEADERS_DATA.find(l => l.id === id);
  if (!leader) return;
  lsActiveLeader = leader;
  renderTimeline(leader);
  const nameEl = document.getElementById('ls-timeline-name');
  if (nameEl) nameEl.textContent = leader.name;
  // Open modal with full details
  openLeaderModal(leader);
}

function openLeaderModal(l) {
  openModal(`
    <div style="display:flex; align-items:center; gap:1rem; margin-bottom:1.25rem;">
      <div class="leader-avatar" style="width:64px; height:64px; font-size:1.4rem; background:${partyGrad(l.party)}; color:white;">${l.initials}</div>
      <div>
        <div style="font-size:1.1rem; font-weight:700; color:var(--text-primary);">${l.name}</div>
        <div style="font-size:0.8rem; color:var(--text-muted);">${l.role} &nbsp;•&nbsp; ${l.party} &nbsp;•&nbsp; ${l.constituency}</div>
        <div style="margin-top:0.4rem; display:flex; gap:0.5rem;">
          <span class="leader-party-badge party-${l.party.toLowerCase()}">${l.party}</span>
          <span class="sentiment-badge sentiment-${l.sentiment}">${l.sentiment}</span>
        </div>
      </div>
    </div>
    <div class="divider"></div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem;">
      <div><div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em;">Influence Score</div>
        <div style="font-size:1.75rem; font-weight:800; font-family:'Outfit',sans-serif; color:var(--gold);">${l.influence}<span style="font-size:0.8rem; color:var(--text-muted); font-weight:400;">/100</span></div>
        <div class="progress-bar" style="margin-top:0.25rem;"><div class="progress-fill" style="width:${l.influence}%;"></div></div>
      </div>
      <div><div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em;">District</div>
        <div style="font-size:1rem; font-weight:600; color:var(--text-primary); margin-top:0.25rem;">${l.district}</div>
        <div style="font-size:0.75rem; color:var(--text-muted);">Last: ${l.lastActivity}</div>
      </div>
    </div>
    <div class="divider"></div>
    <div style="font-size:0.8rem; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em; margin-bottom:0.75rem;">Recent Activity</div>
    <div class="timeline">
      ${l.recentActivities.map(a => `
        <div class="timeline-item">
          <div class="timeline-dot ${a.type === 'speech' ? 'gold' : a.type === 'social' ? 'blue' : a.type === 'event' ? 'green' : 'amber'}">${a.type === 'speech' ? '🎙' : a.type === 'social' ? '📱' : a.type === 'event' ? '🏛️' : '📋'}</div>
          <div class="timeline-body">
            <div class="timeline-title">${a.title}</div>
            <div class="timeline-time">${a.time}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `, l.name);
}

function renderTimeline(leader) {
  const el = document.getElementById('ls-timeline');
  if (!el || !leader) return;
  el.innerHTML = leader.recentActivities.map(a => `
    <div class="timeline-item">
      <div class="timeline-dot ${a.type === 'speech' ? 'gold' : a.type === 'social' ? 'blue' : a.type === 'event' ? 'green' : 'amber'}">
        ${a.type === 'speech' ? '🎙' : a.type === 'social' ? '📱' : a.type === 'event' ? '🏛️' : '📋'}
      </div>
      <div class="timeline-body">
        <div class="timeline-title">${a.title}</div>
        <div class="timeline-time">${a.time}</div>
      </div>
    </div>
  `).join('');
}

function renderInfluenceChart() {
  const canvas = document.getElementById('ls-influence-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (lsInfluenceChart) lsInfluenceChart.destroy();
  const top6 = [...LEADERS_DATA].sort((a,b) => b.influence - a.influence).slice(0, 6);
  lsInfluenceChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: top6.map(l => l.name.split(' ')[0]),
      datasets: [{
        data: top6.map(l => l.influence),
        backgroundColor: top6.map(l => partyColor(l.party) + 'aa'),
        borderColor: top6.map(l => partyColor(l.party)),
        borderWidth: 1, borderRadius: 4
      }]
    },
    options: {
      responsive: true, indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#5a6a84', font: { size: 10 } } },
        y: { grid: { display: false }, ticks: { color: '#a8b4cc', font: { size: 10 } } }
      }
    }
  });
}

function setupLeadershipFilters() {
  document.querySelectorAll('#ls-category-filter .filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#ls-category-filter .filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      lsCategoryFilter = pill.dataset.category;
      applyLeaderFilters();
    });
  });
  document.querySelectorAll('#ls-party-filter .filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#ls-party-filter .filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      lsPartyFilter = pill.dataset.party;
      applyLeaderFilters();
    });
  });
  document.querySelectorAll('#ls-sentiment-filter .filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#ls-sentiment-filter .filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      lsSentimentFilter = pill.dataset.sentiment;
      applyLeaderFilters();
    });
  });
  const search = document.getElementById('ls-search');
  if (search) {
    search.addEventListener('input', e => {
      lsSearchQuery = e.target.value.toLowerCase();
      applyLeaderFilters();
    });
  }
}

function applyLeaderFilters() {
  // Live data → filter within the live grid; static fallback otherwise
  if (lsLiveOn && LS_LIVE_LEADERS.length) { renderLiveLeaderGrid(); return; }
  let data = LEADERS_DATA;
  if (lsCategoryFilter !== 'all') data = data.filter(l => (l.category || 'MLA') === lsCategoryFilter);
  if (lsPartyFilter !== 'all') data = data.filter(l => l.party === lsPartyFilter);
  if (lsSentimentFilter !== 'all') data = data.filter(l => l.sentiment === lsSentimentFilter);
  if (lsSearchQuery) data = data.filter(l => l.name.toLowerCase().includes(lsSearchQuery));
  renderLeaderGrid(data);
}

// Helpers
function partyColor(p) {
  const m = { BJP: '#ff6b2b', JDU: '#22c55e', RJD: '#e63946', INC: '#4a9eff' };
  return m[p] || '#f5c518';
}
function partyGrad(p) {
  const m = { BJP: 'linear-gradient(135deg,#ff6b2b,#d4500f)', JDU: 'linear-gradient(135deg,#22c55e,#16a34a)', RJD: 'linear-gradient(135deg,#e63946,#c0392b)', INC: 'linear-gradient(135deg,#4a9eff,#2563eb)' };
  return m[p] || 'linear-gradient(135deg,#f5c518,#e8a900)';
}
function partyGradient(p) {
  const m = { BJP: '#ff6b2b', JDU: '#22c55e', RJD: '#e63946', INC: '#4a9eff' };
  return m[p] || '#f5c518';
}

/* LPI chart — top 8 leaders by LPI */
function renderLiveLpiChart() {
  const canvas = document.getElementById('ls-influence-chart');
  if (!canvas || typeof Chart === 'undefined' || !LS_LIVE_LEADERS.length) return;
  if (lsInfluenceChart) lsInfluenceChart.destroy();
  const top = [...LS_LIVE_LEADERS].sort((a, b) => b.lpi - a.lpi).slice(0, 8);
  lsInfluenceChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: top.map(l => l.name.split(' ')[0]),
      datasets: [{ data: top.map(l => l.lpi), backgroundColor: top.map(l => partyColor(l.party) + 'aa'), borderColor: top.map(l => partyColor(l.party)), borderWidth: 1, borderRadius: 4 }]
    },
    options: { responsive: true, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#5a6a84', font: { size: 10 } } }, y: { grid: { display: false }, ticks: { color: '#a8b4cc', font: { size: 10 } } } } }
  });
  const title = canvas.closest('.card')?.querySelector('.card-title');
  if (title) title.textContent = '📊 Leadership Performance Index (LPI)';
}

/* Activity timeline — live leader activities */
function renderLiveTimeline(activity) {
  const el = document.getElementById('ls-timeline');
  if (!el || !LS_LIVE_ACTIVITIES.length) return;
  const nameEl = document.getElementById('ls-timeline-name');
  if (nameEl) nameEl.textContent = activity ? activity.leader_name : 'Live Feed';
  el.innerHTML = LS_LIVE_ACTIVITIES.slice(0, 12).map(a => {
    const dotCls = a.priority === 'CRITICAL' ? 'gold' : a.priority === 'DEVELOPING' ? 'amber' : a.event_type === 'Statement' ? 'blue' : 'green';
    const icon = a.priority === 'CRITICAL' ? '🚨' : a.event_type === 'Public Rally' ? '🏛️' : a.event_type === 'Media Interaction' ? '🎙' : a.event_type === 'Inauguration' ? '✂️' : '📋';
    const d = a.occurred_at ? new Date(a.occurred_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    return `
    <div class="timeline-item" style="cursor:pointer;" onclick='lsShowActivityCard(${JSON.stringify(a.id)})'>
      <div class="timeline-dot ${dotCls}">${icon}</div>
      <div class="timeline-body">
        <div class="timeline-title"><b>${lsEsc(a.leader_name)}</b> — ${lsEsc(a.title)}</div>
        <div class="timeline-time">📍 ${lsEsc(a.district)} · ${lsEsc(a.event_type)} · ${d}</div>
      </div>
    </div>`;
  }).join('');
}

/* Full intelligence card modal for one activity */
function lsShowActivityCard(id) {
  const a = LS_LIVE_ACTIVITIES.find(x => String(x.id) === String(id));
  if (!a) return;
  const pColor = { CRITICAL: 'var(--red)', DEVELOPING: 'var(--amber)', WATCH: 'var(--gold)', ROUTINE: 'var(--green)' }[a.priority];
  const pEmoji = { CRITICAL: '🔴', DEVELOPING: '🟠', WATCH: '🟡', ROUTINE: '🟢' }[a.priority];
  const where = [a.venue, a.constituency, a.district].filter(Boolean).map(lsEsc).join(', ');
  const content = `
    <div style="font-size:0.8rem; line-height:1.7; color:var(--text-secondary);">
      <div style="display:flex; gap:0.4rem; flex-wrap:wrap; margin-bottom:0.8rem;">
        <span class="tag" style="color:${pColor}; border-color:${pColor}; font-weight:700;">${pEmoji} ${a.priority}</span>
        <span class="tag tag-blue">${lsEsc(a.category)}</span>
        <span class="tag">${lsEsc(a.event_type)}</span>
        <span class="tag">${lsEsc(a.party)}</span>
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
        <tr><td style="padding:0.3rem 0; color:var(--text-muted); width:86px; vertical-align:top;">WHO</td><td style="color:var(--text-primary); font-weight:600;">${lsEsc(a.leader_name)} <small style="color:var(--text-muted); font-weight:400;">(${lsEsc(a.designation)})</small></td></tr>
        <tr><td style="padding:0.3rem 0; color:var(--text-muted); vertical-align:top;">WHERE</td><td>${where || lsEsc(a.district)}</td></tr>
        <tr><td style="padding:0.3rem 0; color:var(--text-muted); vertical-align:top;">EVENT</td><td>${lsEsc(a.event_type)} — ${lsEsc(a.title)}</td></tr>
        ${a.statement ? `<tr><td style="padding:0.3rem 0; color:var(--text-muted); vertical-align:top;">KEY STATEMENT</td><td style="font-style:italic; color:var(--text-primary);">"${lsEsc(a.statement)}"</td></tr>` : ''}
        ${a.issues_raised && a.issues_raised.length ? `<tr><td style="padding:0.3rem 0; color:var(--text-muted); vertical-align:top;">ISSUES</td><td>${a.issues_raised.map(i => `<span class="tag" style="margin-right:0.25rem;">${lsEsc(i)}</span>`).join('')}</td></tr>` : ''}
        <tr><td style="padding:0.3rem 0; color:var(--text-muted); vertical-align:top;">FOOTPRINT</td><td>${a.crowd_estimate ? `👥 ~${a.crowd_estimate} · ` : ''}📺 ${lsEsc(a.media_coverage || 'Medium')} reach · Sentiment ${(a.sentiment_score >= 0 ? '+' : '') + a.sentiment_score.toFixed(1)}</td></tr>
      </table>
      ${a.flag_reason ? `<div style="margin-top:0.6rem; padding:0.55rem 0.65rem; background:rgba(230,57,70,0.08); border-left:3px solid ${pColor}; border-radius:4px;"><strong style="color:${pColor}; font-size:0.72rem; text-transform:uppercase;">⚠️ Alert Reason</strong><p style="margin:0.2rem 0 0;">${lsEsc(a.flag_reason)}</p></div>` : ''}
      <p style="margin-top:0.6rem; padding:0.6rem; background:rgba(245,197,24,0.07); border-left:3px solid var(--gold); border-radius:4px; margin-bottom:0;">${lsEsc(a.summary)}</p>
      ${a.recommended_action ? `<div style="margin-top:0.6rem; padding:0.55rem 0.65rem; background:rgba(74,158,255,0.08); border-left:3px solid var(--blue); border-radius:4px;"><strong style="color:var(--blue); font-size:0.72rem; text-transform:uppercase;">🎯 Action for President</strong><p style="margin:0.2rem 0 0;">${lsEsc(a.recommended_action)}</p></div>` : ''}
      ${a.source_url ? `<a href="${lsEsc(a.source_url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block; margin-top:0.6rem; color:var(--blue); font-size:0.75rem; text-decoration:none;">📰 Source news ↗</a>` : ''}
    </div>`;
  if (typeof openModal === 'function') openModal(content, `${pEmoji} ${lsEsc(a.leader_name)} — ${lsEsc(a.event_type)}`);
}

/* District footprint heatmap — renders into the dedicated card slot */
function renderHeatmap(heatmap) {
  const card = document.getElementById('ls-heatmap-card');
  const body = document.getElementById('ls-heatmap-body');
  if (!card || !body) return;
  const entries = Object.entries(heatmap).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!entries.length) { card.style.display = 'none'; return; }
  const max = entries[0][1];
  body.innerHTML = entries.map(([d, c]) => {
    const pct = Math.round((c / max) * 100);
    const color = c >= max * 0.66 ? 'var(--red)' : c >= max * 0.4 ? 'var(--amber)' : 'var(--blue)';
    return `<div style="margin-bottom:0.5rem;">
      <div style="display:flex; justify-content:space-between; font-size:0.72rem; margin-bottom:0.15rem;">
        <span style="color:var(--text-secondary);">📍 ${lsEsc(d)}</span><span style="color:var(--text-primary); font-weight:700;">${c} activities</span>
      </div>
      <div style="height:8px; background:rgba(255,255,255,0.05); border-radius:4px; overflow:hidden;">
        <div style="width:${pct}%; height:100%; background:${color}; border-radius:4px; transition:width 0.6s ease;"></div>
      </div>
    </div>`;
  }).join('');
  card.style.display = 'block';
}

/* Top performers + attention-required — dedicated card slot */
function renderTopPerformers() {
  const card = document.getElementById('ls-top-perf-card');
  const body = document.getElementById('ls-top-perf-body');
  if (!card || !body || !LS_LIVE_LEADERS.length) return;
  const sorted = [...LS_LIVE_LEADERS].sort((a, b) => b.lpi - a.lpi);
  const top = sorted.slice(0, 5);
  const low = sorted.filter(l => l.active_flag === 'CRITICAL' || l.active_flag === 'DEVELOPING' || l.lpi < 55).slice(0, 3);
  body.innerHTML =
    top.map((l, i) => `<div style="display:flex; justify-content:space-between; align-items:center; font-size:0.78rem; padding:0.35rem 0; border-bottom:1px solid var(--border-subtle);">
      <span style="color:var(--text-secondary);">${i + 1}. ${lsEsc(l.name)} <small style="color:var(--text-muted);">(${lsEsc(l.district)})</small></span>
      <span style="color:var(--gold); font-weight:700;">${l.lpi}<small style="color:var(--text-muted); font-weight:400;">/100</small></span>
    </div>`).join('') +
    (low.length ? `<div style="margin-top:0.75rem; padding-top:0.5rem; border-top:1px dashed var(--border-subtle);">
      <div style="font-size:0.68rem; font-weight:700; color:var(--red); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:0.35rem;">⚠️ Attention Required</div>
      ${low.map(l => `<div style="display:flex; justify-content:space-between; font-size:0.75rem; padding:0.25rem 0;">
        <span style="color:var(--text-secondary);">⚠️ ${lsEsc(l.name)}</span>
        <span style="color:var(--red); font-size:0.68rem; font-weight:600;">${l.active_flag}</span>
      </div>`).join('')}
    </div>` : '');
  card.style.display = 'block';
}

/* Live stats chips (slot exists in the HTML) */
function renderLiveStats(stats) {
  const row = document.getElementById('ls-live-stats');
  if (!row || row.dataset.filled) return;
  row.dataset.filled = 'true';
  row.innerHTML = `
    <span class="tag tag-blue">👥 ${stats.total_leaders} Leaders Tracked</span>
    <span class="tag">📋 ${stats.total_activities} Activities (48h)</span>
    <span class="tag tag-red">🚨 ${stats.critical} Critical</span>
    <span class="tag tag-amber">🟠 ${stats.developing} Developing</span>
    <span class="tag tag-green">🟢 ${stats.routine} Routine</span>`;
}

function lsSelectLiveActivity(name) {
  const acts = LS_LIVE_ACTIVITIES.filter(a => a.leader_name === name);
  if (acts.length) renderLiveTimeline(acts[0]);
  document.getElementById('ls-timeline')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

window.lsShowActivityCard = lsShowActivityCard;
window.lsSelectLiveActivity = lsSelectLiveActivity;
window.selectLeader = selectLeader;
