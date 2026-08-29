const ApiError = require('../utils/ApiError');

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 15000);
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

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

async function rawRequest(body) {
  const apiKey = getGeminiApiKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

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
  const body = {
    ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
    contents,
    generationConfig,
  };

  let result = await rawRequest(body);

  if (!result.ok && result.status === 400 && generationConfig?.thinkingConfig) {
    const message = result.payload?.error?.message?.toLowerCase() || '';
    if (message.includes('thinking')) {
      const { thinkingConfig, ...restConfig } = generationConfig;
      result = await rawRequest({ ...body, generationConfig: restConfig });
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
};
