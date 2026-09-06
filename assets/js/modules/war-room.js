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
let wrNewsExpanded = false;
let wrRssItems = [];
let wrRssExpanded = false;
let wrRssSourceName = 'Bihar News';
let wrRssPanelId = 'wr-rss-panel';
let wrRssSource = '';

function wrEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
}

function wrTimeAgo(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const [unit, size] = Math.abs(seconds) < 60 ? ['second', 1] : Math.abs(seconds) < 3600 ? ['minute', 60] : Math.abs(seconds) < 86400 ? ['hour', 3600] : ['day', 86400];
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round(seconds / size), unit);
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

function wrNormalise(item) {
  return {
    id: item.id,
    title: item.title || 'Untitled update',
    body: item.content || item.body || 'No content provided.',
    district: item.author || item.district || 'General',
    source: item.source || 'NewsData.io',
    created_at: item.created_at || item.time,
    url: item.url || item.link || '',
    category: wrCategory(item),
    level: wrLevel(item),
    tags: wrTags(item)
  };
}

function initWarRoom() {
  setupWarRoomControls();
  connectWarRoom();
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
    const response = await fetch('http://localhost:8000/api/live-news');
    if (!response.ok) throw new Error('Failed to fetch live news');
    const result = await response.json();

    if (result.status === 'success') {
      wrAllNews = result.data.map(wrNormalise);
      wrDisplayedNews = wrAllNews;
      renderTicker();
      applyFilters();
      renderSources();
      renderThreatGauge();
      renderCategoryChart();
      setupSearch();
    } else {
      throw new Error('API returned failure status');
    }
  } catch (error) {
    renderWarRoomError(error.message);
  }
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
  const titles = wrAllNews.slice(0, 8).map(item => `📡 ${item.title}`);
  el.innerHTML = [...titles, ...titles].map(title => `<span class="ticker-item">${wrEscape(title)}</span>`).join('') || '<span class="ticker-item">Waiting for live political news…</span>';
}

function filterByLevel(level) {
  wrCurrentLevel = level;
  document.querySelectorAll('#wr-filter-group .filter-pill').forEach(pill => pill.classList.toggle('active', pill.dataset.level === level));
  applyFilters();
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
    const visibleNews = wrNewsExpanded ? sortedNews : sortedNews.slice(0, 5);
    newsGrid.innerHTML = visibleNews.map((item, index) => {
      const level = WR_LEVEL_CONFIG[item.level];
      return `<article class="card card-shine" style="border-left:4px solid ${level.color}; animation:slideInUp .3s ease both; animation-delay:${index * .04}s;">
        <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start;"><div style="min-width:0;flex:1;">
          <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.45rem;"><span style="padding:.2rem .55rem;background:${level.dim};border:1px solid ${level.color}44;border-radius:999px;color:${level.color};font-size:.65rem;font-weight:700;">${level.label}</span><span class="tag tag-blue">${wrEscape(item.category)}</span><span class="tag">📍 ${wrEscape(item.district)}</span><span class="tag" style="border-color:var(--primary);color:var(--primary-light);">📡 ${wrEscape(item.source)}</span></div>
          <div style="font-size:.9rem;font-weight:700;line-height:1.35;margin-top:.4rem;">${wrEscape(item.title)}</div>
          <div style="font-size:.78rem;color:var(--text-secondary);line-height:1.55;margin-top:.3rem;">${wrEscape(item.body).slice(0, 180)}${item.body.length > 180 ? '…' : ''}</div>
          <div style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;margin-top:.55rem;">${item.tags.map(tag => `<span class="tag">${wrEscape(tag)}</span>`).join('')}<span style="margin-left:auto;font-size:.68rem;color:var(--text-muted);">🕐 ${wrTimeAgo(item.created_at)}</span></div>
        </div><button class="btn btn-ghost btn-sm" onclick="openAlertDetail('${item.id}')">Details</button></div></article>`;
    }).join('') + (sortedNews.length > 5 ? `<button class="btn btn-ghost" style="align-self:center;margin-top:.25rem;" onclick="toggleNewsExpansion()">${wrNewsExpanded ? 'Show less' : `Read more (${sortedNews.length - 5} more)`}</button>` : '');
  }

  if (ytGrid) {
    if (!ytData.length) {
      ytGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><p class="empty-state-text">No YouTube videos available.</p></div>';
    } else {
      const channels = [...new Map(ytData.map(item => [item.source, ytData.filter(video => video.source === item.source)])).values()];
      ytGrid.innerHTML = channels.map((videos, channelIndex) => `<section style="width:100%;padding:1rem;margin-bottom:1rem;border:1px solid var(--border-subtle);border-radius:var(--radius-lg);background:var(--glass-bg);">
        <h3 style="margin:0 0 .85rem;font-size:.9rem;color:var(--text-primary);">▶️ ${wrEscape(videos[0].source.replace('YouTube: ', ''))}</h3>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;">
          ${videos.slice(0, 3).map((item, index) => { const level = WR_LEVEL_CONFIG[item.level]; return `<article class="card card-shine" style="border-left:4px solid ${level.color};animation:slideInUp .3s ease both;animation-delay:${(channelIndex * 3 + index) * .04}s;"><div style="display:flex;flex-direction:column;gap:.75rem;height:100%;"><div style="font-size:.9rem;font-weight:700;line-height:1.35;">${wrEscape(item.title)}</div><div style="font-size:.75rem;color:var(--text-secondary);line-height:1.4;">${wrEscape(item.body).slice(0, 120)}${item.body.length > 120 ? '…' : ''}</div><div style="display:flex;gap:.4rem;align-items:center;margin-top:auto;"><span style="font-size:.68rem;color:var(--text-muted);">🕐 ${wrTimeAgo(item.created_at)}</span>${item.url ? `<a class="btn btn-ghost btn-sm" style="margin-left:auto;" href="${wrEscape(item.url)}" target="_blank" rel="noopener noreferrer">▶ Watch</a>` : ''}<button class="btn btn-ghost btn-sm" onclick="openAlertDetail('${item.id}')">Details</button></div></div></article>`; }).join('')}
        </div>
      </section>`).join('');
    }
  }
}

function toggleNewsExpansion() {
  wrNewsExpanded = !wrNewsExpanded;
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
    const response = await fetch(`http://localhost:8000/api/rss-news?source=${encodeURIComponent(source)}`);
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

function openAlertDetail(id) {
  const item = wrDisplayedNews.find(news => String(news.id) === String(id));
  if (!item) return;
  openModal(`<p style="line-height:1.7;color:var(--text-secondary);">${wrEscape(item.body)}</p><p style="font-size:.78rem;color:var(--text-muted);">📍 ${wrEscape(item.district)} · 📡 ${wrEscape(item.source)} · ${wrTimeAgo(item.created_at)}</p>`, wrEscape(item.title));
}

function renderWarRoomError(message) {
  const grid = document.getElementById('wr-alerts-grid');
  if (grid) grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Live feed unavailable</h3><p class="empty-state-text">${wrEscape(message)}</p></div>`;
}

window.openAlertDetail = openAlertDetail;
window.filterByLevel = filterByLevel;
window.filterByCategory = filterByCategory;
window.filterByDistrict = filterByDistrict;
window.toggleNewsExpansion = toggleNewsExpansion;
window.loadWarRoomRss = loadWarRoomRss;
window.toggleWarRoomRssSource = toggleWarRoomRssSource;
window.toggleWarRoomRss = toggleWarRoomRss;
