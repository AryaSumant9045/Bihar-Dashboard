/* ============================================================
   BIHAR COMMAND CENTER — i18n
   Default language: Hindi. Floating toggle switches to the
   original (English) UI text. Persisted in localStorage.
   Works by translating DOM text nodes via dictionary + patterns,
   so it covers static HTML and JS-rendered content alike.
   ============================================================ */

(function () {
  'use strict';

  // [english, hindi] — matched on whitespace-normalised text nodes
  const PAIRS = [
    // ── Sidebar nav / sections / roles ──
    ['President Home', 'प्रेज़िडेंट होम'],
    ['🏠 President Home', '🏠 प्रेज़िडेंट होम'],
    ['War Room', 'वॉर रूम'],
    ['🚨 War Room', '🚨 वॉर रूम'],
    ['Bihar Map', 'बिहार मैप'],
    ['🗺️ Bihar Map', '🗺️ बिहार मैप'],
    ['Leadership', 'लीडरशिप'],
    ['👥 Leadership', '👥 लीडरशिप'],
    ['Opposition Live', 'अपोज़िशन लाइव'],
    ['🔍 Opposition Live', '🔍 अपोज़िशन लाइव'],
    ['PK Tracker', 'पीके ट्रैकर'],
    ['🎯 PK Tracker', '🎯 पीके ट्रैकर'],
    ['Media & Social', 'मीडिया एंड सोशल'],
    ['📱 Media & Social', '📱 मीडिया एंड सोशल'],
    ['Speech Intel', 'स्पीच इंटेल'],
    ['🎙️ Speech Intel', '🎙️ स्पीच इंटेल'],
    ['Issues', 'इश्यूज़'],
    ['📋 Issues', '📋 इश्यूज़'],
    ['Command', 'कमांड'],
    ['Intelligence', 'इंटेलिजेंस'],
    ['Analytics', 'एनालिटिक्स'],
    ['President View', 'प्रेज़िडेंट व्यू'],
    ['President', 'प्रेज़िडेंट'],
    ['Admin', 'एडमिन'],
    ['District', 'डिस्ट्रिक्ट'],
    ['District Officer', 'डिस्ट्रिक्ट अफ़सर'],
    ['Comms Team', 'कॉम्स टीम'],
    ['Comms Officer', 'कॉम्स अफ़सर'],
    ['Read-Only', 'रीड-ओनली'],
    ['Leader', 'नेता'],
    ['IT Cell', 'आईटी सेल'],
    ['IT Officer', 'आईटी अफ़सर'],

    // ── Common chrome ──
    ['LIVE', 'लाइव'],
    ['Loading…', 'लोड हो रहा है…'],
    ['Loading...', 'लोड हो रहा है...'],
    ['Loading Command Center…', 'कमांड सेंटर लोड हो रहा है…'],
    ['Read More ↓', 'और पढ़ें ↓'],
    ['Source ↗', 'सोर्स ↗'],
    ['▶ Watch', '▶ देखें'],
    ['↗ Read', '↗ पढ़ें'],
    ['News items', 'न्यूज़ आइटम्स'],
    ['↻ Refresh', '↻ रीफ़्रेश'],
    ['Refresh', 'रीफ़्रेश'],
    ['No more posts', 'कोई और पोस्ट नहीं'],
    ['Error loading more', 'लोड करने में त्रुटि'],
    ['Loading...', 'लोड हो रहा है...'],

    // ── Page titles & subtitles ──
    ['🎯 Prashant Kishor Tracker', '🎯 प्रशांत किशोर ट्रैकर'],
    ['Real-time intelligence on PK’s movements, strategy & alliances', 'पीके की गतिविधियों, रणनीति और गठबंधनों पर रियल-टाइम इंटेलिजेंस'],
    ["Real-time intelligence on PK's movements, strategy & alliances", 'पीके की गतिविधियों, रणनीति और गठबंधनों पर रियल-टाइम इंटेलिजेंस'],
    ['🔴 MONITORING ACTIVE', '🔴 मॉनिटरिंग सक्रिय'],
    ['📄 Brief', '📄 ब्रीफ'],
    ['👥 Leadership Tracker', '👥 लीडरशिप ट्रैकर'],
    ['Monitor key political leaders, influence scores & activity', 'प्रमुख राजनीतिक नेताओं, प्रभाव स्कोर और गतिविधि की निगरानी करें'],
    ['🗺 Bihar Political Map', '🗺 बिहार राजनीतिक मानचित्र'],
    ['All Bihar districts', 'सभी बिहार ज़िले'],
    ['🗺 Bihar District Intelligence Map', '🗺 बिहार ज़िला इंटेलिजेंस मैप'],
    ['Live district intelligence · seat context · alerts · headlines', 'लाइव ज़िला इंटेलिजेंस · सीट संदर्भ · अलर्ट · हेडलाइन्स'],
    ['Real-time political intelligence — Prioritised alerts for immediate action', 'रियल-टाइम राजनीतिक इंटेलिजेंस — तुरंत कार्रवाई के लिए प्राथमिकता वाले अलर्ट'],
    ['📱 Media & Social Pulse', '📱 मीडिया एंड सोशल पल्स'],
    ['Real-time social media & news coverage monitoring', 'रियल-टाइम सोशल मीडिया और न्यूज़ कवरेज मॉनिटरिंग'],
    ['🎙 Speech Intelligence Engine', '🎙 स्पीच इंटेलिजेंस इंजन'],
    ['Pre-event briefing builder — Select context to generate intelligence brief', 'प्री-इवेंट ब्रीफ़िंग बिल्डर — इंटेलिजेंस ब्रीफ जनरेट करने के लिए संदर्भ चुनें'],
    ['📋 Issues & Grievances', '📋 इश्यू और शिकायतें'],
    ['Track, assign & resolve political and civic issues', 'राजनीतिक और नागरिक मुद्दों को ट्रैक, असाइन और हल करें'],
    ['Live news + AI intelligence from YouTube & RSS — auto-refreshes every 90s', 'YouTube और RSS से लाइव खबरें + AI इंटेलिजेंस — हर 90 सेकंड में ऑटो-रिफ़्रेश'],

    // ── Opposition page ──
    ['⚡ Opposition AI Intelligence Summary', '⚡ अपोज़िशन AI इंटेलिजेंस समरी'],
    ['Auto-generated from latest ~150+ headlines · AI analysis', 'नवीनतम ~150+ हेडलाइन्स से ऑटो-जनरेटेड · AI विश्लेषण'],
    ['Loading opposition intelligence summary…', 'अपोज़िशन इंटेलिजेंस समरी लोड हो रही है…'],
    ['Loading intelligence summary…', 'इंटेलिजेंस समरी लोड हो रही है…'],
    ['📡 Jan Suraaj — Live News', '📡 जन सुराज — लाइव न्यूज़'],
    ['🟠 Jan Suraaj — Live News', '🟠 जन सुराज — लाइव न्यूज़'],
    ['🔵 INC Bihar — Live News', '🔵 कांग्रेस बिहार — लाइव न्यूज़'],
    ['🔴 RJD — Live News', '🔴 आरजेडी — लाइव न्यूज़'],
    ['🟣 Tejashwi — Live News', '🟣 तेजस्वी — लाइव न्यूज़'],
    ['YouTube videos + RSS feeds · Latest first', 'YouTube वीडियो + RSS फ़ीड · नवीनतम पहले'],
    ['Loading Jan Suraaj news…', 'जन सुराज न्यूज़ लोड हो रही है…'],
    ['Loading INC news…', 'INC न्यूज़ लोड हो रही है…'],
    ['Loading RJD news…', 'RJD न्यूज़ लोड हो रही है…'],
    ['Loading Tejashwi news…', 'तेजस्वी न्यूज़ लोड हो रही है…'],
    ['🟠 Jan Suraaj', '🟠 जन सुराज'],
    ['🔵 INC', '🔵 कांग्रेस'],
    ['🔵 INC Bihar', '🔵 कांग्रेस बिहार'],
    ['🔴 RJD', '🔴 आरजेडी'],
    ['🟣 Tejashwi', '🟣 तेजस्वी'],
    ['Jan Suraaj', 'जन सुराज'],
    ['INC Bihar', 'कांग्रेस बिहार'],
    ['RJD', 'आरजेडी'],
    ['Tejashwi', 'तेजस्वी'],
    ['𝕏 X Social Pulse', '𝕏 सोशल पल्स'],
    ['𝕏 X Social Pulse — 🟠 Jan Suraaj', '𝕏 सोशल पल्स — 🟠 जन सुराज'],
    ['𝕏 X Social Pulse — 🔵 INC Bihar', '𝕏 सोशल पल्स — 🔵 कांग्रेस बिहार'],
    ['𝕏 X Social Pulse — 🔴 RJD', '𝕏 सोशल पल्स — 🔴 आरजेडी'],
    ['𝕏 X Social Pulse — 🟣 Tejashwi', '𝕏 सोशल पल्स — 🟣 तेजस्वी'],
    ['Latest posts from official public accounts', 'आधिकारिक सार्वजनिक खातों से नवीनतम पोस्ट'],
    ['Loading X Social Pulse...', 'एक्स सोशल पल्स लोड हो रहा है...'],
    ['No recent posts found.', 'कोई हालिया पोस्ट नहीं मिली।'],
    ['📊 Overall Situation', '📊 समग्र स्थिति'],
    ['🛡 Counter Strategy', '🛡 काउंटर रणनीति'],
    ['🏛️ Party-wise Activity', '🏛️ पार्टी-वार गतिविधि'],
    ['✅ BJP Advantage (Opposition Weakness)', '✅ BJP लाभ (विपक्ष की कमज़ोरी)'],
    ['No AI summary yet.', 'अभी कोई AI समरी नहीं।'],
    ['Not generated', 'जनरेट नहीं हुआ'],
    ['headlines analysed', 'हेडलाइन्स विश्लेषित'],
    ['📋 All', '📋 सभी'],
    ['🔴 Critical', '🔴 क्रिटिकल'],
    ['🟠 High', '🟠 हाई'],
    ['🟢 Normal', '🟢 सामान्य'],
    ["Latest X posts from the selected party's official accounts", 'चुनी गई पार्टी के आधिकारिक खातों से नवीनतम एक्स पोस्ट'],
    ['Refreshing X Social Pulse...', 'एक्स सोशल पल्स रीफ्रेश हो रहा है...'],

    // ── Bihar districts ──
    ['Patna', 'पटना'],
    ['Bhagalpur', 'भागलपुर'],
    ['Muzaffarpur', 'मुज़फ़्फ़रपुर'],
    ['Ara', 'आरा'],
    ['Begusarai', 'बेगूसराय'],
    ['Biharsharif', 'बिहार शरीफ़'],
    ['Buxar', 'बक्सर'],
    ['Chapra', 'छपरा'],
    ['Gopalganj', 'गोपालगंज'],
    ['Hajipur', 'हाजीपुर'],
    ['Jahanabad', 'जहानाबाद'],
    ['Siwan', 'सीवान'],
    ['Gaya', 'गया'],
    ['Aurangabad', 'औरंगाबाद'],
    ['Bhabua', 'भभुआ'],
    ['Nawada', 'नवादा'],
    ['Sasaram', 'सासाराम'],
    ['Banka', 'बांका'],
    ['Araria', 'अररिया'],
    ['Katihar', 'कटिहार'],
    ['Khagaria', 'खगड़िया'],
    ['Kishanganj', 'किशनगंज'],
    ['Madhepura', 'मधेपुरा'],
    ['Munger', 'मुंगेर'],
    ['Purnia', 'पूर्णिया'],
    ['Saharsa', 'सहरसा'],
    ['Lakhisarai', 'लखीसराय'],
    ['Jamui', 'जमुई'],
    ['Supaul', 'सुपौल'],
    ['Darbhanga', 'दरभंगा'],
    ['Madhubani', 'मधुबनी'],
    ['Bagaha', 'बगहा'],
    ['Bettiah', 'बेतिया'],
    ['Motihari', 'मोतिहारी'],
    ['Samastipur', 'समस्तीपुर'],
    ['Sitamarhi', 'सीतामढ़ी'],
    ['🌐 All Sources', '🌐 सभी स्रोत'],

    // ── Jan Suraaj official (jansuraaj.org) + District News ──
    ['🟠 Jan Suraaj Official — jansuraaj.org', '🟠 जन सुराज आधिकारिक — jansuraaj.org'],
    ["Press releases & interviews from Jan Suraaj's official website", 'जन सुराज की आधिकारिक वेबसाइट से प्रेस रिलीज़ और इंटरव्यू'],
    ['🎙 Interviews / Speeches', '🎙 इंटरव्यू / भाषण'],
    ['Loading official updates...', 'आधिकारिक अपडेट लोड हो रहे हैं...'],
    ['No official press releases available right now.', 'अभी कोई आधिकारिक प्रेस रिलीज़ उपलब्ध नहीं है।'],
    ['No interviews available right now.', 'अभी कोई इंटरव्यू उपलब्ध नहीं है।'],
    ['Jan Suraaj official site is temporarily unavailable.', 'जन सुराज की आधिकारिक साइट अस्थायी रूप से अनुपलब्ध है।'],
    ['📰 District News', '📰 ज़िला समाचार'],
    ['Latest news from the selected district — auto-saved every 24 hours', 'चयनित ज़िले की ताज़ा खबरें — हर 24 घंटे में स्वतः सहेजी जाती हैं'],
    ['Loading district news…', 'ज़िला समाचार लोड हो रहे हैं…'],
    ['No district news saved yet.', 'अभी कोई ज़िला समाचार सहेजी नहीं गई है।'],
    ['District news unavailable right now.', 'ज़िला समाचार अभी अनुपलब्ध है।'],

    // ── PK Tracker page ──
    ['📍 Movement Map', '📍 मूवमेंट मैप'],
    ['Recent district visits', 'हालिया ज़िला दौरे'],
    ['📅 Activity Log', '📅 एक्टिविटी लॉग'],
    ['🧠 Strategy Cards', '🧠 स्ट्रैटेजी कार्ड्स'],
    ['📱 Social Monitor', '📱 सोशल मॉनिटर'],
    ['⚡ Threat Index', '⚡ थ्रेट इंडेक्स'],
    ['🔗 Alliance Network', '🔗 अलायंस नेटवर्क'],
    ['📊 Jan Suraaj Reach', '📊 जन सुराज रीच'],
    ['📸 Instagram Feed', '📸 इंस्टाग्राम फ़ीड'],
    ["Latest updates from Jan Suraaj's Instagram", 'जन सुराज के इंस्टाग्राम से नवीनतम अपडेट'],
    ['📡 Facebook RSS Feed', '📡 फेसबुक RSS फ़ीड'],
    ['Latest Jan Suraaj updates from FetchRSS', 'FetchRSS से नवीनतम जन सुराज अपडेट'],
    ['Loading Facebook updates...', 'फेसबुक अपडेट लोड हो रहे हैं...'],
    ['Loading X updates...', 'एक्स अपडेट लोड हो रहे हैं...'],
    ['𝕏 Jan Suraaj X Feed', '𝕏 जन सुराज एक्स फ़ीड'],
    ['Latest posts from @jansuraajonline via RSSHub', 'RSSHub से @jansuraajonline की नवीनतम पोस्ट'],
    ['No X posts available yet.', 'अभी कोई एक्स पोस्ट उपलब्ध नहीं।'],
    ['Failed to load X feed.', 'एक्स फ़ीड लोड करने में विफल।'],
    ['Threat Level', 'थ्रेट लेवल'],
    ['Active threat', 'सक्रिय ख़तरा'],

    // ── War Room / Home / other cards ──
    ['🚨 Breaking News & War Room', '🚨 ब्रेकिंग न्यूज़ और वॉर रूम'],
    ['🚨 Top 3 Requiring Attention', '🚨 ध्यान देने योग्य टॉप 3'],
    ['⚡ Alert Summary', '⚡ अलर्ट समरी'],
    ['⚡ Quick Actions', '⚡ क्विक एक्शन्स'],
    ['⚡ Live Feed', '⚡ लाइव फ़ीड'],
    ['⚡ Avg Intensity', '⚡ औसत तीव्रता'],
    ['📊 Today AI Intelligence Insights', '📊 आज के AI इंटेलिजेंस इनसाइट्स'],
    ['📰 District-Wise Local News Updates', '📰 ज़िला-वार स्थानीय न्यूज़ अपडेट'],
    ['📋 All-district live breakdown', '📋 सभी ज़िलों का लाइव ब्रेकडाउन'],
    ['🗺 Where Activity Is Happening', '🗺 गतिविधि कहाँ हो रही है'],
    ['📈 What Is Trending', '📈 क्या ट्रेंड कर रहा है'],
    ['🔥 Trending Now', '🔥 अभी ट्रेंडिंग'],
    ['📊 Platform Share', '📊 प्लेटफ़ॉर्म शेयर'],
    ['📈 Weekly Mentions Trend', '📈 साप्ताहिक मेंशन ट्रेंड'],
    ['📊 Total Mentions', '📊 कुल मेंशन'],
    ['😊 Sentiment Analysis', '😊 सेंटिमेंट एनालिसिस'],
    ['😠 Negative Sent.', '😠 नेगेटिव सेंट.'],
    ['📺 TV Coverage', '📺 टीवी कवरेज'],
    ['📺 TV Channel Coverage', '📺 टीवी चैनल कवरेज'],
    ['📰 Live district news', '📰 लाइव ज़िला न्यूज़'],
    ['🗺 Districts monitored', '🗺 मॉनिटर किए गए ज़िले'],
    ['🔴 Critical districts', '🔴 क्रिटिकल ज़िले'],
    ['🟡 Watch districts', '🟡 वॉच ज़िले'],
    ['🟢 Routine', '🟢 रूटीन'],
    ['🟠 Developing', '🟠 डेवलपिंग'],
    ['🟠 In Progress', '🟠 प्रगति में'],
    ['🔴 Urgent', '🔴 अर्जेंट'],
    ['🔴 Critical', '🔴 क्रिटिकल'],
    ['🟡 Watch', '🟡 वॉच'],
    ['🟢 Open', '🟢 खुला'],
    ['📋 Promises Tracked', '📋 ट्रैक किए गए वादे'],
    ['📋 Promises', '📋 वादे'],
    ['📋 Total Issues', '📋 कुल इश्यू'],
    ['🎙 Total Speeches', '🎙 कुल स्पीच'],
    ['🎙 Speeches Logged', '🎙 लॉग की गई स्पीच'],
    ['🍩 Party seat share', '🍩 पार्टी सीट शेयर'],
    ['🏛️ Organisation Activity', '🏛️ संगठन गतिविधि'],
    ['📚 Speech Library', '📚 स्पीच लाइब्रेरी'],
    ['📚 Past Speeches', '📚 पिछली स्पीच'],
    ['Across all speeches', 'सभी स्पीच में'],
    ['📊 Issues by Category', '📊 श्रेणी अनुसार इश्यू'],
    ['📋 Top Open Issues', '📋 टॉप खुले इश्यू'],
    ['📋 Review Issues', '📋 इश्यू समीक्षा'],
    ['📅 Activity Timeline', '📅 एक्टिविटी टाइमलाइन'],
    ['Political Calendar', 'पॉलिटिकल कैलेंडर'],
    ['30-day command calendar', '30-दिन कमांड कैलेंडर'],
    ['7-day command calendar', '7-दिन कमांड कैलेंडर'],
    ['📍 District intelligence', '📍 ज़िला इंटेलिजेंस'],
    ['📍 By District', '📍 ज़िले अनुसार'],
    ['Preparing priority scan…', 'प्रायोरिटी स्कैन तैयार हो रहा है…'],
    ['EXECUTIVE SCAN', 'एग्ज़ीक्यूटिव स्कैन'],
    ['Early signals', 'अर्ली सिग्नल्स'],
    ['Active early signals', 'सक्रिय अरली सिग्नल्स'],
    ['Across 6 channels', '6 चैनलों पर'],
    ['Last 30 days', 'पिछले 30 दिन'],
    ['All categories', 'सभी श्रेणियाँ'],
    ['Bihar (All)', 'बिहार (सभी)'],
    ['Bihar (State Level)', 'बिहार (राज्य स्तर)'],
    ['District 360°', 'ज़िला 360°'],
    ['Normal activity', 'सामान्य गतिविधि'],
    ['Gaining momentum', 'गति पकड़ रहा'],

    // ── Buttons ─
    ['View All →', 'सभी देखें →'],
    ['Details →', 'विवरण →'],
    ['Full Intel →', 'पूर्ण इंटेल →'],
    ['Leaders →', 'नेता →'],
    ['Map →', 'मैप →'],
    ['Prepare →', 'तैयार करें →'],
    ['+ Add Issue', '+ इश्यू जोड़ें'],
    ['↓ Export', '↓ एक्सपोर्ट'],
    ['📤 Export', '📤 एक्सपोर्ट'],
    ['📋 Send Morning Brief', '📋 मॉर्निंग ब्रीफ भेजें'],
    ['🎙 Generate Speech Brief', '🎙 स्पीच ब्रीफ जनरेट करें'],
    ['🎙 Speech / Comms Inputs', '🎙 स्पीच / कॉम्स इनपुट'],
    ['🎙 Speech Brief', '🎙 स्पीच ब्रीफ'],
    ['🔴 Escalate All Critical', '🔴 सभी क्रिटिकल एस्केलेट करें'],
    ['🚨 Open War Room', '🚨 वॉर रूम खोलें'],
    ['🔍 Open Opposition Intel', '🔍 अपोज़िशन इंटेल खोलें'],
    ['🎯 Check PK Activity', '🎯 पीके गतिविधि जाँचें'],
    ['🎯 PK Watch', '🎯 पीके वॉच'],
    ['▶️ See YouTube News', '▶️ YouTube न्यूज़ देखें'],

    // ── Status tags ──
    ['Open', 'खुला'],
    ['Tracked', 'ट्रैक्ड'],
    ['Escalated', 'एस्केलेटेड'],
    ['In Progress', 'प्रगति में'],
    ['Being handled', 'हैंडल हो रहा है'],
    ['Awaiting assignment', 'असाइनमेंट प्रतीक्षित'],
    ['Critical', 'क्रिटिकल'],
    ['High', 'हाई'],
    ['Medium', 'मीडियम'],
    ['Low', 'लो'],
    ['Urgent', 'अर्जेंट'],
    ['Routine', 'रूटीन'],
    ['Developing', 'डेवलपिंग'],
    ['Watch', 'वॉच'],
    ['Positive', 'पॉज़िटिव'],
    ['Negative', 'नेगेटिव'],
    ['Neutral', 'न्यूट्रल'],

    // ── Login page ──
    ['Bihar Command Center', 'बिहार कमांड सेंटर'],
    ['Bihar Command Center — Access Portal', 'बिहार कमांड सेंटर — एक्सेस पोर्टल'],
    ['BJP Bihar — Political Intelligence Dashboard', 'BJP बिहार — पॉलिटिकल इंटेलिजेंस डैशबोर्ड'],
    ['Full Access', 'फुल एक्सेस'],
    ['Breaking news, alerts, media pulse. Real-time monitoring.', 'ब्रेकिंग न्यूज़, अलर्ट, मीडिया पल्स। रियल-टाइम मॉनिटरिंग।'],
    ['Full dashboard access. Executive scan, all modules, action centre.', 'पूर्ण डैशबोर्ड एक्सेस। एग्ज़ीक्यूटिव स्कैन, सभी मॉड्यूल, एक्शन सेंटर।'],
    ['Media pulse, social monitoring, trending topics and counter-narrative tools.', 'मीडिया पल्स, सोशल मॉनिटरिंग, ट्रेंडिंग विषय और काउटर-नैरेटिव टूल्स।'],
    ['Speech intelligence, media briefs, talking points and communication prep.', 'स्पीच इंटेलिजेंस, मीडिया ब्रीफ़्स, टॉकिंग पॉइंट्स और कम्युनिकेशन तैयारी।'],
    ['Submit and view district-level issues, activities and field reports.', 'ज़िला-स्तरीय इश्यू, गतिविधियाँ और फ़ील्ड रिपोर्ट जमा करें व देखें।'],
    ["Track Prashant Kishor's campaigns, movements, and narratives.", 'प्रशांत किशोर की मुहिमों, गतिविधियों और नैरेटिव को ट्रैक करें।'],
    ['Opposition Intel', 'अपोज़िशन इंटेल'],
    ['Monitor opposition activities, speeches, and strategies.', 'अपोज़िशन गतिविधियों, भाषणों और रणनीतियों की निगरानी करें।'],
    ['Interactive political map of Bihar constituencies.', 'बिहार निर्वाचन क्षेत्रों का इंटरैक्टिव राजनीतिक मानचित्र।'],
    ['Prashant Kishor Tracker', 'प्रशांत किशोर ट्रैकर'],
    ['Communication', 'कम्युनिकेशन'],
    ['Social', 'सोशल'],
    ['Analysis', 'एनालिसिस'],
    ['Comms', 'कॉम्स'],
    ['District Update', 'ज़िला अपडेट'],
    ['Field', 'फ़ील्ड'],
    ['Geography', 'जियोग्राफी'],
    ['IT / Cell & Social', 'IT / सेल और सोशल'],
    ['Target', 'टार्गेट'],
    ['🔒 Secure Access • Role-Based • Audit Logged', '🔒 सुरक्षित एक्सेस • रोल-बेस्ड • ऑडिट लॉग्ड'],
    ['BJP Bihar Political Intelligence • Confidential • Authorised Personnel Only', 'BJP बिहार पॉलिटिकल इंटेलिजेंस • गोपनीय • केवल अधिकृत व्यक्ति'],
  ];

  // Dynamic strings with numbers/names inside
  const PATTERNS = [
    { enRe: /^📰 Read 1 More News ↓$/, hiTpl: '📰 और 1 खबर पढ़ें ↓',
      hiRe: /^📰 और 1 खबर पढ़ें ↓$/, enTpl: '📰 Read 1 More News ↓' },
    { enRe: /^📰 Read (\d+) More News ↓$/, hiTpl: '📰 और $1 खबरें पढ़ें ↓',
      hiRe: /^📰 और (\d+) खबरें पढ़ें ↓$/, enTpl: '📰 Read $1 More News ↓' },
    { enRe: /^📰 (.+) — District News$/, hiTpl: '📰 $1 — ज़िला समाचार',
      hiRe: /^📰 (.+) — ज़िला समाचार$/, enTpl: '📰 $1 — District News' },
    { enRe: /^(\d+) latest$/, hiTpl: '$1 ताज़ा',
      hiRe: /^(\d+) ताज़ा$/, enTpl: '$1 latest' },
    { enRe: /^\((\d+) remaining\)$/, hiTpl: '($1 शेष)',
      hiRe: /^\((\d+) शेष\)$/, enTpl: '($1 remaining)' },
    { enRe: /^(\d+) accounts$/, hiTpl: '$1 खाते',
      hiRe: /^(\d+) खाते$/, enTpl: '$1 accounts' },
    { enRe: /^(\d+) headlines analysed$/, hiTpl: '$1 हेडलाइन्स विश्लेषित',
      hiRe: /^(\d+) हेडलाइन्स विश्लेषित$/, enTpl: '$1 headlines analysed' },
    { enRe: /^No news yet for (.+)\.$/, hiTpl: '$1 के लिए अभी कोई खबर नहीं।',
      hiRe: /^(.+) के लिए अभी कोई खबर नहीं।$/, enTpl: 'No news yet for $1.' },
    { enRe: /^No (\w+) news for (.+)\.$/, hiTpl: '$2 के लिए कोई $1 खबर नहीं।',
      hiRe: /^(.+) के लिए कोई (\w+) खबर नहीं।$/, enTpl: 'No $2 news for $1.' },
    { enRe: /^𝕏 X Social Pulse — (.+)$/, hiTpl: '𝕏 सोशल पल्स — $1',
      hiRe: /^𝕏 सोशल पल्स — (.+)$/, enTpl: '𝕏 X Social Pulse — $1' },
    { enRe: /^(.+) — Live News$/, hiTpl: '$1 — लाइव न्यूज़',
      hiRe: /^(.+) — लाइव न्यूज़$/, enTpl: '$1 — Live News' },
    { enRe: /^Last seen: (.+)$/, hiTpl: 'अंतिम बार देखा: $1',
      hiRe: /^अंतिम बार देखा: (.+)$/, enTpl: 'Last seen: $1' },
    { enRe: /^Base: (.+)$/, hiTpl: 'बेस: $1',
      hiRe: /^बेस: (.+)$/, enTpl: 'Base: $1' },
  ];

  const EN2HI = new Map(PAIRS);
  const HI2EN = new Map(PAIRS.map(([en, hi]) => [hi, en]));

  const LS_KEY = 'bcc_lang';
  const getLang = () => (localStorage.getItem(LS_KEY) === 'en' ? 'en' : 'hi');

  function translateText(raw) {
    const t = raw.replace(/\s+/g, ' ').trim();
    if (!t) return null;
    if (getLang() === 'hi') {
      if (EN2HI.has(t)) return EN2HI.get(t);
      for (const p of PATTERNS) if (p.enRe.test(t)) return t.replace(p.enRe, p.hiTpl);
    } else {
      if (HI2EN.has(t)) return HI2EN.get(t);
      for (const p of PATTERNS) if (p.hiRe.test(t)) return t.replace(p.hiRe, p.enTpl);
    }
    return null;
  }

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CANVAS']);

  function applyNode(node) {
    const out = translateText(node.nodeValue);
    if (out !== null) node.nodeValue = out;
  }

  function translateRoot(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const el = node.parentElement;
        if (!el || SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(applyNode);
  }

  // ── Floating toggle button ─────────────────────────────────
  function updateToggle() {
    const btn = document.getElementById('bcc-lang-toggle');
    if (btn) btn.textContent = getLang() === 'hi' ? '🌐 EN' : '🌐 हिं';
  }

  function ensureToggle() {
    if (document.getElementById('bcc-lang-toggle')) return updateToggle();
    const btn = document.createElement('button');
    btn.id = 'bcc-lang-toggle';
    btn.title = 'Language / भाषा बदलें';
    btn.setAttribute('aria-label', 'Toggle language');
    btn.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:9999;padding:.5rem .95rem;' +
      'border-radius:999px;border:1px solid rgba(255,255,255,.22);background:#0f1829;color:#e8edf8;' +
      'font-size:.8rem;font-weight:700;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.55);';
    btn.addEventListener('click', () => window.toggleLang());
    document.body.appendChild(btn);
    updateToggle();
  }

  function setLang(lang) {
    localStorage.setItem(LS_KEY, lang);
    translateRoot(document.body);
    updateToggle();
  }

  window.toggleLang = () => setLang(getLang() === 'hi' ? 'en' : 'hi');
  window.setLang = setLang;
  window.getLang = getLang;

  // ── Auto-translate JS-rendered content (HI mode only) ──────
  let scheduled = false;
  let pendingMuts = [];
  const observer = new MutationObserver(muts => {
    if (getLang() !== 'hi') return;
    pendingMuts.push(...muts);
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const batch = pendingMuts;
      pendingMuts = [];
      for (const m of batch) {
        if (m.type === 'characterData') { applyNode(m.target); continue; }
        m.addedNodes.forEach(n => {
          if (n.nodeType === Node.TEXT_NODE) applyNode(n);
          else if (n.nodeType === Node.ELEMENT_NODE) translateRoot(n);
        });
      }
    });
  });

  document.addEventListener('DOMContentLoaded', () => {
    ensureToggle();
    if (getLang() === 'hi') translateRoot(document.body);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
})();
