import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, Mic, Plus, Search, Sparkles, X } from 'lucide-react';

const GOOGLE_IDENTITY_SCRIPT_ID = 'google-identity-services';
const GOOGLE_ACCOUNT_STORAGE_KEY = 'google_search_account';
const GOOGLE_SEARCH_HISTORY_STORAGE_KEY = 'google_search_history';
const SEARCH_PROVIDER_STORAGE_KEY = 'search_provider_mode';

const readStoredGoogleAccount = () => {
  try {
    const raw = localStorage.getItem(GOOGLE_ACCOUNT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const readStoredSearchHistory = () => {
  try {
    const raw = localStorage.getItem(GOOGLE_SEARCH_HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const readStoredSearchProvider = () => {
  try {
    const raw = localStorage.getItem(SEARCH_PROVIDER_STORAGE_KEY);
    return raw === 'gemini' ? 'gemini' : 'google';
  } catch {
    return 'google';
  }
};

const parseJwt = (token) => {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const json = decodeURIComponent(
    atob(base64)
      .split('')
      .map((char) => `%${(`00${char.charCodeAt(0).toString(16)}`).slice(-2)}`)
      .join(''),
  );

  return JSON.parse(json);
};

const CenterSearch = ({ onPopupStateChange = () => {} }) => {
  const wrapperRef = useRef(null);
  const providerTriggerRef = useRef(null);
  const accountTriggerRef = useRef(null);
  const accountPopupRef = useRef(null);
  const answerPopupRef = useRef(null);
  const googleTokenClientRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [googleAccount, setGoogleAccount] = useState(() => readStoredGoogleAccount());
  const [googleAuthError, setGoogleAuthError] = useState('');
  const [searchHistory, setSearchHistory] = useState(() => readStoredSearchHistory());
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [accountPopupPosition, setAccountPopupPosition] = useState({ top: 0, right: 0 });
  const [isProviderMenuOpen, setIsProviderMenuOpen] = useState(false);
  const [providerMenuPosition, setProviderMenuPosition] = useState({ top: 0, left: 0 });
  const [searchProvider, setSearchProvider] = useState(() => readStoredSearchProvider());
  const [answerPanel, setAnswerPanel] = useState({
    isOpen: false,
    provider: 'gemini',
    question: '',
    answer: '',
    status: 'idle',
    error: '',
  });

  const providerMenuRef = useRef(null);

  const providerOptions = [
    { id: 'google', label: 'Google', icon: Search, placeholder: 'Search Google' },
    { id: 'gemini', label: 'Gemini', icon: Sparkles, placeholder: 'Ask Gemini' },
  ];
  const activeProvider = providerOptions.find((option) => option.id === searchProvider) || providerOptions[0];

  const googleEmail = googleAccount?.email || 'Not signed in';
  const googleAvatar = googleAccount?.picture || '';
  const googleEmailInitial = googleEmail === 'Not signed in'
    ? 'G'
    : googleEmail.slice(0, 1).toUpperCase();

  useEffect(() => {
    const handleClickOutside = (event) => {
      const clickedAccountTrigger = accountTriggerRef.current?.contains(event.target);
      const clickedAccountPopup = accountPopupRef.current?.contains(event.target);
      const clickedProviderTrigger = providerTriggerRef.current?.contains(event.target);
      const clickedProviderMenu = providerMenuRef.current?.contains(event.target);
      const clickedAnswerPopup = answerPopupRef.current?.contains(event.target);

      if (clickedAccountTrigger || clickedAccountPopup || clickedProviderTrigger || clickedProviderMenu || clickedAnswerPopup) {
        return;
      }

      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
        setIsAccountMenuOpen(false);
        setIsProviderMenuOpen(false);
        return;
      }

      setIsAccountMenuOpen(false);
      setIsProviderMenuOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    onPopupStateChange(isOpen || answerPanel.isOpen);
  }, [answerPanel.isOpen, isOpen, onPopupStateChange]);

  useEffect(() => {
    if (!isAccountMenuOpen) {
      return undefined;
    }

    const updatePopupPosition = () => {
      const triggerRect = accountTriggerRef.current?.getBoundingClientRect();
      if (!triggerRect) {
        return;
      }

      setAccountPopupPosition({
        top: triggerRect.bottom + 10,
        right: Math.max(window.innerWidth - triggerRect.right, 16),
      });
    };

    updatePopupPosition();
    window.addEventListener('resize', updatePopupPosition);
    window.addEventListener('scroll', updatePopupPosition, true);

    return () => {
      window.removeEventListener('resize', updatePopupPosition);
      window.removeEventListener('scroll', updatePopupPosition, true);
    };
  }, [isAccountMenuOpen]);

  useEffect(() => {
    if (!isProviderMenuOpen) {
      return undefined;
    }

    const updateProviderMenuPosition = () => {
      const triggerRect = providerTriggerRef.current?.getBoundingClientRect();
      if (!triggerRect) {
        return;
      }

      const providerMenuWidth = 168;

      setProviderMenuPosition({
        top: Math.max(triggerRect.top - 6, 16),
        left: Math.max(triggerRect.left - providerMenuWidth - 12, 16),
      });
    };

    updateProviderMenuPosition();
    window.addEventListener('resize', updateProviderMenuPosition);
    window.addEventListener('scroll', updateProviderMenuPosition, true);

    return () => {
      window.removeEventListener('resize', updateProviderMenuPosition);
      window.removeEventListener('scroll', updateProviderMenuPosition, true);
    };
  }, [isProviderMenuOpen]);

  useEffect(() => {
    localStorage.setItem(GOOGLE_SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(searchHistory));
  }, [searchHistory]);

  useEffect(() => {
    localStorage.setItem(SEARCH_PROVIDER_STORAGE_KEY, searchProvider);
  }, [searchProvider]);

  useEffect(() => {
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!googleClientId) {
      return undefined;
    }

    const initializeGoogleAuth = () => {
      if (!window.google?.accounts?.oauth2 || !window.google?.accounts?.id) {
        return;
      }

      googleTokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: 'openid email profile',
        callback: async (response) => {
          if (!response.access_token) {
            setGoogleAuthError('Google sign-in could not be completed.');
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
            const account = {
              email: profile.email,
              picture: profile.picture || '',
              name: profile.name || '',
            };

            localStorage.setItem(GOOGLE_ACCOUNT_STORAGE_KEY, JSON.stringify(account));
            setGoogleAccount(account);
            setGoogleAuthError('');
          } catch (error) {
            setGoogleAuthError(error.message || 'Unable to load Google profile.');
          }
        },
      });

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (credentialResponse) => {
          if (!credentialResponse.credential) {
            return;
          }

          try {
            const profile = parseJwt(credentialResponse.credential);
            const account = {
              email: profile.email,
              picture: profile.picture || '',
              name: profile.name || '',
            };

            localStorage.setItem(GOOGLE_ACCOUNT_STORAGE_KEY, JSON.stringify(account));
            setGoogleAccount(account);
            setGoogleAuthError('');
          } catch {
            setGoogleAuthError('Google sign-in could not be completed.');
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
  }, []);

  const handleGoogleSignIn = () => {
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!googleClientId) {
      setGoogleAuthError('Add VITE_GOOGLE_CLIENT_ID to use Google sign-in.');
      return;
    }

    if (!window.google?.accounts?.oauth2 || !googleTokenClientRef.current) {
      setGoogleAuthError('Google sign-in is still loading. Try again.');
      return;
    }

    setGoogleAuthError('');
    googleTokenClientRef.current.requestAccessToken({ prompt: 'consent' });
  };

  const handleGoogleLogout = () => {
    try {
      localStorage.removeItem(GOOGLE_ACCOUNT_STORAGE_KEY);
    } catch {
      // Ignore storage cleanup issues and still clear the in-memory account.
    }

    if (window.google?.accounts?.id?.disableAutoSelect) {
      window.google.accounts.id.disableAutoSelect();
    }

    setGoogleAccount(null);
    setGoogleAuthError('');
    setIsAccountMenuOpen(false);
  };

  const saveSearchToHistory = (value) => {
    const normalizedValue = value.trim();
    if (!normalizedValue) {
      return;
    }

    setSearchHistory((currentHistory) => [
      normalizedValue,
      ...currentHistory.filter((item) => item.toLowerCase() !== normalizedValue.toLowerCase()),
    ]);
  };

  const handleHistoryItemSelect = (historyItem) => {
    setQuery(historyItem);
  };

  const handleHistoryItemDelete = (historyItem) => {
    setSearchHistory((currentHistory) => currentHistory.filter((item) => item !== historyItem));
  };

  const handleClearHistory = () => {
    setSearchHistory([]);
  };

  const submitQuery = async () => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return;
    }

    saveSearchToHistory(trimmedQuery);
    if (searchProvider === 'gemini') {
      setAnswerPanel({
        isOpen: true,
        provider: 'gemini',
        question: trimmedQuery,
        answer: '',
        status: 'loading',
        error: '',
      });

      try {
        const response = await fetch('/api/ai/respond', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            provider: 'gemini',
            prompt: trimmedQuery,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Gemini request failed.');
        }

        setAnswerPanel({
          isOpen: true,
          provider: 'gemini',
          question: trimmedQuery,
          answer: payload.answer || '',
          status: 'done',
          error: '',
        });
      } catch (error) {
        setAnswerPanel({
          isOpen: true,
          provider: 'gemini',
          question: trimmedQuery,
          answer: '',
          status: 'error',
          error: error.message || 'Gemini request failed.',
        });
      }

      return;
    }

    window.open(`https://www.google.com/search?q=${encodeURIComponent(trimmedQuery)}`, '_blank', 'noopener,noreferrer');
  };

  const handleSearchSubmit = (event) => {
    if (event.key !== 'Enter') {
      return;
    }

    void submitQuery();
  };

  const handleProviderChange = (providerId) => {
    setSearchProvider(providerId);
    setIsProviderMenuOpen(false);
  };

  const accountPopup = googleAccount && isAccountMenuOpen
    ? createPortal(
        <div
          ref={accountPopupRef}
          className="center-search-account-popup popup-aurora-surface"
          style={{
            position: 'fixed',
            top: `${accountPopupPosition.top}px`,
            right: `${accountPopupPosition.right}px`,
          }}
        >
          <div className="center-search-account-popup-header">
            {googleAvatar ? (
              <img
                src={googleAvatar}
                alt={googleEmail}
                className="center-search-account-popup-avatar"
              />
            ) : (
              <span className="center-search-account-popup-avatar center-search-account-popup-avatar-fallback">
                {googleEmailInitial}
              </span>
            )}

            <div className="center-search-account-popup-copy">
              <strong>{googleEmail}</strong>
              <span>Google Account</span>
            </div>
          </div>

          <div className="center-search-account-popup-divider" />

          <button
            type="button"
            className="center-search-account-popup-action"
            onClick={handleGoogleLogout}
          >
            <LogOut size={13} />
            <span>Log out</span>
          </button>
        </div>,
        document.body,
      )
    : null;

  const providerMenu = isProviderMenuOpen
    ? createPortal(
        <div
          ref={providerMenuRef}
          className="center-search-provider-menu popup-aurora-surface"
          style={{
            position: 'fixed',
            top: `${providerMenuPosition.top}px`,
            left: `${providerMenuPosition.left}px`,
          }}
        >
          {providerOptions.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`center-search-provider-option ${searchProvider === id ? 'is-active' : ''}`}
              onClick={() => handleProviderChange(id)}
            >
              <Icon size={14} />
              <span>{label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )
    : null;

  const answerPanelPopup = answerPanel.isOpen
    ? createPortal(
        <div
          ref={answerPopupRef}
          className="center-search-answer-popup popup-aurora-surface"
        >
          <div className="center-search-answer-header">
            <div>
              <div className="center-search-answer-title">
                Gemini
              </div>
              <div className="center-search-answer-question">{answerPanel.question}</div>
            </div>
            <button
              type="button"
              className="center-search-answer-close"
              onClick={() => setAnswerPanel((current) => ({ ...current, isOpen: false }))}
              aria-label="Close answer popup"
            >
              <X size={14} />
            </button>
          </div>

          <div className="center-search-answer-body">
            {answerPanel.status === 'loading' ? (
              <div className="center-search-answer-loading">
                <span className="center-search-answer-loader" />
                <span>Gemini is thinking...</span>
              </div>
            ) : null}

            {answerPanel.status === 'error' ? (
              <div className="center-search-answer-error">{answerPanel.error}</div>
            ) : null}

            {answerPanel.status === 'done' ? (
              <div className="center-search-answer-text">{answerPanel.answer}</div>
            ) : null}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div ref={wrapperRef} className="center-search-shell">
      <button
        type="button"
        className={`flex-center center-search-trigger ${isOpen ? 'is-open' : ''}`}
        onClick={() => setIsOpen((open) => !open)}
        aria-label="Open search"
      >
        <Search size={14} />
      </button>

      {isOpen && (
        <div className="center-search-popup">
          <div
            className={`center-search-bar ${isOpen ? 'is-open' : ''}`}
          >
            <button
              type="button"
              ref={providerTriggerRef}
              className="center-search-plus"
              aria-label="Choose search provider"
              onClick={() => setIsProviderMenuOpen((open) => !open)}
            >
              <Plus size={22} strokeWidth={1.9} />
            </button>

            <div className="center-search-input-wrap">
              <input
                type="text"
                placeholder={activeProvider.placeholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setIsOpen(true)}
                onKeyDown={handleSearchSubmit}
                className="center-search-input"
              />
            </div>

            <div className="center-search-actions">
              <button type="button" className="center-search-mic" aria-label="Voice input">
                <Mic size={24} strokeWidth={1.9} />
              </button>

              <button type="button" className="center-search-voice-orb" aria-label="Submit search" onClick={() => void submitQuery()}>
                <span />
                <span />
                <span />
              </button>
            </div>
          </div>

          <div className="center-search-dropdown popup-aurora-surface">
            <div className="center-search-account-row">
              <div className="center-search-brand">
                {searchProvider === 'google' ? (
                  <img
                    src="https://www.gstatic.com/images/branding/searchlogo/ico/favicon.ico"
                    alt="Google"
                    className="center-search-google-icon"
                  />
                ) : searchProvider === 'gemini' ? (
                  <Sparkles size={18} className="center-search-google-icon center-search-mode-icon" />
                ) : (
                  <img
                    src="https://www.gstatic.com/images/branding/searchlogo/ico/favicon.ico"
                    alt="Google"
                    className="center-search-google-icon"
                  />
                )}
              </div>

              <div className="center-search-account">
                {googleAccount ? (
                  <div className="center-search-account-menu-shell">
                    <button
                      type="button"
                      ref={accountTriggerRef}
                      className={`center-search-account-trigger ${isAccountMenuOpen ? 'is-open' : ''}`}
                      onClick={() => setIsAccountMenuOpen((open) => !open)}
                      aria-label="Open Google account menu"
                    >
                      <span className="center-search-email">{googleEmail}</span>
                      {googleAvatar ? (
                        <img src={googleAvatar} alt={googleEmail} className="center-search-avatar-image" />
                      ) : (
                        <span className="center-search-avatar">{googleEmailInitial}</span>
                      )}
                    </button>

                  </div>
                ) : (
                  <button
                    type="button"
                    className="center-search-signin"
                    onClick={handleGoogleSignIn}
                  >
                    Sign in with Google
                  </button>
                )}
              </div>
            </div>

            <div className="center-search-dropdown-header">
              <div className="center-search-dropdown-label">Recent Searches</div>
              {searchHistory.length ? (
                <button
                  type="button"
                  className="center-search-clear-history"
                  onClick={handleClearHistory}
                >
                  Clear History
                </button>
              ) : null}
            </div>

            {googleAuthError ? (
               <div className="center-search-auth-error">{googleAuthError}</div>
            ) : null}

            {searchHistory.length ? (
              <div className="center-search-history-list">
                {searchHistory.map((historyItem) => (
                  <div key={historyItem} className="center-search-history-row">
                    <button
                      type="button"
                      className="center-search-history-fill"
                      onClick={() => handleHistoryItemSelect(historyItem)}
                    >
                      <Search size={13} />
                      <span>{historyItem}</span>
                    </button>

                    <button
                      type="button"
                      className="center-search-history-delete"
                      onClick={() => handleHistoryItemDelete(historyItem)}
                      aria-label={`Delete ${historyItem}`}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="center-search-history-empty">
                Your recent Google searches will appear here.
              </div>
            )}
          </div>
        </div>
      )}
      {accountPopup}
      {providerMenu}
      {answerPanelPopup}
    </div>
  );
};

export default CenterSearch;
