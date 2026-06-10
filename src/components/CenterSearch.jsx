import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  Bot, LogOut, Mic, Plus, Search, Sparkles, X, Minus, Maximize2, Minimize2, RotateCw,
  Copy, Check, ThumbsUp, ThumbsDown, FolderPlus, MoreHorizontal, BookOpen, GitBranch, Volume2, VolumeX,
  Image, Video, FileText, Camera, Link, Edit2, Layers
} from 'lucide-react';
import { createAuthHeaders } from '../utils/appAuth';
import { buildApiUrl } from '../utils/api';
import { useDraggablePopup } from '../utils/useDraggablePopup';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

const openSourceUrl = (url) => {
  if (!url) return;
  if (window.__TAURI__?.shell?.open) {
    try {
      window.__TAURI__.shell.open(url);
      return;
    } catch (e) {
      console.error("Tauri shell open failed", e);
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
};

const LinkIconBtn = ({ url }) => {
  return (
    <button
      type="button"
      className="source-icon-btn"
      title="Open source"
      onClick={(e) => {
        e.stopPropagation();
        openSourceUrl(url);
      }}
    >
      🔗
    </button>
  );
};

const cleanAiMessageText = (text) => {
  if (!text) return '';
  let cleaned = text;

  // 1. Remove labels like "Title:" and "Date:" (case insensitive, start of line)
  cleaned = cleaned.replace(/^\s*(?:Title|Date):\s*/gim, '');

  // 2. Remove "Source: [Name] [URL]" or "Source: URL" or "Source: [URL]" prefixes
  cleaned = cleaned.replace(/(?:Sources?|Links?):\s*(?:\[?[a-zA-Z0-9\s_-]+\]?)?\s*(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s)]+)/gi, '$1');

  // Also clean up patterns like "Source: " if it is at the start of a line or after spaces
  cleaned = cleaned.replace(/^\s*(?:Sources?|Links?):\s*/gim, '');

  return cleaned;
};

const JsonListRenderer = ({ items }) => {
  if (!Array.isArray(items)) return null;
  return (
    <div className="json-list-container">
      {items.map((item, idx) => (
        <div key={idx} className="json-list-item" style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
            <span>{idx + 1}. {item.title || item.headline}</span>
            {item.url && (Array.isArray(item.url) ? (
              item.url.map((url, uIdx) => <LinkIconBtn key={uIdx} url={url} />)
            ) : (
              <LinkIconBtn url={item.url} />
            ))}
          </div>
          {item.summary && (
            <div style={{ paddingLeft: '14px', marginTop: '4px', opacity: 0.85, fontSize: '11.5px', lineHeight: '1.45' }}>
              {item.summary}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const InlineMarkdown = ({ text }) => {
  if (!text) return null;

  // Split by markdown link [Text](URL) or raw URL (http://... or https://...)
  const linkRegex = /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s)]+)/g;
  const parts = text.split(linkRegex);

  return (
    <>
      {parts.map((part, idx) => {
        if (!part) return null;

        // Check if it is a markdown link
        const markdownLinkMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
        if (markdownLinkMatch) {
          const url = markdownLinkMatch[2];
          return <LinkIconBtn key={idx} url={url} />;
        }

        // Check if it is a raw URL
        if (/^https?:\/\/[^\s)]+$/.test(part)) {
          return <LinkIconBtn key={idx} url={part} />;
        }

        // Otherwise, process inline code and bold/italic elements
        const codeParts = part.split(/(`[^`\n]+`)/g);
        return (
          <span key={idx}>
            {codeParts.map((cPart, cIdx) => {
              if (cPart.startsWith('`') && cPart.endsWith('`')) {
                return (
                  <code key={cIdx} className="markdown-inline-code">
                    {cPart.slice(1, -1)}
                  </code>
                );
              }
              const boldParts = cPart.split(/(\*\*[^*]+\*\*)/g);
              return (
                <span key={cIdx}>
                  {boldParts.map((bPart, bIdx) => {
                    if (bPart.startsWith('**') && bPart.endsWith('**')) {
                      const innerText = bPart.slice(2, -2);
                      const italicParts = innerText.split(/(\*[^*]+\*)/g);
                      return (
                        <strong key={bIdx}>
                          {italicParts.map((iPart, iIdx) => {
                            if (iPart.startsWith('*') && iPart.endsWith('*')) {
                              return <em key={iIdx}>{iPart.slice(1, -1)}</em>;
                            }
                            return iPart;
                          })}
                        </strong>
                      );
                    }
                    const italicParts = bPart.split(/(\*[^*]+\*)/g);
                    return (
                      <span key={bIdx}>
                        {italicParts.map((iPart, iIdx) => {
                          if (iPart.startsWith('*') && iPart.endsWith('*')) {
                            return <em key={iIdx}>{iPart.slice(1, -1)}</em>;
                          }
                          return iPart;
                        })}
                      </span>
                    );
                  })}
                </span>
              );
            })}
          </span>
        );
      })}
    </>
  );
};

const MarkdownTextBlock = ({ text }) => {
  const lines = text.split('\n');
  const renderedElements = [];
  let currentList = null;
  let listType = null;

  const flushList = () => {
    if (currentList) {
      if (listType === 'ul') {
        renderedElements.push(<ul key={`ul-${renderedElements.length}`} className="markdown-ul">{currentList}</ul>);
      } else {
        renderedElements.push(<ol key={`ol-${renderedElements.length}`} className="markdown-ol">{currentList}</ol>);
      }
      currentList = null;
      listType = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      const HeadingTag = `h${level}`;
      renderedElements.push(
        <HeadingTag key={i} className={`markdown-h${level}`}>
          <InlineMarkdown text={headingText} />
        </HeadingTag>
      );
      continue;
    }

    const ulMatch = line.match(/^[-*+]\s+(.*)$/);
    if (ulMatch) {
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
        currentList = [];
      }
      currentList.push(
        <li key={i} className="markdown-li">
          <InlineMarkdown text={ulMatch[1]} />
        </li>
      );
      continue;
    }

    const olMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (olMatch) {
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
        currentList = [];
      }
      currentList.push(
        <li key={i} className="markdown-li">
          <InlineMarkdown text={olMatch[2]} />
        </li>
      );
      continue;
    }

    if (line.trim() === '') {
      flushList();
      renderedElements.push(<div key={i} className="markdown-line-break" />);
      continue;
    }

    flushList();
    renderedElements.push(
      <p key={i} className="markdown-p">
        <InlineMarkdown text={line} />
      </p>
    );
  }

  flushList();
  return <>{renderedElements}</>;
};

const CodeCopyButton = ({ code }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button 
      type="button"
      onClick={handleCopy} 
      className="markdown-code-copy-btn"
      title="Copy Code"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
};

const ActionCopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      type="button"
      className="chat-msg-action-icon-btn"
      onClick={handleCopy}
      title="Copy Answer"
      style={{ position: 'relative' }}
    >
      {copied ? <Check size={13} style={{ color: '#4ade80' }} /> : <Copy size={13} />}
      {copied && (
        <span className="copy-tooltip-floating">
          Copied
        </span>
      )}
    </button>
  );
};

const MarkdownRenderer = ({ text }) => {
  if (!text) return null;
  
  const cleanedText = cleanAiMessageText(text);

  let isJsonArray = false;
  let jsonItems = [];
  const trimmed = cleanedText.trim();
  
  let jsonText = trimmed;
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  
  try {
    const parsed = JSON.parse(jsonText.trim());
    if (Array.isArray(parsed)) {
      isJsonArray = true;
      jsonItems = parsed;
    }
  } catch (e) {
    // not JSON
  }

  if (isJsonArray) {
    return <JsonListRenderer items={jsonItems} />;
  }

  const parts = cleanedText.split(/(```[\s\S]*?```)/g);
  return (
    <div className="markdown-body">
      {parts.map((part, idx) => {
        if (part.startsWith('```')) {
          const match = part.match(/```(\w*)\n?([\s\S]*?)\n?```/);
          const lang = match ? match[1] : '';
          const code = match ? match[2] : part.slice(3, -3);
          return (
            <div key={idx} className="markdown-code-block-wrapper">
              <div className="markdown-code-block-header">
                <span className="markdown-code-block-lang">{lang || 'code'}</span>
                <CodeCopyButton code={code} />
              </div>
              <SyntaxHighlighter
                language={lang || 'text'}
                style={oneDark}
                customStyle={{
                  margin: 0,
                  background: 'transparent',
                  padding: '16px',
                  fontSize: '13px',
                  lineHeight: '1.5',
                  fontFamily: "'Fira Code', 'Courier New', Courier, monospace"
                }}
              >
                {code.replace(/\n$/, '')}
              </SyntaxHighlighter>
            </div>
          );
        } else {
          return <MarkdownTextBlock key={idx} text={part} />;
        }
      })}
    </div>
  );
};

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
    return ['gemini', 'stepfun', 'manus'].includes(raw) ? raw : 'google';
  } catch {
    return 'google';
  }
};

const AI_PROVIDER_IDS = new Set(['gemini', 'stepfun', 'manus']);

const providerOptions = [
  { id: 'google', label: 'Google', icon: Search, placeholder: 'Search Google' },
  { id: 'gemini', label: 'Gemini', icon: Sparkles, placeholder: 'Ask Gemini' },
  { id: 'stepfun', label: 'StepFun AI', icon: Bot, placeholder: 'Ask StepFun AI...' },
  { id: 'manus', label: 'Manus AI', icon: Bot, placeholder: 'Ask Manus AI...' },
];

const searchProviderOptions = providerOptions;

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
const TabProviderIcon = ({ provider, size = 12 }) => {
  if (provider === 'gemini') {
    return <Sparkles size={size} style={{ color: '#a78bfa' }} />;
  }
  if (provider === 'manus') {
    return <span style={{ color: '#f8fafc', fontSize: size, fontWeight: 800, lineHeight: 1 }}>M</span>;
  }
  return <Bot size={size} style={{ color: '#38bdf8' }} />;
};

const MessageAttachmentRenderer = ({ attachment }) => {
  if (!attachment) return null;

  const { type, name, size, url } = attachment;

  const formatSize = (bytes) => {
    if (bytes === null || bytes === undefined) return '';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (type === 'image' || type === 'camera') {
    return (
      <div className="msg-attachment-media msg-attachment-image">
        <img
          src={url}
          alt={name}
          className="msg-attachment-img-preview"
          onClick={() => window.open(url, '_blank')}
          title="Click to view full image"
        />
      </div>
    );
  }

  if (type === 'video') {
    return (
      <div className="msg-attachment-media msg-attachment-video">
        <video src={url} controls className="msg-attachment-video-preview" />
      </div>
    );
  }

  if (type === 'file') {
    return (
      <div className="msg-attachment-card">
        <div className="msg-attachment-card-icon">
          <FileText size={16} />
        </div>
        <div className="msg-attachment-card-details">
          <div className="msg-attachment-card-name" title={name}>{name}</div>
          <div className="msg-attachment-card-size">{formatSize(size)}</div>
        </div>
        <a href={url} download={name} className="msg-attachment-card-download" title="Download file">
          📥
        </a>
      </div>
    );
  }

  if (type === 'link') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="msg-attachment-link-card">
        <div className="msg-attachment-link-icon">
          <Link size={16} />
        </div>
        <div className="msg-attachment-link-details">
          <div className="msg-attachment-link-title" title={name}>{name}</div>
          <div className="msg-attachment-link-url">{url}</div>
        </div>
      </a>
    );
  }

  return null;
};
const CenterSearch = ({ onPopupStateChange = () => {} }) => {
  const wrapperRef = useRef(null);
  const providerTriggerRef = useRef(null);
  const accountTriggerRef = useRef(null);
  const accountPopupRef = useRef(null);
  const searchDrag = useDraggablePopup('search');
  const googleTokenClientRef = useRef(null);
  const [activePopup, setActivePopup] = useState(null);
  const [query, setQuery] = useState('');
  const [googleAccount, setGoogleAccount] = useState(() => readStoredGoogleAccount());
  const [googleAuthError, setGoogleAuthError] = useState('');
  const [searchHistory, setSearchHistory] = useState(() => readStoredSearchHistory());
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [accountPopupPosition, setAccountPopupPosition] = useState({ top: 0, right: 0 });
  const [isProviderMenuOpen, setIsProviderMenuOpen] = useState(false);
  const [providerMenuPosition, setProviderMenuPosition] = useState({ top: 0, left: 0 });
  const [searchProvider, setSearchProvider] = useState(() => readStoredSearchProvider());

  // Independent open/close states
  const [isGeminiOpen, setIsGeminiOpen] = useState(false);
  const [isStepFunOpen, setIsStepFunOpen] = useState(false);
  const [isManusOpen, setIsManusOpen] = useState(false);

  // Independent pending prompt states
  const [geminiPendingPrompt, setGeminiPendingPrompt] = useState(null);
  const [stepfunPendingPrompt, setStepfunPendingPrompt] = useState(null);
  const [manusPendingPrompt, setManusPendingPrompt] = useState(null);

  // Focus z-index state
  const [frontProvider, setFrontProvider] = useState('gemini');

  const providerMenuRef = useRef(null);
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
      
      const clickedGeminiPopup = document.querySelector('.center-search-answer-popup[data-provider="gemini"]')?.contains(event.target);
      const clickedStepFunPopup = document.querySelector('.center-search-answer-popup[data-provider="stepfun"]')?.contains(event.target);
      const clickedManusPopup = document.querySelector('.center-search-answer-popup[data-provider="manus"]')?.contains(event.target);

      if (clickedAccountTrigger || clickedAccountPopup || clickedProviderTrigger || clickedProviderMenu || 
          clickedGeminiPopup || clickedStepFunPopup || clickedManusPopup) {
        return;
      }

      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setActivePopup(null);
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

  const isAnyPopupOpen = activePopup !== null || isGeminiOpen || isStepFunOpen || isManusOpen;
  useEffect(() => {
    onPopupStateChange(isAnyPopupOpen);
  }, [isAnyPopupOpen, onPopupStateChange]);

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

    if (searchProvider === 'gemini') {
      setIsGeminiOpen(true);
      setFrontProvider('gemini');
      setGeminiPendingPrompt({ text: trimmedQuery, timestamp: Date.now() });
      setQuery('');
      return;
    } else if (searchProvider === 'stepfun') {
      setIsStepFunOpen(true);
      setFrontProvider('stepfun');
      setStepfunPendingPrompt({ text: trimmedQuery, timestamp: Date.now() });
      setQuery('');
      return;
    } else if (searchProvider === 'manus') {
      setIsManusOpen(true);
      setFrontProvider('manus');
      setManusPendingPrompt({ text: trimmedQuery, timestamp: Date.now() });
      setQuery('');
      return;
    }

    saveSearchToHistory(trimmedQuery);
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

    if (providerId === 'gemini') {
      setIsGeminiOpen(true);
      setFrontProvider('gemini');
    } else if (providerId === 'stepfun') {
      setIsStepFunOpen(true);
      setFrontProvider('stepfun');
    } else if (providerId === 'manus') {
      setIsManusOpen(true);
      setFrontProvider('manus');
      if (query.trim()) {
        setManusPendingPrompt({ text: query, timestamp: Date.now() });
        setQuery('');
      }
    } else {
      setActivePopup('search');
    }
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
          <div className="center-search-profile">
            {googleAvatar ? (
              <img src={googleAvatar} alt={googleEmail} className="center-search-profile-avatar" />
            ) : (
              <span className="center-search-profile-initial">{googleEmailInitial}</span>
            )}
            <div className="center-search-profile-info">
              <div className="center-search-profile-name">{googleAccount.name || 'Google User'}</div>
              <div className="center-search-profile-email">{googleEmail}</div>
            </div>
          </div>
          <button
            type="button"
            className="center-search-signout-btn"
            onClick={handleGoogleLogout}
          >
            <LogOut size={14} />
            <span>Sign out</span>
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
          {searchProviderOptions.map(({ id, label, icon: Icon }) => (
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

  return (
    <div ref={wrapperRef} className="center-search-shell">
      <button
        type="button"
        className={`flex-center center-search-trigger ${activePopup === 'search' ? 'is-open' : ''}`}
        onClick={() => setActivePopup((current) => (current === 'search' ? null : 'search'))}
        aria-label="Open search"
      >
        <Search size={14} />
      </button>

      {activePopup === 'search' && (
        <div ref={searchDrag.popupRef} style={searchDrag.dragStyle} className="center-search-popup">
          <div
            className={`center-search-bar ${activePopup === 'search' ? 'is-open' : ''}`}
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
                onFocus={() => setActivePopup('search')}
                onKeyDown={handleSearchSubmit}
                className="center-search-input"
              />
            </div>

            <div className="center-search-actions">
              <button
                type="button"
                className="center-search-drag-btn popup-drag-btn"
                {...searchDrag.dragProps}
              >
                ⠿
              </button>
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
                ) : searchProvider === 'stepfun' ? (
                  <Bot size={18} className="center-search-google-icon center-search-mode-icon" />
                ) : searchProvider === 'manus' ? (
                  <span className="center-search-google-icon center-search-mode-icon center-search-letter-icon">M</span>
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
      <AiChatPopup
        provider="gemini"
        isOpen={isGeminiOpen}
        onClose={() => setIsGeminiOpen(false)}
        frontProvider={frontProvider}
        onFocus={() => setFrontProvider('gemini')}
        onSaveSearchToHistory={saveSearchToHistory}
        pendingPrompt={geminiPendingPrompt}
        onClearPendingPrompt={() => setGeminiPendingPrompt(null)}
        onSwitchToStepFun={() => {
          setIsStepFunOpen(true);
          setFrontProvider('stepfun');
        }}
      />
      <AiChatPopup
        provider="stepfun"
        isOpen={isStepFunOpen}
        onClose={() => setIsStepFunOpen(false)}
        frontProvider={frontProvider}
        onFocus={() => setFrontProvider('stepfun')}
        onSaveSearchToHistory={saveSearchToHistory}
        pendingPrompt={stepfunPendingPrompt}
        onClearPendingPrompt={() => setStepfunPendingPrompt(null)}
      />
      <AiChatPopup
        provider="manus"
        isOpen={isManusOpen}
        onClose={() => setIsManusOpen(false)}
        frontProvider={frontProvider}
        onFocus={() => setFrontProvider('manus')}
        onSaveSearchToHistory={saveSearchToHistory}
        pendingPrompt={manusPendingPrompt}
        onClearPendingPrompt={() => setManusPendingPrompt(null)}
      />
    </div>
  );
};

/* ==========================================================================
   Independent AI Chat Popup Component
   ========================================================================== */
const COMMAND_OPTIONS = [
  { name: '@prompt', desc: 'Create or improve a detailed AI prompt', icon: Sparkles },
  { name: '@CFM', desc: 'Work with Code File Manager features', icon: Layers },
  { name: '@explain', desc: 'Explain selected text or code in simple language', icon: BookOpen },
  { name: '@fix', desc: 'Fix code, errors, layout, or grammar', icon: RotateCw },
  { name: '@summarize', desc: 'Summarize the entered content', icon: FileText },
  { name: '@translate', desc: 'Translate the entered text', icon: Mic },
  { name: '@code', desc: 'Generate or improve code', icon: GitBranch },
  { name: '@search', desc: 'Search inside the selected project or file context', icon: Search }
];

const parseCommand = (text) => {
  if (!text) return null;
  const match = text.match(/(?:^|\s)(@(prompt|CFM|explain|fix|summarize|translate|code|search))\b/i);
  if (match) {
    const fullMatch = match[1];
    const cmdName = match[2];
    const trimmed = text.trim();
    if (trimmed.toLowerCase().startsWith(fullMatch.toLowerCase())) {
      return {
        command: fullMatch,
        name: cmdName,
        remainingText: trimmed.substring(fullMatch.length).trim()
      };
    }
  }
  return null;
};

const AiChatPopup = ({
  provider,
  isOpen,
  onClose,
  frontProvider,
  onFocus,
  onSaveSearchToHistory,
  pendingPrompt,
  onClearPendingPrompt,
  onSwitchToStepFun,
}) => {

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const drag = useDraggablePopup(provider);
  // eslint-disable-next-line react-hooks/refs
  const answerPopupRef = drag.popupRef;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const chatBottomRef = useRef(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const attachmentFileInputRef = useRef(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const videoRef = useRef(null);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [chatTabs, setChatTabs] = useState(() => {
    try {
      const saved = localStorage.getItem(`ddo_chat_sessions_${provider}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [activeTabId, setActiveTabId] = useState(() => {
    try {
      return localStorage.getItem(`ddo_active_tab_id_${provider}`) || '';
    } catch {
      return '';
    }
  });

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [chatHistory, setChatHistory] = useState([]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [answerInput, setAnswerInput] = useState('');
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [answerPanel, setAnswerPanel] = useState({
    isOpen: false,
    provider: provider,
    question: '',
    answer: '',
    status: 'idle',
    error: '',
  });

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [tabErrors, setTabErrors] = useState({});
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [isMinimized, setIsMinimized] = useState(false);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [isMaximized, setIsMaximized] = useState(false);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [attachment, setAttachment] = useState(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [toastMessage, setToastMessage] = useState('');

  // Camera & Link dialog state triggers
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [isCameraActive, setIsCameraActive] = useState(false);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [isLinkInputActive, setIsLinkInputActive] = useState(false);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [linkUrlInput, setLinkUrlInput] = useState('https://');
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [linkTitleInput, setLinkTitleInput] = useState('');

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [activeMenuMsgId, setActiveMenuMsgId] = useState(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [activeSourcesMsgId, setActiveSourcesMsgId] = useState(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [speakingMsgId, setSpeakingMsgId] = useState(null);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [editingMsgId, setEditingMsgId] = useState(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [editingText, setEditingText] = useState('');

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [isMenuDismissed, setIsMenuDismissed] = useState(false);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const chatInputRef = useRef(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const commandMenuRef = useRef(null);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [renamingTabId, setRenamingTabId] = useState(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [renamingTitle, setRenamingTitle] = useState('');
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [contextMenu, setContextMenu] = useState(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [closingTabIds, setClosingTabIds] = useState([]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [geminiCooldownUntil, setGeminiCooldownUntil] = useState(() => {
    try {
      return Number(localStorage.getItem(`geminiCooldownUntil_${provider}`)) || 0;
    } catch {
      return 0;
    }
  });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [cooldownSecondsLeft, setCooldownSecondsLeft] = useState(0);

  const PROVIDER_CAPABILITIES = {
    gemini: { image: true, camera: true, file: true, video: true, link: true },
    stepfun: { image: true, camera: true, file: false, video: false, link: true },
    manus: { image: true, camera: true, file: true, video: true, link: true }
  };

  const startUploadSimulation = (uploadId) => {
    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += 10;
      setAttachment(prev => {
        if (prev && prev.uploadId === uploadId) {
          if (currentProgress >= 100) {
            clearInterval(interval);
            return { ...prev, progress: null };
          }
          return { ...prev, progress: currentProgress };
        }
        clearInterval(interval);
        return prev;
      });
    }, 120);
  };

  const handleTriggerUpload = (type) => {
    setIsAttachmentMenuOpen(false);
    if (type === 'camera') {
      setIsCameraActive(true);
      return;
    }
    if (type === 'link') {
      setLinkUrlInput('https://');
      setLinkTitleInput('');
      setIsLinkInputActive(true);
      return;
    }

    if (attachmentFileInputRef.current) {
      if (type === 'image') {
        attachmentFileInputRef.current.accept = 'image/png, image/jpeg, image/jpg, image/webp';
      } else if (type === 'video') {
        attachmentFileInputRef.current.accept = 'video/mp4, video/quicktime, video/webm';
      } else if (type === 'file') {
        attachmentFileInputRef.current.accept = '.pdf, .docx, .txt, .zip, .json, .csv';
      }
      attachmentFileInputRef.current.dataset.uploadType = type;
      attachmentFileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const uploadType = attachmentFileInputRef.current.dataset.uploadType || 'file';

    if (uploadType === 'image' && file.size > 10 * 1024 * 1024) {
      setToastMessage("Photo exceeds the 10 MB size limit.");
      setTimeout(() => setToastMessage(''), 4000);
      e.target.value = '';
      return;
    }
    if (uploadType === 'video' && file.size > 50 * 1024 * 1024) {
      setToastMessage("Video exceeds the 50 MB size limit.");
      setTimeout(() => setToastMessage(''), 4000);
      e.target.value = '';
      return;
    }
    if (uploadType === 'file' && file.size > 15 * 1024 * 1024) {
      setToastMessage("Document exceeds the 15 MB size limit.");
      setTimeout(() => setToastMessage(''), 4000);
      e.target.value = '';
      return;
    }

    // eslint-disable-next-line react-hooks/purity
    const uploadId = 'up_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const mockUrl = URL.createObjectURL(file);

    setAttachment({
      uploadId,
      type: uploadType,
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(1) + ' MB',
      url: mockUrl,
      progress: 0
    });

    startUploadSimulation(uploadId);
    e.target.value = '';
  };

  const handleCapturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg');

      // eslint-disable-next-line react-hooks/purity
      const uploadId = 'up_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      setAttachment({
        uploadId,
        type: 'camera',
        name: `snapshot_${new Date().toLocaleTimeString().replace(/\s+/g, '')}.jpg`,
        size: 'Captured',
        url: dataUrl,
        progress: 0
      });

      startUploadSimulation(uploadId);
      setIsCameraActive(false);
    }
  };

  const handleSubmitLink = (e) => {
    e.preventDefault();
    const urlVal = linkUrlInput.trim();
    if (!urlVal || urlVal === 'https://') return;

    let displayTitle = linkTitleInput.trim();
    if (!displayTitle) {
      try {
        const u = new URL(urlVal);
        displayTitle = u.hostname;
      } catch {
        displayTitle = 'External Link';
      }
    }

    // eslint-disable-next-line react-hooks/purity
    const uploadId = 'up_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    setAttachment({
      uploadId,
      type: 'link',
      name: displayTitle,
      size: 'URL Link',
      url: urlVal,
      progress: null
    });

    setIsLinkInputActive(false);
  };

  const getWelcomeMessage = (prov) => {
    const label = providerOptions.find((option) => option.id === prov)?.label || 'AI';
    return {
      // eslint-disable-next-line react-hooks/purity
      id: 'welcome_' + Date.now(),
      sender: 'ai',
      text: prov === 'stepfun' || prov === 'manus'
        ? `Hello! I am ${label}. What would you like help with today?`
        : `Ask a question and ${label} will answer here.`
    };
  };

  const handleCreateNewTab = (prov = provider) => {
    // eslint-disable-next-line react-hooks/purity
    const newId = 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const newTab = {
      id: newId,
      provider: prov,
      title: 'New Chat',
      messages: [getWelcomeMessage(prov)],
      draft: '',
      pendingAttachment: null
    };
    setChatTabs(prev => {
      const withDraft = prev.map(t => t.id === activeTabId ? { ...t, draft: answerInput, pendingAttachment: attachment } : t);
      return [...withDraft, newTab];
    });
    setAnswerInput('');
    setAttachment(null);
    setActiveTabId(newId);
    setAnswerPanel(prev => ({ ...prev, provider: prov }));
    return newTab;
  };

  const handleSwitchTab = (tabId) => {
    if (tabId === activeTabId) return;
    setChatTabs(prev => {
      const updated = prev.map(t => t.id === activeTabId ? { ...t, draft: answerInput, pendingAttachment: attachment } : t);
      const nextTab = updated.find(t => t.id === tabId);
      if (nextTab) {
        setAnswerInput(nextTab.draft || '');
        setAttachment(nextTab.pendingAttachment || null);
      } else {
        setAnswerInput('');
        setAttachment(null);
      }
      return updated;
    });
    setActiveTabId(tabId);
    const tab = chatTabs.find(t => t.id === tabId);
    if (tab && tab.provider) {
      setAnswerPanel(prev => ({ ...prev, provider: tab.provider }));
    }
  };

  const handleCloseTab = (e, tabId) => {
    if (e) e.stopPropagation();
    setClosingTabIds(prev => [...prev, tabId]);

    setTimeout(() => {
      setChatTabs(prevTabs => {
        const remaining = prevTabs.filter(t => t.id !== tabId);
        if (activeTabId === tabId) {
          if (remaining.length > 0) {
            const closedIndex = prevTabs.findIndex(t => t.id === tabId);
            const newActiveIndex = Math.min(closedIndex, remaining.length - 1);
            const nextTab = remaining[newActiveIndex];
            setActiveTabId(nextTab.id);
            if (nextTab.provider) {
              setAnswerPanel(prev => ({ ...prev, provider: nextTab.provider }));
            }
            setAnswerInput(nextTab.draft || '');
            setAttachment(nextTab.pendingAttachment || null);
          } else {
            // eslint-disable-next-line react-hooks/purity
            const newId = 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            const prov = provider;
            const freshTab = {
              id: newId,
              provider: prov,
              title: 'New Chat',
              messages: [getWelcomeMessage(prov)],
              draft: '',
              pendingAttachment: null
            };
            setActiveTabId(newId);
            setAnswerInput('');
            setAttachment(null);
            return [freshTab];
          }
        }
        return remaining;
      });
      setClosingTabIds(prev => prev.filter(id => id !== tabId));
    }, 200);
  };

  const handleDuplicateTab = (tabId) => {
    const tabToDup = chatTabs.find(t => t.id === tabId);
    if (!tabToDup) return;

    // eslint-disable-next-line react-hooks/purity
    const newId = 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const dupTab = {
      id: newId,
      provider: tabToDup.provider,
      title: tabToDup.title === 'New Chat' ? 'New Chat' : tabToDup.title + ' Copy',
      messages: JSON.parse(JSON.stringify(tabToDup.messages || [])),
      draft: tabToDup.id === activeTabId ? answerInput : (tabToDup.draft || ''),
      pendingAttachment: tabToDup.id === activeTabId ? attachment : (tabToDup.pendingAttachment || null)
    };

    setChatTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId);
      const updated = [...prev];
      updated.splice(idx + 1, 0, dupTab);
      return updated;
    });
    setActiveTabId(newId);
    setAnswerInput(dupTab.draft || '');
    setAttachment(dupTab.pendingAttachment || null);
    if (dupTab.provider) {
      setAnswerPanel(prev => ({ ...prev, provider: dupTab.provider }));
    }
  };

  const handleRenameTab = (tabId, newTitle) => {
    if (!newTitle.trim()) return;
    setChatTabs(prev => prev.map(t => t.id === tabId ? { ...t, title: newTitle.trim().slice(0, 20) } : t));
    setRenamingTabId(null);
  };

  const handleCloseOtherTabs = (tabId) => {
    const targetTab = chatTabs.find(t => t.id === tabId);
    if (!targetTab) return;

    setChatTabs([targetTab]);
    setActiveTabId(tabId);
    if (targetTab.provider) {
      setAnswerPanel(prev => ({ ...prev, provider: targetTab.provider }));
    }
    setAnswerInput(targetTab.draft || '');
    setAttachment(targetTab.pendingAttachment || null);
  };

  const handleLikeMessage = (msgId) => {
    setChatTabs(prev => prev.map(t => {
      if (t.id === activeTabId) {
        return {
          ...t,
          messages: t.messages.map(m => m.id === msgId ? { ...m, feedback: m.feedback === 'like' ? null : 'like' } : m)
        };
      }
      return t;
    }));
  };

  const handleDislikeMessage = (msgId) => {
    setChatTabs(prev => prev.map(t => {
      if (t.id === activeTabId) {
        return {
          ...t,
          messages: t.messages.map(m => m.id === msgId ? { ...m, feedback: m.feedback === 'dislike' ? null : 'dislike' } : m)
        };
      }
      return t;
    }));
  };

  const handleBranchChat = (aiMsg) => {
    const activeTab = chatTabs.find(t => t.id === activeTabId);
    if (!activeTab) return;

    const msgIdx = activeTab.messages.findIndex(m => m.id === aiMsg.id);
    if (msgIdx === -1) return;

    const prefixMessages = activeTab.messages.slice(0, msgIdx + 1);

    // eslint-disable-next-line react-hooks/purity
    const newId = 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const branchedTab = {
      id: newId,
      provider: activeTab.provider,
      title: activeTab.title === 'New Chat' ? 'New Chat' : activeTab.title + ' Branch',
      messages: JSON.parse(JSON.stringify(prefixMessages)),
      draft: '',
      pendingAttachment: null
    };

    setChatTabs(prev => {
      const idx = prev.findIndex(t => t.id === activeTabId);
      const updated = [...prev];
      updated.splice(idx + 1, 0, branchedTab);
      return updated;
    });
    setActiveTabId(newId);
    setAnswerInput('');
    setAttachment(null);
  };

  const handleReadAloud = (msg) => {
    if (speakingMsgId === msg.id) {
      window.speechSynthesis?.cancel();
      setSpeakingMsgId(null);
      return;
    }
    window.speechSynthesis?.cancel();

    const textToSpeak = msg.text.replace(/<[^>]*>/g, '').replace(/```[\s\S]*?```/g, '[code block]').replace(/`[^`]+`/g, 'code');
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.onend = () => {
      setSpeakingMsgId(null);
    };
    utterance.onerror = () => {
      setSpeakingMsgId(null);
    };

    setSpeakingMsgId(msg.id);
    window.speechSynthesis?.speak(utterance);
  };

  const handleViewSources = (msgId) => {
    setActiveSourcesMsgId(activeSourcesMsgId === msgId ? null : msgId);
  };

  const openOpenRouterPopup = () => {
    console.log('OpenRouter popup clicked');
  };

  const handleRetryLastPrompt = () => {
    const activeTab = chatTabs.find(t => t.id === activeTabId);
    if (!activeTab) return;

    const lastUserMsg = [...(activeTab.messages || [])].reverse().find(m => m.sender === 'user');
    if (!lastUserMsg) return;

    setTabErrors(prev => {
      const next = { ...prev };
      delete next[activeTabId];
      return next;
    });

    void submitAiPrompt(activeTab.provider, lastUserMsg.text, lastUserMsg.attachment, true);
  };

  const handleRegenerate = async (msgId) => {
    const activeTab = chatTabs.find(t => t.id === activeTabId);
    if (!activeTab) return;

    const msgIdx = activeTab.messages.findIndex((m) => m.id === msgId);
    if (msgIdx === -1) return;

    let userMsgIdx = -1;
    for (let i = msgIdx - 1; i >= 0; i--) {
      if (activeTab.messages[i].sender === 'user') {
        userMsgIdx = i;
        break;
      }
    }

    if (userMsgIdx === -1) return;

    const originalUserMsg = activeTab.messages[userMsgIdx];

    setChatTabs(prev => prev.map(t => {
      if (t.id === activeTabId) {
        return {
          ...t,
          messages: t.messages.slice(0, userMsgIdx + 1)
        };
      }
      return t;
    }));

    void submitAiPrompt(activeTab.provider, originalUserMsg.text, originalUserMsg.attachment, true);
  };

  const handleStartEditUserMessage = (msgId, text) => {
    setEditingMsgId(msgId);
    setEditingText(text);
  };

  const handleCancelEdit = () => {
    setEditingMsgId(null);
    setEditingText('');
  };

  const handleSaveEdit = async (msgId, attachment) => {
    const updatedText = editingText.trim();
    if (!updatedText) return;

    setChatTabs(prevTabs => {
      return prevTabs.map(t => {
        if (t.id === activeTabId) {
          const msgIdx = t.messages.findIndex(m => m.id === msgId);
          if (msgIdx === -1) return t;

          const updatedUserMsg = {
            ...t.messages[msgIdx],
            text: updatedText
          };

          const truncatedMessages = t.messages.slice(0, msgIdx);
          const newMessages = [...truncatedMessages, updatedUserMsg];

          return {
            ...t,
            messages: newMessages
          };
        }
        return t;
      });
    });

    setEditingMsgId(null);
    setEditingText('');

    void submitAiPrompt(provider, updatedText, attachment, true);
  };

  const handleDeleteUserMessage = (msgId) => {
    setChatTabs(prevTabs => {
      return prevTabs.map(t => {
        if (t.id === activeTabId) {
          const msgIdx = t.messages.findIndex(m => m.id === msgId);
          if (msgIdx === -1) return t;

          const newMessages = t.messages.slice(0, msgIdx);
          
          if (newMessages.length === 0) {
            newMessages.push(getWelcomeMessage(t.provider));
          }

          return {
            ...t,
            messages: newMessages
          };
        }
        return t;
      });
    });
  };

  const handleGeminiError = (errorText) => {
    const isQuotaError =
      errorText.toLowerCase().includes("quota") ||
      errorText.toLowerCase().includes("rate-limit") ||
      errorText.toLowerCase().includes("rate limit") ||
      errorText.toLowerCase().includes("free_tier_requests") ||
      errorText.toLowerCase().includes("limit reached") ||
      errorText.toLowerCase().includes("exceeded");

    if (!isQuotaError) return false;

    const retryMatch = errorText.match(/retry in ([\d.]+)s/i) || 
                       errorText.match(/retry after ([\d.]+)s/i) || 
                       errorText.match(/retry in ([\d.]+) seconds/i) ||
                       errorText.match(/retry after ([\d.]+) seconds/i);
    const retrySeconds = retryMatch ? Math.ceil(Number(retryMatch[1])) : 35;

    // eslint-disable-next-line react-hooks/purity
    const cooldownUntil = Date.now() + retrySeconds * 1000;
    setGeminiCooldownUntil(cooldownUntil);
    try {
      localStorage.setItem(`geminiCooldownUntil_${provider}`, String(cooldownUntil));
    } catch (e) {
      // ignore
    }
    return true;
  };

  const submitAiPrompt = async (providerId, promptText, customAttachment = null, isRetry = false) => {
    if (answerPanel.status === 'loading') {
      return;
    }

    const trimmedQuery = promptText.trim();
    if (!trimmedQuery) {
      return;
    }

    const cmdInfo = providerId === 'stepfun' ? parseCommand(trimmedQuery) : null;
    let requestPrompt = trimmedQuery;
    let systemInstructionOverride = undefined;

    if (cmdInfo) {
      requestPrompt = cmdInfo.remainingText || '';
      if (cmdInfo.name === 'prompt') {
        systemInstructionOverride = "You are an AI prompt engineering expert. Your task is to help the user create or improve a detailed, structured, and reusable prompt based on their input. Correct grammar, add requirements, behavior, design, and restrictions. Do not return code unless explicitly asked. Do not include the @prompt trigger text in your response.";
      } else if (cmdInfo.name === 'explain') {
        systemInstructionOverride = "You are an educator. Explain the provided text or code in simple, clear, and easy-to-understand language.";
      } else if (cmdInfo.name === 'fix') {
        systemInstructionOverride = "You are a senior developer. Fix the provided code, errors, layout, or grammar. Highlight the changes and explain the fix briefly.";
      } else if (cmdInfo.name === 'summarize') {
        systemInstructionOverride = "You are a summarization assistant. Summarize the provided content into a concise, high-level summary with bullet points.";
      } else if (cmdInfo.name === 'translate') {
        systemInstructionOverride = "Translate the provided text into the requested language or English if unspecified.";
      } else if (cmdInfo.name === 'code') {
        systemInstructionOverride = "You are an expert software engineer. Generate or improve the code requested. Provide clean, well-commented code blocks and brief explanations.";
      } else if (cmdInfo.name === 'search') {
        systemInstructionOverride = "You are a code search assistant. Help the user search inside the selected project or file context.";
      }
    }

    const providerMeta = providerOptions.find((option) => option.id === providerId) || providerOptions[1];
    if (onSaveSearchToHistory) {
      onSaveSearchToHistory(trimmedQuery);
    }
    setAnswerInput('');

    setAnswerPanel((prev) => ({
      ...prev,
      isOpen: false,
      provider: providerId,
      status: 'loading',
      error: '',
    }));

    let currentTabId = activeTabId;
    if (!currentTabId) {
      const newTab = handleCreateNewTab(providerId);
      currentTabId = newTab.id;
    }

    setTabErrors(prev => {
      const next = { ...prev };
      delete next[currentTabId];
      return next;
    });

    let finalPrompt = requestPrompt;
    let committedAttachment = null;

    const activeAttachment = customAttachment || attachment;
    if (activeAttachment) {
      const providerCaps = PROVIDER_CAPABILITIES[providerId] || { image: true, camera: true, link: true };
      if (!providerCaps[activeAttachment.type]) {
        // Show compatibility error inside the bubble
        // eslint-disable-next-line react-hooks/purity
        const userMsgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const userMsg = {
          id: userMsgId,
          sender: 'user',
          text: trimmedQuery,
          attachment: { ...activeAttachment }
        };

        setChatTabs(prev => prev.map(t => {
          if (t.id === currentTabId) {
            const updatedMsgs = [...(t.messages || []), userMsg];
            let newTitle = t.title;
            if (t.title === 'New Chat') {
              const words = trimmedQuery.trim().split(/\s+/);
              newTitle = words.slice(0, 4).join(' ').slice(0, 20) || 'New Chat';
            }
            return {
              ...t,
              title: newTitle,
              messages: updatedMsgs
            };
          }
          return t;
        }));

        // eslint-disable-next-line react-hooks/purity
        const aiMsgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const aiMsg = {
          id: aiMsgId,
          sender: 'ai',
          text: 'This AI does not support this attachment type yet.',
          isError: true
        };

        setTimeout(() => {
          setChatTabs(prev => prev.map(t => {
            if (t.id === currentTabId) {
              return {
                ...t,
                messages: [...(t.messages || []), aiMsg]
              };
            }
            return t;
          }));

          setAnswerPanel((prev) => ({
            ...prev,
            status: 'done',
          }));
        }, 600);

        if (!customAttachment) {
          setAttachment(null);
        }
        return;
      }

      committedAttachment = {
        type: activeAttachment.type,
        name: activeAttachment.name,
        size: activeAttachment.size,
        url: activeAttachment.url
      };

      if (activeAttachment.type === 'link') {
        finalPrompt = `[Attached Link: ${activeAttachment.name}] (${activeAttachment.url})\n\n${requestPrompt}`;
      } else if (activeAttachment.type === 'image' || activeAttachment.type === 'camera') {
        finalPrompt = `[Attached Photo: ${activeAttachment.name}]\n\n${requestPrompt}`;
      } else if (activeAttachment.type === 'video') {
        finalPrompt = `[Attached Video: ${activeAttachment.name}]\n\n${requestPrompt}`;
      } else {
        finalPrompt = `[Attached Document: ${activeAttachment.name}]\n\n${requestPrompt}`;
      }

      if (!customAttachment) {
        setAttachment(null);
      }
    }

    // eslint-disable-next-line react-hooks/purity
    const userMsgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const userMsg = { id: userMsgId, sender: 'user', text: trimmedQuery, attachment: committedAttachment };

    if (!isRetry) {
      setChatTabs(prev => prev.map(t => {
        if (t.id === currentTabId) {
          const updatedMsgs = [...(t.messages || []), userMsg];
          let newTitle = t.title;
          if (t.title === 'New Chat') {
            const words = trimmedQuery.trim().split(/\s+/);
            newTitle = words.slice(0, 4).join(' ').slice(0, 20) || 'New Chat';
          }
          return {
            ...t,
            title: newTitle,
            messages: updatedMsgs
          };
        }
        return t;
      }));
    }

    let route = '/api/ai/respond';
    if (providerId === 'gemini') {
      route = '/api/gemini/chat';
    } else if (providerId === 'stepfun') {
      route = '/api/stepfun/chat';
    } else if (providerId === 'manus') {
      route = '/api/manus/chat';
    }

    if (cmdInfo && cmdInfo.name === 'CFM') {
      route = '/api/cfm/chat';
    }

    try {
      const response = await fetch(buildApiUrl(route), {
        method: 'POST',
        headers: createAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          provider: providerId,
          prompt: finalPrompt,
          systemInstruction: systemInstructionOverride,
        }),
      });

      if (response.status === 404 && route === '/api/cfm/chat') {
        throw new Error("CFM backend integration is unavailable. Please ensure the Code File Manager module is configured and active.");
      }

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || `${providerMeta.label} request failed.`);
      }

      // eslint-disable-next-line react-hooks/purity
      const aiMsgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const aiMsg = { id: aiMsgId, sender: 'ai', text: payload.answer || '' };

      setChatTabs(prev => prev.map(t => {
        if (t.id === currentTabId) {
          return {
            ...t,
            messages: [...(t.messages || []), aiMsg]
          };
        }
        return t;
      }));

      setAnswerPanel((prev) => ({
        ...prev,
        status: 'done',
      }));
    } catch (error) {
      const errorMsg = error.message || `${providerMeta.label} request failed.`;

      let isQuota = false;
      if (providerId === 'gemini') {
        isQuota = handleGeminiError(errorMsg);
      }

      const textToShow = isQuota
        ? "Gemini limit reached. Please retry later."
        : errorMsg;

      console.error('AI request failed:', error);

      setTabErrors(prev => ({
        ...prev,
        [currentTabId]: textToShow
      }));

      setAnswerPanel((prev) => ({
        ...prev,
        status: 'error',
        error: textToShow,
      }));
    }
  };

  const extractSourcesFromText = (text) => {
    if (!text) return [];
    const sources = [];
    const cleaned = cleanAiMessageText(text);
    let isJsonArray = false;
    let jsonItems = [];
    const trimmed = cleaned.trim();
    let jsonText = trimmed;
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    try {
      const parsed = JSON.parse(jsonText.trim());
      if (Array.isArray(parsed)) {
        isJsonArray = true;
        jsonItems = parsed;
      }
    } catch (e) {}

    if (isJsonArray) {
      jsonItems.forEach(item => {
        if (item.url) {
          if (Array.isArray(item.url)) {
            item.url.forEach(u => {
              sources.push({ title: item.title || item.headline || 'Source', url: u });
            });
          } else {
            sources.push({ title: item.title || item.headline || 'Source', url: item.url });
          }
        }
      });
      return sources;
    }

    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+)/g;
    let match;
    while ((match = linkRegex.exec(text)) !== null) {
      if (match[1] && match[2]) {
        sources.push({ title: match[1], url: match[2] });
      } else if (match[3]) {
        sources.push({ title: 'Source', url: match[3] });
      }
    }
    return sources;
  };

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (pendingPrompt && pendingPrompt.text) {
      void submitAiPrompt(provider, pendingPrompt.text);
      if (onClearPendingPrompt) {
        onClearPendingPrompt();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    localStorage.setItem(`ddo_chat_sessions_${provider}`, JSON.stringify(chatTabs));
  }, [chatTabs, provider]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (activeTabId) {
      localStorage.setItem(`ddo_active_tab_id_${provider}`, activeTabId);
    }
  }, [activeTabId, provider]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const activeTab = chatTabs.find(t => t.id === activeTabId);
    if (activeTab) {
      setChatHistory(activeTab.messages || []);
    }
  }, [activeTabId, chatTabs]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    window.speechSynthesis?.cancel();
    setSpeakingMsgId(null);
  }, [activeTabId]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (chatTabs.length === 0) {
      // eslint-disable-next-line react-hooks/purity
      const newId = 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const prov = provider;
      const initialTab = {
        id: newId,
        provider: prov,
        title: 'New Chat',
        messages: [getWelcomeMessage(prov)],
        draft: '',
        pendingAttachment: null
      };
      setChatTabs([initialTab]);
      setActiveTabId(newId);
    } else {
      const savedActiveId = localStorage.getItem(`ddo_active_tab_id_${provider}`);
      const activeExists = chatTabs.some(t => t.id === savedActiveId);
      if (activeExists && savedActiveId) {
        setActiveTabId(savedActiveId);
        const activeTab = chatTabs.find(t => t.id === savedActiveId);
        if (activeTab) {
          setAnswerInput(activeTab.draft || '');
          setAttachment(activeTab.pendingAttachment || null);
        }
      } else {
        const firstTab = chatTabs[0];
        setActiveTabId(firstTab.id);
        if (firstTab) {
          setAnswerInput(firstTab.draft || '');
          setAttachment(firstTab.pendingAttachment || null);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!contextMenu) return;
    const handleOutsideClick = () => {
      setContextMenu(null);
    };
    window.addEventListener('click', handleOutsideClick);
    window.addEventListener('contextmenu', handleOutsideClick);
    return () => {
      window.removeEventListener('click', handleOutsideClick);
      window.removeEventListener('contextmenu', handleOutsideClick);
    };
  }, [contextMenu]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.center-search-answer-plus-btn') && !e.target.closest('.attachment-menu-popup')) {
        setIsAttachmentMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [isAttachmentMenuOpen]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const updateCooldown = () => {
      // eslint-disable-next-line react-hooks/purity
      if (geminiCooldownUntil <= Date.now()) {
        setCooldownSecondsLeft(0);
        return;
      }
      // eslint-disable-next-line react-hooks/purity
      setCooldownSecondsLeft(Math.ceil((geminiCooldownUntil - Date.now()) / 1000));
    };

    updateCooldown();
    const interval = setInterval(updateCooldown, 1000);
    return () => clearInterval(interval);
  }, [geminiCooldownUntil]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const timer = setTimeout(() => {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
    return () => clearTimeout(timer);
  }, [chatHistory, answerPanel.status, tabErrors]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!isCameraActive) return;
    
    let activeStream = null;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      .then(stream => {
        activeStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(err => {
        console.error("Camera access error:", err);
        setToastMessage("Failed to access camera.");
        setTimeout(() => setToastMessage(''), 4000);
        setIsCameraActive(false);
      });
      
    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isCameraActive]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (activeMenuMsgId === null) return;
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.chat-msg-menu-container')) {
        setActiveMenuMsgId(null);
      }
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [activeMenuMsgId]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const isTypingCommand = provider === 'stepfun' && answerInput.startsWith('@') && !answerInput.includes(' ');
  const commandQuery = isTypingCommand ? answerInput.slice(1).toLowerCase() : '';
  const filteredCommands = isTypingCommand
    ? COMMAND_OPTIONS.filter(cmd => cmd.name.slice(1).toLowerCase().startsWith(commandQuery))
    : [];
  const showCommandMenu = isTypingCommand && !isMenuDismissed;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!answerInput.startsWith('@')) {
      setIsMenuDismissed(false);
    }
    setSelectedCommandIndex(0);
  }, [answerInput]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!showCommandMenu) return;
    const handleOutsideClick = (e) => {
      if (commandMenuRef.current && !commandMenuRef.current.contains(e.target) && !e.target.closest('.center-search-answer-input')) {
        setIsMenuDismissed(true);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [showCommandMenu]);

  const handleSelectCommand = (cmdName) => {
    setAnswerInput(cmdName + ' ');
    setIsMenuDismissed(false);
    setTimeout(() => {
      chatInputRef.current?.focus();
    }, 5);
  };

  const handleInputKeyDown = (e) => {
    if (showCommandMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCommandIndex(prev => 
          filteredCommands.length > 0 ? (prev + 1) % filteredCommands.length : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCommandIndex(prev => 
          filteredCommands.length > 0 ? (prev - 1 + filteredCommands.length) % filteredCommands.length : 0
        );
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filteredCommands.length > 0 && selectedCommandIndex >= 0 && selectedCommandIndex < filteredCommands.length) {
          e.preventDefault();
          handleSelectCommand(filteredCommands[selectedCommandIndex].name);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsMenuDismissed(true);
      }
    }
  };

  const activeAnswerProvider = providerOptions.find((option) => option.id === provider) || providerOptions[1];
  const ActiveAnswerIcon = activeAnswerProvider.icon;

  const defaultPopupStyle = provider === 'stepfun'
    ? { top: '78px', right: '418px' }
    : provider === 'manus'
      ? { top: '78px', right: '818px' }
      : { top: '78px', right: '18px' };

  const mergedStyle = {
    ...defaultPopupStyle,
    ...drag.dragStyle,
    zIndex: frontProvider === provider ? 10001 : 10000,
  };

  const handlePopupMouseDown = () => {
    if (onFocus) {
      onFocus();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={answerPopupRef}
      style={mergedStyle}
      onMouseDown={handlePopupMouseDown}
      className={`center-search-answer-popup popup-aurora-surface ${isMinimized ? 'is-minimized' : ''} ${isMaximized ? 'is-maximized' : ''}`}
      data-provider={provider}
    >
      <div className="center-search-answer-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="center-search-answer-title">
            <ActiveAnswerIcon size={15} />
            <span>{activeAnswerProvider.label}</span>
          </div>
        </div>
        <div className="center-search-answer-actions">
          <button
            type="button"
            className="center-search-answer-action-btn popup-drag-btn"
            {...drag.dragProps}
          >
            ⠿
          </button>
          <button
            type="button"
            className="center-search-answer-action-btn"
            onClick={() => {
              setIsMinimized(!isMinimized);
              if (isMaximized) setIsMaximized(false);
            }}
            title={isMinimized ? 'Restore' : 'Minimize'}
          >
            <Minus size={13} />
          </button>
          <button
            type="button"
            className="center-search-answer-action-btn"
            onClick={() => {
              setIsMaximized(!isMaximized);
              if (isMinimized) setIsMinimized(false);
            }}
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            type="button"
            className="center-search-answer-action-btn"
            onClick={onClose}
            aria-label="Close answer popup"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="ai-chat-tabs-bar">
        <div className="ai-chat-tabs-list">
          {chatTabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const isRenaming = renamingTabId === tab.id;
            const isClosing = closingTabIds.includes(tab.id);
            
            return (
              <div
                key={tab.id}
                className={`ai-chat-tab ${isActive ? 'is-active' : ''} ${isClosing ? 'is-closing' : ''}`}
                onClick={() => handleSwitchTab(tab.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, tabId: tab.id });
                }}
              >
                <span className="ai-chat-tab-icon">
                  <TabProviderIcon provider={tab.provider} />
                </span>
                
                {isRenaming ? (
                  <input
                    type="text"
                    className="ai-chat-tab-rename-input"
                    value={renamingTitle}
                    onChange={(e) => setRenamingTitle(e.target.value)}
                    onBlur={() => handleRenameTab(tab.id, renamingTitle)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameTab(tab.id, renamingTitle);
                      if (e.key === 'Escape') setRenamingTabId(null);
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="ai-chat-tab-title"
                    title={tab.title}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setRenamingTabId(tab.id);
                      setRenamingTitle(tab.title || 'New Chat');
                    }}
                  >
                    {tab.title || 'New Chat'}
                  </span>
                )}
                
                <button
                  type="button"
                  className="ai-chat-tab-close"
                  onClick={(e) => handleCloseTab(e, tab.id)}
                  title="Close tab"
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>
        
        <button
          type="button"
          className="ai-chat-tab-add-btn"
          onClick={() => handleCreateNewTab(provider)}
          title="New chat tab"
        >
          <Plus size={12} />
        </button>
      </div>

      {contextMenu && (
        <div
          className="tab-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="tab-context-menu-item"
            onClick={() => {
              setRenamingTabId(contextMenu.tabId);
              const tab = chatTabs.find(t => t.id === contextMenu.tabId);
              setRenamingTitle(tab ? tab.title : 'New Chat');
              setContextMenu(null);
            }}
          >
            <Edit2 size={11} />
            <span>Rename tab</span>
          </div>
          <div
            className="tab-context-menu-item"
            onClick={() => {
              handleDuplicateTab(contextMenu.tabId);
              setContextMenu(null);
            }}
          >
            <Copy size={11} />
            <span>Duplicate tab</span>
          </div>
          <div
            className="tab-context-menu-item"
            onClick={(e) => {
              handleCloseTab(e, contextMenu.tabId);
              setContextMenu(null);
            }}
          >
            <X size={11} />
            <span>Close tab</span>
          </div>
          <div
            className="tab-context-menu-item"
            onClick={() => {
              handleCloseOtherTabs(contextMenu.tabId);
              setContextMenu(null);
            }}
          >
            <Layers size={11} />
            <span>Close other tabs</span>
          </div>
        </div>
      )}

      <div className="center-search-answer-body">
        <div className="chat-messages-container">
          {chatHistory.map((msg) => (
            <div key={msg.id} className={`chat-msg ${msg.sender === 'user' ? 'chat-msg-user' : 'chat-msg-ai'} ${msg.isError ? 'chat-msg-error' : ''}`}>
              <div className="chat-msg-wrapper">
                {msg.sender === 'ai' ? (
                  <div className="chat-msg-ai-wrapper-content">
                    {msg.id !== 'welcome' && (
                      <div className="chat-msg-ai-label">
                        <ActiveAnswerIcon size={12} />
                        <span>{activeAnswerProvider.label}</span>
                      </div>
                    )}
                    <div className="chat-msg-ai-text">
                      <MarkdownRenderer text={msg.text} />
                    </div>
                  </div>
                ) : (
                  <div className={`chat-msg-bubble ${editingMsgId === msg.id ? 'editing' : ''}`}>
                    <div className="chat-msg-user-content-wrapper">
                      <MessageAttachmentRenderer attachment={msg.attachment} />
                      {editingMsgId === msg.id ? (
                        <div className="chat-msg-edit-container">
                          <textarea
                            className="chat-msg-edit-textarea"
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            rows={2}
                            autoFocus
                          />
                          <div className="chat-msg-edit-controls">
                            <button
                              type="button"
                              className="chat-msg-edit-btn cancel"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelEdit();
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="chat-msg-edit-btn save"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleSaveEdit(msg.id, msg.attachment);
                              }}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        msg.text && <div className="chat-msg-user-text">{msg.text}</div>
                      )}
                    </div>
                  </div>
                )}
                {msg.sender === 'user' && editingMsgId !== msg.id && (
                  <div className="chat-msg-actions-row-icons user-actions" style={{ opacity: activeMenuMsgId === msg.id ? 1 : undefined }}>
                    <ActionCopyButton text={msg.text} />
                    
                    <button
                      type="button"
                      className="chat-msg-action-icon-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEditUserMessage(msg.id, msg.text);
                      }}
                      title="Edit message"
                    >
                      <Edit2 size={13} />
                    </button>

                    <button
                      type="button"
                      className="chat-msg-action-icon-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteUserMessage(msg.id);
                      }}
                      title="Delete message"
                    >
                      <X size={13} />
                    </button>

                    <div className="chat-msg-menu-container">
                      <button
                        type="button"
                        className={`chat-msg-action-icon-btn ${activeMenuMsgId === msg.id ? 'is-active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuMsgId(activeMenuMsgId === msg.id ? null : msg.id);
                        }}
                        title="More options"
                      >
                        <MoreHorizontal size={13} />
                      </button>
                      {activeMenuMsgId === msg.id && (
                        <div className="chat-msg-floating-menu">
                          <button
                            type="button"
                            className="chat-msg-menu-item"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEditUserMessage(msg.id, msg.text);
                              setActiveMenuMsgId(null);
                            }}
                          >
                            <Edit2 size={14} />
                            <span>Edit message</span>
                          </button>
                          <button
                            type="button"
                            className="chat-msg-menu-item"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteUserMessage(msg.id);
                              setActiveMenuMsgId(null);
                            }}
                          >
                            <X size={14} />
                            <span>Delete message</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {msg.sender === 'ai' && msg.id !== 'welcome' && (
                  <>
                    <div className="chat-msg-actions-row-icons">
                      <ActionCopyButton text={cleanAiMessageText(msg.text)} />
                      
                      <button
                        type="button"
                        className={`chat-msg-action-icon-btn ${msg.feedback === 'like' ? 'is-active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLikeMessage(msg.id);
                        }}
                        title="Like response"
                      >
                        <ThumbsUp size={13} fill={msg.feedback === 'like' ? 'currentColor' : 'none'} />
                      </button>

                      <button
                        type="button"
                        className={`chat-msg-action-icon-btn ${msg.feedback === 'dislike' ? 'is-active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDislikeMessage(msg.id);
                        }}
                        title="Dislike response"
                      >
                        <ThumbsDown size={13} fill={msg.feedback === 'dislike' ? 'currentColor' : 'none'} />
                      </button>

                      <button
                        type="button"
                        className="chat-msg-action-icon-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBranchChat(msg);
                        }}
                        title="Branch in new chat"
                      >
                        <FolderPlus size={13} />
                      </button>

                      <button
                        type="button"
                        className="chat-msg-action-icon-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRegenerate(msg.id);
                        }}
                        disabled={answerPanel.status === 'loading'}
                        title="Regenerate response"
                      >
                        <RotateCw size={13} />
                      </button>

                      <div className="chat-msg-menu-container">
                        <button
                          type="button"
                          className={`chat-msg-action-icon-btn ${activeMenuMsgId === msg.id ? 'is-active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuMsgId(activeMenuMsgId === msg.id ? null : msg.id);
                          }}
                          title="More options"
                        >
                          <MoreHorizontal size={13} />
                        </button>
                        {activeMenuMsgId === msg.id && (
                          <div className="chat-msg-floating-menu">
                            <div className="chat-msg-menu-header">
                              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, Today
                            </div>
                            <button
                              type="button"
                              className="chat-msg-menu-item"
                              disabled={extractSourcesFromText(msg.text).length === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewSources(msg.id);
                                setActiveMenuMsgId(null);
                              }}
                            >
                              <BookOpen size={14} />
                              <span>View sources</span>
                            </button>
                            <button
                              type="button"
                              className="chat-msg-menu-item"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleBranchChat(msg);
                                setActiveMenuMsgId(null);
                              }}
                            >
                              <GitBranch size={14} />
                              <span>Branch in new chat</span>
                            </button>
                            <button
                              type="button"
                              className="chat-msg-menu-item"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReadAloud(msg);
                                setActiveMenuMsgId(null);
                              }}
                            >
                              {speakingMsgId === msg.id ? <VolumeX size={14} /> : <Volume2 size={14} />}
                              <span>{speakingMsgId === msg.id ? 'Stop reading' : 'Read aloud'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {activeSourcesMsgId === msg.id && (
                      <div className="chat-msg-sources-container">
                        <div className="chat-msg-sources-header">
                          <span>Sourced Links</span>
                          <button
                            type="button"
                            className="chat-msg-sources-close"
                            onClick={() => setActiveSourcesMsgId(null)}
                          >
                            <X size={10} />
                          </button>
                        </div>
                        <div className="chat-msg-sources-list">
                          {extractSourcesFromText(msg.text).map((source, sIdx) => (
                            <div
                              key={sIdx}
                              className="chat-msg-source-card"
                              onClick={() => openSourceUrl(source.url)}
                              title={source.url}
                            >
                              <span className="chat-msg-source-card-icon">🔗</span>
                              <div className="chat-msg-source-card-info">
                                <span className="chat-msg-source-card-title">{source.title || 'Source'}</span>
                                <span className="chat-msg-source-card-url">{source.url}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          {answerPanel.status === 'loading' && (
            <div className="chat-msg chat-msg-ai">
              <div className="chat-msg-wrapper">
                <div className="typing-indicator">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              </div>
            </div>
          )}

          {tabErrors[activeTabId] && (
            <div className="chat-msg chat-msg-error-transient">
              <div className="chat-msg-wrapper">
                <div className="chat-msg-error-layout">
                  <span className="chat-msg-error-icon">⚠️</span>
                  <span className="chat-msg-error-text">
                    {tabErrors[activeTabId] === 'unauthorized' ? 'API Key is unauthorized (403).' :
                     tabErrors[activeTabId] === 'invalid key' ? 'API Key is invalid (401).' :
                     tabErrors[activeTabId] === 'invalid model' ? 'Model is invalid (404).' :
                     tabErrors[activeTabId] === 'timeout' ? 'Request timed out.' :
                     `Error: ${tabErrors[activeTabId]}`}
                  </span>
                  <button
                    type="button"
                    className="chat-msg-error-retry-btn"
                    onClick={handleRetryLastPrompt}
                    title="Retry last query"
                  >
                    <RotateCw size={10} />
                    <span>Retry</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>
      </div>

      {provider === 'gemini' && cooldownSecondsLeft > 0 && (
        <div 
          className="gemini-quota-card"
          style={{
            margin: '8px 12px',
            padding: '10px 12px',
            border: '1px solid #f87171',
            borderRadius: '6px',
            background: 'rgba(239, 68, 68, 0.15)',
            color: '#fca5a5',
            fontSize: '11px',
            lineHeight: '1.4',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#f87171' }}>
            Gemini limit reached
          </div>
          <div>Model: gemini-2.5-flash</div>
          <div>Free requests limit: 20</div>
          <div>Retry available in: {cooldownSecondsLeft}s</div>
          <div style={{ marginTop: '6px' }}>
            <button
              type="button"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '4px',
                color: 'white',
                padding: '3px 6px',
                cursor: 'pointer',
                fontSize: '10px',
              }}
              onClick={() => {
                if (onSwitchToStepFun) {
                  onSwitchToStepFun();
                }
              }}
            >
              Use StepFun AI instead
            </button>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="chat-popup-toast">
          {toastMessage}
        </div>
      )}

      {attachment && (
        <div className="attachment-preview-container">
          <div className="attachment-preview-item">
            <span className="attachment-preview-icon">
              {attachment.type === 'image' && <Image size={12} />}
              {attachment.type === 'video' && <Video size={12} />}
              {attachment.type === 'file' && <FileText size={12} />}
              {attachment.type === 'camera' && <Camera size={12} />}
              {attachment.type === 'link' && <Link size={12} />}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: '2px' }}>
              <span className="attachment-preview-name" title={attachment.name}>
                {attachment.name}
              </span>
              {attachment.progress !== null && (
                <div className="attachment-upload-progress-container">
                  <div className="attachment-upload-progress-bar" style={{ width: `${attachment.progress}%` }} />
                  <span className="attachment-upload-progress-text">{attachment.progress}%</span>
                </div>
              )}
            </div>
            <button
              type="button"
              className="attachment-preview-remove"
              onClick={() => setAttachment(null)}
              title="Remove attachment"
            >
              <X size={10} />
            </button>
          </div>
        </div>
      )}

    <div style={{ position: 'relative', width: '100%' }}>
      {showCommandMenu && (
        <div ref={commandMenuRef} className="chat-msg-command-menu popup-aurora-surface">
          {filteredCommands.length > 0 ? (
            filteredCommands.map((cmd, idx) => {
              const CmdIcon = cmd.icon;
              return (
                <div
                  key={cmd.name}
                  className={`chat-msg-command-item ${idx === selectedCommandIndex ? 'is-selected' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectCommand(cmd.name);
                  }}
                >
                  <CmdIcon size={14} className="chat-msg-command-item-icon" />
                  <div className="chat-msg-command-item-info">
                    <span className="chat-msg-command-item-name">{cmd.name}</span>
                    <span className="chat-msg-command-item-desc">{cmd.desc}</span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="chat-msg-command-empty">No command found</div>
          )}
        </div>
      )}

      <form
        className="center-search-answer-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submitAiPrompt(provider, answerInput);
        }}
      >
        <div className="plus-button-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <button
            type="button"
            className="center-search-answer-plus-btn"
            onClick={() => setIsAttachmentMenuOpen(!isAttachmentMenuOpen)}
            title="Add attachment"
          >
            <Plus size={15} />
          </button>
          {isAttachmentMenuOpen && (
            <div className="attachment-menu-popup popup-aurora-surface">
              <button type="button" className="attachment-menu-item" onClick={openOpenRouterPopup}>
                <Bot size={13} style={{ opacity: 0.8, color: '#22c55e' }} />
                <span>OpenRouter</span>
              </button>
              <button type="button" className="attachment-menu-item" onClick={() => handleTriggerUpload('image')}>
                <Image size={13} style={{ opacity: 0.8 }} />
                <span>Photo</span>
              </button>
              <button type="button" className="attachment-menu-item" onClick={() => handleTriggerUpload('video')}>
                <Video size={13} style={{ opacity: 0.8 }} />
                <span>Video</span>
              </button>
              <button type="button" className="attachment-menu-item" onClick={() => handleTriggerUpload('file')}>
                <FileText size={13} style={{ opacity: 0.8 }} />
                <span>File</span>
              </button>
              <button type="button" className="attachment-menu-item" onClick={() => handleTriggerUpload('camera')}>
                <Camera size={13} style={{ opacity: 0.8 }} />
                <span>Camera</span>
              </button>
              <button type="button" className="attachment-menu-item" onClick={() => handleTriggerUpload('link')}>
                <Link size={13} style={{ opacity: 0.8 }} />
                <span>Link</span>
              </button>
            </div>
          )}
        </div>

        <input
          type="text"
          ref={chatInputRef}
          className="center-search-answer-input"
          value={answerInput}
          onChange={(event) => setAnswerInput(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={`Ask ${activeAnswerProvider.label}...`}
          disabled={
            answerPanel.status === 'loading' ||
            (provider === 'gemini' && cooldownSecondsLeft > 0)
          }
        />
        <button
          type="submit"
          className="center-search-answer-send"
          disabled={
            (!answerInput.trim() && !attachment) || 
            (attachment && attachment.progress !== null) ||
            answerPanel.status === 'loading' || 
            (provider === 'gemini' && cooldownSecondsLeft > 0)
          }
        >
          {provider === 'gemini' && cooldownSecondsLeft > 0
            ? `Wait ${cooldownSecondsLeft}s`
            : 'Send'}
        </button>
      </form>
    </div>

      <input
        type="file"
        ref={attachmentFileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {isCameraActive && (
        <div className="camera-modal-overlay">
          <div className="camera-modal-content popup-aurora-surface">
            <div className="camera-modal-header">
              <span>Webcam Capture</span>
              <button type="button" className="camera-modal-close" onClick={() => setIsCameraActive(false)}>
                <X size={14} />
              </button>
            </div>
            <div className="camera-video-container">
              <video ref={videoRef} autoPlay playsInline className="camera-video-element" />
            </div>
            <div className="camera-modal-actions">
              <button type="button" className="camera-modal-btn camera-capture-btn" onClick={handleCapturePhoto}>
                <Camera size={12} />
                <span>Capture Photo</span>
              </button>
              <button type="button" className="camera-modal-btn camera-cancel-btn" onClick={() => setIsCameraActive(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isLinkInputActive && (
        <div className="link-modal-overlay" onClick={() => setIsLinkInputActive(false)}>
          <form 
            className="link-modal-content popup-aurora-surface" 
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmitLink}
          >
            <div className="link-modal-header">
              <span>Add Link Attachment</span>
              <button type="button" className="link-modal-close" onClick={() => setIsLinkInputActive(false)}>
                <X size={14} />
              </button>
            </div>
            <div className="link-modal-body">
              <div className="link-modal-input-wrap">
                <label>Link URL</label>
                <input 
                  type="text" 
                  value={linkUrlInput} 
                  onChange={(e) => setLinkUrlInput(e.target.value)} 
                  placeholder="https://example.com"
                  autoFocus
                  required
                />
              </div>
              <div className="link-modal-input-wrap">
                <label>Link Title (Optional)</label>
                <input 
                  type="text" 
                  value={linkTitleInput} 
                  onChange={(e) => setLinkTitleInput(e.target.value)} 
                  placeholder="e.g. Documentation, Video, Website"
                />
              </div>
            </div>
            <div className="link-modal-actions">
              <button type="submit" className="link-modal-btn link-submit-btn">
                Add Link
              </button>
              <button type="button" className="link-modal-btn link-cancel-btn" onClick={() => setIsLinkInputActive(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>,
    document.body
  );
};

export default CenterSearch;
