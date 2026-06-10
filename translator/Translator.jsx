import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeftRight, Copy, Trash2, Check, AlertCircle, Loader2, Camera, ChevronDown } from 'lucide-react';
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

const TESSERACT_LANGS = {
  auto: 'eng',
  en: 'eng',
  es: 'spa',
  fr: 'fra',
  de: 'deu',
  it: 'ita',
  pt: 'por',
  zh: 'chi_sim',
  ja: 'jpn',
  ko: 'kor',
  ru: 'rus',
  ar: 'ara',
  hi: 'hin'
};

const loadScript = (url) => {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) {
      resolve(window.Tesseract);
      return;
    }
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      const handleLoad = () => resolve(window.Tesseract);
      const handleError = () => reject(new Error('Failed to load Tesseract'));
      existing.addEventListener('load', handleLoad);
      existing.addEventListener('error', handleError);
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => reject(new Error('Failed to load Tesseract.js'));
    document.body.appendChild(script);
  });
};

function CustomSelect({ value, onChange, options, placeholder }) {
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
    <div className="ddo-custom-select" ref={dropdownRef}>
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

function ScreenCaptureOverlay({ onCapture, onCancel, sourceLang }) {
  const canvasRef = useRef(null);
  const [screenshotCanvas, setScreenshotCanvas] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState(null);
  const [currentPos, setCurrentPos] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    let stream = null;
    let video = null;

    const startCapture = async () => {
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: 'monitor' },
          audio: false
        });

        video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;

        video.onloadedmetadata = () => {
          setTimeout(() => {
            if (!video.videoWidth || !video.videoHeight) {
              setErrorMsg('Captured screen size is invalid.');
              setIsInitializing(false);
              return;
            }
            const hiddenCanvas = document.createElement('canvas');
            hiddenCanvas.width = video.videoWidth;
            hiddenCanvas.height = video.videoHeight;
            const ctx = hiddenCanvas.getContext('2d');
            ctx.drawImage(video, 0, 0, hiddenCanvas.width, hiddenCanvas.height);

            setScreenshotCanvas(hiddenCanvas);
            setIsInitializing(false);

            if (stream) {
              stream.getTracks().forEach(track => track.stop());
            }
          }, 400);
        };
      } catch (err) {
        console.error('Error in startCapture:', err);
        setErrorMsg('Screen capture was cancelled or failed.');
        setIsInitializing(false);
        setTimeout(() => {
          onCancel();
        }, 1500);
      }
    };

    startCapture();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!screenshotCanvas || isInitializing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    ctx.drawImage(screenshotCanvas, 0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (startPos && currentPos) {
      const x = Math.min(startPos.x, currentPos.x);
      const y = Math.min(startPos.y, currentPos.y);
      const w = Math.abs(startPos.x - currentPos.x);
      const h = Math.abs(startPos.y - currentPos.y);

      if (w > 0 && h > 0) {
        ctx.clearRect(x, y, w, h);
        
        const origX = (x / canvas.width) * screenshotCanvas.width;
        const origY = (y / canvas.height) * screenshotCanvas.height;
        const origW = (w / canvas.width) * screenshotCanvas.width;
        const origH = (h / canvas.height) * screenshotCanvas.height;

        ctx.drawImage(screenshotCanvas, origX, origY, origW, origH, x, y, w, h);

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = '#ffffff';
        ctx.font = '12px monospace';
        ctx.fillText(`${Math.round(origW)} x ${Math.round(origH)}`, x + 5, y + 18);
      }
    }
  }, [screenshotCanvas, isInitializing, startPos, currentPos]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const handleMouseDown = (e) => {
    if (!screenshotCanvas || isInitializing) return;
    setIsDragging(true);
    setStartPos({ x: e.clientX, y: e.clientY });
    setCurrentPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !startPos) return;
    setCurrentPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    if (!isDragging || !startPos || !currentPos) return;
    setIsDragging(false);

    const x = Math.min(startPos.x, currentPos.x);
    const y = Math.min(startPos.y, currentPos.y);
    const w = Math.abs(startPos.x - currentPos.x);
    const h = Math.abs(startPos.y - currentPos.y);

    if (w > 10 && h > 10 && screenshotCanvas) {
      const origX = (x / window.innerWidth) * screenshotCanvas.width;
      const origY = (y / window.innerHeight) * screenshotCanvas.height;
      const origW = (w / window.innerWidth) * screenshotCanvas.width;
      const origH = (h / window.innerHeight) * screenshotCanvas.height;

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = origW;
      cropCanvas.height = origH;
      const cropCtx = cropCanvas.getContext('2d');
      cropCtx.drawImage(screenshotCanvas, origX, origY, origW, origH, 0, 0, origW, origH);

      onCapture(cropCanvas);
    } else {
      onCancel();
    }
  };

  return (
    <div className="ddo-capture-overlay" onContextMenu={(e) => { e.preventDefault(); onCancel(); }}>
      {isInitializing && (
        <div className="ddo-capture-loader">
          <Loader2 className="spinner" size={28} />
          <span>Starting Screen Capture... Select a screen or window.</span>
        </div>
      )}

      {errorMsg && (
        <div className="ddo-capture-error">
          <AlertCircle size={20} />
          <span>{errorMsg}</span>
        </div>
      )}

      {!isInitializing && !errorMsg && screenshotCanvas && (
        <>
          <div className="ddo-capture-instructions">
            <span>Drag to select a screen region to translate. Click anywhere or press <strong>ESC</strong> to cancel.</span>
            <button type="button" onClick={onCancel} className="ddo-capture-cancel-btn">Cancel</button>
          </div>
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{ display: 'block', width: '100vw', height: '100vh' }}
          />
        </>
      )}
    </div>
  );
}

export default function Translator() {
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('es');
  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [inputCopied, setInputCopied] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState(false);

  useEffect(() => {
    if (!inputText.trim()) {
      setTranslatedText('');
      setError('');
      return;
    }

    const timer = setTimeout(() => {
      performTranslation(inputText, sourceLang, targetLang);
    }, 800);

    return () => clearTimeout(timer);
  }, [inputText, sourceLang, targetLang]);

  const performTranslation = async (textToTranslate, srcLang, tgtLang) => {
    if (!textToTranslate.trim()) return;

    setIsLoading(true);
    setError('');

    try {
      const src = srcLang === 'auto' ? 'autodetect' : srcLang;
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
        textToTranslate.trim()
      )}&langpair=${src}|${tgtLang}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Translation request failed.');
      }

      const data = await response.json();
      if (data.responseStatus === 200) {
        setTranslatedText(data.responseData.translatedText);
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

  const handleTranslate = () => {
    performTranslation(inputText, sourceLang, targetLang);
  };

  const runOCR = async (canvas) => {
    try {
      await loadScript('https://unpkg.com/tesseract.js@5.1.0/dist/tesseract.min.js');
      if (!window.Tesseract) {
        throw new Error('Tesseract.js library failed to load.');
      }

      const tesseractLang = TESSERACT_LANGS[sourceLang] || 'eng';
      const worker = await window.Tesseract.createWorker(tesseractLang);
      const result = await worker.recognize(canvas);
      await worker.terminate();

      return result.data.text;
    } catch (err) {
      console.error('OCR run failed:', err);
      throw new Error('OCR failed. Could not recognize text.');
    }
  };

  const handleScreenCapture = async (cropCanvas) => {
    setIsCapturing(false);
    setIsOcrLoading(true);
    setError('');
    setTranslatedText('');

    try {
      const text = await runOCR(cropCanvas);
      if (!text || !text.trim()) {
        throw new Error('No text found in selected area.');
      }
      setInputText(text);
      await performTranslation(text, sourceLang, targetLang);
    } catch (err) {
      console.error(err);
      setError(err.message || 'OCR failed or no text found.');
    } finally {
      setIsOcrLoading(false);
    }
  };

  const handleSwap = () => {
    const prevSource = sourceLang;
    const prevTarget = targetLang;

    if (prevSource === 'auto') {
      setSourceLang(prevTarget);
      setTargetLang(prevTarget === 'en' ? 'es' : 'en');
    } else {
      setSourceLang(prevTarget);
      setTargetLang(prevSource);
    }

    if (translatedText) {
      setInputText(translatedText);
      setTranslatedText(inputText);
    }
  };

  const handleClear = () => {
    setInputText('');
    setTranslatedText('');
    setError('');
  };

  const handleCopyInput = () => {
    if (!inputText) return;
    navigator.clipboard.writeText(inputText);
    setInputCopied(true);
    setTimeout(() => setInputCopied(false), 2000);
  };

  const handleCopyResult = () => {
    if (!translatedText) return;
    navigator.clipboard.writeText(translatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sourceOptions = [{ code: 'auto', name: 'Auto Detect' }, ...LANGUAGES];

  return (
    <div className="ddo-translator-container">
      {/* Custom Select Dropdowns */}
      <div className="ddo-translator-languages">
        <CustomSelect
          value={sourceLang}
          onChange={setSourceLang}
          options={sourceOptions}
          placeholder="Auto Detect"
        />

        <button
          type="button"
          onClick={handleSwap}
          className="ddo-translator-btn-icon swap-btn"
          title="Swap Languages"
        >
          <ArrowLeftRight size={14} />
        </button>

        <CustomSelect
          value={targetLang}
          onChange={setTargetLang}
          options={LANGUAGES}
          placeholder="Select Target"
        />
      </div>

      {/* Input Text Area */}
      <div className="ddo-translator-input-wrapper">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type or paste text, or use Screen Select..."
          className="ddo-translator-textarea"
          maxLength={1000}
        />
        {inputText && (
          <div className="ddo-translator-textarea-controls">
            <button
              type="button"
              onClick={handleCopyInput}
              className="ddo-translator-textarea-btn"
              title="Copy Source Text"
            >
              {inputCopied ? <Check size={12} className="copied-icon" /> : <Copy size={12} />}
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="ddo-translator-textarea-btn"
              title="Clear All"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Action Buttons Row */}
      <div className="ddo-translator-actions-row">
        <button
          type="button"
          onClick={() => setIsCapturing(true)}
          disabled={isLoading || isOcrLoading}
          className="ddo-translator-action-btn capture-btn"
          title="Capture screen area and translate"
        >
          <Camera size={13} />
          <span>Screen Select</span>
        </button>

        <button
          type="button"
          onClick={handleTranslate}
          disabled={isLoading || isOcrLoading || !inputText.trim()}
          className="ddo-translator-action-btn translate-btn"
        >
          {isLoading ? (
            <>
              <Loader2 className="spinner" size={13} />
              <span>Translating...</span>
            </>
          ) : (
            <span>Translate</span>
          )}
        </button>
      </div>

      {/* Result Text Area */}
      <div className="ddo-translator-result-wrapper">
        {(isLoading || isOcrLoading) && (
          <div className="ddo-translator-status-overlay">
            <Loader2 className="spinner" size={24} />
            {isOcrLoading && <span style={{ fontSize: '12px', marginTop: '6px', color: '#fff' }}>Running OCR...</span>}
          </div>
        )}

        {error && (
          <div className="ddo-translator-error">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        <textarea
          readOnly
          value={translatedText}
          placeholder="Translation will appear here..."
          className="ddo-translator-textarea result-textarea"
        />

        {translatedText && (
          <button
            type="button"
            onClick={handleCopyResult}
            className="ddo-translator-copy-btn"
            title="Copy Translation"
          >
            {copied ? <Check size={12} className="copied-icon" /> : <Copy size={12} />}
          </button>
        )}
      </div>

      {/* Footer Details */}
      <div className="ddo-translator-footer">
        <span>{inputText.length}/1000 characters</span>
      </div>

      {/* Full Screen Selection Mode Overlay */}
      {isCapturing && (
        <ScreenCaptureOverlay
          sourceLang={sourceLang}
          onCapture={handleScreenCapture}
          onCancel={() => setIsCapturing(false)}
        />
      )}
    </div>
  );
}
