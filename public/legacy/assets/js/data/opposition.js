/* ============================================================
   MOCK DATA: Opposition Parties, Narratives, Issues, Grievances
   ============================================================ */

const OPPOSITION_DATA = {
  // Standard Intel Cards: WHO → WHERE → EVENT → ISSUE → STATEMENT → REACH → CONTEXT → STATUS
  intelCards: [
    {
      id: 1,
      who: 'Tejashwi Yadav',
      party: 'RJD',
      where: 'Gandhi Maidan, Patna',
      event: 'Jan Jagran Yatra — Public Rally',
      issue: 'Unemployment in Bihar',
      statement: '"BJP sarkar 10 saal mein ek naukri nahi de saki. Hamari sarkar mein 10 lakh jobs denge pehle saal mein."',
      reach: '80,000 crowd, 2.4M social impressions, Top Twitter trend #Tejashwi4Bihar',
      context: 'RJD pre-2025 election campaign. Unemployment narrative gaining traction among youth (21-35 age group). BJP response: 72,000 BPSC vacancies currently open.',
      status: 'developing',
      time: '2 days ago',
      severity: 'high'
    },
    {
      id: 2,
      who: 'Prashant Kishor',
      party: 'Jan Suraaj',
      where: 'Gaya District, Multiple Villages',
      event: 'Padyatra — Village-to-Village Walk',
      issue: 'Governance failure, Dalits & OBC rights',
      statement: '"Bihar ke gaon ke log smart hain. Woh BJP aur RJD dono ko jaante hain. Jan Suraaj ek naya vikalp hai."',
      reach: '3,200 direct contacts, 980K YouTube views, 450K WhatsApp forwards',
      context: 'PK walked 40km in 3 days. Targeting Gaya which has high SC/ST population. No formal alliance announced but INC contacts continuing.',
      status: 'critical',
      time: '1 day ago',
      severity: 'high'
    },
    {
      id: 3,
      who: 'Akhilesh Singh',
      party: 'INC',
      where: 'Press Club, Patna',
      event: 'Press Conference',
      issue: 'INDIA Alliance — Seat Sharing',
      statement: '"INDIA alliance mein seat sharing poori ho gayi hai. Bihar mein hum RJD ke saath 40 seats par contest karenge."',
      reach: '12 channels coverage, 340K digital views',
      context: 'INC trying to establish relevance in Bihar. Seat sharing numbers unofficial — BJP needs to monitor if Left also joins this agreement.',
      status: 'watch',
      time: '3 days ago',
      severity: 'medium'
    },
    {
      id: 4,
      who: 'Tejashwi Yadav',
      party: 'RJD',
      where: 'Muzaffarpur, Vaishali (Multiple)',
      event: 'Flood Relief Visit + Press Meet',
      issue: 'Flood Management Failure',
      statement: '"CM sahab toh Patna mein baithke baat kar rahe hain, hum logon ke beech hain. NDA sarkar fail ho gayi hai flood mein."',
      reach: '45,000 affected area coverage, regional TV top story',
      context: 'Tejashwi using flood visit for political capital. Muzaffarpur & Vaishali affected — 8 districts on alert. BJP counter: NDRF deployed 48hrs before flood.',
      status: 'developing',
      time: '4 days ago',
      severity: 'high'
    },
    {
      id: 5,
      who: 'CPI(M) State Secretary',
      party: 'Left',
      where: 'Supaul & Darbhanga',
      event: 'Kisan Mahapanchayat',
      issue: 'Agricultural Crisis, MSP demands',
      statement: '"Fasal ki sahi keemat nahi milti — sarkar sirf corporates ki taraf hai. Kisan aandolan zaroori hai."',
      reach: '8,000 farmers, regional Hindi media coverage',
      context: 'Left trying to activate Kosi belt farmers. Not high national reach but local district-level concern for BJP booth management.',
      status: 'watch',
      time: '5 days ago',
      severity: 'low'
    }
  ],
  parties: [
    {
      id: 'rjd', name: 'RJD', fullName: 'Rashtriya Janata Dal',
      leader: 'Tejashwi Yadav', strength: 38, activityLevel: 'high',
      seats: 79, color: '#e63946',
      weaknesses: ['Internal family feuds', 'Jungle Raj image', 'Caste-centric appeal'],
      narratives: ['Unemployment', 'Flood mismanagement', 'Law & Order', 'Caste justice']
    },
    {
      id: 'inc', name: 'INC', fullName: 'Indian National Congress',
      leader: 'Akhilesh Singh', strength: 12, activityLevel: 'medium',
      seats: 19, color: '#4a9eff',
      weaknesses: ['Weak organisational base', 'No dominant face', 'Dependence on RJD'],
      narratives: ['INDIA Alliance', 'Constitutional threats', 'Minorities & Dalits']
    },
    {
      id: 'left', name: 'Left', fullName: 'CPI(M)/CPI',
      leader: 'Sudama Prasad', strength: 5, activityLevel: 'low',
      seats: 12, color: '#ff4d4d',
      weaknesses: ['Dwindling base', 'Limited districts', 'Low youth connect'],
      narratives: ['Workers rights', 'Anti-corporate', 'Land rights']
    }
  ],
  attackNarratives: [
    { topic: 'Unemployment', severity: 'high',   heat: 32, trend: 'up',   description: 'Youth unemployment at 21%, highest in Bihar history' },
    { topic: 'Flood Management', severity: 'high', heat: 28, trend: 'up', description: 'Poor disaster response in Kosi & Gandak belt' },
    { topic: 'Corruption', severity: 'high',     heat: 19, trend: 'stable', description: 'Shelter scam, land grab allegations against ministers' },
    { topic: 'Agricultural Crisis', severity: 'medium', heat: 15, trend: 'up', description: 'Low MSP, lack of irrigation' },
    { topic: 'Price Rise', severity: 'medium',   heat: 14, trend: 'up',   description: 'Vegetables up 45%, petrol above ₹100' },
    { topic: 'Governance', severity: 'low',      heat: 10, trend: 'down', description: 'Delayed government schemes, bureaucracy' }
  ],
  districtActivity: {
    'Patna': 'very-high', 'Gaya': 'high', 'Nalanda': 'medium',
    'Vaishali': 'high', 'Muzaffarpur': 'very-high', 'Darbhanga': 'very-high',
    'Samastipur': 'high', 'Bhagalpur': 'high', 'Purnia': 'medium',
    'Begusarai': 'low', 'Rohtas': 'medium', 'Siwan': 'low',
    'Gopalganj': 'medium', 'Saran': 'medium', 'Supaul': 'high',
    'Madhubani': 'very-high', 'Sitamarhi': 'high', 'Sheohar': 'low',
    'Motihari': 'medium', 'Bettiah': 'low', 'Kishanganj': 'high',
    'Araria': 'medium', 'Katihar': 'medium', 'Aurangabad': 'low'
  },
  weaknesses: [
    { title: 'Internal Rifts (RJD)', impact: 'high',   desc: 'Lalu-Tejashwi succession battle causing internal divisions' },
    { title: 'Leadership Instability (INC)', impact: 'high', desc: 'Frequent state president changes undermining credibility' },
    { title: 'No Development Vision', impact: 'medium', desc: 'Opposition focused on criticism, lacking governance blueprint' },
    { title: 'Anti-Muslim Framing Risk', impact: 'medium', desc: 'Too visible minority appeasement alienating swing OBC voters' },
    { title: 'RJD Jungle Raj Image', impact: 'high',   desc: 'Strong anti-incumbency still exists for RJD era 1990-2005' }
  ],
  counterStrategies: [
    { narrative: 'Address Unemployment', priority: 'red',    action: 'Launch "Bihar Rozgar Mission" — 5 lakh jobs scheme announcement' },
    { narrative: 'Dispute Flood Claims', priority: 'medium', action: 'Release flood relief data, compare with RJD era response' },
    { narrative: 'Expose RJD Scams',    priority: 'red',    action: 'Highlight Shelter Scam (RJD era) vs current clean governance' },
    { narrative: 'Caste Outreach',      priority: 'medium', action: 'Amplify EBC (Extremely Backward Classes) welfare schemes' }
  ]
};

/* ============================================================
   MOCK DATA: Issues & Grievances
   ============================================================ */

const ISSUES_DATA = [
  {
    id: 1, title: 'Flood Relief Not Reaching Victims in Supaul',
    category: 'Disaster', priority: 'urgent', status: 'open',
    district: 'Supaul', reportedBy: 'Field Agent', date: '2024-09-01',
    description: '12 villages in Supaul still without flood relief. NDRF team delayed by 3 days.',
    assignedTo: null
  },
  {
    id: 2, title: 'Road Construction Scam Allegation — Gaya',
    category: 'Corruption', priority: 'high', status: 'in-progress',
    district: 'Gaya', reportedBy: 'RTI Activist', date: '2024-08-28',
    description: 'Contractor using substandard material for 4-lane NH construction. ₹12 Cr irregularity.',
    assignedTo: 'Vijay Kumar (PWD)'
  },
  {
    id: 3, title: 'Missing OBC Scholarship — 5000+ Students Affected',
    category: 'Education', priority: 'high', status: 'open',
    district: 'Muzaffarpur', reportedBy: 'Student Union', date: '2024-08-25',
    description: 'OBC scholarship payment for FY2024 not released. 5,200 students from Muzaffarpur affected.',
    assignedTo: null
  },
  {
    id: 4, title: 'Electricity Outage — 18 hrs/day in Siwan',
    category: 'Infrastructure', priority: 'high', status: 'in-progress',
    district: 'Siwan', reportedBy: 'Karyakarta Report', date: '2024-08-20',
    description: 'Load shedding has increased to 18 hours/day in rural Siwan. BSPHCL not responding.',
    assignedTo: 'BSPHCL Dept'
  },
  {
    id: 5, title: 'Hospital Shortage of Medicines — PMCH',
    category: 'Health', priority: 'urgent', status: 'open',
    district: 'Patna', reportedBy: 'Media Report', date: '2024-09-01',
    description: 'PMCH running out of 34 essential medicines. Patients from poor background most affected.',
    assignedTo: null
  },
  {
    id: 6, title: 'Caste Violence in Nawada — Dalit Families Displaced',
    category: 'Social', priority: 'urgent', status: 'escalated',
    district: 'Nawada', reportedBy: 'Police Report', date: '2024-09-01',
    description: 'Caste-based clash in Pakri village. 12 Dalit families displaced. SP on site.',
    assignedTo: 'DM Nawada'
  },
  {
    id: 7, title: 'Water Crisis — Borewells Dry in Jehanabad',
    category: 'Infrastructure', priority: 'medium', status: 'open',
    district: 'Jehanabad', reportedBy: 'Gram Panchayat', date: '2024-08-15',
    description: 'Ground water level critically low. 35 villages facing acute water shortage.',
    assignedTo: null
  },
  {
    id: 8, title: 'Fake News Campaign Targeting BJP on Reservation',
    category: 'Media', priority: 'medium', status: 'in-progress',
    district: 'Multiple', reportedBy: 'Party IT Cell', date: '2024-08-30',
    description: 'Coordinated social media campaign spreading fake news about BJP removing reservations.',
    assignedTo: 'IT Cell'
  }
];
