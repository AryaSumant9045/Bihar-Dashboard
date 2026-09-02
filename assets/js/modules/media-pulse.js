/* ============================================================
   MEDIA PULSE MODULE
   ============================================================ */

function initMediaPulse() {
  renderTrending();
  renderWeeklyChart();
  renderSentimentChart();
  renderPlatformChart();
  renderTVTable();
  renderLiveFeed();
  setupPlatformFilter();
}

function renderTrending() {
  const el = document.getElementById('mp-trending');
  if (!el) return;
  el.innerHTML = MEDIA_DATA.trending.map((t, i) => `
    <div style="display:flex; align-items:center; gap:0.4rem; padding:0.4rem 0.75rem; background:var(--glass-bg); border:1px solid var(--border-subtle); border-radius:var(--radius-full); cursor:pointer; transition:all 0.15s; animation:slideInUp 0.3s ease both; animation-delay:${i*0.05}s;"
      onmouseover="this.style.background='var(--glass-hover)'" onmouseout="this.style.background='var(--glass-bg)'"
      onclick="showToast('Trending','${t.tag} — ${t.volume.toLocaleString()} mentions','info')">
      <span style="font-size:0.8rem; font-weight:600; color:var(--text-primary);">${t.tag}</span>
      <span style="font-size:0.7rem; color:var(--text-muted);">${(t.volume / 1000000).toFixed(1)}M</span>
      <span class="tag ${t.sentiment === 'negative' ? 'tag-red' : t.sentiment === 'positive' ? 'tag-green' : 'tag-blue'}" style="font-size:0.6rem; padding:0.1rem 0.4rem;">${t.platform}</span>
      <span style="font-size:0.7rem; color:var(--red); font-weight:600;">${t.change}</span>
    </div>
  `).join('');
}

function renderWeeklyChart() {
  const canvas = document.getElementById('mp-weekly-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  const d = MEDIA_DATA.weeklyMentions;
  new Chart(canvas, {
    type: 'line',
    data: {
      labels: d.labels,
      datasets: [
        { label: 'BJP/NDA', data: d.bjp, borderColor: '#ff6b2b', backgroundColor: 'rgba(255,107,43,0.08)', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 3, pointBackgroundColor: '#ff6b2b' },
        { label: 'RJD/INDIA', data: d.rjd, borderColor: '#e63946', backgroundColor: 'rgba(230,57,70,0.08)', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 3, pointBackgroundColor: '#e63946' },
        { label: 'PK', data: d.pk, borderColor: '#ff9f43', backgroundColor: 'rgba(255,159,67,0.08)', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 3, pointBackgroundColor: '#ff9f43' }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top', labels: { color: '#a8b4cc', font: { size: 10 }, usePointStyle: true, boxWidth: 8 } },
        tooltip: { backgroundColor: '#0f1829', titleColor: '#e8edf8', bodyColor: '#a8b4cc', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1 }
      },
      scales: {
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#5a6a84', font: { size: 9 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'K' : v } },
        x: { grid: { display: false }, ticks: { color: '#a8b4cc', font: { size: 10 } } }
      }
    }
  });
}

function renderSentimentChart() {
  const canvas = document.getElementById('mp-sentiment-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  const s = MEDIA_DATA.sentiment;
  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Positive', 'Neutral', 'Negative'],
      datasets: [{ data: [s.positive, s.neutral, s.negative], backgroundColor: ['#26de81', '#4a9eff', '#e63946'], borderWidth: 0, hoverOffset: 8 }]
    },
    options: {
      responsive: true, cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#0f1829', titleColor: '#e8edf8', bodyColor: '#a8b4cc', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, callbacks: { label: ctx => `${ctx.label}: ${ctx.raw}%` } }
      }
    }
  });
  const legend = document.getElementById('mp-sentiment-legend');
  if (legend) {
    legend.innerHTML = [
      { label: 'Positive', val: s.positive, c: '#26de81' },
      { label: 'Neutral', val: s.neutral, c: '#4a9eff' },
      { label: 'Negative', val: s.negative, c: '#e63946' }
    ].map(i => `<div style="display:flex; align-items:center; gap:0.4rem; font-size:0.75rem;">
      <div style="width:10px; height:10px; border-radius:2px; background:${i.c};"></div>
      <span style="color:var(--text-muted);">${i.label}</span>
      <span style="color:${i.c}; font-weight:700;">${i.val}%</span>
    </div>`).join('');
  }
}

function renderPlatformChart() {
  const canvas = document.getElementById('mp-platform-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Twitter', 'Facebook', 'YouTube', 'TV', 'Print'],
      datasets: [{
        data: [3200, 1800, 980, 600, 220],
        backgroundColor: ['rgba(29,161,242,0.7)', 'rgba(74,106,255,0.7)', 'rgba(230,57,70,0.7)', 'rgba(255,159,67,0.7)', 'rgba(38,222,129,0.7)'],
        borderRadius: 4, borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#5a6a84', font: { size: 9 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'K' : v } },
        x: { grid: { display: false }, ticks: { color: '#a8b4cc', font: { size: 10 } } }
      }
    }
  });
}

function renderTVTable() {
  const tbody = document.getElementById('mp-tv-tbody');
  if (!tbody) return;
  tbody.innerHTML = MEDIA_DATA.tvCoverage.map(c => `
    <tr>
      <td style="font-weight:500; color:var(--text-primary);">${c.channel}</td>
      <td style="color:var(--gold); font-weight:600;">${c.hours}h</td>
      <td><span class="tag ${c.tone === 'positive' ? 'tag-green' : c.tone === 'negative' ? 'tag-red' : 'tag-blue'}" style="font-size:0.65rem;">${c.tone}</span></td>
    </tr>
  `).join('');
}

function renderLiveFeed() {
  const el = document.getElementById('mp-feed');
  if (!el) return;
  const fakePosts = [
    { handle: '@BiharVoice', platform: '🐦', content: '#Tejashwi4Bihar rally confirmed at Gandhi Maidan on Sep 15. Massive crowd expected. #BiharPolitics', time: '2m ago', likes: '2.4K' },
    { handle: '@PatnaNewsHub', platform: '🐦', content: 'Bihar CM Nitish Kumar inaugurates highway project in Muzaffarpur. "Bihar vikas ki raah par hai" — CM', time: '8m ago', likes: '1.1K' },
    { handle: '@BiharAlerts', platform: '📘', content: 'BREAKING: Flood alert issued for 8 North Bihar districts. NDRF teams deployed. #BiharFloods2024', time: '12m ago', likes: '4.8K' },
    { handle: '@JanSuraajOfficial', platform: '▶', content: 'Prashant Kishor: "Bihar ke log smart hain — Jan Suraaj ek nayi shuruaat hai" | Full speech on YouTube', time: '25m ago', likes: '6.2K' },
    { handle: '@BiharPoliticsNow', platform: '🐦', content: 'JDU denies rift with BJP over seat sharing. "Alliance is strong, 2025 mein NDA sarkar" — Lalan Singh', time: '34m ago', likes: '890' },
    { handle: '@RJDOfficial', platform: '🐦', content: '#NDA_Fail: 20 years of NDA, 0 government jobs. Bihar youth demands answers from CM Nitish Kumar! #Rozgar', time: '48m ago', likes: '3.7K' },
  ];
  el.innerHTML = fakePosts.map((p, i) => `
    <div style="padding:0.75rem; background:var(--glass-bg); border:1px solid var(--border-subtle); border-radius:var(--radius-md); animation:slideInUp 0.3s ease both; animation-delay:${i*0.07}s; cursor:pointer; transition:background 0.15s;" onmouseover="this.style.background='var(--glass-hover)'" onmouseout="this.style.background='var(--glass-bg)'">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.35rem;">
        <div style="display:flex; align-items:center; gap:0.4rem;">
          <span style="font-size:0.75rem; font-weight:600; color:var(--blue);">${p.handle}</span>
          <span style="font-size:0.75rem;">${p.platform}</span>
        </div>
        <span style="font-size:0.68rem; color:var(--text-muted);">${p.time}</span>
      </div>
      <div style="font-size:0.78rem; color:var(--text-secondary); line-height:1.5;">${p.content}</div>
      <div style="margin-top:0.35rem; font-size:0.68rem; color:var(--text-muted);">❤️ ${p.likes}</div>
    </div>
  `).join('');
}

function setupPlatformFilter() {
  document.querySelectorAll('#mp-platform-filter .filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#mp-platform-filter .filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      showToast('Filter', `Showing ${pill.dataset.platform === 'all' ? 'all platforms' : pill.dataset.platform} data`, 'info');
    });
  });
}
