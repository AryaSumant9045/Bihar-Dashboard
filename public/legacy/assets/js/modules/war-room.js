/* ============================================================
   WAR ROOM MODULE — live NewsDashboard records via Supabase
   ============================================================ */

'use strict';

const WR_LEVEL_CONFIG = {
  critical:   { color:'var(--red)', dim:'var(--red-dim)', label:'🔴 CRITICAL' },
  developing: { color:'var(--amber)', dim:'var(--amber-dim)', label:'🟠 DEVELOPING' },
  watch:      { color:'var(--gold)', dim:'var(--gold-dim)', label:'🟡 WATCH' },
  routine:    { color:'var(--green)', dim:'var(--green-dim)', label:'🟢 ROUTINE' }
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

function wrEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' })[char]);
}

function wrTimeAgo(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const [unit, size] = Math.abs(seconds) < 60 ? ['second', 1] : Math.abs(seconds) < 3600 ? ['minute', 60] : Math.abs(seconds) < 86400 ? ['hour', 3600] : ['day', 86400];
  return new Intl.RelativeTimeFormat('en', { numeric:'auto' }).format(Math.round(seconds / size), unit);
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
  return ['BJP','RJD','JDU','Congress','NDA','Mahagathbandhan','Nitish Kumar','Tejashwi Yadav','Prashant Kishor','Election']
    .filter(tag => text.includes(tag.toLowerCase())).slice(0, 4);
}

function wrNormalise(item) {
  return {
    id: item.id,
    title: item.title || 'Untitled update',
    body: item.content || 'No content provided.',
    district: item.author || 'General',
    source: item.source || 'NewsData.io',
    created_at: item.created_at,
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
  if (!window.supabase || !window.BIHAR_SUPABASE_URL || !window.BIHAR_SUPABASE_ANON_KEY) {
    renderWarRoomError('Supabase configuration is missing.');
    return;
  }
  if (wrChannel && wrClient) wrClient.removeChannel(wrChannel);
  wrClient = window.supabase.createClient(window.BIHAR_SUPABASE_URL, window.BIHAR_SUPABASE_ANON_KEY);
  await loadAllWarRoomNews();
  wrChannel = wrClient.channel('war-room-news-live')
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'NewsDashboard' }, event => {
      const incoming = wrNormalise(event.new);
      if (wrAllNews.some(item => item.id === incoming.id)) return;
      wrAllNews = [incoming, ...wrAllNews];
      if (wrCurrentDistrict === 'all' || incoming.district.toLowerCase().includes(wrCurrentDistrict.toLowerCase())) {
        wrDisplayedNews = [incoming, ...wrDisplayedNews];
        applyFilters();
        showToast('Live news received', incoming.title, 'info');
      }
      renderTicker();
    })
    .subscribe();
}

async function loadAllWarRoomNews() {
  const { data, error } = await wrClient.from('NewsDashboard').select('*').order('created_at', { ascending:false }).limit(250);
  if (error) { renderWarRoomError(error.message); return; }
  wrAllNews = (data || []).map(wrNormalise);
  wrDisplayedNews = wrAllNews;
  renderTicker();
  applyFilters();
  renderSources();
  renderThreatGauge();
  renderCategoryChart();
  setupSearch();
}

async function filterByDistrict() {
  const select = document.getElementById('wr-district-filter');
  wrCurrentDistrict = select ? select.value : 'all';
  if (wrCurrentDistrict === 'all') {
    wrDisplayedNews = wrAllNews;
    applyFilters();
    return;
  }
  const grid = document.getElementById('wr-alerts-grid');
  if (grid) grid.innerHTML = '<div class="empty-state"><div class="spinner"></div><p class="empty-state-text">Loading district news…</p></div>';
  const { data, error } = await wrClient.from('NewsDashboard').select('*').ilike('author', `%${wrCurrentDistrict}%`).order('created_at', { ascending:false });
  if (error) { renderWarRoomError(error.message); return; }
  wrDisplayedNews = (data || []).map(wrNormalise);
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
  const grid = document.getElementById('wr-alerts-grid');
  if (!grid) return;
  if (!data.length) { grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><h3>No Alerts</h3><p class="empty-state-text">No live news matches these filters.</p></div>'; return; }
  const order = { critical:0, developing:1, watch:2, routine:3 };
  grid.innerHTML = [...data].sort((a,b) => order[a.level] - order[b.level]).map((item, index) => {
    const level = WR_LEVEL_CONFIG[item.level];
    return `<article class="card card-shine" style="border-left:4px solid ${level.color}; animation:slideInUp .3s ease both; animation-delay:${index * .04}s;">
      <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start;"><div style="min-width:0;flex:1;">
        <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.45rem;"><span style="padding:.2rem .55rem;background:${level.dim};border:1px solid ${level.color}44;border-radius:999px;color:${level.color};font-size:.65rem;font-weight:700;">${level.label}</span><span class="tag tag-blue">${wrEscape(item.category)}</span><span class="tag">📍 ${wrEscape(item.district)}</span></div>
        <div style="font-size:.9rem;font-weight:700;line-height:1.35;">${wrEscape(item.title)}</div>
        <div style="font-size:.78rem;color:var(--text-secondary);line-height:1.55;margin-top:.3rem;">${wrEscape(item.body).slice(0, 180)}${item.body.length > 180 ? '…' : ''}</div>
        <div style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;margin-top:.55rem;">${item.tags.map(tag => `<span class="tag">${wrEscape(tag)}</span>`).join('')}<span style="margin-left:auto;font-size:.68rem;color:var(--text-muted);">🕐 ${wrTimeAgo(item.created_at)}</span></div>
      </div><button class="btn btn-ghost btn-sm" onclick="openAlertDetail(${Number(item.id) || 0})">Details</button></div></article>`;
  }).join('');
}

function updateLevelCounts() {
  const counts = { critical:0, developing:0, watch:0, routine:0 };
  wrDisplayedNews.forEach(item => { counts[item.level]++; });
  Object.entries(counts).forEach(([level, count]) => { const el = document.getElementById(`wr-count-${level}`); if (el) el.textContent = count; });
}

function renderSources() {
  const el = document.getElementById('wr-sources');
  if (!el) return;
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;padding:.35rem 0;"><span style="font-size:.8rem;color:var(--text-secondary);">📡 NewsData.io feed</span><span style="font-size:.7rem;color:var(--green);">● Connected</span></div><div style="font-size:.7rem;color:var(--text-muted);">Supabase Realtime pushes new qualifying records instantly.</div>`;
}

function renderThreatGauge() {
  const canvas = document.getElementById('wr-threat-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (wrThreatChart) wrThreatChart.destroy();
  const critical = wrDisplayedNews.filter(item => item.level === 'critical').length;
  const score = Math.min(100, 20 + critical * 20 + wrDisplayedNews.filter(item => item.level === 'developing').length * 8);
  wrThreatChart = new Chart(canvas, { type:'doughnut', data:{ datasets:[{ data:[score, 100-score], backgroundColor:['#e63946','rgba(255,255,255,.05)'], borderWidth:0, circumference:180, rotation:270 }] }, options:{ responsive:false, plugins:{legend:{display:false}, tooltip:{enabled:false}}, cutout:'70%' } });
}

function renderCategoryChart() {
  const canvas = document.getElementById('wr-category-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (wrCategoryChart) wrCategoryChart.destroy();
  const categories = {};
  wrDisplayedNews.forEach(item => { categories[item.category] = (categories[item.category] || 0) + 1; });
  wrCategoryChart = new Chart(canvas, { type:'bar', data:{ labels:Object.keys(categories), datasets:[{ data:Object.values(categories), backgroundColor:'rgba(74,158,255,.7)', borderRadius:4 }] }, options:{ responsive:true, indexAxis:'y', plugins:{legend:{display:false}}, scales:{x:{ticks:{color:'#5a6a84',precision:0},grid:{color:'rgba(255,255,255,.04)'}},y:{ticks:{color:'#a8b4cc'},grid:{display:false}}} } });
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

function openAlertDetail(id) {
  const item = wrDisplayedNews.find(news => Number(news.id) === id);
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
