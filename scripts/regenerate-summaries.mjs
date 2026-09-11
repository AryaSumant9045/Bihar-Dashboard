const baseUrl = process.env.APP_URL || 'http://localhost:3000';
const secret = process.env.SUMMARY_REPROCESS_SECRET;
if (!secret) throw new Error('Set SUMMARY_REPROCESS_SECRET before running this script');
const response = await fetch(`${baseUrl}/api/admin/regenerate-summaries`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` } });
const result = await response.json();
if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
console.log(JSON.stringify(result, null, 2));