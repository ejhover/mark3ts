import dotenv from 'dotenv';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const LLM_PROVIDER = String(process.env.LLM_PROVIDER || 'ollama').trim().toLowerCase();
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b-instruct';
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || '') || 45_000;
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || '') || 45_000;
const PROVIDER_CHECK_TTL_MS = Number(process.env.LLM_PROVIDER_CHECK_TTL_MS || '') || 15_000;
const OLLAMA_MODEL_PREFERENCES = [
  'qwen2.5:7b-instruct',
  'llama3.1:8b-instruct',
  'mistral:7b-instruct',
  'qwen2.5:latest',
  'llama3.1:latest',
  'mistral:latest',
];

// --- Provider detection ------------------------------------------------------

let _detectedProvider = null;
let _detectedOllamaModel = OLLAMA_MODEL;
let _cachedOllamaModels = [];
let _lastProviderCheckMs = 0;

async function getOllamaModelList() {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
  if (!res.ok) return [];
  const payload = await res.json();
  const models = Array.isArray(payload?.models) ? payload.models : [];
  return models
    .map((m) => String(m?.name || '').trim())
    .filter(Boolean);
}

function pickPreferredOllamaModel(models) {
  if (!models.length) return OLLAMA_MODEL;
  if (models.includes(OLLAMA_MODEL)) return OLLAMA_MODEL;

  for (const preferred of OLLAMA_MODEL_PREFERENCES) {
    if (models.includes(preferred)) return preferred;
  }

  const qwenLike = models.find((name) => /^qwen/i.test(name));
  if (qwenLike) return qwenLike;
  return models[0];
}

async function isOllamaReachable() {
  try {
    console.log('Checking Ollama availability at', OLLAMA_BASE_URL);
    _cachedOllamaModels = await getOllamaModelList();
    _detectedOllamaModel = pickPreferredOllamaModel(_cachedOllamaModels);
    return _cachedOllamaModels.length > 0;
  } catch {
    return false;
  }
}

/**
 * Detect which LLM provider is available.
 * Priority: Ollama (local, free) → OpenAI (API key) → none.
 */
export async function detectProvider() {
  const now = Date.now();
  if (_detectedProvider && now - _lastProviderCheckMs < PROVIDER_CHECK_TTL_MS) {
    return _detectedProvider;
  }

  _lastProviderCheckMs = now;

  if (LLM_PROVIDER === 'ollama') {
    _detectedProvider = (await isOllamaReachable()) ? 'ollama' : 'none';
    return _detectedProvider;
  }

  if (LLM_PROVIDER === 'openai') {
    _detectedProvider = OPENAI_API_KEY ? 'openai' : 'none';
    return _detectedProvider;
  }

  if (await isOllamaReachable()) {
    _detectedProvider = 'ollama';
  } else if (OPENAI_API_KEY) {
    _detectedProvider = 'openai';
  } else {
    _detectedProvider = 'none';
  }
  return _detectedProvider;
}

/**
 * Return current LLM status for the frontend.
 */
export async function getLLMStatus() {
  const provider = await detectProvider();
  let model = null;
  let available = false;
  if (provider === 'ollama') {
    model = _detectedOllamaModel;
    available = true;
  } else if (provider === 'openai') {
    model = OPENAI_MODEL;
    available = true;
  }
  return {
    provider,
    model,
    available,
    ollama_models: provider === 'ollama' ? _cachedOllamaModels : [],
  };
}

// --- Ollama invocation -------------------------------------------------------

async function invokeOllama({ prompt, response_json_schema }) {
  const schemaDescription = response_json_schema
    ? JSON.stringify(response_json_schema, null, 2)
    : 'No schema provided; respond with a JSON object.';

  const messages = [
    {
      role: 'system',
      content:
        'You are a financial research assistant. ' +
        'You MUST respond with ONLY valid JSON, no extra commentary.',
    },
    {
      role: 'user',
      content:
        `Use this JSON schema as a guide for your response (if applicable):\n` +
        `${schemaDescription}\n\n` +
        `Now answer the following prompt and return ONLY JSON:\n\n${prompt}`,
    },
  ];

  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    body: JSON.stringify({
      model: _detectedOllamaModel || OLLAMA_MODEL,
      messages,
      format: 'json',
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  const content = data.message?.content;
  if (!content) {
    throw new Error('No content returned from Ollama');
  }

  try {
    return JSON.parse(content);
  } catch (err) {
    throw new Error('Failed to parse Ollama JSON: ' + err.message);
  }
}

// --- OpenAI invocation -------------------------------------------------------

async function invokeOpenAI({ prompt, response_json_schema }) {
  const schemaDescription = response_json_schema
    ? JSON.stringify(response_json_schema, null, 2)
    : 'No schema provided; respond with a JSON object.';

  const messages = [
    {
      role: 'system',
      content:
        'You are a financial research assistant. ' +
        'You MUST respond with ONLY valid JSON, no extra commentary.',
    },
    {
      role: 'user',
      content:
        `Use this JSON schema as a guide for your response (if applicable):\n` +
        `${schemaDescription}\n\n` +
        `Now answer the following prompt and return ONLY JSON:\n\n${prompt}`,
    },
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No content returned from OpenAI');
  }

  try {
    return JSON.parse(content);
  } catch (err) {
    throw new Error('Failed to parse model JSON: ' + err.message);
  }
}

// --- Main entry point --------------------------------------------------------

/**
 * Invoke an LLM with a prompt and an optional JSON schema.
 * Auto-selects provider: Ollama (local) → OpenAI (API key) → error.
 */
export async function invokeLLM({ prompt, response_json_schema }) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('prompt is required');
  }

  const provider = await detectProvider();

  if (provider === 'ollama') {
    return invokeOllama({ prompt, response_json_schema });
  }

  if (provider === 'openai') {
    return invokeOpenAI({ prompt, response_json_schema });
  }

  throw new Error(
    'No LLM provider available. Either:\n' +
    '  1. Install and start Ollama (https://ollama.com) then run: ollama pull qwen2.5:7b\n' +
    '  2. Set OPENAI_API_KEY in your .env file'
  );
}

