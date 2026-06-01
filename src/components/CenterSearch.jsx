import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  Bot, LogOut, Mic, Plus, Search, Sparkles, X, Minus, Maximize2, Minimize2, RotateCw,
  Copy, Check, ThumbsUp, ThumbsDown, FolderPlus, MoreHorizontal, BookOpen, GitBranch, Volume2, VolumeX,
  Image, Video, FileText, Camera, Link
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

const CopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button 
      type="button"
      onClick={handleCopy} 
      className="chat-msg-copy-btn"
      title="Copy Answer"
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
    return ['gemini', 'stepfun'].includes(raw) ? raw : 'google';
  } catch {
    return 'google';
  }
};

const AI_PROVIDER_IDS = new Set(['gemini', 'stepfun']);

const providerOptions = [
  { id: 'google', label: 'Google', icon: Search, placeholder: 'Search Google' },
  { id: 'gemini', label: 'Gemini', icon: Sparkles, placeholder: 'Ask Gemini' },
  { id: 'stepfun', label: 'StepFun AI', icon: Bot, placeholder: 'Ask StepFun AI...' },
];

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
  const searchDrag = useDraggablePopup('search');
  const answerDrag = useDraggablePopup('answer');
  const answerPopupRef = answerDrag.popupRef;
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
  const [answerPanel, setAnswerPanel] = useState({
    isOpen: false,
    provider: 'gemini',
    question: '',
    answer: '',
    status: 'idle',
    error: '',
  });
  const [answerInput, setAnswerInput] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const chatBottomRef = useRef(null);

  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const [attachment, setAttachment] = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  const attachmentFileInputRef = useRef(null);

  const handleTriggerUpload = (type) => {
    setIsAttachmentMenuOpen(false);
    if (type === 'camera') {
      setAttachment({
        type: 'camera',
        name: 'Camera_Capture_' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\s/g, '') + '.png',
        size: 154200
      });
      return;
    }
    if (type === 'link') {
      const url = window.prompt("Enter link URL:", "https://");
      if (url && url.trim() && url !== "https://") {
        setAttachment({
          type: 'link',
          name: url.trim(),
          size: null
        });
      }
      return;
    }

    if (attachmentFileInputRef.current) {
      if (type === 'image') {
        attachmentFileInputRef.current.accept = 'image/png, image/jpeg, image/jpg, image/webp';
      } else if (type === 'video') {
        attachmentFileInputRef.current.accept = 'video/mp4, video/quicktime, video/webm';
      } else if (type === 'file') {
        attachmentFileInputRef.current.accept = '.pdf, .docx, .txt, .zip';
      }
      attachmentFileInputRef.current.dataset.uploadType = type;
      attachmentFileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const uploadType = attachmentFileInputRef.current.dataset.uploadType || 'file';
    setAttachment({
      type: uploadType,
      name: file.name,
      size: file.size,
      fileObj: file
    });
    e.target.value = '';
  };

  useEffect(() => {
    if (!isAttachmentMenuOpen) return;
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.center-search-answer-plus-btn') && !e.target.closest('.attachment-menu-popup')) {
        setIsAttachmentMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [isAttachmentMenuOpen]);

  const [activeMenuMsgId, setActiveMenuMsgId] = useState(null);
  const [activeSourcesMsgId, setActiveSourcesMsgId] = useState(null);
  const [speakingMsgId, setSpeakingMsgId] = useState(null);

  const [chatSessions, setChatSessions] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ddo_chat_sessions') || '[]');
    } catch {
      return [];
    }
  });
  const [activeSessionId, setActiveSessionId] = useState('current');

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

  useEffect(() => {
    if (chatHistory.length === 0) return;
    
    setChatSessions(prev => {
      const idx = prev.findIndex(s => s.id === activeSessionId);
      const firstUserMsg = chatHistory.find(m => m.sender === 'user');
      const title = firstUserMsg ? firstUserMsg.text.slice(0, 20) + '...' : 'Chat';
      
      const updated = [...prev];
      if (idx !== -1) {
        updated[idx] = {
          ...updated[idx],
          messages: chatHistory
        };
      } else if (chatHistory.some(m => m.sender === 'user')) {
        updated.push({
          id: activeSessionId,
          provider: answerPanel.provider,
          title,
          messages: chatHistory,
          createdAt: new Date().toISOString()
        });
      } else {
        return prev;
      }
      localStorage.setItem('ddo_chat_sessions', JSON.stringify(updated));
      return updated;
    });
  }, [chatHistory, activeSessionId]);

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  const [geminiCooldownUntil, setGeminiCooldownUntil] = useState(() => {
    try {
      return Number(localStorage.getItem("geminiCooldownUntil")) || 0;
    } catch {
      return 0;
    }
  });
  const [cooldownSecondsLeft, setCooldownSecondsLeft] = useState(0);

  useEffect(() => {
    if (geminiCooldownUntil <= Date.now()) {
      setCooldownSecondsLeft(0);
      return;
    }

    const updateCooldown = () => {
      const remaining = Math.max(0, Math.ceil((geminiCooldownUntil - Date.now()) / 1000));
      setCooldownSecondsLeft(remaining);
      if (remaining === 0) {
        setGeminiCooldownUntil(0);
        try {
          localStorage.removeItem("geminiCooldownUntil");
        } catch (e) {
          // ignore
        }
      }
    };

    updateCooldown();
    const interval = setInterval(updateCooldown, 1000);
    return () => clearInterval(interval);
  }, [geminiCooldownUntil]);

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

    const cooldownUntil = Date.now() + retrySeconds * 1000;
    setGeminiCooldownUntil(cooldownUntil);
    try {
      localStorage.setItem("geminiCooldownUntil", String(cooldownUntil));
    } catch (e) {
      // ignore
    }
    return true;
  };

  useEffect(() => {
    const welcomeText = answerPanel.provider === 'stepfun'
      ? 'Hello! Nice to meet you 😊 What would you like help with today?'
      : `Ask a question and ${activeAnswerProvider.label} will answer here.`;

    setChatHistory([
      { id: 'welcome', sender: 'ai', text: welcomeText }
    ]);
  }, [answerPanel.provider]);

  useEffect(() => {
    if (activePopup === 'stepfun' || activePopup === 'gemini') {
      setIsMinimized(false);
      setIsMaximized(false);
    }
  }, [activePopup]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, answerPanel.status]);

  const providerMenuRef = useRef(null);
  const activeProvider = providerOptions.find((option) => option.id === searchProvider) || providerOptions[0];
  const activeAnswerProvider = providerOptions.find((option) => option.id === answerPanel.provider) || providerOptions[1];
  const ActiveAnswerIcon = activeAnswerProvider.icon;

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

  useEffect(() => {
    onPopupStateChange(activePopup !== null);
  }, [activePopup, onPopupStateChange]);

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

  const submitAiPrompt = async (providerId, promptText) => {
    const trimmedQuery = promptText.trim();
    if (!trimmedQuery) {
      return;
    }

    if (attachment) {
      setToastMessage("Attachment selected, upload support coming soon.");
      setTimeout(() => setToastMessage(''), 4000);
      setAttachment(null);
    }

    const providerMeta = providerOptions.find((option) => option.id === providerId) || providerOptions[1];
    saveSearchToHistory(trimmedQuery);
    setAnswerInput('');
    setQuery('');
    setActivePopup(providerId);

    setAnswerPanel((prev) => ({
      ...prev,
      isOpen: false,
      provider: providerId,
      status: 'loading',
      error: '',
    }));

    const userMsgId = Math.random().toString();
    setChatHistory((prev) => [...prev, { id: userMsgId, sender: 'user', text: trimmedQuery }]);

    try {
      const response = await fetch(buildApiUrl('/api/ai/respond'), {
        method: 'POST',
        headers: {
          ...createAuthHeaders({
            'Content-Type': 'application/json',
          }),
        },
        body: JSON.stringify({
          provider: providerId,
          prompt: trimmedQuery,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || `${providerMeta.label} request failed.`);
      }

      const aiMsgId = Math.random().toString();
      setChatHistory((prev) => [...prev, { id: aiMsgId, sender: 'ai', text: payload.answer || '' }]);
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

      const errorMsgId = Math.random().toString();
      setChatHistory((prev) => [
        ...prev,
        { id: errorMsgId, sender: 'ai', text: textToShow, isError: true }
      ]);
      setAnswerPanel((prev) => ({
        ...prev,
        status: 'error',
        error: textToShow,
      }));
    }
  };

  const handleRegenerate = async (msgId) => {
    const msgIdx = chatHistory.findIndex((m) => m.id === msgId);
    if (msgIdx === -1) return;

    let userMsgIdx = -1;
    for (let i = msgIdx - 1; i >= 0; i--) {
      if (chatHistory[i].sender === 'user') {
        userMsgIdx = i;
        break;
      }
    }

    if (userMsgIdx === -1) return;

    const providerId = answerPanel.provider;
    const promptText = chatHistory[userMsgIdx].text;

    setChatHistory(chatHistory.slice(0, userMsgIdx));
    void submitAiPrompt(providerId, promptText);
  };

  const handleLikeMessage = (msgId) => {
    setChatHistory(prev => prev.map(m => {
      if (m.id === msgId) {
        return { ...m, feedback: m.feedback === 'like' ? null : 'like' };
      }
      return m;
    }));
  };

  const handleDislikeMessage = (msgId) => {
    setChatHistory(prev => prev.map(m => {
      if (m.id === msgId) {
        return { ...m, feedback: m.feedback === 'dislike' ? null : 'dislike' };
      }
      return m;
    }));
  };

  const handleReadAloud = (msg) => {
    if (speakingMsgId === msg.id) {
      window.speechSynthesis?.cancel();
      setSpeakingMsgId(null);
      return;
    }
    window.speechSynthesis?.cancel();
    const textToSpeak = cleanAiMessageText(msg.text);
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.onend = () => setSpeakingMsgId(null);
    utterance.onerror = () => setSpeakingMsgId(null);
    window.speechSynthesis?.speak(utterance);
    setSpeakingMsgId(msg.id);
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

  const handleViewSources = (msgId) => {
    setActiveSourcesMsgId(activeSourcesMsgId === msgId ? null : msgId);
  };

  const handleBranchChat = (aiMsg) => {
    const msgIdx = chatHistory.findIndex((m) => m.id === aiMsg.id);
    if (msgIdx === -1) return;

    let userMsg = null;
    for (let i = msgIdx - 1; i >= 0; i--) {
      if (chatHistory[i].sender === 'user') {
        userMsg = chatHistory[i];
        break;
      }
    }

    if (!userMsg) return;

    const currentHasUser = chatHistory.some(m => m.sender === 'user');
    let updatedSessions = [...chatSessions];
    
    if (currentHasUser) {
      const firstUserMsg = chatHistory.find(m => m.sender === 'user');
      const existingIdx = updatedSessions.findIndex(s => s.id === activeSessionId);
      
      if (existingIdx !== -1) {
        updatedSessions[existingIdx].messages = chatHistory;
      } else {
        updatedSessions.push({
          id: activeSessionId,
          provider: answerPanel.provider,
          title: 'From: ' + (firstUserMsg.text.slice(0, 20) || 'Chat'),
          messages: chatHistory,
          createdAt: new Date().toISOString()
        });
      }
    }

    const newSessionId = 'session_branched_' + Date.now();
    const newSession = {
      id: newSessionId,
      provider: answerPanel.provider,
      title: 'Branch: ' + (userMsg.text.slice(0, 20) || 'New Chat'),
      messages: [
        { id: 'welcome', sender: 'ai', text: 'Hello! Nice to meet you 😊' },
        { id: 'user_' + Date.now(), sender: 'user', text: userMsg.text },
        { id: 'ai_' + Date.now(), sender: 'ai', text: aiMsg.text }
      ],
      createdAt: new Date().toISOString()
    };

    updatedSessions.push(newSession);
    setChatSessions(updatedSessions);
    localStorage.setItem('ddo_chat_sessions', JSON.stringify(updatedSessions));

    setActiveSessionId(newSessionId);
    setChatHistory(newSession.messages);
  };

  const handleSessionChange = (sid) => {
    if (sid === activeSessionId) return;

    let updatedSessions = [...chatSessions];
    const firstUserMsg = chatHistory.find(m => m.sender === 'user');
    const title = firstUserMsg ? firstUserMsg.text.slice(0, 20) + '...' : 'Chat';
    
    const existingIdx = updatedSessions.findIndex(s => s.id === activeSessionId);
    if (existingIdx !== -1) {
      updatedSessions[existingIdx].messages = chatHistory;
    } else if (chatHistory.some(m => m.sender === 'user')) {
      updatedSessions.push({
        id: activeSessionId,
        provider: answerPanel.provider,
        title,
        messages: chatHistory,
        createdAt: new Date().toISOString()
      });
    }

    setChatSessions(updatedSessions);
    localStorage.setItem('ddo_chat_sessions', JSON.stringify(updatedSessions));

    if (sid === 'current') {
      const currentSession = updatedSessions.find(s => s.id === 'current');
      if (currentSession) {
        setChatHistory(currentSession.messages);
      } else {
        const welcomeText = answerPanel.provider === 'stepfun'
          ? 'Hello! Nice to meet you 😊 What would you like help with today?'
          : `Ask a question and ${activeAnswerProvider.label} will answer here.`;
        setChatHistory([{ id: 'welcome', sender: 'ai', text: welcomeText }]);
      }
    } else {
      const selected = updatedSessions.find(s => s.id === sid);
      if (selected) {
        setChatHistory(selected.messages);
        if (selected.provider) {
          setAnswerPanel(prev => ({ ...prev, provider: selected.provider }));
        }
      }
    }
    setActiveSessionId(sid);
  };

  const submitQuery = async () => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return;
    }

    if (AI_PROVIDER_IDS.has(searchProvider)) {
      await submitAiPrompt(searchProvider, trimmedQuery);
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

    if (providerId === 'stepfun') {
      setAnswerInput('');
      setAnswerPanel({
        isOpen: false,
        provider: 'stepfun',
        question: '',
        answer: '',
        status: 'idle',
        error: '',
      });
      setActivePopup('stepfun');
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

  const answerPanelPopup = (activePopup === 'stepfun' || activePopup === 'gemini')
    ? createPortal(
        <div
          ref={answerPopupRef}
          style={answerDrag.dragStyle}
          className={`center-search-answer-popup popup-aurora-surface ${isMinimized ? 'is-minimized' : ''} ${isMaximized ? 'is-maximized' : ''}`}
        >
          <div className="center-search-answer-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="center-search-answer-title">
                <ActiveAnswerIcon size={15} />
                <span>{activeAnswerProvider.label}</span>
              </div>
              {chatSessions.length > 0 && (
                <div className="chat-sessions-dropdown-container">
                  <select
                    className="chat-sessions-select"
                    value={activeSessionId}
                    onChange={(e) => handleSessionChange(e.target.value)}
                  >
                    <option value="current">Active Chat</option>
                    {chatSessions.filter(s => s.id !== 'current').map((session) => (
                      <option key={session.id} value={session.id}>
                        {session.title || 'Saved Chat'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="center-search-answer-actions">
              <button
                type="button"
                className="center-search-answer-action-btn popup-drag-btn"
                {...answerDrag.dragProps}
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
                onClick={() => setActivePopup(null)}
                aria-label="Close answer popup"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          <div className="center-search-answer-body">
            <div className="chat-messages-container">
              {chatHistory.map((msg) => (
                <div key={msg.id} className={`chat-msg ${msg.sender === 'user' ? 'chat-msg-user' : 'chat-msg-ai'} ${msg.isError ? 'chat-msg-error' : ''}`}>
                  <div className="chat-msg-wrapper">
                    <div className="chat-msg-bubble">
                      {msg.sender === 'ai' ? (
                        <div className="chat-msg-ai-card">
                          <div className="chat-msg-header">
                            <span className="chat-msg-provider">
                              {msg.id === 'welcome' ? 'Welcome' : activeAnswerProvider.label}
                            </span>
                            <CopyButton text={cleanAiMessageText(msg.text)} />
                          </div>
                          <div className="chat-msg-content">
                            <MarkdownRenderer text={msg.text} />
                          </div>
                        </div>
                      ) : (
                        msg.text
                      )}
                    </div>
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

              <div ref={chatBottomRef} />
            </div>
          </div>

          {answerPanel.provider === 'gemini' && cooldownSecondsLeft > 0 && (
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
              <div>Retry after: {cooldownSecondsLeft} seconds</div>
              <div style={{ color: '#ffffff', fontWeight: '500', marginTop: '2px' }}>
                Retry available in: {cooldownSecondsLeft}s
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                Gemini available again at {new Date(geminiCooldownUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
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
                    setActivePopup('stepfun');
                    setAnswerPanel((prev) => ({
                      ...prev,
                      provider: 'stepfun',
                      status: 'idle',
                      error: '',
                    }));
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
                <span className="attachment-preview-name" title={attachment.name}>
                  {attachment.name}
                </span>
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
              void submitAiPrompt(answerPanel.provider, answerInput);
            }}
          >
            {answerPanel.provider === 'stepfun' && (
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
            )}

            <input
              type="text"
              className="center-search-answer-input"
              value={answerInput}
              onChange={(event) => setAnswerInput(event.target.value)}
              placeholder={`Ask ${activeAnswerProvider.label}...`}
              disabled={answerPanel.provider === 'gemini' && cooldownSecondsLeft > 0}
            />
            <button
              type="submit"
              className="center-search-answer-send"
              disabled={
                (!answerInput.trim() && !attachment) || 
                answerPanel.status === 'loading' || 
                (answerPanel.provider === 'gemini' && cooldownSecondsLeft > 0)
              }
            >
              {answerPanel.provider === 'gemini' && cooldownSecondsLeft > 0
                ? `Wait ${cooldownSecondsLeft}s`
                : 'Send'}
            </button>
          </form>

          <input
            type="file"
            ref={attachmentFileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
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
