const APP_AUTH_TOKEN_KEY = 'ddo_auth_token';
const APP_AUTH_USER_KEY = 'ddo_auth_user';
const APP_AUTH_REMEMBERED_KEY = 'ddo_auth_remembered';

const readJson = (storage, key, fallback = null) => {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const clearStorageKeys = (storage) => {
  storage.removeItem(APP_AUTH_TOKEN_KEY);
  storage.removeItem(APP_AUTH_USER_KEY);
};

export const readStoredAuthSession = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const remembered = window.localStorage.getItem(APP_AUTH_REMEMBERED_KEY) === 'true';
  const primaryStorage = remembered ? window.localStorage : window.sessionStorage;
  const secondaryStorage = remembered ? window.sessionStorage : window.localStorage;

  const primaryToken = primaryStorage.getItem(APP_AUTH_TOKEN_KEY);
  const primaryUser = readJson(primaryStorage, APP_AUTH_USER_KEY);
  if (primaryToken && primaryUser) {
    return {
      token: primaryToken,
      user: primaryUser,
      rememberMe: remembered,
    };
  }

  const secondaryToken = secondaryStorage.getItem(APP_AUTH_TOKEN_KEY);
  const secondaryUser = readJson(secondaryStorage, APP_AUTH_USER_KEY);
  if (secondaryToken && secondaryUser) {
    return {
      token: secondaryToken,
      user: secondaryUser,
      rememberMe: !remembered,
    };
  }

  return null;
};

export const persistAuthSession = (session, rememberMe = false) => {
  if (typeof window === 'undefined') {
    return;
  }

  const targetStorage = rememberMe ? window.localStorage : window.sessionStorage;
  const otherStorage = rememberMe ? window.sessionStorage : window.localStorage;

  clearStorageKeys(otherStorage);
  targetStorage.setItem(APP_AUTH_TOKEN_KEY, session.token);
  targetStorage.setItem(APP_AUTH_USER_KEY, JSON.stringify(session.user));
  window.localStorage.setItem(APP_AUTH_REMEMBERED_KEY, rememberMe ? 'true' : 'false');
};

export const clearStoredAuthSession = () => {
  if (typeof window === 'undefined') {
    return;
  }

  clearStorageKeys(window.localStorage);
  clearStorageKeys(window.sessionStorage);
  window.localStorage.removeItem(APP_AUTH_REMEMBERED_KEY);
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
