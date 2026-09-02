/* ============================================================
   HOME MODULE — President's Executive Dashboard
   assets/js/modules/home.js
   ============================================================ */

let homeMap = null;

function initHome() {
  setGreeting();
  renderTop3();
  renderTrendingSnap();
  renderActivityMini();
  renderOppositionSnap();
  renderOrgActivity();
  renderPKSnap();
  renderSpeechSnap();
  renderAlertSummary();
  renderTopIssues();
  initHomeMap();
}

/* ── Greeting ──────────────────────────────────────────────── */
function setGreeting() {
  const hr = new Date().getHours();
  const el = document.getElementById('home-greeting');
  if (el) el.textContent = hr < 12 ? 'Morning' : hr < 17 ? 'Afternoon' : 'Evening';

  const role = sessionStorage.getItem('bcc_role') || 'president';
  const roleNames = { president:'President Sahab', warroom:'War Room Team', district:'District Officer', comms:'Comms Team', readonly:'Leadership', it:'IT Cell' };
  const nameEl = document.getElementById('home-role-name');
  if (nameEl) nameEl.textContent = roleNames[role] || 'President Sahab';

  const dateEl = document.getElementById('home-date-str');
  if (dateEl) {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric', timeZone:'Asia/Kolkata' }) + ' — Command Center Live';
  }
}

/* ── Top 3 Attention Items ─────────────────────────────────── */
function renderTop3() {
  const el = document.getElementById('home-top3');
  if (!el) return;
  const top3 = NEWS_DATA.filter(n => n.severity === 'high').slice(0, 3);
  el.innerHTML = top3.map((n, i) => `
    <div style="padding:0.85rem 1rem; background:rgba(230,57,70,0.08); border:1px solid rgba(230,57,70,0.2); border-radius:var(--radius-md); cursor:pointer; transition:all 0.15s;"
      onmouseover="this.style.background='rgba(230,57,70,0.14)'" onmouseout="this.style.background='rgba(230,57,70,0.08)'"
      onclick="navigateTo('war-room')">
      <div style="display:flex; align-items:center; gap:0.4rem; margin-bottom:0.35rem;">
        <span style="font-family:'Outfit',sans-serif; font-size:1rem; font-weight:800; color:rgba(230,57,70,0.5);">${i+1}</span>
        <span class="tag tag-red" style="font-size:0.6rem;">${n.category}</span>
        <span style="font-size:0.65rem; color:var(--text-muted);">📍 ${n.district}</span>
      </div>
      <div style="font-size:0.82rem; font-weight:600; color:var(--text-primary); line-height:1.35;">${n.title}</div>
      <div style="font-size:0.7rem; color:var(--text-muted); margin-top:0.25rem;">📡 ${n.source} • ${n.time}</div>
    </div>
  `).join('');
}

/* ── Trending Snap ─────────────────────────────────────────── */
function renderTrendingSnap() {
  const el = document.getElementById('home-trending');
  if (!el) return;
  el.innerHTML = MEDIA_DATA.trending.slice(0, 4).map(t => `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:0.35rem 0; border-bottom:1px solid var(--border-subtle);">
      <div style="display:flex; align-items:center; gap:0.5rem;">
        <span class="tag ${t.sentiment==='negative'?'tag-red':t.sentiment==='positive'?'tag-green':'tag-blue'}" style="font-size:0.6rem; padding:0.1rem 0.35rem;">${t.platform}</span>
        <span style="font-size:0.8rem; font-weight:500; color:var(--text-primary);">${t.tag}</span>
      </div>
      <span style="font-size:0.7rem; color:var(--red); font-weight:600;">${t.change}</span>
    </div>
  `).join('');
}

/* ── Activity Mini ─────────────────────────────────────────── */
function renderActivityMini() {
  const el = document.getElementById('home-activity-mini');
  if (!el) return;
  const hotDistricts = Object.entries(OPPOSITION_DATA.districtActivity)
    .filter(([,v]) => v === 'very-high' || v === 'high').slice(0, 5);
  const colorMap = { 'very-high':'var(--red)', 'high':'var(--amber)' };
  el.innerHTML = hotDistricts.map(([d, level]) => `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:0.3rem 0; border-bottom:1px solid var(--border-subtle);">
      <div style="display:flex; align-items:center; gap:0.5rem;">
        <div style="width:8px; height:8px; border-radius:50%; background:${colorMap[level]||'var(--text-muted)'}; ${level==='very-high'?'animation:livePulse 1.5s ease infinite;':''}"></div>
        <span style="font-size:0.82rem; color:var(--text-secondary);">📍 ${d}</span>
      </div>
      <span class="tag ${level==='very-high'?'tag-red':'tag-amber'}" style="font-size:0.62rem;">${level==='very-high'?'Very High':'High'}</span>
    </div>
  `).join('');
}

/* ── Opposition Snap ───────────────────────────────────────── */
function renderOppositionSnap() {
  const el = document.getElementById('home-opposition-snap');
  if (!el) return;
  el.innerHTML = `
    ${OPPOSITION_DATA.parties.map(p => `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:0.3rem 0; border-bottom:1px solid var(--border-subtle);">
        <div style="font-size:0.82rem; color:var(--text-secondary);">${p.name} <span style="color:var(--text-muted); font-size:0.72rem;">• ${p.leader}</span></div>
        <div style="display:flex; align-items:center; gap:0.4rem;">
          <span class="tag ${p.activityLevel==='high'?'tag-red':p.activityLevel==='medium'?'tag-amber':'tag-green'}" style="font-size:0.6rem;">${p.activityLevel}</span>
          <span style="font-size:0.75rem; font-weight:600; color:var(--text-primary);">${p.strength}%</span>
        </div>
      </div>
    `).join('')}
    <div style="margin-top:0.4rem; font-size:0.72rem; color:var(--red); font-weight:600;">⚡ Top Narrative: ${OPPOSITION_DATA.attackNarratives[0].topic} (${OPPOSITION_DATA.attackNarratives[0].heat}%)</div>
  `;
}

/* ── Org Activity ──────────────────────────────────────────── */
function renderOrgActivity() {
  const el = document.getElementById('home-org-activity');
  if (!el) return;
  const activeLeaders = LEADERS_DATA.filter(l => l.party === 'BJP' || l.party === 'JDU').slice(0, 4);
  el.innerHTML = activeLeaders.map(l => `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:0.3rem 0; border-bottom:1px solid var(--border-subtle);">
      <div style="display:flex; align-items:center; gap:0.5rem;">
        <div style="width:26px; height:26px; border-radius:50%; background:${l.party==='BJP'?'linear-gradient(135deg,#ff6b2b,#d4500f)':'linear-gradient(135deg,#22c55e,#16a34a)'}; display:flex; align-items:center; justify-content:center; font-size:0.65rem; font-weight:700; color:white; flex-shrink:0;">${l.initials}</div>
        <div>
          <div style="font-size:0.78rem; font-weight:600; color:var(--text-primary);">${l.name}</div>
          <div style="font-size:0.66rem; color:var(--text-muted);">${l.lastActivityTime}</div>
        </div>
      </div>
      <span class="sentiment-badge sentiment-${l.sentiment}" style="font-size:0.6rem;">${l.sentiment==='positive'?'↑':'↓'}</span>
    </div>
  `).join('');
}

/* ── PK Snap ───────────────────────────────────────────────── */
function renderPKSnap() {
  const el = document.getElementById('home-pk-snap');
  if (!el) return;
  el.innerHTML = `
    <div style="display:flex; align-items:center; gap:0.5rem; padding:0.5rem 0.75rem; background:var(--red-dim); border-radius:var(--radius-md); margin-bottom:0.4rem;">
      <div style="width:32px; height:32px; border-radius:50%; background:linear-gradient(135deg,#ff9f43,#e63946); display:flex; align-items:center; justify-content:center; font-size:0.7rem; font-weight:800; color:white; flex-shrink:0;">PK</div>
      <div>
        <div style="font-size:0.8rem; font-weight:700; color:var(--text-primary);">Prashant Kishor</div>
        <div style="font-size:0.7rem; color:var(--red);">Threat: HIGH &nbsp;•&nbsp; ${PK_DATA.profile.lastSeen}</div>
      </div>
    </div>
    ${PK_DATA.activities.slice(0, 3).map(a => `
      <div style="font-size:0.75rem; color:var(--text-secondary); padding:0.2rem 0; border-bottom:1px solid var(--border-subtle); display:flex; gap:0.4rem;">
        <span style="color:var(--amber);">→</span>
        <span>${a.title} <span style="color:var(--text-muted);">(${a.time})</span></span>
      </div>
    `).join('')}
  `;
}

/* ── Speech Snap ───────────────────────────────────────────── */
function renderSpeechSnap() {
  const el = document.getElementById('home-speech-snap');
  if (!el) return;
  el.innerHTML = `
    <div style="font-size:0.78rem; color:var(--text-secondary); margin-bottom:0.5rem; line-height:1.5;">Generate a pre-event intelligence brief before any rally, press interaction or district visit.</div>
    <div style="display:flex; flex-direction:column; gap:0.35rem;">
      ${SPEECHES_DATA.slice(0,2).map(s=>`
        <div style="padding:0.4rem 0.6rem; background:var(--glass-bg); border-radius:var(--radius-sm); border:1px solid var(--border-subtle);">
          <div style="font-size:0.77rem; font-weight:600; color:var(--text-primary);">${s.speaker}</div>
          <div style="font-size:0.68rem; color:var(--text-muted);">${s.title.substring(0,45)}… • ${s.date}</div>
        </div>
      `).join('')}
    </div>
    <button class="btn btn-ghost btn-sm" style="width:100%; margin-top:0.5rem;" onclick="navigateTo('speech-intelligence')">→ Open Speech Intelligence</button>
  `;
}

/* ── Alert Summary ─────────────────────────────────────────── */
function renderAlertSummary() {
  const el = document.getElementById('home-alert-summary');
  if (!el) return;
  const counts = { critical:0, developing:0, watch:0, routine:0 };
  NEWS_DATA.forEach(n => {
    if (n.severity==='high') counts.critical++;
    else if (n.severity==='medium') counts.developing++;
    else counts.watch++;
  });
  counts.routine = 2;
  const items = [
    { label:'🔴 Critical', val: counts.critical, c:'var(--red)', bg:'var(--red-dim)' },
    { label:'🟠 Developing', val: counts.developing, c:'var(--amber)', bg:'var(--amber-dim)' },
    { label:'🟡 Watch', val: counts.watch, c:'var(--gold)', bg:'var(--gold-dim)' },
    { label:'🟢 Routine', val: counts.routine, c:'var(--green)', bg:'var(--green-dim)' },
  ];
  el.innerHTML = items.map(i=>`
    <div style="padding:0.6rem 0.75rem; background:${i.bg}; border-radius:var(--radius-md); text-align:center; cursor:pointer;" onclick="navigateTo('war-room')">
      <div style="font-size:0.65rem; color:var(--text-muted); margin-bottom:0.2rem;">${i.label}</div>
      <div style="font-family:'Outfit',sans-serif; font-size:1.5rem; font-weight:800; color:${i.c};">${i.val}</div>
    </div>
  `).join('');
}

/* ── Top Issues ────────────────────────────────────────────── */
function renderTopIssues() {
  const el = document.getElementById('home-top-issues');
  if (!el) return;
  const urgent = ISSUES_DATA.filter(i => i.priority === 'urgent' || i.priority === 'high').slice(0, 5);
  el.innerHTML = urgent.map(issue => {
    const pColor = issue.priority === 'urgent' ? 'var(--red)' : 'var(--amber)';
    return `
      <div style="display:flex; align-items:flex-start; gap:0.5rem; padding:0.5rem 0; border-bottom:1px solid var(--border-subtle); cursor:pointer;" onclick="navigateTo('issues')">
        <div style="width:7px; height:7px; border-radius:50%; background:${pColor}; margin-top:5px; flex-shrink:0;"></div>
        <div>
          <div style="font-size:0.78rem; font-weight:500; color:var(--text-primary); line-height:1.3;">${issue.title}</div>
          <div style="font-size:0.68rem; color:var(--text-muted);">📍 ${issue.district} • ${issue.category}</div>
        </div>
      </div>
    `;
  }).join('');
}

/* ── Home Map ──────────────────────────────────────────────── */
function initHomeMap() {
  if (typeof L === 'undefined') return;
  const mapEl = document.getElementById('home-map');
  if (!mapEl) return;
  if (homeMap) { homeMap.remove(); homeMap = null; }

  homeMap = L.map('home-map', { center:[25.65,85.90], zoom:7, zoomControl:true, attributionControl:false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { opacity:0.25 }).addTo(homeMap);

  const distCoords = {
    'Patna':[25.59,85.14],'Nalanda':[25.11,85.44],'Gaya':[24.79,85.00],
    'Muzaffarpur':[26.12,85.39],'Darbhanga':[26.15,85.89],'Madhubani':[26.36,86.07],
    'Bhagalpur':[25.24,86.98],'Nawada':[24.89,85.54],'Vaishali':[25.69,85.20],
    'Begusarai':[25.42,86.13],'Siwan':[26.22,84.35],'Samastipur':[25.88,85.78],
    'Rohtas':[24.99,83.78],'Supaul':[26.12,86.61],'Kishanganj':[26.09,87.94],
    'Purnia':[25.78,87.48],'Saran':[25.92,84.74],'Bhojpur':[25.56,84.46],
    'East Champaran':[26.78,84.92],'West Champaran':[27.16,84.38]
  };

  const oppActivity = OPPOSITION_DATA.districtActivity;
  const colorMap = { 'very-high':'#e63946', 'high':'#ff9f43', 'medium':'#f5c518', 'low':'#26de81' };

  Object.entries(distCoords).forEach(([dist, coords]) => {
    const level = oppActivity[dist] || 'low';
    const color = colorMap[level] || '#26de81';
    const radius = level==='very-high'?14:level==='high'?11:level==='medium'?9:7;

    const marker = L.circleMarker(coords, {
      radius, fillColor:color, color:'rgba(255,255,255,0.25)',
      weight:1.5, opacity:1, fillOpacity:0.85
    }).addTo(homeMap);

    marker.on('click', () => openDistrict360(dist));
    marker.bindTooltip(`<b>${dist}</b><br/>${level} opposition activity`, { className:'dark-tooltip' });
  });
}

/* ── District 360° View ────────────────────────────────────── */
function openDistrict360(district) {
  const modal = document.getElementById('district360-modal');
  const body = document.getElementById('d360-body');
  const title = document.getElementById('d360-title');
  if (!modal || !body) return;

  const distData = DISTRICTS_DATA.find(d => d.name === district);
  const oppLevel = OPPOSITION_DATA.districtActivity[district] || 'low';
  const distIssues = ISSUES_DATA.filter(i => i.district === district);
  const distLeaders = LEADERS_DATA.filter(l => l.district === district);
  const distNews = NEWS_DATA.filter(n => n.district === district);
  const colorMap = { 'very-high':'var(--red)','high':'var(--amber)','medium':'var(--gold)','low':'var(--green)' };

  if (title) title.textContent = `📍 ${district} — District 360° View`;

  body.innerHTML = `
    <!-- Top Stats -->
    <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:0.75rem; margin-bottom:1rem;">
      ${distData ? `
        <div style="text-align:center; padding:0.75rem; background:var(--glass-bg); border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
          <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em;">Total Seats</div>
          <div style="font-size:1.5rem; font-weight:800; font-family:'Outfit',sans-serif; color:var(--gold);">${distData.seats}</div>
        </div>
        <div style="text-align:center; padding:0.75rem; background:rgba(255,107,43,0.08); border-radius:var(--radius-md); border:1px solid rgba(255,107,43,0.2);">
          <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em;">BJP Seats</div>
          <div style="font-size:1.5rem; font-weight:800; font-family:'Outfit',sans-serif; color:var(--bjp-color);">${distData.bjp}</div>
        </div>
        <div style="text-align:center; padding:0.75rem; background:rgba(34,197,94,0.08); border-radius:var(--radius-md); border:1px solid rgba(34,197,94,0.2);">
          <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em;">JDU Seats</div>
          <div style="font-size:1.5rem; font-weight:800; font-family:'Outfit',sans-serif; color:var(--jdu-color);">${distData.jdu}</div>
        </div>
        <div style="text-align:center; padding:0.75rem; background:rgba(230,57,70,0.08); border-radius:var(--radius-md); border:1px solid rgba(230,57,70,0.2);">
          <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em;">Opposition</div>
          <div style="font-size:1.5rem; font-weight:800; font-family:'Outfit',sans-serif; color:var(--rjd-color);">${distData.rjd + distData.inc}</div>
        </div>
      ` : `<div style="grid-column:1/-1; text-align:center; color:var(--text-muted); font-size:0.85rem;">Seat data not available</div>`}
    </div>

    <!-- Opp Activity -->
    <div style="display:flex; align-items:center; gap:0.5rem; padding:0.6rem 0.9rem; background:${colorMap[oppLevel]}22; border:1px solid ${colorMap[oppLevel]}44; border-radius:var(--radius-md); margin-bottom:1rem;">
      <div style="width:10px; height:10px; border-radius:50%; background:${colorMap[oppLevel]}; ${oppLevel==='very-high'?'animation:livePulse 1.2s ease infinite;':''}"></div>
      <span style="font-size:0.82rem; font-weight:600; color:var(--text-primary);">Opposition Activity: <span style="color:${colorMap[oppLevel]}; text-transform:capitalize;">${oppLevel.replace('-',' ')}</span></span>
    </div>

    <!-- 3-col grid: Leaders | Issues | News -->
    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:0.75rem;">

      <!-- BJP/NDA Leaders -->
      <div>
        <div style="font-size:0.7rem; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-muted); margin-bottom:0.5rem;">🏛️ Active Leaders</div>
        ${distLeaders.length > 0 ? distLeaders.map(l=>`
          <div style="display:flex; align-items:center; gap:0.5rem; padding:0.35rem 0; border-bottom:1px solid var(--border-subtle);">
            <div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#ff6b2b,#d4500f);display:flex;align-items:center;justify-content:center;font-size:0.6rem;font-weight:700;color:white;flex-shrink:0;">${l.initials}</div>
            <div>
              <div style="font-size:0.77rem;font-weight:600;color:var(--text-primary);">${l.name}</div>
              <div style="font-size:0.66rem;color:var(--text-muted);">${l.role}</div>
            </div>
          </div>
        `).join('') : `<div style="font-size:0.78rem; color:var(--text-muted); padding:0.5rem 0;">No leaders tracked for this district</div>`}

        <div style="margin-top:0.75rem; font-size:0.7rem; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-muted); margin-bottom:0.5rem;">📊 District Activity</div>
        ${distData ? `
          <div style="font-size:0.78rem; color:var(--text-secondary);">
            <div style="padding:0.2rem 0;">Activity: <span style="color:${distData.activity==='very-high'?'var(--red)':distData.activity==='high'?'var(--amber)':'var(--text-muted)'}; font-weight:600;">${distData.activity}</span></div>
            <div style="padding:0.2rem 0;">Total Votes: ${(distData.totalVotes/100000).toFixed(1)}L</div>
          </div>
        ` : ''}
      </div>

      <!-- Issues -->
      <div>
        <div style="font-size:0.7rem; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-muted); margin-bottom:0.5rem;">📋 Open Issues (${distIssues.length})</div>
        ${distIssues.length > 0 ? distIssues.slice(0,4).map(i=>{
          const p = i.priority==='urgent'?'var(--red)':i.priority==='high'?'var(--amber)':'var(--gold)';
          return `<div style="padding:0.4rem 0; border-bottom:1px solid var(--border-subtle); display:flex;gap:0.4rem;">
            <div style="width:7px;height:7px;border-radius:50%;background:${p};margin-top:4px;flex-shrink:0;"></div>
            <div>
              <div style="font-size:0.76rem;color:var(--text-primary);line-height:1.3;">${i.title.substring(0,50)}${i.title.length>50?'…':''}</div>
              <div style="font-size:0.66rem;color:var(--text-muted);">${i.category} • ${i.status}</div>
            </div>
          </div>`;
        }).join('') : `<div style="font-size:0.78rem; color:var(--green); padding:0.5rem 0;">✓ No active issues</div>`}
      </div>

      <!-- News -->
      <div>
        <div style="font-size:0.7rem; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-muted); margin-bottom:0.5rem;">📰 Recent News</div>
        ${distNews.length > 0 ? distNews.slice(0,3).map(n=>`
          <div style="padding:0.4rem 0; border-bottom:1px solid var(--border-subtle);">
            <div style="font-size:0.76rem;font-weight:500;color:var(--text-primary);line-height:1.3;">${n.title.substring(0,55)}…</div>
            <div style="font-size:0.66rem;color:var(--text-muted);">📡 ${n.source} • ${n.time}</div>
          </div>
        `).join('') : `
          <div style="font-size:0.76rem;color:var(--text-muted);padding:0.4rem 0;">No recent news for ${district}</div>
          <div style="padding:0.4rem 0; border-bottom:1px solid var(--border-subtle);">
            <div style="font-size:0.76rem;font-weight:500;color:var(--text-primary);">Normal political activity</div>
            <div style="font-size:0.66rem;color:var(--text-muted);">No major developments</div>
          </div>
        `}
      </div>

    </div>

    <!-- Action Buttons -->
    <div style="display:flex; gap:0.5rem; margin-top:1.25rem; padding-top:1rem; border-top:1px solid var(--border-subtle);">
      <button class="btn btn-primary btn-sm" onclick="closeDistrict360(); navigateTo('issues')">📋 View Issues</button>
      <button class="btn btn-ghost btn-sm" onclick="closeDistrict360(); navigateTo('political-map')">🗺 Full Map</button>
      <button class="btn btn-ghost btn-sm" onclick="closeDistrict360(); navigateTo('speech-intelligence')">🎙 Speech Brief</button>
      <button class="btn btn-ghost btn-sm" onclick="closeDistrict360()">✕ Close</button>
    </div>
  `;

  modal.classList.add('open');
}

function closeDistrict360() {
  const modal = document.getElementById('district360-modal');
  if (modal) modal.classList.remove('open');
}

window.openDistrict360 = openDistrict360;
window.closeDistrict360 = closeDistrict360;
