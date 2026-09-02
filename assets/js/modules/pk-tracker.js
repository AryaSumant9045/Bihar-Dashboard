/* ============================================================
   PK TRACKER MODULE
   ============================================================ */

let pkMap = null;

function initPKTracker() {
  renderPKProfile();
  renderPKMap();
  renderPKTimeline();
  renderPKStrategy();
  renderPKSocial();
  renderPKThreatChart();
  renderPKAlliance();
  renderPKReachChart();
}

function renderPKProfile() {
  const el = document.getElementById('pk-profile');
  if (!el) return;
  const p = PK_DATA.profile;
  el.innerHTML = `
    <div style="display:grid; grid-template-columns:auto 1fr auto; gap:1.5rem; align-items:center;">
      <!-- Avatar -->
      <div style="position:relative;">
        <div style="width:80px; height:80px; border-radius:50%; background:linear-gradient(135deg,#ff9f43,#e63946); display:flex; align-items:center; justify-content:center; font-size:2rem; font-weight:800; color:white; border:3px solid rgba(230,57,70,0.5);">PK</div>
        <div class="pulse-ring" style="position:absolute; top:-4px; left:-4px; width:88px; height:88px; border-radius:50%;"></div>
      </div>
      <!-- Info -->
      <div>
        <div style="font-family:'Outfit',sans-serif; font-size:1.4rem; font-weight:800; color:var(--text-primary);">${p.name}</div>
        <div style="font-size:0.82rem; color:var(--text-muted); margin-top:0.2rem;">${p.org} &nbsp;•&nbsp; ${p.role}</div>
        <div style="display:flex; align-items:center; gap:0.75rem; margin-top:0.75rem; flex-wrap:wrap;">
          <span class="tag tag-red">🎯 ${p.currentFocus}</span>
          <span class="tag"><span style="width:8px; height:8px; background:var(--amber); border-radius:50%; display:inline-block; margin-right:4px; animation:livePulse 1.2s infinite;"></span>Last seen: ${p.lastSeen}</span>
          <span class="tag">📍 Base: ${p.baseLocation}</span>
        </div>
      </div>
      <!-- Threat -->
      <div style="text-align:center; padding:1rem 1.5rem; background:var(--red-dim); border:1px solid rgba(230,57,70,0.3); border-radius:var(--radius-lg);">
        <div style="font-size:0.65rem; font-weight:600; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-muted); margin-bottom:0.4rem;">Threat Level</div>
        <div class="glow-red" style="font-family:'Outfit',sans-serif; font-size:2rem; font-weight:800; color:var(--red);">${p.threat.toUpperCase()}</div>
        <div style="width:60px; height:4px; background:var(--red); border-radius:2px; margin:0.3rem auto 0;"></div>
        <div style="font-size:0.68rem; color:var(--text-muted); margin-top:0.3rem;">Active threat</div>
      </div>
    </div>
  `;
}

function renderPKMap() {
  if (typeof L === 'undefined') return;
  const mapEl = document.getElementById('pk-map');
  if (!mapEl) return;
  if (pkMap) { pkMap.remove(); pkMap = null; }

  pkMap = L.map('pk-map', { center: [25.65, 85.90], zoom: 7, zoomControl: false, attributionControl: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { opacity: 0.25 }).addTo(pkMap);

  PK_DATA.recentVisits.forEach((v, i) => {
    const radius = i === 0 ? 12 : 8;
    const opacity = i === 0 ? 1 : 0.7 - i * 0.1;
    const marker = L.circleMarker([v.lat, v.lng], {
      radius, fillColor: '#ff9f43', color: 'rgba(255,159,67,0.4)',
      weight: 2, opacity: 1, fillOpacity: opacity
    }).addTo(pkMap);
    marker.bindPopup(`<div style="font-family:'Inter',sans-serif; color:#e8edf8; min-width:150px;">
      <div style="font-weight:700; color:#ff9f43;">${v.district}</div>
      <div style="font-size:0.78rem; color:#a8b4cc; margin-top:0.25rem;">${v.purpose}</div>
      <div style="font-size:0.72rem; color:#5a6a84; margin-top:0.2rem;">${v.date}</div>
    </div>`, { className: 'dark-popup' });
    if (i === 0) marker.openPopup();
  });
}

function renderPKTimeline() {
  const el = document.getElementById('pk-timeline');
  if (!el) return;
  const typeMap = { meeting: { dot: 'amber', icon: '🤝' }, event: { dot: 'green', icon: '🏕️' }, statement: { dot: 'blue', icon: '📢' }, social: { dot: 'red', icon: '📱' } };
  el.innerHTML = PK_DATA.activities.map(a => {
    const t = typeMap[a.type] || { dot: 'amber', icon: '📋' };
    return `
      <div class="timeline-item">
        <div class="timeline-dot ${t.dot}">${t.icon}</div>
        <div class="timeline-body">
          <div class="timeline-title">${a.title}</div>
          <div class="timeline-desc">${a.summary}</div>
          <div class="timeline-time">${a.time}</div>
        </div>
      </div>`;
  }).join('');
}

function renderPKStrategy() {
  const el = document.getElementById('pk-strategy');
  if (!el) return;
  el.innerHTML = PK_DATA.strategyCards.map((s, i) => `
    <div style="padding:0.7rem 0.9rem; border-radius:var(--radius-md); background:var(--glass-bg); border-left:3px solid ${s.focus === 'high' ? 'var(--red)' : 'var(--amber)'}; animation:slideInUp 0.3s ease both; animation-delay:${i*0.06}s;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.25rem;">
        <span style="font-size:0.85rem; font-weight:600; color:var(--text-primary);">${s.title}</span>
        <span class="tag ${s.focus === 'high' ? 'tag-red' : 'tag-amber'}" style="font-size:0.6rem;">${s.focus.toUpperCase()}</span>
      </div>
      <div style="font-size:0.75rem; color:var(--text-secondary); line-height:1.5;">${s.desc}</div>
    </div>
  `).join('');
}

function renderPKSocial() {
  const el = document.getElementById('pk-social');
  if (!el) return;
  const data = [
    { platform: '🐦 Twitter',    mentions: '2.1M', change: '+45%', color: 'var(--blue)'  },
    { platform: '▶ YouTube',     mentions: '980K', change: '+65%', color: 'var(--red)'   },
    { platform: '💬 WhatsApp',   mentions: '450K', change: '+120%',color: 'var(--green)' },
    { platform: '📘 Facebook',   mentions: '310K', change: '+28%', color: 'var(--blue)'  },
  ];
  el.innerHTML = data.map(d => `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:0.5rem 0; border-bottom:1px solid var(--border-subtle);">
      <span style="font-size:0.82rem; color:var(--text-secondary);">${d.platform}</span>
      <div style="display:flex; align-items:center; gap:0.75rem;">
        <span style="font-family:'Outfit',sans-serif; font-size:0.9rem; font-weight:700; color:var(--text-primary);">${d.mentions}</span>
        <span style="font-size:0.7rem; color:var(--red); font-weight:600;">${d.change}</span>
      </div>
    </div>
  `).join('');
}

function renderPKThreatChart() {
  const canvas = document.getElementById('pk-threat-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  const d = PK_DATA.sentimentData;
  new Chart(canvas, {
    type: 'line',
    data: {
      labels: d.labels,
      datasets: [{
        label: 'Threat Index',
        data: d.threatIndex,
        borderColor: '#e63946',
        backgroundColor: 'rgba(230,57,70,0.12)',
        borderWidth: 2, tension: 0.4, fill: true,
        pointRadius: 4, pointBackgroundColor: '#e63946'
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f1829', titleColor: '#e8edf8', bodyColor: '#a8b4cc', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1 } },
      scales: {
        y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#5a6a84', font: { size: 10 } } },
        x: { grid: { display: false }, ticks: { color: '#a8b4cc', font: { size: 10 } } }
      }
    }
  });
}

function renderPKAlliance() {
  const el = document.getElementById('pk-alliance');
  if (!el) return;
  const alliances = [
    { party: 'INC (Congress)', status: 'Active Talks',    level: 'high',   color: 'var(--blue)'  },
    { party: 'RJD',            status: 'Indirect Support', level: 'medium', color: 'var(--red)'   },
    { party: 'Left Parties',   status: 'Coordination',    level: 'medium', color: 'var(--amber)' },
    { party: 'JD(U) defectors',status: 'Intelligence',    level: 'low',    color: 'var(--green)' },
  ];
  el.innerHTML = alliances.map(a => `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:0.4rem 0; border-bottom:1px solid var(--border-subtle);">
      <div style="display:flex; align-items:center; gap:0.5rem;">
        <div style="width:8px; height:8px; border-radius:50%; background:${a.color};"></div>
        <span style="font-size:0.8rem; color:var(--text-secondary);">${a.party}</span>
      </div>
      <span class="tag ${a.level === 'high' ? 'tag-red' : a.level === 'medium' ? 'tag-amber' : 'tag-green'}" style="font-size:0.62rem;">${a.status}</span>
    </div>
  `).join('');
}

function renderPKReachChart() {
  const canvas = document.getElementById('pk-reach-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Patna', 'Gaya', 'Muz.', 'Darb.', 'Bhagal.'],
      datasets: [{
        data: [85, 72, 68, 60, 55],
        backgroundColor: ['rgba(255,159,67,0.8)','rgba(255,159,67,0.6)','rgba(255,159,67,0.5)','rgba(255,159,67,0.4)','rgba(255,159,67,0.3)'],
        borderRadius: 4, borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#5a6a84', font: { size: 9 } } },
        x: { grid: { display: false }, ticks: { color: '#a8b4cc', font: { size: 9 } } }
      }
    }
  });
}
