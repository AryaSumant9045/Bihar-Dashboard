import { runAnalysisCycle } from '../../../../lib/gemini-analysis';

export const maxDuration = 300;

export async function GET(request) {
    const secret = process.env.CRON_SECRET;
    if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    try { return Response.json({ status: 'success', ...await runAnalysisCycle() }); }
    catch (error) { console.error('Scheduled analysis failed:', error); return Response.json({ error: error.message }, { status: 500 }); }
}