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
  const localToken = window.localStorage.getItem(APP_AUTH_TOKEN_KEY);
  const localUser = readJson(window.localStorage, APP_AUTH_USER_KEY);
  if (localToken && localUser) {
    return {
      token: localToken,
      user: localUser,
      rememberMe: remembered,
    };
  }

  const sessionToken = window.sessionStorage.getItem(APP_AUTH_TOKEN_KEY);
  const sessionUser = readJson(window.sessionStorage, APP_AUTH_USER_KEY);
  if (sessionToken && sessionUser) {
    window.localStorage.setItem(APP_AUTH_TOKEN_KEY, sessionToken);
    window.localStorage.setItem(APP_AUTH_USER_KEY, JSON.stringify(sessionUser));
    return {
      token: sessionToken,
      user: sessionUser,
      rememberMe: true,
    };
  }

  return null;
};

export const persistAuthSession = (session, rememberMe = false) => {
  if (typeof window === 'undefined') {
    return;
  }

  clearStorageKeys(window.sessionStorage);
  window.localStorage.setItem(APP_AUTH_TOKEN_KEY, session.token);
  window.localStorage.setItem(APP_AUTH_USER_KEY, JSON.stringify(session.user));
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
