/* ============================================================
   SPEECH INTELLIGENCE MODULE — Full Briefing Engine + Library
   ============================================================ */

let siActiveId = 1;
let siShowingLibrary = false;

function initSpeechIntelligence() {
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
function generateSpeechBrief() {
  const district = document.getElementById('si-district-sel')?.value;
  const event    = document.getElementById('si-event-sel')?.value;
  const audience = document.getElementById('si-audience-sel')?.value;
  const topic    = document.getElementById('si-topic-sel')?.value;

  if (!district || !event || !audience || !topic) {
    showToast('Incomplete', 'Please select District, Event, Audience and Topic', 'warning');
    return;
  }

  const btn = document.getElementById('si-generate-btn');
  if (btn) { btn.textContent = '⏳ Generating…'; btn.disabled = true; }

  setTimeout(() => {
    if (btn) { btn.textContent = '⚡ Generate Intelligence Brief'; btn.disabled = false; }
    renderGeneratedBrief(district, event, audience, topic);
  }, 1200);
}

function renderGeneratedBrief(district, event, audience, topic) {
  const el = document.getElementById('si-brief-output');
  if (!el) return;

  // Find relevant data for this district
  const distData = DISTRICTS_DATA.find(d => d.name === district);
  const distIssues = ISSUES_DATA.filter(i => i.district === district).slice(0, 3);
  const oppActivity = OPPOSITION_DATA.districtActivity[district] || 'low';
  const topNarrative = OPPOSITION_DATA.attackNarratives[0];
  const topCounter = OPPOSITION_DATA.counterStrategies[0];

  // Topic-specific talking points
  const talkingPoints = {
    'Development & Infrastructure': [
      `${district} mein ₹1,200 Cr ki sadak pariyojana chal rahi hai — BJP ki drishti dikha rahi hai`,
      'Bihar mein 28,000+ km sadak nirmaan 2015-2025 mein — ek record hai',
      'CM Nitish Kumar ki "Saat Nishchay" yojana ne ${district} ko naya roop diya hai',
      'National Highway expansion se ${district} ke karyakarta aur vyapari dono khush hain'
    ],
    'Employment & Youth': [
      'Bihar mein BPSC, SSC bharti ke 72,000+ posts available hain — yuvaon ko avsar',
      'Udyami Yojana ke tahat 10,000 yuvaon ko loan diya gaya — rozgar srijan',
      `${district} ke engineering colleges se 3,000+ graduates iss saal naukri mein`,
      'Skill Development Mission: 5 lakh yuvaon ko training — Bihar ka bhavishya'
    ],
    'Agriculture & Floods': [
      `${district} mein is saal fasal bima yojana se 45,000 kisan labhanvit hue`,
      'Mukhyamantri Kisan Sahayata Yojana: har kisaan ke liye direct relief',
      'Flood management mein ₹3,800 Cr kharcha — embankments strengthen kiye gaye',
      'Kosi-Gandak interlinking project se north Bihar mein sukha relief milega'
    ],
    'NDA Achievements': [
      'Bihar mein 2005 ke comparison mein crime rate 65% kam — law & order bana',
      'Per capita income 4x badha hai 2005 se — vikas ki raah par Bihar',
      'Bijli: 24x7 supply 38 jilo mein — pehle sirf 8 ghante milti thi',
      'National highway se jude sare jile — connectivity revolution'
    ],
    'Counter-Opposition': [
      `RJD ke 15 saal: jungle raj, bijli nahi, sadak nahi — log bhool nahi sakte`,
      `${topNarrative?.topic || 'Opposition narrative'} ek jhooth hai — yahan ke aakde alag bol rahe hain`,
      'Prashant Kishor ka Jan Suraaj: na manifesto, na organization — sirf publicity',
      'INC-RJD alliance mein ek doosre ka vishwaas nahi — toot jayega chunaav se pehle'
    ]
  };

  const points = talkingPoints[topic] || [
    'Bihar ka vikas hum sab ki zimmedari hai — BJP is par kaam kar rahi hai',
    `${district} ke logon ki seva karna BJP ka pradhaan lakshya hai`,
    '2025 mein phir ek baar NDA ki sarkar — development continue karega',
    'Hum sab milkar Bihar ko ek strong aur prosperous state banayenge'
  ];

  // Opposition claims to counter
  const oppClaims = [
    { claim: 'Unemployment badhaa hai', fact: 'BPSC/SSC mein 72,000+ vacancies open — largest in 10 years' },
    { claim: 'Floods mein government fail', fact: 'NDRF teams pre-deployed in 14 districts — response time 4hrs' },
    { claim: 'BJP ne development nahi kiya', fact: `${district}: ₹1,200 Cr highway, 340 MW bijli, 8 new schools opened` },
  ];

  el.style.display = 'block';
  el.innerHTML = `
    <!-- Brief Header -->
    <div class="card card-gold" style="margin-bottom:1rem;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
        <div>
          <div style="font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:0.3rem;">Pre-Event Intelligence Brief</div>
          <h2 style="font-family:'Outfit',sans-serif;font-size:1.15rem;font-weight:800;color:var(--text-primary);">📍 ${district} — ${event}</h2>
          <div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.25rem;">👥 Audience: ${audience} &nbsp;•&nbsp; 📌 Topic: ${topic}</div>
        </div>
        <div style="display:flex;gap:0.5rem;">
          <button class="btn btn-ghost btn-sm" onclick="printBrief()">🖨 Print Brief</button>
          <button class="btn btn-primary btn-sm" onclick="showToast('Saved','Brief saved to Communication Hub','success')">💾 Save</button>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">

      <!-- Local Facts -->
      <div class="card">
        <div class="card-title" style="margin-bottom:0.75rem;">📊 Local District Facts</div>
        <div style="display:flex;flex-direction:column;gap:0.4rem;">
          ${distData ? `
            <div style="display:flex;justify-content:space-between;font-size:0.82rem;padding:0.3rem 0;border-bottom:1px solid var(--border-subtle);">
              <span style="color:var(--text-muted);">Assembly Seats</span>
              <span style="color:var(--gold);font-weight:700;">${distData.seats}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.82rem;padding:0.3rem 0;border-bottom:1px solid var(--border-subtle);">
              <span style="color:var(--text-muted);">BJP Seats</span>
              <span style="color:var(--bjp-color);font-weight:700;">${distData.bjp}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.82rem;padding:0.3rem 0;border-bottom:1px solid var(--border-subtle);">
              <span style="color:var(--text-muted);">JDU Seats</span>
              <span style="color:var(--jdu-color);font-weight:700;">${distData.jdu}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.82rem;padding:0.3rem 0;border-bottom:1px solid var(--border-subtle);">
              <span style="color:var(--text-muted);">Opposition</span>
              <span style="color:var(--rjd-color);font-weight:700;">${distData.rjd + distData.inc}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.82rem;padding:0.3rem 0;">
              <span style="color:var(--text-muted);">Total Voters</span>
              <span style="color:var(--text-primary);font-weight:700;">${(distData.totalVotes/100000).toFixed(1)}L</span>
            </div>
          ` : `<div style="font-size:0.8rem;color:var(--text-muted);">District data loading…</div>`}
        </div>
      </div>

      <!-- Local Concerns -->
      <div class="card">
        <div class="card-title" style="margin-bottom:0.75rem;">⚠️ Local Concerns to Address</div>
        ${distIssues.length > 0 ? distIssues.map(i=>`
          <div style="display:flex;align-items:flex-start;gap:0.5rem;padding:0.4rem 0;border-bottom:1px solid var(--border-subtle);">
            <span style="font-size:0.75rem;color:${i.priority==='urgent'?'var(--red)':'var(--amber)'};">▶</span>
            <div>
              <div style="font-size:0.8rem;font-weight:500;color:var(--text-primary);">${i.title}</div>
              <div style="font-size:0.7rem;color:var(--text-muted);">${i.category} • Status: ${i.status}</div>
            </div>
          </div>
        `).join('') : `
          <div style="font-size:0.8rem;color:var(--green);padding:0.5rem 0;">✓ No major active issues in this district</div>
          <div style="font-size:0.78rem;color:var(--text-muted);">General concerns: infrastructure, employment and education remain voter priorities.</div>
        `}
        <div style="margin-top:0.6rem;padding:0.5rem 0.75rem;background:rgba(230,57,70,0.08);border-radius:var(--radius-sm);border-left:2px solid var(--red);">
          <div style="font-size:0.73rem;color:var(--red);font-weight:600;">Opposition Activity: ${oppActivity.replace('-',' ').toUpperCase()}</div>
          <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.15rem;">Narrative: "${topNarrative?.topic || 'Development failures'}"</div>
        </div>
      </div>

    </div>

    <!-- Key Talking Points -->
    <div class="card" style="margin-bottom:1rem;">
      <div class="card-title" style="margin-bottom:0.75rem;">💬 Suggested Talking Points</div>
      <div style="display:flex;flex-direction:column;gap:0.5rem;">
        ${points.map((pt,i)=>`
          <div style="display:flex;align-items:flex-start;gap:0.75rem;padding:0.65rem 0.9rem;background:var(--glass-bg);border-radius:var(--radius-md);border:1px solid var(--border-subtle);">
            <div style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#f5c518,#e8a900);display:flex;align-items:center;justify-content:center;font-size:0.68rem;font-weight:800;color:#080d1a;flex-shrink:0;">${i+1}</div>
            <div style="font-size:0.84rem;color:var(--text-secondary);line-height:1.55;">${pt.replace(/\${district}/g, district)}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Opposition Claims & Factual Counter -->
    <div class="card" style="margin-bottom:1rem;">
      <div class="card-title" style="margin-bottom:0.75rem;">🛡 Opposition Claims — Factual Counter</div>
      <div style="display:flex;flex-direction:column;gap:0.5rem;">
        ${oppClaims.map(c=>`
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;padding:0.65rem;background:var(--glass-bg);border-radius:var(--radius-md);border:1px solid var(--border-subtle);">
            <div>
              <div style="font-size:0.65rem;color:var(--red);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.2rem;">🔴 Their Claim</div>
              <div style="font-size:0.8rem;color:var(--text-secondary);">${c.claim}</div>
            </div>
            <div style="border-left:1px solid var(--border-subtle);padding-left:0.5rem;">
              <div style="font-size:0.65rem;color:var(--green);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.2rem;">✅ Factual Counter</div>
              <div style="font-size:0.8rem;color:var(--text-primary);font-weight:500;">${c.fact.replace(/\${district}/g, district)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Relevant Stats -->
    <div class="card" style="margin-bottom:1rem;">
      <div class="card-title" style="margin-bottom:0.75rem;">📈 Relevant Statistics to Quote</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.6rem;">
        ${[
          {label:'Bihar GSDP Growth',val:'10.6%',sub:'FY2024 — national top 5'},
          {label:'Road Coverage',val:'28,000+',sub:'km built since 2015'},
          {label:'Electrification',val:'99.7%',sub:'households electrified'},
          {label:'PMAY Houses',val:'32 Lakh',sub:'Bihar in 10 years'}
        ].map(s=>`
          <div style="padding:0.75rem;text-align:center;background:var(--glass-bg);border-radius:var(--radius-md);border:1px solid var(--border-subtle);">
            <div style="font-family:'Outfit',sans-serif;font-size:1.15rem;font-weight:800;color:var(--gold);">${s.val}</div>
            <div style="font-size:0.72rem;font-weight:600;color:var(--text-primary);margin-top:0.2rem;">${s.label}</div>
            <div style="font-size:0.65rem;color:var(--text-muted);margin-top:0.1rem;">${s.sub}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Audience-specific notes -->
    <div class="card">
      <div class="card-title" style="margin-bottom:0.75rem;">👥 Audience Notes — ${audience}</div>
      <div style="font-size:0.84rem;color:var(--text-secondary);line-height:1.7;">
        ${getAudienceNote(audience, district)}
      </div>
      <div style="margin-top:0.75rem;display:flex;gap:0.5rem;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" onclick="printBrief()">🖨 Print This Brief</button>
        <button class="btn btn-ghost btn-sm" onclick="showToast('Shared','Brief shared with Communication Team','success')">📤 Share with Comms Team</button>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('si-brief-output').style.display='none';showToast('Cleared','Brief cleared','info')">✕ Close Brief</button>
      </div>
    </div>
  `;

  // Scroll to brief
  el.scrollIntoView({ behavior:'smooth', block:'start' });
  showToast('Brief Ready', `${district} — ${event} brief generated`, 'success');
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
