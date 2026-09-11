export function register() {
    if (process.env.ANALYSIS_SCHEDULER_ENABLED !== 'true' || globalThis.__biharAnalysisScheduler) return;
    globalThis.__biharAnalysisScheduler = setInterval(async () => {
        const { runAnalysisCycle } = await import('./lib/gemini-analysis');
        try { await runAnalysisCycle(); } catch (error) { console.error('Background analysis cycle failed:', error); }
    }, Math.max(1, Number(process.env.ANALYSIS_INTERVAL_MINUTES || 15)) * 60 * 1000);
}