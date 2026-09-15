const ApiError = require('../utils/ApiError');

// Pinned stable model. The rolling `-latest` aliases are shared and get
// capacity-throttled by Google (HTTP 503 "the model is experiencing high
// demand"), which surfaced in production as "Gemini is temporarily unavailable".
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 15000);
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);
const RETRY_BACKOFF_MS = 1000;

// Gemini 3.x replaced the old token-count `thinkingConfig.thinkingBudget`
// with a named `thinkingConfig.thinkingLevel` ('minimal'|'low'|'medium'|
// 'high') and rejects a request that sets both (400). Callers never touch
// either field directly — they ask for a semantic `reasoningLevel` in
// generationConfig, and this module resolves it to whatever the *currently
// configured* GEMINI_MODEL actually accepts, so a future model swap (or a
// rollback to an older model via env) doesn't require touching every call
// site again.
const GEMINI_3_MODEL_PATTERN = /^gemini-3/i;
const THINKING_LEVELS = new Set(['minimal', 'low', 'medium', 'high']);
// Pre-3 fallback: coarse budget approximation for older models still
// reachable via GEMINI_MODEL.
const THINKING_BUDGET_BY_LEVEL = { minimal: 0, low: 0, medium: 512, high: 2048 };

function isGemini3Model() {
  return GEMINI_3_MODEL_PATTERN.test(GEMINI_MODEL);
}

function resolveThinkingConfig(reasoningLevel) {
  if (!reasoningLevel) return undefined;
  const level = THINKING_LEVELS.has(reasoningLevel) ? reasoningLevel : 'low';
  return isGemini3Model() ? { thinkingLevel: level } : { thinkingBudget: THINKING_BUDGET_BY_LEVEL[level] };
}

// Google "strongly recommends keeping the temperature parameter at its
// default value of 1.0" for Gemini 3 models — lowering it "may lead to
// unexpected behavior, such as looping or degraded performance" (Gemini 3
// developer guide). Every caller in this codebase was tuned for pre-3 models
// (0.3-0.7); rather than trust each call site to know this, a caller-supplied
// temperature is simply not forwarded when a Gemini 3.x model is configured,
// so the model's own default applies.
function sanitizeGenerationConfig(generationConfig) {
  if (!generationConfig) return generationConfig;

  const { reasoningLevel, thinkingConfig, temperature, ...rest } = generationConfig;
  const resolvedThinking = thinkingConfig || resolveThinkingConfig(reasoningLevel);
  const resolvedTemperature = isGemini3Model() ? undefined : temperature;

  return {
    ...rest,
    ...(resolvedTemperature !== undefined ? { temperature: resolvedTemperature } : {}),
    ...(resolvedThinking ? { thinkingConfig: resolvedThinking } : {}),
  };
}

function getGeminiApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new ApiError(503, 'AILA is not configured yet. Please add the Gemini API key on the server.');
  }

  return apiKey;
}

function mapGeminiError(status, payload) {
  const providerMessage = payload?.error?.message;

  if (status === 400 && providerMessage?.toLowerCase().includes('api key')) {
    return new ApiError(503, 'AILA is not configured correctly. Please check the Gemini API key.');
  }

  if (status === 401 || status === 403) {
    return new ApiError(503, 'AILA could not authenticate with Gemini. Please check the server API key.');
  }

  if (status === 429) {
    return new ApiError(429, 'AILA is receiving too many requests right now. Please wait a moment and try again.');
  }

  if (status >= 500) {
    return new ApiError(503, 'Gemini is temporarily unavailable. Please try again soon.');
  }

  return new ApiError(502, providerMessage || 'Gemini could not complete the request.');
}

async function rawRequest(body, timeoutMs = GEMINI_TIMEOUT_MS) {
  const apiKey = getGeminiApiKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));

  try {
    const response = await fetch(
      `${GEMINI_API_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify(body),
      }
    );

    const payload = await response.json().catch(() => null);

    return { ok: response.ok, status: response.status, payload };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new ApiError(504, 'AILA took too long to respond. Please try again.');
    }

    throw new ApiError(503, 'AILA could not reach Gemini. Please check the connection and try again.');
  } finally {
    clearTimeout(timeout);
  }
}

async function callGemini({ systemInstruction, contents, generationConfig }) {
  const sanitizedConfig = sanitizeGenerationConfig(generationConfig);
  const body = {
    ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
    contents,
    generationConfig: sanitizedConfig,
  };

  const deadline = Date.now() + GEMINI_TIMEOUT_MS;
  let result = await rawRequest(body, deadline - Date.now());

  // One retry on a transient upstream failure (5xx / "high demand"), while the
  // overall time budget still allows it.
  if (!result.ok && RETRYABLE_STATUSES.has(result.status) && Date.now() + RETRY_BACKOFF_MS < deadline) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
    result = await rawRequest(body, deadline - Date.now());
  }

  // One retry without thinkingConfig if that is the field the request is
  // rejecting (covers a model that accepts neither thinkingBudget nor
  // thinkingLevel at all).
  if (!result.ok && result.status === 400 && sanitizedConfig?.thinkingConfig) {
    const message = result.payload?.error?.message?.toLowerCase() || '';
    if (message.includes('thinking')) {
      const { thinkingConfig, ...restConfig } = sanitizedConfig;
      result = await rawRequest({ ...body, generationConfig: restConfig }, deadline - Date.now());
    }
  }

  if (!result.ok) {
    throw mapGeminiError(result.status, result.payload);
  }

  return result.payload;
}

function getResponseText(payload) {
  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter(Boolean)
    .join('\n')
    .trim();

  if (!text) {
    throw new ApiError(502, 'AILA could not generate a response. Please try again.');
  }

  return text;
}

module.exports = {
  callGemini,
  getResponseText,
  // exposed for unit tests only — not part of the intended public surface
  isGemini3Model,
  sanitizeGenerationConfig,
};
