/* ============================================================
   MOCK DATA: Leaders
   ============================================================ */
const LEADERS_DATA = [
  {
    id: 1, name: 'Nitish Kumar', role: 'Chief Minister', party: 'JDU',
    constituency: 'Nalanda', district: 'Nalanda',
    influence: 94, sentiment: 'positive',
    lastActivity: 'Muzaffarpur Highway Inauguration',
    lastActivityTime: '3h ago', activityType: 'event',
    phone: '', image: null, initials: 'NK',
    recentActivities: [
      { type: 'event', title: 'Highway Inauguration, Muzaffarpur', time: '3h ago' },
      { type: 'speech', title: 'Vikas Yatra Address — Patna', time: '1 day ago' },
      { type: 'social', title: 'Tweet on Flood Relief Measures', time: '2 days ago' },
    ]
  },
  {
    id: 2, name: 'Samrat Choudhary', role: 'Deputy Chief Minister', party: 'BJP',
    constituency: 'Bihari', district: 'Patna',
    influence: 82, sentiment: 'positive',
    lastActivity: 'BJP State Executive Meeting',
    lastActivityTime: '5h ago', activityType: 'event',
    phone: '', image: null, initials: 'SC',
    recentActivities: [
      { type: 'event', title: 'BJP State Executive Meeting', time: '5h ago' },
      { type: 'speech', title: 'Press Conf on Law & Order', time: '2 days ago' },
    ]
  },
  {
    id: 3, name: 'Tejashwi Yadav', role: 'Leader of Opposition', party: 'RJD',
    constituency: 'Raghopur', district: 'Vaishali',
    influence: 91, sentiment: 'negative',
    lastActivity: 'Patna Rally Announcement',
    lastActivityTime: '30 min ago', activityType: 'speech',
    phone: '', image: null, initials: 'TY',
    recentActivities: [
      { type: 'speech', title: 'Patna Rally Announcement Speech', time: '30 min ago' },
      { type: 'social', title: '5 tweets targeting CM — #Nitish_Chhodo', time: '2h ago' },
      { type: 'event', title: 'District Tour — Darbhanga', time: '1 day ago' },
    ]
  },
  {
    id: 4, name: 'Vijay Kumar Sinha', role: 'Speaker, Bihar Assembly', party: 'BJP',
    constituency: 'Lakhisarai', district: 'Lakhisarai',
    influence: 75, sentiment: 'neutral',
    lastActivity: 'Assembly Session Announcement',
    lastActivityTime: '1 day ago', activityType: 'statement',
    phone: '', image: null, initials: 'VS',
    recentActivities: [
      { type: 'statement', title: 'Winter Session Dates Announced', time: '1 day ago' },
    ]
  },
  {
    id: 5, name: 'Lalan Singh', role: 'JDU National President', party: 'JDU',
    constituency: 'Munger', district: 'Munger',
    influence: 78, sentiment: 'positive',
    lastActivity: 'National Council Meeting',
    lastActivityTime: '2 days ago', activityType: 'event',
    phone: '', image: null, initials: 'LS',
    recentActivities: [
      { type: 'event', title: 'JDU National Council, Delhi', time: '2 days ago' },
    ]
  },
  {
    id: 6, name: 'Abdul Bari Siddiqui', role: 'Senior RJD Leader', party: 'RJD',
    constituency: 'Fatuha', district: 'Patna',
    influence: 68, sentiment: 'negative',
    lastActivity: 'Flood Victims Protest',
    lastActivityTime: '6h ago', activityType: 'event',
    phone: '', image: null, initials: 'AB',
    recentActivities: [
      { type: 'event', title: 'Flood Victims Protest, Patna', time: '6h ago' },
    ]
  },
  {
    id: 7, name: 'Ashok Choudhary', role: 'Cabinet Minister', party: 'JDU',
    constituency: 'Chandanpura', district: 'Patna',
    influence: 70, sentiment: 'positive',
    lastActivity: 'Education Dept Review',
    lastActivityTime: '1 day ago', activityType: 'event',
    phone: '', image: null, initials: 'AC',
    recentActivities: [
      { type: 'event', title: 'Education Dept Review Meeting', time: '1 day ago' },
    ]
  },
  {
    id: 8, name: 'Misa Bharti', role: 'MP, Patliputra', party: 'RJD',
    constituency: 'Patliputra', district: 'Patna',
    influence: 72, sentiment: 'negative',
    lastActivity: 'Parliament Speech on Bihar Floods',
    lastActivityTime: '3 days ago', activityType: 'speech',
    phone: '', image: null, initials: 'MB',
    recentActivities: [
      { type: 'speech', title: 'Parliament: Bihar Flood Crisis', time: '3 days ago' },
    ]
  }
];
