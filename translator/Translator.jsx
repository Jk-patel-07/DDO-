import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeftRight, Copy, Trash2, Check, AlertCircle, Loader2, Camera, ChevronDown, Plus, Image as ImageIcon, RefreshCw, X } from 'lucide-react';
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

export default function Translator() {
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('es');
  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [inputCopied, setInputCopied] = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [statusText, setStatusText] = useState(''); // "Reading text", "Translating", "No text found"

  // Photo & Camera States
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null); // base64 or blob URL
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const activeStreamRef = useRef(null);

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

  // Clean up camera stream if popup is closed or component unmounts
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => track.stop());
      activeStreamRef.current = null;
    }
  };

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

  const runOCRFromBase64 = async (base64Image) => {
    try {
      const tesseractLang = TESSERACT_LANGS[sourceLang] || 'eng';
      const worker = await createWorker(tesseractLang);
      const imageUri = `data:image/png;base64,${base64Image}`;
      const result = await worker.recognize(imageUri);
      await worker.terminate();

      return result.data.text;
    } catch (err) {
      console.error('OCR run failed:', err);
      throw new Error('OCR failed. Could not recognize text.');
    }
  };

  // Upload Photo Handlers
  const handleUploadClick = () => {
    setIsAttachMenuOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input value so same file can be uploaded again if removed
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result;
        if (!base64Data || typeof base64Data !== 'string') {
          throw new Error('Failed to read image file contents.');
        }

        setImagePreviewUrl(base64Data);
        setIsOcrLoading(true);
        setStatusText('Reading text');
        setError('');
        setTranslatedText('');

        const splitData = base64Data.split(',');
        const rawBase64 = splitData[1];
        if (!rawBase64) {
          throw new Error('Invalid image file encoding format.');
        }

        const text = await runOCRFromBase64(rawBase64);

        if (!text || !text.trim()) {
          setStatusText('No text found');
          throw new Error('No text found');
        }

        setInputText(text);
        setStatusText('Translating');
        await performTranslation(text, sourceLang, targetLang);
        setStatusText('');
        setIsOcrLoading(false);
      } catch (err) {
        console.error(err);
        if (err.message === 'No text found') {
          setError('No text found in photo.');
          setStatusText('No text found');
        } else {
          setError(err.message || 'OCR extraction failed.');
          setStatusText('');
        }
        setIsOcrLoading(false);
      }
    };

    reader.onerror = () => {
      setError('Failed to read image file.');
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
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 150);
    } catch (err) {
      console.error('Camera access failed:', err);
      setError('Camera access failed. Check permissions.');
      setIsCameraOpen(false);
    }
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
      
      const dataUrl = canvas.toDataURL('image/png');
      setCapturedPhoto(dataUrl);
      stopCamera();
    } catch (err) {
      console.error('Frame capture failed:', err);
      setError('Failed to capture frame from camera.');
    }
  };

  const handleRetake = async () => {
    setCapturedPhoto(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      activeStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Camera access failed on retake:', err);
      setError('Camera access failed. Close panel and retry.');
      setIsCameraOpen(false);
    }
  };

  const handleUsePhoto = async () => {
    if (!capturedPhoto) return;

    setIsCameraOpen(false);
    setImagePreviewUrl(capturedPhoto);
    
    setIsOcrLoading(true);
    setStatusText('Reading text');
    setError('');
    setTranslatedText('');

    try {
      const splitData = capturedPhoto.split(',');
      const rawBase64 = splitData[1];
      if (!rawBase64) {
        throw new Error('Invalid captured image encoding format.');
      }

      const text = await runOCRFromBase64(rawBase64);

      if (!text || !text.trim()) {
        setStatusText('No text found');
        throw new Error('No text found');
      }

      setInputText(text);
      setStatusText('Translating');
      await performTranslation(text, sourceLang, targetLang);
      setStatusText('');
      setIsOcrLoading(false);
    } catch (err) {
      console.error(err);
      if (err.message === 'No text found') {
        setError('No text found in captured photo.');
        setStatusText('No text found');
      } else {
        setError(err.message || 'OCR extraction failed.');
        setStatusText('');
      }
      setIsOcrLoading(false);
    }
  };

  const handleCloseCamera = () => {
    stopCamera();
    setIsCameraOpen(false);
    setCapturedPhoto(null);
  };

  // Image controls
  const handleRemoveImage = () => {
    setImagePreviewUrl(null);
    setInputText('');
    setTranslatedText('');
    setError('');
    setStatusText('');
  };

  const handleRetryOcr = async () => {
    if (!imagePreviewUrl) return;

    setIsOcrLoading(true);
    setStatusText('Reading text');
    setError('');
    setTranslatedText('');

    try {
      const splitData = imagePreviewUrl.split(',');
      const rawBase64 = splitData[1];
      if (!rawBase64) {
        throw new Error('Invalid image encoding format.');
      }

      const text = await runOCRFromBase64(rawBase64);

      if (!text || !text.trim()) {
        setStatusText('No text found');
        throw new Error('No text found');
      }

      setInputText(text);
      setStatusText('Translating');
      await performTranslation(text, sourceLang, targetLang);
      setStatusText('');
      setIsOcrLoading(false);
    } catch (err) {
      console.error(err);
      if (err.message === 'No text found') {
        setError('No text found in photo.');
        setStatusText('No text found');
      } else {
        setError(err.message || 'OCR extraction failed.');
        setStatusText('');
      }
      setIsOcrLoading(false);
    }
  };

  const handleClear = () => {
    setInputText('');
    setTranslatedText('');
    setError('');
    setStatusText('');
    setImagePreviewUrl(null);
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

  const handleSwap = () => {
    if (sourceLang === 'auto') return;

    const prevSource = sourceLang;
    const prevTarget = targetLang;

    setSourceLang(prevTarget);
    setTargetLang(prevSource);

    const prevInput = inputText;
    const prevTranslated = translatedText;

    setInputText(prevTranslated || '');
    setTranslatedText(prevInput || '');

    setError('');
    setStatusText('');
  };

  const sourceOptions = [{ code: 'auto', name: 'Auto Detect' }, ...LANGUAGES];

  return (
    <div className="ddo-translator-container">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/png, image/jpeg, image/jpg, image/webp"
        style={{ display: 'none' }}
      />

      {/* Language selectors */}
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
          disabled={sourceLang === 'auto' || isLoading || isOcrLoading}
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

      {/* Input area */}
      <div className="ddo-translator-input-wrapper">
        {isCameraOpen ? (
          /* Camera Preview */
          <div className="ddo-translator-camera-panel">
            {!capturedPhoto ? (
              <video ref={videoRef} className="ddo-translator-video" autoPlay playsInline />
            ) : (
              <img src={capturedPhoto} className="ddo-translator-video-captured" alt="Captured" />
            )}
            
            <div className="ddo-translator-camera-actions">
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
        ) : imagePreviewUrl ? (
          /* Image Preview and Controls (Replaces source textarea) */
          <div className="ddo-translator-preview-container">
            <img src={imagePreviewUrl} className="ddo-translator-image-preview" alt="Preview" />
            <div className="ddo-translator-preview-actions">
              <button type="button" onClick={handleRetryOcr} className="preview-action-btn" title="Retry OCR">
                <RefreshCw size={12} /> <span>Retry</span>
              </button>
              <button type="button" onClick={handleRemoveImage} className="preview-action-btn remove" title="Remove Photo">
                <X size={12} /> <span>Remove</span>
              </button>
            </div>
          </div>
        ) : (
          /* Textarea for typing text */
          <>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type or paste text, or select an image..."
              className="ddo-translator-textarea"
              maxLength={1000}
            />
            <div className="ddo-translator-textarea-controls">
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setIsAttachMenuOpen(!isAttachMenuOpen)}
                  className={`ddo-translator-textarea-btn attach-btn ${isAttachMenuOpen ? 'active' : ''}`}
                  title="Attach Photo or Camera"
                >
                  <Plus size={12} />
                </button>
                {isAttachMenuOpen && (
                  <div className="ddo-attach-dropdown">
                    <button type="button" onClick={handleUploadClick} className="ddo-attach-item">
                      <ImageIcon size={12} /> <span>Upload Photo</span>
                    </button>
                    <button type="button" onClick={handleOpenCamera} className="ddo-attach-item">
                      <Camera size={12} /> <span>Open Camera</span>
                    </button>
                  </div>
                )}
              </div>
              {inputText && (
                <>
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
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Manual Translate Action (Only shown when camera is closed) */}
      {!isCameraOpen && (
        <button
          type="button"
          onClick={handleTranslate}
          disabled={isLoading || isOcrLoading || (!inputText.trim() && !imagePreviewUrl)}
          className="ddo-translator-submit-btn"
        >
          {isLoading && statusText === 'Translating' ? (
            <>
              <Loader2 className="spinner" size={13} />
              <span>Translating...</span>
            </>
          ) : (
            <span>Translate</span>
          )}
        </button>
      )}

      {/* Result area */}
      <div className="ddo-translator-result-wrapper">
        {(isLoading || isOcrLoading) && (
          <div className="ddo-translator-status-overlay">
            <Loader2 className="spinner" size={24} />
            {statusText && (
              <span style={{ fontSize: '12px', marginTop: '6px', color: '#fff' }}>
                {statusText === 'Reading text' ? 'Reading text...' :
                 statusText === 'Translating' ? 'Translating...' : statusText}
              </span>
            )}
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

      {/* Footer details */}
      <div className="ddo-translator-footer">
        {imagePreviewUrl ? (
          <span>Image loaded</span>
        ) : (
          <span>{inputText.length}/1000 characters</span>
        )}
      </div>
    </div>
  );
}
