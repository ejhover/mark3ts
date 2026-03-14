/**
 * Local standalone API client — stores entities in localStorage, proxies LLM calls to the Express backend.
 */

const STORAGE_PREFIX = 'mark3ts_entity_';
const ENTITY_NAMES = ['WatchlistItem', 'NewsItem', 'Hypothesis', 'Portfolio', 'AuditLog'];

function id() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `local_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function load(entityName) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + entityName);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(entityName, rows) {
  localStorage.setItem(STORAGE_PREFIX + entityName, JSON.stringify(rows));
}

function parseSort(sortStr) {
  if (!sortStr || typeof sortStr !== 'string') return { key: 'created_date', desc: true };
  const desc = sortStr.startsWith('-');
  const key = desc ? sortStr.slice(1) : sortStr;
  return { key, desc };
}

function sortRows(rows, sortStr) {
  const { key, desc } = parseSort(sortStr);
  return [...rows].sort((a, b) => {
    let aVal = a[key];
    let bVal = b[key];
    if (aVal == null) aVal = '';
    if (bVal == null) bVal = '';
    if (typeof aVal === 'string') aVal = aVal.toLowerCase();
    if (typeof bVal === 'string') bVal = bVal.toLowerCase();
    if (aVal < bVal) return desc ? 1 : -1;
    if (aVal > bVal) return desc ? -1 : 1;
    return 0;
  });
}

function makeEntityHandler(entityName) {
  return {
    list(sortStr = '-created_date', limit = 100, offset = 0, fields = null) {
      const rows = load(entityName);
      const sorted = sortRows(rows, sortStr);
      const sliced = sorted.slice(offset, offset + (limit ?? 100));
      if (fields && Array.isArray(fields)) {
        return sliced.map(r => {
          const o = {};
          fields.forEach(f => { if (r[f] !== undefined) o[f] = r[f]; });
          return o;
        });
      }
      return sliced;
    },

    filter(filters = {}, sortStr = '-created_date', limit = 100, offset = 0, fields = null) {
      let rows = load(entityName);
      if (filters && typeof filters === 'object') {
        rows = rows.filter(r => {
          return Object.entries(filters).every(([k, v]) => r[k] === v);
        });
      }
      const sorted = sortRows(rows, sortStr);
      const sliced = sorted.slice(offset, offset + (limit ?? 100));
      if (fields && Array.isArray(fields)) {
        return sliced.map(r => {
          const o = {};
          fields.forEach(f => { if (r[f] !== undefined) o[f] = r[f]; });
          return o;
        });
      }
      return sliced;
    },

    get(id) {
      const rows = load(entityName);
      return rows.find(r => r.id === id) ?? null;
    },

    create(data) {
      const rows = load(entityName);
      const record = {
        ...data,
        id: id(),
        created_date: new Date().toISOString(),
      };
      rows.push(record);
      save(entityName, rows);
      return record;
    },

    update(id, data) {
      const rows = load(entityName);
      const i = rows.findIndex(r => r.id === id);
      if (i === -1) throw new Error(`Record not found: ${id}`);
      rows[i] = { ...rows[i], ...data };
      save(entityName, rows);
      return rows[i];
    },

    delete(id) {
      const rows = load(entityName);
      const filtered = rows.filter(r => r.id !== id);
      if (filtered.length === rows.length) throw new Error(`Record not found: ${id}`);
      save(entityName, filtered);
      return { id };
    },
  };
}

const entities = {};
ENTITY_NAMES.forEach(name => { entities[name] = makeEntityHandler(name); });

/**
 * Stub LLM: returns mock structured data so the UI works without an external LLM.
 * Used as a fallback when no backend is available or a request fails.
 */
async function invokeLLMStub({ response_json_schema }) {
  await new Promise(r => setTimeout(r, 600));
  const props = response_json_schema?.properties || {};
  const out = {};
  if (props.title) out.title = 'Sample research hypothesis (local stub — no LLM configured).';
  if (props.reasoning) out.reasoning = 'This is placeholder text. Configure an LLM or backend to generate real hypotheses.';
  if (props.entities_involved) out.entities_involved = [];
  if (props.confidence_level) out.confidence_level = 'medium';
  if (props.confidence_score !== undefined) out.confidence_score = 0.5;
  if (props.audit_log) out.audit_log = ['Stub step 1', 'Stub step 2'];
  if (props.summary) out.summary = 'Summary (local stub — no LLM configured).';
  if (props.entities) out.entities = [];
  if (props.sentiment) out.sentiment = 'neutral';
  if (props.sentiment_score !== undefined) out.sentiment_score = 0;
  if (props.sector_tags) out.sector_tags = [];
  if (props.macro_signals) out.macro_signals = [];
  return out;
}

function getApiBaseUrl() {
  // Access Vite env via globalThis to avoid type-check issues in JS config.
  const viteEnv = globalThis?.import_meta_env || {};
  const fromEnv = typeof viteEnv.VITE_API_URL === 'string' ? viteEnv.VITE_API_URL : '';
  if (fromEnv.trim().length > 0) {
    return fromEnv.replace(/\/$/, '');
  }
  // Fall back to relative /api so Vite dev proxy (and production reverse proxy) can be used.
  return '';
}

async function invokeLLM({ prompt, response_json_schema }) {
  const baseUrl = getApiBaseUrl();
  const endpoint = baseUrl ? `${baseUrl}/api/llm/invoke` : '/api/llm/invoke';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, response_json_schema }),
    });

    if (!res.ok) {
      throw new Error(`LLM API error: ${res.status}`);
    }

    const data = await res.json();
    return data;
  } catch (err) {
    console.error('LLM invoke failed, falling back to stub', err);
    return invokeLLMStub({ response_json_schema });
  }
}

const auth = {
  async me() {
    return { id: 'local-user', email: 'local@localhost', role: 'user' };
  },
  logout(redirectUrl) {
    if (typeof redirectUrl === 'string' && redirectUrl) {
      window.location.href = redirectUrl;
    }
  },
  redirectToLogin(redirectUrl) {
    if (typeof redirectUrl === 'string' && redirectUrl) {
      window.location.href = redirectUrl;
    }
  },
};

export const appClient = {
  entities,
  auth,
  integrations: {
    Core: {
      InvokeLLM: invokeLLM,
    },
  },
};

export default appClient;
