const USER_AUTH_TOKEN_KEY = 'ddo_auth_token';
const USER_AUTH_USER_KEY = 'ddo_auth_user';
const COMPANY_AUTH_TOKEN_KEY = 'ddo_company_auth_token';
const COMPANY_AUTH_USER_KEY = 'ddo_company_auth_user';
const APP_AUTH_REMEMBERED_KEY = 'ddo_auth_remembered';
const APP_AUTH_ACTIVE_KIND_KEY = 'ddo_auth_active_kind';

const readJson = (storage, key, fallback = null) => {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const clearStorageKeys = (storage, kind = 'all') => {
  if (kind === 'all' || kind === 'user') {
    storage.removeItem(USER_AUTH_TOKEN_KEY);
    storage.removeItem(USER_AUTH_USER_KEY);
  }

  if (kind === 'all' || kind === 'company') {
    storage.removeItem(COMPANY_AUTH_TOKEN_KEY);
    storage.removeItem(COMPANY_AUTH_USER_KEY);
  }
};

const readSessionFromStorage = (storage, kind) => {
  const tokenKey = kind === 'company' ? COMPANY_AUTH_TOKEN_KEY : USER_AUTH_TOKEN_KEY;
  const userKey = kind === 'company' ? COMPANY_AUTH_USER_KEY : USER_AUTH_USER_KEY;
  const token = storage.getItem(tokenKey);
  const user = readJson(storage, userKey);
  if (!token || !user) {
    return null;
  }

  return {
    token,
    user,
    rememberMe: storage === window.localStorage
      ? window.localStorage.getItem(APP_AUTH_REMEMBERED_KEY) === 'true'
      : true,
  };
};

const writeSessionToStorage = (storage, session, kind) => {
  const tokenKey = kind === 'company' ? COMPANY_AUTH_TOKEN_KEY : USER_AUTH_TOKEN_KEY;
  const userKey = kind === 'company' ? COMPANY_AUTH_USER_KEY : USER_AUTH_USER_KEY;
  storage.setItem(tokenKey, session.token);
  storage.setItem(userKey, JSON.stringify(session.user));
};

export const readStoredAuthSession = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const activeKind = window.localStorage.getItem(APP_AUTH_ACTIVE_KIND_KEY) || 'user';
  const preferredLocalSession = readSessionFromStorage(window.localStorage, activeKind);
  if (preferredLocalSession) {
    return preferredLocalSession;
  }

  const fallbackLocalSession = readSessionFromStorage(window.localStorage, activeKind === 'company' ? 'user' : 'company');
  if (fallbackLocalSession) {
    return fallbackLocalSession;
  }

  const preferredSession = readSessionFromStorage(window.sessionStorage, activeKind);
  if (preferredSession) {
    writeSessionToStorage(window.localStorage, preferredSession, activeKind);
    window.localStorage.setItem(APP_AUTH_ACTIVE_KIND_KEY, activeKind);
    return preferredSession;
  }

  const fallbackSessionKind = activeKind === 'company' ? 'user' : 'company';
  const fallbackSession = readSessionFromStorage(window.sessionStorage, fallbackSessionKind);
  if (fallbackSession) {
    writeSessionToStorage(window.localStorage, fallbackSession, fallbackSessionKind);
    window.localStorage.setItem(APP_AUTH_ACTIVE_KIND_KEY, fallbackSessionKind);
    return fallbackSession;
  }

  return null;
};

export const persistAuthSession = (session, rememberMe = false) => {
  if (typeof window === 'undefined') {
    return;
  }

  const sessionKind = session?.user?.role === 'company' ? 'company' : 'user';
  clearStorageKeys(window.sessionStorage, 'all');
  clearStorageKeys(window.localStorage, 'all');
  writeSessionToStorage(window.localStorage, session, sessionKind);
  window.localStorage.setItem(APP_AUTH_REMEMBERED_KEY, rememberMe ? 'true' : 'false');
  window.localStorage.setItem(APP_AUTH_ACTIVE_KIND_KEY, sessionKind);
};

export const clearStoredAuthSession = (kind = 'all') => {
  if (typeof window === 'undefined') {
    return;
  }

  clearStorageKeys(window.localStorage, kind);
  clearStorageKeys(window.sessionStorage, kind);

  const activeKind = window.localStorage.getItem(APP_AUTH_ACTIVE_KIND_KEY);
  if (kind === 'all' || activeKind === kind) {
    window.localStorage.removeItem(APP_AUTH_REMEMBERED_KEY);
    window.localStorage.removeItem(APP_AUTH_ACTIVE_KIND_KEY);
  }
};

export const getStoredAuthToken = () => readStoredAuthSession()?.token || '';

export const createAuthHeaders = (headers = {}) => {
  const token = getStoredAuthToken();
  if (!token) {
    return headers;
  }

  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  };
};
