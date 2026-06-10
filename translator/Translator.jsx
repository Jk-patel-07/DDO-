import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeftRight, Copy, Trash2, Check, AlertCircle, Loader2, Camera, ChevronDown, Plus, Image as ImageIcon, RefreshCw, X, Mic, Send, Pin, Search, Edit2, Sidebar, Maximize2, Minimize2, Languages } from 'lucide-react';
import { createWorker } from 'tesseract.js';
import './translator.css';

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'ru', name: 'Russian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' }
];

function CustomSelect({ value, onChange, options, placeholder, isDarkHeader = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.code === value) || { name: placeholder || value };

  return (
    <div className={`ddo-custom-select ${isDarkHeader ? 'header-select' : ''}`} ref={dropdownRef}>
      <button
        type="button"
        className={`ddo-custom-select-trigger ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{selectedOption.name}</span>
        <ChevronDown size={13} className={`chevron-icon ${isOpen ? 'open' : ''}`} />
      </button>
      {isOpen && (
        <div className="ddo-custom-select-options">
          {options.map((opt) => (
            <div
              key={opt.code}
              className={`ddo-custom-select-option ${opt.code === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(opt.code);
                setIsOpen(false);
              }}
            >
              {opt.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Translator({ onVisibilityChange, visible }) {
  const [targetLang, setTargetLang] = useState('es');
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedText, setCopiedText] = useState(null);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [statusText, setStatusText] = useState('');

  // UI responsive states
  const [isExpanded, setIsExpanded] = useState(false); // compact (320px) vs expanded (540px)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Photo & Camera States
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);

  // Voice/Mic States
  const [isRecording, setIsRecording] = useState(false);

  // Translation Sessions History with legacy parser/migration
  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('ddo_translator_history');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return parsed.map(session => {
        if (!session.messages) {
          const legacyMsg = {
            id: 'legacy_' + session.id,
            userText: session.inputText || '',
            translatedText: session.translatedText || '',
            sourceLang: session.sourceLang || 'auto',
            detectedLang: session.sourceLang !== 'auto' ? session.sourceLang : null,
            targetLang: session.targetLang || 'es',
            isPinned: false,
            timestamp: session.timestamp || Date.now()
          };
          return {
            id: session.id,
            title: session.title || 'Translation',
            messages: legacyMsg.userText ? [legacyMsg] : [],
            timestamp: session.timestamp || Date.now(),
            isPinned: session.isPinned || false
          };
        }
        return session;
      });
    } catch {
      return [];
    }
  });
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editTitleText, setEditTitleText] = useState('');

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const activeStreamRef = useRef(null);
  const recognitionRef = useRef(null);
  const chatAreaRef = useRef(null);

  useEffect(() => {
    return () => {
      stopCamera();
      stopRecording();
    };
  }, []);

  // Reset states when the Translator popup is closed
  useEffect(() => {
    if (!visible) {
      setIsAttachMenuOpen(false);
      setIsHistoryOpen(false);
      stopCamera();
      stopRecording();
    }
  }, [visible]);

  // Compute active messages
  const activeSession = history.find(s => s.id === activeSessionId);
  const messages = activeSession ? activeSession.messages || [] : [];

  // Scroll to bottom when messages update
  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const stopCamera = () => {
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => track.stop());
      activeStreamRef.current = null;
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      setIsRecording(false);
    }
  };

  const performTranslation = async (textToTranslate, tgtLang) => {
    if (!textToTranslate.trim()) return;

    setIsLoading(true);
    setError('');

    try {
      const src = 'autodetect';
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
        textToTranslate.trim()
      )}&langpair=${src}|${tgtLang}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Translation request failed.');
      }

      const data = await response.json();
      if (data.responseStatus === 200) {
        const resultText = data.responseData.translatedText;
        
        let detected = 'en';
        if (data.matches_original_lang) {
          detected = data.matches_original_lang;
        } else if (data.matches && data.matches.length > 0) {
          detected = data.matches[0].source || 'en';
        }

        appendMessageToActiveSession(textToTranslate, resultText, detected, tgtLang);
      } else {
        throw new Error(data.responseDetails || 'Error translating text.');
      }
    } catch (err) {
      console.error(err);
      setError('Failed to translate. Please try again.');
      if (!navigator.onLine) {
        setError('Network offline. Offline translation is unavailable.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const appendMessageToActiveSession = (userText, translatedText, detectedLang, targetLang) => {
    const newMsg = {
      id: 'msg_' + Date.now(),
      userText,
      translatedText,
      sourceLang: 'auto',
      detectedLang,
      targetLang,
      isPinned: false,
      timestamp: Date.now()
    };

    let updatedHistory = [...history];
    let currentSessionId = activeSessionId;

    if (!currentSessionId) {
      const title = userText.length > 25 ? userText.substring(0, 25).trim() + '...' : userText.trim();
      currentSessionId = 'session_' + Date.now();
      const newSession = {
        id: currentSessionId,
        title,
        messages: [newMsg],
        timestamp: Date.now(),
        isPinned: false
      };
      updatedHistory.unshift(newSession);
      setActiveSessionId(currentSessionId);
    } else {
      updatedHistory = updatedHistory.map((s) => {
        if (s.id === currentSessionId) {
          return {
            ...s,
            messages: [...(s.messages || []), newMsg],
            timestamp: Date.now()
          };
        }
        return s;
      });

      // Move active session to top of list
      const sessionIndex = updatedHistory.findIndex(s => s.id === currentSessionId);
      if (sessionIndex > 0) {
        const [activeSessionObj] = updatedHistory.splice(sessionIndex, 1);
        updatedHistory.unshift(activeSessionObj);
      }
    }

    setHistory(updatedHistory);
    localStorage.setItem('ddo_translator_history', JSON.stringify(updatedHistory));
    setInputText('');
    setImagePreviewUrl(null);
  };

  const handleTranslate = () => {
    performTranslation(inputText, targetLang);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      handleTranslate();
    }
  };

  // OCR Logic
  const runOCRFromBase64 = async (base64Image) => {
    try {
      const worker = await createWorker('eng');
      const imageUri = `data:image/png;base64,${base64Image}`;
      const result = await worker.recognize(imageUri);
      await worker.terminate();
      return result.data.text;
    } catch (err) {
      console.error('OCR failed:', err);
      throw new Error('No readable text found');
    }
  };

  // File Upload Handlers
  const handleUploadClick = () => {
    setIsAttachMenuOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result;
        if (!base64Data || typeof base64Data !== 'string') {
          throw new Error('Failed to read image file.');
        }

        setImagePreviewUrl(base64Data);
        setIsOcrLoading(true);
        setStatusText('Scanning photo...');
        setError('');

        const splitData = base64Data.split(',');
        const rawBase64 = splitData[1];
        if (!rawBase64) throw new Error('No readable text found');

        const text = await runOCRFromBase64(rawBase64);
        if (!text || !text.trim()) {
          throw new Error('No readable text found');
        }

        setStatusText('Translating...');
        await performTranslation(text, targetLang);
        setIsOcrLoading(false);
      } catch (err) {
        console.error(err);
        setError('No readable text found');
        setIsOcrLoading(false);
      }
    };
    reader.onerror = () => {
      setError('No readable text found');
      setIsOcrLoading(false);
    };
    reader.readAsDataURL(file);
  };

  // Camera Handlers
  const handleOpenCamera = async () => {
    setIsAttachMenuOpen(false);
    setCapturedPhoto(null);
    setIsCameraOpen(true);
    setError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      activeStreamRef.current = stream;
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 150);
    } catch (err) {
      console.error('Camera access failed:', err);
      setError('Camera access failed. Check permissions.');
      setIsCameraOpen(false);
    }
  };

  const handleCloseCamera = () => {
    stopCamera();
    setIsCameraOpen(false);
    setCapturedPhoto(null);
  };

  const handleCapture = () => {
    try {
      if (!videoRef.current || !activeStreamRef.current) return;
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      setCapturedPhoto(canvas.toDataURL('image/png'));
      stopCamera();
    } catch (err) {
      console.error('Frame capture failed:', err);
      setError('Failed to capture frame.');
    }
  };

  const handleRetake = async () => {
    setCapturedPhoto(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      activeStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      console.error(err);
      setIsCameraOpen(false);
    }
  };

  const handleUsePhoto = async () => {
    if (!capturedPhoto) return;
    setIsCameraOpen(false);
    setImagePreviewUrl(capturedPhoto);
    setIsOcrLoading(true);
    setStatusText('Scanning photo...');
    setError('');

    try {
      const rawBase64 = capturedPhoto.split(',')[1];
      const text = await runOCRFromBase64(rawBase64);
      if (!text || !text.trim()) {
        throw new Error('No readable text found');
      }
      setStatusText('Translating...');
      await performTranslation(text, targetLang);
      setIsOcrLoading(false);
    } catch (err) {
      console.error(err);
      setError('No readable text found');
      setIsOcrLoading(false);
    }
  };

  // Mic/Voice Recording Handler
  const handleToggleVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Voice recognition is not supported on this browser.');
      return;
    }

    if (isRecording) {
      stopRecording();
      return;
    }

    try {
      setError('');
      setIsRecording(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = 'en-US';
      recognitionRef.current = recognition;

      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript) {
          setInputText((prev) => (prev ? prev + ' ' + transcript : transcript));
        }
      };

      recognition.onerror = (e) => {
        console.error('Speech recognition error:', e);
        setError('Voice input failed or timed out.');
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsRecording(false);
    }
  };

  // Image Actions
  const handleRemoveImage = () => {
    setImagePreviewUrl(null);
    setInputText('');
    setError('');
    setStatusText('');
  };

  const handleRetryOcr = async () => {
    if (!imagePreviewUrl) return;
    setIsOcrLoading(true);
    setStatusText('Scanning photo...');
    setError('');

    try {
      const rawBase64 = imagePreviewUrl.split(',')[1];
      const text = await runOCRFromBase64(rawBase64);
      if (!text || !text.trim()) {
        throw new Error('No readable text found');
      }
      setStatusText('Translating...');
      await performTranslation(text, targetLang);
      setIsOcrLoading(false);
    } catch (err) {
      console.error(err);
      setError('No readable text found');
      setIsOcrLoading(false);
    }
  };

  // History Management
  const handleNewTranslation = () => {
    setInputText('');
    setError('');
    setStatusText('');
    setImagePreviewUrl(null);
    setActiveSessionId(null);
    setIsHistoryOpen(false);
  };

  const selectHistorySession = (session) => {
    setActiveSessionId(session.id);
    setInputText('');
    setImagePreviewUrl(null);
    if (!isExpanded) {
      setIsHistoryOpen(false);
    }
  };

  const togglePinSession = (id, e) => {
    e.stopPropagation();
    const updated = history.map((s) => (s.id === id ? { ...s, isPinned: !s.isPinned } : s));
    setHistory(updated);
    localStorage.setItem('ddo_translator_history', JSON.stringify(updated));
  };

  const deleteSession = (id, e) => {
    e.stopPropagation();
    const updated = history.filter((s) => s.id !== id);
    setHistory(updated);
    localStorage.setItem('ddo_translator_history', JSON.stringify(updated));
    if (activeSessionId === id) {
      handleNewTranslation();
    }
  };

  const startRenameSession = (session, e) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditTitleText(session.title);
  };

  const saveRenameSession = (id) => {
    const updated = history.map((s) => (s.id === id ? { ...s, title: editTitleText.trim() || s.title } : s));
    setHistory(updated);
    localStorage.setItem('ddo_translator_history', JSON.stringify(updated));
    setEditingSessionId(null);
  };

  const handleSwap = () => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    const lastDetected = lastMsg.detectedLang || 'en';
    
    // Swap target language with last detected language
    setTargetLang(lastDetected);
    
    // Pre-fill input with last translated text
    setInputText(lastMsg.translatedText || '');
    setError('');
    setStatusText('');
  };

  const handleCopyMessage = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handlePinMessage = (msgId) => {
    if (!activeSessionId) return;
    const updatedHistory = history.map((s) => {
      if (s.id === activeSessionId) {
        return {
          ...s,
          messages: s.messages.map((m) =>
            m.id === msgId ? { ...m, isPinned: !m.isPinned } : m
          )
        };
      }
      return s;
    });
    setHistory(updatedHistory);
    localStorage.setItem('ddo_translator_history', JSON.stringify(updatedHistory));
  };

  const handleDeleteMessage = (msgId) => {
    if (!activeSessionId) return;
    const updatedHistory = history.map((s) => {
      if (s.id === activeSessionId) {
        return {
          ...s,
          messages: s.messages.filter((m) => m.id !== msgId)
        };
      }
      return s;
    });
    setHistory(updatedHistory);
    localStorage.setItem('ddo_translator_history', JSON.stringify(updatedHistory));
  };

  const getFilteredAndGroupedHistory = () => {
    const filtered = history.filter(
      (s) =>
        s.title.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
        (s.messages && s.messages.some(m => m.userText.toLowerCase().includes(historySearchQuery.toLowerCase()) || m.translatedText.toLowerCase().includes(historySearchQuery.toLowerCase())))
    );

    const pinned = filtered.filter((s) => s.isPinned);
    const unpinned = filtered.filter((s) => !s.isPinned);

    const today = [];
    const yesterday = [];
    const last7Days = [];
    const older = [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
    const sevenDaysStart = todayStart - 7 * 24 * 60 * 60 * 1000;

    unpinned.forEach((s) => {
      if (s.timestamp >= todayStart) {
        today.push(s);
      } else if (s.timestamp >= yesterdayStart) {
        yesterday.push(s);
      } else if (s.timestamp >= sevenDaysStart) {
        last7Days.push(s);
      } else {
        older.push(s);
      }
    });

    return { pinned, today, yesterday, last7Days, older };
  };

  const getLanguageName = (code) => {
    const lang = LANGUAGES.find(l => l.code === code);
    return lang ? lang.name : code;
  };

  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const detectedLangCode = lastMsg ? lastMsg.detectedLang : null;
  const detectedLangName = detectedLangCode ? getLanguageName(detectedLangCode) : null;

  // Helper to render history item list
  const renderHistoryItem = (session) => (
    <div
      key={session.id}
      className={`ddo-history-item ${activeSessionId === session.id ? 'active' : ''}`}
      onClick={() => selectHistorySession(session)}
    >
      {editingSessionId === session.id ? (
        <input
          type="text"
          value={editTitleText}
          onChange={(e) => setEditTitleText(e.target.value)}
          onBlur={() => saveRenameSession(session.id)}
          onKeyDown={(e) => e.key === 'Enter' && saveRenameSession(session.id)}
          className="ddo-history-rename-input"
          onClick={(e) => e.stopPropagation()}
          autoFocus
        />
      ) : (
        <span className="ddo-history-item-title">{session.title}</span>
      )}
      <div className="ddo-history-item-actions">
        <button
          type="button"
          onClick={(e) => togglePinSession(session.id, e)}
          className={`ddo-history-action-btn ${session.isPinned ? 'pinned' : ''}`}
          title={session.isPinned ? 'Unpin' : 'Pin'}
        >
          <Pin size={11} />
        </button>
        <button
          type="button"
          onClick={(e) => startRenameSession(session, e)}
          className="ddo-history-action-btn"
          title="Rename"
        >
          <Edit2 size={11} />
        </button>
        <button
          type="button"
          onClick={(e) => deleteSession(session.id, e)}
          className="ddo-history-action-btn delete"
          title="Delete"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );

  const renderHistoryList = () => {
    const { pinned, today, yesterday, last7Days, older } = getFilteredAndGroupedHistory();
    return (
      <div className="ddo-history-list-scroll">
        {pinned.length > 0 && (
          <div className="ddo-history-section">
            <div className="ddo-history-section-header">Pinned</div>
            {pinned.map(renderHistoryItem)}
          </div>
        )}
        {today.length > 0 && (
          <div className="ddo-history-section">
            <div className="ddo-history-section-header">Today</div>
            {today.map(renderHistoryItem)}
          </div>
        )}
        {yesterday.length > 0 && (
          <div className="ddo-history-section">
            <div className="ddo-history-section-header">Yesterday</div>
            {yesterday.map(renderHistoryItem)}
          </div>
        )}
        {last7Days.length > 0 && (
          <div className="ddo-history-section">
            <div className="ddo-history-section-header">Previous 7 Days</div>
            {last7Days.map(renderHistoryItem)}
          </div>
        )}
        {older.length > 0 && (
          <div className="ddo-history-section">
            <div className="ddo-history-section-header">Older</div>
            {older.map(renderHistoryItem)}
          </div>
        )}
        {history.length === 0 && (
          <div className="ddo-history-empty">No history yet</div>
        )}
      </div>
    );
  };

  return (
    <div className={`ddo-translator-layout ${isExpanded ? 'is-expanded' : 'is-compact'}`}>
      {/* 1. Sidebar History Panel (Visible only when Expanded/Maximized) */}
      {isExpanded && isHistoryOpen && (
        <div className="ddo-translator-sidebar">
          <div className="ddo-sidebar-header">
            <button type="button" onClick={handleNewTranslation} className="ddo-new-chat-btn">
              <Plus size={13} />
              <span>New Conversation</span>
            </button>
          </div>
          <div className="ddo-sidebar-search">
            <Search size={12} className="search-icon" />
            <input
              type="text"
              placeholder="Search history..."
              value={historySearchQuery}
              onChange={(e) => setHistorySearchQuery(e.target.value)}
              className="ddo-sidebar-search-input"
            />
          </div>
          {renderHistoryList()}
        </div>
      )}

      {/* 2. Main Translation Chat Workspace */}
      <div className="ddo-translator-main">
        {/* Header toolbar */}
        <div className="ddo-translator-header">
          <div className="ddo-header-left">
            {/* Sidebar Toggle Trigger (History / Recents) */}
            <button
              type="button"
              onClick={() => {
                setIsHistoryOpen(!isHistoryOpen);
              }}
              className={`ddo-header-btn ${isHistoryOpen ? 'active' : ''}`}
              title="History"
            >
              <Sidebar size={14} />
            </button>
            <span className="ddo-translator-title">AI Translator</span>
          </div>

          <div className="ddo-header-right">
            {/* Swap button inside header */}
            <button
              type="button"
              onClick={handleSwap}
              disabled={messages.length === 0 || isLoading || isOcrLoading}
              className="ddo-header-btn swap-languages-btn"
              title="Swap Languages"
            >
              <ArrowLeftRight size={13} />
            </button>

            {/* Target/Output Language Selector */}
            <CustomSelect
              key={visible}
              value={targetLang}
              onChange={setTargetLang}
              options={LANGUAGES}
              placeholder="Select Target"
              isDarkHeader={true}
            />

            {/* Maximize / Minimize toggle button */}
            <button
              type="button"
              onClick={() => {
                setIsExpanded(!isExpanded);
              }}
              className="ddo-header-btn"
              title={isExpanded ? 'Minimize' : 'Maximize'}
            >
              {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>

            {/* Close button */}
            <button
              type="button"
              onClick={() => onVisibilityChange && onVisibilityChange(false)}
              className="ddo-header-btn close-btn"
              title="Close Translator"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* 3. Floating History Menu Dropdown (Compact mode) */}
        {!isExpanded && isHistoryOpen && (
          <div className="ddo-floating-history-menu">
            <div className="ddo-floating-history-header">
              <button type="button" onClick={handleNewTranslation} className="ddo-new-chat-btn">
                <Plus size={11} /> <span>New Conversation</span>
              </button>
              <button type="button" onClick={() => setIsHistoryOpen(false)} className="ddo-close-history-btn">
                <X size={12} />
              </button>
            </div>
            <div className="ddo-sidebar-search">
              <Search size={11} className="search-icon" />
              <input
                type="text"
                placeholder="Search history..."
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                className="ddo-sidebar-search-input"
              />
            </div>
            {renderHistoryList()}
          </div>
        )}

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/png, image/jpeg, image/jpg, image/webp"
          style={{ display: 'none' }}
        />

        {/* 5. Chat Input Composer (ChatGPT Style) */}
        <div className="ddo-chat-composer-wrapper">
          {/* Small Image Scanner & Preview Bar above Composer */}
          {imagePreviewUrl && (
            <div className="ddo-image-preview-bar">
              <div className="preview-image-wrapper">
                <img src={imagePreviewUrl} alt="Preview" />
              </div>
              <div className="preview-status-details">
                {isOcrLoading ? (
                  <span>
                    <Loader2 className="spinner" size={12} />
                    <span>{statusText || 'Scanning photo...'}</span>
                  </span>
                ) : error ? (
                  <span>{error}</span>
                ) : (
                  <span>Text detected</span>
                )}
              </div>
              <div className="preview-actions">
                {error && (
                  <button type="button" onClick={handleRetryOcr} className="preview-action-btn" title="Retry OCR">
                    <RefreshCw size={11} /> <span>Retry</span>
                  </button>
                )}
                <button type="button" onClick={handleRemoveImage} className="preview-action-btn remove" title="Remove Photo">
                  <X size={11} /> <span>Remove</span>
                </button>
              </div>
            </div>
          )}

          {/* Large rounded input composer box */}
          <div className="ddo-chat-composer-box">
            {/* Attachment + Button */}
            <div className="ddo-composer-left">
              <button
                type="button"
                onClick={() => {
                  setIsAttachMenuOpen(!isAttachMenuOpen);
                }}
                className={`ddo-composer-btn attach-trigger ${isAttachMenuOpen ? 'active' : ''}`}
                title="Attachment menu"
              >
                <Plus size={14} />
              </button>

              {isAttachMenuOpen && (
                <div className="ddo-composer-attach-dropdown">
                  <button type="button" onClick={handleUploadClick} className="ddo-attach-dropdown-item">
                    <ImageIcon size={11} /> <span>Upload Photo</span>
                  </button>
                  <button type="button" onClick={handleOpenCamera} className="ddo-attach-dropdown-item">
                    <Camera size={11} /> <span>Open Camera</span>
                  </button>
                </div>
              )}
            </div>

            {/* Input Composer area (textarea or camera/image previews) */}
            <div className="ddo-composer-middle">
              {isCameraOpen ? (
                /* Compact Video Stream Preview */
                <div className="ddo-composer-camera-panel">
                  {!capturedPhoto ? (
                    <video ref={videoRef} className="ddo-composer-video" autoPlay playsInline />
                  ) : (
                    <img src={capturedPhoto} className="ddo-composer-video-captured" alt="Captured" />
                  )}
                  <div className="ddo-composer-camera-actions">
                    {!capturedPhoto ? (
                      <>
                        <button type="button" onClick={handleCapture} className="ddo-camera-btn capture-btn-action">Capture</button>
                        <button type="button" onClick={handleCloseCamera} className="ddo-camera-btn cancel-btn-action">Cancel</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={handleUsePhoto} className="ddo-camera-btn use-btn-action">Use Photo</button>
                        <button type="button" onClick={handleRetake} className="ddo-camera-btn retake-btn-action">Retake</button>
                        <button type="button" onClick={handleCloseCamera} className="ddo-camera-btn cancel-btn-action">Cancel</button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                /* Standard Textarea Chat Composer */
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Type, paste, speak, or add an image..."
                  className="ddo-composer-textarea"
                  maxLength={1000}
                />
              )}
            </div>

            {/* Mic and ChatGPT send/translate button */}
            {!isCameraOpen && (
              <div className="ddo-composer-right">
                {/* Voice recording mic trigger */}
                <button
                  type="button"
                  onClick={handleToggleVoice}
                  className={`ddo-composer-btn mic-btn ${isRecording ? 'recording-active' : ''}`}
                  title={isRecording ? 'Recording... click to stop' : 'Start voice input'}
                >
                  <Mic size={14} />
                </button>

                {/* Submit Send translate button */}
                <button
                  type="button"
                  onClick={handleTranslate}
                  disabled={isLoading || isOcrLoading || !inputText.trim()}
                  className="ddo-composer-btn send-btn"
                  title="Translate"
                >
                  {isLoading ? <Loader2 className="spinner" size={13} /> : <Send size={13} />}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 4. Chat Feed Area (Output block & status) */}
        <div className="ddo-translator-chat-area" ref={chatAreaRef}>
          {/* Detected language label shown above conversation */}
          {detectedLangName && (
            <div className="ddo-conversation-detected-lang">
              <span>Detected: {detectedLangName}</span>
            </div>
          )}

          {/* Conversation chat bubbles */}
          {messages.map((msg) => (
            <div key={msg.id} className="ddo-chat-message-pair">
              {/* User bubble */}
              <div className="ddo-chat-bubble ddo-bubble-user">
                <div className="ddo-bubble-header">You</div>
                <div className="ddo-bubble-body">{msg.userText}</div>
              </div>

              {/* Translation response bubble */}
              <div className={`ddo-chat-bubble ddo-bubble-translation ${msg.isPinned ? 'pinned-msg' : ''}`}>
                <div className="ddo-bubble-header">
                  <span>{getLanguageName(msg.targetLang)}</span>
                  <div className="ddo-bubble-actions">
                    <button
                      type="button"
                      onClick={() => handleCopyMessage(msg.translatedText)}
                      className="ddo-bubble-action-btn"
                      title="Copy Translation"
                    >
                      {copiedText === msg.translatedText ? <Check size={11} className="copied-icon" /> : <Copy size={11} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePinMessage(msg.id)}
                      className={`ddo-bubble-action-btn ${msg.isPinned ? 'pinned' : ''}`}
                      title={msg.isPinned ? 'Unpin Message' : 'Pin Message'}
                    >
                      <Pin size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteMessage(msg.id)}
                      className="ddo-bubble-action-btn delete"
                      title="Delete Message"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
                <div className="ddo-bubble-body">{msg.translatedText}</div>
                {msg.detectedLang && msg.sourceLang === 'auto' && (
                  <div className="ddo-bubble-detected-info">
                    Detected: {getLanguageName(msg.detectedLang)}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Welcome state when conversation is empty */}
          {messages.length === 0 && (
            <div className="ddo-chat-empty-state">
              <div className="ddo-chat-empty-icon">
                <Languages size={24} />
              </div>
              <p>Type above to start translating...</p>
            </div>
          )}

          {/* Loader status overlay */}
          {((isLoading && messages.length === 0) || (isOcrLoading && !imagePreviewUrl)) && (
            <div className="ddo-translator-status-overlay">
              <Loader2 className="spinner" size={20} />
              {statusText && (
                <span className="status-label-text">
                  {statusText}
                </span>
              )}
            </div>
          )}

          {/* Error Banner */}
          {error && !imagePreviewUrl && (
            <div className="ddo-translator-error">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
