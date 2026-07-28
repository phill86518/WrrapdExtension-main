/**
 * xAI Grok chat client (OpenAI-compatible Chat Completions).
 * Replaces OpenAI for Wrrapd design ideas and flower ranking.
 */
const DEFAULT_MODEL = process.env.XAI_GROK_MODEL || 'grok-4.5';
const BASE_URL = (process.env.XAI_API_BASE_URL || 'https://api.x.ai/v1').replace(/\/$/, '');

function apiKey() {
  return String(process.env.XAI_API_KEY || '').trim();
}

function isConfigured() {
  return apiKey().length > 0;
}

/**
 * @param {{ messages: Array<{role:string,content:string}>, temperature?: number, max_tokens?: number, response_format?: object, model?: string }} opts
 * @returns {Promise<{ content: string, raw: object }>}
 */
async function chatCompletions(opts) {
  const key = apiKey();
  if (!key) {
    throw new Error('XAI_API_KEY is not configured');
  }
  const body = {
    model: opts.model || DEFAULT_MODEL,
    messages: opts.messages,
    temperature: opts.temperature != null ? opts.temperature : 0.7,
    max_tokens: opts.max_tokens != null ? opts.max_tokens : 1200,
  };
  if (opts.response_format) {
    body.response_format = opts.response_format;
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (raw && (raw.error?.message || raw.message)) ||
      `xAI HTTP ${res.status}`;
    throw new Error(msg);
  }
  const content = raw?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Grok returned empty content');
  }
  return { content, raw };
}

/**
 * Parse JSON from model content (handles optional ```json fences).
 * @param {string} content
 */
function parseJsonContent(content) {
  let text = String(content || '').trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  return JSON.parse(text);
}

module.exports = {
  DEFAULT_MODEL,
  isConfigured,
  chatCompletions,
  parseJsonContent,
};
