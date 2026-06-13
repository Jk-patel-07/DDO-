import { useEffect, useRef, useState, memo, useCallback, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Bot, LogOut, Mic, Plus, Search, Sparkles, X, Minus, Maximize2, Minimize2, RotateCw,
  Copy, Check, ThumbsUp, ThumbsDown, FolderPlus, MoreHorizontal, BookOpen, GitBranch, Volume2, VolumeX,
  Image, Video, FileText, Camera, Link, Edit2, Layers,
  Sidebar, Pin, PinOff, Trash2
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

const MarkdownRenderer = memo(({ text }) => {
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
                showLineNumbers={true}
                wrapLines={true}
                customStyle={{
                  margin: 0,
                  background: 'transparent',
                  padding: '16px 16px 16px 0',
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
});
MarkdownRenderer.displayName = 'MarkdownRenderer';

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

const AI_PROVIDER_IDS = new Set(['gemini', 'stepfun', 'manus', 'meta']);

const providerOptions = [
  { id: 'google', label: 'Google', icon: Search, placeholder: 'Search Google' },
  { id: 'gemini', label: 'Gemini', icon: Sparkles, placeholder: 'Ask Gemini' },
  { id: 'stepfun', label: 'StepFun AI', icon: Bot, placeholder: 'Ask StepFun AI...' },
  { id: 'manus', label: 'Manus AI', icon: Bot, placeholder: 'Ask Manus AI...' },
  { id: 'meta', label: 'Meta AI', icon: Sparkles, placeholder: 'Ask Meta AI...' },
];

const searchProviderOptions = providerOptions;

const getProviderDisplayName = (provider) => {
  if (!provider) return 'Gemini';
  const p = provider.toLowerCase();
  if (p === 'gemini') return 'Gemini';
  if (p === 'stepfun') return 'StepFun AI';
  if (p === 'manus') return 'Manus AI';
  if (p === 'meta') return 'Meta AI';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
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
const TabProviderIcon = ({ provider, size = 12 }) => {
  if (provider === 'gemini') {
    return <Sparkles size={size} style={{ color: '#a78bfa' }} />;
  }
  if (provider === 'meta') {
    return <Sparkles size={size} style={{ color: '#c084fc' }} />;
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
          onClick={() => openSourceUrl(url)}
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
  const triggerRef = useRef(null);
  const providerTriggerRef = useRef(null);
  const accountTriggerRef = useRef(null);
  const accountPopupRef = useRef(null);
  const searchDrag = useDraggablePopup('search');
  const googleTokenClientRef = useRef(null);
  const isSearchSubmittingRef = useRef(false);
  const uploadIntervalsRef = useRef([]);

  const [activePopup, setActivePopup] = useState(null);
  const [popupStyle, setPopupStyle] = useState({ display: 'none' });
  const [query, setQuery] = useState('');
  const [googleAccount, setGoogleAccount] = useState(() => readStoredGoogleAccount());
  const [googleAuthError, setGoogleAuthError] = useState('');
  const [searchHistory, setSearchHistory] = useState(() => readStoredSearchHistory());
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [accountPopupPosition, setAccountPopupPosition] = useState({ top: 0, right: 0 });
  const [isProviderMenuOpen, setIsProviderMenuOpen] = useState(false);
  const [providerMenuPosition, setProviderMenuPosition] = useState({ top: 0, left: 0 });
  const [searchProvider, setSearchProvider] = useState(() => readStoredSearchProvider());

  useEffect(() => {
    return () => {
      uploadIntervalsRef.current.forEach(id => clearInterval(id));
      uploadIntervalsRef.current = [];
    };
  }, []);

  const updatePopupPosition = useCallback(() => {
    const triggerEl = triggerRef.current;
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const popupWidth = Math.min(380, window.innerWidth - 24);
    let left = rect.right - popupWidth;
    if (left < 12) {
      left = 12;
    }
    if (left + popupWidth > window.innerWidth - 12) {
      left = window.innerWidth - 12 - popupWidth;
    }
    const top = rect.bottom + 8;
    setPopupStyle({
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: `${popupWidth}px`,
      zIndex: 9999,
    });
  }, []);

  useLayoutEffect(() => {
    if (activePopup === 'search') {
      updatePopupPosition();
      window.addEventListener('resize', updatePopupPosition);
      window.addEventListener('scroll', updatePopupPosition, true);
      return () => {
        window.removeEventListener('resize', updatePopupPosition);
        window.removeEventListener('scroll', updatePopupPosition, true);
      };
    }
  }, [activePopup, updatePopupPosition]);

  // Independent open/close states
  const [isGeminiOpen, setIsGeminiOpen] = useState(false);
  const [isStepFunOpen, setIsStepFunOpen] = useState(false);
  const [isManusOpen, setIsManusOpen] = useState(false);
  const [isMetaOpen, setIsMetaOpen] = useState(false);

  // Independent pending prompt states
  const [geminiPendingPrompt, setGeminiPendingPrompt] = useState(null);
  const [stepfunPendingPrompt, setStepfunPendingPrompt] = useState(null);
  const [manusPendingPrompt, setManusPendingPrompt] = useState(null);
  const [metaPendingPrompt, setMetaPendingPrompt] = useState(null);

  // Lifted Combined AI chat history state
  const [historyChats, setHistoryChats] = useState(() => {
    try {
      const saved = localStorage.getItem('ddo_combined_chat_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('ddo_combined_chat_history', JSON.stringify(historyChats));
    } catch (e) {
      console.error("Failed to save combined history:", e);
    }
  }, [historyChats]);

  // Coordinate reopening tabs across different AI popups
  const [pendingReopenChat, setPendingReopenChat] = useState(null);

  const handleClearPendingReopenChat = useCallback(() => {
    setPendingReopenChat(null);
  }, []);

  const handleReopenChatFromPopup = useCallback((providerId, chatId) => {
    if (providerId === 'gemini') {
      setIsGeminiOpen(true);
      setFrontProvider('gemini');
    } else if (providerId === 'stepfun') {
      setIsStepFunOpen(true);
      setFrontProvider('stepfun');
    } else if (providerId === 'manus') {
      setIsManusOpen(true);
      setFrontProvider('manus');
    } else if (providerId === 'meta') {
      setIsMetaOpen(true);
      setFrontProvider('meta');
    }
    setPendingReopenChat({ providerId, chatId });
  }, []);

  // Focus z-index state
  const [frontProvider, setFrontProvider] = useState('gemini');

  const sortedMainHistory = useMemo(() => {
    const aiChats = historyChats || [];
    const googleItems = searchHistory.map((item, index) => ({
      id: `google_${item}`,
      title: item,
      provider: 'google',
      providerDisplayName: 'Google',
      updatedAt: Date.now() - (index + 1) * 1000,
      pinned: false
    }));

    const combined = [
      ...aiChats,
      ...googleItems
    ];

    return combined.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }, [historyChats, searchHistory]);

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
      const clickedSearchPopup = searchDrag.popupRef.current?.contains(event.target);
      const clickedSearchTrigger = triggerRef.current?.contains(event.target);
      
      const clickedGeminiPopup = document.querySelector('.center-search-answer-popup[data-provider="gemini"]')?.contains(event.target);
      const clickedStepFunPopup = document.querySelector('.center-search-answer-popup[data-provider="stepfun"]')?.contains(event.target);
      const clickedManusPopup = document.querySelector('.center-search-answer-popup[data-provider="manus"]')?.contains(event.target);

      if (clickedAccountTrigger || clickedAccountPopup || clickedProviderTrigger || clickedProviderMenu || 
          clickedSearchPopup || clickedSearchTrigger ||
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

  const isAnyPopupOpen = activePopup !== null || isGeminiOpen || isStepFunOpen || isManusOpen || isMetaOpen;
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
    } else if (searchProvider === 'meta') {
      setIsMetaOpen(true);
      setFrontProvider('meta');
      setMetaPendingPrompt({ text: trimmedQuery, timestamp: Date.now() });
      setQuery('');
      return;
    }

    saveSearchToHistory(trimmedQuery);
    openSourceUrl(`https://www.google.com/search?q=${encodeURIComponent(trimmedQuery)}`);
  };

  const handleSearchSubmit = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (isSearchSubmittingRef.current) {
      return;
    }
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return;
    }

    isSearchSubmittingRef.current = true;
    void submitQuery();

    setTimeout(() => {
      isSearchSubmittingRef.current = false;
    }, 500);
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
    } else if (providerId === 'meta') {
      setIsMetaOpen(true);
      setFrontProvider('meta');
      if (query.trim()) {
        setMetaPendingPrompt({ text: query, timestamp: Date.now() });
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

  const searchPopup = activePopup === 'search'
    ? createPortal(
        <div
          ref={searchDrag.popupRef}
          className="search-popup center-search-popup"
          style={popupStyle}
        >
          <form
            className={`center-search-bar ${activePopup === 'search' ? 'is-open' : ''}`}
            onSubmit={handleSearchSubmit}
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearchSubmit(e);
                  }
                }}
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

              <button type="submit" className="center-search-voice-orb" aria-label="Submit search">
                <span />
                <span />
                <span />
              </button>
            </div>
          </form>

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

            {sortedMainHistory.length ? (
              <div className="center-search-history-list">
                {sortedMainHistory.map((item) => (
                  <div key={item.id} className="center-search-history-row">
                    <button
                      type="button"
                      className="center-search-history-fill"
                      onClick={() => {
                        if (item.provider === 'google') {
                          handleHistoryItemSelect(item.title);
                        } else {
                          handleReopenChatFromPopup(item.provider, item.id);
                        }
                      }}
                    >
                      <Search size={13} />
                      <span>{item.title || 'New Chat'}</span>
                    </button>

                    <div className="center-search-history-right-panel" onClick={(e) => e.stopPropagation()}>
                      <span className={`ai-chat-history-item-provider prov-${(item.provider || 'gemini').toLowerCase()}`}>
                        {item.providerDisplayName || getProviderDisplayName(item.provider)}
                      </span>
                      <button
                        type="button"
                        className="center-search-history-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.provider === 'google') {
                            handleHistoryItemDelete(item.title);
                          } else {
                            setHistoryChats(prev => prev.filter(t => t.id !== item.id));
                          }
                        }}
                        aria-label={`Delete ${item.title}`}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="center-search-history-empty">
                Your recent searches and chats will appear here.
              </div>
            )}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div ref={wrapperRef} className="center-search-shell">
      <button
        type="button"
        ref={triggerRef}
        className={`flex-center center-search-trigger ${activePopup === 'search' ? 'is-open' : ''}`}
        onClick={() => setActivePopup((current) => (current === 'search' ? null : 'search'))}
        aria-label="Open search"
      >
        <Search size={14} />
      </button>

      {searchPopup}
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
        historyChats={historyChats}
        setHistoryChats={setHistoryChats}
        pendingReopenChat={pendingReopenChat}
        onClearPendingReopenChat={handleClearPendingReopenChat}
        onReopenChat={handleReopenChatFromPopup}
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
        historyChats={historyChats}
        setHistoryChats={setHistoryChats}
        pendingReopenChat={pendingReopenChat}
        onClearPendingReopenChat={handleClearPendingReopenChat}
        onReopenChat={handleReopenChatFromPopup}
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
        historyChats={historyChats}
        setHistoryChats={setHistoryChats}
        pendingReopenChat={pendingReopenChat}
        onClearPendingReopenChat={handleClearPendingReopenChat}
        onReopenChat={handleReopenChatFromPopup}
      />
      <AiChatPopup
        provider="meta"
        isOpen={isMetaOpen}
        onClose={() => setIsMetaOpen(false)}
        frontProvider={frontProvider}
        onFocus={() => setFrontProvider('meta')}
        onSaveSearchToHistory={saveSearchToHistory}
        pendingPrompt={metaPendingPrompt}
        onClearPendingPrompt={() => setMetaPendingPrompt(null)}
        historyChats={historyChats}
        setHistoryChats={setHistoryChats}
        pendingReopenChat={pendingReopenChat}
        onClearPendingReopenChat={handleClearPendingReopenChat}
        onReopenChat={handleReopenChatFromPopup}
      />
    </div>
  );
};

/* ==========================================================================
   Independent AI Chat Popup Component
   ========================================================================== */
const getWelcomeMessage = (prov) => {
  const label = getProviderDisplayName(prov);
  return {
    id: 'welcome',
    sender: 'ai',
    text: `Hello! I am your ${label} Assistant. How can I help you today?`
  };
};

const PinnedMessagesSection = ({ messages, onTogglePin, onScrollToMessage }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const pinned = messages.filter(m => m.pinned);
  
  if (pinned.length === 0) return null;

  return (
    <div className="ai-chat-pinned-messages-panel">
      <div 
        className="ai-chat-pinned-header" 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#fcd34d', padding: '2px 4px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}>
          <Pin size={12} fill="#fcd34d" />
          <span>Pinned Messages ({pinned.length})</span>
        </div>
        <span style={{ fontSize: '10px', opacity: 0.6 }}>{isExpanded ? 'Hide' : 'Show'}</span>
      </div>
      
      {isExpanded && (
        <div className="ai-chat-pinned-list" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '120px', overflowY: 'auto', paddingRight: '4px' }}>
          {pinned.map(m => (
            <div 
              key={m.id} 
              className="ai-chat-pinned-item"
              onClick={() => onScrollToMessage(m.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 8px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                cursor: 'pointer',
                transition: 'background 0.2s, border-color 0.2s'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, marginRight: '8px' }}>
                <span style={{ fontSize: '9px', fontWeight: 'bold', color: m.sender === 'user' ? '#38bdf8' : '#a78bfa', textTransform: 'capitalize', marginBottom: '2px' }}>
                  {m.sender === 'user' ? 'You' : 'AI'}
                </span>
                <span style={{ fontSize: '10.5px', opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.text}
                </span>
              </div>
              <button
                type="button"
                className="ai-chat-pinned-unpin-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePin(m.id);
                }}
                style={{ background: 'transparent', border: 0, color: 'rgba(255, 255, 255, 0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
                title="Unpin message"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

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


/* ==========================================================================
   Helper Subcomponents for Performance Optimization
   ========================================================================== */

const MessageEditContainer = ({ initialText, onSave, onCancel }) => {
  const [text, setText] = useState(initialText);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSave(text);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="chat-msg-edit-container">
      <textarea
        className="chat-msg-edit-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={3}
        autoFocus
      />
      <div className="chat-msg-edit-controls">
        <button
          type="button"
          className="chat-msg-edit-btn cancel"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          className="chat-msg-edit-btn save"
          onClick={(e) => {
            e.stopPropagation();
            onSave(text);
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
};

const MessageItem = memo(({
  msg,
  provider,
  activeMenuMsgId,
  onToggleMenu,
  activeSourcesMsgId,
  onToggleSources,
  speakingMsgId,
  onReadAloud,
  editingMsgId,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onLike,
  onDislike,
  onBranch,
  onRegenerate,
  onViewSources,
  isLoading,
  extractSourcesFromText,
  openSourceUrl,
  onTogglePin
}) => {
  const isEditing = editingMsgId === msg.id;
  const isSpeaking = speakingMsgId === msg.id;
  const isMenuOpen = activeMenuMsgId === msg.id;
  const isSourcesOpen = activeSourcesMsgId === msg.id;

  const activeAnswerProvider = providerOptions.find((option) => option.id === provider) || providerOptions[1];
  const ActiveAnswerIcon = activeAnswerProvider.icon;

  return (
    <div id={`chat-msg-${msg.id}`} className={`chat-msg ${msg.sender === 'user' ? 'chat-msg-user' : 'chat-msg-ai'} ${msg.isError ? 'chat-msg-error' : ''} ${msg.pinned ? 'chat-msg-pinned' : ''}`}>
      <div className="chat-msg-wrapper">
        {msg.sender === 'ai' ? (
          <div className="chat-msg-ai-wrapper-content">
            {msg.id !== 'welcome' && (
              <div className="chat-msg-ai-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ActiveAnswerIcon size={12} />
                  <span>{activeAnswerProvider.label}</span>
                </div>
                {msg.pinned && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#fcd34d', fontSize: '9px', fontWeight: 'bold' }}>
                    <Pin size={9} fill="#fcd34d" />
                    <span>PINNED</span>
                  </div>
                )}
              </div>
            )}
            <div className="chat-msg-ai-text">
              <MarkdownRenderer text={msg.text} />
            </div>
          </div>
        ) : (
          <div className={`chat-msg-bubble ${isEditing ? 'editing' : ''}`}>
            <div className="chat-msg-user-content-wrapper">
              {msg.pinned && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#fcd34d', fontSize: '9px', marginBottom: '4px', fontWeight: 'bold' }}>
                  <Pin size={9} fill="#fcd34d" />
                  <span>PINNED MESSAGE</span>
                </div>
              )}
              <MessageAttachmentRenderer attachment={msg.attachment} />
              {isEditing ? (
                <MessageEditContainer
                  initialText={msg.text}
                  onSave={(text) => onSaveEdit(msg.id, text, msg.attachment)}
                  onCancel={onCancelEdit}
                />
              ) : (
                msg.text && <div className="chat-msg-user-text">{msg.text}</div>
              )}
            </div>
          </div>
        )}

        {msg.sender === 'user' && !isEditing && (
          <div className="chat-msg-actions-row-icons user-actions" style={{ opacity: isMenuOpen ? 1 : undefined }}>
            <ActionCopyButton text={msg.text} />
            
            <button
              type="button"
              className="chat-msg-action-icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                onStartEdit(msg.id, msg.text);
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
                onDelete(msg.id);
              }}
              title="Delete message"
            >
              <X size={13} />
            </button>

            <div className="chat-msg-menu-container">
              <button
                type="button"
                className={`chat-msg-action-icon-btn ${isMenuOpen ? 'is-active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleMenu(isMenuOpen ? null : msg.id);
                }}
                title="More options"
              >
                <MoreHorizontal size={13} />
              </button>
              {isMenuOpen && (
                <div className="chat-msg-floating-menu">
                  <button
                    type="button"
                    className="chat-msg-menu-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartEdit(msg.id, msg.text);
                      onToggleMenu(null);
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
                      onTogglePin(msg.id);
                      onToggleMenu(null);
                    }}
                  >
                    <Pin size={14} />
                    <span>{msg.pinned ? 'Unpin message' : 'Pin message'}</span>
                  </button>
                  <button
                    type="button"
                    className="chat-msg-menu-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(msg.id);
                      onToggleMenu(null);
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
                  onLike(msg.id);
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
                  onDislike(msg.id);
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
                  onBranch(msg);
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
                  onRegenerate(msg.id);
                }}
                disabled={isLoading}
                title="Regenerate response"
              >
                <RotateCw size={13} />
              </button>

              <div className="chat-msg-menu-container">
                <button
                  type="button"
                  className={`chat-msg-action-icon-btn ${isMenuOpen ? 'is-active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleMenu(isMenuOpen ? null : msg.id);
                  }}
                  title="More options"
                >
                  <MoreHorizontal size={13} />
                </button>
                {isMenuOpen && (
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
                        onViewSources(msg.id);
                        onToggleMenu(null);
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
                        onTogglePin(msg.id);
                        onToggleMenu(null);
                      }}
                    >
                      <Pin size={14} />
                      <span>{msg.pinned ? 'Unpin message' : 'Pin message'}</span>
                    </button>
                    <button
                      type="button"
                      className="chat-msg-menu-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        onBranch(msg);
                        onToggleMenu(null);
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
                        onReadAloud(msg);
                        onToggleMenu(null);
                      }}
                    >
                      {isSpeaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
                      <span>{isSpeaking ? 'Stop reading' : 'Read aloud'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {isSourcesOpen && (
              <div className="chat-msg-sources-container">
                <div className="chat-msg-sources-header">
                  <span>Sourced Links</span>
                  <button
                    type="button"
                    className="chat-msg-sources-close"
                    onClick={() => onViewSources(null)}
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
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.msg === nextProps.msg &&
    prevProps.provider === nextProps.provider &&
    prevProps.activeMenuMsgId === nextProps.activeMenuMsgId &&
    prevProps.activeSourcesMsgId === nextProps.activeSourcesMsgId &&
    prevProps.speakingMsgId === nextProps.speakingMsgId &&
    prevProps.editingMsgId === nextProps.editingMsgId &&
    prevProps.isLoading === nextProps.isLoading
  );
});
MessageItem.displayName = 'MessageItem';

const MessageList = memo(({
  chatHistory,
  provider,
  activeMenuMsgId,
  onToggleMenu,
  activeSourcesMsgId,
  onToggleSources,
  speakingMsgId,
  onReadAloud,
  editingMsgId,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onLike,
  onDislike,
  onBranch,
  onRegenerate,
  onViewSources,
  isLoading,
  extractSourcesFromText,
  openSourceUrl,
  chatBottomRef,
  tabErrorText,
  onRetryLastPrompt,
  onTogglePin
}) => {
  return (
    <div className="chat-messages-container">
      {chatHistory.map((msg) => (
        <MessageItem
          key={msg.id}
          msg={msg}
          provider={provider}
          activeMenuMsgId={activeMenuMsgId}
          onToggleMenu={onToggleMenu}
          activeSourcesMsgId={activeSourcesMsgId}
          onToggleSources={onToggleSources}
          speakingMsgId={speakingMsgId}
          onReadAloud={onReadAloud}
          editingMsgId={editingMsgId}
          onStartEdit={onStartEdit}
          onCancelEdit={onCancelEdit}
          onSaveEdit={onSaveEdit}
          onDelete={onDelete}
          onLike={onLike}
          onDislike={onDislike}
          onBranch={onBranch}
          onRegenerate={onRegenerate}
          onViewSources={onViewSources}
          isLoading={isLoading}
          extractSourcesFromText={extractSourcesFromText}
          openSourceUrl={openSourceUrl}
          onTogglePin={onTogglePin}
        />
      ))}
      {isLoading && (
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

      {tabErrorText && (
        <div className="chat-msg chat-msg-error-transient">
          <div className="chat-msg-wrapper">
            <div className="chat-msg-error-layout">
              <span className="chat-msg-error-icon">⚠️</span>
              <span className="chat-msg-error-text">
                {tabErrorText === 'unauthorized' ? 'API Key is unauthorized (403).' :
                 tabErrorText === 'invalid key' ? 'API Key is invalid (401).' :
                 tabErrorText === 'invalid model' ? 'Model is invalid (404).' :
                 tabErrorText === 'timeout' ? 'Request timed out.' :
                 `Error: ${tabErrorText}`}
              </span>
              <button
                type="button"
                className="chat-msg-error-retry-btn"
                onClick={onRetryLastPrompt}
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
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.chatHistory === nextProps.chatHistory &&
    prevProps.provider === nextProps.provider &&
    prevProps.activeMenuMsgId === nextProps.activeMenuMsgId &&
    prevProps.activeSourcesMsgId === nextProps.activeSourcesMsgId &&
    prevProps.speakingMsgId === nextProps.speakingMsgId &&
    prevProps.editingMsgId === nextProps.editingMsgId &&
    prevProps.isLoading === nextProps.isLoading &&
    prevProps.tabErrorText === nextProps.tabErrorText
  );
});
MessageList.displayName = 'MessageList';

const ChatTabsBar = memo(({
  chatTabs,
  activeTabId,
  renamingTabId,
  renamingTitle,
  closingTabIds,
  onSwitchTab,
  onContextMenu,
  onRenameTab,
  onCloseTab,
  onCreateNewTab,
  setRenamingTabId,
  setRenamingTitle,
  provider
}) => {
  return (
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
              onClick={() => onSwitchTab(tab.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                onContextMenu({ x: e.clientX, y: e.clientY, tabId: tab.id });
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
                  onBlur={() => onRenameTab(tab.id, renamingTitle)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onRenameTab(tab.id, renamingTitle);
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
                onClick={(e) => onCloseTab(e, tab.id)}
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
        onClick={() => onCreateNewTab(provider)}
        title="New chat tab"
      >
        <Plus size={12} />
      </button>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.chatTabs === nextProps.chatTabs &&
    prevProps.activeTabId === nextProps.activeTabId &&
    prevProps.renamingTabId === nextProps.renamingTabId &&
    prevProps.renamingTitle === nextProps.renamingTitle &&
    prevProps.closingTabIds === nextProps.closingTabIds &&
    prevProps.provider === nextProps.provider
  );
});
ChatTabsBar.displayName = 'ChatTabsBar';

const ChatInputArea = ({
  initialDraft,
  initialAttachment,
  provider,
  disabled,
  cooldownSecondsLeft,
  onSubmit,
  onDraftChange,
  openOpenRouterPopup
}) => {
  const [inputValue, setInputValue] = useState(initialDraft || '');
  const [attachment, setAttachment] = useState(initialAttachment || null);
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const [isMenuDismissed, setIsMenuDismissed] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isLinkInputActive, setIsLinkInputActive] = useState(false);
  const [linkUrlInput, setLinkUrlInput] = useState('https://');
  const [linkTitleInput, setLinkTitleInput] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  const chatInputRef = useRef(null);
  const commandMenuRef = useRef(null);
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);

  const activeAnswerProvider = providerOptions.find((option) => option.id === provider) || providerOptions[1];

  useEffect(() => {
    onDraftChange(inputValue, attachment);
  }, [inputValue, attachment, onDraftChange]);

  const isTypingCommand = inputValue.startsWith('@') && !inputValue.includes(' ');
  const commandQuery = isTypingCommand ? inputValue.slice(1).toLowerCase() : '';
  const filteredCommands = isTypingCommand
    ? COMMAND_OPTIONS.filter(cmd => cmd.name.slice(1).toLowerCase().startsWith(commandQuery))
    : [];
  const showCommandMenu = isTypingCommand && !isMenuDismissed;

  useEffect(() => {
    if (!inputValue.startsWith('@')) {
      setIsMenuDismissed(false);
    }
    setSelectedCommandIndex(0);
  }, [inputValue]);

  // Click outside command menu
  useEffect(() => {
    if (!showCommandMenu) return;
    const handleOutsideClick = (e) => {
      const isInput = e.target && typeof e.target.closest === 'function' && e.target.closest('.center-search-answer-input');
      if (commandMenuRef.current && !commandMenuRef.current.contains(e.target) && !isInput) {
        setIsMenuDismissed(true);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [showCommandMenu]);

  // Click outside attachment menu
  useEffect(() => {
    if (!isAttachmentMenuOpen) return;
    const handleOutsideClick = (e) => {
      const isPlusBtn = e.target && typeof e.target.closest === 'function' && e.target.closest('.center-search-answer-plus-btn');
      const isPopup = e.target && typeof e.target.closest === 'function' && e.target.closest('.attachment-menu-popup');
      if (!isPlusBtn && !isPopup) {
        setIsAttachmentMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [isAttachmentMenuOpen]);

  // Webcam initialization
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

  const handleSelectCommand = (cmdName) => {
    setInputValue(cmdName + ' ');
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
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCommandIndex(prev => 
          filteredCommands.length > 0 ? (prev - 1 + filteredCommands.length) % filteredCommands.length : 0
        );
        return;
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filteredCommands.length > 0 && selectedCommandIndex >= 0 && selectedCommandIndex < filteredCommands.length) {
          e.preventDefault();
          handleSelectCommand(filteredCommands[selectedCommandIndex].name);
        }
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsMenuDismissed(true);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!inputValue.trim() && !attachment) return;
      if (disabled) return;
      onSubmit(inputValue, attachment);
      setInputValue('');
      setAttachment(null);
    }
  };

  useLayoutEffect(() => {
    const textarea = chatInputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [inputValue]);

  const startUploadSimulation = (uploadId) => {
    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += 10;
      setAttachment(prev => {
        if (prev && prev.uploadId === uploadId) {
          if (currentProgress >= 100) {
            clearInterval(interval);
            uploadIntervalsRef.current = uploadIntervalsRef.current.filter(id => id !== interval);
            return { ...prev, progress: null };
          }
          return { ...prev, progress: currentProgress };
        }
        clearInterval(interval);
        uploadIntervalsRef.current = uploadIntervalsRef.current.filter(id => id !== interval);
        return prev;
      });
    }, 120);
    uploadIntervalsRef.current.push(interval);
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

    if (fileInputRef.current) {
      if (type === 'image') {
        fileInputRef.current.accept = 'image/png, image/jpeg, image/jpg, image/webp';
      } else if (type === 'video') {
        fileInputRef.current.accept = 'video/mp4, video/quicktime, video/webm';
      } else if (type === 'file') {
        fileInputRef.current.accept = '.pdf, .docx, .txt, .zip, .json, .csv';
      }
      fileInputRef.current.dataset.uploadType = type;
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const uploadType = fileInputRef.current.dataset.uploadType || 'file';

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

  return (
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

      <form
        className="center-search-answer-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!inputValue.trim() && !attachment) return;
          if (disabled) return;
          onSubmit(inputValue, attachment);
          setInputValue('');
          setAttachment(null);
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

        <textarea
          ref={chatInputRef}
          className="center-search-answer-input"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={`Ask ${activeAnswerProvider.label}...`}
          rows={1}
          disabled={disabled}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            padding: '4px 0',
            maxHeight: '120px',
            overflowY: 'auto',
            fontFamily: 'inherit',
          }}
        />
        <button
          type="submit"
          className="center-search-answer-send"
          disabled={
            (!inputValue.trim() && !attachment) || 
            (attachment && attachment.progress !== null) ||
            disabled
          }
        >
          {provider === 'gemini' && cooldownSecondsLeft > 0
            ? `Wait ${cooldownSecondsLeft}s`
            : 'Send'}
        </button>
      </form>

      <input
        type="file"
        ref={fileInputRef}
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
    </div>
  );
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
  historyChats,
  setHistoryChats,
  pendingReopenChat,
  onClearPendingReopenChat,
  onReopenChat,
}) => {

  const drag = useDraggablePopup(provider);
  const answerPopupRef = drag.popupRef;
  const chatBottomRef = useRef(null);
  
  // Stable refs for tracking typing draft and attachment synchronously
  const currentDraftRef = useRef('');
  const currentAttachmentRef = useRef(null);
  const saveTimerRef = useRef(null);

  const [chatTabs, setChatTabs] = useState(() => {
    try {
      const saved = localStorage.getItem(`ddo_chat_sessions_${provider}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeTabId, setActiveTabId] = useState(() => {
    try {
      return localStorage.getItem(`ddo_active_tab_id_${provider}`) || '';
    } catch {
      return '';
    }
  });

  const [chatHistory, setChatHistory] = useState([]);
  const [answerPanel, setAnswerPanel] = useState({
    isOpen: false,
    provider: provider,
    question: '',
    answer: '',
    status: 'idle',
    error: '',
  });

  const [tabErrors, setTabErrors] = useState({});
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const [activeMenuMsgId, setActiveMenuMsgId] = useState(null);
  const [activeSourcesMsgId, setActiveSourcesMsgId] = useState(null);
  const [speakingMsgId, setSpeakingMsgId] = useState(null);
  const [editingMsgId, setEditingMsgId] = useState(null);

  const [renamingTabId, setRenamingTabId] = useState(null);
  const [renamingTitle, setRenamingTitle] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [closingTabIds, setClosingTabIds] = useState([]);

  const [geminiCooldownUntil, setGeminiCooldownUntil] = useState(() => {
    try {
      return Number(localStorage.getItem(`geminiCooldownUntil_${provider}`)) || 0;
    } catch {
      return 0;
    }
  });
  const [cooldownSecondsLeft, setCooldownSecondsLeft] = useState(0);

  // Coordinate reopening tabs across different AI popups
  useEffect(() => {
    if (pendingReopenChat && pendingReopenChat.providerId === provider) {
      const { chatId } = pendingReopenChat;
      const chat = historyChats.find(t => t.id === chatId);
      if (chat) {
        const isAlreadyTab = chatTabs.some(t => t.id === chatId);
        if (!isAlreadyTab) {
          setChatTabs(prev => {
            const withDraft = prev.map(t => t.id === activeTabId ? { ...t, draft: currentDraftRef.current, pendingAttachment: currentAttachmentRef.current } : t);
            return [...withDraft, chat];
          });
        }
        setChatTabs(prev => {
          const updated = prev.map(t => t.id === activeTabId ? { ...t, draft: currentDraftRef.current, pendingAttachment: currentAttachmentRef.current } : t);
          const nextTab = updated.find(t => t.id === chatId);
          if (nextTab) {
            currentDraftRef.current = nextTab.draft || '';
            currentAttachmentRef.current = nextTab.pendingAttachment || null;
          }
          return updated;
        });
        setActiveTabId(chatId);
        if (chat.provider) {
          setAnswerPanel(prev => ({ ...prev, provider: chat.provider }));
        }
      }
      onClearPendingReopenChat();
    }
  }, [pendingReopenChat, provider, historyChats, chatTabs, activeTabId, onClearPendingReopenChat]);

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [renamingHistoryId, setRenamingHistoryId] = useState(null);
  const [renamingHistoryTitle, setRenamingHistoryTitle] = useState('');
  const [isPinnedSectionExpanded, setIsPinnedSectionExpanded] = useState(true);

  const historyMenuRef = useRef(null);

  const PROVIDER_CAPABILITIES = {
    gemini: { image: true, camera: true, file: true, video: true, link: true },
    stepfun: { image: true, camera: true, file: false, video: false, link: true },
    manus: { image: true, camera: true, file: true, video: true, link: true }
  };

  // Helper to update a chat session across both active tabs and history list
  const updateMessagesAndTitle = useCallback((tabId, getNewMessages, getNewTitle = null) => {
    let updatedTab = null;
    setChatTabs(prev => {
      const tab = prev.find(t => t.id === tabId);
      if (!tab) return prev;
      const nextMsgs = getNewMessages(tab.messages || []);
      const nextTitle = getNewTitle ? getNewTitle(tab, nextMsgs) : tab.title;
      updatedTab = { ...tab, messages: nextMsgs, title: nextTitle };
      return prev.map(t => t.id === tabId ? updatedTab : t);
    });
    
    setHistoryChats(prev => {
      const idx = prev.findIndex(t => t.id === tabId);
      if (idx !== -1) {
        const tab = prev[idx];
        const nextMsgs = getNewMessages(tab.messages || []);
        const nextTitle = getNewTitle ? getNewTitle(tab, nextMsgs) : tab.title;
        const updatedTabObj = { ...tab, messages: nextMsgs, title: nextTitle, updatedAt: Date.now() };
        return prev.map(t => t.id === tabId ? updatedTabObj : t);
      } else if (updatedTab) {
        return [{ ...updatedTab, updatedAt: Date.now() }, ...prev];
      }
      return prev;
    });
  }, []);

  const getGroupLabel = (timestamp) => {
    if (!timestamp) return 'Older';
    const date = new Date(timestamp);
    const today = new Date();
    today.setHours(0,0,0,0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    if (date >= today) return 'Today';
    if (date >= yesterday) return 'Yesterday';
    if (date >= sevenDaysAgo) return 'Previous 7 days';
    return 'Older';
  };

  const sortedHistory = useMemo(() => {
    const filtered = historyChats.filter(chat => 
      chat.provider === provider &&
      (chat.title?.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
       chat.messages?.some(m => m.text?.toLowerCase().includes(historySearchQuery.toLowerCase())))
    );
    
    return [...filtered].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }, [historyChats, historySearchQuery, provider]);

  const historyGroups = useMemo(() => {
    const pinned = sortedHistory.filter(c => c.pinned);
    const unpinned = sortedHistory.filter(c => !c.pinned);
    
    const groups = {};
    unpinned.forEach(chat => {
      const label = getGroupLabel(chat.updatedAt);
      if (!groups[label]) {
        groups[label] = [];
      }
      groups[label].push(chat);
    });

    return {
      pinned,
      unpinnedGroups: Object.entries(groups)
    };
  }, [sortedHistory]);

  const handleReopenChat = useCallback((tabId) => {
    const chat = historyChats.find(t => t.id === tabId);
    if (!chat) return;

    const isAlreadyTab = chatTabs.some(t => t.id === tabId);
    if (!isAlreadyTab) {
      setChatTabs(prev => {
        const withDraft = prev.map(t => t.id === activeTabId ? { ...t, draft: currentDraftRef.current, pendingAttachment: currentAttachmentRef.current } : t);
        return [...withDraft, chat];
      });
    }
    
    setChatTabs(prev => {
      const updated = prev.map(t => t.id === activeTabId ? { ...t, draft: currentDraftRef.current, pendingAttachment: currentAttachmentRef.current } : t);
      const nextTab = updated.find(t => t.id === tabId);
      if (nextTab) {
        currentDraftRef.current = nextTab.draft || '';
        currentAttachmentRef.current = nextTab.pendingAttachment || null;
      }
      return updated;
    });
    setActiveTabId(tabId);
    if (chat.provider) {
      setAnswerPanel(prev => ({ ...prev, provider: chat.provider }));
    }
  }, [chatTabs, historyChats, activeTabId]);

  const handleTogglePinChat = useCallback((chatId) => {
    setHistoryChats(prev => prev.map(t => t.id === chatId ? { ...t, pinned: !t.pinned, updatedAt: Date.now() } : t));
    setChatTabs(prev => prev.map(t => t.id === chatId ? { ...t, pinned: !t.pinned } : t));
  }, []);

  const handleRenameHistoryChat = useCallback((chatId, newTitle) => {
    if (!newTitle.trim()) return;
    const title = newTitle.trim().slice(0, 20);
    setHistoryChats(prev => prev.map(t => t.id === chatId ? { ...t, title, updatedAt: Date.now() } : t));
    setChatTabs(prev => prev.map(t => t.id === chatId ? { ...t, title } : t));
    setRenamingHistoryId(null);
  }, []);

  const handleDeleteHistoryChat = useCallback((chatId) => {
    setHistoryChats(prev => prev.filter(t => t.id !== chatId));
    setChatTabs(prevTabs => {
      const remaining = prevTabs.filter(t => t.id !== chatId);
      if (activeTabId === chatId) {
        if (remaining.length > 0) {
          const closedIndex = prevTabs.findIndex(t => t.id === chatId);
          const newActiveIndex = Math.min(closedIndex, remaining.length - 1);
          const nextTab = remaining[newActiveIndex];
          setActiveTabId(nextTab.id);
          if (nextTab.provider) {
            setAnswerPanel(prev => ({ ...prev, provider: nextTab.provider }));
          }
          currentDraftRef.current = nextTab.draft || '';
          currentAttachmentRef.current = nextTab.pendingAttachment || null;
        } else {
          const newId = 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
          const prov = provider;
          const freshTab = {
            id: newId,
            provider: prov,
            providerDisplayName: getProviderDisplayName(prov),
            title: 'New Chat',
            messages: [getWelcomeMessage(prov)],
            draft: '',
            pendingAttachment: null,
            pinned: false,
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          setActiveTabId(newId);
          currentDraftRef.current = '';
          currentAttachmentRef.current = null;
          setHistoryChats(prev => [{ ...freshTab, updatedAt: Date.now() }, ...prev]);
          return [freshTab];
        }
      }
      return remaining;
    });
  }, [activeTabId, provider]);

  const handleTogglePinMessage = useCallback((msgId) => {
    updateMessagesAndTitle(activeTabId, (msgs) => {
      return msgs.map(m => m.id === msgId ? { ...m, pinned: !m.pinned } : m);
    });
  }, [activeTabId, updateMessagesAndTitle]);

  const handleScrollToMessage = useCallback((msgId) => {
    const el = document.getElementById(`chat-msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('chat-msg-highlight');
      setTimeout(() => el.classList.remove('chat-msg-highlight'), 1500);
    }
  }, []);

  const handleCreateNewTab = useCallback((prov = provider) => {
    const newId = 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const newTab = {
      id: newId,
      provider: prov,
      providerDisplayName: getProviderDisplayName(prov),
      title: 'New Chat',
      messages: [getWelcomeMessage(prov)],
      draft: '',
      pendingAttachment: null,
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setChatTabs(prev => {
      const withDraft = prev.map(t => t.id === activeTabId ? { ...t, draft: currentDraftRef.current, pendingAttachment: currentAttachmentRef.current } : t);
      return [...withDraft, newTab];
    });
    setHistoryChats(prev => [{ ...newTab, updatedAt: Date.now() }, ...prev]);
    currentDraftRef.current = '';
    currentAttachmentRef.current = null;
    setActiveTabId(newId);
    setAnswerPanel(prev => ({ ...prev, provider: prov }));
    return newTab;
  }, [activeTabId, provider]);

  const handleSwitchTab = useCallback((tabId) => {
    if (tabId === activeTabId) return;
    setChatTabs(prev => {
      const updated = prev.map(t => t.id === activeTabId ? { ...t, draft: currentDraftRef.current, pendingAttachment: currentAttachmentRef.current } : t);
      const nextTab = updated.find(t => t.id === tabId);
      if (nextTab) {
        currentDraftRef.current = nextTab.draft || '';
        currentAttachmentRef.current = nextTab.pendingAttachment || null;
      } else {
        currentDraftRef.current = '';
        currentAttachmentRef.current = null;
      }
      return updated;
    });
    setHistoryChats(prev => prev.map(t => {
      if (t.id === activeTabId) {
        return { ...t, draft: currentDraftRef.current, pendingAttachment: currentAttachmentRef.current, updatedAt: Date.now() };
      }
      return t;
    }));
    setActiveTabId(tabId);
    const tab = chatTabs.find(t => t.id === tabId) || historyChats.find(t => t.id === tabId);
    if (tab && tab.provider) {
      setAnswerPanel(prev => ({ ...prev, provider: tab.provider }));
    }
  }, [activeTabId, chatTabs, historyChats]);

  const handleCloseTab = useCallback((e, tabId) => {
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
            currentDraftRef.current = nextTab.draft || '';
            currentAttachmentRef.current = nextTab.pendingAttachment || null;
          } else {
            const newId = 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            const prov = provider;
            const freshTab = {
              id: newId,
              provider: prov,
              providerDisplayName: getProviderDisplayName(prov),
              title: 'New Chat',
              messages: [getWelcomeMessage(prov)],
              draft: '',
              pendingAttachment: null,
              pinned: false,
              createdAt: Date.now(),
              updatedAt: Date.now()
            };
            setActiveTabId(newId);
            currentDraftRef.current = '';
            currentAttachmentRef.current = null;
            setHistoryChats(prev => [{ ...freshTab, updatedAt: Date.now() }, ...prev]);
            return [freshTab];
          }
        }
        return remaining;
      });
      setClosingTabIds(prev => prev.filter(id => id !== tabId));
    }, 200);
  }, [activeTabId, provider]);

  const handleDuplicateTab = useCallback((tabId) => {
    const tabToDup = chatTabs.find(t => t.id === tabId) || historyChats.find(t => t.id === tabId);
    if (!tabToDup) return;

    const newId = 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const dupTab = {
      id: newId,
      provider: tabToDup.provider,
      providerDisplayName: tabToDup.providerDisplayName || getProviderDisplayName(tabToDup.provider),
      title: tabToDup.title === 'New Chat' ? 'New Chat' : tabToDup.title + ' Copy',
      messages: JSON.parse(JSON.stringify(tabToDup.messages || [])),
      draft: tabToDup.id === activeTabId ? currentDraftRef.current : (tabToDup.draft || ''),
      pendingAttachment: tabToDup.id === activeTabId ? currentAttachmentRef.current : (tabToDup.pendingAttachment || null),
      pinned: false,
      createdAt: tabToDup.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    setChatTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId);
      const updated = [...prev];
      if (idx !== -1) {
        updated.splice(idx + 1, 0, dupTab);
      } else {
        updated.push(dupTab);
      }
      return updated;
    });
    setHistoryChats(prev => [{ ...dupTab, updatedAt: Date.now() }, ...prev]);
    setActiveTabId(newId);
    currentDraftRef.current = dupTab.draft || '';
    currentAttachmentRef.current = dupTab.pendingAttachment || null;
    if (dupTab.provider) {
      setAnswerPanel(prev => ({ ...prev, provider: dupTab.provider }));
    }
  }, [chatTabs, historyChats, activeTabId]);

  const handleRenameTab = useCallback((tabId, newTitle) => {
    if (!newTitle.trim()) return;
    const title = newTitle.trim().slice(0, 20);
    setChatTabs(prev => prev.map(t => t.id === tabId ? { ...t, title } : t));
    setHistoryChats(prev => prev.map(t => t.id === tabId ? { ...t, title, updatedAt: Date.now() } : t));
    setRenamingTabId(null);
  }, []);

  const handleCloseOtherTabs = useCallback((tabId) => {
    const targetTab = chatTabs.find(t => t.id === tabId);
    if (!targetTab) return;

    setChatTabs([targetTab]);
    setActiveTabId(tabId);
    if (targetTab.provider) {
      setAnswerPanel(prev => ({ ...prev, provider: targetTab.provider }));
    }
    currentDraftRef.current = targetTab.draft || '';
    currentAttachmentRef.current = targetTab.pendingAttachment || null;
  }, [chatTabs]);

  const handleLikeMessage = useCallback((msgId) => {
    updateMessagesAndTitle(activeTabId, (msgs) => {
      return msgs.map(m => m.id === msgId ? { ...m, feedback: m.feedback === 'like' ? null : 'like' } : m);
    });
  }, [activeTabId, updateMessagesAndTitle]);

  const handleDislikeMessage = useCallback((msgId) => {
    updateMessagesAndTitle(activeTabId, (msgs) => {
      return msgs.map(m => m.id === msgId ? { ...m, feedback: m.feedback === 'dislike' ? null : 'dislike' } : m);
    });
  }, [activeTabId, updateMessagesAndTitle]);

  const handleBranchChat = useCallback((aiMsg) => {
    const activeTab = chatTabs.find(t => t.id === activeTabId) || historyChats.find(t => t.id === activeTabId);
    if (!activeTab) return;

    const msgIdx = activeTab.messages.findIndex(m => m.id === aiMsg.id);
    if (msgIdx === -1) return;

    const prefixMessages = activeTab.messages.slice(0, msgIdx + 1);

    const newId = 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const branchedTab = {
      id: newId,
      provider: activeTab.provider,
      providerDisplayName: activeTab.providerDisplayName || getProviderDisplayName(activeTab.provider),
      title: activeTab.title === 'New Chat' ? 'New Chat' : activeTab.title + ' Branch',
      messages: JSON.parse(JSON.stringify(prefixMessages)),
      draft: '',
      pendingAttachment: null,
      pinned: false,
      createdAt: activeTab.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    setChatTabs(prev => {
      const idx = prev.findIndex(t => t.id === activeTabId);
      const updated = [...prev];
      if (idx !== -1) {
        updated.splice(idx + 1, 0, branchedTab);
      } else {
        updated.push(branchedTab);
      }
      return updated;
    });
    setHistoryChats(prev => [{ ...branchedTab, updatedAt: Date.now() }, ...prev]);
    setActiveTabId(newId);
    currentDraftRef.current = '';
    currentAttachmentRef.current = null;
  }, [activeTabId, chatTabs, historyChats]);

  const handleReadAloud = useCallback((msg) => {
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
  }, [speakingMsgId]);

  const handleViewSources = useCallback((msgId) => {
    setActiveSourcesMsgId(prev => prev === msgId ? null : msgId);
  }, []);

  const openOpenRouterPopup = useCallback(() => {
    console.log('OpenRouter popup clicked');
  }, []);

  const handleGeminiError = useCallback((errorText) => {
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

    const cooldownUntil = Date.now() + retrySeconds * 1000;
    setGeminiCooldownUntil(cooldownUntil);
    try {
      localStorage.setItem(`geminiCooldownUntil_${provider}`, String(cooldownUntil));
    } catch (e) {
      // ignore
    }
    return true;
  }, [provider]);

  const submitAiPrompt = useCallback(async (providerId, promptText, customAttachment = null, isRetry = false) => {
    if (answerPanel.status === 'loading') {
      return;
    }

    const trimmedQuery = promptText.trim();
    if (!trimmedQuery) {
      return;
    }
    const cmdInfo = parseCommand(trimmedQuery);
    let requestPrompt = trimmedQuery;
    let systemInstructionOverride = undefined;

    if (cmdInfo) {
      requestPrompt = cmdInfo.remainingText || '';
      if (cmdInfo.name === 'prompt') {
        systemInstructionOverride = "You are an AI Prompt Creator. Your ONLY job is to output a detailed, professional, structured, and reusable prompt template that the user can copy-paste to instruct another AI to perform their goal. DO NOT perform the actual task. DO NOT generate code, scripts, HTML, or code files. Instead, write a prompt description containing the requirements, design, constraints, and success criteria. For example, if the user asks '@prompt make a calculator', you should reply with a prompt template like 'Create a modern calculator with...' but DO NOT write code for the calculator itself.";
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

    const activeAttachment = customAttachment;
    if (activeAttachment) {
      const providerCaps = PROVIDER_CAPABILITIES[providerId] || { image: true, camera: true, link: true };
      if (!providerCaps[activeAttachment.type]) {
        const userMsgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const userMsg = {
          id: userMsgId,
          sender: 'user',
          text: trimmedQuery,
          attachment: { ...activeAttachment }
        };

        updateMessagesAndTitle(
          currentTabId,
          (msgs) => [...msgs, userMsg],
          (tab) => {
            if (tab.title === 'New Chat') {
              const words = trimmedQuery.trim().split(/\s+/);
              return words.slice(0, 4).join(' ').slice(0, 20) || 'New Chat';
            }
            return tab.title;
          }
        );

        const aiMsgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const aiMsg = {
          id: aiMsgId,
          sender: 'ai',
          text: 'This AI does not support this attachment type yet.',
          isError: true
        };

        setTimeout(() => {
          updateMessagesAndTitle(
            currentTabId,
            (msgs) => [...msgs, aiMsg]
          );

          setAnswerPanel((prev) => ({
            ...prev,
            status: 'done',
          }));
        }, 600);
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
    }

    const userMsgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const userMsg = { id: userMsgId, sender: 'user', text: trimmedQuery, attachment: committedAttachment };

    if (!isRetry) {
      updateMessagesAndTitle(
        currentTabId,
        (msgs) => [...msgs, userMsg],
        (tab) => {
          if (tab.title === 'New Chat') {
            const words = trimmedQuery.trim().split(/\s+/);
            return words.slice(0, 4).join(' ').slice(0, 20) || 'New Chat';
          }
          return tab.title;
        }
      );
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

      const aiMsgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const aiMsg = { id: aiMsgId, sender: 'ai', text: payload.answer || '' };

      updateMessagesAndTitle(
        currentTabId,
        (msgs) => [...msgs, aiMsg]
      );

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
  }, [answerPanel.status, activeTabId, onSaveSearchToHistory, handleCreateNewTab, PROVIDER_CAPABILITIES, handleGeminiError, providerOptions, updateMessagesAndTitle]);

  const handleRetryLastPrompt = useCallback(() => {
    const activeTab = chatTabs.find(t => t.id === activeTabId) || historyChats.find(t => t.id === activeTabId);
    if (!activeTab) return;

    const lastUserMsg = [...(activeTab.messages || [])].reverse().find(m => m.sender === 'user');
    if (!lastUserMsg) return;

    setTabErrors(prev => {
      const next = { ...prev };
      delete next[activeTabId];
      return next;
    });

    void submitAiPrompt(activeTab.provider, lastUserMsg.text, lastUserMsg.attachment, true);
  }, [chatTabs, historyChats, activeTabId, submitAiPrompt]);

  const handleRegenerate = useCallback((msgId) => {
    const activeTab = chatTabs.find(t => t.id === activeTabId) || historyChats.find(t => t.id === activeTabId);
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

    updateMessagesAndTitle(
      activeTabId,
      (msgs) => msgs.slice(0, userMsgIdx + 1)
    );

    void submitAiPrompt(activeTab.provider, originalUserMsg.text, originalUserMsg.attachment, true);
  }, [chatTabs, historyChats, activeTabId, submitAiPrompt, updateMessagesAndTitle]);

  const handleStartEditUserMessage = useCallback((msgId, text) => {
    setEditingMsgId(msgId);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMsgId(null);
  }, []);

  const handleSaveEdit = useCallback(async (msgId, text, attachment) => {
    const updatedText = text.trim();
    if (!updatedText) return;

    updateMessagesAndTitle(
      activeTabId,
      (msgs) => {
        const msgIdx = msgs.findIndex(m => m.id === msgId);
        if (msgIdx === -1) return msgs;
        const updatedUserMsg = { ...msgs[msgIdx], text: updatedText };
        return [...msgs.slice(0, msgIdx), updatedUserMsg];
      }
    );

    setEditingMsgId(null);
    void submitAiPrompt(provider, updatedText, attachment, true);
  }, [activeTabId, provider, submitAiPrompt, updateMessagesAndTitle]);

  const handleDeleteUserMessage = useCallback((msgId) => {
    updateMessagesAndTitle(
      activeTabId,
      (msgs) => {
        const msgIdx = msgs.findIndex(m => m.id === msgId);
        if (msgIdx === -1) return msgs;
        const newMessages = msgs.slice(0, msgIdx);
        if (newMessages.length === 0) {
          newMessages.push(getWelcomeMessage(provider));
        }
        return newMessages;
      }
    );
  }, [activeTabId, provider, updateMessagesAndTitle]);

  useEffect(() => {
    if (pendingPrompt && pendingPrompt.text) {
      void submitAiPrompt(provider, pendingPrompt.text);
      if (onClearPendingPrompt) {
        onClearPendingPrompt();
      }
    }
  }, [pendingPrompt, provider, onClearPendingPrompt, submitAiPrompt]);

  useEffect(() => {
    localStorage.setItem(`ddo_chat_sessions_${provider}`, JSON.stringify(chatTabs));
  }, [chatTabs, provider]);



  useEffect(() => {
    if (activeTabId) {
      localStorage.setItem(`ddo_active_tab_id_${provider}`, activeTabId);
    }
  }, [activeTabId, provider]);

  useEffect(() => {
    const activeTab = chatTabs.find(t => t.id === activeTabId) || historyChats.find(t => t.id === activeTabId);
    if (activeTab) {
      setChatHistory(activeTab.messages || []);
    }
  }, [activeTabId, chatTabs, historyChats]);

  useEffect(() => {
    window.speechSynthesis?.cancel();
    setSpeakingMsgId(null);
  }, [activeTabId]);

  useEffect(() => {
    if (chatTabs.length === 0) {
      const newId = 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const prov = provider;
      const initialTab = {
        id: newId,
        provider: prov,
        providerDisplayName: getProviderDisplayName(prov),
        title: 'New Chat',
        messages: [getWelcomeMessage(prov)],
        draft: '',
        pendingAttachment: null,
        pinned: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      setChatTabs([initialTab]);
      setHistoryChats(prev => {
        if (!prev.some(t => t.id === newId)) {
          return [{ ...initialTab, updatedAt: Date.now() }, ...prev];
        }
        return prev;
      });
      setActiveTabId(newId);
    } else {
      const savedActiveId = localStorage.getItem(`ddo_active_tab_id_${provider}`);
      const activeExists = chatTabs.some(t => t.id === savedActiveId);
      if (activeExists && savedActiveId) {
        setActiveTabId(savedActiveId);
        const activeTab = chatTabs.find(t => t.id === savedActiveId);
        if (activeTab) {
          currentDraftRef.current = activeTab.draft || '';
          currentAttachmentRef.current = activeTab.pendingAttachment || null;
        }
      } else {
        const firstTab = chatTabs[0];
        setActiveTabId(firstTab.id);
        if (firstTab) {
          currentDraftRef.current = firstTab.draft || '';
          currentAttachmentRef.current = firstTab.pendingAttachment || null;
        }
      }
    }
  }, []);

  // Click outside history floating menu
  useEffect(() => {
    if (isMaximized || !isHistoryOpen) return;
    const handleOutsideClick = (e) => {
      const isHistoryBtn = e.target && typeof e.target.closest === 'function' && e.target.closest('.center-search-answer-history-btn');
      if (historyMenuRef.current && !historyMenuRef.current.contains(e.target) && !isHistoryBtn) {
        setIsHistoryOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [isHistoryOpen, isMaximized]);

  // Escape key to close history floating menu
  useEffect(() => {
    if (isMaximized || !isHistoryOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsHistoryOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHistoryOpen, isMaximized]);

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

  useEffect(() => {
    const updateCooldown = () => {
      if (geminiCooldownUntil <= Date.now()) {
        setCooldownSecondsLeft(0);
        return;
      }
      setCooldownSecondsLeft(Math.ceil((geminiCooldownUntil - Date.now()) / 1000));
    };

    updateCooldown();
    const interval = setInterval(updateCooldown, 1000);
    return () => clearInterval(interval);
  }, [geminiCooldownUntil]);

  useEffect(() => {
    const timer = setTimeout(() => {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
    return () => clearTimeout(timer);
  }, [chatHistory, answerPanel.status, tabErrors]);

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      if (activeTabId) {
        try {
          const saved = localStorage.getItem(`ddo_chat_sessions_${provider}`);
          const sessions = saved ? JSON.parse(saved) : [];
          const updated = sessions.map(t => 
            t.id === activeTabId 
              ? { ...t, draft: currentDraftRef.current, pendingAttachment: currentAttachmentRef.current } 
              : t
          );
          localStorage.setItem(`ddo_chat_sessions_${provider}`, JSON.stringify(updated));
        } catch (e) {
          console.error("Error saving draft on unmount:", e);
        }
      }
    };
  }, [activeTabId, provider]);

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

  const handleDraftChange = useCallback((text, attach) => {
    currentDraftRef.current = text;
    currentAttachmentRef.current = attach;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      if (activeTabId) {
        try {
          const saved = localStorage.getItem(`ddo_chat_sessions_${provider}`);
          const sessions = saved ? JSON.parse(saved) : [];
          const updated = sessions.map(t => 
            t.id === activeTabId 
              ? { ...t, draft: text, pendingAttachment: attach } 
              : t
          );
          localStorage.setItem(`ddo_chat_sessions_${provider}`, JSON.stringify(updated));
        } catch (e) {
          console.error("Error saving draft debounced:", e);
        }
      }
    }, 1000);
  }, [activeTabId, provider]);

  const handleFormSubmit = useCallback((text, attach) => {
    currentDraftRef.current = '';
    currentAttachmentRef.current = null;
    setChatTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, draft: '', pendingAttachment: null } : t));
    void submitAiPrompt(provider, text, attach);
  }, [provider, activeTabId, submitAiPrompt]);

  const handleHeaderDoubleClick = useCallback((e) => {
    if (
      e.target.closest('button') ||
      e.target.closest('input') ||
      e.target.closest('select') ||
      e.target.closest('textarea')
    ) {
      return;
    }
    setIsMaximized(prev => !prev);
    setIsMinimized(false);
  }, []);

  if (!isOpen) return null;

  const activeTab = chatTabs.find(t => t.id === activeTabId);
  const initialDraft = activeTab ? activeTab.draft : '';
  const initialAttachment = activeTab ? activeTab.pendingAttachment : null;

  return createPortal(
    <div
      ref={answerPopupRef}
      style={mergedStyle}
      onMouseDown={handlePopupMouseDown}
      className={`center-search-answer-popup popup-aurora-surface ${isMinimized ? 'is-minimized' : ''} ${isMaximized ? 'is-maximized' : ''}`}
      data-provider={provider}
    >
      <div 
        className="center-search-answer-header"
        {...drag.dragProps}
        onDoubleClick={handleHeaderDoubleClick}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className={`center-search-answer-action-btn center-search-answer-history-btn ${isHistoryOpen ? 'is-active' : ''}`}
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            title="Chat History"
          >
            <Sidebar size={15} />
          </button>
          <div className="center-search-answer-title">
            <ActiveAnswerIcon size={15} />
            <span>{activeAnswerProvider.label}</span>
          </div>
        </div>
        <div className="center-search-answer-actions">
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

      <div className="ai-chat-layout-container">
        {isMaximized && isHistoryOpen && (
          <div className="ai-chat-history-sidebar">
            <div className="ai-chat-history-search-container">
              <Search size={13} className="ai-chat-history-search-icon" />
              <input
                type="text"
                className="ai-chat-history-search-input"
                placeholder="Search history..."
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
              />
              {historySearchQuery && (
                <button
                  type="button"
                  className="ai-chat-history-search-clear"
                  onClick={() => setHistorySearchQuery('')}
                >
                  <X size={10} />
                </button>
              )}
            </div>

            <div className="ai-chat-history-list">
              {historyGroups.pinned.length > 0 && (
                <div className="ai-chat-history-group">
                  <div className="ai-chat-history-group-label">Pinned</div>
                  {historyGroups.pinned.map(chat => (
                    <div
                      key={chat.id}
                      className={`ai-chat-history-item ${chat.id === activeTabId ? 'is-active' : ''}`}
                      onClick={() => handleReopenChat(chat.id)}
                    >
                      {renamingHistoryId === chat.id ? (
                        <input
                          type="text"
                          className="ai-chat-history-item-rename-input"
                          value={renamingHistoryTitle}
                          onChange={(e) => setRenamingHistoryTitle(e.target.value)}
                          onBlur={() => handleRenameHistoryChat(chat.id, renamingHistoryTitle)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameHistoryChat(chat.id, renamingHistoryTitle);
                            if (e.key === 'Escape') setRenamingHistoryId(null);
                          }}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <>
                          <span className="ai-chat-history-item-title" title={chat.title}>
                            {chat.title || 'New Chat'}
                          </span>
                          <div className="ai-chat-history-item-actions">
                            <button
                              type="button"
                              className="ai-chat-history-item-action-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTogglePinChat(chat.id);
                              }}
                              title="Unpin chat"
                            >
                              <PinOff size={11} />
                            </button>
                            <button
                              type="button"
                              className="ai-chat-history-item-action-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingHistoryId(chat.id);
                                setRenamingHistoryTitle(chat.title || 'New Chat');
                              }}
                              title="Rename chat"
                            >
                              <Edit2 size={11} />
                            </button>
                            <button
                              type="button"
                              className="ai-chat-history-item-action-btn delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteHistoryChat(chat.id);
                              }}
                              title="Delete chat"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {historyGroups.unpinnedGroups.map(([label, chats]) => (
                <div key={label} className="ai-chat-history-group">
                  <div className="ai-chat-history-group-label">{label}</div>
                  {chats.map(chat => (
                    <div
                      key={chat.id}
                      className={`ai-chat-history-item ${chat.id === activeTabId ? 'is-active' : ''}`}
                      onClick={() => handleReopenChat(chat.id)}
                    >
                      {renamingHistoryId === chat.id ? (
                        <input
                          type="text"
                          className="ai-chat-history-item-rename-input"
                          value={renamingHistoryTitle}
                          onChange={(e) => setRenamingHistoryTitle(e.target.value)}
                          onBlur={() => handleRenameHistoryChat(chat.id, renamingHistoryTitle)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameHistoryChat(chat.id, renamingHistoryTitle);
                            if (e.key === 'Escape') setRenamingHistoryId(null);
                          }}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <>
                          <span className="ai-chat-history-item-title" title={chat.title}>
                            {chat.title || 'New Chat'}
                          </span>
                          <div className="ai-chat-history-item-actions">
                            <button
                              type="button"
                              className="ai-chat-history-item-action-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTogglePinChat(chat.id);
                              }}
                              title="Pin chat"
                            >
                              <Pin size={11} />
                            </button>
                            <button
                              type="button"
                              className="ai-chat-history-item-action-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingHistoryId(chat.id);
                                setRenamingHistoryTitle(chat.title || 'New Chat');
                              }}
                              title="Rename chat"
                            >
                              <Edit2 size={11} />
                            </button>
                            <button
                              type="button"
                              className="ai-chat-history-item-action-btn delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteHistoryChat(chat.id);
                              }}
                              title="Delete chat"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <button
              type="button"
              className="ai-chat-history-floating-new-btn"
              onClick={() => handleCreateNewTab()}
              style={{ marginTop: 'auto' }}
            >
              <Plus size={12} />
              <span>New Chat</span>
            </button>
          </div>
        )}

        <div className="ai-chat-main-area">
          <ChatTabsBar
            chatTabs={chatTabs}
            activeTabId={activeTabId}
            renamingTabId={renamingTabId}
            renamingTitle={renamingTitle}
            closingTabIds={closingTabIds}
            onSwitchTab={handleSwitchTab}
            onContextMenu={setContextMenu}
            onRenameTab={handleRenameTab}
            onCloseTab={handleCloseTab}
            onCreateNewTab={handleCreateNewTab}
            setRenamingTabId={setRenamingTabId}
            setRenamingTitle={setRenamingTitle}
            provider={provider}
          />

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
            <PinnedMessagesSection
              messages={chatHistory}
              onTogglePin={handleTogglePinMessage}
              onScrollToMessage={handleScrollToMessage}
            />
            <MessageList
              chatHistory={chatHistory}
              provider={provider}
              activeMenuMsgId={activeMenuMsgId}
              onToggleMenu={setActiveMenuMsgId}
              activeSourcesMsgId={activeSourcesMsgId}
              onToggleSources={handleViewSources}
              speakingMsgId={speakingMsgId}
              onReadAloud={handleReadAloud}
              editingMsgId={editingMsgId}
              onStartEdit={handleStartEditUserMessage}
              onCancelEdit={handleCancelEdit}
              onSaveEdit={handleSaveEdit}
              onDelete={handleDeleteUserMessage}
              onLike={handleLikeMessage}
              onDislike={handleDislikeMessage}
              onBranch={handleBranchChat}
              onRegenerate={handleRegenerate}
              onViewSources={handleViewSources}
              isLoading={answerPanel.status === 'loading'}
              extractSourcesFromText={extractSourcesFromText}
              openSourceUrl={openSourceUrl}
              chatBottomRef={chatBottomRef}
              tabErrorText={tabErrors[activeTabId]}
              onRetryLastPrompt={handleRetryLastPrompt}
              onTogglePin={handleTogglePinMessage}
            />
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

          <ChatInputArea
            key={activeTabId}
            initialDraft={initialDraft}
            initialAttachment={initialAttachment}
            provider={provider}
            disabled={answerPanel.status === 'loading' || (provider === 'gemini' && cooldownSecondsLeft > 0)}
            cooldownSecondsLeft={cooldownSecondsLeft}
            onSubmit={handleFormSubmit}
            onDraftChange={handleDraftChange}
            openOpenRouterPopup={openOpenRouterPopup}
          />
        </div>
      </div>

      {/* Floating Menu for small popups */}
      {!isMaximized && isHistoryOpen && (
        <div className="ai-chat-history-floating-menu popup-aurora-surface" ref={historyMenuRef}>
          <div className="ai-chat-history-floating-header">
            <span>Chat History</span>
            <button
              type="button"
              className="ai-chat-history-floating-close-btn"
              onClick={() => setIsHistoryOpen(false)}
            >
              <X size={12} />
            </button>
          </div>
          
          <div className="ai-chat-history-search-container">
            <Search size={13} className="ai-chat-history-search-icon" />
            <input
              type="text"
              className="ai-chat-history-search-input"
              placeholder="Search history..."
              value={historySearchQuery}
              onChange={(e) => setHistorySearchQuery(e.target.value)}
            />
            {historySearchQuery && (
              <button
                type="button"
                className="ai-chat-history-search-clear"
                onClick={() => setHistorySearchQuery('')}
              >
                <X size={10} />
              </button>
            )}
          </div>

          <div className="ai-chat-history-floating-list">
            {sortedHistory.length > 0 ? (
              sortedHistory.map(chat => (
                <div
                  key={chat.id}
                  className={`ai-chat-history-floating-item ${chat.id === activeTabId ? 'is-active' : ''}`}
                  onClick={() => {
                    handleReopenChat(chat.id);
                    setIsHistoryOpen(false);
                  }}
                >
                  <span className="ai-chat-history-floating-item-title" title={chat.title}>
                    {chat.pinned && <Pin size={10} className="ai-chat-history-floating-pin-indicator" fill="#fcd34d" />}
                    {chat.title || 'New Chat'}
                  </span>
                  <div className="ai-chat-history-floating-item-actions">
                    <button
                      type="button"
                      className="ai-chat-history-item-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePinChat(chat.id);
                      }}
                      title={chat.pinned ? 'Unpin chat' : 'Pin chat'}
                    >
                      {chat.pinned ? <PinOff size={10} /> : <Pin size={10} />}
                    </button>
                    <button
                      type="button"
                      className="ai-chat-history-item-action-btn delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteHistoryChat(chat.id);
                      }}
                      title="Delete chat"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="ai-chat-history-empty-text">No recent chats found</div>
            )}
          </div>
          
          <button
            type="button"
            className="ai-chat-history-floating-new-btn"
            onClick={() => {
              handleCreateNewTab();
              setIsHistoryOpen(false);
            }}
          >
            <Plus size={12} />
            <span>New Chat</span>
          </button>
        </div>
      )}
    </div>,
    document.body
  );
};

export default CenterSearch;
