import dotenv from 'dotenv';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

/**
 * Invoke an LLM with a prompt and an optional JSON schema.
 * Returns a plain JS object parsed from the model's JSON output.
 */
export async function invokeLLM({ prompt, response_json_schema }) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set in the backend environment');
  }

  if (!prompt || typeof prompt !== 'string') {
    throw new Error('prompt is required');
  }

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

