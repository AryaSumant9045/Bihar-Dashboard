/* ============================================================
   ISSUES & GRIEVANCES MODULE
   ============================================================ */

let isPriorityFilter = 'all';
let isStatusFilter = 'all';
let isDistrictFilter = 'all';
let isKeywordFilter = '';
let isCategoryChart = null;

/* Districts with a Live Hindustan feed (kept in sync with
   app/api/cron/district-news/route.js DISTRICT_FEEDS). */
const IS_FEED_DISTRICTS = [
  'Bihar',
  'Patna', 'Bhagalpur', 'Muzaffarpur', 'Ara', 'Begusarai', 'Biharsharif', 'Buxar',
  'Chapra', 'Gopalganj', 'Hajipur', 'Jahanabad', 'Siwan', 'Gaya', 'Aurangabad',
  'Bhabua', 'Nawada', 'Sasaram', 'Banka', 'Araria', 'Katihar', 'Khagaria',
  'Kishanganj', 'Madhepura', 'Munger', 'Purnia', 'Saharsa', 'Lakhisarai',
  'Jamui', 'Supaul', 'Darbhanga', 'Madhubani', 'Bagaha', 'Bettiah', 'Motihari',
  'Samastipur', 'Sitamarhi',
];

/* Some UI datasets use district HQ / legacy spellings instead of the feed names. */
const IS_DISTRICT_ALIAS = {
  Jehanabad: 'Jahanabad',
  Bhojpur: 'Ara',
  Nalanda: 'Biharsharif',
  Rohtas: 'Sasaram',
  Kaimur: 'Bhabua',
  Saran: 'Chapra',
  Vaishali: 'Hajipur',
  'East Champaran': 'Motihari',
  'West Champaran': 'Bettiah',
};
const IS_NEWS_DEFAULT_DISTRICT = 'Bihar';
const IS_NEWS_PAGE_SIZE = 5;

const isNewsState = { district: IS_NEWS_DEFAULT_DISTRICT, items: [], total: 0, loading: false, requestId: 0 };

function initIssues() {
  populateDistrictFilter();
  setupKeywordSearch();
  renderIssuesList(ISSUES_DATA);
  renderIssueDetail(ISSUES_DATA[0]);
  renderCategoryChart();
  renderDistrictBreakdown();
  updateIssueCounts(ISSUES_DATA);
  setupIssueFilters();
  loadDistrictNews(isDistrictFilter);
}

function isEsc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]
  ));
}

// ── District News (district_news table, saved daily by the District News Daily Action) ──
function populateDistrictFilter() {
  const select = document.getElementById('is-district-select');
  if (!select || select.options.length > 1) return;

  const fromIssues = (typeof ISSUES_DATA !== 'undefined' ? ISSUES_DATA : [])
    .map(i => i.district)
    .filter(d => d && d !== 'Multiple');
  const all = [...new Set([...IS_FEED_DISTRICTS, ...fromIssues])]
    .sort((a, b) => a.localeCompare(b));

  select.insertAdjacentHTML('beforeend',
    all.map(d => `<option value="${isEsc(d)}">${isEsc(d)}</option>`).join(''));
}

function newsDistrict(district) {
  if (!district || district === 'all') return IS_NEWS_DEFAULT_DISTRICT;
  return IS_DISTRICT_ALIAS[district] || district;
}

function loadDistrictNews(district, append = false) {
  const target = newsDistrict(district);
  const requestId = ++isNewsState.requestId;

  if (!append || isNewsState.district !== target) {
    isNewsState.district = target;
    isNewsState.items = [];
    isNewsState.total = 0;
  }
  if (append && isNewsState.loading) return;
  isNewsState.loading = true;

  const list = document.getElementById('is-district-news-list');
  const titleEl = document.getElementById('is-district-news-title');
  if (titleEl) titleEl.textContent = target === IS_NEWS_DEFAULT_DISTRICT ? '📰 Bihar — State News' : `📰 ${target} — District News`;
  if (!append && list) {
    list.innerHTML = '<div class="empty-state" style="padding:1rem;"><div class="spinner"></div><p class="empty-state-text">Loading district news…</p></div>';
  }

  const offset = append ? isNewsState.items.length : 0;
  
  /* Keyword filter from search input */
  const keywordEl = document.getElementById('is-keyword-search');
  const keyword = (keywordEl?.value || '').trim();
  
  console.log('[Keyword Search] Target:', target, 'Keyword:', keyword || '(none)', 'Offset:', offset);
  
  let urlParams = new URLSearchParams({
    district: encodeURIComponent(target.toLowerCase() === 'bihar' ? '' : target),
    limit: IS_NEWS_PAGE_SIZE,
    offset: offset
  });
  
  if (keyword && keyword.length >= 2) {
    urlParams.append('keyword', keyword);
  }
  
  console.log('[Keyword Search] Fetching:', `/api/district-news?${urlParams.toString()}`);
  
  fetch(`/api/district-news?${urlParams.toString()}`, { cache: 'no-store' })
    .then(res => res.json())
    .then(payload => {
      if (requestId !== isNewsState.requestId) return;
      if (payload.error) throw new Error(payload.error);
      console.log('[Keyword Search] Received payload:', payload);
      isNewsState.items = append ? [...isNewsState.items, ...(payload.items || [])] : (payload.items || []);
      isNewsState.total = payload.total ?? isNewsState.items.length;
      renderDistrictNews();
    })
    .catch(err => {
      if (requestId !== isNewsState.requestId) return;
      console.error('[Issues] district news fetch failed:', err);
      if (list && !isNewsState.items.length) {
        list.innerHTML = '<div class="empty-state" style="padding:1rem;"><p class="empty-state-text">District news unavailable right now.</p></div>';
      }
    })
    .finally(() => {
      if (requestId === isNewsState.requestId) isNewsState.loading = false;
    });
}

function renderDistrictNews() {
  const list = document.getElementById('is-district-news-list');
  const countEl = document.getElementById('is-district-news-count');
  if (!list) return;

  const { items, total, district } = isNewsState;
  if (countEl) {
    countEl.textContent = items.length ? `${items.length} / ${total}` : '';
    countEl.style.display = items.length ? 'inline-flex' : 'none';
  }

  if (!items.length) {
    list.innerHTML = `<div class="empty-state" style="padding:1rem;">
      <div class="empty-state-icon">📭</div>
      <p class="empty-state-text">No district news saved yet.</p>
      <p style="font-size:0.72rem; color:var(--text-muted); margin-top:0.3rem;">The daily GitHub Action (District News Daily) will populate this — or run Actions → Run workflow once.</p>
    </div>`;
    return;
  }

  const cards = items.map((item, i) => {
    const dateStr = item.published_at
      ? new Date(item.published_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
      : '';
    return `
      <div class="card card-shine" style="border-left:3px solid var(--blue); padding:0.7rem 0.95rem; animation:slideInUp 0.3s ease both; animation-delay:${Math.min(i * 0.03, 0.3)}s;">
        <div style="font-size:0.83rem; font-weight:600; color:var(--text-primary); line-height:1.42; margin-bottom:0.3rem;">
          <a href="${isEsc(item.url)}" target="_blank" rel="noopener noreferrer" style="color:inherit; text-decoration:none;"
             onmouseover="this.style.color='var(--blue)'" onmouseout="this.style.color='inherit'">${isEsc(item.title)}</a>
        </div>
        <div style="display:flex; align-items:center; gap:0.45rem; flex-wrap:wrap;">
          <span class="tag" style="font-size:0.62rem;">📍 ${isEsc(item.district)}</span>
          <span class="tag tag-blue" style="font-size:0.62rem;">📡 ${isEsc(item.source || 'News')}</span>
          ${dateStr ? `<span style="font-size:0.66rem; color:var(--text-muted);">🕐 ${isEsc(dateStr)}</span>` : ''}
          <a class="btn btn-ghost btn-sm" href="${isEsc(item.url)}" target="_blank" rel="noopener noreferrer"
             style="font-size:0.63rem; padding:0.12rem 0.4rem; margin-left:auto;">Read ↗</a>
        </div>
      </div>`;
  }).join('');

  const remaining = Math.max(total - items.length, 0);
  const moreBtn = remaining > 0 ? `
    <button class="btn btn-ghost" onclick="loadMoreDistrictNews('${isEsc(district)}')"
            style="width:100%; margin-top:0.5rem; padding:0.55rem 0.9rem; font-size:0.72rem; font-weight:700; letter-spacing:0.02em;">
      📰 Read ${Math.min(IS_NEWS_PAGE_SIZE, remaining)} More News ↓
      <span style="font-weight:500; color:var(--text-muted);">(${remaining} remaining)</span>
    </button>` : '';

  list.innerHTML = cards + moreBtn;
}

function loadMoreDistrictNews(district) {
  loadDistrictNews(newsDistrict(district), true);
}

function getPriorityConfig(p) {
  const map = {
    urgent: { color: 'var(--red)',   dim: 'var(--red-dim)',   label: '🔴 URGENT',  tagClass: 'tag-red'   },
    high:   { color: 'var(--amber)', dim: 'var(--amber-dim)', label: '🟠 HIGH',    tagClass: 'tag-amber' },
    medium: { color: 'var(--gold)',  dim: 'var(--gold-dim)',  label: '🟡 MEDIUM',  tagClass: 'tag-gold'  },
    low:    { color: 'var(--green)', dim: 'var(--green-dim)', label: '🟢 LOW',     tagClass: 'tag-green' }
  };
  return map[p] || map.low;
}

function getStatusConfig(s) {
  const map = {
    'open':        { color: 'var(--blue)',  tagClass: 'tag-blue',  label: 'Open'        },
    'in-progress': { color: 'var(--amber)', tagClass: 'tag-amber', label: 'In Progress' },
    'escalated':   { color: 'var(--red)',   tagClass: 'tag-red',   label: 'Escalated'   },
    'resolved':    { color: 'var(--green)', tagClass: 'tag-green', label: 'Resolved'    }
  };
  return map[s] || map['open'];
}

function renderIssuesList(data) {
  const el = document.getElementById('is-list');
  if (!el) return;

  if (!data.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">✅</div><p>No issues match your filter.</p></div>`;
    return;
  }

  el.innerHTML = data.map((issue, i) => {
    const pc = getPriorityConfig(issue.priority);
    const sc = getStatusConfig(issue.status);
    return `
      <div class="card card-shine" onclick="selectIssue(${issue.id})"
        style="cursor:pointer; border-left:3px solid ${pc.color}; animation:slideInUp 0.3s ease both; animation-delay:${i*0.06}s; transition:transform 0.15s, box-shadow 0.15s;"
        onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='var(--shadow-lg)'"
        onmouseout="this.style.transform=''; this.style.boxShadow=''">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:0.75rem;">
          <div style="flex:1; min-width:0;">
            <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.35rem; flex-wrap:wrap;">
              <span class="tag ${pc.tagClass}" style="font-size:0.62rem;">${pc.label}</span>
              <span class="tag ${sc.tagClass}" style="font-size:0.62rem;">${sc.label}</span>
              <span class="tag" style="font-size:0.62rem;">📂 ${issue.category}</span>
              <span class="tag" style="font-size:0.62rem;">📍 ${issue.district}</span>
            </div>
            <div style="font-size:0.9rem; font-weight:600; color:var(--text-primary); margin-bottom:0.25rem; line-height:1.35;">${issue.title}</div>
            <div style="font-size:0.78rem; color:var(--text-secondary); line-height:1.5;">${issue.description.substring(0, 100)}…</div>
            <div style="font-size:0.7rem; color:var(--text-muted); margin-top:0.35rem; display:flex; gap:0.75rem; flex-wrap:wrap;">
              <span>👤 ${issue.reportedBy}</span>
              <span>📅 ${issue.date}</span>
              ${issue.assignedTo ? `<span>✓ Assigned: ${issue.assignedTo}</span>` : '<span style="color:var(--red);">⚠ Unassigned</span>'}
            </div>
          </div>
          <div style="display:flex; flex-direction:column; gap:0.35rem; flex-shrink:0;">
            <button class="btn btn-ghost btn-sm" style="font-size:0.7rem; padding:0.2rem 0.5rem;" onclick="event.stopPropagation(); assignIssue(${issue.id})">✓ Assign</button>
            <button class="btn btn-sm" style="background:var(--red-dim); color:var(--red); border:1px solid rgba(230,57,70,0.3); font-size:0.7rem; padding:0.2rem 0.5rem;" onclick="event.stopPropagation(); escalateIssue(${issue.id})">↑ Escalate</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function selectIssue(id) {
  const issue = ISSUES_DATA.find(i => i.id === id);
  if (!issue) return;
  renderIssueDetail(issue);
  showIssueDistrictNews(issue);
}

/* The news panel follows the clicked issue's district; the filter bar stays untouched. */
function showIssueDistrictNews(issue) {
  if (!issue.district || issue.district === 'Multiple') return;
  loadDistrictNews(newsDistrict(issue.district));
}

function setupKeywordSearch() {
  const el = document.getElementById('is-keyword-search');
  if (!el) return;
  
  let timeoutId = null;
  el.addEventListener('input', () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      isNewsState.items = []; // reset items on new search
      loadDistrictNews(isNewsState.district || IS_NEWS_DEFAULT_DISTRICT);
    }, 300);
  });
  
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      isNewsState.items = [];
      loadDistrictNews(isNewsState.district || IS_NEWS_DEFAULT_DISTRICT);
    }
  });
}

function renderIssueDetail(issue) {
  const el = document.getElementById('is-detail');
  if (!el || !issue) return;
  const pc = getPriorityConfig(issue.priority);
  const sc = getStatusConfig(issue.status);
  el.innerHTML = `
    <div class="card" style="border-left:3px solid ${pc.color};">
      <div class="card-title" style="margin-bottom:0.75rem;">📋 Issue Detail</div>
      <div style="display:flex; gap:0.4rem; flex-wrap:wrap; margin-bottom:0.75rem;">
        <span class="tag ${pc.tagClass}" style="font-size:0.65rem;">${pc.label}</span>
        <span class="tag ${sc.tagClass}" style="font-size:0.65rem;">${sc.label}</span>
        <span class="tag" style="font-size:0.65rem;">${issue.category}</span>
      </div>
      <h4 style="font-size:0.95rem; font-weight:700; color:var(--text-primary); margin-bottom:0.5rem;">${issue.title}</h4>
      <p style="font-size:0.82rem; color:var(--text-secondary); line-height:1.6; margin-bottom:0.75rem;">${issue.description}</p>
      <div class="divider"></div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; font-size:0.78rem; margin-top:0.5rem;">
        <div><span style="color:var(--text-muted);">District:</span> <span style="color:var(--text-primary); font-weight:500;">${issue.district}</span></div>
        <div><span style="color:var(--text-muted);">Date:</span> <span style="color:var(--text-primary);">${issue.date}</span></div>
        <div><span style="color:var(--text-muted);">Reporter:</span> <span style="color:var(--text-primary);">${issue.reportedBy}</span></div>
        <div><span style="color:var(--text-muted);">Assigned:</span> <span style="color:${issue.assignedTo ? 'var(--green)' : 'var(--red)'};">${issue.assignedTo || 'Unassigned'}</span></div>
      </div>
      <div style="display:flex; gap:0.5rem; margin-top:1rem;">
        <button class="btn btn-primary btn-sm" onclick="assignIssue(${issue.id})">✓ Assign</button>
        <button class="btn btn-danger btn-sm" onclick="escalateIssue(${issue.id})">↑ Escalate</button>
        <button class="btn btn-ghost btn-sm" onclick="showToast('Resolved','Issue marked as resolved','success')">✅ Resolve</button>
      </div>
    </div>
  `;
}

function assignIssue(id) {
  showToast('Issue Assigned', 'Issue has been assigned to district coordinator', 'success');
}

function escalateIssue(id) {
  showToast('Escalated', 'Issue escalated to State Command Center', 'error');
}

function renderCategoryChart() {
  const canvas = document.getElementById('is-category-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (isCategoryChart) isCategoryChart.destroy();

  const cats = {};
  ISSUES_DATA.forEach(i => { cats[i.category] = (cats[i.category] || 0) + 1; });

  isCategoryChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: Object.keys(cats),
      datasets: [{
        data: Object.values(cats),
        backgroundColor: ['rgba(230,57,70,0.7)','rgba(255,159,67,0.7)','rgba(74,158,255,0.7)','rgba(38,222,129,0.7)','rgba(245,197,24,0.7)','rgba(168,85,247,0.7)','rgba(255,107,43,0.7)'],
        borderRadius: 4, borderWidth: 0
      }]
    },
    options: {
      responsive: true, indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#5a6a84', font: { size: 9 }, stepSize: 1 } },
        y: { grid: { display: false }, ticks: { color: '#a8b4cc', font: { size: 10 } } }
      }
    }
  });
}

function renderDistrictBreakdown() {
  const el = document.getElementById('is-district-breakdown');
  if (!el) return;
  const dists = {};
  ISSUES_DATA.forEach(i => { if (i.district !== 'Multiple') dists[i.district] = (dists[i.district] || 0) + 1; });
  el.innerHTML = Object.entries(dists).sort((a,b) => b[1]-a[1]).map(([d, c]) => `
    <div style="display:flex; align-items:center; justify-content:space-between; font-size:0.8rem; padding:0.25rem 0; border-bottom:1px solid var(--border-subtle);">
      <span style="color:var(--text-secondary);">📍 ${d}</span>
      <span style="color:var(--text-primary); font-weight:600;">${c}</span>
    </div>
  `).join('');
}

function updateIssueCounts(data) {
  const total = document.getElementById('is-total');
  const urgent = document.getElementById('is-urgent');
  const inprog = document.getElementById('is-inprogress');
  const open   = document.getElementById('is-open');
  if (total)  total.textContent  = data.length;
  if (urgent) urgent.textContent = data.filter(i => i.priority === 'urgent').length;
  if (inprog) inprog.textContent = data.filter(i => i.status === 'in-progress').length;
  if (open)   open.textContent   = data.filter(i => i.status === 'open').length;
}

function setupIssueFilters() {
  document.querySelectorAll('#is-priority-filter .filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#is-priority-filter .filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      isPriorityFilter = pill.dataset.priority;
      applyIssueFilters();
    });
  });

  document.querySelectorAll('#is-status-filter .filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#is-status-filter .filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      isStatusFilter = pill.dataset.status;
      applyIssueFilters();
    });
  });

  const distSelect = document.getElementById('is-district-select');
  if (distSelect) distSelect.addEventListener('change', e => { isDistrictFilter = e.target.value; applyIssueFilters(); });
}

function applyIssueFilters() {
  let data = ISSUES_DATA;
  if (isPriorityFilter !== 'all') data = data.filter(i => i.priority === isPriorityFilter);
  if (isStatusFilter   !== 'all') data = data.filter(i => i.status   === isStatusFilter);
  if (isDistrictFilter !== 'all') data = data.filter(i => i.district  === isDistrictFilter);
  renderIssuesList(data);
  updateIssueCounts(data);
  loadDistrictNews(isDistrictFilter);
}

window.selectIssue   = selectIssue;
window.assignIssue   = assignIssue;
window.escalateIssue = escalateIssue;
window.loadMoreDistrictNews = loadMoreDistrictNews;
