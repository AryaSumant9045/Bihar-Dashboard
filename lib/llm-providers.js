/**
 * lib/llm-providers.js
 * ============================================================
 * Unified LLM abstraction with cascading fallback:
 *   Gemini 2.5 Flash → (wait on rate limit) → Groq llama-3.1-8b → PlugSky
 *
 * Token budget per call:
 *   Max input:  3500 tokens  (~14,000 chars, Hindi+English mix)
 *   Max output: 2000 tokens  (~8,000 chars)
 * ============================================================
 */


export const TOKEN_BUDGET = {
  MAX_INPUT_TOKENS:       8000,  // Increased: allows 150-200+ headlines
  MAX_OUTPUT_TOKENS:      3000,  // Increased: richer summary output
  MAX_NEWS_ITEM_CHARS:    200,   // per news item body truncation
  MAX_PREV_SUMMARY_CHARS: 4000,  // previous summary context
  CHARS_PER_TOKEN:        3.5,   // rough estimate for Hindi+English
};

const RATE_LIMIT_WAIT_MS  = 0; // serverless me long wait nahi (pehle 10 min tha → Vercel 504)
const RETRY_BACKOFF_MS    = [2000, 4000, 8000]; // exponential for transient errors

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function estimateTokens(text) {
  return Math.ceil(String(text || '').length / TOKEN_BUDGET.CHARS_PER_TOKEN);
}

function truncateToTokens(text, maxTokens) {
  const maxChars = Math.floor(maxTokens * TOKEN_BUDGET.CHARS_PER_TOKEN);
  return String(text || '').slice(0, maxChars);
}

function isRateLimit(error) {
  return /429|quota|rate.?limit|resource.?exhausted/i.test(error?.message || String(error));
}

function isTransient(error) {
  return /429|500|502|503|504|overloaded|timeout|network/i.test(error?.message || String(error));
}

/** ─── Gemini ────────────────────────────────────────────── */
async function callGemini(systemPrompt, userPrompt, attempt = 0, jsonMode = true) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature:      0.2,
      maxOutputTokens:  TOKEN_BUDGET.MAX_OUTPUT_TOKENS,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };

  const response = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(30000),
  });

  if (response.status === 429) {
    const err = new Error(`Gemini rate limit (429) on attempt ${attempt + 1}`);
    err.isRateLimit = true;
    throw err;
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Gemini ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Gemini returned empty content');
  
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
    throw new Error(`Gemini truncated output (finishReason: ${candidate.finishReason})`);
  }

  const usage = data?.usageMetadata || {};
  return {
    content:      text,
    provider:     'gemini',
    model,
    inputTokens:  usage.promptTokenCount      || estimateTokens(userPrompt),
    outputTokens: usage.candidatesTokenCount  || estimateTokens(text),
  };
}

/** ─── Groq ──────────────────────────────────────────────── */
/** Saare configured Groq keys (rotation ke liye): GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEYS=a,b */
function groqKeys() {
  const raw = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    ...String(process.env.GROQ_API_KEYS || '').split(','),
  ].map((k) => (k || '').trim()).filter(Boolean);
  return [...new Set(raw)];
}

async function callGroqWithKey(systemPrompt, userPrompt, jsonMode, modelOverride, maxTokensOverride, apiKey) {

  /* Har Groq account me har model nahi hota — llama-3.1-8b-instant kai accounts
     par 404 deta hai, isliye safe default gpt-oss-20b (fast + available). */
  const model   = modelOverride || process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
  const baseUrl = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1';
  const url     = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  const response = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      Authorization:   `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
      temperature:       0.2,
      max_tokens:        maxTokensOverride || TOKEN_BUDGET.MAX_OUTPUT_TOKENS,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (response.status === 429) {
    const err = new Error(`Groq rate limit (429)${response.headers.get('retry-after') ? ` retry-after=${response.headers.get('retry-after')}` : ''}`);
    err.isRateLimit = true;
    err.retryAfterSec = Number(response.headers.get('retry-after')) || 0;
    throw err;
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    /* Groq ka json_object mode kabhi "Failed to validate JSON" (400) deta hai
       (prompt/size ke wajah se). Us case me bina response_format dobara try karo. */
    if (response.status === 400 && jsonMode && /validate JSON|json_validate_failed/i.test(text)) {
      console.warn('[LLM] Groq json_object rejected — retrying in plain-text mode');
      return await callGroqWithKey(systemPrompt, userPrompt, false, modelOverride, maxTokensOverride, apiKey);
    }
    throw new Error(`Groq ${response.status} [${model}]: ${text.slice(0, 200)}`);
  }

  const data    = await response.json();
  const content = data?.choices?.[0]?.message?.content || '';
  if (!content) throw new Error('Groq returned empty content');

  const usage = data?.usage || {};
  return {
    content,
    provider:     'groq',
    model,
    inputTokens:  usage.prompt_tokens     || estimateTokens(userPrompt),
    outputTokens: usage.completion_tokens || estimateTokens(content),
  };
}

/**
 * callGroq — key rotation ke saath: ek key ka quota khatam (429) ho to agli key.
 * Isse free tier par bhi kaam chalta rehta hai (GROQ_API_KEY_2 / GROQ_API_KEYS add karo).
 */
async function callGroq(systemPrompt, userPrompt, jsonMode = true, modelOverride = null, maxTokensOverride = null) {
  const keys = groqKeys();
  if (!keys.length) throw new Error('GROQ_API_KEY not set');
  let lastError = null;
  for (let i = 0; i < keys.length; i++) {
    try {
      return await callGroqWithKey(systemPrompt, userPrompt, jsonMode, modelOverride, maxTokensOverride, keys[i]);
    } catch (error) {
      lastError = error;
      const isQuota = error?.isRateLimit || /429/.test(error?.message || '');
      if (isQuota && i < keys.length - 1) {
        console.warn(`[LLM] Groq key #${i + 1} quota/rate-limit — next key try kar rahe hain`);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/** ─── PlugSky ───────────────────────────────────────────── */
async function callPlugSky(systemPrompt, userPrompt, jsonMode = true) {
  const apiKey = process.env.PLUGSKY_API_KEY;
  if (!apiKey) throw new Error('PLUGSKY_API_KEY not set');

  const model   = process.env.PLUGSKY_MODEL || 'plugsky-micro';
  const baseUrl = process.env.PLUGSKY_API_URL || 'https://api.plugsky.com/v1';
  const url     = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  const response = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
      temperature:     0.2,
      max_tokens:      TOKEN_BUDGET.MAX_OUTPUT_TOKENS,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`PlugSky ${response.status}: ${text.slice(0, 200)}`);
  }

  const data    = await response.json();
  const raw     = data?.choices?.[0]?.message?.content;
  const content = Array.isArray(raw)
    ? raw.map((p) => p.text || '').join('')
    : raw || '';
  if (!content) throw new Error('PlugSky returned empty content');

  return {
    content,
    provider:     'plugsky',
    model,
    inputTokens:  estimateTokens(userPrompt),
    outputTokens: estimateTokens(content),
  };
}

/**
 * callLLMWithFallback — cascading LLM call with rate-limit handling
 *
 * Strategy:
 *   1. Try Gemini
 *   2. If 429 → wait RATE_LIMIT_WAIT_MS → retry Gemini once more
 *   3. If still 429 → try Groq (immediately, different provider)
 *   4. If Groq also fails → try PlugSky
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @returns {{ content, provider, model, inputTokens, outputTokens }}
 */
export async function callLLMWithFallback(systemPrompt, userPrompt) {
  // ── Attempt 1: Gemini (skip when its daily quota is already burnt) ──
  if (geminiAvailable()) try {
    console.log('[LLM] Trying Gemini...');
    return await callGemini(systemPrompt, userPrompt, 0);
  } catch (geminiErr1) {
    noteGeminiFailure(geminiErr1);
    console.warn('[LLM] Gemini attempt 1 failed:', geminiErr1.message);

    if (isRateLimit(geminiErr1)) {
      /* Serverless (Vercel) me 10 min wait = guaranteed 504 timeout.
         Isliye Gemini ko breaker se band karke seedha Groq par jaate hain. */
      noteGeminiFailure(geminiErr1);
      console.warn('[LLM] Gemini rate limit — long wait skip (serverless budget) → Groq');
    } else if (isTransient(geminiErr1)) {
      // transient error → short backoff → retry once
      await sleep(RETRY_BACKOFF_MS[1]);
      try {
        return await callGemini(systemPrompt, userPrompt, 1);
      } catch (_) { /* fall through */ }
    }
  }

  // ── Attempt 2: Groq ───────────────────────────────────────
  try {
    console.log('[LLM] Falling back to Groq...');
    return await callGroq(systemPrompt, userPrompt);
  } catch (groqErr) {
    console.warn('[LLM] Groq failed:', groqErr.message);
  }

  // ── Attempt 3: PlugSky ────────────────────────────────────
  console.log('[LLM] Falling back to PlugSky...');
  return await callPlugSky(systemPrompt, userPrompt);
}

export { estimateTokens, truncateToTokens };

/* ═══════════════════════════════════════════════════════════
   Gemini quota circuit-breaker
   ------------------------------------------------------------
   Gemini free tier = 20 requests/day per model. Poora dashboard
   (8+ pipelines) ek hi key share karta hai, isliye 429 aana normal hai.
   Ek baar quota error mile to hum Gemini ko thodi der band kar dete hain
   aur seedha Groq/PlugSky use karte hain — fail-fast, no wasted seconds.
   Env: LLM_PRIMARY=groq   → Gemini ko pehle se skip karo
        GEMINI_DISABLED=1  → same effect
   ═══════════════════════════════════════════════════════════ */
const QUOTA_DAILY_MS = 12 * 60 * 60 * 1000;
const QUOTA_RETRY_GIVEUP_SEC = 20; // itne se zyada retry-after = quota khatam, wait mat karo
const QUOTA_SHORT_MS = 60 * 1000;
let geminiBlockedUntil = 0;

function isQuotaError(error) {
  return /RESOURCE_EXHAUSTED|quota|exceeded your current quota|rate.?limit|429/i.test(error?.message || String(error));
}
function isDailyQuota(error) {
  return /PerDay|per day|free_tier|quotaValue|daily/i.test(error?.message || String(error));
}

/** Gemini abhi use kar sakte hain ya nahi? */
export function geminiAvailable() {
  if (process.env.LLM_PRIMARY === 'groq' || process.env.GEMINI_DISABLED === '1') return false;
  return Date.now() >= geminiBlockedUntil;
}

/** Gemini failure ke baad cooldown set karo (daily quota → 12h, warna 60s). */
export function noteGeminiFailure(error) {
  if (!isQuotaError(error)) return false;
  const daily = isDailyQuota(error);
  geminiBlockedUntil = Date.now() + (daily ? QUOTA_DAILY_MS : QUOTA_SHORT_MS);
  console.warn(`[LLM] Gemini quota hit — Gemini paused for ${daily ? '12h' : '60s'}; Groq/PlugSky use honge.`);
  return true;
}

/** Debug/UI ke liye current Gemini state. */
export function geminiState() {
  return { available: geminiAvailable(), blockedUntil: geminiBlockedUntil ? new Date(geminiBlockedUntil).toISOString() : null, primary: process.env.LLM_PRIMARY || 'auto' };
}

/**
 * callLLMQuick — 60s serverless cron ke liye fast cascade (koi long wait nahi):
 *   [Gemini] → Groq (retries + backoff) → PlugSky
 *
 * @param {object} opts
 *   json?:    boolean  false → plain text (translation), default true
 *   prefer?:  'groq'   → Gemini bilkul skip karo (free tier 20 req/day ke liye best)
 *   model?:   string   Groq model override (e.g. openai/gpt-oss-20b)
 *   retries?: number   Groq attempts (default 3)
 *   maxOutputTokens?: number  Groq free tier TPM (8000) ke andar rehne ke liye
 */
export async function callLLMQuick(systemPrompt, userPrompt, opts = {}) {
  const jsonMode = opts.json !== false;
  const retries = Math.max(1, Number(opts.retries) || 3);
  const preferGroq = opts.prefer === 'groq' || process.env.LLM_PRIMARY === 'groq';
  const failures = [];

  if (!preferGroq && geminiAvailable()) {
    try {
      return await callGemini(systemPrompt, userPrompt, 0, jsonMode);
    } catch (geminiErr) {
      noteGeminiFailure(geminiErr);
      failures.push(`gemini: ${geminiErr.message.slice(0, 120)}`);
      console.warn('[LLM:quick] Gemini failed:', geminiErr.message.slice(0, 120));
    }
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await callGroq(systemPrompt, userPrompt, jsonMode, opts.model, opts.maxOutputTokens);
    } catch (groqErr) {
      failures.push(`groq#${attempt + 1}: ${groqErr.message.slice(0, 120)}`);
      /* Agar Groq ne lamba retry-after diya hai (quota khatam), to is request me
         intezaar bekaar hai — serverless budget bachao aur turant fail karo. */
      if (groqErr.retryAfterSec && groqErr.retryAfterSec > QUOTA_RETRY_GIVEUP_SEC) {
        console.warn(`[LLM:quick] Groq quota exhausted (retry-after ${groqErr.retryAfterSec}s) — bailing out fast`);
        break;
      }
      const wait = groqErr.retryAfterSec ? Math.min(groqErr.retryAfterSec * 1000, 15000) : [1500, 4000, 8000][attempt] || 8000;
      console.warn(`[LLM:quick] Groq attempt ${attempt + 1}/${retries} failed: ${groqErr.message.slice(0, 100)} — retry in ${Math.round(wait / 1000)}s`);
      if (attempt < retries - 1) await sleep(wait);
    }
  }

  /* PlugSky ab opt-in hai (PLUGSKY_ENABLED=1) — ye service baar-baar 500/timeout
     deti hai aur serverless budget kha jati hai. */
  if (process.env.PLUGSKY_ENABLED === '1') {
    try {
      return await callPlugSky(systemPrompt, userPrompt, jsonMode);
    } catch (plugErr) {
      failures.push(`plugsky: ${plugErr.message.slice(0, 120)}`);
    }
  } else {
    failures.push('plugsky: skipped (PLUGSKY_ENABLED!=1)');
  }

  const err = new Error(`All LLM providers failed → ${failures.join(' | ')}`);
  err.providerFailures = failures;
  throw err;
}
