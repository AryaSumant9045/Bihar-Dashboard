/* ============================================================
   MOCK DATA: Bihar Districts GeoJSON & constituency data
   ============================================================ */

const DISTRICTS_DATA = [
  { name: 'Patna',       seats: 14, bjp: 6, jdu: 4, rjd: 3, inc: 1, totalVotes: 2150000, activity: 'very-high' },
  { name: 'Nalanda',     seats: 8,  bjp: 3, jdu: 4, rjd: 1, inc: 0, totalVotes: 1100000, activity: 'medium'    },
  { name: 'Bhojpur',     seats: 6,  bjp: 4, jdu: 1, rjd: 1, inc: 0, totalVotes: 850000,  activity: 'medium'    },
  { name: 'Buxar',       seats: 4,  bjp: 3, jdu: 1, rjd: 0, inc: 0, totalVotes: 580000,  activity: 'low'       },
  { name: 'Rohtas',      seats: 7,  bjp: 4, jdu: 2, rjd: 1, inc: 0, totalVotes: 950000,  activity: 'medium'    },
  { name: 'Kaimur',      seats: 4,  bjp: 3, jdu: 1, rjd: 0, inc: 0, totalVotes: 540000,  activity: 'low'       },
  { name: 'Gaya',        seats: 10, bjp: 4, jdu: 3, rjd: 2, inc: 1, totalVotes: 1400000, activity: 'high'      },
  { name: 'Jehanabad',   seats: 3,  bjp: 1, jdu: 1, rjd: 1, inc: 0, totalVotes: 400000,  activity: 'medium'    },
  { name: 'Aurangabad',  seats: 5,  bjp: 3, jdu: 1, rjd: 1, inc: 0, totalVotes: 680000,  activity: 'medium'    },
  { name: 'Arwal',       seats: 2,  bjp: 1, jdu: 1, rjd: 0, inc: 0, totalVotes: 240000,  activity: 'low'       },
  { name: 'Nawada',      seats: 4,  bjp: 2, jdu: 1, rjd: 1, inc: 0, totalVotes: 540000,  activity: 'high'      },
  { name: 'Lakhisarai',  seats: 3,  bjp: 2, jdu: 1, rjd: 0, inc: 0, totalVotes: 350000,  activity: 'low'       },
  { name: 'Sheikhpura',  seats: 2,  bjp: 1, jdu: 0, rjd: 1, inc: 0, totalVotes: 240000,  activity: 'low'       },
  { name: 'Khagaria',    seats: 4,  bjp: 2, jdu: 1, rjd: 1, inc: 0, totalVotes: 560000,  activity: 'medium'    },
  { name: 'Munger',      seats: 6,  bjp: 2, jdu: 3, rjd: 1, inc: 0, totalVotes: 780000,  activity: 'medium'    },
  { name: 'Jamui',       seats: 4,  bjp: 2, jdu: 1, rjd: 1, inc: 0, totalVotes: 500000,  activity: 'low'       },
  { name: 'Begusarai',   seats: 7,  bjp: 3, jdu: 2, rjd: 2, inc: 0, totalVotes: 920000,  activity: 'medium'    },
  { name: 'Samastipur',  seats: 10, bjp: 3, jdu: 4, rjd: 2, inc: 1, totalVotes: 1280000, activity: 'high'      },
  { name: 'Darbhanga',   seats: 10, bjp: 3, jdu: 3, rjd: 4, inc: 0, totalVotes: 1350000, activity: 'very-high' },
  { name: 'Madhubani',   seats: 10, bjp: 3, jdu: 3, rjd: 3, inc: 1, totalVotes: 1420000, activity: 'very-high' },
  { name: 'Supaul',      seats: 6,  bjp: 2, jdu: 2, rjd: 2, inc: 0, totalVotes: 780000,  activity: 'high'      },
  { name: 'Saharsa',     seats: 5,  bjp: 2, jdu: 2, rjd: 1, inc: 0, totalVotes: 630000,  activity: 'medium'    },
  { name: 'Madhepura',   seats: 4,  bjp: 1, jdu: 1, rjd: 2, inc: 0, totalVotes: 510000,  activity: 'medium'    },
  { name: 'Vaishali',    seats: 9,  bjp: 3, jdu: 3, rjd: 3, inc: 0, totalVotes: 1180000, activity: 'high'      },
  { name: 'Muzaffarpur', seats: 11, bjp: 4, jdu: 4, rjd: 3, inc: 0, totalVotes: 1490000, activity: 'very-high' },
  { name: 'Sitamarhi',   seats: 7,  bjp: 2, jdu: 3, rjd: 2, inc: 0, totalVotes: 960000,  activity: 'high'      },
  { name: 'Sheohar',     seats: 2,  bjp: 1, jdu: 1, rjd: 0, inc: 0, totalVotes: 240000,  activity: 'low'       },
  { name: 'East Champaran', seats: 12, bjp: 5, jdu: 4, rjd: 2, inc: 1, totalVotes: 1620000, activity: 'medium' },
  { name: 'West Champaran', seats: 9, bjp: 4, jdu: 3, rjd: 2, inc: 0, totalVotes: 1200000, activity: 'medium'  },
  { name: 'Gopalganj',   seats: 7,  bjp: 3, jdu: 3, rjd: 1, inc: 0, totalVotes: 920000,  activity: 'medium'    },
  { name: 'Siwan',       seats: 8,  bjp: 3, jdu: 2, rjd: 3, inc: 0, totalVotes: 1050000, activity: 'high'      },
  { name: 'Saran',       seats: 9,  bjp: 3, jdu: 3, rjd: 2, inc: 1, totalVotes: 1180000, activity: 'medium'    },
  { name: 'Bhagalpur',   seats: 7,  bjp: 2, jdu: 2, rjd: 2, inc: 1, totalVotes: 980000,  activity: 'high'      },
  { name: 'Banka',       seats: 4,  bjp: 2, jdu: 1, rjd: 1, inc: 0, totalVotes: 510000,  activity: 'low'       },
  { name: 'Kishanganj',  seats: 4,  bjp: 1, jdu: 1, rjd: 1, inc: 1, totalVotes: 560000,  activity: 'high'      },
  { name: 'Araria',      seats: 6,  bjp: 2, jdu: 2, rjd: 1, inc: 1, totalVotes: 780000,  activity: 'medium'    },
  { name: 'Katihar',     seats: 7,  bjp: 2, jdu: 2, rjd: 2, inc: 1, totalVotes: 920000,  activity: 'medium'    },
  { name: 'Purnia',      seats: 7,  bjp: 3, jdu: 2, rjd: 2, inc: 0, totalVotes: 920000,  activity: 'medium'    }
];

const PK_DATA = {
  profile: {
    name: 'Prashant Kishor', alias: 'PK',
    org: 'Jan Suraaj', role: 'Political Strategist',
    threat: 'high', currentFocus: 'Bihar 2025 Elections',
    baseLocation: 'Patna', lastSeen: '2 days ago in Delhi'
  },
  recentVisits: [
    { district: 'Patna',       date: '2024-09-01', purpose: 'INC Alliance Meeting',        lat: 25.5941, lng: 85.1376 },
    { district: 'Gaya',        date: '2024-08-28', purpose: 'Jan Suraaj Yatra',            lat: 24.7914, lng: 84.9994 },
    { district: 'Darbhanga',   date: '2024-08-25', purpose: 'Flood Relief Survey',         lat: 26.1542, lng: 85.8918 },
    { district: 'Muzaffarpur', date: '2024-08-22', purpose: 'Community Mobilisation',      lat: 26.1197, lng: 85.3910 },
    { district: 'Bhagalpur',   date: '2024-08-18', purpose: 'OBC Community Meeting',      lat: 25.2425, lng: 86.9842 },
    { district: 'Delhi',       date: '2024-09-01', purpose: 'Congress Leadership Meeting', lat: 28.6139, lng: 77.2090 }
  ],
  activities: [
    { type: 'meeting',  title: 'INC Top Leadership Meeting — Delhi',     time: '2 days ago', summary: 'Seat sharing formula for Bihar discussed. 3rd consecutive meeting.' },
    { type: 'event',    title: 'Jan Suraaj Padyatra — Gaya District',   time: '4 days ago', summary: 'Covered 45km on foot. Addressed ~8,000 people.' },
    { type: 'statement',title: '"NDA will lose 60+ seats" — Media Bite', time: '5 days ago', summary: 'Claimed insider polling data shows NDA at 120-130 seats.' },
    { type: 'social',   title: '3 Viral Tweets attacking Nitish Kumar',  time: '6 days ago', summary: 'Combined 800K impressions. #Nitish_Jawab_Do trending.' },
    { type: 'event',    title: 'Flood Victims Survey — Supaul/Madhubani', time: '1 week ago', summary: 'Deployed 200 Jan Suraaj volunteers to collect flood damage data.' },
  ],
  strategyCards: [
    { title: 'Jan Suraaj Model',    focus: 'high',   desc: 'Building parallel political party using grassroots surveys of 5 Cr families' },
    { title: 'Alliance Brokering',  focus: 'high',   desc: 'Negotiating INC seat numbers, INDIA alliance Bihar coordinator role' },
    { title: 'OBC Vote Capture',    focus: 'medium', desc: 'Targeting Kurmi, Koeri, and EBC blocks — PK's natural constituency' },
    { title: 'Digital Dominance',   focus: 'medium', desc: 'Jan Suraaj has 2M+ YouTube subscribers, active WhatsApp network' },
    { title: 'Anti-Incumbency Fuel', focus: 'high',  desc: 'Systematically amplifying flood, employment, governance failures' }
  ],
  sentimentData: {
    labels: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
    threatIndex: [42, 48, 55, 60, 68, 74]
  }
};

const MEDIA_DATA = {
  platforms: ['Twitter', 'Facebook', 'YouTube', 'TV', 'Print'],
  trending: [
    { tag: '#Tejashwi4Bihar',    volume: 2100000, platform: 'Twitter', sentiment: 'mixed',    change: '+45%' },
    { tag: '#Nitish_Jawab_Do',  volume: 820000,  platform: 'Twitter', sentiment: 'negative', change: '+120%' },
    { tag: '#BiharFloods2024',   volume: 1450000, platform: 'Twitter', sentiment: 'negative', change: '+200%' },
    { tag: '#Mission2025BJP',    volume: 640000,  platform: 'Facebook',sentiment: 'positive', change: '+18%' },
    { tag: '#JanSuraaj',         volume: 980000,  platform: 'YouTube', sentiment: 'mixed',    change: '+65%' },
    { tag: '#BiharVikas',        volume: 380000,  platform: 'Facebook',sentiment: 'positive', change: '+12%' },
    { tag: '#NDA_Bihar_Strong',  volume: 290000,  platform: 'Twitter', sentiment: 'positive', change: '+8%'  },
    { tag: '#BiharRozgar',       volume: 560000,  platform: 'Twitter', sentiment: 'negative', change: '+95%' }
  ],
  sentiment: { positive: 28, neutral: 35, negative: 37 },
  tvCoverage: [
    { channel: 'TV9 Bihar',      hours: 4.5, tone: 'neutral'  },
    { channel: 'Zee Bihar',      hours: 3.8, tone: 'positive' },
    { channel: 'News18 Bihar',   hours: 3.2, tone: 'positive' },
    { channel: 'ABP Bihar',      hours: 5.1, tone: 'neutral'  },
    { channel: 'NDTV Bihar',     hours: 2.8, tone: 'negative' },
    { channel: 'Aaj Tak Bihar',  hours: 4.0, tone: 'neutral'  }
  ],
  weeklyMentions: {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    bjp:  [12400, 14200, 11800, 15600, 18200, 21000, 19500],
    rjd:  [18600, 21000, 16400, 23800, 28400, 32000, 29800],
    pk:   [8200,  9400,  7600,  11200, 14600, 17800, 15200]
  }
};

const SPEECHES_DATA = [
  {
    id: 1, speaker: 'Tejashwi Yadav', party: 'RJD', date: '2024-09-01',
    title: 'Patna Rally — Rozgar Andolan Launch',
    duration: '42 min', venue: 'Gandhi Maidan, Patna',
    topics: ['Unemployment', 'Youth', 'Anti-incumbency', 'NDA Failure'],
    sentiment: 'negative', intensity: 87,
    keyPromises: ['10 lakh jobs if elected', 'Reverse privatisation', 'Caste census'],
    keyQuotes: [
      '"Bihar ke yuvaon ko naukri chahiye, Nitish-ji ki "vikas" nahi!"',
      '"NDA ke 20 saal mein ek bhi sarkaari naukri nahi nikli!"'
    ],
    summary: 'Aggressive anti-incumbency speech focusing on unemployment, targeting both NDA partners. High crowd energy, mass appeal narrative.'
  },
  {
    id: 2, speaker: 'Nitish Kumar', party: 'JDU', date: '2024-08-31',
    title: 'Muzaffarpur Highway Inauguration Speech',
    duration: '28 min', venue: 'Muzaffarpur, Bihar',
    topics: ['Infrastructure', 'Development', 'Governance', 'NDA Alliance'],
    sentiment: 'positive', intensity: 72,
    keyPromises: ['100 new roads by 2025', '₹50,000 Cr infra investment'],
    keyQuotes: [
      '"Bihar ab vikas ki raah par hai, koi roka nahi sakta."',
      '"Hamari sarkar ne 20 saal mein Bihar badal diya."'
    ],
    summary: 'Development-focused speech highlighting infrastructure achievements. Calm, measured tone. Defensive posture on unemployment issue.'
  },
  {
    id: 3, speaker: 'Prashant Kishor', party: 'Jan Suraaj', date: '2024-08-28',
    title: 'Gaya Padyatra Address',
    duration: '55 min', venue: 'Gaya, Bihar',
    topics: ['Jan Suraaj Model', 'Governance Reform', 'Education', 'Health'],
    sentiment: 'mixed', intensity: 78,
    keyPromises: ['Direct democracy model', 'Peoples audit of schemes'],
    keyQuotes: [
      '"Hum BJP se bhi naraaz hain, RJD se bhi — isliye Jan Suraaj."',
      '"Bihar ke log smart hain, inhe leaders ki zaroorat nahi, system ki zaroorat hai."'
    ],
    summary: 'Long motivational speech positioning Jan Suraaj as alternative to existing parties. Heavy on rhetoric, light on specifics.'
  }
];
