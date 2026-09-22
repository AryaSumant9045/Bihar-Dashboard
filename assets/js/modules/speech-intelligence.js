/* ============================================================
   SPEECH INTELLIGENCE MODULE — Full Briefing Engine + Library
   ============================================================ */

let siActiveId = 1;
let siShowingLibrary = false;

function initSpeechIntelligence() {
  siLoadPastBriefs();
  renderRecentCards();
  renderSpeechList(SPEECHES_DATA);
  renderSpeechDetail(SPEECHES_DATA[0]);
  setupSpeechSearch();
}

/* ── View Toggle ──────────────────────────────────────────── */
function toggleSIView() {
  siShowingLibrary = !siShowingLibrary;
  const builder = document.getElementById('si-builder-view');
  const library = document.getElementById('si-library-view');
  const btn     = document.getElementById('si-view-toggle');
  if (!builder || !library) return;
  if (siShowingLibrary) {
    builder.style.display = 'none';
    library.style.display = 'block';
    if (btn) btn.textContent = '⚡ Brief Builder';
    renderSpeechList(SPEECHES_DATA);
    renderSpeechDetail(SPEECHES_DATA[0]);
  } else {
    builder.style.display = 'block';
    library.style.display = 'none';
    if (btn) btn.textContent = '📚 Past Speeches';
  }
}

/* ── Brief Generator ──────────────────────────────────────── */
function siToggleCustomEvent() {
  const sel = document.getElementById('si-event-sel');
  const custom = document.getElementById('si-event-custom');
  if (!sel || !custom) return;
  custom.style.display = sel.value === '__custom__' ? 'block' : 'none';
}

async function generateSpeechBrief() {
  const district = document.getElementById('si-district-sel')?.value;
  const eventSel = document.getElementById('si-event-sel')?.value;
  const eventCustom = document.getElementById('si-event-custom')?.value?.trim();
  const event = eventSel === '__custom__' ? eventCustom : eventSel;
  const audience = document.getElementById('si-audience-sel')?.value;
  const topic = document.getElementById('si-topic-input')?.value?.trim();

  if (!district || !event || !audience || !topic) {
    showToast('Incomplete', 'District, Event, Audience aur Topic — chaaro bharna zaroori hai', 'warning');
    return;
  }

  const btn = document.getElementById('si-generate-btn');
  const out = document.getElementById('si-brief-output');
  if (btn) { btn.textContent = '⏳ Briefing taiyar ho rahi hai…'; btn.disabled = true; }
  if (out) {
    out.style.display = 'block';
    out.innerHTML = '<div class="card" style="padding:1.5rem;"><div class="empty-state"><div class="spinner"></div><p class="empty-state-text" style="margin-top:0.5rem;">🎙 ' + district + ' के लिए briefing तैयार हो रही है…<br><span style="font-size:.72rem;color:var(--text-muted);">District news + AI summary + opposition data से बन रही है</span></p></div></div>';
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  try {
    const res = await fetch('/api/speech-brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ district, event_type: event, audience, topic }),
    });
    const payload = await res.json();
    if (payload.error) throw new Error(payload.error);
    if (payload.status !== 'success') {
      renderBriefError(district, event, audience, topic, payload);
      return;
    }
    renderGeneratedBrief(district, event, audience, topic, payload);
    siLoadPastBriefs(true);
  } catch (error) {
    if (out) {
      out.innerHTML = '<div class="card" style="padding:1rem;"><div class="empty-state"><div class="empty-state-icon">⚠️</div><p class="empty-state-text">' + siEsc(error.message) + '</p></div></div>';
    }
  } finally {
    if (btn) { btn.textContent = '⚡ Generate Intelligence Brief'; btn.disabled = false; }
  }
}

function renderBriefError(district, event, audience, topic, payload) {
  const el = document.getElementById('si-brief-output');
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML = '<div class="card" style="padding:1rem;"><div class="empty-state"><div class="empty-state-icon">🕓</div>' +
    '<p class="empty-state-text">Briefing अभी generate नहीं हो सकी — AI quota/rate-limit की वजह से।</p>' +
    '<p style="font-size:.72rem;color:var(--text-muted);margin-top:.3rem;">Thodi der baad phir try karo — data mila tha: ' +
    siEsc(String((payload.sources||{}).news || 0)) + ' news, summary ' + ((payload.sources||{}).has_summary ? '✓' : '✗') + ', opposition ' + siEsc(String((payload.sources||{}).opposition || 0)) + '</p></div></div>';
}

function siEsc(v) { return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }

function renderGeneratedBrief(district, event, audience, topic, payload) {
  const el = document.getElementById('si-brief-output');
  if (!el) return;
  const b = payload.brief || {};
  const when = payload.created_at ? new Date(payload.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const src = payload.sources || {};

  const list = (items, icon) => (!items || !items.length)
    ? '<p style="font-size:.74rem;color:var(--text-muted);margin:0;">— इस विषय पर district-specific data उपलब्ध नहीं</p>'
    : '<ul style="margin:0;padding-left:1.1rem;display:flex;flex-direction:column;gap:.3rem;">' + items.map((t) => '<li style="font-size:.8rem;color:var(--text-secondary);line-height:1.5;">' + siEsc(t) + '</li>').join('') + '</ul>';

  const fr = payload.data_freshness || {};
  const freshBadge = fr.last_updated
    ? '<span class="tag" style="font-size:.62rem;' + (fr.warning ? 'color:var(--amber);border-color:var(--amber);' : '') + '">🗓 Data as of ' + new Date(fr.last_updated).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) + (fr.warning ? ' ⚠️' : '') + '</span>'
    : '';

  const avoid = (!b.avoid_mentioning || !b.avoid_mentioning.length) ? ''
    : '<div class="card" style="margin-bottom:1rem;border-color:rgba(230,57,70,.45);">' +
      '<div class="card-title" style="margin-bottom:0.6rem;color:var(--red);">⛔ Danger Zone — ये न बोलें</div>' +
      b.avoid_mentioning.map((a) => '<div style="padding:.5rem .6rem;border-left:3px solid var(--red);background:rgba(230,57,70,.07);border-radius:6px;margin-bottom:.4rem;">' +
        '<div style="font-size:.79rem;font-weight:700;color:var(--text-primary);">' + siEsc(a.topic) + '</div>' +
        (a.reason ? '<div style="font-size:.73rem;color:var(--text-muted);line-height:1.45;">' + siEsc(a.reason) + '</div>' : '') + '</div>').join('') +
      '</div>';

  const qa = (!b.anticipated_tough_questions || !b.anticipated_tough_questions.length) ? ''
    : '<div class="card" style="margin-bottom:1rem;"><div class="card-title" style="margin-bottom:0.6rem;">❓ Anticipated Tough Questions (Q&amp;A Prep)</div>' +
      b.anticipated_tough_questions.map((q, i) => '<div style="padding:.5rem .6rem;border:1px solid var(--border-subtle);border-radius:8px;background:var(--bg-elevated);margin-bottom:.45rem;">' +
        '<div style="font-size:.78rem;font-weight:700;color:var(--text-primary);">Q' + (i + 1) + '. ' + siEsc(q.likely_question) + '</div>' +
        '<div style="font-size:.74rem;color:var(--text-secondary);line-height:1.5;margin-top:.2rem;">↳ <b>Response angle:</b> ' + siEsc(q.suggested_response_direction) + '</div></div>').join('') +
      '</div>';

  const connect = (!b.local_connect_points || !b.local_connect_points.length) ? ''
    : '<div class="card"><div class="card-title" style="margin-bottom:0.6rem;">📍 Local Connect Points</div>' + list(b.local_connect_points) + '</div>';

  const compare = b.comparative_context
    ? '<div class="card" style="margin-top:1rem;"><div class="card-title" style="margin-bottom:0.5rem;">⚖️ Comparative Context</div><p style="font-size:.79rem;color:var(--text-secondary);line-height:1.5;margin:0;">' + siEsc(b.comparative_context) + '</p></div>'
    : '';

  const claims = (!b.opposition_claims_context || !b.opposition_claims_context.length)
    ? '<p style="font-size:.74rem;color:var(--text-muted);margin:0;">— कोई opposition claim data में नहीं मिला</p>'
    : b.opposition_claims_context.map((c) =>
        '<div style="padding:.55rem .65rem;border:1px solid var(--border-subtle);border-radius:8px;background:var(--bg-elevated);margin-bottom:.45rem;">' +
        '<div style="font-size:.76rem;color:var(--red);font-weight:600;margin-bottom:.2rem;">⚠ ' + siEsc(c.claim) + '</div>' +
        '<div style="font-size:.76rem;color:var(--text-secondary);line-height:1.5;">✅ <b>Factual context:</b> ' + siEsc(c.factual_context) + '</div></div>'
      ).join('');

  const tp = (b.suggested_talking_points || []).map((t, i) =>
    '<div style="display:flex;gap:.6rem;align-items:flex-start;padding:.55rem .65rem;border-left:3px solid var(--gold);background:rgba(245,197,24,.08);border-radius:6px;margin-bottom:.4rem;">' +
    '<b style="color:var(--gold);font-size:.85rem;min-width:1.3rem;">' + (i + 1) + '.</b>' +
    '<span style="font-size:.82rem;color:var(--text-primary);line-height:1.5;">' + siEsc(t) + '</span></div>'
  ).join('') || '<p style="font-size:.74rem;color:var(--text-muted);">—</p>';

  el.style.display = 'block';
  el.innerHTML = `
    <div class="card card-gold" style="margin-bottom:1rem;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
        <div>
          <div style="font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:0.3rem;">Pre-Event Intelligence Brief ${payload.saved ? '· 💾 Saved' : ''}</div>
          <h2 style="font-family:'Outfit',sans-serif;font-size:1.15rem;font-weight:800;color:var(--text-primary);">📍 ${siEsc(district)} — ${siEsc(event)}</h2>
          <div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.25rem;">👥 ${siEsc(audience)} &nbsp;•&nbsp; 📌 ${siEsc(topic)} ${when ? '&nbsp;•&nbsp; 🕐 ' + when : ''}</div>
          <div style="display:flex;gap:.35rem;flex-wrap:wrap;align-items:center;margin-top:0.35rem;">
            <span class="tag" style="font-size:.62rem;">${src.news || 0} district news</span>
            <span class="tag" style="font-size:.62rem;">AI summary ${src.has_summary ? '✓' : '✗'}</span>
            <span class="tag" style="font-size:.62rem;">${src.opposition || 0} opposition</span>
            ${freshBadge}
          </div>
          ${fr.warning ? '<div style="font-size:.7rem;color:var(--amber);margin-top:.3rem;">⚠️ ' + siEsc(fr.warning) + '</div>' : ''}
        </div>
        <div style="display:flex;gap:0.5rem;">
          <button class="btn btn-primary btn-sm" onclick="siCopyWhatsApp()">📲 WhatsApp Text</button>
          <button class="btn btn-ghost btn-sm" onclick="siCopyBrief()">📋 Copy</button>
          <button class="btn btn-ghost btn-sm" onclick="window.print()">🖨 Print</button>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:1rem;border-color:rgba(245,197,24,.4);">
      <div class="card-title" style="margin-bottom:0.65rem;">🎯 Suggested Talking Points <span class="tag tag-gold" style="font-size:.6rem;margin-left:.3rem;">TOP PRIORITY</span></div>
      ${tp}
    </div>

    ${avoid}
    ${qa}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">
      <div class="card"><div class="card-title" style="margin-bottom:0.6rem;">📊 Local Development Facts</div>${list(b.local_development_facts)}</div>
      <div class="card"><div class="card-title" style="margin-bottom:0.6rem;">🪷 BJP / Sarkar Achievements</div>${list(b.govt_bjp_achievements)}</div>
      <div class="card"><div class="card-title" style="margin-bottom:0.6rem;">⚠️ Current Local Concerns</div>${list(b.current_local_concerns)}</div>
      <div class="card"><div class="card-title" style="margin-bottom:0.6rem;">📈 Relevant Statistics</div>${list(b.relevant_statistics)}</div>
    </div>

    <div class="card" style="margin-bottom:1rem;">
      <div class="card-title" style="margin-bottom:0.6rem;">🥊 Opposition Claims — Factual Context</div>
      ${claims}
    </div>

    <div class="card">
      <div class="card-title" style="margin-bottom:0.6rem;">🗓 Recent Local Developments</div>
      ${list(b.recent_local_developments)}
    </div>

    ${connect}
    ${compare}`;
  window.__siLastBrief = { district, event, audience, topic, brief: b, share_text: payload.share_text || null };
}

function siCopyWhatsApp() {
  const d = window.__siLastBrief;
  if (!d) return;
  const text = d.share_text || siBriefToText(d);
  navigator.clipboard.writeText(text)
    .then(() => showToast('WhatsApp text ready', 'Plain text copy ho gaya — WhatsApp me paste karke bhej do', 'success'))
    .catch(() => showToast('Copy failed', 'Manual select karke copy karo', 'warning'));
}

function siBriefToText(d) { return (d.share_text || ''); }

function siCopyBrief() {
  const d = window.__siLastBrief;
  if (!d) return;
  const b = d.brief || {};
  const sec = (title, items) => '\n' + title + '\n' + '-'.repeat(title.length) + '\n' + (items || []).map((t) => '• ' + t).join('\n');
  let text = `SPEECH BRIEF — ${d.district} | ${d.event} | ${d.audience} | ${d.topic}` +
    sec('SUGGESTED TALKING POINTS', b.suggested_talking_points) +
    sec('LOCAL DEVELOPMENT FACTS', b.local_development_facts) +
    sec('BJP / SARKAR ACHIEVEMENTS', b.govt_bjp_achievements) +
    sec('CURRENT LOCAL CONCERNS', b.current_local_concerns) +
    '\nOPPOSITION CLAIMS — CONTEXT\n' + '-'.repeat(24) + '\n' + (b.opposition_claims_context || []).map((c) => '• ' + c.claim + '\n  ↳ ' + c.factual_context).join('\n') +
    sec('RELEVANT STATISTICS', b.relevant_statistics) +
    sec('RECENT LOCAL DEVELOPMENTS', b.recent_local_developments);
  navigator.clipboard.writeText(text).then(() => showToast('Copied', 'Briefing clipboard me copy ho gayi', 'success')).catch(() => showToast('Copy failed', 'Manual select karke copy karo', 'warning'));
}

async function siLoadPastBriefs(refresh) {
  const listEl = document.getElementById('si-past-briefs-list');
  if (!listEl) return;
  try {
    const res = await fetch('/api/speech-brief?limit=8', { cache: 'no-store' });
    const payload = await res.json();
    const items = payload.items || [];
    if (!items.length) {
      listEl.innerHTML = '<div style="font-size:.75rem;color:var(--text-muted);padding:.4rem;">Abhi koi past briefing nahi — pehli briefing generate karo.</div>';
      return;
    }
    listEl.innerHTML = items.map((it, i) =>
      '<div style="display:flex;align-items:center;gap:.6rem;padding:.5rem .6rem;border:1px solid var(--border-subtle);border-radius:8px;background:var(--bg-elevated);">' +
      '<span style="font-size:1rem;">🎙</span>' +
      '<div style="flex:1;min-width:0;">' +
      '<div style="font-size:.78rem;font-weight:700;color:var(--text-primary);">' + siEsc(it.district) + ' — ' + siEsc(it.event_type) + '</div>' +
      '<div style="font-size:.68rem;color:var(--text-muted);">' + siEsc(it.topic) + ' · ' + siEsc(it.audience) + ' · ' + (it.created_at ? new Date(it.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '') + '</div>' +
      '</div>' +
      '<button class="btn btn-ghost btn-sm" style="font-size:.62rem;" onclick="siReplayBrief(' + i + ')">👁 View</button></div>'
    ).join('');
    window.__siPastItems = items;
  } catch (e) {
    listEl.innerHTML = '<div style="font-size:.75rem;color:var(--text-muted);padding:.4rem;">Past briefs load nahi hui: ' + siEsc(e.message) + '</div>';
  }
}

function siReplayBrief(i) {
  const it = (window.__siPastItems || [])[i];
  if (!it) return;
  renderGeneratedBrief(it.district, it.event_type, it.audience, it.topic, {
    brief: it,
    saved: true,
    created_at: it.created_at,
    sources: { news: '?', has_summary: true, opposition: '?' },
  });
  const out = document.getElementById('si-brief-output');
  if (out) out.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function getAudienceNote(audience, district) {
  const notes = {
    'Youth': `${district} ke yuva voters mein unemployment ek badi chinta hai. Rozgar, BPSC, aur digital opportunities ko foreground karein. PK ka appeal youth mein hai — counter karne ke liye concrete jobs data zaroor dein.`,
    'Farmers': `${district} ke kisan flood aur market price se pareshan hain. Fasal bima, MSP, aur irrigation projects par focus karein. Mukhyamantri Khet Suraksha Yojana ka direct mention effective hoga.`,
    'Women': `Women safety, SHG groups, aur Mukhyamantri Nari Shakti Yojana ko highlight karein. Bihar mein 50% panchayat seats women ke liye reserved hain — ek bada achievement.`,
    'General Public': `Samasya se shuru karein, phir solution. ${district} ke log roads, bijli, paani aur rozgar ko priority dete hain. Baat karo, sunao aur local leader se connect karwao.`,
    'Karyakartas': `Morale building pe focus karein. 2025 ka target clear karein. Booth-level strategy, membership drive aur shakti kendra activation ke baare mein baat karein.`,
  };
  return notes[audience] || `${district} ke logon se direct connect karein. Unki problems sunein aur BJP sarkar ke solutions clearly explain karein. Authenticity sabse important hai.`;
}

function printBrief() {
  window.print();
}

/* ── Recent Cards (Brief Builder view) ───────────────────── */
function renderRecentCards() {
  const el = document.getElementById('si-recent-cards');
  if (!el) return;
  const intensityColor = i => i >= 80 ? 'var(--red)' : i >= 60 ? 'var(--amber)' : 'var(--green)';
  el.innerHTML = SPEECHES_DATA.map((s,i)=>`
    <div class="card card-shine" style="cursor:pointer;animation:slideInUp 0.3s ease both;animation-delay:${i*0.07}s;" onclick="switchToLibrary(${s.id})">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;">
        <span class="leader-party-badge party-${s.party.toLowerCase().replace(' ','-')}">${s.party}</span>
        <span class="sentiment-badge sentiment-${s.sentiment}" style="font-size:0.62rem;">${s.sentiment}</span>
      </div>
      <div style="font-size:0.88rem;font-weight:600;color:var(--text-primary);margin-bottom:0.25rem;line-height:1.3;">${s.title}</div>
      <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.5rem;">${s.speaker} • ${s.date} • ${s.duration}</div>
      <div class="progress-bar" style="height:4px;margin-bottom:0.3rem;">
        <div class="progress-fill" style="width:${s.intensity}%;background:${intensityColor(s.intensity)};"></div>
      </div>
      <div style="font-size:0.68rem;color:${intensityColor(s.intensity)};">Intensity: ${s.intensity}/100</div>
      <div style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-top:0.5rem;">
        ${s.topics.slice(0,3).map(t=>`<span class="tag" style="font-size:0.62rem;">${t}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

function switchToLibrary(id) {
  siShowingLibrary = false;
  toggleSIView();
  setTimeout(() => selectSpeech(id), 100);
}

/* ── Library View ─────────────────────────────────────────── */
function renderSpeechList(data) {
  const el = document.getElementById('si-speech-list');
  const count = document.getElementById('si-count');
  if (!el) return;
  if (count) count.textContent = `${data.length} speech${data.length!==1?'es':''}`;
  if (!data.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🎙</div><p>No speeches found.</p></div>`;
    return;
  }
  const intensityColor = i => i>=80?'var(--red)':i>=60?'var(--amber)':'var(--green)';
  el.innerHTML = data.map((s,i) => `
    <div id="si-item-${s.id}" onclick="selectSpeech(${s.id})"
      style="padding:1rem;border-bottom:1px solid var(--border-subtle);cursor:pointer;transition:background 0.15s;${s.id===siActiveId?'background:var(--gold-dim);border-left:3px solid var(--gold);':''}"
      onmouseover="this.style.background='var(--glass-hover)'" onmouseout="this.style.background='${s.id===siActiveId?'var(--gold-dim)':'transparent'}'">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:0.5rem;margin-bottom:0.4rem;">
        <div>
          <div style="font-size:0.85rem;font-weight:600;color:var(--text-primary);line-height:1.3;">${s.title}</div>
          <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.15rem;">${s.speaker} • ${s.date}</div>
        </div>
        <span class="sentiment-badge sentiment-${s.sentiment}" style="flex-shrink:0;font-size:0.62rem;">${s.sentiment}</span>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;">
        <span style="font-size:0.68rem;color:var(--text-muted);">Intensity:</span>
        <div class="progress-bar" style="flex:1;height:4px;"><div class="progress-fill" style="width:${s.intensity}%;background:${intensityColor(s.intensity)};"></div></div>
        <span style="font-size:0.7rem;color:${intensityColor(s.intensity)};font-weight:600;">${s.intensity}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:0.3rem;">
        ${s.topics.slice(0,3).map(t=>`<span class="tag" style="font-size:0.62rem;">${t}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

function selectSpeech(id) {
  siActiveId = id;
  const speech = SPEECHES_DATA.find(s => s.id === id);
  if (!speech) return;
  renderSpeechDetail(speech);
  document.querySelectorAll('[id^="si-item-"]').forEach(el => { el.style.background='transparent'; el.style.borderLeft=''; });
  const active = document.getElementById(`si-item-${id}`);
  if (active) { active.style.background='var(--gold-dim)'; active.style.borderLeft='3px solid var(--gold)'; }
}

function renderSpeechDetail(s) {
  const el = document.getElementById('si-detail');
  if (!el || !s) return;
  const intensityColor = s.intensity>=80?'var(--red)':s.intensity>=60?'var(--amber)':'var(--green)';
  const partyColorMap = { RJD:'#e63946', JDU:'#22c55e', BJP:'#ff6b2b', 'Jan Suraaj':'#ff9f43' };
  const pc = partyColorMap[s.party] || '#f5c518';
  el.innerHTML = `
    <div class="card card-gold">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
        <div>
          <h2 style="font-size:1.05rem;font-weight:800;color:var(--text-primary);margin-bottom:0.4rem;">${s.title}</h2>
          <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;font-size:0.78rem;color:var(--text-muted);">
            <span style="color:${pc};font-weight:600;">${s.speaker}</span>
            <span>•</span><span class="tag" style="font-size:0.65rem;background:${pc}22;color:${pc};border-color:${pc}44;">${s.party}</span>
            <span>•</span><span>📅 ${s.date}</span>
            <span>•</span><span>⏱ ${s.duration}</span>
            <span>•</span><span>📍 ${s.venue}</span>
          </div>
        </div>
        <span class="sentiment-badge sentiment-${s.sentiment}">${s.sentiment==='positive'?'↑ Positive':s.sentiment==='negative'?'↓ Negative':'→ Mixed'}</span>
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:1rem;">🧠 NLP Analysis</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div>
          <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.5rem;">Topics</div>
          <div style="display:flex;flex-wrap:wrap;gap:0.35rem;">${s.topics.map(t=>`<span class="tag tag-blue" style="font-size:0.7rem;">${t}</span>`).join('')}</div>
        </div>
        <div>
          <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.4rem;">Intensity</div>
          <div style="font-family:'Outfit',sans-serif;font-size:2rem;font-weight:800;color:${intensityColor};line-height:1;">${s.intensity}<span style="font-size:0.85rem;color:var(--text-muted);font-weight:400;">/100</span></div>
          <div class="progress-bar" style="margin-top:0.4rem;"><div class="progress-fill" style="width:${s.intensity}%;background:${intensityColor};"></div></div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:0.5rem;">📋 Summary</div>
      <p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.7;">${s.summary}</p>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:0.75rem;">💬 Key Quotes</div>
      ${s.keyQuotes.map(q=>`<div style="padding:0.75rem 1rem;border-left:3px solid var(--gold);background:var(--gold-dim);border-radius:0 var(--radius-md) var(--radius-md) 0;margin-bottom:0.5rem;"><p style="font-size:0.88rem;color:var(--text-primary);font-style:italic;line-height:1.6;">${q}</p></div>`).join('')}
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:0.75rem;">✅ Promises / Commitments</div>
      ${s.keyPromises.map(p=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0.75rem;background:var(--glass-bg);border-radius:var(--radius-md);border:1px solid var(--border-subtle);margin-bottom:0.4rem;"><span style="font-size:0.82rem;color:var(--text-secondary);">📌 ${p}</span><span class="tag tag-amber" style="font-size:0.62rem;">TRACKED</span></div>`).join('')}
    </div>
  `;
}

function setupSpeechSearch() {
  const input = document.getElementById('si-search');
  if (!input) return;
  input.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    const filtered = SPEECHES_DATA.filter(s =>
      s.speaker.toLowerCase().includes(q) ||
      s.title.toLowerCase().includes(q) ||
      s.topics.some(t => t.toLowerCase().includes(q))
    );
    if (siShowingLibrary) {
      renderSpeechList(filtered);
      if (filtered.length) renderSpeechDetail(filtered[0]);
    }
  });
}

window.selectSpeech     = selectSpeech;
window.toggleSIView     = toggleSIView;
window.generateSpeechBrief = generateSpeechBrief;
window.printBrief       = printBrief;
window.switchToLibrary  = switchToLibrary;
