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
  loadPKInstagramFeed();
  loadPKFetchRssFeed();
  loadPKXFeed();
  loadPKJanSuraajYouTube();
  loadPKIntel(); // overlay live AI snapshot (activity log, strategy, map, social)
  loadPKAISummary(); // top AI Intelligence Summary card (pk_tracker_summary)
}

// ── Live PK intelligence (AI snapshot from /api/cron/pk-intel) ────────────
// Renders real data from Jan Suraaj X posts + press releases + district news.
// Falls back silently to PK_DATA defaults when no snapshot exists yet.
function loadPKIntel() {
  fetch('/api/pk-intel', { cache: 'no-store' })
    .then(res => res.json())
    .then(payload => {
      if (!payload || !payload.has_data || !payload.snapshot) return;
      const s = payload.snapshot;
      if (Array.isArray(s.movement_map) && s.movement_map.length) renderPKMap(s.movement_map);
      if (Array.isArray(s.activity_log) && s.activity_log.length) renderPKTimeline(s.activity_log);
      if (Array.isArray(s.strategy_cards) && s.strategy_cards.length) renderPKStrategy(s.strategy_cards);
      if (Array.isArray(s.social_stats) && s.social_stats.length) renderPKSocial(s.social_stats);
      const stamp = document.getElementById('pk-intel-stamp');
      if (stamp && s.generated_at) {
        stamp.textContent = '🔄 Live: ' + new Date(s.generated_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        stamp.style.display = 'inline-block';
      }
    })
    .catch(err => console.error('[PK-Intel] fetch error:', err));
}

function loadPKFetchRssFeed() {
  const grid = document.getElementById('pk-fetchrss-grid');
  if (!grid) return;
  fetch('/api/fetchrss', { cache: 'no-store' })
    .then(response => response.json())
    .then(data => {
      if (!data.items || !data.items.length) {
        grid.innerHTML = `<div class="pk-news-empty">${escapePKNewsValue(data.message || 'No Facebook RSS updates are available yet.')}</div>`;
        return;
      }
      grid.innerHTML = data.items.map(item => `
        <article class="pk-instagram-item">
          ${item.image ? `<img src="${escapePKNewsValue(item.image)}" alt="" loading="lazy">` : '<div class="pk-instagram-placeholder">📡</div>'}
          <div class="pk-instagram-body">
            <div class="pk-news-meta"><span>${escapePKNewsValue(item.author || 'Jan Suraaj')}</span><span>${item.published_at ? new Date(item.published_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'Latest'}</span></div>
            <p>${escapePKNewsValue(item.title)}</p>
            <a href="${escapePKNewsValue(item.link)}" target="_blank" rel="noopener noreferrer">Open Facebook post ↗</a>
          </div>
        </article>`).join('');
    })
    .catch(() => { grid.innerHTML = '<div class="pk-news-empty">Facebook RSS feed is temporarily unavailable.</div>'; });
}

function loadPKInstagramFeed() {
  if (!document.querySelector('.sk-instagram-feed')) return;
  if (document.querySelector('script[data-sociablekit-instagram]')) return;

  const script = document.createElement('script');
  script.src = 'https://widgets.sociablekit.com/instagram-feed/widget.js';
  script.defer = true;
  script.dataset.sociablekitInstagram = 'true';
  document.head.appendChild(script);
}

function escapePKNewsValue(value) {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

/* ── AI Intelligence Summary (PK Tracker top card) ──────────────────────── */
function pkSevCfg(s) {
  const m = {
    critical: { c: 'var(--red)',   e: '🔴', l: 'CRITICAL' },
    high:     { c: 'var(--amber)', e: '🟠', l: 'HIGH' },
    medium:   { c: 'var(--gold)',  e: '🟡', l: 'MEDIUM' },
    low:      { c: 'var(--green)', e: '🟢', l: 'LOW' },
  };
  return m[String(s || '').toLowerCase()] || m.medium;
}

function loadPKAISummary() {
  const card = document.getElementById('pk-ai-summary');
  if (!card) return;
  fetch('/api/pk-summary', { cache: 'no-store' })
    .then(r => r.json())
    .then(payload => {
      if (!payload || !payload.has_data || !payload.summary) return;
      renderPKAISummary(payload.summary);
      card.style.display = 'block';
    })
    .catch(err => console.error('[PK-AI-Summary] fetch error:', err));
}

function renderPKAISummary(s) {
  const body = document.getElementById('pk-ai-body');
  const stamp = document.getElementById('pk-ai-stamp');
  if (!body) return;
  if (stamp && s.created_at) {
    stamp.textContent = '🔄 ' + new Date(s.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  const list = (arr, renderItem) => (Array.isArray(arr) && arr.length)
    ? `<ul style="margin:0; padding-left:1.1rem; display:flex; flex-direction:column; gap:0.4rem;">${arr.map(renderItem).join('')}</ul>`
    : '<div style="font-size:0.75rem; color:var(--text-muted);">इस बैच में कोई उल्लेखनीय जानकारी नहीं मिली।</div>';

  const sec = (title, color, inner) => `
    <div style="background:var(--glass-bg); border:1px solid var(--border-subtle); border-left:3px solid ${color}; border-radius:8px; padding:0.85rem 1rem;">
      <div style="font-size:0.78rem; font-weight:700; color:${color}; margin-bottom:0.5rem;">${title}</div>
      ${inner}
    </div>`;

  body.innerHTML = `
    <div style="padding:0.85rem 1rem; background:rgba(230,57,70,0.06); border-left:3px solid var(--red); border-radius:8px; margin-bottom:0.85rem; font-size:0.85rem; line-height:1.6; color:var(--text-primary);">
      ${escapePKNewsValue(s.overall_situation || '')}
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.85rem;" class="pk-ai-grid">
      ${sec('📌 Key Activities', 'var(--blue)', list(s.key_activities, a => `<li style="font-size:0.78rem; color:var(--text-secondary); line-height:1.45;">${escapePKNewsValue(a)}</li>`))}
      ${sec('🎯 Counter-Strategy for BJP', 'var(--green)', list(s.counter_strategy_points, a => `<li style="font-size:0.78rem; color:var(--text-secondary); line-height:1.45;">${escapePKNewsValue(a)}</li>`))}
      ${sec('⚔️ Attacks on BJP / Govt', 'var(--red)', list(s.attacks_on_bjp, a => {
        const o = typeof a === 'string' ? { attack_summary: a, severity: 'Medium' } : a;
        const c = pkSevCfg(o.severity);
        return `<li style="font-size:0.78rem; color:var(--text-secondary); line-height:1.45;"><span class="tag" style="font-size:0.58rem; color:${c.c}; border-color:${c.c}; margin-right:0.3rem;">${c.e} ${c.l}</span>${escapePKNewsValue(o.attack_summary)}</li>`;
      }))}
      ${sec('⚠️ Risk to BJP', 'var(--amber)', list(s.risk_to_bjp, a => {
        const o = typeof a === 'string' ? { issue: a, risk_level: 'Medium', reason: '' } : a;
        const c = pkSevCfg(o.risk_level);
        return `<li style="font-size:0.78rem; color:var(--text-secondary); line-height:1.45;"><span class="tag" style="font-size:0.58rem; color:${c.c}; border-color:${c.c}; margin-right:0.3rem;">${c.e} ${c.l}</span><b>${escapePKNewsValue(o.issue)}</b>${o.reason ? ` — <span style="color:var(--text-muted);">${escapePKNewsValue(o.reason)}</span>` : ''}</li>`;
      }))}
    </div>
    ${(Array.isArray(s.bjp_advantage_points) && s.bjp_advantage_points.length) ? `
    <div style="margin-top:0.85rem;">${sec('💡 BJP Advantage Points', 'var(--gold)', list(s.bjp_advantage_points, a => `<li style="font-size:0.78rem; color:var(--text-secondary); line-height:1.45;">${escapePKNewsValue(a)}</li>`))}</div>` : ''}
  `;
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

function renderPKMap(visits) {
  if (typeof L === 'undefined') return;
  const mapEl = document.getElementById('pk-map');
  if (!mapEl) return;
  if (pkMap) { pkMap.remove(); pkMap = null; }

  const points = (Array.isArray(visits) && visits.length) ? visits : PK_DATA.recentVisits;

  pkMap = L.map('pk-map', { center: [25.65, 85.90], zoom: 7, zoomControl: false, attributionControl: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { opacity: 0.25 }).addTo(pkMap);

  points.forEach((v, i) => {
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

function renderPKTimeline(activities) {
  const el = document.getElementById('pk-timeline');
  if (!el) return;
  const items = (Array.isArray(activities) && activities.length) ? activities : PK_DATA.activities;
  const typeMap = { meeting: { dot: 'amber', icon: '🤝' }, event: { dot: 'green', icon: '🏕️' }, statement: { dot: 'blue', icon: '📢' }, social: { dot: 'red', icon: '📱' } };
  el.innerHTML = items.map(a => {
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

function renderPKStrategy(cards) {
  const el = document.getElementById('pk-strategy');
  if (!el) return;
  const items = (Array.isArray(cards) && cards.length) ? cards : PK_DATA.strategyCards;
  el.innerHTML = items.map((s, i) => `
    <div style="padding:0.7rem 0.9rem; border-radius:var(--radius-md); background:var(--glass-bg); border-left:3px solid ${s.focus === 'high' ? 'var(--red)' : 'var(--amber)'}; animation:slideInUp 0.3s ease both; animation-delay:${i * 0.06}s;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.25rem;">
        <span style="font-size:0.85rem; font-weight:600; color:var(--text-primary);">${s.title}</span>
        <span class="tag ${s.focus === 'high' ? 'tag-red' : 'tag-amber'}" style="font-size:0.6rem;">${(s.focus || 'medium').toUpperCase()}</span>
      </div>
      <div style="font-size:0.75rem; color:var(--text-secondary); line-height:1.5;">${s.desc}</div>
    </div>
  `).join('');
}

function renderPKSocial(liveData) {
  const el = document.getElementById('pk-social');
  if (!el) return;
  const data = (Array.isArray(liveData) && liveData.length) ? liveData : [
    { platform: '🐦 Twitter', mentions: '2.1M', change: '+45%', color: 'var(--blue)' },
    { platform: '▶ YouTube', mentions: '980K', change: '+65%', color: 'var(--red)' },
    { platform: '💬 WhatsApp', mentions: '450K', change: '+120%', color: 'var(--green)' },
    { platform: '📘 Facebook', mentions: '310K', change: '+28%', color: 'var(--blue)' },
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
    { party: 'INC (Congress)', status: 'Active Talks', level: 'high', color: 'var(--blue)' },
    { party: 'RJD', status: 'Indirect Support', level: 'medium', color: 'var(--red)' },
    { party: 'Left Parties', status: 'Coordination', level: 'medium', color: 'var(--amber)' },
    { party: 'JD(U) defectors', status: 'Intelligence', level: 'low', color: 'var(--green)' },
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
        backgroundColor: ['rgba(255,159,67,0.8)', 'rgba(255,159,67,0.6)', 'rgba(255,159,67,0.5)', 'rgba(255,159,67,0.4)', 'rgba(255,159,67,0.3)'],
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

// ── Jan Suraaj YouTube (official channel RSS: videos + live) ──────────────
function loadPKJanSuraajYouTube() {
  const grid = document.getElementById('pk-yt-grid');
  if (!grid) return;
  fetch('/api/jansuraaj-youtube?limit=8', { cache: 'no-store' })
    .then(res => res.json())
    .then(payload => {
      const videos = payload.videos || [];
      if (!videos.length) {
        grid.innerHTML = '<div class="pk-news-empty">No YouTube videos available right now.</div>';
        return;
      }
      grid.innerHTML = videos.map(v => `
        <a href="${escapePKNewsValue(v.url)}" target="_blank" rel="noopener noreferrer"
           style="display:flex; flex-direction:column; background:var(--glass-bg); border:1px solid rgba(255,159,67,0.2); border-radius:var(--radius-sm); overflow:hidden; text-decoration:none; transition:border-color 0.2s;">
          <div style="position:relative;">
            ${v.thumbnail ? `<img src="${escapePKNewsValue(v.thumbnail)}" alt="" loading="lazy" onerror="this.style.display='none'" style="width:100%; height:130px; object-fit:cover; border-bottom:1px solid rgba(255,159,67,0.25);">` : ''}
            <span style="position:absolute; bottom:6px; right:6px; background:rgba(0,0,0,0.78); color:#fff; font-size:0.6rem; font-weight:700; padding:0.12rem 0.4rem; border-radius:4px;">▶ Watch</span>
          </div>
          <div style="padding:0.7rem; display:flex; flex-direction:column; gap:0.4rem; flex:1;">
            <div style="font-size:0.8rem; font-weight:600; color:var(--text-primary); line-height:1.4; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${escapePKNewsValue(v.title)}</div>
            ${v.excerpt ? `<div style="font-size:0.7rem; color:var(--text-secondary); line-height:1.4; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${escapePKNewsValue(v.excerpt)}</div>` : ''}
            <div style="font-size:0.66rem; color:var(--text-muted); margin-top:auto;">${v.published ? new Date(v.published).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Latest'}</div>
          </div>
        </a>`).join('');
    })
    .catch(err => {
      console.error('[PK-YouTube] fetch error:', err);
      grid.innerHTML = '<div class="pk-news-empty">YouTube feed is temporarily unavailable.</div>';
    });
}

// ── Jan Suraaj X Feed (RSSHub) ───────────────────────────────────────────
let pkXPage = 1;

function loadPKXFeed() {
  const grid = document.getElementById('pk-x-feed-grid');
  if (!grid) return;
  
  pkXPage = 1;
  fetch(`/api/x-social?table=xjansuraaj&limit=5`, { cache: 'no-store' })
    .then(res => res.json())
    .then(payload => {
      const data = payload.data || [];
      if (data.length === 0) {
        grid.innerHTML = `<div class="pk-news-empty">No X posts available yet.</div>`;
        document.getElementById('pk-x-btn').style.display = 'none';
        return;
      }
      grid.innerHTML = renderPKXPosts(data);
    })
    .catch(err => {
      console.error('[PK-X-Feed] fetch error:', err);
      grid.innerHTML = `<div class="pk-news-empty">Failed to load X feed.</div>`;
    });
}

function renderPKXPosts(posts) {
  return posts.map(post => {
    const d = new Date(post.published_at);
    const dateStr = isNaN(d.getTime()) ? 'Recent' : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `
      <article style="padding:0.75rem; background:var(--glass-bg); border:1px solid rgba(255,159,67,0.2); border-radius:var(--radius-sm); transition:border-color 0.2s;">
        ${post.image_url ? `<img src="${escapePKNewsValue(post.image_url)}" alt="" loading="lazy" onerror="this.style.display='none'"
              style="width:100%; height:170px; object-fit:cover; border-radius:6px; margin-bottom:0.55rem; border:1px solid rgba(255,159,67,0.25);">` : ''}
        <div style="font-size:0.85rem; color:var(--text-primary); margin-bottom:0.5rem; line-height:1.4;">
          ${escapePKNewsValue(post.heading)}
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.7rem; color:var(--text-muted);">
          <span>${dateStr}</span>
          <a href="${escapePKNewsValue(post.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--amber); text-decoration:none;">Source ↗</a>
        </div>
      </article>
    `;
  }).join('');
}

function loadMorePKXPosts() {
  const btn = document.getElementById('pk-x-btn');
  const grid = document.getElementById('pk-x-feed-grid');
  if (!btn || !grid) return;
  
  btn.innerText = 'Loading...';
  btn.disabled = true;
  
  const limit = 5;
  const offset = pkXPage * limit;
  
  fetch(`/api/x-social?table=xjansuraaj&limit=${limit}&offset=${offset}`, { cache: 'no-store' })
    .then(res => res.json())
    .then(payload => {
      const data = payload.data || [];
      if (data.length > 0) {
        grid.insertAdjacentHTML('beforeend', renderPKXPosts(data));
        pkXPage++;
        btn.innerText = 'Read More ↓';
        btn.disabled = false;
      } else {
        btn.innerText = 'No more posts';
        btn.disabled = true;
      }
    })
    .catch(err => {
      console.error('[PK-X-Feed] loadMore error:', err);
      btn.innerText = 'Error loading more';
      setTimeout(() => { btn.innerText = 'Read More ↓'; btn.disabled = false; }, 2000);
    });
}
