/* ============================================================
   MOCK DATA: News & Alerts — 4-Level System
   severity: 'high'=Critical, 'medium'=Developing, 'low'=Watch
   ============================================================ */
const NEWS_DATA = [
  {
    id: 1, severity: 'high',
    title: 'RJD Mass Rally in Patna — Tejashwi Targets CM Nitish',
    body: 'Tejashwi Yadav announced a mega opposition rally in Gandhi Maidan, Patna on 15 Sep. Expected footfall 2 lakh+. RJD is pushing anti-incumbency narrative on unemployment and law & order.',
    source: 'TV9 Bihar', time: '2 min ago', category: 'Political', district: 'Patna',
    tags: ['RJD', 'Tejashwi', 'Rally', 'Anti-Incumbency'],
    actionRequired: 'Mobilise BJP karyakartas in Patna. Counter with development data. Alert social media team to track hashtags. Inform district president.'
  },
  {
    id: 2, severity: 'high',
    title: 'PK-Congress Meeting: Alliance Talks Intensify — Bihar Seat Share Finalising',
    body: 'Prashant Kishor reportedly met senior INC leaders in Delhi for third consecutive day. Sources indicate finalisation of seat-sharing formula for Bihar 2025. PK expected to contest 120+ seats.',
    source: 'Times of India', time: '15 min ago', category: 'Opposition', district: 'Delhi',
    tags: ['PK', 'INC', 'Alliance', 'Seat-Sharing'],
    actionRequired: 'Monitor closely. If alliance confirmed, update opposition tracker. Assess which BJP-contested seats are affected. President briefing required.'
  },
  {
    id: 3, severity: 'high',
    title: 'Flood Situation Critical in North Bihar — Opposition Demands Resignation',
    body: 'Severe flooding in Darbhanga, Supaul, and Madhubani districts. 40,000 displaced. CPI(M) and RJD jointly demanded resignation of state government over "poor response".',
    source: 'Hindustan', time: '32 min ago', category: 'Flood & Disaster', district: 'Darbhanga',
    tags: ['Floods', 'Crisis', 'Opposition', 'North Bihar'],
    actionRequired: 'Ensure NDRF visible on ground. CM should issue a statement. Arrange relief camp coverage for media. Counter RJD narrative with pre-deployment data.'
  },
  {
    id: 4, severity: 'medium',
    title: 'JDU Internal Dissent: 3 MLAs Skip Party Meeting in Seemanchal',
    body: 'Three JDU MLAs from Seemanchal region skipped mandatory party meeting. Speculation about cross-voting pressures. One MLA seen at RJD event last week.',
    source: 'Field Report', time: '1 hr ago', category: 'Political', district: 'Kishanganj',
    tags: ['JDU', 'Internal', 'Dissent', 'MLA'],
    actionRequired: 'State president should personally call the 3 MLAs. Investigate RJD contact. Coordinate with JDU leadership. Watch for next 48 hrs.'
  },
  {
    id: 5, severity: 'medium',
    title: 'Viral Video: Minister Caught Making Caste Remarks — 200K Views',
    body: 'A video of State Minister making controversial caste-related remarks has gone viral on Twitter with 200K+ views. Opposition demanding immediate action. Press asking for BJP response.',
    source: 'Social Media', time: '1.5 hr ago', category: 'Media', district: 'Bhagalpur',
    tags: ['Social Media', 'Controversy', 'Caste', 'Viral'],
    actionRequired: 'Communications team to draft clarification. Assess if apology needed. Do NOT escalate without legal vetting. Brief President if national media picks up.'
  },
  {
    id: 6, severity: 'medium',
    title: 'INC Bihar Unit Leadership Change — State President Replaced',
    body: 'AICC replaced Bihar INC State President with a new leader from Mithila region. New appointment seen as strategic move to consolidate Maithili votes before 2025.',
    source: 'IANS', time: '2 hr ago', category: 'Opposition', district: 'Darbhanga',
    tags: ['INC', 'Leadership', 'Mithila', 'Reorganization'],
    actionRequired: 'Update opposition tracker. Assess new leader\'s political background. Check if this affects seat-sharing talks with RJD or PK.'
  },
  {
    id: 7, severity: 'low',
    title: 'BJP Booth Management Drive: 500 New Booths Activated Across Bihar',
    body: 'BJP Bihar activated 500 new polling booths under "Mission 2025" campaign. Each booth now has a dedicated coordinator and WhatsApp group for rapid communication.',
    source: 'BJP Press', time: '3 hr ago', category: 'Political', district: 'Multiple',
    tags: ['BJP', 'Booth', 'Campaign', 'Mission2025'],
    actionRequired: 'Routine. Log in organisation tracker. Share activation data with President for motivation speech to karyakartas.'
  },
  {
    id: 8, severity: 'low',
    title: 'CM Nitish Kumar Inaugurates ₹1,800 Cr Highway in Muzaffarpur',
    body: 'CM Nitish Kumar inaugurated 4-lane Muzaffarpur-Sitamarhi highway project. Development card being played ahead of elections. Event coverage on 5 regional channels.',
    source: 'PIB Bihar', time: '4 hr ago', category: 'Political', district: 'Muzaffarpur',
    tags: ['Nitish', 'Development', 'Infrastructure', 'Highway'],
    actionRequired: 'Add to BJP achievements databank. Useful for speech briefs in Muzaffarpur and Sitamarhi. Good content for social media team.'
  }
];

const TICKER_ITEMS = [
  '🔴 BREAKING: Tejashwi Yadav confirms mega rally on Sept 15 in Patna — 2 lakh crowd expected',
  '📍 CRITICAL: PK-INC Alliance talks in Delhi — Bihar seat sharing may be finalised',
  '🌊 DEVELOPING: Flood alert: Red warning in 8 North Bihar districts — NDRF deployed',
  '📊 WATCH: Latest Poll — NDA leads 54% in Seemanchal, down 4pts from last survey',
  '🎙 CM Nitish Kumar to address Vikas Yatra from Muzaffarpur on Thursday',
  '📱 Bihar trending: #Tejashwi4Bihar crosses 2M tweets — monitoring active',
  '⚠️ DEVELOPING: JDU-BJP seat sharing talks stalled — 12 seats in dispute',
  '🏛️ Bihar Assembly Winter Session dates announced: Nov 18 – Dec 5',
  '🔴 3 JDU MLAs absent from party meeting — Seemanchal dissent signals being tracked',
  '📢 INC Bihar new state president from Mithila — strategic realignment underway'
];
