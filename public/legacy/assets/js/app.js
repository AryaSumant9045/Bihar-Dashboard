/* ============================================================
   BIHAR COMMAND CENTER — App Router & Core
   app.js: SPA routing, sidebar, header, toast, modal
   ============================================================ */

'use strict';

// ── State ─────────────────────────────────────────────────────
const AppState = {
  currentPage: 'home',
  sidebarCollapsed: false,
  alertCount: 5,
  role: sessionStorage.getItem('bcc_role') || 'president'
};

// ── Nav Config ────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'home',               label: 'President Home',     icon: '🏠', badge: 0,  section: 'Command' },
  { id: 'war-room',           label: 'War Room',           icon: '🚨', badge: 3,  section: 'Command' },
  { id: 'political-map',      label: 'Bihar Map',          icon: '🗺',  badge: 0,  section: 'Intelligence' },
  { id: 'leadership',         label: 'Leadership',         icon: '👥', badge: 0,  section: 'Intelligence' },
  { id: 'opposition',         label: 'Opposition',         icon: '🔍', badge: 2,  section: 'Intelligence' },
  { id: 'pk-tracker',         label: 'PK Tracker',         icon: '🎯', badge: 1,  section: 'Intelligence' },
  { id: 'media-pulse',        label: 'Media & Social',     icon: '📱', badge: 0,  section: 'Analytics' },
  { id: 'speech-intelligence',label: 'Speech Intel',       icon: '🎙',  badge: 0,  section: 'Analytics' },
  { id: 'issues',             label: 'Issues',             icon: '📋', badge: 2,  section: 'Analytics' },
];

// ── Module Loaders ────────────────────────────────────────────
const MODULE_LOADERS = {
  'home':                () => typeof initHome === 'function'              && initHome(),
  'war-room':            () => typeof initWarRoom === 'function'           && initWarRoom(),
  'political-map':       () => typeof initPoliticalMap === 'function'      && initPoliticalMap(),
  'leadership':          () => typeof initLeadership === 'function'        && initLeadership(),
  'opposition':          () => typeof initOpposition === 'function'        && initOpposition(),
  'pk-tracker':          () => typeof initPKTracker === 'function'         && initPKTracker(),
  'media-pulse':         () => typeof initMediaPulse === 'function'        && initMediaPulse(),
  'speech-intelligence': () => typeof initSpeechIntelligence === 'function'&& initSpeechIntelligence(),
  'issues':              () => typeof initIssues === 'function'            && initIssues(),
};

// ── DOM References ────────────────────────────────────────────
let $sidebar, $sidebarToggle, $pageContent, $headerTitle, $clock;

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  $sidebar       = document.getElementById('sidebar');
  $sidebarToggle = document.getElementById('sidebar-toggle');
  $pageContent   = document.getElementById('page-content');
  $headerTitle   = document.getElementById('header-title');
  $clock         = document.getElementById('live-clock');

  buildSidebar();
  startClock();
  setupSidebarToggle();
  updateRoleBadge();

  // Route from hash or default
  const hash = location.hash.replace('#/', '') || 'home';
  navigateTo(hash);

  window.addEventListener('hashchange', () => {
    const page = location.hash.replace('#/', '') || 'home';
    navigateTo(page);
  });
});

// ── Sidebar Builder ───────────────────────────────────────────
function buildSidebar() {
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;

  const sections = [...new Set(NAV_ITEMS.map(n => n.section))];
  nav.innerHTML = sections.map(section => `
    <span class="nav-section-label">${section}</span>
    ${NAV_ITEMS.filter(n => n.section === section).map(item => `
      <a class="nav-item" id="nav-${item.id}" href="#/${item.id}" onclick="return false;" data-page="${item.id}">
        <span class="nav-icon">${item.icon}</span>
        <span class="nav-label">${item.label}</span>
        ${item.badge > 0 ? `<span class="nav-badge">${item.badge}</span>` : ''}
      </a>
    `).join('')}
  `).join('');

  nav.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => {
      const page = el.dataset.page;
      location.hash = `#/${page}`;
    });
  });
}

// ── Role Badge ────────────────────────────────────────────────
function updateRoleBadge() {
  const roleEl = document.getElementById('user-role-display');
  const roleNames = { president:'President View', warroom:'War Room', district:'District', comms:'Comms Team', readonly:'Read-Only', it:'IT Cell' };
  if (roleEl) roleEl.textContent = roleNames[AppState.role] || 'President View';
  const nameEl = document.getElementById('user-name-display');
  if (nameEl) {
    const names = { president:'President', warroom:'Admin', district:'District Officer', comms:'Comms Officer', readonly:'Leader', it:'IT Officer' };
    nameEl.textContent = names[AppState.role] || 'President';
  }
}

// ── Sidebar Toggle ────────────────────────────────────────────
function setupSidebarToggle() {
  if (!$sidebarToggle) return;
  $sidebarToggle.addEventListener('click', () => {
    AppState.sidebarCollapsed = !AppState.sidebarCollapsed;
    $sidebar.classList.toggle('collapsed', AppState.sidebarCollapsed);
  });
}

// ── Router ────────────────────────────────────────────────────
async function navigateTo(pageId) {
  const validPages = NAV_ITEMS.map(n => n.id);
  if (!validPages.includes(pageId)) pageId = 'home';

  AppState.currentPage = pageId;

  // Update active nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === pageId);
  });

  // Update header title
  const navItem = NAV_ITEMS.find(n => n.id === pageId);
  if ($headerTitle && navItem) {
    $headerTitle.textContent = `${navItem.icon} ${navItem.label}`;
  }

  // Show loading
  if ($pageContent) {
    $pageContent.style.opacity = '0';
  }

  // Load page HTML
  try {
    const res = await fetch(`pages/${pageId}.html`);
    if (!res.ok) throw new Error('Page not found');
    const html = await res.text();
    if ($pageContent) {
      $pageContent.innerHTML = html;
      $pageContent.style.opacity = '1';
      $pageContent.style.transition = 'opacity 0.25s ease';
      $pageContent.classList.add('page-enter');
      setTimeout(() => $pageContent.classList.remove('page-enter'), 400);
    }

    // Run module init
    if (MODULE_LOADERS[pageId]) {
      setTimeout(() => MODULE_LOADERS[pageId](), 60);
    }
  } catch (e) {
    if ($pageContent) {
      $pageContent.style.opacity = '1';
      $pageContent.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⚙️</div>
          <h3>Module Loading…</h3>
          <p class="empty-state-text">This page is being built. Check back soon.</p>
        </div>
      `;
    }
  }
}

// ── Clock ─────────────────────────────────────────────────────
function startClock() {
  const update = () => {
    if (!$clock) return;
    const now = new Date();
    const opts = { timeZone:'Asia/Kolkata', hour12:false,
      year:'numeric', month:'short', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit' };
    $clock.textContent = now.toLocaleString('en-IN', opts) + ' IST';
  };
  update();
  setInterval(update, 1000);
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(title, msg = '', type = 'info') {
  const icons = { info:'ℹ️', success:'✅', warning:'⚠️', error:'🔴' };
  const colors = { info:'var(--blue)', success:'var(--green)', warning:'var(--amber)', error:'var(--red)' };
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.borderLeft = `3px solid ${colors[type] || 'var(--blue)'}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
    </div>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.85rem;padding:0 0 0 0.5rem;">✕</button>
  `;
  container.appendChild(toast);
  setTimeout(() => { if (toast.parentElement) toast.remove(); }, 4000);
}

// ── Modal ─────────────────────────────────────────────────────
function openModal(contentHTML, title = '') {
  let overlay = document.getElementById('global-modal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'global-modal';
    overlay.innerHTML = `<div class="modal">
      <div class="modal-header">
        <h3 class="modal-title"></h3>
        <button class="btn btn-ghost btn-icon btn-sm" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body"></div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  }
  overlay.querySelector('.modal-title').textContent = title;
  overlay.querySelector('.modal-body').innerHTML = contentHTML;
  overlay.classList.add('open');
}

function closeModal() {
  const overlay = document.getElementById('global-modal');
  if (overlay) overlay.classList.remove('open');
}

// ── Expose globals ────────────────────────────────────────────
window.navigateTo  = navigateTo;
window.showToast   = showToast;
window.openModal   = openModal;
window.closeModal  = closeModal;
window.AppState    = AppState;
