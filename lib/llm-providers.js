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
  MAX_INPUT_TOKENS:       3500,
  MAX_OUTPUT_TOKENS:      2000,
  MAX_NEWS_ITEM_CHARS:    200,   // per news item body truncation
  MAX_PREV_SUMMARY_CHARS: 4000,  // previous summary context
  CHARS_PER_TOKEN:        3.5,   // rough estimate for Hindi+English
};

const RATE_LIMIT_WAIT_MS  = 10 * 60 * 1000;  // 10 min
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
async function callGemini(systemPrompt, userPrompt, attempt = 0) {
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
      responseMimeType: 'application/json',
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
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Gemini returned empty content');

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
async function callGroq(systemPrompt, userPrompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const model   = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
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
      max_tokens:        TOKEN_BUDGET.MAX_OUTPUT_TOKENS,
      response_format:   { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (response.status === 429) {
    const err = new Error('Groq rate limit (429)');
    err.isRateLimit = true;
    throw err;
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Groq ${response.status}: ${text.slice(0, 200)}`);
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

/** ─── PlugSky ───────────────────────────────────────────── */
async function callPlugSky(systemPrompt, userPrompt) {
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
      response_format: { type: 'json_object' },
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
  // ── Attempt 1: Gemini ─────────────────────────────────────
  try {
    console.log('[LLM] Trying Gemini...');
    return await callGemini(systemPrompt, userPrompt, 0);
  } catch (geminiErr1) {
    console.warn('[LLM] Gemini attempt 1 failed:', geminiErr1.message);

    if (isRateLimit(geminiErr1)) {
      // ── Rate limit → wait → retry Gemini once ────────────
      console.log(`[LLM] Gemini rate limit hit. Waiting ${RATE_LIMIT_WAIT_MS / 60000} min before retry...`);
      await sleep(RATE_LIMIT_WAIT_MS);

      try {
        console.log('[LLM] Retrying Gemini after wait...');
        return await callGemini(systemPrompt, userPrompt, 1);
      } catch (geminiErr2) {
        console.warn('[LLM] Gemini retry also failed:', geminiErr2.message);
        // Fall through to Groq
      }
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
