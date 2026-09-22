/* ============================================================
   LEADERSHIP MODULE
   ============================================================ */

let lsActiveLeader = null;
/* Live data (DB `leaders` + `leader_activities` se) — static LS_DATA fallback hai */
let LS_DATA = (typeof LEADERS_DATA !== 'undefined') ? LEADERS_DATA : [];
let lsLiveAt = null;

async function lsLoadLive() {
  try {
    const res = await fetch('/api/leadership?limit=60', { cache: 'no-store' });
    const j = await res.json();
    if (!j || !j.has_data || !Array.isArray(j.leaders) || !j.leaders.length) return;
    const acts = j.activities || [];
    const byLeader = {};
    acts.forEach((a) => { const k = String(a.leader_name || '').toLowerCase().trim(); if (k) (byLeader[k] = byLeader[k] || []).push(a); });
    const staticBase = (typeof LEADERS_DATA !== 'undefined') ? LEADERS_DATA : [];
    const mapped = j.leaders.map((db) => {
      const base = staticBase.find((l) => String(l.name).toLowerCase() === String(db.name || '').toLowerCase()) || {};
      const myActs = byLeader[String(db.name || '').toLowerCase().trim()] || [];
      const initials = String(db.name || '').split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
      const last = myActs[0];
      return {
        ...base,
        id: db.id,
        name: db.name,
        role: db.designation || base.role || '',
        party: db.party || base.party || 'Other',
        district: db.district || base.district || '',
        constituency: base.constituency || db.district || '',
        influence: (db.lpi != null ? db.lpi : (base.influence || 0)),
        sentiment: db.sentiment || base.sentiment || 'neutral',
        activeFlag: db.active_flag || base.activeFlag || 'ROUTINE',
        activityCount: db.activity_count || myActs.length || 0,
        initials: initials || base.initials || '??',
        image: base.image || null,
        phone: base.phone || '',
        lastActivity: (last && last.title) || base.lastActivity || '',
        lastActivityTime: last && last.occurred_at ? new Date(last.occurred_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : (base.lastActivityTime || ''),
        activityType: (last && (last.event_type || 'event')) || base.activityType || 'event',
        recentActivities: myActs.length
          ? myActs.slice(0, 4).map((a) => ({ type: a.event_type || 'event', title: a.title || '', time: a.occurred_at ? new Date(a.occurred_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '' }))
          : (base.recentActivities || []),
      };
    });
    if (mapped.length) {
      LS_DATA = mapped;
      lsLiveAt = j.updated_at || new Date().toISOString();
      lsRenderAll();
      const badge = document.getElementById('ls-live-badge');
      if (badge) badge.textContent = 'LIVE · ' + mapped.length + ' leaders · ' + new Date(lsLiveAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    }
  } catch (e) { console.warn('[leadership] live load failed:', e.message); }
}

function lsRenderAll() {
  renderFeaturedLeaders();
  renderLeaderGrid(LS_DATA);
  if (applyLeaderFilters) applyLeaderFilters();
  if (LS_DATA[0]) renderTimeline(LS_DATA[0]);
  if (typeof renderInfluenceChart === 'function') renderInfluenceChart();
}
let lsInfluenceChart = null;
let lsPartyFilter = 'all';
let lsSentimentFilter = 'all';
let lsSearchQuery = '';

function initLeadership() {
  renderFeaturedLeaders();
  renderLeaderGrid(LS_DATA);
  renderTimeline(LS_DATA[0]);
  renderInfluenceChart();
  setupLeadershipFilters();
  lsLoadLive();
}

function renderFeaturedLeaders() {
  const el = document.getElementById('ls-featured-cards');
  if (!el) return;
  const featured = LS_DATA.slice(0, 2);
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
  const leader = LS_DATA.find(l => l.id === id);
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
  const top6 = [...LS_DATA].sort((a,b) => b.influence - a.influence).slice(0, 6);
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
  let data = LS_DATA;
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

window.selectLeader = selectLeader;
