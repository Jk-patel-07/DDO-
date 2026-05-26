import { useState, useEffect, useRef } from 'react';
import { Wifi, Bluetooth, Bell, X, User, Phone, Mail, Users, Briefcase, Plus, ChevronDown, Smartphone, MoreVertical, Zap, HeartPulse, Gauge, Clock3, Leaf, Thermometer, Square, Lock, Check, LoaderCircle, RefreshCw, LayoutGrid, Search as SearchIcon, Settings } from 'lucide-react';
import { FaWhatsapp, FaSpotify } from 'react-icons/fa';
import CenterSearch from './CenterSearch';

const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_PROFILE_URL = 'https://api.spotify.com/v1/me';
const SPOTIFY_SCOPES = 'user-read-private user-read-email';
const APP_BOX_SELECTED_APPS_STORAGE_KEY = 'app_box_selected_apps';
const APP_BOX_SETTINGS_STORAGE_KEY = 'app_box_settings';
const APP_BOX_PRIVACY_STORAGE_KEY = 'app_box_privacy_settings';
const SPOTIFY_STORAGE_KEYS = {
  codeVerifier: 'spotify_code_verifier',
  state: 'spotify_auth_state',
  accessToken: 'spotify_access_token',
  refreshToken: 'spotify_refresh_token',
  expiresAt: 'spotify_expires_at',
  user: 'spotify_user_profile',
};

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
const isLoopbackSpotifyOrigin = () => {
  const { hostname, protocol } = window.location;
  return protocol === 'http:' && (hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1');
};
const isSecureSpotifyOrigin = () => window.location.protocol === 'https:' || isLoopbackSpotifyOrigin();
const SPOTIFY_LOOPBACK_REDIRECT_URI = 'http://127.0.0.1:5173/callback';
const getSpotifyRedirectUri = () => import.meta.env.VITE_SPOTIFY_REDIRECT_URI || SPOTIFY_LOOPBACK_REDIRECT_URI;

const clearSpotifySession = () => {
  Object.values(SPOTIFY_STORAGE_KEYS).forEach((key) => sessionStorage.removeItem(key));
};

const RightTray = ({ onPopupStateChange = () => {} }) => {
  const [time, setTime] = useState(new Date());
  
  // Time Popup States
  const [isTimePopupOpen, setIsTimePopupOpen] = useState(false);
  const timePopupRef = useRef(null);
  const [isBatteryPopupOpen, setIsBatteryPopupOpen] = useState(false);
  const batteryPopupRef = useRef(null);
  const wifiPopupRef = useRef(null);
  const loadWifiNetworksRef = useRef(async () => {});
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
  const spotifyPopupRef = useRef(null);
  const [showSpotifyPopup, setShowSpotifyPopup] = useState(false);
  const [spotifyUser, setSpotifyUser] = useState(() => readStoredSpotifyUser());
  const [spotifyAuthStatus, setSpotifyAuthStatus] = useState(() => (readStoredSpotifyUser() ? 'connected' : 'idle'));
  const [spotifyAuthError, setSpotifyAuthError] = useState('');
  const [isUserLoginOpen, setIsUserLoginOpen] = useState(false);
  const [isUsStatusPopupOpen, setIsUsStatusPopupOpen] = useState(false);
  const [usStatusActiveSection, setUsStatusActiveSection] = useState('none');
  const usStatusPopupRef = useRef(null);
  const [studySecondsLeft, setStudySecondsLeft] = useState(25 * 60);
  const [isStudyTimerRunning, setIsStudyTimerRunning] = useState(false);
  const [isSearchPopupOpen, setIsSearchPopupOpen] = useState(false);
  const appLauncherRef = useRef(null);
  const [isAppLauncherOpen, setIsAppLauncherOpen] = useState(false);
  const [isAppPickerOpen, setIsAppPickerOpen] = useState(false);
  const [isAppSettingsOpen, setIsAppSettingsOpen] = useState(false);
  const [isAppPrivacyOpen, setIsAppPrivacyOpen] = useState(false);
  const [isResetAppsConfirmOpen, setIsResetAppsConfirmOpen] = useState(false);
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

  const applyWifiSnapshot = (snapshot) => {
    setWifiNetworks(Array.isArray(snapshot.networks) ? snapshot.networks : []);
    setWifiInterfaceName(snapshot.interfaceName || 'Wi-Fi');
    setIsWifiOnline(Boolean(snapshot.online));
  };

  const requestWifi = async (endpoint, options = {}) => {
    const response = await fetch(endpoint, {
      headers: {
        'Content-Type': 'application/json',
      },
      ...options,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Wi-Fi service is unavailable.');
    }

    return payload;
  };

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

  loadWifiNetworksRef.current = loadWifiNetworks;

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
    const handleSpotifyClickOutside = (event) => {
      if (spotifyPopupRef.current && !spotifyPopupRef.current.contains(event.target)) {
        closeSpotifyPopups();
      }
    };

    document.addEventListener('mousedown', handleSpotifyClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleSpotifyClickOutside);
    };
  }, []);

  useEffect(() => {
    const handleAppLauncherClickOutside = (event) => {
      if (appLauncherRef.current && !appLauncherRef.current.contains(event.target)) {
        setIsAppLauncherOpen(false);
      }
    };

    document.addEventListener('mousedown', handleAppLauncherClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleAppLauncherClickOutside);
    };
  }, []);

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
      if (usStatusPopupRef.current && !usStatusPopupRef.current.contains(event.target)) {
        setIsUsStatusPopupOpen(false);
      }
    };
    document.addEventListener('mousedown', handleUsStatusClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleUsStatusClickOutside);
    };
  }, []);

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
      || isAppLauncherOpen
      || showSpotifyPopup
      || isUserLoginOpen
      || isUsStatusPopupOpen,
    );

    onPopupStateChange(hasAnyPopupOpen);
  }, [
    activeMenuContact,
    detailsContact,
    isAddContactOpen,
    isBatteryPopupOpen,
    isContactSelectOpen,
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

  const isAnySpotifyPopupOpen = showSpotifyPopup;
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

  function closeSpotifyPopups() {
    setShowSpotifyPopup(false);
  }

  function toggleSpotifyPopup() {
    setShowSpotifyPopup((open) => !open);
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

  const connectWifiNetwork = async (network, password = '') => {
    setWifiBusyNetworkId(network.id);
    setWifiError('');

    try {
      const endpoint = '/api/wifi/connect';
      const payload = await requestWifi(endpoint, {
        method: 'POST',
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
      setSpotifyAuthError('Open Spotify from an HTTPS URL or the 127.0.0.1 loopback URL, then try Log in again.');
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
    clearSpotifySession();
    setSpotifyUser(null);
    setSpotifyAuthStatus('idle');
    setSpotifyAuthError('');
  };

  const loadInstalledApps = async (showLoader = true) => {
    try {
      if (showLoader) {
        setIsAppsLoading(true);
      }
      setAppsError('');

      const response = await fetch('/api/system/apps');
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to load installed apps right now.');
      }

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
        setIsResetAppsConfirmOpen(false);
        setAppPickerQuery('');
      }
      return nextOpen;
    });
  };

  const openAddAppsPanel = () => {
    setIsAppSettingsOpen(false);
    setIsAppPrivacyOpen(false);
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

  const openSelectedApp = async (app) => {
    try {
      const response = await fetch('/api/system/apps/open', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ shortcutPath: app.shortcutPath, appPath: app.appPath }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'App not found or path is invalid.');
      }
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
          const response = await fetch('/api/system/apps/icon', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ shortcutPath: app.shortcutPath }),
          });

          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload.error || 'Unable to load app icon.');
          }

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

  return (
    <>
    <div className="flex-center" style={{ gap: '16px' }}>
      {/* Social Icons */}
      <div className="flex-center" style={{ gap: '6px' }}>
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

          {showSpotifyPopup && (
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
                    ? 'Your Spotify account is connected to this website.'
                    : 'Connect with Spotify using the official OAuth flow.'}
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
                    ? 'Disconnect'
                    : 'Log in'}
              </button>
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
                <div className="app-launcher-dock-title">Apps</div>
                <div className="app-launcher-dock-actions">
                  <button
                    type="button"
                    className="app-launcher-settings-trigger"
                    onClick={(event) => {
                      event.stopPropagation();
                      setIsAppPickerOpen(false);
                      setIsResetAppsConfirmOpen(false);
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
                <div className="app-launcher-settings-popup popup-aurora-surface" onClick={(event) => event.stopPropagation()}>
                  <div className="app-launcher-settings-header">
                    <div className="app-launcher-nested-title">Settings</div>
                    <button
                      type="button"
                      className="app-launcher-picker-close"
                      onClick={() => {
                        setIsAppSettingsOpen(false);
                        setIsAppPrivacyOpen(false);
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
                        setIsAppPrivacyOpen((open) => !open);
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

                  {isAppPrivacyOpen && (
                    <div className="app-launcher-privacy-popup popup-aurora-surface">
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
                          </div>

                          <div className="app-launcher-privacy-saved">
                            <div className="app-launcher-privacy-saved-copy">
                              <span>Manage Saved Files</span>
                              <strong>{selectedApps.length} saved apps</strong>
                            </div>
                            <button
                              type="button"
                              className="app-launcher-settings-pill"
                              onClick={openAddAppsPanel}
                            >
                              Manage
                            </button>
                          </div>

                          <div className="app-launcher-privacy-pin">
                            <label className="app-launcher-settings-label" htmlFor="app-private-pin">
                              Lock app with password/PIN
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
                    </div>
                  )}
                </div>
              )}

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
        <div className="flex-center icon-item"><Bluetooth size={14} /></div>
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
        <div className="flex-center icon-item"><Bell size={14} /></div>
        <button
          type="button"
          className={`user-status-button ${isUserLoginOpen || isUsStatusPopupOpen ? 'open' : ''}`}
          onClick={() => {
            if (isUsStatusPopupOpen) {
              setIsUsStatusPopupOpen(false);
            } else {
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
              className="us-status-close-btn"
              onClick={() => setIsUsStatusPopupOpen(false)}
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
                  <div className="setting-row">
                    <span>Volume</span>
                    <input type="range" className="setting-slider" defaultValue="65" />
                  </div>
                </div>
              ) : (
                <div className="us-status-panel welcome-panel">
                  <div className="welcome-avatar">US</div>
                  <h3>US Dashboard</h3>
                  <p className="welcome-subtext">You are signed in to DDO</p>
                  <div className="welcome-info-pill">Status: Online</div>
                </div>
              )}
            </div>

            <div className="us-status-btn-group">
              <button
                className={`us-status-btn ${usStatusActiveSection === 'setting' ? 'active' : ''}`}
                onClick={() => setUsStatusActiveSection(usStatusActiveSection === 'setting' ? 'none' : 'setting')}
              >
                Setting
              </button>
              <button
                className={`us-status-btn ${usStatusActiveSection === 'study' ? 'active' : ''}`}
                onClick={() => setUsStatusActiveSection(usStatusActiveSection === 'study' ? 'none' : 'study')}
              >
                Study
              </button>
              <button
                className="us-status-btn us-option"
                onClick={() => {
                  setIsUsStatusPopupOpen(false);
                  setIsUserLoginOpen(true);
                }}
              >
                US
              </button>
            </div>
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
                onSubmit={(event) => {
                  event.preventDefault();
                  setIsUserLoginOpen(false);
                  setIsUsStatusPopupOpen(true);
                }}
              >
                <label className="user-login-field">
                  <span>E-mail</span>
                  <input type="email" placeholder="Enter your e-mail" />
                </label>

                <label className="user-login-field">
                  <span>Password</span>
                  <input type="password" placeholder="********" />
                </label>

                <div className="user-login-meta">
                  <label className="user-login-checkbox">
                    <input type="checkbox" />
                    <span>Remember me</span>
                  </label>
                  <button type="button" className="user-login-link">
                    Forgot your password?
                  </button>
                </div>

                <button type="submit" className="user-login-submit">
                  Log in
                </button>

                <div className="user-login-register">
                  <span>Don&apos;t have an account?</span>
                  <button type="button" className="user-login-link register">
                    Register here
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default RightTray;
