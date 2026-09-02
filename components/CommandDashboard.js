'use client';

import { useEffect, useMemo, useState } from 'react';
import { BIHAR_DISTRICTS } from '../lib/districts';
import { getSupabase } from '../lib/supabase';

const NAV = [
  ['war-room', '🚨', 'War Room'], ['political-map', '🗺️', 'Bihar Map'], ['leadership', '👥', 'Leadership'], ['opposition', '🔍', 'Opposition'],
  ['pk-tracker', '🎯', 'PK Tracker'], ['media-pulse', '📱', 'Media & Social'], ['speech-intelligence', '🎙️', 'Speech Intel'], ['issues', '📋', 'Issues']
];
const TRACKERS = {
  leadership: { title:'Leadership Tracker', terms:['nitish kumar','tejashwi yadav','lalu yadav','chirag paswan','samrat choudhary','jitan ram manjhi'] },
  opposition: { title:'Opposition Tracker', terms:['opposition','rjd','congress','cpi','mahagathbandhan','protest'] },
  'pk-tracker': { title:'Prashant Kishor Tracker', terms:['prashant kishor','jan suraaj','jan suraj'] },
  'media-pulse': { title:'Media & Social Pulse', terms:['media','social media','viral','video','twitter','youtube'] },
  'speech-intelligence': { title:'Speech Intelligence', terms:['speech','rally','address','statement','सभा','भाषण'] },
  issues: { title:'Issues & Grievances', terms:['flood','road','water','employment','crime','corruption','complaint','grievance'] }
};

function text(article) { return `${article.title || ''} ${article.content || ''}`.toLowerCase(); }
function level(article) {
  const explicit = String([article.severity, article.priority, article.status, article.risk_level].find(Boolean) || '').toLowerCase();
  if (['critical','high'].includes(explicit)) return 'critical';
  if (['developing','medium'].includes(explicit)) return 'developing';
  if (['watch','low'].includes(explicit)) return 'watch';
  const body = text(article);
  if (/violence|attack|death|killed|arrest|critical|riot|flood|security alert/.test(body)) return 'critical';
  if (/election|rally|protest|dharna|campaign|nomination|scam|corruption/.test(body)) return 'developing';
  return 'watch';
}
function ago(value) { const time = new Date(value).getTime(); if (Number.isNaN(time)) return 'Recently'; const s = Math.round((time - Date.now()) / 1000); const [unit, step] = Math.abs(s) < 3600 ? ['minute',60] : Math.abs(s) < 86400 ? ['hour',3600] : ['day',86400]; return new Intl.RelativeTimeFormat('en', { numeric:'auto' }).format(Math.round(s / step), unit); }
function matches(article, terms) { return terms.some(term => text(article).includes(term)); }

function NewsList({ articles, empty }) {
  return articles.length ? <ul className="news-list">{articles.map((article, i) => <li key={article.id || `${article.title}-${i}`}><span className={`severity ${level(article)}`}>{level(article).toUpperCase()}</span><div><b>{article.title || 'Untitled update'}</b><small>📍 {article.author || 'General'} · {ago(article.created_at)}</small></div></li>)}</ul> : <p className="empty">{empty}</p>;
}

export default function CommandDashboard() {
  const [module, setModule] = useState('war-room');
  const [district, setDistrict] = useState('Patna');
  const [allNews, setAllNews] = useState([]);
  const [districtNews, setDistrictNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [districtLoading, setDistrictLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const client = getSupabase();
    if (!client) { setError('Supabase configuration missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.'); setLoading(false); return undefined; }
    client.from('NewsDashboard').select('*').order('created_at', { ascending:false }).limit(250).then(({ data, error: queryError }) => {
      if (!active) return;
      if (queryError) setError(queryError.message); else setAllNews(data || []);
      setLoading(false);
    });
    const channel = client.channel('bihar-dashboard-live').on('postgres_changes', { event:'INSERT', schema:'public', table:'NewsDashboard' }, ({ new: row }) => {
      setAllNews(items => items.some(item => item.id === row.id) ? items : [row, ...items]);
      if (String(row.author || '').toLowerCase().includes(district.toLowerCase())) setDistrictNews(items => items.some(item => item.id === row.id) ? items : [row, ...items]);
    }).subscribe();
    return () => { active = false; client.removeChannel(channel); };
  }, [district]);

  useEffect(() => {
    let active = true;
    const client = getSupabase();
    if (!client) return undefined;
    setDistrictLoading(true);
    client.from('NewsDashboard').select('*').ilike('author', `%${district}%`).order('created_at', { ascending:false }).then(({ data, error: queryError }) => {
      if (!active) return;
      if (queryError) setError(queryError.message); else setDistrictNews(data || []);
      setDistrictLoading(false);
    });
    return () => { active = false; };
  }, [district]);

  const counts = useMemo(() => ({ critical: allNews.filter(item => level(item) === 'critical').length, developing: allNews.filter(item => level(item) === 'developing').length, watch: allNews.filter(item => level(item) === 'watch').length }), [allNews]);
  const tracker = TRACKERS[module];
  const trackerNews = tracker ? allNews.filter(article => matches(article, tracker.terms)) : [];
  const districtCounts = useMemo(() => ({ critical:districtNews.filter(item => level(item) === 'critical').length, watch:districtNews.filter(item => level(item) === 'watch').length }), [districtNews]);

  return <div className="dashboard-shell">
    <aside><div className="brand"><span>⚡</span><div><b>Bihar Command</b><small>Political Intelligence</small></div></div><nav>{NAV.map(([id, icon, label]) => <button key={id} className={module === id ? 'active' : ''} onClick={() => setModule(id)}><span>{icon}</span>{label}</button>)}</nav><div className="operator">● LIVE MONITORING</div></aside>
    <main><header><div><p className="eyebrow">Bihar political intelligence</p><h1>{NAV.find(item => item[0] === module)?.[2]}</h1></div><span className="live"><i />Supabase Live</span></header>
      {loading && <div className="notice">Loading live NewsDashboard data…</div>}{error && <div className="notice error">{error}</div>}
      {!loading && !error && module === 'war-room' && <section><div className="stats"><Stat label="🔴 Critical" value={counts.critical} tone="red"/><Stat label="🟠 Developing" value={counts.developing} tone="amber"/><Stat label="🟡 Watch" value={counts.watch} tone="gold"/><Stat label="Total live records" value={allNews.length} tone="blue"/></div><div className="panel"><div className="panel-title"><div><p className="eyebrow">Live feed</p><h2>Breaking News & War Room</h2></div><span>{allNews.length} records</span></div><NewsList articles={allNews.slice(0, 30)} empty="No live records yet. Start fetch_news.py to ingest NewsData updates."/></div></section>}
      {!loading && !error && module === 'political-map' && <section className="panel"><div className="panel-title"><div><p className="eyebrow">District intelligence MVP</p><h2>🗺️ Bihar Political Map</h2></div></div><label className="select-label">Selected district<select value={district} onChange={event => setDistrict(event.target.value)}>{BIHAR_DISTRICTS.map(name => <option key={name}>{name}</option>)}</select></label><div className="district-grid">{BIHAR_DISTRICTS.map(name => <button key={name} className={district === name ? 'selected' : ''} onClick={() => setDistrict(name)}>{name}</button>)}</div><div className="stats compact"><Stat label="Total news/events" value={districtLoading ? '—' : districtNews.length} tone="blue"/><Stat label="🔴 Critical" value={districtLoading ? '—' : districtCounts.critical} tone="red"/><Stat label="🟡 Watch" value={districtLoading ? '—' : districtCounts.watch} tone="gold"/></div><h3>Latest headlines — {district}</h3>{districtLoading ? <p className="empty">Loading {district} records…</p> : <><NewsList articles={districtNews.slice(0, 5)} empty={`No entries tagged with ${district}.`}/><details><summary>View all {districtNews.length} district entries</summary><NewsList articles={districtNews} empty="No entries."/></details></>}</section>}
      {!loading && !error && tracker && <section className="panel"><div className="panel-title"><div><p className="eyebrow">Live keyword intelligence</p><h2>{tracker.title}</h2></div><span>{trackerNews.length} matched</span></div><p className="helper">Live records are matched against political keywords relevant to this module.</p><NewsList articles={trackerNews.slice(0, 30)} empty="No matching live coverage yet."/></section>}
    </main>
  </div>;
}

function Stat({ label, value, tone }) { return <div className={`stat ${tone}`}><span>{label}</span><strong>{value}</strong></div>; }
