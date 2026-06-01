import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Wifi, Bluetooth, Bell, X, User, Phone, Mail, Users, Briefcase, Plus, ChevronDown, Smartphone, MoreVertical, Zap, HeartPulse, Gauge, Clock3, Leaf, Thermometer, Square, Lock, Check, LoaderCircle, RefreshCw, LayoutGrid, Search as SearchIcon, Settings, Music4, Volume, Volume1, Volume2, VolumeX, Shield, TriangleAlert, Eye, EyeOff, LogOut } from 'lucide-react';
import { FaWhatsapp, FaSpotify } from 'react-icons/fa';
import CenterSearch from './CenterSearch';
import BrandLogo from './BrandLogo';
import {
  clearStoredAuthSession,
  createAuthHeaders,
  persistAuthSession,
  readStoredAuthSession,
} from '../utils/appAuth';
import { API_BASE_URL, buildApiUrl } from '../utils/api';

const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_PROFILE_URL = 'https://api.spotify.com/v1/me';
const SPOTIFY_SCOPES = 'user-read-private user-read-email user-top-read playlist-modify-public playlist-modify-private';
const SPOTIFY_PLAYLIST_ID = '3JiykyOcsQUbfaa6hBydNr';
const SPOTIFY_PLAYLIST_TRACK_URIS = [
  'spotify:track:0lYBSQXN6rCTvUZvg9S0lU',
  'spotify:track:3vuGwx5CP51j6c4xW1qD6y',
  'spotify:track:7qiZfU4dY1lWllzX7mPBI3',
  'spotify:track:6b3b7lILUJqXcp6w9wNQSm',
  'spotify:track:5HOlyK1Tpj6cbhNTg72z3O',
];
const APP_BOX_SELECTED_APPS_STORAGE_KEY = 'app_box_selected_apps';
const APP_BOX_SETTINGS_STORAGE_KEY = 'app_box_settings';
const APP_BOX_PRIVACY_STORAGE_KEY = 'app_box_privacy_settings';
const GOOGLE_IDENTITY_SCRIPT_ID = 'ddo-google-identity-services';
const REGISTER_API_URL = 'http://127.0.0.1:5000/api/auth/register';
const SPOTIFY_STORAGE_KEYS = {
  codeVerifier: 'spotify_code_verifier',
  state: 'spotify_auth_state',
  accessToken: 'spotify_access_token',
  refreshToken: 'spotify_refresh_token',
  expiresAt: 'spotify_expires_at',
  user: 'spotify_user_profile',
};
const COMPANY_LOGIN_API_URL = 'http://127.0.0.1:5000/api/company/login';

const readStoredSpotifyUser = () => {
  try {
    const rawUser = sessionStorage.getItem(SPOTIFY_STORAGE_KEYS.user);
    return rawUser ? JSON.parse(rawUser) : null;
  } catch {
    return null;
  }
};

const readStoredAppBoxSelections = () => {
  try {
    const raw = localStorage.getItem(APP_BOX_SELECTED_APPS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const createStoredAppSelection = (app, visual = {}) => ({
  id: app.id,
  name: app.name,
  shortcutPath: app.shortcutPath || '',
  appPath: visual.targetPath || app.targetPath || '',
  iconDataUrl: visual.iconDataUrl || app.iconDataUrl || '',
});

const readStoredAppBoxSettings = () => {
  try {
    const raw = localStorage.getItem(APP_BOX_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return { appView: 'dock', iconSize: 'medium', dockAnimation: true };
    }

    const parsed = JSON.parse(raw);
    return {
      appView: parsed.appView === 'grid' ? 'grid' : 'dock',
      iconSize: ['small', 'medium', 'large'].includes(parsed.iconSize) ? parsed.iconSize : 'medium',
      dockAnimation: parsed.dockAnimation !== false,
    };
  } catch {
    return { appView: 'dock', iconSize: 'medium', dockAnimation: true };
  }
};

const readStoredAppBoxPrivacySettings = () => {
  try {
    const raw = localStorage.getItem(APP_BOX_PRIVACY_STORAGE_KEY);
    if (!raw) {
      return {
        mode: 'local',
        trackingDisabled: true,
        analyticsDisabled: true,
        pinEnabled: false,
        pin: '',
      };
    }

    const parsed = JSON.parse(raw);
    return {
      mode: parsed.mode === 'private' ? 'private' : 'local',
      trackingDisabled: parsed.trackingDisabled !== false,
      analyticsDisabled: parsed.analyticsDisabled !== false,
      pinEnabled: Boolean(parsed.pinEnabled),
      pin: typeof parsed.pin === 'string' ? parsed.pin : '',
    };
  } catch {
    return {
      mode: 'local',
      trackingDisabled: true,
      analyticsDisabled: true,
      pinEnabled: false,
      pin: '',
    };
  }
};

const createSpotifyVerifier = (length = 64) => {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = window.crypto.getRandomValues(new Uint8Array(length));
  return Array.from(randomValues, (value) => charset[value % charset.length]).join('');
};

const toBase64Url = (buffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const createSpotifyChallenge = async (verifier) => {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', encoded);
  return toBase64Url(digest);
};

const getSpotifyHomeUri = () => `${window.location.origin}/`;
const getSpotifyCallbackUri = () => `${window.location.origin}/callback`;
const isLoopbackSpotifyOrigin = () => {
  const { hostname, protocol } = window.location;
  return protocol === 'http:' && (hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1');
};
const isSecureSpotifyOrigin = () => window.location.protocol === 'https:' || isLoopbackSpotifyOrigin();
const SPOTIFY_LOOPBACK_REDIRECT_URI = 'http://127.0.0.1:3000/callback';
const getSpotifyRedirectUri = () => {
  const configuredUri = import.meta.env.VITE_SPOTIFY_REDIRECT_URI?.trim();
  if (!configuredUri) {
    return getSpotifyCallbackUri();
  }

  try {
    const runtimeUri = new URL(getSpotifyCallbackUri());
    const parsedConfiguredUri = new URL(configuredUri);
    const runtimeRoute = `${runtimeUri.protocol}//${runtimeUri.host}${runtimeUri.pathname}`;
    const configuredRoute = `${parsedConfiguredUri.protocol}//${parsedConfiguredUri.host}${parsedConfiguredUri.pathname}`;

    if (runtimeRoute !== configuredRoute) {
      return getSpotifyCallbackUri();
    }
  } catch {
    return getSpotifyCallbackUri();
  }

  return configuredUri || SPOTIFY_LOOPBACK_REDIRECT_URI;
};

const clearSpotifySession = () => {
  Object.values(SPOTIFY_STORAGE_KEYS).forEach((key) => sessionStorage.removeItem(key));
};

async function refreshSpotifyAccessToken() {
  const refreshToken = sessionStorage.getItem(SPOTIFY_STORAGE_KEYS.refreshToken);
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;

  if (!refreshToken || !clientId) {
    throw new Error('Spotify session expired. Please log in again.');
  }

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error('Spotify session refresh failed.');
  }

  const payload = await response.json();
  sessionStorage.setItem(SPOTIFY_STORAGE_KEYS.accessToken, payload.access_token);
  if (payload.refresh_token) {
    sessionStorage.setItem(SPOTIFY_STORAGE_KEYS.refreshToken, payload.refresh_token);
  }
  sessionStorage.setItem(
    SPOTIFY_STORAGE_KEYS.expiresAt,
    String(Date.now() + (payload.expires_in ?? 3600) * 1000),
  );

  return payload.access_token;
}

async function fetchWebApi(endpoint, method, body) {
  const performRequest = async (authToken) => {
    const res = await fetch(`https://api.spotify.com/${endpoint}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      method,
      body: body ? JSON.stringify(body) : undefined,
    });

    return res;
  };

  const token = sessionStorage.getItem(SPOTIFY_STORAGE_KEYS.accessToken);
  if (!token) {
    throw new Error('Spotify login is required to load this data.');
  }
  let response = await performRequest(token);

  if (response.status === 401 && sessionStorage.getItem(SPOTIFY_STORAGE_KEYS.refreshToken)) {
    const refreshedToken = await refreshSpotifyAccessToken();
    response = await performRequest(refreshedToken);
  }

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.error?.message || 'Spotify data could not be loaded right now.');
  }

  return await response.json();
}

async function getTopTracks() {
  return (
    await fetchWebApi(
      'v1/me/top/tracks?time_range=long_term&limit=5',
      'GET',
    )
  ).items;
}

async function createPlaylist(name = 'My top tracks playlist', tracksUri = SPOTIFY_PLAYLIST_TRACK_URIS) {
  const playlist = await fetchWebApi(
    'v1/me/playlists',
    'POST',
    {
      name,
      description: 'Playlist created by the tutorial on developer.spotify.com',
      public: false,
    },
  );

  await fetchWebApi(
    `v1/playlists/${playlist.id}/items?uris=${tracksUri.join(',')}`,
    'POST',
  );

  return playlist;
}

async function requestBackendJson(
  endpoint,
  options = {},
  {
    requiresAuth = false,
    fallbackMessage = 'Request failed.',
    onUnauthorized,
  } = {},
) {
  try {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    const response = await fetch(buildApiUrl(endpoint), {
      ...options,
      headers: requiresAuth ? createAuthHeaders(headers) : headers,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload.error || fallbackMessage;
      if (response.status === 401) {
        onUnauthorized?.(message);
      }
      throw new Error(message);
    }

    return payload;
  } catch (error) {
    console.error('Backend request failed:', error);
    const isNetworkFailure = error instanceof TypeError
      || /failed to fetch|networkerror|load failed/i.test(String(error?.message || ''));

    if (isNetworkFailure) {
      throw new Error(`Backend not running at ${API_BASE_URL}. Start \`node server.mjs\` and try again.`, { cause: error });
    }

    throw error instanceof Error ? error : new Error(fallbackMessage, { cause: error });
  }
}

const RightTray = ({ onPopupStateChange = () => {} }) => {
  const [time, setTime] = useState(new Date());
  
  // Time Popup States
  const [isTimePopupOpen, setIsTimePopupOpen] = useState(false);
  const timePopupRef = useRef(null);
  const [isBatteryPopupOpen, setIsBatteryPopupOpen] = useState(false);
  const batteryPopupRef = useRef(null);
  const wifiPopupRef = useRef(null);
  const loadWifiNetworksRef = useRef(async () => {});
  const bluetoothPopupRef = useRef(null);
  const loadBluetoothSnapshotRef = useRef(async () => {});
  const [isWifiDropdownOpen, setIsWifiDropdownOpen] = useState(false);
  const [wifiNetworks, setWifiNetworks] = useState([]);
  const [wifiBusyNetworkId, setWifiBusyNetworkId] = useState(null);
  const [isWifiLoading, setIsWifiLoading] = useState(false);
  const [wifiError, setWifiError] = useState('');
  const [wifiInterfaceName, setWifiInterfaceName] = useState('Wi-Fi');
  const [isWifiOnline, setIsWifiOnline] = useState(false);
  const [wifiPasswordPrompt, setWifiPasswordPrompt] = useState(null);
  const [wifiPasswordInput, setWifiPasswordInput] = useState('');
  const [wifiPasswordError, setWifiPasswordError] = useState('');
  const [isBluetoothPopupOpen, setIsBluetoothPopupOpen] = useState(false);
  const [bluetoothDevices, setBluetoothDevices] = useState([]);
  const [isBluetoothEnabled, setIsBluetoothEnabled] = useState(false);
  const [bluetoothConnectedDevice, setBluetoothConnectedDevice] = useState(null);
  const [isBluetoothLoading, setIsBluetoothLoading] = useState(false);
  const [bluetoothBusyDeviceId, setBluetoothBusyDeviceId] = useState('');
  const [bluetoothError, setBluetoothError] = useState('');
  const [bluetoothScannedAt, setBluetoothScannedAt] = useState('');
  const [isBluetoothSupported, setIsBluetoothSupported] = useState(true);
  const spotifyPopupRef = useRef(null);
  const spotifyNowPlayingRef = useRef(null);
  const spotifyPlayerHostRef = useRef(null);
  const spotifyEmbedControllerRef = useRef(null);
  const [showSpotifyPopup, setShowSpotifyPopup] = useState(false);
  const [spotifyUser, setSpotifyUser] = useState(() => readStoredSpotifyUser());
  const [spotifyAuthStatus, setSpotifyAuthStatus] = useState(() => (readStoredSpotifyUser() ? 'connected' : 'idle'));
  const [spotifyAuthError, setSpotifyAuthError] = useState('');
  const [spotifyTopTracks, setSpotifyTopTracks] = useState([]);
  const [isSpotifyTracksLoading, setIsSpotifyTracksLoading] = useState(false);
  const [spotifyPlaylistStatus, setSpotifyPlaylistStatus] = useState('');
  const [isSpotifyPlaylistCreating, setIsSpotifyPlaylistCreating] = useState(false);
  const [spotifyActiveView, setSpotifyActiveView] = useState('none');
  const [spotifyPlaylistName, setSpotifyPlaylistName] = useState('My top tracks playlist');
  const [isSpotifyPlayerMounted, setIsSpotifyPlayerMounted] = useState(false);
  const [isSpotifyPlayerReady, setIsSpotifyPlayerReady] = useState(false);
  const [showSpotifyNowPlayingPopup, setShowSpotifyNowPlayingPopup] = useState(false);
  const [spotifyPlayback, setSpotifyPlayback] = useState({
    title: 'Recommendation Playlist',
    artist: 'Spotify',
    albumImage: '',
    isPlaying: false,
  });
  const [hasSpotifyBackgroundSession, setHasSpotifyBackgroundSession] = useState(false);
  const [spotifyVolume, setSpotifyVolume] = useState(70);
  const [isUserLoginOpen, setIsUserLoginOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isCompanyLoginOpen, setIsCompanyLoginOpen] = useState(false);
  const [isUsStatusPopupOpen, setIsUsStatusPopupOpen] = useState(false);
  const [isCompanyDashboardOpen, setIsCompanyDashboardOpen] = useState(() => readStoredAuthSession()?.user?.role === 'company');
  const [companyDashboardSection, setCompanyDashboardSection] = useState('none');
  const [usStatusActiveSection, setUsStatusActiveSection] = useState('none');
  const [isUsSideSettingsOpen, setIsUsSideSettingsOpen] = useState(false);
  const [usSideSettingsSection, setUsSideSettingsSection] = useState('profile');
  const [appAuthSession, setAppAuthSession] = useState(() => readStoredAuthSession());
  const [companyDashboardData, setCompanyDashboardData] = useState(null);
  const [isCompanyDashboardLoading, setIsCompanyDashboardLoading] = useState(false);
  const [companyDashboardError, setCompanyDashboardError] = useState('');
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
    rememberMe: false,
  });
  const [loginError, setLoginError] = useState('');
  const [isLoginSubmitting, setIsLoginSubmitting] = useState(false);
  const [companyLoginForm, setCompanyLoginForm] = useState({
    companyId: '',
    companyKey: '',
    companyPassword: '',
  });
  const [companyLoginError, setCompanyLoginError] = useState('');
  const [companyLoginStatus, setCompanyLoginStatus] = useState('');
  const [isCompanyLoginSubmitting, setIsCompanyLoginSubmitting] = useState(false);
  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState('');
  const [deleteAccountError, setDeleteAccountError] = useState('');
  const [deleteAccountStatus, setDeleteAccountStatus] = useState('');
  const [isDeleteAccountSubmitting, setIsDeleteAccountSubmitting] = useState(false);
  const [passwordVisibility, setPasswordVisibility] = useState({
    loginPassword: false,
    registerPassword: false,
    registerConfirmPassword: false,
    companyPassword: false,
    deleteAccountPassword: false,
  });
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [isNotificationsLoading, setIsNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState('');
  const [registerForm, setRegisterForm] = useState({
    email: '',
    firstName: '',
    middleName: '',
    lastName: '',
    moreInformation: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
  });
  const [registerErrors, setRegisterErrors] = useState({});
  const [registerStatus, setRegisterStatus] = useState('');
  const [isRegisterSubmitting, setIsRegisterSubmitting] = useState(false);
  const googleTokenClientRef = useRef(null);
  const usStatusPopupRef = useRef(null);
  const usSideSettingsRef = useRef(null);
  const notificationsPopupRef = useRef(null);
  const companyDashboardRef = useRef(null);
  const companyDashboardNestedRef = useRef(null);
  const [studySecondsLeft, setStudySecondsLeft] = useState(25 * 60);
  const [isStudyTimerRunning, setIsStudyTimerRunning] = useState(false);
  const [usVolume, setUsVolume] = useState(65);
  const [isUsMuted, setIsUsMuted] = useState(false);
  const [prevUsVolume, setPrevUsVolume] = useState(65);
  const [isSearchPopupOpen, setIsSearchPopupOpen] = useState(false);
  const appLauncherRef = useRef(null);
  const appSettingsPopupRef = useRef(null);
  const appPrivacyPopupRef = useRef(null);
  const appSecurityPopupRef = useRef(null);
  const [isAppLauncherOpen, setIsAppLauncherOpen] = useState(false);
  const [isAppPickerOpen, setIsAppPickerOpen] = useState(false);
  const [isAppSettingsOpen, setIsAppSettingsOpen] = useState(false);
  const [isAppPrivacyOpen, setIsAppPrivacyOpen] = useState(false);
  const [isAppSecurityOpen, setIsAppSecurityOpen] = useState(false);
  const [appPrivacyPosition, setAppPrivacyPosition] = useState({ top: 0, left: 0, side: 'right' });
  const [appSecurityPosition, setAppSecurityPosition] = useState({ top: 0, left: 0, side: 'right' });
  const [isResetAppsConfirmOpen, setIsResetAppsConfirmOpen] = useState(false);
  const [isSecurityStatusLoading, setIsSecurityStatusLoading] = useState(false);
  const [securityStatusError, setSecurityStatusError] = useState('');
  const [securityStatus, setSecurityStatus] = useState(null);
  const [installedApps, setInstalledApps] = useState([]);
  const [isAppsLoading, setIsAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState('');
  const [appPickerQuery, setAppPickerQuery] = useState('');
  const [selectedApps, setSelectedApps] = useState(() => readStoredAppBoxSelections());
  const [appVisuals, setAppVisuals] = useState({});
  const [appBoxSettings, setAppBoxSettings] = useState(() => readStoredAppBoxSettings());
  const [appPrivacySettings, setAppPrivacySettings] = useState(() => readStoredAppBoxPrivacySettings());
  const [privacyPinDraft, setPrivacyPinDraft] = useState(() => readStoredAppBoxPrivacySettings().pin || '');

  // WhatsApp Popup States
  const [isWaOpen, setIsWaOpen] = useState(false);
  const [isWaSendMsgOpen, setIsWaSendMsgOpen] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [waMessage, setWaMessage] = useState('');
  const waPopupRef = useRef(null);

  // Contact Popup States
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: '',
    phone: '',
  });
  const [editingContactPhone, setEditingContactPhone] = useState(null);

  const [isContactSelectOpen, setIsContactSelectOpen] = useState(false);
  const [activeMenuContact, setActiveMenuContact] = useState(null);
  const [detailsContact, setDetailsContact] = useState(null);

  const [savedContacts, setSavedContacts] = useState(() => {
    try {
      const saved = localStorage.getItem('waContacts');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });


  // Phone History State
  const [phoneHistory, setPhoneHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('waPhoneHistory');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [batteryInfo, setBatteryInfo] = useState({
    level: 0.85,
    charging: false,
    chargingTime: Infinity,
    dischargingTime: 3.6 * 60 * 60,
    health: 96,
    voltage: 11.9,
    chargingSpeed: 0,
    temperature: 31,
    saverMode: false,
  });

  // Time Interval
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem('waPhoneHistory', JSON.stringify(phoneHistory));
  }, [phoneHistory]);

  useEffect(() => {
    localStorage.setItem(APP_BOX_SELECTED_APPS_STORAGE_KEY, JSON.stringify(selectedApps));
  }, [selectedApps]);

  useEffect(() => {
    localStorage.setItem(APP_BOX_SETTINGS_STORAGE_KEY, JSON.stringify(appBoxSettings));
  }, [appBoxSettings]);

  useEffect(() => {
    localStorage.setItem(APP_BOX_PRIVACY_STORAGE_KEY, JSON.stringify(appPrivacySettings));
  }, [appPrivacySettings]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('companyLogin') === '1') {
      params.delete('companyLogin');
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`;
      window.history.replaceState({}, '', nextUrl);
    }
  }, []);

  const applyWifiSnapshot = (snapshot) => {
    setWifiNetworks(Array.isArray(snapshot.networks) ? snapshot.networks : []);
    setWifiInterfaceName(snapshot.interfaceName || 'Wi-Fi');
    setIsWifiOnline(Boolean(snapshot.online));
  };

  const handleProtectedRequestFailure = useCallback((message) => {
    if (/session expired|authentication required|unauthorized|log in/i.test(message)) {
      const isCompanySession = appAuthSession?.user?.role === 'company';
      clearStoredAuthSession(isCompanySession ? 'company' : 'user');
      setAppAuthSession(null);
      setIsUsStatusPopupOpen(false);
      setIsCompanyDashboardOpen(false);
      setIsUsSideSettingsOpen(false);
      setUsSideSettingsSection('profile');
      setUsStatusActiveSection('none');
      setIsRegisterOpen(false);
      if (isCompanySession) {
        setCompanyDashboardError('');
        setCompanyLoginError(message);
        setIsCompanyLoginOpen(true);
      } else {
        setLoginError(message);
        setIsUserLoginOpen(true);
      }
    }
  }, [appAuthSession?.user?.role]);

  const requestWifi = async (endpoint, options = {}) => {
    return requestBackendJson(endpoint, options, {
      requiresAuth: options.requiresAuth === true,
      fallbackMessage: 'Wi-Fi service is unavailable.',
      onUnauthorized: handleProtectedRequestFailure,
    });
  };

  const applyBluetoothSnapshot = useCallback((snapshot) => {
    setIsBluetoothSupported(snapshot.supported !== false);
    setIsBluetoothEnabled(Boolean(snapshot.enabled));
    setBluetoothConnectedDevice(snapshot.connectedDevice || null);
    setBluetoothDevices(Array.isArray(snapshot.devices) ? snapshot.devices : []);
    setBluetoothScannedAt(String(snapshot.scannedAt || ''));
  }, []);

  const requestBluetooth = async (endpoint, options = {}) => {
    return requestBackendJson(endpoint, options, {
      fallbackMessage: 'Bluetooth service unavailable',
    });
  };

  const requestNotifications = async (endpoint, options = {}) => {
    const headers = createAuthHeaders({
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    });

    return requestBackendJson(endpoint, {
      ...options,
      headers,
    }, {
      fallbackMessage: 'Notifications unavailable',
    });
  };

  const loadBluetoothSnapshot = useCallback(async (mode = 'status', showLoader = true) => {
    try {
      if (showLoader) {
        setIsBluetoothLoading(true);
      }
      setBluetoothError('');

      const endpoint = mode === 'scan' ? '/api/bluetooth/devices' : '/api/bluetooth/status';
      const payload = await requestBluetooth(endpoint, { method: 'GET' });
      applyBluetoothSnapshot(payload);
    } catch (error) {
      setBluetoothError(error.message || 'Bluetooth service unavailable');
    } finally {
      if (showLoader) {
        setIsBluetoothLoading(false);
      }
    }
  }, [applyBluetoothSnapshot]);

  const loadSecurityStatus = useCallback(async () => {
    setIsSecurityStatusLoading(true);
    setSecurityStatusError('');
    setSecurityStatus(null);

    try {
      const payload = await requestBackendJson('/api/security/status', { method: 'GET' }, {
        fallbackMessage: 'Security status unavailable.',
      });

      setSecurityStatus({
        fileUploadProtection: Boolean(payload.fileUploadProtection),
        linkProtection: Boolean(payload.linkProtection),
        loginProtection: Boolean(payload.loginProtection),
        apiKeyProtection: Boolean(payload.apiKeyProtection),
      });
    } catch {
      setSecurityStatus(null);
      setSecurityStatusError('Security status unavailable.');
    } finally {
      setIsSecurityStatusLoading(false);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      setIsNotificationsLoading(true);
      setNotificationsError('');
      const payload = await requestNotifications('/api/notifications', { method: 'GET' });
      setNotifications(Array.isArray(payload.notifications) ? payload.notifications : []);
    } catch (error) {
      setNotifications([]);
      setNotificationsError(error.message || 'Notifications unavailable');
    } finally {
      setIsNotificationsLoading(false);
    }
  }, []);

  const loadCompanyDashboard = useCallback(async () => {
    setIsCompanyDashboardLoading(true);
    setCompanyDashboardError('');

    try {
      const [dashboardPayload, detailsPayload, employeesPayload, devStatusPayload] = await Promise.all([
        requestBackendJson('/api/company/dashboard', { method: 'GET' }, {
          requiresAuth: true,
          fallbackMessage: 'Unable to load company dashboard.',
          onUnauthorized: handleProtectedRequestFailure,
        }),
        requestBackendJson('/api/company/details', { method: 'GET' }, {
          requiresAuth: true,
          fallbackMessage: 'Unable to load company details.',
          onUnauthorized: handleProtectedRequestFailure,
        }),
        requestBackendJson('/api/company/employees', { method: 'GET' }, {
          requiresAuth: true,
          fallbackMessage: 'Unable to load company employees.',
          onUnauthorized: handleProtectedRequestFailure,
        }),
        requestBackendJson('/api/company/dev-status', { method: 'GET' }, {
          requiresAuth: true,
          fallbackMessage: 'Unable to load developer mode.',
          onUnauthorized: handleProtectedRequestFailure,
        }),
      ]);

      setCompanyDashboardData({
        company: dashboardPayload.company || null,
        details: detailsPayload.company || dashboardPayload.details || null,
        employees: Array.isArray(employeesPayload.employees) ? employeesPayload.employees : [],
        loginActivity: Array.isArray(dashboardPayload.loginActivity) ? dashboardPayload.loginActivity : [],
        submittedForms: Array.isArray(dashboardPayload.submittedForms) ? dashboardPayload.submittedForms : [],
        securityStatus: dashboardPayload.securityStatus || null,
        developerMode: devStatusPayload.developerMode || dashboardPayload.developerMode || null,
        stats: dashboardPayload.stats || null,
      });
    } catch (error) {
      setCompanyDashboardData(null);
      setCompanyDashboardError(error.message || 'Unable to load company dashboard.');
    } finally {
      setIsCompanyDashboardLoading(false);
    }
  }, [handleProtectedRequestFailure]);

  const openCompanyDashboard = useCallback(() => {
    setIsRegisterOpen(false);
    setIsUserLoginOpen(false);
    setIsCompanyLoginOpen(false);
    setIsUsStatusPopupOpen(false);
    setIsUsSideSettingsOpen(false);
    setUsSideSettingsSection('profile');
    setUsStatusActiveSection('none');
    setCompanyDashboardSection('none');
    setIsCompanyDashboardOpen(true);
    void loadCompanyDashboard();
  }, [loadCompanyDashboard]);

  useEffect(() => {
    const storedSession = readStoredAuthSession();
    if (!storedSession?.token) {
      return;
    }

    let isActive = true;
    void requestBackendJson('/api/auth/session', { method: 'GET' }, {
      requiresAuth: true,
      fallbackMessage: 'Unable to validate your session.',
      onUnauthorized: handleProtectedRequestFailure,
    })
      .then((payload) => {
        if (!isActive) {
          return;
        }
        setAppAuthSession((current) => (current ? { ...current, user: payload.user } : storedSession));
        if (payload.user?.role === 'company') {
          openCompanyDashboard();
        }
      })
      .catch(() => {
        if (!isActive) {
          return;
        }
        clearStoredAuthSession();
        setAppAuthSession(null);
      });

    return () => {
      isActive = false;
    };
  }, [handleProtectedRequestFailure, openCompanyDashboard]);

  const loadWifiNetworks = async (showLoader = true) => {
    try {
      if (showLoader) {
        setIsWifiLoading(true);
      }
      setWifiError('');

      const payload = await requestWifi('/api/wifi/status');
      applyWifiSnapshot(payload);
    } catch (error) {
      setWifiError(error.message || 'Unable to read Wi-Fi status.');
    } finally {
      if (showLoader) {
        setIsWifiLoading(false);
      }
    }
  };

  useEffect(() => {
    loadWifiNetworksRef.current = loadWifiNetworks;
  });

  useEffect(() => {
    loadBluetoothSnapshotRef.current = loadBluetoothSnapshot;
  }, [loadBluetoothSnapshot]);

  useEffect(() => {
    const kickoffTimer = window.setTimeout(() => {
      void loadWifiNetworksRef.current(false);
    }, 0);

    const refreshTimer = window.setInterval(() => {
      void loadWifiNetworksRef.current(false);
    }, 15000);

    return () => {
      window.clearTimeout(kickoffTimer);
      window.clearInterval(refreshTimer);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const fetchSpotifyProfile = async (accessToken) => {
      const response = await fetch(SPOTIFY_PROFILE_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Unable to load Spotify profile right now.');
      }

      return response.json();
    };

    const persistSpotifyToken = (payload) => {
      sessionStorage.setItem(SPOTIFY_STORAGE_KEYS.accessToken, payload.access_token);
      if (payload.refresh_token) {
        sessionStorage.setItem(SPOTIFY_STORAGE_KEYS.refreshToken, payload.refresh_token);
      }
      sessionStorage.setItem(
        SPOTIFY_STORAGE_KEYS.expiresAt,
        String(Date.now() + (payload.expires_in ?? 3600) * 1000),
      );
    };

    const exchangeSpotifyCode = async (code, verifier) => {
      const response = await fetch(SPOTIFY_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: import.meta.env.VITE_SPOTIFY_CLIENT_ID,
          grant_type: 'authorization_code',
          code,
          redirect_uri: getSpotifyRedirectUri(),
          code_verifier: verifier,
        }),
      });

      if (!response.ok) {
        throw new Error('Spotify sign-in could not be completed.');
      }

      return response.json();
    };

    const refreshSpotifyToken = async (refreshToken) => {
      const response = await fetch(SPOTIFY_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: import.meta.env.VITE_SPOTIFY_CLIENT_ID,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        throw new Error('Spotify session refresh failed.');
      }

      return response.json();
    };

    const finishSpotifySignIn = async (accessToken) => {
      const profile = await fetchSpotifyProfile(accessToken);

      if (!active) {
        return;
      }

      sessionStorage.setItem(SPOTIFY_STORAGE_KEYS.user, JSON.stringify(profile));
      setSpotifyUser(profile);
      setSpotifyAuthStatus('connected');
      setSpotifyAuthError('');
      setShowSpotifyPopup(true);
    };

    const syncSpotifyAuth = async () => {
      const params = new URLSearchParams(window.location.search);
      const returnedCode = params.get('code');
      const returnedState = params.get('state');
      const returnedError = params.get('error');
      const isCallbackPage = window.location.pathname === '/callback';

      if (isCallbackPage && !returnedCode && !returnedError) {
        if (!active) {
          return;
        }
        setSpotifyAuthStatus('error');
        setSpotifyAuthError('Spotify login failed. Please try again.');
        setShowSpotifyPopup(true);
        window.history.replaceState({}, document.title, getSpotifyHomeUri());
        return;
      }

      if (returnedError) {
        if (!active) {
          return;
        }
        setSpotifyAuthStatus('error');
        setSpotifyAuthError('Spotify sign-in was cancelled or denied.');
        setShowSpotifyPopup(true);
        window.history.replaceState({}, document.title, getSpotifyHomeUri());
        return;
      }

      if (returnedCode) {
        const storedState = sessionStorage.getItem(SPOTIFY_STORAGE_KEYS.state);
        const verifier = sessionStorage.getItem(SPOTIFY_STORAGE_KEYS.codeVerifier);
        window.history.replaceState({}, document.title, getSpotifyHomeUri());

        if (!storedState || !verifier || storedState !== returnedState) {
          clearSpotifySession();
          if (!active) {
            return;
          }
          setSpotifyAuthStatus('error');
          setSpotifyAuthError('Spotify sign-in could not be verified. Please try again.');
          setShowSpotifyPopup(true);
          return;
        }

        try {
          setSpotifyAuthStatus('loading');
          const tokenPayload = await exchangeSpotifyCode(returnedCode, verifier);
          persistSpotifyToken(tokenPayload);
        sessionStorage.removeItem(SPOTIFY_STORAGE_KEYS.codeVerifier);
        sessionStorage.removeItem(SPOTIFY_STORAGE_KEYS.state);
        await finishSpotifySignIn(tokenPayload.access_token);
        window.history.replaceState({}, document.title, getSpotifyHomeUri());
      } catch (error) {
        clearSpotifySession();
        if (!active) {
          return;
        }
          setSpotifyUser(null);
          setSpotifyAuthStatus('error');
          setSpotifyAuthError(error.message || 'Spotify sign-in failed.');
          setShowSpotifyPopup(true);
        }

        return;
      }

      const storedToken = sessionStorage.getItem(SPOTIFY_STORAGE_KEYS.accessToken);
      const storedRefreshToken = sessionStorage.getItem(SPOTIFY_STORAGE_KEYS.refreshToken);
      const storedExpiry = Number(sessionStorage.getItem(SPOTIFY_STORAGE_KEYS.expiresAt) || 0);

      if (!storedToken && !storedRefreshToken) {
        return;
      }

      try {
        setSpotifyAuthStatus(spotifyUser ? 'connected' : 'loading');

        let activeToken = storedToken;
        if (!activeToken || (storedExpiry && Date.now() >= storedExpiry - 60_000)) {
          if (!storedRefreshToken) {
            throw new Error('Spotify session expired. Please log in again.');
          }

          const refreshedPayload = await refreshSpotifyToken(storedRefreshToken);
          persistSpotifyToken(refreshedPayload);
          activeToken = refreshedPayload.access_token;
        }

        if (spotifyUser) {
          setSpotifyAuthStatus('connected');
          return;
        }

        await finishSpotifySignIn(activeToken);
      } catch (error) {
        clearSpotifySession();
        if (!active) {
          return;
        }
        setSpotifyUser(null);
        setSpotifyAuthStatus('idle');
        setSpotifyAuthError(error.message || 'Spotify session expired.');
      }
    };

    syncSpotifyAuth();

    return () => {
      active = false;
    };
  }, [spotifyUser]);

  useEffect(() => {
    let batteryManager;
    let mounted = true;

    const syncBattery = (battery) => {
      const level = typeof battery.level === 'number' ? battery.level : 0.85;
      const charging = Boolean(battery.charging);
      const chargingTime = Number.isFinite(battery.chargingTime) ? battery.chargingTime : Infinity;
      const dischargingTime = Number.isFinite(battery.dischargingTime) ? battery.dischargingTime : Infinity;
      const percentage = Math.round(level * 100);
      const chargingSpeed = charging ? Math.max(18, Math.round(24 + (1 - level) * 48)) : 0;
      const temperature = charging ? Math.round(31 + (1 - level) * 6) : Math.round(27 + (1 - level) * 5);
      const voltage = Number((10.8 + level * 1.8 + (charging ? 0.2 : 0)).toFixed(1));
      const health = Math.max(88, Math.min(100, 92 + Math.round(level * 7)));

      if (!mounted) {
        return;
      }

      setBatteryInfo({
        level,
        charging,
        chargingTime,
        dischargingTime,
        health,
        voltage,
        chargingSpeed,
        temperature,
        saverMode: !charging && percentage <= 25,
      });
    };

    const attachBattery = async () => {
      if (!('getBattery' in navigator)) {
        return;
      }

      batteryManager = await navigator.getBattery();
      syncBattery(batteryManager);

      const handleBatteryChange = () => syncBattery(batteryManager);
      batteryManager.addEventListener('levelchange', handleBatteryChange);
      batteryManager.addEventListener('chargingchange', handleBatteryChange);
      batteryManager.addEventListener('chargingtimechange', handleBatteryChange);
      batteryManager.addEventListener('dischargingtimechange', handleBatteryChange);

      return () => {
        batteryManager.removeEventListener('levelchange', handleBatteryChange);
        batteryManager.removeEventListener('chargingchange', handleBatteryChange);
        batteryManager.removeEventListener('chargingtimechange', handleBatteryChange);
        batteryManager.removeEventListener('dischargingtimechange', handleBatteryChange);
      };
    };

    let detach;
    attachBattery().then((cleanup) => {
      detach = cleanup;
    }).catch(() => {
      // Keep the animated fallback battery values if the API is unavailable.
    });

    return () => {
      mounted = false;
      if (detach) {
        detach();
      }
    };
  }, []);

  // Time Popup Click Outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (timePopupRef.current && !timePopupRef.current.contains(event.target)) {
        setIsTimePopupOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const handleBatteryClickOutside = (event) => {
      if (batteryPopupRef.current && !batteryPopupRef.current.contains(event.target)) {
        setIsBatteryPopupOpen(false);
      }
    };

    document.addEventListener('mousedown', handleBatteryClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleBatteryClickOutside);
    };
  }, []);

  useEffect(() => {
    const handleWifiClickOutside = (event) => {
      if (wifiPopupRef.current && !wifiPopupRef.current.contains(event.target)) {
        setIsWifiDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleWifiClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleWifiClickOutside);
    };
  }, []);

  useEffect(() => {
    const handleBluetoothClickOutside = (event) => {
      if (bluetoothPopupRef.current && !bluetoothPopupRef.current.contains(event.target)) {
        setIsBluetoothPopupOpen(false);
      }
    };

    document.addEventListener('mousedown', handleBluetoothClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleBluetoothClickOutside);
    };
  }, []);

  useEffect(() => {
    const handleNotificationsClickOutside = (event) => {
      if (notificationsPopupRef.current && !notificationsPopupRef.current.contains(event.target)) {
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleNotificationsClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleNotificationsClickOutside);
    };
  }, []);

  useEffect(() => {
    const handleSpotifyClickOutside = (event) => {
      if (spotifyNowPlayingRef.current && spotifyNowPlayingRef.current.contains(event.target)) {
        return;
      }

      if (spotifyPopupRef.current && !spotifyPopupRef.current.contains(event.target)) {
        setShowSpotifyPopup(false);
        setSpotifyActiveView('none');
      }

      if (spotifyNowPlayingRef.current && !spotifyNowPlayingRef.current.contains(event.target)) {
        setShowSpotifyNowPlayingPopup(false);
      }
    };

    document.addEventListener('mousedown', handleSpotifyClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleSpotifyClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!isSpotifyPlayerMounted || !spotifyPlayerHostRef.current || spotifyEmbedControllerRef.current) {
      return undefined;
    }

    let cancelled = false;

    const initializeSpotifyPlayer = (IFrameAPI) => {
      if (cancelled || !spotifyPlayerHostRef.current || spotifyEmbedControllerRef.current) {
        return;
      }

      const options = {
        width: '100%',
        height: 360,
        uri: `spotify:playlist:${SPOTIFY_PLAYLIST_ID}`,
      };

      IFrameAPI.createController(spotifyPlayerHostRef.current, options, (EmbedController) => {
        if (cancelled) {
          EmbedController.destroy?.();
          return;
        }

        spotifyEmbedControllerRef.current = EmbedController;
        setIsSpotifyPlayerReady(true);

        EmbedController.addListener?.('ready', () => {
          setIsSpotifyPlayerReady(true);
        });

        EmbedController.addListener?.('playback_started', () => {
          setHasSpotifyBackgroundSession(true);
          setSpotifyPlayback((current) => ({
            ...current,
            isPlaying: true,
          }));
        });

        EmbedController.addListener?.('playback_update', (event) => {
          setSpotifyPlayback((current) => ({
            ...current,
            isPlaying: !event?.data?.isPaused,
          }));
        });
      });
    };

    const existingApi = window.SpotifyIframeApi;
    const previousReadyHandler = window.onSpotifyIframeApiReady;
    window.onSpotifyIframeApiReady = (IFrameAPI) => {
      window.SpotifyIframeApi = IFrameAPI;
      if (typeof previousReadyHandler === 'function') {
        previousReadyHandler(IFrameAPI);
      }
      initializeSpotifyPlayer(IFrameAPI);
    };

    if (existingApi) {
      initializeSpotifyPlayer(existingApi);
    } else if (!document.querySelector('script[data-spotify-iframe-api="true"]')) {
      const script = document.createElement('script');
      script.src = 'https://open.spotify.com/embed/iframe-api/v1';
      script.async = true;
      script.dataset.spotifyIframeApi = 'true';
      document.body.appendChild(script);
    }

    return () => {
      cancelled = true;
    };
  }, [isSpotifyPlayerMounted]);

  useEffect(() => {
    if (!isSpotifyPlayerMounted) {
      return undefined;
    }

    let active = true;

    const loadSpotifyPlaybackState = async () => {
      const performFetch = async (accessToken) =>
        fetch('https://api.spotify.com/v1/me/player/currently-playing', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

      const accessToken = sessionStorage.getItem(SPOTIFY_STORAGE_KEYS.accessToken);
      if (!accessToken) {
        return;
      }

      try {
        let response = await performFetch(accessToken);
        if (response.status === 401 && sessionStorage.getItem(SPOTIFY_STORAGE_KEYS.refreshToken)) {
          const refreshedToken = await refreshSpotifyAccessToken();
          response = await performFetch(refreshedToken);
        }

        if (!active) {
          return;
        }

        if (response.status === 204) {
          setSpotifyPlayback((current) => ({ ...current, isPlaying: false }));
          return;
        }

        if (!response.ok) {
          throw new Error('Spotify playback info is unavailable right now.');
        }

        const payload = await response.json();
        const item = payload?.item;
        if (!item) {
          setSpotifyPlayback((current) => ({ ...current, isPlaying: false }));
          return;
        }

        setHasSpotifyBackgroundSession(true);
        setSpotifyPlayback({
          title: item.name || 'Recommendation Playlist',
          artist: item.artists?.map((artist) => artist.name).join(', ') || 'Spotify',
          albumImage: item.album?.images?.[2]?.url || item.album?.images?.[1]?.url || item.album?.images?.[0]?.url || '',
          isPlaying: Boolean(payload?.is_playing),
        });
      } catch {
        if (!active) {
          return;
        }
        setSpotifyPlayback((current) => ({
          ...current,
          isPlaying: Boolean(current.isPlaying),
        }));
      }
    };

    void loadSpotifyPlaybackState();
    const interval = window.setInterval(() => {
      void loadSpotifyPlaybackState();
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [isSpotifyPlayerMounted]);

  useEffect(() => {
    const handleAppLauncherClickOutside = (event) => {
      if (appSecurityPopupRef.current && appSecurityPopupRef.current.contains(event.target)) {
        return;
      }

      if (appPrivacyPopupRef.current && appPrivacyPopupRef.current.contains(event.target)) {
        return;
      }

      if (appLauncherRef.current && !appLauncherRef.current.contains(event.target)) {
        setIsAppLauncherOpen(false);
      }
    };

    document.addEventListener('mousedown', handleAppLauncherClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleAppLauncherClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!isAppPrivacyOpen) {
      return undefined;
    }

    const handlePrivacyClickOutside = (event) => {
      if (appPrivacyPopupRef.current && appPrivacyPopupRef.current.contains(event.target)) {
        return;
      }

      setIsAppPrivacyOpen(false);
    };

    document.addEventListener('mousedown', handlePrivacyClickOutside);
    return () => {
      document.removeEventListener('mousedown', handlePrivacyClickOutside);
    };
  }, [isAppPrivacyOpen]);

  useEffect(() => {
    if (!isAppSecurityOpen) {
      return undefined;
    }

    const handleSecurityClickOutside = (event) => {
      if (appSecurityPopupRef.current && appSecurityPopupRef.current.contains(event.target)) {
        return;
      }

      setIsAppSecurityOpen(false);
    };

    document.addEventListener('mousedown', handleSecurityClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleSecurityClickOutside);
    };
  }, [isAppSecurityOpen]);

  // WhatsApp Popup Click Outside
  useEffect(() => {
    const handleWaClickOutside = (event) => {
      if (waPopupRef.current && !waPopupRef.current.contains(event.target)) {
        setIsWaOpen(false);
        setIsWaSendMsgOpen(false);
        setIsAddContactOpen(false);
        setActiveMenuContact(null);
        setDetailsContact(null);
      }
    };
    document.addEventListener('mousedown', handleWaClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleWaClickOutside);
    };
  }, []);

  // US Status Popup Click Outside
  useEffect(() => {
    const handleUsStatusClickOutside = (event) => {
      if (companyDashboardNestedRef.current && companyDashboardNestedRef.current.contains(event.target)) {
        return;
      }
      if (companyDashboardRef.current && companyDashboardRef.current.contains(event.target)) {
        if (companyDashboardSection !== 'none') {
          setCompanyDashboardSection('none');
        }
        return;
      }
      if (usSideSettingsRef.current && usSideSettingsRef.current.contains(event.target)) {
        return;
      }
      if (isUsSideSettingsOpen) {
        setIsUsSideSettingsOpen(false);
        setUsSideSettingsSection('profile');
        return;
      }
      if (usStatusPopupRef.current && !usStatusPopupRef.current.contains(event.target)) {
        setIsUsStatusPopupOpen(false);
        setIsUsSideSettingsOpen(false);
        setUsSideSettingsSection('profile');
      }
      if (isCompanyDashboardOpen) {
        setIsCompanyDashboardOpen(false);
        setCompanyDashboardSection('none');
      }
    };
    document.addEventListener('mousedown', handleUsStatusClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleUsStatusClickOutside);
    };
  }, [companyDashboardSection, isCompanyDashboardOpen, isUsSideSettingsOpen]);

  // Study Timer logic
  useEffect(() => {
    let interval = null;
    if (isStudyTimerRunning && studySecondsLeft > 0) {
      interval = setInterval(() => {
        setStudySecondsLeft((prev) => {
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isStudyTimerRunning, studySecondsLeft]);

  // Turn off timer running state asynchronously when it hits 0
  useEffect(() => {
    if (studySecondsLeft === 0 && isStudyTimerRunning) {
      const delay = setTimeout(() => {
        setIsStudyTimerRunning(false);
      }, 0);
      return () => clearTimeout(delay);
    }
  }, [studySecondsLeft, isStudyTimerRunning]);

  useEffect(() => {
    const hasAnyPopupOpen = Boolean(
      isSearchPopupOpen
      || isWaOpen
      || isWaSendMsgOpen
      || isAddContactOpen
      || isContactSelectOpen
      || activeMenuContact
      || detailsContact
      || isTimePopupOpen
      || isBatteryPopupOpen
      || isWifiDropdownOpen
      || isBluetoothPopupOpen
      || isNotificationsOpen
      || isAppLauncherOpen
      || showSpotifyPopup
      || isUserLoginOpen
      || isCompanyDashboardOpen
      || isUsStatusPopupOpen,
    );

    onPopupStateChange(hasAnyPopupOpen);
  }, [
    activeMenuContact,
    detailsContact,
    isAddContactOpen,
    isBatteryPopupOpen,
    isBluetoothPopupOpen,
    isCompanyDashboardOpen,
    isContactSelectOpen,
    isNotificationsOpen,
    isSearchPopupOpen,
    isTimePopupOpen,
    isUserLoginOpen,
    isUsStatusPopupOpen,
    isWaOpen,
    isWaSendMsgOpen,
    isAppLauncherOpen,
    isWifiDropdownOpen,
    onPopupStateChange,
    showSpotifyPopup,
  ]);



  const formatTime = (date) => {
    let hours = date.getHours();
    let minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    hours = hours < 10 ? '0' + hours : hours;
    minutes = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${minutes} ${ampm}`;
  };

  const formatFullTime = (date) => {
    let hours = date.getHours();
    let minutes = date.getMinutes();
    let seconds = date.getSeconds();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    hours = hours < 10 ? '0' + hours : hours;
    minutes = minutes < 10 ? '0' + minutes : minutes;
    seconds = seconds < 10 ? '0' + seconds : seconds;
    return `${hours}:${minutes}:${seconds} ${ampm}`;
  };

  const formatFullDate = (date) => {
    return date.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  const isAnySpotifyPopupOpen = showSpotifyPopup || showSpotifyNowPlayingPopup;
  const normalizedPickerSearch = appPickerQuery.trim().toLowerCase();
  const visiblePickerApps = normalizedPickerSearch
    ? installedApps.filter((app) => app.name.toLowerCase().includes(normalizedPickerSearch))
    : installedApps;
  const visibleSelectedApps = selectedApps;

  const selectedContact = waPhone
    ? savedContacts.find((contact) => contact.phone.replace(/[^0-9+]/g, '') === waPhone)
    : null;

  const openContactEditor = (contact = null) => {
    setEditingContactPhone(contact ? contact.phone : null);
    setContactForm({
      name: contact?.name || '',
      phone: contact?.phone || '',
    });
    setIsAddContactOpen(true);
    setActiveMenuContact(null);
  };

  const removeContact = (contact) => {
    const newContacts = savedContacts.filter((item) => item.phone !== contact.phone);
    localStorage.setItem('waContacts', JSON.stringify(newContacts));
    setSavedContacts(newContacts);

    if (waPhone === contact.phone.replace(/[^0-9+]/g, '')) {
      setWaPhone('');
    }

    setActiveMenuContact(null);
    setDetailsContact(null);
  };

  const batteryPercent = Math.round(batteryInfo.level * 100);
  const connectedWifi = wifiNetworks.find((network) => network.status === 'connected') || null;
  const wifiConnectedName = connectedWifi?.name || 'No active wireless network';
  const unreadNotificationsCount = notifications.filter((notification) => !notification.read).length;
  const batteryTone = batteryInfo.charging
    ? 'charging'
    : batteryPercent <= 20
      ? 'low'
      : batteryPercent <= 60
        ? 'medium'
        : 'full';

  const batteryFillColor = batteryInfo.charging
    ? '#57f287'
    : batteryTone === 'low'
      ? '#ff5f57'
      : batteryTone === 'medium'
        ? '#ffd45f'
        : '#5df28c';

  const formatDuration = (seconds) => {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return batteryInfo.charging ? 'Calculating' : 'Full day use';
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours <= 0) {
      return `${minutes}m`;
    }

    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  };

  const formatNotificationTime = (value) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return 'Now';
    }

    return parsed.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getNotificationTypeIcon = (type) => {
    switch (type) {
      case 'security-alert':
        return Shield;
      case 'study-reminder':
        return Clock3;
      case 'system-status':
        return Gauge;
      case 'bluetooth-alert':
        return Bluetooth;
      case 'wifi-alert':
        return Wifi;
      case 'account-activity':
        return User;
      case 'error-message':
        return TriangleAlert;
      case 'app-update':
        return RefreshCw;
      case 'login-alert':
      default:
        return Bell;
    }
  };

  function closeSpotifyPopups() {
    setShowSpotifyPopup(false);
    setSpotifyActiveView('none');
    setShowSpotifyNowPlayingPopup(false);
  }

  function toggleSpotifyPopup() {
    setShowSpotifyNowPlayingPopup(false);
    setShowSpotifyPopup((open) => !open);
  }

  function toggleSpotifyNowPlayingPopup() {
    setShowSpotifyPopup(false);
    setShowSpotifyNowPlayingPopup((open) => !open);
  }

  const handleWifiToggle = () => {
    setIsWifiDropdownOpen((open) => {
      const nextOpen = !open;
      if (nextOpen) {
        loadWifiNetworks(true);
      }
      return nextOpen;
    });
  };

  const handleWifiRefresh = () => {
    loadWifiNetworks(true);
  };

  const handleBluetoothToggle = () => {
    setIsBluetoothPopupOpen((open) => {
      const nextOpen = !open;
      if (nextOpen) {
        void loadBluetoothSnapshotRef.current('status', true);
      }
      return nextOpen;
    });
  };

  const handleBluetoothScan = () => {
    void loadBluetoothSnapshot('scan', true);
  };

  const handleBluetoothPowerToggle = async () => {
    try {
      setIsBluetoothLoading(true);
      setBluetoothError('');
      const payload = await requestBluetooth('/api/bluetooth/toggle', {
        method: 'POST',
        body: JSON.stringify({
          enabled: !isBluetoothEnabled,
        }),
      });
      applyBluetoothSnapshot(payload);
    } catch (error) {
      setBluetoothError(error.message || 'Bluetooth service unavailable');
    } finally {
      setIsBluetoothLoading(false);
    }
  };

  const handleBluetoothConnect = async (device) => {
    const confirmed = window.confirm(`Connect to ${device.name}?`);
    if (!confirmed) {
      return;
    }

    try {
      setBluetoothBusyDeviceId(device.id);
      setBluetoothError('');
      const payload = await requestBluetooth('/api/bluetooth/connect', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: device.id,
          deviceName: device.name,
        }),
      });
      applyBluetoothSnapshot(payload);
    } catch (error) {
      setBluetoothError(error.message || 'Bluetooth service unavailable');
    } finally {
      setBluetoothBusyDeviceId('');
    }
  };

  const handleBluetoothDisconnect = async (deviceId = '') => {
    try {
      setBluetoothBusyDeviceId(deviceId || bluetoothConnectedDevice?.id || '');
      setBluetoothError('');
      const payload = await requestBluetooth('/api/bluetooth/disconnect', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: deviceId || bluetoothConnectedDevice?.id || '',
        }),
      });
      applyBluetoothSnapshot(payload);
    } catch (error) {
      setBluetoothError(error.message || 'Bluetooth service unavailable');
    } finally {
      setBluetoothBusyDeviceId('');
    }
  };

  const handleNotificationsToggle = () => {
    setIsNotificationsOpen((open) => {
      const nextOpen = !open;
      if (nextOpen) {
        void loadNotifications();
      }
      return nextOpen;
    });
  };

  const handleMarkNotificationRead = async (notificationId) => {
    try {
      const payload = await requestNotifications('/api/notifications/mark-read', {
        method: 'POST',
        body: JSON.stringify({ id: notificationId }),
      });
      setNotifications(Array.isArray(payload.notifications) ? payload.notifications : []);
    } catch (error) {
      setNotificationsError(error.message || 'Notifications unavailable');
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      const payload = await requestNotifications('/api/notifications/mark-read', {
        method: 'POST',
        body: JSON.stringify({ ids: notifications.map((notification) => notification.id) }),
      });
      setNotifications(Array.isArray(payload.notifications) ? payload.notifications : []);
    } catch (error) {
      setNotificationsError(error.message || 'Notifications unavailable');
    }
  };

  const handleClearNotifications = async () => {
    try {
      const payload = await requestNotifications('/api/notifications/clear', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setNotifications(Array.isArray(payload.notifications) ? payload.notifications : []);
    } catch (error) {
      setNotificationsError(error.message || 'Notifications unavailable');
    }
  };

  const connectWifiNetwork = async (network, password = '') => {
    setWifiBusyNetworkId(network.id);
    setWifiError('');

    try {
      const endpoint = '/api/wifi/connect';
      const payload = await requestWifi(endpoint, {
        method: 'POST',
        requiresAuth: true,
        body: JSON.stringify({
          name: network.name,
          interfaceName: wifiInterfaceName,
          secure: network.secure,
          password,
          authType: network.authType,
          cipherType: network.cipherType,
        }),
      });

      applyWifiSnapshot(payload);
    } catch (error) {
      setWifiError(error.message || 'Wi-Fi action failed.');
    } finally {
      setWifiBusyNetworkId(null);
    }
  };

  const handleWifiNetworkAction = async (network) => {
    if (network.status === 'connected') {
      setWifiBusyNetworkId(network.id);
      setWifiError('');

      try {
        const payload = await requestWifi('/api/wifi/disconnect', {
          method: 'POST',
          requiresAuth: true,
          body: JSON.stringify({ interfaceName: wifiInterfaceName }),
        });
        applyWifiSnapshot(payload);
      } catch (error) {
        setWifiError(error.message || 'Wi-Fi action failed.');
      } finally {
        setWifiBusyNetworkId(null);
      }
      return;
    }

    if (network.secure) {
      setWifiPasswordPrompt(network);
      setWifiPasswordInput('');
      setWifiPasswordError('');
      return;
    }

    await connectWifiNetwork(network);
  };

  const submitWifiPassword = async () => {
    if (!wifiPasswordPrompt) {
      return;
    }

    if (!wifiPasswordInput.trim()) {
      setWifiPasswordError('Enter the Wi-Fi password before connecting.');
      return;
    }

    setWifiPasswordError('');
    const targetNetwork = wifiPasswordPrompt;
    setWifiPasswordPrompt(null);
    await connectWifiNetwork(targetNetwork, wifiPasswordInput);
    setWifiPasswordInput('');
  };

  const handleSpotifyLogin = async () => {
    if (!import.meta.env.VITE_SPOTIFY_CLIENT_ID) {
      setSpotifyAuthStatus('error');
      setSpotifyAuthError('Add VITE_SPOTIFY_CLIENT_ID to your local environment before using Spotify sign-in.');
      return;
    }

    if (!isSecureSpotifyOrigin()) {
      setSpotifyAuthStatus('error');
      setSpotifyAuthError(`Open Spotify from an HTTPS URL or the 127.0.0.1 loopback URL. Your Spotify redirect URI must exactly match ${getSpotifyRedirectUri()}.`);
      return;
    }

    try {
      setSpotifyAuthStatus('loading');
      setSpotifyAuthError('');

      const verifier = createSpotifyVerifier();
      const challenge = await createSpotifyChallenge(verifier);
      const state = createSpotifyVerifier(24);

      sessionStorage.setItem(SPOTIFY_STORAGE_KEYS.codeVerifier, verifier);
      sessionStorage.setItem(SPOTIFY_STORAGE_KEYS.state, state);

      const authUrl = new URL(SPOTIFY_AUTHORIZE_URL);
      authUrl.search = new URLSearchParams({
        client_id: import.meta.env.VITE_SPOTIFY_CLIENT_ID,
        response_type: 'code',
        redirect_uri: getSpotifyRedirectUri(),
        scope: SPOTIFY_SCOPES,
        state,
        code_challenge_method: 'S256',
        code_challenge: challenge,
      }).toString();

      window.location.assign(authUrl.toString());
    } catch {
      setSpotifyAuthStatus('error');
      setSpotifyAuthError('Spotify sign-in could not be started.');
    }
  };

  const disconnectSpotify = () => {
    spotifyEmbedControllerRef.current?.pause?.();
    spotifyEmbedControllerRef.current?.destroy?.();
    spotifyEmbedControllerRef.current = null;
    setIsSpotifyPlayerMounted(false);
    setIsSpotifyPlayerReady(false);
    setHasSpotifyBackgroundSession(false);
    setShowSpotifyNowPlayingPopup(false);
    clearSpotifySession();
    setSpotifyUser(null);
    setSpotifyAuthStatus('idle');
    setSpotifyAuthError('');
    setSpotifyTopTracks([]);
    setSpotifyPlaylistStatus('');
    setSpotifyActiveView('none');
  };

  const handleLoadSpotifyTopTracks = async () => {
    try {
      setSpotifyActiveView('top-tracks');
      setIsSpotifyTracksLoading(true);
      setSpotifyAuthError('');
      setSpotifyPlaylistStatus('');
      const tracks = await getTopTracks();
      setSpotifyTopTracks(Array.isArray(tracks) ? tracks.slice(0, 5) : []);
    } catch (error) {
      setSpotifyTopTracks([]);
      setSpotifyAuthError(error.message || 'Spotify top tracks could not be loaded.');
    } finally {
      setIsSpotifyTracksLoading(false);
    }
  };

  const handleCreateSpotifyPlaylist = async () => {
    try {
      setSpotifyActiveView('create-spotify');
      setIsSpotifyPlaylistCreating(true);
      setSpotifyAuthError('');
      setSpotifyPlaylistStatus('');
      const createdPlaylist = await createPlaylist(
        spotifyPlaylistName.trim() || 'My top tracks playlist',
        SPOTIFY_PLAYLIST_TRACK_URIS,
      );
      setSpotifyPlaylistStatus(`${createdPlaylist.name} created successfully.`);
    } catch (error) {
      setSpotifyPlaylistStatus(error.message || 'Playlist could not be created right now.');
    } finally {
      setIsSpotifyPlaylistCreating(false);
    }
  };

  const openSpotifyCreateView = () => {
    setSpotifyActiveView('create-spotify');
    setSpotifyAuthError('');
    setSpotifyPlaylistStatus('');
  };

  const openSpotifyPlaylistView = () => {
    setIsSpotifyPlayerMounted(true);
    setSpotifyActiveView('playlist');
    setSpotifyAuthError('');
    setSpotifyPlaylistStatus('');
  };

  const closeSpotifyOptionPopup = () => {
    setSpotifyActiveView('none');
    setSpotifyAuthError('');
    setSpotifyPlaylistStatus('');
  };

  const handleSpotifyTogglePlayback = () => {
    if (!spotifyEmbedControllerRef.current) {
      return;
    }

    if (spotifyEmbedControllerRef.current.togglePlay) {
      spotifyEmbedControllerRef.current.togglePlay();
      return;
    }

    if (spotifyPlayback.isPlaying && spotifyEmbedControllerRef.current.pause) {
      spotifyEmbedControllerRef.current.pause();
      return;
    }

    if (!spotifyPlayback.isPlaying && spotifyEmbedControllerRef.current.resume) {
      spotifyEmbedControllerRef.current.resume();
    }
  };

  const handleSpotifyStopPlayback = () => {
    spotifyEmbedControllerRef.current?.pause?.();
    spotifyEmbedControllerRef.current?.destroy?.();
    spotifyEmbedControllerRef.current = null;
    setIsSpotifyPlayerMounted(false);
    setIsSpotifyPlayerReady(false);
    setHasSpotifyBackgroundSession(false);
    setShowSpotifyNowPlayingPopup(false);
    setSpotifyPlayback((current) => ({
      ...current,
      isPlaying: false,
    }));
  };

  const handleSpotifyVolumeChange = (event) => {
    setSpotifyVolume(Number(event.target.value));
  };

  const loadInstalledApps = async (showLoader = true) => {
    try {
      if (showLoader) {
        setIsAppsLoading(true);
      }
      setAppsError('');

      const payload = await requestBackendJson('/api/system/apps', { method: 'GET' }, {
        fallbackMessage: 'Unable to load installed apps right now.',
      });

      const nextInstalledApps = Array.isArray(payload.apps) ? payload.apps : [];
      setInstalledApps(nextInstalledApps);
      setSelectedApps((current) => current.map((entry) => {
        if (typeof entry !== 'string') {
          return entry;
        }

        const matchedApp = nextInstalledApps.find((app) => app.id === entry);
        return matchedApp ? createStoredAppSelection(matchedApp, appVisuals[matchedApp.id]) : entry;
      }).filter((entry) => typeof entry !== 'string'));
    } catch (error) {
      setAppsError(error.message || 'Unable to load installed apps right now.');
    } finally {
      if (showLoader) {
        setIsAppsLoading(false);
      }
    }
  };

  const toggleAppLauncher = () => {
    setIsAppLauncherOpen((open) => {
      const nextOpen = !open;
      if (nextOpen) {
        void loadInstalledApps(false);
      }
      if (!nextOpen) {
        setIsAppPickerOpen(false);
        setIsAppSettingsOpen(false);
        setIsAppPrivacyOpen(false);
        setIsAppSecurityOpen(false);
        setIsResetAppsConfirmOpen(false);
        setAppPickerQuery('');
      }
      return nextOpen;
    });
  };

  const openAddAppsPanel = () => {
    setIsAppSettingsOpen(false);
    setIsAppPrivacyOpen(false);
    setIsAppSecurityOpen(false);
    setIsResetAppsConfirmOpen(false);
    setIsAppPickerOpen(true);
    void loadInstalledApps(true);
  };

  const toggleSelectedApp = (app) => {
    setSelectedApps((current) => {
      const exists = current.some((item) => item.id === app.id);
      if (exists) {
        return current.filter((item) => item.id !== app.id);
      }

      return [
        ...current,
        createStoredAppSelection(app, appVisuals[app.id]),
      ];
    });
  };

  const removeSelectedApp = (appId) => {
    setSelectedApps((current) => current.filter((app) => app.id !== appId));
  };

  const handleResetApps = () => {
    setSelectedApps([]);
    setIsResetAppsConfirmOpen(false);
    setIsAppSettingsOpen(false);
  };

  const handleClearLocalAppData = () => {
    setSelectedApps([]);
    setAppVisuals({});
    setAppPickerQuery('');
    setAppsError('');
    try {
      localStorage.removeItem(APP_BOX_SELECTED_APPS_STORAGE_KEY);
    } catch {
      // Ignore local cleanup issues and keep the in-memory reset.
    }
  };

  const handleSavePrivacyPin = () => {
    const normalizedPin = privacyPinDraft.trim();
    if (!normalizedPin) {
      setAppPrivacySettings((current) => ({ ...current, pinEnabled: false, pin: '' }));
      setPrivacyPinDraft('');
      return;
    }

    setAppPrivacySettings((current) => ({
      ...current,
      pinEnabled: true,
      pin: normalizedPin,
    }));
  };

  const updateAppPrivacyPosition = () => {
    if (!appSettingsPopupRef.current) {
      return;
    }

    const settingsRect = appSettingsPopupRef.current.getBoundingClientRect();
    const panelWidth = 312;
    const panelHeight = 428;
    const gap = 14;
    const viewportPadding = 12;
    const rightSpace = window.innerWidth - settingsRect.right - viewportPadding;
    const leftSpace = settingsRect.left - viewportPadding;
    const shouldOpenRight = rightSpace >= panelWidth || rightSpace >= leftSpace;
    const left = shouldOpenRight
      ? Math.min(settingsRect.right + gap, window.innerWidth - panelWidth - viewportPadding)
      : Math.max(viewportPadding, settingsRect.left - panelWidth - gap);
    const top = Math.min(
      Math.max(viewportPadding, settingsRect.top),
      window.innerHeight - panelHeight - viewportPadding,
    );

    setAppPrivacyPosition({
      top,
      left,
      side: shouldOpenRight ? 'right' : 'left',
    });
  };

  const updateAppSecurityPosition = () => {
    if (!appSettingsPopupRef.current) {
      return;
    }

    const settingsRect = appSettingsPopupRef.current.getBoundingClientRect();
    const panelWidth = 296;
    const panelHeight = 276;
    const gap = 14;
    const viewportPadding = 12;
    const rightSpace = window.innerWidth - settingsRect.right - viewportPadding;
    const leftSpace = settingsRect.left - viewportPadding;
    const shouldOpenRight = rightSpace >= panelWidth || rightSpace >= leftSpace;
    const left = shouldOpenRight
      ? Math.min(settingsRect.right + gap, window.innerWidth - panelWidth - viewportPadding)
      : Math.max(viewportPadding, settingsRect.left - panelWidth - gap);
    const top = Math.min(
      Math.max(viewportPadding, settingsRect.top + 88),
      window.innerHeight - panelHeight - viewportPadding,
    );

    setAppSecurityPosition({
      top,
      left,
      side: shouldOpenRight ? 'right' : 'left',
    });
  };

  useEffect(() => {
    if (!isAppPrivacyOpen) {
      return undefined;
    }

    updateAppPrivacyPosition();

    const handleReposition = () => updateAppPrivacyPosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isAppPrivacyOpen]);

  useEffect(() => {
    if (!isAppSecurityOpen) {
      return undefined;
    }

    updateAppSecurityPosition();

    const handleReposition = () => updateAppSecurityPosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isAppSecurityOpen]);

  const openSelectedApp = async (app) => {
    try {
      await requestBackendJson('/api/system/apps/open', {
        method: 'POST',
        body: JSON.stringify({ shortcutPath: app.shortcutPath, appPath: app.appPath }),
      }, {
        requiresAuth: true,
        fallbackMessage: 'App not found or path is invalid.',
        onUnauthorized: handleProtectedRequestFailure,
      });
    } catch (error) {
      setAppsError(error.message || 'App not found or path is invalid.');
    }
  };

  useEffect(() => {
    const appsForIconLoading = [
      ...visibleSelectedApps.slice(0, 12),
      ...(isAppPickerOpen ? visiblePickerApps.slice(0, 24) : []),
    ];

    if (!appsForIconLoading.length) {
      return;
    }

    const appsToFetch = appsForIconLoading
      .filter((app) => !appVisuals[app.id] && app.shortcutPath);

    if (!appsToFetch.length) {
      return;
    }

    let cancelled = false;

    const fetchIcons = async () => {
      const results = await Promise.allSettled(
        appsToFetch.map(async (app) => {
          const payload = await requestBackendJson('/api/system/apps/icon', {
            method: 'POST',
            body: JSON.stringify({ shortcutPath: app.shortcutPath }),
          }, {
            fallbackMessage: 'Unable to load app icon.',
          });

          return [app.id, {
            iconDataUrl: payload.iconDataUrl || '',
            targetPath: payload.targetPath || '',
          }];
        }),
      );

      if (cancelled) {
        return;
      }

      setAppVisuals((current) => {
        const next = { ...current };
        for (const result of results) {
          if (result.status === 'fulfilled') {
            const [id, visual] = result.value;
            next[id] = visual;
          }
        }
        return next;
      });

      setSelectedApps((current) => current.map((app) => {
        const visual = results.find((result) => result.status === 'fulfilled' && result.value[0] === app.id);
        if (!visual || visual.status !== 'fulfilled') {
          return app;
        }

        const [, payload] = visual.value;
        if (app.iconDataUrl === payload.iconDataUrl && app.appPath === payload.targetPath) {
          return app;
        }

        return {
          ...app,
          iconDataUrl: payload.iconDataUrl || app.iconDataUrl,
          appPath: payload.targetPath || app.appPath,
        };
      }));
    };

    void fetchIcons();

    return () => {
      cancelled = true;
    };
  }, [appVisuals, isAppPickerOpen, visiblePickerApps, visibleSelectedApps]);

  const handleWaSend = () => {
    if (!waPhone.trim()) {
      alert('Please select a registered contact first');
      return;
    }
    if (!waMessage.trim()) {
      alert('Please enter message');
      return;
    }

    const formattedPhone = waPhone.replace(/[^0-9]/g, ''); 
    
    // Add to History
    if (formattedPhone) {
      setPhoneHistory(prev => {
        const filtered = prev.filter(p => p !== formattedPhone);
        return [formattedPhone, ...filtered].slice(0, 8); // Keep latest 8 distinct
      });
    }

    const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(waMessage)}`;
    window.location.href = url;
    
    setIsWaOpen(false);
    setIsWaSendMsgOpen(false);
    setWaPhone('');
    setWaMessage('');
  };

  const handleLoginFieldChange = (field, value) => {
    setLoginForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleRegisterFieldChange = (field, value) => {
    setRegisterForm((current) => ({
      ...current,
      [field]: value,
    }));
    setRegisterErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  useEffect(() => {
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!googleClientId) {
      return undefined;
    }

    const initializeGoogleAuth = () => {
      if (!window.google?.accounts?.oauth2) {
        return;
      }

      googleTokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: 'openid email profile',
        callback: async (response) => {
          if (!response.access_token) {
            setLoginError('Google sign-in could not be completed.');
            setIsGoogleSubmitting(false);
            return;
          }

          try {
            const userInfoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
              headers: {
                Authorization: `Bearer ${response.access_token}`,
              },
            });

            if (!userInfoResponse.ok) {
              throw new Error('Unable to load Google profile.');
            }

            const profile = await userInfoResponse.json();
            const payload = await requestBackendJson('/api/auth/google', {
              method: 'POST',
              body: JSON.stringify({
                email: profile.email,
                name: profile.name || '',
                picture: profile.picture || '',
                rememberMe: loginForm.rememberMe,
              }),
            }, {
              fallbackMessage: 'Google sign-in could not be completed.',
            });

            persistAuthSession(payload, loginForm.rememberMe);
            setAppAuthSession({
              token: payload.token,
              user: payload.user,
              rememberMe: loginForm.rememberMe,
            });
            setLoginError('');
            setRegisterStatus('');
            setIsRegisterOpen(false);
            setIsUserLoginOpen(false);
            setIsUsStatusPopupOpen(true);
          } catch (error) {
            setLoginError(error.message || 'Google sign-in could not be completed.');
          } finally {
            setIsGoogleSubmitting(false);
          }
        },
      });
    };

    const existingScript = document.getElementById(GOOGLE_IDENTITY_SCRIPT_ID);
    if (existingScript) {
      initializeGoogleAuth();
      return undefined;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_IDENTITY_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogleAuth;
    document.body.appendChild(script);

    return () => {
      script.onload = null;
    };
  }, [loginForm.rememberMe]);

  const handleGoogleLogin = () => {
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!googleClientId) {
      setLoginError('Add VITE_GOOGLE_CLIENT_ID to use Google sign-in.');
      return;
    }

    if (!window.google?.accounts?.oauth2 || !googleTokenClientRef.current) {
      setLoginError('Google sign-in is still loading. Try again.');
      return;
    }

    setIsGoogleSubmitting(true);
    setLoginError('');
    googleTokenClientRef.current.requestAccessToken({ prompt: 'consent' });
  };

  const validateRegisterForm = () => {
    const nextErrors = {};
    const normalizedEmail = registerForm.email.trim().toLowerCase();
    const normalizedFirstName = registerForm.firstName.trim();
    const normalizedLastName = registerForm.lastName.trim();
    const normalizedPhone = registerForm.phoneNumber.trim();

    if (!normalizedEmail) {
      nextErrors.email = 'Email ID is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      nextErrors.email = 'Enter a valid email address.';
    }

    if (!normalizedFirstName) {
      nextErrors.firstName = 'First Name is required.';
    }

    if (!normalizedLastName) {
      nextErrors.lastName = 'Last Name is required.';
    }

    if (!registerForm.password) {
      nextErrors.password = 'Password is required.';
    } else if (registerForm.password.length < 8 || !/[a-z]/.test(registerForm.password) || !/[A-Z]/.test(registerForm.password) || !/[0-9]/.test(registerForm.password) || !/[^A-Za-z0-9]/.test(registerForm.password)) {
      nextErrors.password = 'Use 8+ chars with upper, lower, number, and symbol.';
    }

    if (!registerForm.confirmPassword) {
      nextErrors.confirmPassword = 'Confirm your password.';
    } else if (registerForm.password !== registerForm.confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match.';
    }

    if (normalizedPhone && !/^\+?[0-9()\-\s]{7,20}$/.test(normalizedPhone)) {
      nextErrors.phoneNumber = 'Enter a valid phone number.';
    }

    return nextErrors;
  };

  const handleRegisterSubmit = async (event) => {
    event.preventDefault();

    const nextErrors = validateRegisterForm();
    if (Object.keys(nextErrors).length) {
      setRegisterErrors(nextErrors);
      return;
    }

    setIsRegisterSubmitting(true);
    setRegisterErrors({});
    setRegisterStatus('');

    try {
      const response = await fetch(REGISTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: registerForm.email.trim().toLowerCase(),
          firstName: registerForm.firstName.trim(),
          middleName: registerForm.middleName.trim(),
          lastName: registerForm.lastName.trim(),
          phoneNumber: registerForm.phoneNumber.trim(),
          moreInformation: registerForm.moreInformation.trim(),
          password: registerForm.password,
          confirmPassword: registerForm.confirmPassword,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || payload.message || 'Invalid details. Please check the form and try again.');
      }

      setRegisterStatus(payload.message || 'Registration successful.');
      setLoginForm((current) => ({
        ...current,
        email: registerForm.email.trim().toLowerCase(),
        password: '',
      }));
      setRegisterForm({
        email: '',
        firstName: '',
        middleName: '',
        lastName: '',
        moreInformation: '',
        phoneNumber: '',
        password: '',
        confirmPassword: '',
      });
      setIsUserLoginOpen(true);
      setIsRegisterOpen(false);
      setLoginError('');
    } catch (error) {
      const isNetworkFailure = error instanceof TypeError
        || /failed to fetch|networkerror|load failed/i.test(String(error?.message || ''));
      setRegisterErrors({
        form: isNetworkFailure
          ? 'Backend server is not running. Please start backend.'
          : (error.message || 'Unable to register right now.'),
      });
    } finally {
      setIsRegisterSubmitting(false);
    }
  };

  const handleUserLoginSubmit = async (event) => {
    event.preventDefault();

    const normalizedEmail = loginForm.email.trim().toLowerCase();
    const password = loginForm.password;

    if (!normalizedEmail) {
      setLoginError('Enter your e-mail address.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setLoginError('Enter a valid e-mail address.');
      return;
    }

    if (password.trim().length < 8) {
      setLoginError('Password must be at least 8 characters.');
      return;
    }

    setIsLoginSubmitting(true);
    setLoginError('');

    try {
      const payload = await requestBackendJson('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          rememberMe: loginForm.rememberMe,
        }),
      }, {
        fallbackMessage: 'Unable to log in right now.',
      });

      persistAuthSession(payload, loginForm.rememberMe);
      setAppAuthSession({
        token: payload.token,
        user: payload.user,
        rememberMe: loginForm.rememberMe,
      });
      setLoginForm({
        email: '',
        password: '',
        rememberMe: false,
      });
      setIsRegisterOpen(false);
      setIsUsSideSettingsOpen(false);
      setUsSideSettingsSection('profile');
      setUsStatusActiveSection('none');
      setIsUserLoginOpen(false);
      setIsUsStatusPopupOpen(true);
    } catch (error) {
      setLoginError(error.message || 'Unable to log in right now.');
    } finally {
      setIsLoginSubmitting(false);
    }
  };

  const handleCompanyLoginFieldChange = (field, value) => {
    setCompanyLoginForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const togglePasswordVisibility = (field) => {
    setPasswordVisibility((current) => ({
      ...current,
      [field]: !current[field],
    }));
  };

  const getPasswordInputType = (field) => (passwordVisibility[field] ? 'text' : 'password');

  const handleCompanyLoginSubmit = async (event) => {
    event.preventDefault();

    const companyId = companyLoginForm.companyId.trim();
    const companyKey = companyLoginForm.companyKey.trim();
    const companyPassword = companyLoginForm.companyPassword;

    if (!companyId || !companyKey || !companyPassword) {
      setCompanyLoginError('Enter company login details.');
      return;
    }

    setIsCompanyLoginSubmitting(true);
    setCompanyLoginError('');
    setCompanyLoginStatus('');

    try {
      const payload = await requestBackendJson(COMPANY_LOGIN_API_URL, {
        method: 'POST',
        body: JSON.stringify({
          companyId,
          companyKey,
          companyPassword,
        }),
      }, {
        fallbackMessage: 'Company login server unavailable',
      });

      setCompanyLoginStatus(payload.message || 'Company login successful.');
      persistAuthSession(payload, true);
      setAppAuthSession({
        token: payload.token,
        user: payload.user,
        rememberMe: true,
      });
      setCompanyLoginForm({
        companyId: '',
        companyKey: '',
        companyPassword: '',
      });
      openCompanyDashboard();
    } catch (error) {
      setCompanyLoginError(error.message || 'Company login server unavailable');
    } finally {
      setIsCompanyLoginSubmitting(false);
    }
  };

  const handleUserLogout = async () => {
    try {
      await requestBackendJson('/api/auth/logout', { method: 'POST' }, {
        requiresAuth: true,
        fallbackMessage: 'Unable to log out right now.',
      });
    } catch {
      // Logout should still clear local auth even if the backend call fails.
    }

    const isCompanySession = appAuthSession?.user?.role === 'company';
    clearStoredAuthSession(isCompanySession ? 'company' : 'user');
    setAppAuthSession(null);
    setLoginError('');
    setCompanyLoginError('');
    setIsRegisterOpen(false);
    setIsCompanyLoginOpen(false);
    setIsCompanyDashboardOpen(false);
    setIsUsSideSettingsOpen(false);
    setUsSideSettingsSection('profile');
    setIsUsStatusPopupOpen(false);
    setUsStatusActiveSection('none');
    if (isCompanySession) {
      setIsUserLoginOpen(false);
      setIsCompanyLoginOpen(true);
    } else {
      setIsUserLoginOpen(true);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deleteAccountPassword.trim()) {
      setDeleteAccountError('Enter your password to continue.');
      return;
    }

    setIsDeleteAccountSubmitting(true);
    setDeleteAccountError('');
    setDeleteAccountStatus('');

    try {
      const payload = await requestBackendJson('/api/auth/delete-account', {
        method: 'POST',
        body: JSON.stringify({
          email: appAuthSession?.user?.email || '',
          password: deleteAccountPassword,
        }),
      }, {
        requiresAuth: true,
        fallbackMessage: 'Unable to delete account right now.',
        onUnauthorized: handleProtectedRequestFailure,
      });

      setDeleteAccountStatus(payload.message || 'Account deleted successfully.');
      clearStoredAuthSession();
      setAppAuthSession(null);
      setDeleteAccountPassword('');

      window.setTimeout(() => {
        setIsDeleteAccountOpen(false);
        setIsUsSideSettingsOpen(false);
        setUsSideSettingsSection('profile');
        setIsUsStatusPopupOpen(false);
        setUsStatusActiveSection('none');
        setIsUserLoginOpen(true);
      }, 500);
    } catch (error) {
      setDeleteAccountError(error.message || 'Unable to delete account right now.');
    } finally {
      setIsDeleteAccountSubmitting(false);
    }
  };

  const companyDashboardNav = [
    { id: 'developer', label: 'Developer Mode', icon: Gauge },
    { id: 'details', label: 'Company Details', icon: Briefcase },
    { id: 'employees', label: 'Company Employee Details', icon: Users },
    { id: 'security', label: 'Security Status', icon: Shield },
    { id: 'forms', label: 'Submitted Forms', icon: LayoutGrid },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'logout', label: 'Logout', icon: LogOut },
  ];

  const renderCompanyDashboardSection = () => {
    if (isCompanyDashboardLoading) {
      return (
        <div className="company-dashboard-empty-state">
          <LoaderCircle size={18} className="wifi-action-spinner" />
          <span>Loading company dashboard...</span>
        </div>
      );
    }

    if (companyDashboardError) {
      return (
        <div className="company-dashboard-empty-state is-error">
          <span>{companyDashboardError}</span>
        </div>
      );
    }

    const stats = companyDashboardData?.stats || {};
    const details = companyDashboardData?.details || {};
    const developerMode = companyDashboardData?.developerMode || {};
    const securityStatusData = securityStatus || companyDashboardData?.securityStatus || {};

    if (companyDashboardSection === 'developer') {
      return (
        <div className="company-dashboard-section-grid">
          {[
            ['Backend Status', developerMode.backendStatus || 'Unknown'],
            ['API Status', developerMode.apiStatus || 'Unknown'],
            ['MongoDB Status', developerMode.mongoDbStatus || 'Unknown'],
            ['Excel Backup Status', developerMode.excelBackupStatus || 'Unknown'],
          ].map(([label, value]) => (
            <div key={label} className="company-dashboard-card">
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
          <div className="company-dashboard-card company-dashboard-card-wide">
            <span>Debug Logs</span>
            <div className="company-dashboard-log-list">
              {(developerMode.debugLogs || []).length ? (developerMode.debugLogs || []).map((log, index) => (
                <code key={`${log}-${index}`}>{log}</code>
              )) : <code>No debug logs available.</code>}
            </div>
          </div>
        </div>
      );
    }

    if (companyDashboardSection === 'details') {
      return (
        <div className="company-dashboard-list-card">
          {[
            ['Company Name', details.companyName],
            ['Company ID', details.companyId],
            ['Company Email', details.companyEmail],
            ['Company Website', details.companyWebsite],
            ['Company Phone', details.companyPhone],
            ['Company Address', details.companyAddress],
            ['Account Status', details.accountStatus],
          ].map(([label, value]) => (
            <div key={label} className="company-dashboard-detail-row">
              <span>{label}</span>
              <strong>{value || 'Not available'}</strong>
            </div>
          ))}
        </div>
      );
    }

    if (companyDashboardSection === 'employees') {
      const employees = companyDashboardData?.employees || [];
      return employees.length ? (
        <div className="company-dashboard-table">
          {employees.map((employee) => (
            <div key={employee.id} className="company-dashboard-table-row">
              <div>
                <strong>{employee.name}</strong>
                <span>{employee.email || 'No email'}</span>
              </div>
              <div>
                <strong>{employee.role}</strong>
                <span>{employee.status}</span>
              </div>
              <div>
                <strong>Joined</strong>
                <span>{employee.joinedDate ? new Date(employee.joinedDate).toLocaleDateString() : 'Not available'}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="company-dashboard-empty-state">
          <span>No employee records available yet.</span>
        </div>
      );
    }

    if (companyDashboardSection === 'activity') {
      const loginActivity = companyDashboardData?.loginActivity || [];
      return loginActivity.length ? (
        <div className="company-dashboard-timeline">
          {loginActivity.map((entry) => (
            <div key={entry.id} className="company-dashboard-timeline-row">
              <div className="company-dashboard-timeline-dot" />
              <div>
                <strong>{entry.action}</strong>
                <span>{entry.source} · {entry.status}</span>
              </div>
              <time>{entry.time ? new Date(entry.time).toLocaleString() : 'Now'}</time>
            </div>
          ))}
        </div>
      ) : (
        <div className="company-dashboard-empty-state">
          <span>No login activity available.</span>
        </div>
      );
    }

    if (companyDashboardSection === 'security') {
      return (
        <div className="company-dashboard-list-card">
          {[
            ['File Upload Protection', securityStatusData.fileUploadProtection],
            ['Link Protection', securityStatusData.linkProtection],
            ['Login Protection', securityStatusData.loginProtection],
            ['API Key Protection', securityStatusData.apiKeyProtection],
          ].map(([label, value]) => (
            <div key={label} className="company-dashboard-security-row">
              <div className="company-dashboard-security-copy">
                <span className={`company-dashboard-security-dot ${value ? 'is-on' : 'is-off'}`} />
                <span>{label}</span>
              </div>
              <strong>{value ? 'ON' : 'OFF'}</strong>
            </div>
          ))}
        </div>
      );
    }

    if (companyDashboardSection === 'forms') {
      const submittedForms = companyDashboardData?.submittedForms || [];
      return submittedForms.length ? (
        <div className="company-dashboard-table">
          {submittedForms.map((form) => (
            <div key={form.id} className="company-dashboard-table-row">
              <div>
                <strong>{form.title}</strong>
                <span>{form.status}</span>
              </div>
              <div>
                <strong>Submitted</strong>
                <span>{form.submittedAt ? new Date(form.submittedAt).toLocaleString() : 'Not available'}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="company-dashboard-empty-state">
          <span>No submitted forms or requests found.</span>
        </div>
      );
    }

    if (companyDashboardSection === 'settings') {
      return (
        <div className="company-dashboard-section-grid">
          <div className="company-dashboard-card company-dashboard-card-wide">
            <span>Session</span>
            <strong>Company session is active</strong>
            <p>Use refresh to reload live company data, or logout to return to the company login page.</p>
            <div className="company-dashboard-settings-actions">
              <button type="button" className="company-dashboard-action-button" onClick={() => void loadCompanyDashboard()}>
                Refresh Data
              </button>
              <button type="button" className="company-dashboard-action-button is-danger" onClick={() => void handleUserLogout()}>
                Logout
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="company-dashboard-section-grid">
        {[
          ['Employees', stats.totalEmployees ?? 0],
          ['Active Employees', stats.activeEmployees ?? 0],
          ['Open Requests', stats.openRequests ?? 0],
          ['Recent Logins', stats.recentLogins ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="company-dashboard-card">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
        <div className="company-dashboard-card company-dashboard-card-wide">
          <span>Company Summary</span>
          <strong>{details.companyName || appAuthSession?.user?.companyName || 'Approved Company'}</strong>
          <p>{details.companyEmail || appAuthSession?.user?.companyEmail || 'No company email available'}</p>
          <p>{details.companyWebsite || 'No company website available'}</p>
        </div>
      </div>
    );
  };

  return (
    <>
    <div className="flex-center" style={{ gap: '16px' }}>
      {/* Social Icons */}
      <div className="flex-center" style={{ gap: '6px' }}>
        {hasSpotifyBackgroundSession && (
          <div ref={spotifyNowPlayingRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className={`spotify-now-playing-trigger ${spotifyPlayback.isPlaying ? 'is-playing' : ''}`}
              onClick={toggleSpotifyNowPlayingPopup}
              title={spotifyPlayback.title}
              aria-label="Open now playing"
            >
              <Music4 size={13} />
            </button>

            {showSpotifyNowPlayingPopup && (
              <div className="spotify-now-playing-popup popup-aurora-surface" onClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  className="spotify-start-close"
                  onClick={() => setShowSpotifyNowPlayingPopup(false)}
                >
                  <X size={15} />
                </button>

                <div className="spotify-now-playing-header">
                  {spotifyPlayback.albumImage ? (
                    <img
                      src={spotifyPlayback.albumImage}
                      alt={spotifyPlayback.title}
                      className="spotify-now-playing-art"
                    />
                  ) : (
                    <div className="spotify-now-playing-art spotify-track-art-fallback">
                      <Music4 size={18} />
                    </div>
                  )}

                  <div className="spotify-now-playing-copy">
                    <strong>{spotifyPlayback.title}</strong>
                    <span>{spotifyPlayback.artist}</span>
                  </div>

                  <button
                    type="button"
                    className="spotify-now-playing-settings"
                    onClick={openSpotifyPlaylistView}
                    title="Open playlist"
                  >
                    <Settings size={14} />
                  </button>
                </div>

                <div className="spotify-now-playing-controls">
                  <button
                    type="button"
                    className="spotify-start-secondary-button"
                    onClick={handleSpotifyTogglePlayback}
                    disabled={!isSpotifyPlayerReady}
                  >
                    {spotifyPlayback.isPlaying ? 'Pause' : 'Play'}
                  </button>
                  <button
                    type="button"
                    className="spotify-start-secondary-button spotify-now-playing-stop"
                    onClick={handleSpotifyStopPlayback}
                  >
                    Stop
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={spotifyVolume}
                    onChange={handleSpotifyVolumeChange}
                    className="spotify-now-playing-volume"
                    aria-label="Spotify volume"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <CenterSearch onPopupStateChange={setIsSearchPopupOpen} />
        
        {/* WhatsApp Icon with Popup */}
        <div style={{ position: 'relative' }} ref={waPopupRef}>
          <div 
            className="flex-center icon-item" 
            onClick={() => {
              if (!isWaOpen) setIsWaSendMsgOpen(false);
              setIsWaOpen(!isWaOpen);
            }}
            style={{ background: isWaOpen ? 'var(--hover-bg)' : 'transparent' }}
          >
            <FaWhatsapp size={16} color="white" />
          </div>

          {/* WhatsApp Popup Dropdown */}
          <div className="popup-aurora-surface" style={{
            position: 'absolute',
            top: '100%',
            right: -80, // Center relative to icon
            marginTop: '10px',
            background: 'var(--menu-bg)',
            backdropFilter: 'blur(30px)',
            WebkitBackdropFilter: 'blur(30px)',
            borderRadius: '12px',
            border: '1px solid var(--menu-border)',
            padding: '16px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
            minWidth: '260px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            opacity: isWaOpen ? 1 : 0,
            visibility: isWaOpen ? 'visible' : 'hidden',
            transform: isWaOpen ? 'translateY(0) scale(1)' : 'translateY(-10px) scale(0.95)',
            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            pointerEvents: isWaOpen ? 'auto' : 'none',
            zIndex: 100
          }}>
            {!isWaSendMsgOpen ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="flex-between" style={{ marginBottom: '4px' }}>
                  <div className="flex-center" style={{ gap: '8px', fontSize: '15px', fontWeight: 'bold' }}>
                    <FaWhatsapp size={18} color="white" /> WhatsApp
                  </div>
                  <div 
                    onClick={() => setIsWaOpen(false)}
                    className="flex-center icon-item" 
                    style={{ width: '20px', height: '20px', background: 'rgba(255,255,255,0.1)', cursor: 'pointer' }}
                  >
                    <X size={12} />
                  </div>
                </div>
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsWaSendMsgOpen(true);
                  }}
                  style={{
                    padding: '12px 16px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    transition: 'background 0.2s',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                >
                  <Plus size={16} color="white" /> Send Message
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'slideInRight 0.2s ease-out' }}>
                <style>{`
                  @keyframes slideInRight {
                    from { opacity: 0; transform: translateX(10px); }
                    to { opacity: 1; transform: translateX(0); }
                  }
                `}</style>
                {/* Top Section */}
                <div className="flex-between" style={{ paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <div className="flex-center" style={{ gap: '10px' }}>
                    {/* WhatsApp Profile Circle */}
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <FaWhatsapp size={16} color="white" />
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: '600', color: 'white' }}>Send Message</div>
                  </div>
                  <div className="flex-center" style={{ gap: '8px' }}>
                    {/* Close X Button */}
                    <div 
                      onClick={() => setIsWaSendMsgOpen(false)}
                      className="flex-center icon-item" 
                      style={{ width: '24px', height: '24px', background: 'rgba(255,255,255,0.1)', cursor: 'pointer', borderRadius: '50%' }}
                    >
                      <X size={14} color="white" />
                    </div>
                  </div>
                </div>

                {/* Select Contact Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative', width: '100%', overflow: 'visible' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
                    <div 
                      onClick={() => {
                        setIsContactSelectOpen(!isContactSelectOpen);
                        setActiveMenuContact(null);
                      }}
                      style={{
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid var(--menu-border)',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        color: waPhone ? 'white' : 'rgba(255,255,255,0.6)',
                        fontSize: '13px',
                        cursor: 'pointer',
                        flex: 1,
                        minWidth: 0,
                        boxSizing: 'border-box',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'background 0.2s',
                      }}
                      onMouseOver={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.4)'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.3)'}
                    >
                      {selectedContact ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #FF9A9E 0%, #FECFEF 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#333', fontSize: '14px', flexShrink: 0 }}>
                            {selectedContact.name ? selectedContact.name.charAt(0).toUpperCase() : '?'}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                            <span style={{ fontWeight: '600', fontSize: '13px', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>{selectedContact.name || 'Unknown'}</span>
                            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>{selectedContact.phone}</span>
                          </div>
                        </div>
                      ) : <span>Choose saved contact</span>}
                      <ChevronDown size={14} style={{ flexShrink: 0, transition: 'transform 0.2s', transform: isContactSelectOpen ? 'rotate(180deg)' : 'rotate(0)' }} />
                    </div>

                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        openContactEditor();
                      }}
                      className="flex-center icon-item"
                      title="Add New Contact"
                      style={{ width: '36px', height: '36px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', borderRadius: '12px', flexShrink: 0 }}
                    >
                      <Plus size={16} color="white" strokeWidth={2.4} />
                    </div>

                    <div style={{ flexShrink: 0 }}>
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!selectedContact) return;
                          setIsContactSelectOpen(false);
                          setActiveMenuContact(activeMenuContact?.phone === selectedContact.phone ? null : selectedContact);
                        }}
                        className="flex-center icon-item"
                        title={selectedContact ? 'Contact options' : 'Select a contact first'}
                        style={{
                          width: '36px',
                          height: '36px',
                          background: activeMenuContact ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          cursor: selectedContact ? 'pointer' : 'not-allowed',
                          borderRadius: '12px',
                          opacity: selectedContact ? 1 : 0.45,
                        }}
                      >
                        <MoreVertical size={16} color="white" strokeWidth={2.2} />
                      </div>
                    </div>
                  </div>

                  {/* Dropdown List */}
                  {isContactSelectOpen && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      width: '100%',
                      marginTop: '6px',
                      background: 'rgba(26, 26, 28, 0.98)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      maxHeight: '220px',
                      overflowY: 'auto',
                      overflowX: 'hidden',
                      zIndex: 50,
                      boxShadow: '0 10px 40px rgba(0,0,0,0.8)',
                      backdropFilter: 'blur(30px)',
                      WebkitBackdropFilter: 'blur(30px)',
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '4px'
                    }}>
                      {(() => {
                        const uniqueContacts = Array.from(new Map(savedContacts.map(c => [c.phone, c])).values());
                        return uniqueContacts.length > 0 ? uniqueContacts.map((contact, idx) => (
                          <div 
                            key={idx}
                            onClick={() => {
                              setWaPhone(contact.phone.replace(/[^0-9+]/g, ''));
                              setIsContactSelectOpen(false);
                            }}
                            style={{
                              padding: '8px 10px',
                              cursor: 'pointer',
                              borderRadius: '8px',
                              transition: 'all 0.2s',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                            }}
                            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                            onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white', fontSize: '15px' }}>
                              {contact.name ? contact.name.charAt(0).toUpperCase() : '?'}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                              <div style={{ fontSize: '14px', color: 'white', fontWeight: '500' }}>{contact.name || 'Unknown'}</div>
                              <div style={{ fontSize: '12px', color: '#999' }}>{contact.phone}</div>
                            </div>
                          </div>
                        )) : (
                          <div style={{ padding: '20px', fontSize: '13px', color: '#888', textAlign: 'center' }}>No saved contacts</div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Message Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                  <textarea 
                    placeholder="Type your WhatsApp message..." 
                    value={waMessage}
                    onChange={(e) => setWaMessage(e.target.value)}
                    rows={4}
                    style={{
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--menu-border)',
                      borderRadius: '10px',
                      padding: '14px',
                      color: 'white',
                      fontSize: '14px',
                      lineHeight: '1.5',
                      outline: 'none',
                      width: '100%',
                      resize: 'none',
                      boxSizing: 'border-box',
                      transition: 'border 0.2s',
                    }}
                    onFocus={(e) => e.target.style.border = '1px solid rgba(255,255,255,0.3)'}
                    onBlur={(e) => e.target.style.border = '1px solid var(--menu-border)'}
                  />
                </div>

                {/* Send Button */}
                <button 
                  onClick={handleWaSend}
                  style={{
                    background: '#25D366',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '12px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    marginTop: '4px',
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(37, 211, 102, 0.4)'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = '#20b858';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(37, 211, 102, 0.5)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = '#25D366';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 14px rgba(37, 211, 102, 0.4)';
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.transform = 'translateY(1px)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(37, 211, 102, 0.4)';
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(37, 211, 102, 0.5)';
                  }}
                >
                  <FaWhatsapp size={16} /> Send Message
                </button>
              </div>
            )}
          </div>

          {/* Contact Options Nested Popup Overlay */}
          {activeMenuContact && (
            <div 
              className="popup-aurora-overlay"
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                background: 'rgba(0, 0, 0, 0.4)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 9999
              }}
              onClick={() => setActiveMenuContact(null)}
            >
              <style>{`
                @keyframes slideInRightMenu {
                  from { transform: translateX(30px); opacity: 0; }
                  to { transform: translateX(0); opacity: 1; }
                }
              `}</style>
              <div 
                className="popup-aurora-surface"
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: 'rgba(26, 26, 28, 0.95)',
                  backdropFilter: 'blur(30px)',
                  WebkitBackdropFilter: 'blur(30px)',
                  borderRadius: '16px',
                  border: '1px solid var(--menu-border)',
                  padding: '20px',
                  boxShadow: '0 25px 70px rgba(0,0,0,0.8)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  color: 'white',
                  width: '260px',
                  animation: 'slideInRightMenu 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '15px', fontWeight: 'bold' }}>Contact Options</div>
                  <div 
                    onClick={() => setActiveMenuContact(null)}
                    style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.1)', borderRadius: '50%', padding: '4px' }}
                  >
                    <X size={14} />
                  </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '12px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '500', color: 'white' }}>{activeMenuContact.name || 'Unknown'}</div>
                  <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>{activeMenuContact.phone}</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      openContactEditor(activeMenuContact);
                    }}
                    style={{ padding: '12px', fontSize: '14px', color: 'white', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderRadius: '8px', transition: 'background 0.2s', background: 'rgba(255,255,255,0.03)' }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  >
                    <span>✏️</span> Edit Contact
                  </div>
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      removeContact(activeMenuContact);
                    }}
                    style={{ padding: '12px', fontSize: '14px', color: '#ff6b6b', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderRadius: '8px', transition: 'background 0.2s', background: 'rgba(255,255,255,0.03)' }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  >
                    <span>🗑️</span> Delete Contact
                  </div>
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailsContact(activeMenuContact);
                      setActiveMenuContact(null);
                    }}
                    style={{ padding: '12px', fontSize: '14px', color: 'white', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderRadius: '8px', transition: 'background 0.2s', background: 'rgba(255,255,255,0.03)' }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  >
                    <span>ℹ️</span> More Details
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Add Contact Nested Popup Overlay */}
          {isAddContactOpen && (
            <div 
              className="popup-aurora-overlay"
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                padding: '60px 16px 16px',
                background: 'rgba(0, 0, 0, 0.18)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
                zIndex: 9999,
                animation: 'fadeOverlayIn 0.22s ease'
              }}
              onClick={() => {
                setIsAddContactOpen(false);
                setEditingContactPhone(null);
                setContactForm({ name: '', phone: '' });
              }}
            >
              <div 
                className="contact-popup-container popup-aurora-surface"
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: 'min(360px, 92vw)',
                  maxHeight: 'calc(100vh - 90px)',
                  overflowY: 'auto',
                  background: 'linear-gradient(180deg, rgba(10, 13, 16, 0.96), rgba(16, 20, 24, 0.92))',
                  borderRadius: '28px',
                  border: '1px solid var(--menu-border)',
                  padding: '24px 20px',
                  boxShadow: '0 25px 70px rgba(0,0,0,0.8)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px',
                  color: 'white',
                  fontFamily: 'sans-serif',
                  position: 'relative',
                  animation: 'slideDownFade 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                  overflowX: 'hidden'
                }}
              >
                <style>{`
                  @keyframes fadeOverlayIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                  }
                  @keyframes slideDownFade {
                    from { transform: translateY(-20px) scale(0.95); opacity: 0; }
                    to { transform: translateY(0) scale(1); opacity: 1; }
                  }
                  .contact-popup-container::-webkit-scrollbar {
                    display: none;
                  }
                  .contact-popup-container {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                  }
                `}</style>
              {/* Header */}
              <div 
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: 0.9, alignSelf: 'flex-start', padding: '6px 8px', borderRadius: '8px', marginLeft: '-8px' }}
              >
                <Smartphone size={14} />
                <span style={{ fontSize: '13px', fontWeight: '500' }}>Phone</span>
              </div>

              {/* Photo Section */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', position: 'relative' }}>
                <div 
                  className="flex-center" 
                  style={{ width: '80px', height: '100px', background: '#1C1C1C', borderRadius: '12px', position: 'relative' }}
                >
                  <User size={32} color="#666" />
                  <div style={{ position: 'absolute', bottom: -6, right: -6, background: '#4da3ff', borderRadius: '50%', padding: '4px', color: 'white', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>
                    <Plus size={14} />
                  </div>
                </div>
                
                <div className="flex-center" style={{ width: '100px', height: '100px', background: '#1C1C1C', borderRadius: '50%', position: 'relative' }}>
                  <User size={32} color="#666" />
                  <div style={{ position: 'absolute', bottom: 4, right: 4, background: '#4da3ff', borderRadius: '50%', padding: '4px', color: 'white', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>
                    <Plus size={14} />
                  </div>
                </div>
              </div>

              {/* Input Fields */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', background: '#1C1C1C', borderRadius: '50px', padding: '12px 16px', gap: '12px', transition: 'box-shadow 0.2s' }}>
                  <User size={18} color="#4da3ff" />
                  <input type="text" placeholder="Name" value={contactForm.name} onChange={e => setContactForm({...contactForm, name: e.target.value})} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '14px', outline: 'none', width: '100%', padding: 0 }} />
                  <ChevronDown size={16} color="#666" />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', background: '#1C1C1C', borderRadius: '50px', padding: '12px 16px', gap: '12px', transition: 'box-shadow 0.2s' }}>
                  <Phone size={18} color="#666" />
                  <input type="text" placeholder="Phone" value={contactForm.phone} onChange={e => setContactForm({...contactForm, phone: e.target.value})} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '14px', outline: 'none', width: '100%', padding: 0 }} />
                </div>
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', padding: '0 8px' }}>
                <button 
                  onClick={() => {
                    setIsAddContactOpen(false);
                    setEditingContactPhone(null);
                    setContactForm({ name: '', phone: '' });
                  }}
                  style={{ background: 'transparent', border: 'none', color: 'white', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    if (contactForm.phone) {
                      const formattedPhone = contactForm.phone.replace(/[^0-9+]/g, '');
                      if (formattedPhone) {
                        setPhoneHistory(prev => {
                          const filtered = prev.filter(p => p !== formattedPhone);
                          return [formattedPhone, ...filtered].slice(0, 8);
                        });
                      }
                      const existingContacts = JSON.parse(localStorage.getItem('waContacts') || '[]');
                      const newContact = { ...contactForm, savedTo: 'Phone' };
                      const newContacts = editingContactPhone
                        ? existingContacts.map((contact) =>
                            contact.phone === editingContactPhone ? { ...contact, ...newContact } : contact
                          )
                        : [...existingContacts, newContact];
                      localStorage.setItem('waContacts', JSON.stringify(newContacts));
                      setSavedContacts(newContacts);
                      setWaPhone(formattedPhone);
                    }
                    setIsAddContactOpen(false);
                    setEditingContactPhone(null);
                    setContactForm({ name: '', phone: '' });
                  }}
                  style={{ background: 'transparent', border: 'none', color: 'white', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
          )}

          {/* Details Contact Nested Popup Overlay */}
          {detailsContact && (
            <div 
              className="popup-aurora-overlay"
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                paddingTop: '60px',
                background: 'rgba(0, 0, 0, 0.4)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
                zIndex: 9999
              }}
              onClick={() => setDetailsContact(null)}
            >
              <div 
                className="contact-popup-container popup-aurora-surface"
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: 'min(360px, 92vw)',
                  background: '#000000',
                  borderRadius: '28px',
                  border: '1px solid var(--menu-border)',
                  padding: '24px 20px',
                  boxShadow: '0 25px 70px rgba(0,0,0,0.8)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px',
                  color: 'white',
                  fontFamily: 'sans-serif',
                  position: 'relative',
                  animation: 'slideDownFade 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: 0.9 }}>
                    <User size={16} />
                    <span style={{ fontSize: '14px', fontWeight: '500' }}>Contact Details</span>
                  </div>
                  <div 
                    onClick={() => setDetailsContact(null)}
                    style={{ padding: '6px', cursor: 'pointer', background: 'rgba(255,255,255,0.1)', borderRadius: '50%' }}
                  >
                    <X size={14} />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <div className="flex-center" style={{ width: '80px', height: '80px', background: '#1C1C1C', borderRadius: '50%' }}>
                    <User size={36} color="#666" />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{detailsContact.name || 'Unknown'}</div>
                    <div style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>{detailsContact.phone}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', background: '#1C1C1C', borderRadius: '16px', padding: '12px 16px', gap: '12px' }}>
                    <Mail size={18} color="#999" />
                    <div>
                      <div style={{ fontSize: '11px', color: '#666', marginBottom: '2px' }}>Email</div>
                      <div style={{ fontSize: '14px' }}>{detailsContact.email || 'Not provided'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', background: '#1C1C1C', borderRadius: '16px', padding: '12px 16px', gap: '12px' }}>
                    <Briefcase size={18} color="#999" />
                    <div>
                      <div style={{ fontSize: '11px', color: '#666', marginBottom: '2px' }}>Work Info</div>
                      <div style={{ fontSize: '14px' }}>{detailsContact.work || 'Not provided'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', background: '#1C1C1C', borderRadius: '16px', padding: '12px 16px', gap: '12px' }}>
                    <Users size={18} color="#999" />
                    <div>
                      <div style={{ fontSize: '11px', color: '#666', marginBottom: '2px' }}>Groups</div>
                      <div style={{ fontSize: '14px' }}>{detailsContact.groups || 'None'}</div>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    setDetailsContact(null);
                    setWaPhone(detailsContact.phone.replace(/[^0-9+]/g, ''));
                  }}
                  style={{
                    background: '#25D366',
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '12px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    marginTop: '8px',
                    transition: 'background 0.2s',
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                  onMouseOver={(e) => e.target.style.background = '#20b858'}
                  onMouseOut={(e) => e.target.style.background = '#25D366'}
                >
                  <FaWhatsapp size={16} /> Message
                </button>
              </div>
            </div>
          )}

        </div>

        <div style={{ position: 'relative' }} ref={spotifyPopupRef}>
          <div
            className={`flex-center icon-item spotify-icon-button ${isAnySpotifyPopupOpen ? 'active' : ''}`}
            onClick={toggleSpotifyPopup}
            style={{ color: 'white' }}
          >
            <FaSpotify size={15} />
          </div>

          {showSpotifyPopup && spotifyActiveView === 'none' && (
            <div className="spotify-start-popup popup-aurora-surface" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="spotify-start-close"
                onClick={closeSpotifyPopups}
              >
                <X size={15} />
              </button>

              <div className="spotify-start-icon">
                <FaSpotify size={36} />
              </div>

              <div className="spotify-start-copy">
                <h3>Spotify</h3>
                <p>
                  {spotifyUser
                    ? 'Use Spotify dashboard actions to view your top tracks or create a playlist.'
                    : 'Log in with Spotify to load your profile, top tracks, and playlist tools.'}
                </p>
              </div>

              {spotifyUser ? (
                <div className="spotify-user-card">
                  {spotifyUser.images?.[0]?.url ? (
                    <img
                      src={spotifyUser.images[0].url}
                      alt={spotifyUser.display_name || spotifyUser.id}
                      className="spotify-user-avatar"
                    />
                  ) : (
                    <div className="spotify-user-avatar spotify-user-avatar-fallback">
                      {(spotifyUser.display_name || spotifyUser.id || 'S').slice(0, 1).toUpperCase()}
                    </div>
                  )}

                  <div className="spotify-user-details">
                    <strong>{spotifyUser.display_name || spotifyUser.id}</strong>
                    <span>{spotifyUser.email || 'Email unavailable'}</span>
                  </div>

                  <span className="spotify-user-pill">Connected</span>
                </div>
              ) : null}

              {spotifyAuthError ? <div className="spotify-auth-error">{spotifyAuthError}</div> : null}

              <button
                type="button"
                className="spotify-start-login-button"
                onClick={spotifyUser ? disconnectSpotify : handleSpotifyLogin}
                disabled={spotifyAuthStatus === 'loading'}
              >
                {spotifyAuthStatus === 'loading'
                  ? 'Connecting...'
                  : spotifyUser
                    ? 'Logout'
                    : 'Login with Spotify'}
              </button>

              {spotifyUser ? (
                <>
                  <div className="spotify-dashboard-actions">
                    <button
                      type="button"
                      className="spotify-start-secondary-button"
                      onClick={handleLoadSpotifyTopTracks}
                      disabled={isSpotifyTracksLoading}
                    >
                      {isSpotifyTracksLoading ? 'Loading...' : 'Top Tracks'}
                    </button>
                    <button
                      type="button"
                      className="spotify-start-secondary-button"
                      onClick={openSpotifyCreateView}
                    >
                      Create Spotify
                    </button>
                    <button
                      type="button"
                      className="spotify-start-secondary-button"
                      onClick={openSpotifyPlaylistView}
                    >
                      Playlist
                    </button>
                  </div>
                </>
              ) : null}

              {spotifyPlaylistStatus ? (
                <div className="spotify-playlist-status">{spotifyPlaylistStatus}</div>
              ) : null}
            </div>
          )}

          {showSpotifyPopup && spotifyActiveView === 'top-tracks' && (
            <div className="spotify-detail-popup popup-aurora-surface" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="spotify-start-close"
                onClick={closeSpotifyOptionPopup}
              >
                <X size={15} />
              </button>
              <div className="spotify-top-tracks-panel">
                <div className="spotify-top-tracks-header">
                  <span>Top Tracks</span>
                  <button
                    type="button"
                    className="spotify-embed-back-button"
                    onClick={closeSpotifyOptionPopup}
                  >
                    Back
                  </button>
                </div>

                {spotifyAuthError ? <div className="spotify-auth-error">{spotifyAuthError}</div> : null}

                {isSpotifyTracksLoading ? (
                  <div className="spotify-tracks-loading">
                    <LoaderCircle size={16} className="spotify-tracks-spinner" />
                    <span>Loading your Spotify tracks...</span>
                  </div>
                ) : spotifyTopTracks.length ? (
                  <div className="spotify-track-list">
                    {spotifyTopTracks.map((track, index) => (
                      <div key={track.id || `${track.name}-${index}`} className="spotify-track-item">
                        {track.album?.images?.[2]?.url || track.album?.images?.[1]?.url || track.album?.images?.[0]?.url ? (
                          <img
                            src={track.album?.images?.[2]?.url || track.album?.images?.[1]?.url || track.album?.images?.[0]?.url}
                            alt={track.album?.name || track.name}
                            className="spotify-track-art"
                          />
                        ) : (
                          <div className="spotify-track-art spotify-track-art-fallback">
                            <FaSpotify size={18} />
                          </div>
                        )}
                        <div className="spotify-track-copy">
                          <strong>{track.name}</strong>
                          <span>{track.artists?.map((artist) => artist.name).join(', ') || 'Unknown artist'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="spotify-tracks-empty">
                    No top tracks available right now.
                  </div>
                )}
              </div>
            </div>
          )}

          {showSpotifyPopup && spotifyActiveView === 'create-spotify' && (
            <div className="spotify-detail-popup popup-aurora-surface" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="spotify-start-close"
                onClick={closeSpotifyOptionPopup}
              >
                <X size={15} />
              </button>
              <div className="spotify-top-tracks-panel spotify-create-panel">
                <div className="spotify-top-tracks-header">
                  <span>Create Spotify</span>
                  <button
                    type="button"
                    className="spotify-embed-back-button"
                    onClick={closeSpotifyOptionPopup}
                  >
                    Back
                  </button>
                </div>
                <input
                  type="text"
                  className="spotify-create-input"
                  value={spotifyPlaylistName}
                  onChange={(event) => setSpotifyPlaylistName(event.target.value)}
                  placeholder="Playlist name"
                />
                <button
                  type="button"
                  className="spotify-start-secondary-button spotify-create-submit"
                  onClick={handleCreateSpotifyPlaylist}
                  disabled={isSpotifyPlaylistCreating}
                >
                  {isSpotifyPlaylistCreating ? 'Creating Playlist...' : 'Create Playlist'}
                </button>
                {spotifyAuthError ? <div className="spotify-auth-error">{spotifyAuthError}</div> : null}
                {spotifyPlaylistStatus ? (
                  <div className="spotify-playlist-status">{spotifyPlaylistStatus}</div>
                ) : null}
              </div>
            </div>
          )}

          {isSpotifyPlayerMounted && (
            <div
              className={`spotify-detail-popup spotify-detail-popup-wide popup-aurora-surface spotify-player-shell ${spotifyActiveView === 'playlist' ? 'is-visible' : 'is-hidden'}`}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="spotify-start-close"
                onClick={closeSpotifyOptionPopup}
              >
                <X size={15} />
              </button>
              <div className="spotify-top-tracks-panel spotify-playlist-embed-panel">
                <div className="spotify-top-tracks-header">
                  <span>Playlist</span>
                  <button
                    type="button"
                    className="spotify-embed-back-button"
                    onClick={closeSpotifyOptionPopup}
                  >
                    Back
                  </button>
                </div>
                <div className="spotify-embed-shell">
                  <div
                    ref={spotifyPlayerHostRef}
                    className="spotify-iframe-host"
                    aria-label="Spotify Embed: Recommendation Playlist"
                  />
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* System Tray Icons */}
      <div className="flex-center" style={{ gap: '6px' }}>
        <div ref={appLauncherRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className={`app-launcher-trigger ${isAppLauncherOpen ? 'is-open' : ''}`}
            onClick={toggleAppLauncher}
            aria-label="Open app launcher"
          >
            <LayoutGrid size={14} />
          </button>

          {isAppLauncherOpen && (
            <div
              className={`app-launcher-popup popup-aurora-surface app-launcher-view-${appBoxSettings.appView} app-launcher-size-${appBoxSettings.iconSize} ${appBoxSettings.dockAnimation ? 'dock-anim-on' : 'dock-anim-off'}`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="app-launcher-dock-header">
                <div className="app-launcher-dock-title">
                  <BrandLogo className="app-launcher-brand-logo" surface="dark" />
                  <span>Apps</span>
                </div>
                <div className="app-launcher-dock-actions">
                  <button
                    type="button"
                    className="app-launcher-settings-trigger"
                    onClick={(event) => {
                      event.stopPropagation();
                      setIsAppPickerOpen(false);
                      setIsResetAppsConfirmOpen(false);
                      setIsAppPrivacyOpen(false);
                      setIsAppSecurityOpen(false);
                      setIsAppSettingsOpen((open) => !open);
                    }}
                    aria-label="App settings"
                  >
                    <Settings size={14} />
                  </button>
                  <button
                    type="button"
                    className="app-launcher-add-trigger"
                    onClick={(event) => {
                      event.stopPropagation();
                      openAddAppsPanel();
                    }}
                    aria-label="Add apps"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>

              {appsError ? <div className="app-launcher-message app-launcher-message--error">{appsError}</div> : null}

              {isAppSettingsOpen && (
                <div
                  ref={appSettingsPopupRef}
                  className="app-launcher-settings-popup popup-aurora-surface"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="app-launcher-settings-header">
                    <div className="app-launcher-nested-title">Settings</div>
                    <button
                      type="button"
                      className="app-launcher-picker-close"
                      onClick={() => {
                        setIsAppSettingsOpen(false);
                        setIsAppPrivacyOpen(false);
                        setIsAppSecurityOpen(false);
                        setIsResetAppsConfirmOpen(false);
                      }}
                      aria-label="Close app settings"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div className="app-launcher-settings-section">
                    <span className="app-launcher-settings-label">App View</span>
                    <div className="app-launcher-settings-pill-row">
                      {['dock', 'grid'].map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={`app-launcher-settings-pill ${appBoxSettings.appView === option ? 'is-active' : ''}`}
                          onClick={() => setAppBoxSettings((current) => ({ ...current, appView: option }))}
                        >
                          {option === 'dock' ? 'Dock' : 'Grid'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="app-launcher-settings-section">
                    <span className="app-launcher-settings-label">Icon Size</span>
                    <div className="app-launcher-settings-pill-row">
                      {['small', 'medium', 'large'].map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={`app-launcher-settings-pill ${appBoxSettings.iconSize === option ? 'is-active' : ''}`}
                          onClick={() => setAppBoxSettings((current) => ({ ...current, iconSize: option }))}
                        >
                          {option[0].toUpperCase() + option.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="app-launcher-settings-section">
                    <span className="app-launcher-settings-label">Dock Animation</span>
                    <div className="app-launcher-settings-pill-row">
                      {[
                        { label: 'On', value: true },
                        { label: 'Off', value: false },
                      ].map((option) => (
                        <button
                          key={option.label}
                          type="button"
                          className={`app-launcher-settings-pill ${appBoxSettings.dockAnimation === option.value ? 'is-active' : ''}`}
                          onClick={() => setAppBoxSettings((current) => ({ ...current, dockAnimation: option.value }))}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="app-launcher-settings-actions">
                    <button
                      type="button"
                      className="app-launcher-settings-action"
                      onClick={() => {
                        setIsResetAppsConfirmOpen(false);
                        setIsAppPrivacyOpen(false);
                        const nextOpen = !isAppSecurityOpen;
                        if (nextOpen) {
                          setIsSecurityStatusLoading(true);
                          setSecurityStatusError('');
                          setSecurityStatus(null);
                          updateAppSecurityPosition();
                          void loadSecurityStatus();
                        }
                        setIsAppSecurityOpen(nextOpen);
                      }}
                    >
                      <Shield size={14} />
                      <span>Security Check</span>
                    </button>
                    <button
                      type="button"
                      className="app-launcher-settings-action"
                      onClick={() => {
                        setIsResetAppsConfirmOpen(false);
                        setIsAppSecurityOpen(false);
                        const nextOpen = !isAppPrivacyOpen;
                        if (nextOpen) {
                          updateAppPrivacyPosition();
                        }
                        setIsAppPrivacyOpen(nextOpen);
                      }}
                    >
                      Local App / Private App
                    </button>
                    <button
                      type="button"
                      className="app-launcher-settings-action"
                      onClick={openAddAppsPanel}
                    >
                      Manage Apps
                    </button>
                    <button
                      type="button"
                      className="app-launcher-settings-action is-danger"
                      onClick={() => setIsResetAppsConfirmOpen((open) => !open)}
                    >
                      Reset Apps
                    </button>
                  </div>

                  {isResetAppsConfirmOpen && (
                    <div className="app-launcher-reset-confirm">
                      <div className="app-launcher-reset-copy">Remove all added apps from the launcher?</div>
                      <div className="app-launcher-reset-actions">
                        <button
                          type="button"
                          className="app-launcher-settings-pill"
                          onClick={() => setIsResetAppsConfirmOpen(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="app-launcher-settings-pill is-danger"
                          onClick={handleResetApps}
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              )}

              {isAppSecurityOpen ? createPortal(
                <div
                  ref={appSecurityPopupRef}
                  className={`app-launcher-security-popup popup-aurora-surface is-side-panel is-${appSecurityPosition.side}`}
                  style={{
                    top: `${appSecurityPosition.top}px`,
                    left: `${appSecurityPosition.left}px`,
                  }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="app-launcher-settings-header">
                    <div className="app-launcher-nested-title app-launcher-nested-title--with-icon">
                      <Shield size={14} />
                      <span>Security Check</span>
                    </div>
                    <button
                      type="button"
                      className="app-launcher-picker-close"
                      onClick={() => setIsAppSecurityOpen(false)}
                      aria-label="Close security check"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {isSecurityStatusLoading ? (
                    <div className="app-launcher-security-loading">Checking security status...</div>
                  ) : null}

                  {!isSecurityStatusLoading && securityStatusError ? (
                    <div className="app-launcher-security-unavailable">{securityStatusError}</div>
                  ) : null}

                  {!isSecurityStatusLoading && !securityStatusError && securityStatus ? (
                    <div className="app-launcher-security-status-list">
                      {[
                        ['File Upload Protection', securityStatus.fileUploadProtection],
                        ['Link Protection', securityStatus.linkProtection],
                        ['Login Protection', securityStatus.loginProtection],
                        ['API Key Protection', securityStatus.apiKeyProtection],
                      ].map(([label, isEnabled]) => (
                        <div key={label} className="app-launcher-security-status-item">
                          <div className="app-launcher-security-status-copy">
                            <span className={`app-launcher-security-status-dot ${isEnabled ? 'is-on' : 'is-off'}`} />
                            <span>{label}</span>
                          </div>
                          <strong className={isEnabled ? 'is-on' : 'is-off'}>{isEnabled ? 'ON' : 'OFF'}</strong>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>,
                document.body,
              ) : null}

              {isAppPrivacyOpen ? createPortal(
                <div
                  ref={appPrivacyPopupRef}
                  className={`app-launcher-privacy-popup popup-aurora-surface is-side-panel is-${appPrivacyPosition.side}`}
                  style={{
                    top: `${appPrivacyPosition.top}px`,
                    left: `${appPrivacyPosition.left}px`,
                  }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="app-launcher-settings-header">
                    <div className="app-launcher-nested-title">Local App / Private App</div>
                    <button
                      type="button"
                      className="app-launcher-picker-close"
                      onClick={() => setIsAppPrivacyOpen(false)}
                      aria-label="Close privacy settings"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div className="app-launcher-settings-section">
                    <div className="app-launcher-settings-pill-row">
                      {[
                        { label: 'Local App', value: 'local' },
                        { label: 'Private App', value: 'private' },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`app-launcher-settings-pill ${appPrivacySettings.mode === option.value ? 'is-active' : ''}`}
                          onClick={() => setAppPrivacySettings((current) => ({ ...current, mode: option.value }))}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {appPrivacySettings.mode === 'local' ? (
                    <div className="app-launcher-privacy-panel">
                      <div className="app-launcher-privacy-status">Local Mode Active</div>
                      <p className="app-launcher-privacy-copy">
                        This app works only on your local device, keeps data in local storage, and supports offline local features without uploading your data to cloud services.
                      </p>

                      <div className="app-launcher-privacy-toggle-list">
                        {[
                          'Store data locally',
                          'Offline mode',
                          'Manage local files',
                        ].map((label) => (
                          <button key={label} type="button" className="app-launcher-privacy-toggle is-active">
                            <span>{label}</span>
                            <strong>Ready</strong>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="app-launcher-privacy-panel">
                      <div className="app-launcher-privacy-status">Private Mode Active</div>
                      <p className="app-launcher-privacy-copy">
                        Privacy mode focuses on user control with local-only settings for tracking, analytics, saved files, and launcher protection.
                      </p>

                      <div className="app-launcher-privacy-toggle-list">
                        <button
                          type="button"
                          className={`app-launcher-privacy-toggle ${appPrivacySettings.trackingDisabled ? 'is-active' : ''}`}
                          onClick={() => setAppPrivacySettings((current) => ({
                            ...current,
                            trackingDisabled: !current.trackingDisabled,
                          }))}
                        >
                          <span>Disable Tracking</span>
                          <strong>{appPrivacySettings.trackingDisabled ? 'On' : 'Off'}</strong>
                        </button>
                        <button
                          type="button"
                          className={`app-launcher-privacy-toggle ${appPrivacySettings.analyticsDisabled ? 'is-active' : ''}`}
                          onClick={() => setAppPrivacySettings((current) => ({
                            ...current,
                            analyticsDisabled: !current.analyticsDisabled,
                          }))}
                        >
                          <span>Disable Analytics</span>
                          <strong>{appPrivacySettings.analyticsDisabled ? 'On' : 'Off'}</strong>
                        </button>
                        <button
                          type="button"
                          className="app-launcher-privacy-toggle"
                          onClick={openAddAppsPanel}
                        >
                          <span>Manage Saved Files</span>
                          <strong>{selectedApps.length}</strong>
                        </button>
                      </div>

                      <div className="app-launcher-privacy-pin">
                        <label className="app-launcher-settings-label" htmlFor="app-private-pin">
                          Lock App / Privacy Protection
                        </label>
                        <div className="app-launcher-privacy-pin-row">
                          <input
                            id="app-private-pin"
                            type="password"
                            value={privacyPinDraft}
                            onChange={(event) => setPrivacyPinDraft(event.target.value)}
                            className="app-launcher-privacy-input"
                            placeholder="Enter PIN"
                          />
                          <button
                            type="button"
                            className="app-launcher-settings-pill"
                            onClick={handleSavePrivacyPin}
                          >
                            Save
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="app-launcher-settings-action is-danger"
                        onClick={handleClearLocalAppData}
                      >
                        Clear Local Data
                      </button>
                    </div>
                  )}
                </div>,
                document.body,
              ) : null}

              <div className="app-launcher-selected-list">
                {visibleSelectedApps.length ? (
                  visibleSelectedApps.map((app) => {
                    const iconDataUrl = app.iconDataUrl || appVisuals[app.id]?.iconDataUrl;

                    return (
                      <div key={app.id} className="app-launcher-selected-item">
                        <button
                          type="button"
                          className="app-launcher-selected-icon-button"
                          onDoubleClick={() => void openSelectedApp(app)}
                          title={app.name}
                          aria-label={`Open ${app.name}`}
                        >
                          <div className="app-launcher-picker-icon app-launcher-selected-icon-shell">
                            {iconDataUrl ? (
                              <img
                                src={iconDataUrl}
                                alt={`${app.name} icon`}
                                className="app-launcher-picker-icon-image"
                              />
                            ) : (
                              <LayoutGrid size={16} />
                            )}
                          </div>
                        </button>
                        <button
                          type="button"
                          className="app-launcher-selected-remove"
                          onClick={() => removeSelectedApp(app.id)}
                          aria-label={`Remove ${app.name}`}
                          title={`Remove ${app.name}`}
                        >
                          <X size={10} />
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="app-launcher-message">
                    <span>Added apps will appear here.</span>
                  </div>
                )}
              </div>

              {isAppPickerOpen && (
                <div className="app-launcher-picker-popup popup-aurora-surface" onClick={(event) => event.stopPropagation()}>
                  <div className="app-launcher-picker-header">
                    <div className="app-launcher-nested-title">Add Apps</div>
                    <div className="app-launcher-picker-header-actions">
                      <button
                        type="button"
                        className="app-launcher-picker-refresh"
                        onClick={() => {
                          void loadInstalledApps(true);
                        }}
                        aria-label="Refresh app list"
                        disabled={isAppsLoading}
                      >
                        <RefreshCw size={14} className={isAppsLoading ? 'wifi-action-spinner' : ''} />
                      </button>
                      <button
                        type="button"
                        className="app-launcher-picker-close"
                        onClick={() => {
                          setIsAppPickerOpen(false);
                          setAppPickerQuery('');
                        }}
                        aria-label="Close app picker"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="app-launcher-search-row">
                    <SearchIcon size={14} className="app-launcher-search-icon" />
                    <input
                      type="text"
                      className="app-launcher-search-input"
                      placeholder="Search apps..."
                      value={appPickerQuery}
                      onChange={(event) => setAppPickerQuery(event.target.value)}
                    />
                  </div>

                  <div className="app-launcher-picker-list">
                    {isAppsLoading ? (
                      <div className="app-launcher-message">
                        <LoaderCircle size={16} className="wifi-action-spinner" />
                        <span>Loading apps...</span>
                      </div>
                    ) : null}

                    {!isAppsLoading && !visiblePickerApps.length ? (
                      <div className="app-launcher-message">
                        <span>{normalizedPickerSearch ? 'No apps match your search.' : 'No installed apps found.'}</span>
                      </div>
                    ) : null}

                    {!isAppsLoading && visiblePickerApps.map((app) => {
                      const isAdded = selectedApps.some((selectedApp) => selectedApp.id === app.id);
                      const iconDataUrl = appVisuals[app.id]?.iconDataUrl;

                      return (
                        <div
                          key={app.id}
                          className="app-launcher-picker-item"
                        >
                          <div className="app-launcher-picker-icon">
                            {iconDataUrl ? (
                              <img
                                src={iconDataUrl}
                                alt={`${app.name} icon`}
                                className="app-launcher-picker-icon-image"
                              />
                            ) : (
                              <LayoutGrid size={16} />
                            )}
                          </div>
                          <span className="app-launcher-picker-name">{app.name}</span>
                          <button
                            type="button"
                            className={`app-launcher-picker-badge ${isAdded ? 'is-added' : ''}`}
                            onClick={() => toggleSelectedApp(app)}
                            disabled={isAdded}
                          >
                            {isAdded ? 'Added' : 'Add'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div ref={wifiPopupRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className={`flex-center icon-item wifi-control-button ${connectedWifi ? 'connected' : 'disconnected'} ${isWifiDropdownOpen ? 'open' : ''}`}
            onClick={handleWifiToggle}
          >
            <Wifi size={13} />
          </button>

          {isWifiDropdownOpen && (
            <div className="wifi-dropdown-panel popup-aurora-surface" onClick={(event) => event.stopPropagation()}>
              <div className="wifi-dropdown-header">
                <div>
                  <div className="wifi-dropdown-title">Wi-Fi</div>
                  <div className="wifi-dropdown-subtitle">{wifiConnectedName}</div>
                </div>
                <div className="wifi-dropdown-header-actions">
                  <button
                    type="button"
                    className="wifi-refresh-button"
                    onClick={handleWifiRefresh}
                    disabled={isWifiLoading}
                    aria-label="Refresh Wi-Fi networks"
                  >
                    <RefreshCw size={13} className={isWifiLoading ? 'wifi-action-spinner' : ''} />
                  </button>
                  <div className={`wifi-status-pill ${connectedWifi ? 'connected' : 'disconnected'}`}>
                    {connectedWifi ? 'Connected' : isWifiOnline ? 'Online' : 'Offline'}
                  </div>
                </div>
              </div>

              {wifiError ? <div className="wifi-error-banner">{wifiError}</div> : null}

              {wifiPasswordPrompt ? (
                <div className="wifi-password-card">
                  <div className="wifi-password-header">
                    <div>
                      <div className="wifi-password-title">Enter Wi-Fi password</div>
                      <div className="wifi-password-subtitle">{wifiPasswordPrompt.name}</div>
                    </div>
                    <button
                      type="button"
                      className="wifi-password-close"
                      onClick={() => {
                        setWifiPasswordPrompt(null);
                        setWifiPasswordInput('');
                        setWifiPasswordError('');
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>

                  <input
                    type="password"
                    className="wifi-password-input"
                    placeholder="Enter password"
                    value={wifiPasswordInput}
                    onChange={(event) => {
                      setWifiPasswordInput(event.target.value);
                      if (wifiPasswordError) {
                        setWifiPasswordError('');
                      }
                    }}
                  />

                  {wifiPasswordError ? <div className="wifi-password-error">{wifiPasswordError}</div> : null}

                  <div className="wifi-password-actions">
                    <button
                      type="button"
                      className="wifi-password-secondary"
                      onClick={() => {
                        setWifiPasswordPrompt(null);
                        setWifiPasswordInput('');
                        setWifiPasswordError('');
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="wifi-password-primary"
                      onClick={submitWifiPassword}
                    >
                      Connect
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="wifi-network-list">
                {isWifiLoading && !wifiNetworks.length ? (
                  <div className="wifi-empty-state">
                    <LoaderCircle size={16} className="wifi-action-spinner" />
                    <span>Scanning nearby networks...</span>
                  </div>
                ) : null}

                {!isWifiLoading && !wifiNetworks.length ? (
                  <div className="wifi-empty-state">
                    <span>No Wi-Fi networks found.</span>
                  </div>
                ) : null}

                {wifiNetworks.map((network) => {
                  const isConnected = network.status === 'connected';
                  const isBusy = wifiBusyNetworkId === network.id;
                  const stateLabel = isConnected ? 'Connected' : network.secure ? 'Saved' : null;

                  return (
                    <div key={network.id} className={`wifi-network-row ${isConnected ? 'is-connected' : ''}`}>
                      <div className="wifi-network-copy">
                        <div className="wifi-network-topline">
                          <span className="wifi-network-name">{network.name}</span>
                          {network.secure ? <Lock size={12} className="wifi-network-lock" /> : null}
                          {stateLabel ? (
                            <span className="wifi-connected-badge">
                              {isConnected ? <Check size={11} /> : null}
                              {stateLabel}
                            </span>
                          ) : null}
                        </div>
                        <div className="wifi-network-bottomline">
                          <div className={`wifi-strength wifi-strength-${network.strength}`} aria-hidden="true">
                            <span />
                            <span />
                            <span />
                            <span />
                          </div>
                          <span>{network.signalPercent ? `${network.signalPercent}% signal` : `${network.strength}/4 bars`}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        className={`wifi-network-action ${isConnected ? 'disconnect' : 'connect'}`}
                        onClick={() => handleWifiNetworkAction(network)}
                        disabled={isBusy}
                      >
                        {isBusy ? <LoaderCircle size={13} className="wifi-action-spinner" /> : null}
                        <span>{isBusy ? 'Working...' : isConnected ? 'Disconnect' : 'Connect'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div ref={bluetoothPopupRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className={`flex-center icon-item bluetooth-control-button ${isBluetoothEnabled ? 'enabled' : 'disabled'} ${isBluetoothPopupOpen ? 'open' : ''}`}
            onClick={handleBluetoothToggle}
            aria-label="Open Bluetooth controls"
            style={{ background: isBluetoothPopupOpen ? 'var(--hover-bg)' : 'transparent' }}
          >
            <Bluetooth size={14} />
          </button>

          {isBluetoothPopupOpen ? (
            <div className="bluetooth-dropdown-panel popup-aurora-surface" onClick={(event) => event.stopPropagation()}>
              <div className="bluetooth-dropdown-header">
                <div>
                  <div className="bluetooth-dropdown-title">Bluetooth</div>
                  <div className="bluetooth-dropdown-subtitle">
                    {isBluetoothEnabled
                      ? (bluetoothScannedAt ? `Last updated ${new Date(bluetoothScannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Nearby devices ready')
                      : 'Bluetooth is turned off'}
                  </div>
                </div>

                <div className="bluetooth-dropdown-header-actions">
                  <button
                    type="button"
                    className="bluetooth-refresh-button"
                    onClick={handleBluetoothScan}
                    disabled={isBluetoothLoading || !isBluetoothEnabled}
                    aria-label="Scan Bluetooth devices"
                  >
                    <RefreshCw size={14} className={isBluetoothLoading ? 'wifi-action-spinner' : ''} />
                  </button>
                  <div className={`bluetooth-status-pill ${isBluetoothEnabled ? 'connected' : 'disconnected'}`}>
                    {isBluetoothEnabled ? 'ON' : 'OFF'}
                  </div>
                </div>
              </div>

              <div className="bluetooth-toggle-row">
                <div className="bluetooth-toggle-copy">
                  <strong>Bluetooth Status</strong>
                  <span>{isBluetoothEnabled ? 'Nearby devices visible' : 'Bluetooth is turned off'}</span>
                </div>
                <button
                  type="button"
                  className={`bluetooth-toggle-switch ${isBluetoothEnabled ? 'is-on' : ''}`}
                  onClick={() => void handleBluetoothPowerToggle()}
                  disabled={isBluetoothLoading}
                  aria-label="Toggle Bluetooth"
                >
                  <span className="bluetooth-toggle-thumb" />
                </button>
              </div>

              {!isBluetoothSupported ? (
                <div className="bluetooth-error-banner">
                  <span>Bluetooth service unavailable</span>
                </div>
              ) : null}

              {bluetoothError ? (
                <div className="bluetooth-error-banner">
                  <span>{bluetoothError}</span>
                </div>
              ) : null}

              {isBluetoothEnabled && bluetoothConnectedDevice ? (
                <div className="bluetooth-connected-card">
                  <div>
                    <div className="bluetooth-connected-title">Connected to: {bluetoothConnectedDevice.name}</div>
                    <div className="bluetooth-connected-subtitle">
                      {bluetoothConnectedDevice.type} • {bluetoothConnectedDevice.signal} signal
                    </div>
                  </div>
                  <button
                    type="button"
                    className="bluetooth-network-action disconnect"
                    onClick={() => void handleBluetoothDisconnect(bluetoothConnectedDevice.id)}
                    disabled={bluetoothBusyDeviceId === bluetoothConnectedDevice.id}
                  >
                    {bluetoothBusyDeviceId === bluetoothConnectedDevice.id ? <LoaderCircle size={13} className="wifi-action-spinner" /> : null}
                    <span>{bluetoothBusyDeviceId === bluetoothConnectedDevice.id ? 'Working...' : 'Disconnect'}</span>
                  </button>
                </div>
              ) : null}

              <div className="bluetooth-device-list">
                {!isBluetoothEnabled ? (
                  <div className="bluetooth-empty-state">
                    <span>Bluetooth is turned off</span>
                  </div>
                ) : null}

                {isBluetoothEnabled && isBluetoothLoading && !bluetoothDevices.length ? (
                  <div className="bluetooth-empty-state">
                    <LoaderCircle size={16} className="wifi-action-spinner" />
                    <span>Scanning nearby devices...</span>
                  </div>
                ) : null}

                {isBluetoothEnabled && !isBluetoothLoading && !bluetoothDevices.length ? (
                  <div className="bluetooth-empty-state">
                    <span>No Bluetooth devices found</span>
                  </div>
                ) : null}

                {isBluetoothEnabled ? bluetoothDevices.map((device) => {
                  const isConnected = device.status === 'connected';
                  const isBusy = bluetoothBusyDeviceId === device.id;

                  return (
                    <div key={device.id} className={`bluetooth-device-row ${isConnected ? 'is-connected' : ''}`}>
                      <div className="bluetooth-device-copy">
                        <div className="bluetooth-device-topline">
                          <span className="bluetooth-device-name">{device.name}</span>
                          {isConnected ? (
                            <span className="wifi-connected-badge">
                              <Check size={11} />
                              Connected
                            </span>
                          ) : null}
                        </div>
                        <div className="bluetooth-device-bottomline">
                          <span>{device.type}</span>
                          <span>{device.signal} signal</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        className={`bluetooth-network-action ${isConnected ? 'disconnect' : 'connect'}`}
                        onClick={() => (isConnected ? void handleBluetoothDisconnect(device.id) : void handleBluetoothConnect(device))}
                        disabled={isBusy}
                      >
                        {isBusy ? <LoaderCircle size={13} className="wifi-action-spinner" /> : null}
                        <span>{isBusy ? 'Working...' : isConnected ? 'Disconnect' : 'Connect'}</span>
                      </button>
                    </div>
                  );
                }) : null}
              </div>
            </div>
          ) : null}
        </div>
        <div
          ref={batteryPopupRef}
          className={`battery-widget battery-${batteryTone} ${batteryInfo.charging ? 'is-charging' : ''} ${isBatteryPopupOpen ? 'is-open' : ''}`}
          style={{ '--battery-level': `${batteryPercent}%`, '--battery-fill': batteryFillColor }}
          onClick={() => setIsBatteryPopupOpen((open) => !open)}
        >
          <div className="battery-shell">
            <div className="battery-cap" />
            <div className="battery-core">
              <div className="battery-fill">
                <div className="battery-wave battery-wave-a" />
                <div className="battery-wave battery-wave-b" />
              </div>
              {batteryInfo.charging && (
                <div className="battery-bolt">
                  <Zap size={11} fill="currentColor" strokeWidth={2.5} />
                </div>
              )}
            </div>
          </div>
          <span className="battery-percent">{batteryPercent}%</span>

          <div className="battery-popup popup-aurora-surface" onClick={(event) => event.stopPropagation()}>
            <div className="battery-popup-header">
              <div>
                <div className="battery-popup-title">Battery Status</div>
                <div className="battery-popup-subtitle">
                  {batteryInfo.charging ? 'Charging with adaptive boost' : `${batteryTone[0].toUpperCase()}${batteryTone.slice(1)} reserve`}
                </div>
              </div>
              <div className={`battery-popup-pill ${batteryTone}`}>
                {batteryInfo.charging ? 'Charging' : `${batteryPercent}%`}
              </div>
            </div>

            <div className="battery-popup-grid">
              <div className="battery-stat">
                <HeartPulse size={14} />
                <div>
                  <span>Battery health</span>
                  <strong>{batteryInfo.health}%</strong>
                </div>
              </div>
              <div className="battery-stat">
                <Gauge size={14} />
                <div>
                  <span>Voltage</span>
                  <strong>{batteryInfo.voltage.toFixed(1)} V</strong>
                </div>
              </div>
              <div className="battery-stat">
                <Zap size={14} />
                <div>
                  <span>Charging speed</span>
                  <strong>{batteryInfo.charging ? `${batteryInfo.chargingSpeed} W` : 'Idle'}</strong>
                </div>
              </div>
              <div className="battery-stat">
                <Clock3 size={14} />
                <div>
                  <span>Time remaining</span>
                  <strong>{batteryInfo.charging ? formatDuration(batteryInfo.chargingTime) : formatDuration(batteryInfo.dischargingTime)}</strong>
                </div>
              </div>
              <div className="battery-stat">
                <Leaf size={14} />
                <div>
                  <span>Power saver</span>
                  <strong>{batteryInfo.saverMode ? 'Enabled' : 'Off'}</strong>
                </div>
              </div>
              <div className="battery-stat">
                <Thermometer size={14} />
                <div>
                  <span>Temperature</span>
                  <strong>{batteryInfo.temperature}&deg;C</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Date and Time with Popup */}
      <div style={{ position: 'relative' }} ref={timePopupRef}>
        <div 
          className="flex-center menu-item" 
          onClick={() => setIsTimePopupOpen(!isTimePopupOpen)}
          style={{ 
            cursor: 'pointer', 
            background: isTimePopupOpen ? 'var(--hover-bg)' : 'transparent'
          }}
        >
          <span>{formatTime(time)}</span>
        </div>

        {/* Time Popup Dropdown */}
        <div className="popup-aurora-surface" style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '10px',
          background: 'var(--menu-bg)',
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)',
          borderRadius: '12px',
          border: '1px solid var(--menu-border)',
          padding: '16px 24px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
          minWidth: '220px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
          opacity: isTimePopupOpen ? 1 : 0,
          visibility: isTimePopupOpen ? 'visible' : 'hidden',
          transform: isTimePopupOpen ? 'translateY(0) scale(1)' : 'translateY(-10px) scale(0.95)',
          transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          pointerEvents: isTimePopupOpen ? 'auto' : 'none',
          zIndex: 100
        }}>
          <div style={{ fontSize: '26px', fontWeight: '300', letterSpacing: '1px', textShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
            {formatFullTime(time)}
          </div>
          <div style={{ fontSize: '13px', opacity: 0.8, fontWeight: '500' }}>
            {formatFullDate(time)}
          </div>
        </div>
      </div>

      {/* User Profile & Notifications */}
      <div className="flex-center" style={{ gap: '8px', position: 'relative' }} ref={usStatusPopupRef}>
        <div ref={notificationsPopupRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className={`flex-center icon-item notifications-button ${isNotificationsOpen ? 'open' : ''}`}
            onClick={handleNotificationsToggle}
            aria-label="Open notifications"
            style={{ background: isNotificationsOpen ? 'var(--hover-bg)' : 'transparent' }}
          >
            <Bell size={14} />
            {unreadNotificationsCount > 0 ? (
              <span className="notifications-badge">
                {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
              </span>
            ) : null}
          </button>

          {isNotificationsOpen ? (
            <div className="notifications-popup popup-aurora-surface" onClick={(event) => event.stopPropagation()}>
              <div className="notifications-popup-header">
                <div>
                  <div className="notifications-popup-title">Notifications</div>
                  <div className="notifications-popup-subtitle">
                    {unreadNotificationsCount > 0
                      ? `${unreadNotificationsCount} unread notification${unreadNotificationsCount === 1 ? '' : 's'}`
                      : 'All caught up'}
                  </div>
                </div>
                <button
                  type="button"
                  className="notifications-popup-close"
                  onClick={() => setIsNotificationsOpen(false)}
                  aria-label="Close notifications"
                >
                  <X size={12} />
                </button>
              </div>

              <div className="notifications-popup-actions">
                <button type="button" className="notifications-popup-action" onClick={() => void handleMarkAllNotificationsRead()}>
                  Mark all as read
                </button>
                <button type="button" className="notifications-popup-action danger" onClick={() => void handleClearNotifications()}>
                  Clear all
                </button>
              </div>

              {isNotificationsLoading ? (
                <div className="notifications-loading-state">
                  <LoaderCircle size={16} className="wifi-action-spinner" />
                  <span>Loading notifications...</span>
                </div>
              ) : null}

              {!isNotificationsLoading && notificationsError ? (
                <div className="notifications-unavailable-state">
                  <span>{notificationsError || 'Notifications unavailable'}</span>
                </div>
              ) : null}

              {!isNotificationsLoading && !notificationsError ? (
                <div className="notifications-list">
                  {notifications.length ? notifications.map((notification) => {
                    const NotificationIcon = getNotificationTypeIcon(notification.type);
                    return (
                      <button
                        key={notification.id}
                        type="button"
                        className={`notifications-item ${notification.read ? 'is-read' : 'is-unread'}`}
                        onClick={() => void handleMarkNotificationRead(notification.id)}
                      >
                        <div className={`notifications-item-icon ${notification.read ? 'is-read' : 'is-unread'}`}>
                          <NotificationIcon size={14} />
                        </div>
                        <div className="notifications-item-copy">
                          <div className="notifications-item-topline">
                            <strong>{notification.title}</strong>
                            <span>{formatNotificationTime(notification.time)}</span>
                          </div>
                          <div className="notifications-item-message">{notification.message}</div>
                        </div>
                        <span className={`notifications-item-dot ${notification.read ? 'is-read' : 'is-unread'}`} />
                      </button>
                    );
                  }) : (
                    <div className="notifications-empty-state">
                      <span>No notifications yet</span>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className={`user-status-button ${isUserLoginOpen || isUsStatusPopupOpen || isCompanyDashboardOpen ? 'open' : ''}`}
          onClick={() => {
            if (isCompanyDashboardOpen) {
              setIsCompanyDashboardOpen(false);
            } else if (isUsStatusPopupOpen) {
              setIsUsStatusPopupOpen(false);
              setIsUsSideSettingsOpen(false);
              setUsSideSettingsSection('profile');
              setUsStatusActiveSection('none');
            } else if (appAuthSession?.token && appAuthSession?.user?.role === 'company') {
              openCompanyDashboard();
            } else if (appAuthSession?.token && appAuthSession?.user) {
              setIsRegisterOpen(false);
              setIsUserLoginOpen(false);
              setIsUsSideSettingsOpen(false);
              setUsSideSettingsSection('profile');
              setUsStatusActiveSection('none');
              setIsUsStatusPopupOpen(true);
            } else {
              setIsRegisterOpen(false);
              setIsCompanyDashboardOpen(false);
              setIsUserLoginOpen(true);
            }
          }}
        >
          US
        </button>

        {/* Small Control Popup after Login */}
        {isUsStatusPopupOpen && (
          <div className="us-status-popup popup-aurora-surface" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className={`us-status-settings-icon ${isUsSideSettingsOpen ? 'open' : ''}`}
              onClick={() => {
                console.log('Setting clicked');
                if (!isUsSideSettingsOpen) {
                  setUsSideSettingsSection('profile');
                }
                setIsUsSideSettingsOpen((open) => !open);
              }}
              aria-label="Open settings"
            >
              <Settings size={13} />
            </button>

            <button
              type="button"
              className="us-status-close-btn"
              onClick={() => {
                setIsUsStatusPopupOpen(false);
                setIsUsSideSettingsOpen(false);
                setUsSideSettingsSection('profile');
              }}
              aria-label="Close status panel"
            >
              <X size={13} />
            </button>

            <div className="us-status-content">
              {usStatusActiveSection === 'study' ? (
                <div className="us-status-panel study-panel">
                  <h3>Study Tracker</h3>
                  <div className="study-timer-display">
                    {Math.floor(studySecondsLeft / 60)}:{(studySecondsLeft % 60).toString().padStart(2, '0')}
                  </div>
                  <div className="study-controls">
                    <button
                      className={`study-btn ${isStudyTimerRunning ? 'running' : ''}`}
                      onClick={() => setIsStudyTimerRunning(!isStudyTimerRunning)}
                    >
                      {isStudyTimerRunning ? 'Pause' : 'Start'}
                    </button>
                    <button
                      className="study-btn reset"
                      onClick={() => {
                        setIsStudyTimerRunning(false);
                        setStudySecondsLeft(25 * 60);
                      }}
                    >
                      Reset
                    </button>
                  </div>
                  <div className="study-progress-container">
                    <div className="study-progress-bar" style={{ width: `${(1 - studySecondsLeft / (25 * 60)) * 100}%` }} />
                  </div>
                  <p className="study-note">Focus on your task</p>
                </div>
              ) : usStatusActiveSection === 'setting' ? (
                <div className="us-status-panel setting-panel">
                  <h3>System Settings</h3>
                  <div className="setting-row">
                    <span>Do Not Disturb</span>
                    <label className="switch-toggle">
                      <input type="checkbox" />
                      <span className="slider" />
                    </label>
                  </div>
                  <div className="setting-row">
                    <span>Notifications</span>
                    <label className="switch-toggle">
                      <input type="checkbox" defaultChecked />
                      <span className="slider" />
                    </label>
                  </div>
                  <div className="setting-row volume-section-row">
                    <div className="volume-header-row">
                      <div className="volume-label-container">
                        <button
                          type="button"
                          className="volume-icon-btn"
                          onClick={() => {
                            if (isUsMuted) {
                              setIsUsMuted(false);
                              setUsVolume(prevUsVolume);
                            } else {
                              setPrevUsVolume(usVolume);
                              setIsUsMuted(true);
                              setUsVolume(0);
                            }
                          }}
                          title={isUsMuted ? "Unmute" : "Mute"}
                        >
                          {isUsMuted || usVolume === 0 ? (
                            <VolumeX size={15} />
                          ) : usVolume < 34 ? (
                            <Volume size={15} />
                          ) : usVolume < 67 ? (
                            <Volume1 size={15} />
                          ) : (
                            <Volume2 size={15} />
                          )}
                        </button>
                        <span>Volume</span>
                      </div>
                      <span className="volume-percent-text">
                        {isUsMuted ? '0%' : `${usVolume}%`}
                      </span>
                    </div>

                    <div className="volume-controls-wrapper">
                      <button
                        type="button"
                        className="volume-step-btn"
                        onClick={() => {
                          setIsUsMuted(false);
                          setUsVolume((prev) => Math.max(0, prev - 5));
                        }}
                        title="Decrease volume"
                      >
                        -
                      </button>

                      <div className="volume-slider-container">
                        <input
                          type="range"
                          className="setting-slider volume-slider"
                          min="0"
                          max="100"
                          value={isUsMuted ? 0 : usVolume}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setUsVolume(val);
                            if (val > 0) {
                              setIsUsMuted(false);
                            }
                          }}
                        />
                      </div>

                      <button
                        type="button"
                        className="volume-step-btn"
                        onClick={() => {
                          setIsUsMuted(false);
                          setUsVolume((prev) => Math.min(100, prev + 5));
                        }}
                        title="Increase volume"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="us-status-panel welcome-panel">
                  <div className="welcome-brand-row">
                    <BrandLogo className="welcome-brand-logo" surface="dark" />
                    <div className="welcome-avatar">US</div>
                  </div>
                  <h3>{appAuthSession?.user?.role === 'company' ? 'Company Dashboard' : 'US Dashboard'}</h3>
                  <p className="welcome-subtext">
                    {appAuthSession?.user?.role === 'company'
                      ? `${appAuthSession?.user?.companyName || 'Company'} access active${appAuthSession?.user?.companyId ? ` for ${appAuthSession.user.companyId}` : ''}`
                      : appAuthSession?.user?.email
                      ? `Signed in as ${appAuthSession.user.email}`
                      : 'Sign in to secure local controls and private actions'}
                  </p>
                  <div className="welcome-info-pill">Status: Online</div>
                  {appAuthSession ? (
                    <button
                      type="button"
                      className="us-status-btn welcome-logout-button"
                      onClick={() => void handleUserLogout()}
                    >
                      Logout
                    </button>
                  ) : null}
                </div>
              )}
            </div>

            <div className="us-status-btn-group">
              <button
                className={`us-status-btn ${usStatusActiveSection === 'study' ? 'active' : ''}`}
                onClick={() => setUsStatusActiveSection(usStatusActiveSection === 'study' ? 'none' : 'study')}
              >
                Study
              </button>
              <button
                className="us-status-btn us-option"
                onClick={() => {
                  if (appAuthSession?.token && appAuthSession?.user) {
                    setUsStatusActiveSection('none');
                    setIsUsSideSettingsOpen(false);
                    setUsSideSettingsSection('profile');
                  } else {
                    setIsUsStatusPopupOpen(false);
                    setIsUserLoginOpen(true);
                  }
                }}
              >
                {appAuthSession ? 'Profile' : 'Login'}
              </button>
            </div>

            {isUsSideSettingsOpen && (
              <div
                ref={usSideSettingsRef}
                className="us-side-settings-panel popup-aurora-surface"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="us-side-settings-header">
                  <div className="us-side-settings-title">
                    <Settings size={13} />
                    <span>Settings</span>
                  </div>
                  <button
                    type="button"
                    className="us-side-settings-close"
                    onClick={() => {
                      setIsUsSideSettingsOpen(false);
                      setUsSideSettingsSection('profile');
                    }}
                    aria-label="Close side settings"
                  >
                    <X size={12} />
                  </button>
                </div>

                <div className="us-side-settings-actions">
                  <button
                    type="button"
                    className={`us-side-settings-action ${usSideSettingsSection === 'profile' ? 'active' : ''}`}
                    onClick={() => setUsSideSettingsSection('profile')}
                  >
                    Profile Details
                  </button>
                  <button
                    type="button"
                    className={`us-side-settings-action ${usSideSettingsSection === 'security' ? 'active' : ''}`}
                    onClick={() => {
                      setUsSideSettingsSection('security');
                      void loadSecurityStatus();
                    }}
                  >
                    Security Check
                  </button>
                  {appAuthSession?.user?.role !== 'company' ? (
                    <button
                      type="button"
                      className="us-side-settings-action is-danger"
                      onClick={() => {
                        setDeleteAccountError('');
                        setDeleteAccountStatus('');
                        setDeleteAccountPassword('');
                        setIsDeleteAccountOpen(true);
                      }}
                    >
                      Delete Account
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="us-side-settings-action"
                    onClick={() => void handleUserLogout()}
                  >
                    Logout
                  </button>
                </div>

                <div className="us-side-settings-body">
                  {usSideSettingsSection === 'profile' ? (
                    <div className="us-side-settings-profile">
                      <div className="us-side-settings-profile-pill">Profile Details</div>
                      <div className="us-side-settings-profile-list">
                        <div className="us-side-settings-profile-row">
                          <span>{appAuthSession?.user?.role === 'company' ? 'Company Email' : 'Email'}</span>
                          <strong>{appAuthSession?.user?.companyEmail || appAuthSession?.user?.email || 'Not signed in'}</strong>
                        </div>
                        <div className="us-side-settings-profile-row">
                          <span>{appAuthSession?.user?.role === 'company' ? 'Company Name' : 'Name'}</span>
                          <strong>{appAuthSession?.user?.companyName || appAuthSession?.user?.displayName || 'US User'}</strong>
                        </div>
                        <div className="us-side-settings-profile-row">
                          <span>Status</span>
                          <strong>{appAuthSession?.user?.status || 'Online'}</strong>
                        </div>
                        {appAuthSession?.user?.role === 'company' ? (
                          <>
                            <div className="us-side-settings-profile-row">
                              <span>Company ID</span>
                              <strong>{appAuthSession?.user?.companyId || 'Not available'}</strong>
                            </div>
                            <div className="us-side-settings-profile-row">
                              <span>Company Phone</span>
                              <strong>{appAuthSession?.user?.companyPhone || 'Not available'}</strong>
                            </div>
                            <div className="us-side-settings-profile-row">
                              <span>Company Website</span>
                              <strong>{appAuthSession?.user?.companyWebsite || 'Not available'}</strong>
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="us-side-settings-security">
                      <div className="us-side-settings-profile-pill">Security Check</div>
                      {isSecurityStatusLoading ? (
                        <div className="app-launcher-security-loading">Checking security status...</div>
                      ) : null}
                      {!isSecurityStatusLoading && securityStatusError ? (
                        <div className="app-launcher-security-unavailable">{securityStatusError}</div>
                      ) : null}
                      {!isSecurityStatusLoading && !securityStatusError && securityStatus ? (
                        <div className="app-launcher-security-status-list">
                          {[
                            ['File Upload Protection', securityStatus.fileUploadProtection],
                            ['Link Protection', securityStatus.linkProtection],
                            ['Login Protection', securityStatus.loginProtection],
                            ['API Key Protection', securityStatus.apiKeyProtection],
                          ].map(([label, isEnabled]) => (
                            <div key={label} className="app-launcher-security-status-item">
                              <div className="app-launcher-security-status-copy">
                                <span className={`app-launcher-security-status-dot ${isEnabled ? 'is-on' : 'is-off'}`} />
                                <span>{label}</span>
                              </div>
                              <strong className={isEnabled ? 'is-on' : 'is-off'}>{isEnabled ? 'ON' : 'OFF'}</strong>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {isCompanyDashboardOpen && (
          <div
            ref={companyDashboardRef}
            className="company-dashboard-popup us-status-popup popup-aurora-surface"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="us-status-close-btn"
              onClick={() => {
                setIsCompanyDashboardOpen(false);
                setCompanyDashboardSection('none');
              }}
              aria-label="Close company dashboard"
            >
              <X size={13} />
            </button>

            <div className="us-status-content company-dashboard-popup-content">
              <div className="us-status-panel welcome-panel company-dashboard-welcome">
                <div className="welcome-brand-row">
                  <BrandLogo className="welcome-brand-logo" surface="dark" />
                  <div className="welcome-avatar company-dashboard-avatar">CO</div>
                </div>
                <h3>{appAuthSession?.user?.companyName || 'Company Dashboard'}</h3>
                <p className="welcome-subtext">
                  {appAuthSession?.user?.companyEmail || 'Approved company access active'}
                </p>
                <div className="welcome-info-pill">
                  {appAuthSession?.user?.companyId || 'Company Access'}
                </div>

                <div className="company-dashboard-options">
                  {companyDashboardNav.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`company-dashboard-option ${companyDashboardSection === item.id ? 'active' : ''} ${item.id === 'logout' ? 'is-danger' : ''}`}
                        onClick={() => {
                          if (item.id === 'logout') {
                            void handleUserLogout();
                            return;
                          }
                          if (item.id === 'security') {
                            void loadSecurityStatus();
                          }
                          setCompanyDashboardSection((current) => (current === item.id ? 'none' : item.id));
                        }}
                      >
                        <span className="company-dashboard-option-icon">
                          <ItemIcon size={14} />
                        </span>
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {companyDashboardSection !== 'none' && (
              <div
                ref={companyDashboardNestedRef}
                className="company-dashboard-nested popup-aurora-surface"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="company-dashboard-nested-header">
                  <div className="company-dashboard-nested-title">
                    {companyDashboardNav.find((item) => item.id === companyDashboardSection)?.label || 'Company Panel'}
                  </div>
                  <div className="company-dashboard-header-actions">
                    <button type="button" className="company-dashboard-action-button" onClick={() => void loadCompanyDashboard()}>
                      Refresh
                    </button>
                    <button
                      type="button"
                      className="company-dashboard-close"
                      onClick={() => setCompanyDashboardSection('none')}
                      aria-label="Close company nested popup"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>

                <div className="company-dashboard-content company-dashboard-nested-content">
                  {renderCompanyDashboardSection()}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    {isUserLoginOpen && (
      <div className="user-login-screen popup-aurora-overlay" role="dialog" aria-modal="true">
        <div className="user-login-shell popup-aurora-surface">
          <div className="user-login-window-controls">
            <button
              type="button"
              className="user-login-window-button"
              aria-label="Restore login popup"
            >
              <Square size={13} />
            </button>
            <button
              type="button"
              className="user-login-window-button close"
              onClick={() => setIsUserLoginOpen(false)}
              aria-label="Close login popup"
            >
              <X size={14} />
            </button>
          </div>

          <div className="user-login-visual">
            <div className="user-login-visual-overlay" />
            <div className="user-login-visual-copy">
              <span className="user-login-kicker">US</span>
              <h2>Nature-inspired calm for your daily sign in.</h2>
              <p>Soft forest tones, clean spacing, and a premium split-screen login experience.</p>
              <button
                type="button"
                className="user-login-company-entry"
                onClick={() => {
                  setCompanyLoginError('');
                  setCompanyLoginStatus('');
                  setIsCompanyLoginOpen(true);
                }}
              >
                <Briefcase size={14} />
                <span>Company Login</span>
              </button>
            </div>
          </div>

          <div className="user-login-panel">
            <div className="user-login-form-wrap">
              <div className="user-login-heading">
                <h1>Welcome back</h1>
                <p>Please enter your details.</p>
              </div>

              <form
                className="user-login-form"
                onSubmit={handleUserLoginSubmit}
              >
                <label className="user-login-field">
                  <span>E-mail</span>
                  <input
                    type="email"
                    placeholder="Enter your e-mail"
                    value={loginForm.email}
                    onChange={(event) => handleLoginFieldChange('email', event.target.value)}
                    autoComplete="username"
                    maxLength={120}
                    required
                  />
                </label>

                <label className="user-login-field">
                  <span>Password</span>
                  <div className="user-password-input-wrap">
                    <input
                      type={getPasswordInputType('loginPassword')}
                      placeholder="********"
                      value={loginForm.password}
                      onChange={(event) => handleLoginFieldChange('password', event.target.value)}
                      autoComplete="current-password"
                      minLength={8}
                      maxLength={128}
                      required
                    />
                    <button
                      type="button"
                      className="user-password-toggle"
                      onClick={() => togglePasswordVisibility('loginPassword')}
                      aria-label={passwordVisibility.loginPassword ? 'Hide password' : 'Show password'}
                    >
                      {passwordVisibility.loginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </label>

                <div className="user-login-meta">
                  <label className="user-login-checkbox">
                    <input
                      type="checkbox"
                      checked={loginForm.rememberMe}
                      onChange={(event) => handleLoginFieldChange('rememberMe', event.target.checked)}
                    />
                    <span>Remember me</span>
                  </label>
                  <button type="button" className="user-login-link">
                    Forgot your password?
                  </button>
                </div>

                {loginError ? <div className="spotify-auth-error">{loginError}</div> : null}

                <button type="submit" className="user-login-submit" disabled={isLoginSubmitting}>
                  {isLoginSubmitting ? 'Logging in...' : 'Log in'}
                </button>

                <button
                  type="button"
                  className="user-login-google"
                  onClick={handleGoogleLogin}
                  disabled={isGoogleSubmitting}
                >
                  <span className="user-login-google-icon" aria-hidden="true">G</span>
                  <span>{isGoogleSubmitting ? 'Connecting Google...' : 'Continue with Google'}</span>
                </button>

                <div className="user-login-register">
                  <span>Don&apos;t have an account?</span>
                  <button
                    type="button"
                    className="user-login-link register"
                    onClick={() => {
                      setRegisterStatus('');
                      setRegisterErrors({});
                      setIsRegisterOpen(true);
                    }}
                  >
                    Register here
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {isRegisterOpen && (
          <div className="user-register-modal" onClick={() => setIsRegisterOpen(false)}>
            <div className="user-register-card popup-aurora-surface" onClick={(event) => event.stopPropagation()}>
              <div className="user-register-header">
                <div>
                  <h2>Create account</h2>
                  <p>Register securely to continue using DDO.</p>
                </div>
                <button
                  type="button"
                  className="user-login-window-button close"
                  onClick={() => setIsRegisterOpen(false)}
                  aria-label="Close registration popup"
                >
                  <X size={14} />
                </button>
              </div>

              <form className="user-register-form" onSubmit={handleRegisterSubmit}>
                <label className="user-login-field">
                  <span>Email ID</span>
                  <input
                    type="email"
                    placeholder="Enter your e-mail"
                    value={registerForm.email}
                    onChange={(event) => handleRegisterFieldChange('email', event.target.value)}
                    autoComplete="email"
                    required
                  />
                  {registerErrors.email ? <small className="user-register-error">{registerErrors.email}</small> : null}
                </label>

                <div className="user-register-grid">
                  <label className="user-login-field">
                    <span>First Name</span>
                    <input
                      type="text"
                      placeholder="First name"
                      value={registerForm.firstName}
                      onChange={(event) => handleRegisterFieldChange('firstName', event.target.value)}
                      required
                    />
                    {registerErrors.firstName ? <small className="user-register-error">{registerErrors.firstName}</small> : null}
                  </label>

                  <label className="user-login-field">
                    <span>Middle Name</span>
                    <input
                      type="text"
                      placeholder="Middle name"
                      value={registerForm.middleName}
                      onChange={(event) => handleRegisterFieldChange('middleName', event.target.value)}
                    />
                  </label>
                </div>

                <label className="user-login-field">
                  <span>Last Name</span>
                  <input
                    type="text"
                    placeholder="Last name"
                    value={registerForm.lastName}
                    onChange={(event) => handleRegisterFieldChange('lastName', event.target.value)}
                    required
                  />
                  {registerErrors.lastName ? <small className="user-register-error">{registerErrors.lastName}</small> : null}
                </label>

                <label className="user-login-field">
                  <span>More Information</span>
                  <textarea
                    className="user-register-textarea"
                    placeholder="Tell us more about yourself"
                    value={registerForm.moreInformation}
                    onChange={(event) => handleRegisterFieldChange('moreInformation', event.target.value)}
                    rows={3}
                  />
                </label>

                <label className="user-login-field">
                  <span>Phone Number</span>
                  <input
                    type="tel"
                    placeholder="Optional phone number"
                    value={registerForm.phoneNumber}
                    onChange={(event) => handleRegisterFieldChange('phoneNumber', event.target.value)}
                  />
                  {registerErrors.phoneNumber ? <small className="user-register-error">{registerErrors.phoneNumber}</small> : null}
                </label>

                <div className="user-register-grid">
                  <label className="user-login-field">
                    <span>Password</span>
                    <div className="user-password-input-wrap">
                      <input
                        type={getPasswordInputType('registerPassword')}
                        placeholder="Create password"
                        value={registerForm.password}
                        onChange={(event) => handleRegisterFieldChange('password', event.target.value)}
                        autoComplete="new-password"
                        required
                      />
                      <button
                        type="button"
                        className="user-password-toggle"
                        onClick={() => togglePasswordVisibility('registerPassword')}
                        aria-label={passwordVisibility.registerPassword ? 'Hide password' : 'Show password'}
                      >
                        {passwordVisibility.registerPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {registerErrors.password ? <small className="user-register-error">{registerErrors.password}</small> : null}
                  </label>

                  <label className="user-login-field">
                    <span>Confirm Password</span>
                    <div className="user-password-input-wrap">
                      <input
                        type={getPasswordInputType('registerConfirmPassword')}
                        placeholder="Confirm password"
                        value={registerForm.confirmPassword}
                        onChange={(event) => handleRegisterFieldChange('confirmPassword', event.target.value)}
                        autoComplete="new-password"
                        required
                      />
                      <button
                        type="button"
                        className="user-password-toggle"
                        onClick={() => togglePasswordVisibility('registerConfirmPassword')}
                        aria-label={passwordVisibility.registerConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        {passwordVisibility.registerConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {registerErrors.confirmPassword ? <small className="user-register-error">{registerErrors.confirmPassword}</small> : null}
                  </label>
                </div>

                {registerErrors.form ? <div className="spotify-auth-error">{registerErrors.form}</div> : null}
                {registerStatus ? <div className="user-register-success">{registerStatus}</div> : null}

                <div className="user-register-actions">
                  <button type="submit" className="user-login-submit" disabled={isRegisterSubmitting}>
                    {isRegisterSubmitting ? 'Creating account...' : 'Register'}
                  </button>
                  <button
                    type="button"
                    className="user-login-google"
                    onClick={handleGoogleLogin}
                    disabled={isGoogleSubmitting}
                  >
                    <span className="user-login-google-icon" aria-hidden="true">G</span>
                    <span>{isGoogleSubmitting ? 'Connecting Google...' : 'Continue with Google'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isCompanyLoginOpen && (
          <div className="user-register-modal" onClick={() => setIsCompanyLoginOpen(false)}>
            <div className="user-register-card company-login-card popup-aurora-surface" onClick={(event) => event.stopPropagation()}>
              <div className="user-register-header">
                <div>
                  <h2>Company Login</h2>
                  <p>Secure access for company and admin users only.</p>
                </div>
                <button
                  type="button"
                  className="user-login-window-button close"
                  onClick={() => setIsCompanyLoginOpen(false)}
                  aria-label="Close company login popup"
                >
                  <X size={14} />
                </button>
              </div>

              <form className="user-register-form" onSubmit={handleCompanyLoginSubmit}>
                <label className="user-login-field">
                  <span>Company ID</span>
                  <input
                    type="text"
                    placeholder="Enter company ID"
                    value={companyLoginForm.companyId}
                    onChange={(event) => handleCompanyLoginFieldChange('companyId', event.target.value)}
                    required
                  />
                </label>

                <label className="user-login-field">
                  <span>Company Key</span>
                  <input
                    type="text"
                    placeholder="Enter company key"
                    value={companyLoginForm.companyKey}
                    onChange={(event) => handleCompanyLoginFieldChange('companyKey', event.target.value)}
                    required
                  />
                </label>

                <label className="user-login-field">
                  <span>Company Password</span>
                  <div className="user-password-input-wrap">
                    <input
                      type={getPasswordInputType('companyPassword')}
                      placeholder="Enter company password"
                      value={companyLoginForm.companyPassword}
                      onChange={(event) => handleCompanyLoginFieldChange('companyPassword', event.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      className="user-password-toggle"
                      onClick={() => togglePasswordVisibility('companyPassword')}
                      aria-label={passwordVisibility.companyPassword ? 'Hide password' : 'Show password'}
                    >
                      {passwordVisibility.companyPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </label>

                {companyLoginError ? <div className="spotify-auth-error">{companyLoginError}</div> : null}
                {companyLoginStatus ? <div className="user-register-success">{companyLoginStatus}</div> : null}

                <div className="user-register-actions">
                  <button type="submit" className="user-login-submit" disabled={isCompanyLoginSubmitting}>
                    {isCompanyLoginSubmitting ? 'Signing in...' : 'Login'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    )}

    {isDeleteAccountOpen && (
      <div className="user-register-modal" role="dialog" aria-modal="true" onClick={() => setIsDeleteAccountOpen(false)}>
        <div className="delete-account-card popup-aurora-surface" onClick={(event) => event.stopPropagation()}>
          <div className="user-register-header">
            <div>
              <h2>Delete Account</h2>
              <p>Are you sure you want to delete your account?</p>
            </div>
            <button
              type="button"
              className="user-login-window-button close"
              onClick={() => setIsDeleteAccountOpen(false)}
              aria-label="Close delete account popup"
            >
              <X size={14} />
            </button>
          </div>

          <div className="delete-account-warning">
            <TriangleAlert size={16} />
            <span>This will remove your account from active company records.</span>
          </div>

          <label className="user-login-field delete-account-field">
            <span>Confirm Password</span>
            <div className="user-password-input-wrap">
              <input
                type={getPasswordInputType('deleteAccountPassword')}
                placeholder="Enter your password"
                value={deleteAccountPassword}
                onChange={(event) => {
                  setDeleteAccountPassword(event.target.value);
                  if (deleteAccountError) {
                    setDeleteAccountError('');
                  }
                }}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="user-password-toggle"
                onClick={() => togglePasswordVisibility('deleteAccountPassword')}
                aria-label={passwordVisibility.deleteAccountPassword ? 'Hide password' : 'Show password'}
              >
                {passwordVisibility.deleteAccountPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          {deleteAccountError ? <div className="spotify-auth-error">{deleteAccountError}</div> : null}
          {deleteAccountStatus ? <div className="user-register-success">{deleteAccountStatus}</div> : null}

          <div className="delete-account-actions">
            <button
              type="button"
              className="app-launcher-settings-pill"
              onClick={() => setIsDeleteAccountOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="window-confirm-button window-confirm-accept is-danger"
              onClick={() => void handleDeleteAccount()}
              disabled={isDeleteAccountSubmitting}
            >
              {isDeleteAccountSubmitting ? 'Deleting...' : 'Yes, Delete Account'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default RightTray;
