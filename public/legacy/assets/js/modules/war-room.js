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
let wrYoutubeExpanded = {};
let wrActionState = {};
let wrGeminiRunning = false;
let wrGeminiStatusTimer = null;
let wrAnalysisByRawId = {};
let wrAnalysisByUrl = {};
let wrAnalysisByTitle = {};
let wrGeminiVisibleCount = 5;
let wrGeminiRenderItems = [];
let wrActionDetails = {};

const WR_ACTION_LABELS = { new: 'New', review: 'Review', assigned: 'Assigned', report: 'Report requested', monitor: 'Monitor', closed: 'Closed' };

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

function wrTitleKey(value) {
  return String(value || '').toLowerCase().replace(/https?:\/\/\S+/g, '').replace(/[^a-z0-9\u0900-\u097f]+/gi, ' ').trim().replace(/\s+/g, ' ');
}

function wrVisibleSummary(value, title) {
  const summary = String(value || '').trim();
  if (!summary || wrTitleKey(summary) === wrTitleKey(title)) return '';
  const firstSentence = summary.split(/(?<=[।!?])\s+/)[0].trim() || summary;
  return firstSentence.length > 120 ? `${firstSentence.slice(0, 117).trimEnd()}...` : firstSentence;
}

function wrSimilarNews(items) {
  const groups = [];
  items.forEach(item => {
    const key = wrTitleKey(item.title);
    const words = new Set(key.split(' ').filter(word => word.length > 2));
    let group = groups.find(candidate => {
      if (candidate.key === key) return true;
      const overlap = [...words].filter(word => candidate.words.has(word)).length;
      return words.size > 3 && candidate.words.size > 3 && overlap / Math.max(words.size, candidate.words.size) >= 0.75;
    });
    if (!group) {
      group = { item: { ...item }, key, words, sources: [] };
      groups.push(group);
    }
    const source = item.source || 'Unknown source';
    if (!group.sources.includes(source)) group.sources.push(source);
    if ((!group.item.summary || group.item.summary === group.item.title) && item.summary) group.item.summary = item.summary;
    if (!group.item.url && item.url) group.item.url = item.url;
  });
  return groups.map(group => ({ ...group.item, sourceCount: group.sources.length, sourceNames: group.sources }));
}

function wrNormalise(item) {
  const analysis = wrAnalysisByRawId[String(item.id)] || wrAnalysisByUrl[item.url] || wrAnalysisByTitle[wrTitleKey(item.title)];
  const summary = item.summary || analysis?.summary || null;
  return {
    id: item.id,
    title: item.title || 'Untitled update',
    summary: wrVisibleSummary(summary, item.title),
    body: wrVisibleSummary(summary, item.title),
    district: item.author || item.district || 'General',
    source: item.source || 'NewsData.io',
    created_at: item.created_at || item.time,
    url: item.url || item.link || '',
    category: wrCategory(item),
    level: wrLevel(item),
    tags: wrTags(item),
    sourceCount: item.sourceCount || 1,
    sourceNames: item.sourceNames || [item.source || 'Unknown source']
  };
}

function wrNormaliseAnalysis(item) {
  const raw = item.raw_items || {};
  return wrNormalise({
    id: item.id,
    title: raw.title || item.summary || 'Analyzed news item',
    summary: item.summary || raw.title,
    district: item.district,
    source: `Gemini AI · ${item.module || 'General'}`,
    created_at: item.created_at,
    url: raw.url || '',
    priority: item.priority,
    category: item.module || 'General'
  });
}

function initWarRoom() {
  setupWarRoomControls();
  setupAiSidebar();
  loadActionState();
  refreshGeminiStatus();
  loadGeminiResults();
  if (wrGeminiStatusTimer) clearInterval(wrGeminiStatusTimer);
  wrGeminiStatusTimer = setInterval(refreshGeminiStatus, 30000);
  connectWarRoom();
}

function setupAiSidebar() {
  const sidebar = document.getElementById('wr-ai-sidebar');
  if (!sidebar || sidebar.dataset.ready === 'true') return;
  ['wr-quick-actions', 'wr-news-sources', 'wr-livehindustan-sources'].forEach(id => {
    const card = document.getElementById(id);
    if (card) sidebar.appendChild(card);
  });
  sidebar.dataset.ready = 'true';
}

function setGeminiStatus(message, tone = 'muted') {
  const status = document.getElementById('wr-gemini-status');
  if (!status) return;
  status.textContent = message;
  status.style.color = tone === 'error' ? 'var(--red)' : tone === 'success' ? 'var(--green)' : 'var(--text-muted)';
}

function setGeminiResult(message, tone = 'default') {
  const result = document.getElementById('wr-gemini-result');
  if (!result) return;
  result.textContent = message;
  result.style.display = message ? 'inline-flex' : 'none';
  result.className = `tag${tone === 'success' ? ' tag-green' : tone === 'error' ? ' tag-red' : ''}`;
}

async function refreshGeminiStatus() {
  try {
    const response = await fetch('/api/analysis-status', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not read analysis queue');
    const pending = Number(result.pending || 0);
    const pendingLabel = document.getElementById('wr-gemini-pending');
    if (pendingLabel) pendingLabel.textContent = `Pending: ${pending}`;
    const last = result.last_cycle?.completed_at;
    const lastLabel = document.getElementById('wr-gemini-last');
    if (lastLabel) lastLabel.textContent = last ? `Last analyzed: ${wrTimeAgo(last)}` : 'Last analyzed: Awaiting first cycle';
    if (!wrGeminiRunning) setGeminiStatus(pending ? `${pending} items queued. Auto-analysis runs every 15 minutes.` : 'Queue clear. Auto-analysis is monitoring new items.', pending ? 'muted' : 'success');
    await loadGeminiResults(false);
  } catch (error) {
    setGeminiStatus(error.message, 'error');
  }
}

async function triggerGeminiAnalysis() {
  if (wrGeminiRunning) return;
  const button = document.getElementById('wr-gemini-trigger');
  wrGeminiRunning = true;
  if (button) {
    button.disabled = true;
    button.textContent = '⏳ Analyzing…';
  }
  setGeminiResult('', 'default');
  setGeminiStatus('Gemini is analyzing the next 10 news items. Please keep this page open.', 'muted');

  try {
    const response = await fetch('/api/analyze-news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 10 })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Gemini analysis failed');
    const message = result.processed
      ? `${result.processed} analyzed · ${result.alerts_created || 0} alerts created${result.errors ? ` · ${result.errors} errors` : ''}`
      : (result.message || 'No pending items');
    setGeminiResult(message, result.errors ? 'error' : 'success');
    setGeminiStatus('Batch complete. Queue status updated.', 'success');
    await loadGeminiResults();
    await refreshGeminiStatus();
  } catch (error) {
    setGeminiResult(error.message, 'error');
    setGeminiStatus('Analysis could not be completed.', 'error');
  } finally {
    wrGeminiRunning = false;
    if (button) {
      button.textContent = '▶ Run Analysis';
      button.disabled = false;
    }
    await refreshGeminiStatus();
  }
}

function loadActionState() {
  fetch('/api/action-centre', { cache: 'no-store' })
    .then(response => response.ok ? response.json() : Promise.reject(new Error('Action Centre unavailable')))
    .then(result => {
      wrActionState = {};
      (result.data || []).forEach(action => {
        wrActionState[String(action.item_id)] = action.status || 'new';
        wrActionDetails[String(action.item_id)] = action;
      });
      renderActionCentre();
      applyFilters();
    })
    .catch(error => console.warn('Action Centre load failed:', error.message));
}

function getAlertAction(id) {
  return wrActionState[String(id)] || 'new';
}

async function updateAlertAction(id, status) {
  wrActionState[String(id)] = status;
  renderActionCentre();
  renderTopAttention();
  applyFilters();
  const item = wrAllNews.find(news => String(news.id) === String(id));
  if (!item) return;
  try {
    const response = await fetch('/api/action-centre', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...wrActionDetails[String(id)], item_id: id, title: item.title, source: item.source, priority: item.level, status })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Action update failed');
    wrActionDetails[String(id)] = result.data;
  } catch (error) {
    setGeminiStatus(`Action Centre: ${error.message}`, 'error');
  }
}

function openActionDetails(id) {
  const item = wrAllNews.find(news => String(news.id) === String(id));
  if (!item) return;
  const action = wrActionDetails[String(id)] || {};
  const history = (action.history || []).slice(0, 8).map(entry => `<div style="padding:.45rem 0;border-top:1px solid var(--border-subtle);font-size:.7rem;color:var(--text-secondary);"><b>${wrEscape(entry.action)}</b> · ${wrEscape(entry.actor || 'War Room user')} · ${wrTimeAgo(entry.created_at)}<div style="color:var(--text-muted);margin-top:.2rem;">${wrEscape(JSON.stringify(entry.new_value || {}))}</div></div>`).join('') || '<div style="font-size:.72rem;color:var(--text-muted);">No history yet.</div>';
  openModal(`<form onsubmit="saveActionDetails(event, '${wrEscape(id)}')" style="display:flex;flex-direction:column;gap:.75rem;">
    <label>Assignee<input id="wr-assignee" class="input" value="${wrEscape(action.assignee || '')}" placeholder="Officer or team name"></label>
    <label>Deadline<input id="wr-deadline" class="input" type="datetime-local" value="${action.deadline ? new Date(action.deadline).toISOString().slice(0, 16) : ''}"></label>
    <label>Comment<textarea id="wr-comment" class="input" rows="4" placeholder="Follow-up, context or instruction">${wrEscape(action.comment || '')}</textarea></label>
    <label>Approval<select id="wr-approval" class="select-dropdown"><option value="pending"${action.approval_status === 'pending' || !action.approval_status ? ' selected' : ''}>Pending approval</option><option value="approved"${action.approval_status === 'approved' ? ' selected' : ''}>Approved</option><option value="rejected"${action.approval_status === 'rejected' ? ' selected' : ''}>Rejected</option></select></label>
    <button class="btn btn-primary" type="submit">Save Action</button>
    <div><div class="card-title" style="margin:.25rem 0 .4rem;">Audit history</div>${history}</div>
  </form>`, `Action Centre · ${item.title}`);
}

async function saveActionDetails(event, id) {
  event.preventDefault();
  const item = wrAllNews.find(news => String(news.id) === String(id));
  const existing = wrActionDetails[String(id)] || {};
  try {
    const response = await fetch('/api/action-centre', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...existing, item_id: id, title: item.title, source: item.source, priority: item.level, status: getAlertAction(id), assignee: document.getElementById('wr-assignee').value, deadline: document.getElementById('wr-deadline').value || null, comment: document.getElementById('wr-comment').value, approval_status: document.getElementById('wr-approval').value, actor: 'War Room user' })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save action');
    wrActionDetails[String(id)] = result.data;
    closeModal();
    renderActionCentre();
  } catch (error) { setGeminiStatus(`Action Centre: ${error.message}`, 'error'); }
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
    const endpoints = ['/api/live-news', 'http://localhost:8000/api/live-news'];
    let response;
    let lastError;
    for (const endpoint of endpoints) {
      try {
        const candidate = await fetch(endpoint);
        if (candidate.ok) { response = candidate; break; }
        lastError = new Error(`Live news returned ${candidate.status}`);
      } catch (error) {
        lastError = error;
      }
    }
    if (!response) throw lastError || new Error('Live news backend is unavailable.');
    const result = await response.json();
    if (result.status !== 'success') throw new Error('Live news backend returned an error.');
    wrAllNews = (result.data || []).map(wrNormalise);
    wrDisplayedNews = wrAllNews;
    renderTicker();
    renderTopAttention();
    renderActionCentre();
    applyFilters();
    renderSources();
    renderThreatGauge();
    renderCategoryChart();
    setupSearch();
    await loadGeminiResults(false);
  } catch (error) {
    renderWarRoomError(error.message);
  }
}

async function loadGeminiResults(showLoading = true) {
  const grid = document.getElementById('wr-ai-results-grid');
  const summary = document.getElementById('wr-ai-priority-summary');
  const total = document.getElementById('wr-ai-result-count');
  if (!grid || !summary || !total) return;
  if (showLoading) grid.innerHTML = '<div class="empty-state" style="padding:1rem;"><div class="spinner"></div><p class="empty-state-text">Loading analysed intelligence…</p></div>';
  try {
    const response = await fetch('/api/analyzed-items?limit=200', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load analyzed news');
    const items = result.data || [];
    if (!items.length) {
      total.textContent = '0 analysed';
      grid.innerHTML = '<div class="empty-state" style="padding:1rem;"><p class="empty-state-text">No AI summaries generated yet. The next automatic cycle will add them.</p></div>';
      return;
    }
    wrAnalysisByRawId = Object.fromEntries(items.filter(item => item.raw_item_id).map(item => [String(item.raw_item_id), item]));
    wrAnalysisByUrl = Object.fromEntries(items.filter(item => item.raw_items?.url).map(item => [item.raw_items.url, item]));
    wrAnalysisByTitle = Object.fromEntries(items.filter(item => item.raw_items?.title).map(item => [wrTitleKey(item.raw_items.title), item]));
    wrAllNews = wrAllNews.map(item => wrNormalise(item));
    wrDisplayedNews = wrDisplayedNews.map(item => wrNormalise(item));
    if (wrDisplayedNews.length) applyFilters();
    renderTopAttention();
    const counts = { Critical: 0, Developing: 0, Watch: 0 };
    items.forEach(item => { if (counts[item.priority] !== undefined) counts[item.priority]++; });
    total.textContent = `${items.length} analysed`;
    summary.innerHTML = [['Critical', '🔴', 'var(--red)'], ['Developing', '🟠', 'var(--amber)'], ['Watch', '🟡', 'var(--gold)']]
      .map(([priority, icon, color]) => `<button type="button" class="stat-card" style="text-align:left;cursor:pointer;border-color:${color}55;"><div class="stat-label">${icon} ${priority}</div><div class="stat-value" style="color:${color};font-size:1.45rem;">${counts[priority]}</div><div class="stat-change">AI analysed news</div></button>`).join('');
    window.wrGeminiItems = items;
    wrGeminiVisibleCount = 5;
    summary.querySelectorAll('button').forEach((button, index) => button.onclick = () => filterGeminiResults(['Critical', 'Developing', 'Watch'][index]));
    renderGeminiResults(items);
  } catch (error) {
    total.textContent = 'Load failed';
    grid.innerHTML = `<div class="empty-state" style="padding:1rem;"><p class="empty-state-text">${wrEscape(error.message)}</p></div>`;
  }
}

function renderGeminiResults(items) {
  const grid = document.getElementById('wr-ai-results-grid');
  if (!grid) return;
  if (!items.length) {
    grid.innerHTML = '<div class="empty-state" style="padding:1rem;"><p class="empty-state-text">No analysed database news available yet.</p></div>';
    return;
  }
  wrGeminiRenderItems = items;
  const colors = { Critical: 'var(--red)', Developing: 'var(--amber)', Watch: 'var(--gold)', Routine: 'var(--green)' };
  const visibleItems = items.slice(0, wrGeminiVisibleCount);
  grid.innerHTML = visibleItems.map(item => {
    const color = colors[item.priority] || 'var(--text-muted)';
    const raw = item.raw_items || {};
    const summary = wrVisibleSummary(item.summary, raw.title);
    return `<article class="card" style="padding:.85rem;border-left:4px solid ${color};"><div style="display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start;"><div style="min-width:0;"><span class="tag" style="color:${color};border-color:${color}55;">${wrEscape(item.priority || 'Watch')}</span><span class="tag" style="margin-left:.35rem;">${wrEscape(item.module || 'General')}</span>${item.summary_needs_review ? '<span class="tag tag-red" style="margin-left:.35rem;">Review summary</span>' : ''}<div style="font-size:.86rem;font-weight:700;line-height:1.4;margin-top:.5rem;">${wrEscape(raw.title || 'Untitled')}</div>${summary ? `<div style="font-size:.68rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);margin-top:.55rem;">Executive Summary</div><div style="font-size:.8rem;color:var(--text-primary);line-height:1.5;margin-top:.15rem;">${wrEscape(summary)}</div>` : ''}<div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-top:.55rem;"><span class="tag">Reason: ${wrEscape(item.priority_reason || 'Unclear from source')}</span><span class="tag">Reliability: ${wrEscape(item.source_reliability || 'Needs Verification')}</span><span class="tag">Reach: ${wrEscape(item.public_reach_indicator || 'Not mentioned')}</span>${item.factual_context_needed ? '<span class="tag tag-red">Context check needed</span>' : ''}</div></div>${raw.url ? `<a class="btn btn-ghost btn-sm" href="${wrEscape(raw.url)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ''}</div><div style="font-size:.68rem;color:var(--text-muted);margin-top:.5rem;">📍 ${wrEscape(item.district || 'General')} · ${wrEscape(item.who || 'Unknown')}</div></article>`;
  }).join('');
  if (items.length > visibleItems.length) {
    grid.insertAdjacentHTML('beforeend', `<button type="button" class="btn btn-ghost" style="align-self:center;margin-top:.25rem;" onclick="showMoreGeminiResults()">Read 10 more (${items.length - visibleItems.length} remaining)</button>`);
  }
}

function showMoreGeminiResults() {
  wrGeminiVisibleCount += 10;
  renderGeminiResults(wrGeminiRenderItems);
}

function filterGeminiResults(priority) {
  renderGeminiResults((window.wrGeminiItems || []).filter(item => item.priority === priority));
}

function renderActionCentre() {
  const summary = document.getElementById('wr-action-summary');
  const count = document.getElementById('wr-action-summary-count');
  if (!summary || !count) return;
  const openItems = wrAllNews.filter(item => getAlertAction(item.id) !== 'closed');
  count.textContent = `${openItems.length} open`;
  if (!openItems.length) { summary.textContent = 'No open actions.'; return; }
  const grouped = openItems.reduce((result, item) => {
    const status = getAlertAction(item.id);
    result[status] = (result[status] || 0) + 1;
    return result;
  }, {});
  summary.innerHTML = Object.entries(grouped).map(([status, total]) => `<span class="tag ${status === 'review' || status === 'report' ? 'tag-red' : 'tag-blue'}">${wrEscape(WR_ACTION_LABELS[status])}: ${total}</span>`).join('');
}

function renderTopAttention() {
  const list = document.getElementById('wr-top-attention-list');
  if (!list) return;
  const order = { critical: 0, developing: 1, watch: 2, routine: 3 };
  const news = wrSimilarNews(wrAllNews.filter(item => !item.source.toLowerCase().includes('youtube')));
  const candidates = (news.length ? news : wrAllNews).slice().sort((a, b) => {
    const levelDifference = order[a.level] - order[b.level];
    if (levelDifference) return levelDifference;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  }).slice(0, 3);
  if (!candidates.length) {
    list.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:1rem;"><p class="empty-state-text">No priority developments available.</p></div>';
    return;
  }
  list.innerHTML = candidates.map((item, index) => {
    const level = WR_LEVEL_CONFIG[item.level];
    const summary = wrVisibleSummary(item.summary, item.title);
    return `<article style="padding:.85rem;border:1px solid ${level.color}44;border-left:3px solid ${level.color};border-radius:var(--radius-md);background:var(--glass-bg);animation:slideInUp .3s ease both;animation-delay:${index * .05}s;">
      <div style="display:flex;justify-content:space-between;gap:.5rem;align-items:flex-start;"><span style="font-size:.68rem;font-weight:800;color:${level.color};">${index + 1}. ${level.label}</span><span style="font-size:.65rem;color:var(--text-muted);">${wrTimeAgo(item.created_at)}</span></div>
      <div style="font-size:.82rem;font-weight:700;line-height:1.35;margin-top:.55rem;">${wrEscape(item.title)}</div>
      ${summary ? `<div style="font-size:.68rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);margin-top:.6rem;">Executive Summary</div><div style="font-size:.78rem;color:var(--text-primary);line-height:1.5;margin-top:.18rem;">${wrEscape(summary)}</div>` : ''}
      <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-top:.55rem;"><span class="tag">📍 ${wrEscape(item.district)}</span><span class="tag">📡 ${wrEscape(item.source)}</span>${item.sourceCount > 1 ? `<span class="tag tag-blue">${item.sourceCount} sources reported this</span>` : ''}</div>
      <div style="display:flex;gap:.4rem;margin-top:.7rem;align-items:center;">${item.url ? `<a class="btn btn-ghost btn-sm" href="${wrEscape(item.url)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ''}<button class="btn btn-ghost btn-sm" style="margin-left:auto;" onclick="openAlertDetail('${wrEscape(item.id)}')">Details</button></div>
    </article>`;
  }).join('');
}

async function loadAllWarRoomNews() {
  return connectWarRoom();
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
  const { data, error } = await wrClient.from('NewsDashboard').select('*').ilike('author', `%${wrCurrentDistrict}%`).order('created_at', { ascending: false });
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

function toggleYoutubeExpansion(source) {
  wrYoutubeExpanded[source] = !wrYoutubeExpanded[source];
  applyFilters();
}

function renderYoutubeChannel(videos, channelIndex) {
  const source = videos[0].source;
  const visibleVideos = videos.slice(0, wrYoutubeExpanded[source] ? 10 : 3);
  const moreButton = videos.length > 3 ? `<button class="btn btn-ghost btn-sm" style="grid-column:1/-1;justify-self:center;" onclick="toggleYoutubeExpansion('${wrEscape(source)}')">${wrYoutubeExpanded[source] ? 'Show less' : `See more (${Math.min(videos.length, 10) - 3} more)`}</button>` : '';
  return `<section style="width:100%;padding:1rem;margin-bottom:1rem;border:1px solid var(--border-subtle);border-radius:var(--radius-lg);background:var(--glass-bg);"><h3 style="margin:0 0 .85rem;font-size:.9rem;color:var(--text-primary);">▶️ ${wrEscape(source.replace('YouTube: ', ''))}</h3><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;">${visibleVideos.map((item, index) => { const level = WR_LEVEL_CONFIG[item.level]; return `<article class="card card-shine" style="border-left:4px solid ${level.color};animation:slideInUp .3s ease both;animation-delay:${(channelIndex * 3 + index) * .04}s;"><div style="display:flex;flex-direction:column;gap:.75rem;height:100%;"><div style="font-size:.9rem;font-weight:700;line-height:1.35;">${wrEscape(item.title)}</div><div style="font-size:.75rem;color:var(--text-secondary);line-height:1.4;">${wrEscape(item.body).slice(0, 120)}${item.body.length > 120 ? '…' : ''}</div><div style="display:flex;gap:.4rem;align-items:center;margin-top:auto;"><span style="font-size:.68rem;color:var(--text-muted);">🕐 ${wrTimeAgo(item.created_at)}</span>${item.url ? `<a class="btn btn-ghost btn-sm" style="margin-left:auto;" href="${wrEscape(item.url)}" target="_blank" rel="noopener noreferrer">▶ Watch</a>` : ''}<button class="btn btn-ghost btn-sm" onclick="openAlertDetail('${wrEscape(item.id)}')">Details</button></div></div></article>`; }).join('')}${moreButton}</div></section>`;
}

function renderAlerts(data) {
  const grid = document.getElementById('wr-alerts-grid');
  const ytGrid = document.getElementById('wr-yt-grid');
  if (!grid) return;
  const newsData = wrSimilarNews(data.filter(item => !item.source.toLowerCase().includes('youtube')));
  const ytData = data.filter(item => item.source.toLowerCase().includes('youtube'));
  if (!newsData.length) { grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><h3>No News Alerts</h3><p class="empty-state-text">No live news matches these filters.</p></div>'; }
  else {
    const order = { critical: 0, developing: 1, watch: 2, routine: 3 };
    const sortedNews = [...newsData].sort((a, b) => order[a.level] - order[b.level]);
    const visibleNews = wrNewsExpanded ? sortedNews : sortedNews.slice(0, 5);
    grid.innerHTML = visibleNews.map((item, index) => {
      const level = WR_LEVEL_CONFIG[item.level];
      const action = getAlertAction(item.id);
      return `<article class="card card-shine" style="border-left:4px solid ${level.color}; animation:slideInUp .3s ease both; animation-delay:${index * .04}s;">
      <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start;"><div style="min-width:0;flex:1;">
        <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.45rem;"><span style="padding:.2rem .55rem;background:${level.dim};border:1px solid ${level.color}44;border-radius:999px;color:${level.color};font-size:.65rem;font-weight:700;">${level.label}</span><span class="tag tag-blue">${wrEscape(item.category)}</span><span class="tag">📍 ${wrEscape(item.district)}</span>${item.sourceCount > 1 ? `<span class="tag tag-blue">${item.sourceCount} sources reported this</span>` : ''}</div>
        <div style="font-size:.9rem;font-weight:700;line-height:1.35;">${wrEscape(item.title)}</div>
        <div style="font-size:.64rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted);margin-top:.55rem;">Executive Summary</div><div style="font-size:.78rem;color:var(--text-secondary);line-height:1.55;margin-top:.15rem;max-width:65ch;">${wrEscape(wrVisibleSummary(item.summary || item.body, item.title))}</div>
        <div style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;margin-top:.55rem;">${item.tags.map(tag => `<span class="tag">${wrEscape(tag)}</span>`).join('')}<span style="margin-left:auto;font-size:.68rem;color:var(--text-muted);">🕐 ${wrTimeAgo(item.created_at)}</span></div>
      </div><div style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;justify-content:flex-end;">${item.url ? `<a class="btn btn-ghost btn-sm" href="${wrEscape(item.url)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ''}<select class="select-dropdown" style="max-width:9rem;font-size:.7rem;" aria-label="Action status" onchange="updateAlertAction('${wrEscape(item.id)}', this.value)">${Object.entries(WR_ACTION_LABELS).map(([value, label]) => `<option value="${value}"${action === value ? ' selected' : ''}>${label}</option>`).join('')}</select><button class="btn btn-ghost btn-sm" onclick="openActionDetails('${wrEscape(item.id)}')">Action details</button><button class="btn btn-ghost btn-sm" onclick="openAlertDetail('${wrEscape(item.id)}')">Details</button></div></div></article>`;
    }).join('') + (sortedNews.length > 5 ? `<button class="btn btn-ghost" style="align-self:center;margin-top:.25rem;" onclick="toggleNewsExpansion()">${wrNewsExpanded ? 'Show less' : `Read more (${sortedNews.length - 5} more)`}</button>` : '');
  }
  if (ytGrid) {
    if (!ytData.length) {
      ytGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><p class="empty-state-text">No YouTube videos available.</p></div>';
    } else {
      const channels = [...new Map(ytData.map(item => [item.source, ytData.filter(video => video.source === item.source)])).values()];
      ytGrid.innerHTML = channels.map(renderYoutubeChannel).join('');
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
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;padding:.35rem 0;"><span style="font-size:.8rem;color:var(--text-secondary);">📡 NewsData.io feed</span><span style="font-size:.7rem;color:var(--green);">● Connected</span></div><div style="font-size:.7rem;color:var(--text-muted);">Supabase Realtime pushes new qualifying records instantly.</div>`;
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
    const query = `?source=${encodeURIComponent(source)}`;
    let response;
    let lastError;
    for (const endpoint of [`/api/rss-news${query}`, `http://localhost:8000/api/rss-news${query}`]) {
      try {
        const candidate = await fetch(endpoint);
        if (candidate.ok) { response = candidate; break; }
        lastError = new Error(`RSS feed returned ${candidate.status}`);
      } catch (error) {
        lastError = error;
      }
    }
    if (!response) throw lastError || new Error('RSS feed is unavailable');
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
  const list = document.getElementById('wr-top-attention-list');
  if (list) list.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:1rem;"><p class="empty-state-text">${wrEscape(message)}</p></div>`;
  const ytGrid = document.getElementById('wr-yt-grid');
  if (ytGrid) ytGrid.innerHTML = '<div class="empty-state"><p class="empty-state-text">YouTube monitoring is temporarily unavailable.</p></div>';
}

window.openAlertDetail = openAlertDetail;
window.filterByLevel = filterByLevel;
window.filterByCategory = filterByCategory;
window.filterByDistrict = filterByDistrict;
window.toggleNewsExpansion = toggleNewsExpansion;
window.loadWarRoomRss = loadWarRoomRss;
window.toggleWarRoomRssSource = toggleWarRoomRssSource;
window.toggleWarRoomRss = toggleWarRoomRss;
window.toggleYoutubeExpansion = toggleYoutubeExpansion;
window.updateAlertAction = updateAlertAction;
window.triggerGeminiAnalysis = triggerGeminiAnalysis;
window.openActionDetails = openActionDetails;
window.saveActionDetails = saveActionDetails;
