// App params for standalone mode. Optional URL params and localStorage for overrides.
const isNode = typeof window === 'undefined';
const windowObj = isNode ? { localStorage: new Map() } : window;
const storage = windowObj.localStorage;

const toSnakeCase = (str) => str.replace(/([A-Z])/g, '_$1').toLowerCase();

const getAppParamValue = (paramName, { defaultValue = undefined, removeFromUrl = false } = {}) => {
  if (isNode) return defaultValue;
  const storageKey = `mark3ts_${toSnakeCase(paramName)}`;
  const urlParams = new URLSearchParams(window.location.search);
  const searchParam = urlParams.get(paramName);
  if (removeFromUrl) {
    urlParams.delete(paramName);
    const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ''}${window.location.hash}`;
    window.history.replaceState({}, document.title, newUrl);
  }
  if (searchParam) {
    storage.setItem(storageKey, searchParam);
    return searchParam;
  }
  if (defaultValue != null) {
    storage.setItem(storageKey, defaultValue);
    return defaultValue;
  }
  return storage.getItem(storageKey);
};

const getAppParams = () => {
  const viteEnv = globalThis?.import_meta_env || {};
  if (getAppParamValue('clear_access_token') === 'true') {
    storage.removeItem('mark3ts_access_token');
    storage.removeItem('token');
  }
  return {
    appId: getAppParamValue('app_id', { defaultValue: viteEnv.VITE_APP_ID ?? 'local' }),
    token: getAppParamValue('access_token', { removeFromUrl: true }),
    fromUrl: getAppParamValue('from_url', { defaultValue: typeof window !== 'undefined' ? window.location.href : '' }),
    functionsVersion: getAppParamValue('functions_version', { defaultValue: null }),
    appBaseUrl: getAppParamValue('app_base_url', { defaultValue: '' }),
  };
};

export const appParams = { ...getAppParams() };
