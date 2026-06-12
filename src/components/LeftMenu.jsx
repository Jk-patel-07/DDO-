import { useEffect, useRef, useState } from 'react';
import {
  Clipboard,
  ClipboardPaste,
  Copy,
  Eraser,
  MoonStar,
  PanelsTopLeft,
  Power,
  Redo2,
  Scissors,
  Settings,
  SquareTerminal,
  Undo2,
} from 'lucide-react';
import { createAuthHeaders } from '../utils/appAuth';
import { buildApiUrl } from '../utils/api';
import { useDraggablePopup } from '../utils/useDraggablePopup';

const YOUTUBE_SHORTS_URL = 'https://www.youtube.com/shorts';
const BACKGROUND_ANIMATION_STORAGE_KEY = 'background_animation_mode';
const SEARCH_BOX_ANIMATION_STORAGE_KEY = 'search_box_animation_mode';

const openExternalUrl = (url) => {
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

const WindowsStatusIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    aria-hidden="true"
    className="windows-status-icon"
  >
    <path d="M1.7 2.3 6 1.65v4.55H1.7z" fill="currentColor" />
    <path d="M7 1.5 12.3.72v5.48H7z" fill="currentColor" />
    <path d="M1.7 7.15H6v4.55l-4.3-.62z" fill="currentColor" />
    <path d="M7 7.15h5.3v5.48L7 11.88z" fill="currentColor" />
  </svg>
);

const requestSleepMode = async () => {
  const response = await fetch(buildApiUrl('/api/system/sleep'), {
    method: 'POST',
    headers: {
      ...createAuthHeaders({
        'Content-Type': 'application/json',
      }),
    },
  });

  if (!response.ok) {
    throw new Error('Unable to put the computer to sleep right now.');
  }
};

const LeftMenu = ({ onPopupStateChange = () => {} }) => {
  const wrapperRef = useRef(null);
  const animationDrag = useDraggablePopup('left-animation');
  const animationPopupRef = animationDrag.popupRef;
  const moreAnimationDrag = useDraggablePopup('left-more-animation');
  const moreAnimationPopupRef = moreAnimationDrag.popupRef;
  const functionDrag = useDraggablePopup('left-function');
  const functionPopupRef = functionDrag.popupRef;
  const confirmDrag = useDraggablePopup('left-confirm');
  const confirmPopupRef = confirmDrag.popupRef;
  const sleepDrag = useDraggablePopup('left-sleep');
  const sleepPopupRef = sleepDrag.popupRef;
  const [isViewPopupOpen, setIsViewPopupOpen] = useState(false);
  const [isWindowPopupOpen, setIsWindowPopupOpen] = useState(false);
  const [isEditPopupOpen, setIsEditPopupOpen] = useState(false);
  const [isFilePopupOpen, setIsFilePopupOpen] = useState(false);
  const [isHelpPopupOpen, setIsHelpPopupOpen] = useState(false);
  const [isAnimationPopupOpen, setIsAnimationPopupOpen] = useState(false);
  const [isMoreAnimationPopupOpen, setIsMoreAnimationPopupOpen] = useState(false);
  const [isFunctionPopupOpen, setIsFunctionPopupOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [isSleepPopupOpen, setIsSleepPopupOpen] = useState(false);
  const [sleepDurationValue, setSleepDurationValue] = useState('5');
  const [sleepDurationUnit, setSleepDurationUnit] = useState('minutes');
  const [sleepCountdownSeconds, setSleepCountdownSeconds] = useState(0);
  const [sleepError, setSleepError] = useState('');
  const [isBackgroundAnimationEnabled, setIsBackgroundAnimationEnabled] = useState(() => {
    try {
      const storedMode = localStorage.getItem(BACKGROUND_ANIMATION_STORAGE_KEY);
      return storedMode !== 'off';
    } catch {
      return true;
    }
  });
  const [isSearchBoxAnimationEnabled, setIsSearchBoxAnimationEnabled] = useState(() => {
    try {
      const storedMode = localStorage.getItem(SEARCH_BOX_ANIMATION_STORAGE_KEY);
      return storedMode !== 'off';
    } catch {
      return true;
    }
  });
  const menuItems = ['window-icon', 'File', 'Edit', 'View', 'Help'];
  const viewOptions = ['Shorts', 'Reel', 'Movie', 'Series'];
  const windowOptions = [
    { label: 'Settings', icon: Settings, endpoint: '/api/system/settings' },
    { label: 'Control Panel', icon: PanelsTopLeft, endpoint: '/api/system/control-panel' },
    { label: 'Task Manager', icon: SquareTerminal, endpoint: '/api/system/task-manager' },
    {
      label: 'Power Off',
      icon: Power,
      endpoint: '/api/system/power-off',
      confirmationTitle: 'Power Off',
      confirmationMessage: 'Are you sure you want to shut down?',
      confirmLabel: 'Shut Down',
      tone: 'danger',
    },
    {
      label: 'Sleep',
      icon: MoonStar,
      endpoint: '/api/system/sleep',
    },
  ];
  const functionOptions = [
    { label: 'Copy', icon: Copy, action: 'copy' },
    { label: 'Paste', icon: ClipboardPaste, action: 'paste' },
    { label: 'Cut', icon: Scissors, action: 'cut' },
    { label: 'Undo', icon: Undo2, action: 'undo' },
    { label: 'Redo', icon: Redo2, action: 'redo' },
    { label: 'Select All', icon: Clipboard, action: 'selectAll' },
    { label: 'Clear', icon: Eraser, action: 'clear' },
  ];

  const formatCountdown = (totalSeconds) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (animationPopupRef.current && animationPopupRef.current.contains(event.target)) {
        return;
      }

      if (moreAnimationPopupRef.current && moreAnimationPopupRef.current.contains(event.target)) {
        return;
      }

      if (functionPopupRef.current && functionPopupRef.current.contains(event.target)) {
        return;
      }

      if (confirmPopupRef.current && confirmPopupRef.current.contains(event.target)) {
        return;
      }

      if (sleepPopupRef.current && sleepPopupRef.current.contains(event.target)) {
        return;
      }

      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsViewPopupOpen(false);
        setIsWindowPopupOpen(false);
        setIsEditPopupOpen(false);
        setIsFilePopupOpen(false);
        setIsHelpPopupOpen(false);
        setIsAnimationPopupOpen(false);
        setIsMoreAnimationPopupOpen(false);
        setIsFunctionPopupOpen(false);
        setConfirmAction(null);
        if (sleepCountdownSeconds <= 0) {
          setIsSleepPopupOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [sleepCountdownSeconds]);

  useEffect(() => {
    onPopupStateChange(
      isViewPopupOpen
        || isWindowPopupOpen
        || isEditPopupOpen
        || isFilePopupOpen
        || isHelpPopupOpen
        || isAnimationPopupOpen
        || isMoreAnimationPopupOpen
        || isFunctionPopupOpen
        || Boolean(confirmAction)
        || isSleepPopupOpen,
    );
  }, [
    confirmAction,
    isAnimationPopupOpen,
    isEditPopupOpen,
    isFilePopupOpen,
    isHelpPopupOpen,
    isFunctionPopupOpen,
    isMoreAnimationPopupOpen,
    isSleepPopupOpen,
    isViewPopupOpen,
    isWindowPopupOpen,
    onPopupStateChange,
  ]);

  useEffect(() => {
    document.body.dataset.animations = isBackgroundAnimationEnabled ? 'on' : 'off';

    try {
      localStorage.setItem(
        BACKGROUND_ANIMATION_STORAGE_KEY,
        isBackgroundAnimationEnabled ? 'on' : 'off',
      );
    } catch {
      // Ignore persistence errors and keep the current animation mode in memory.
    }
  }, [isBackgroundAnimationEnabled]);

  useEffect(() => {
    document.body.dataset.searchAnimation = isSearchBoxAnimationEnabled ? 'on' : 'off';

    try {
      localStorage.setItem(
        SEARCH_BOX_ANIMATION_STORAGE_KEY,
        isSearchBoxAnimationEnabled ? 'on' : 'off',
      );
    } catch {
      // Ignore persistence errors and keep the current animation mode in memory.
    }
  }, [isSearchBoxAnimationEnabled]);

  const handleViewOptionClick = (option) => {
    if (option === 'Shorts') {
      setIsViewPopupOpen(false);
      openExternalUrl(YOUTUBE_SHORTS_URL);
    }
  };

  const handleWindowOptionClick = async (option) => {
    if (option.label === 'Sleep') {
      setIsWindowPopupOpen(false);
      setConfirmAction(null);
      setSleepError('');
      setIsSleepPopupOpen(true);
      return;
    }

    if (option.confirmationMessage) {
      setIsWindowPopupOpen(false);
      setConfirmAction(option);
      return;
    }

    try {
      const response = await fetch(buildApiUrl(option.endpoint), {
        method: 'POST',
        headers: {
          ...createAuthHeaders({
            'Content-Type': 'application/json',
          }),
        },
      });

      if (!response.ok) {
        throw new Error('Unable to open that Windows app right now.');
      }

      setIsWindowPopupOpen(false);
    } catch (error) {
      window.alert(error.message || 'Unable to open that Windows app right now.');
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) {
      return;
    }

    try {
      const response = await fetch(buildApiUrl(confirmAction.endpoint), {
        method: 'POST',
        headers: {
          ...createAuthHeaders({
            'Content-Type': 'application/json',
          }),
        },
      });

      if (!response.ok) {
        throw new Error(`Unable to ${confirmAction.label.toLowerCase()} right now.`);
      }

      setConfirmAction(null);
    } catch (error) {
      window.alert(error.message || `Unable to ${confirmAction.label.toLowerCase()} right now.`);
    }
  };

  async function handleSleepNow() {
    try {
      setSleepError('');
      await requestSleepMode();
      setSleepCountdownSeconds(0);
      setIsSleepPopupOpen(false);
    } catch (error) {
      setSleepError(error.message || 'Unable to put the computer to sleep right now.');
    }
  }

  function handleStartSleepTimer() {
    const numericValue = Number(sleepDurationValue);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      setSleepError('Enter a valid sleep duration greater than 0.');
      return;
    }

    const unitMultiplier = sleepDurationUnit === 'hours'
      ? 3600
      : sleepDurationUnit === 'minutes'
        ? 60
        : 1;

    const totalSeconds = Math.round(numericValue * unitMultiplier);
    if (totalSeconds <= 0) {
      setSleepError('Enter a valid sleep duration greater than 0.');
      return;
    }

    setSleepError('');
    setSleepCountdownSeconds(totalSeconds);
  }

  function handleCancelSleepTimer() {
    setSleepCountdownSeconds(0);
    setSleepError('');
    setIsSleepPopupOpen(false);
  }

  useEffect(() => {
    if (sleepCountdownSeconds <= 0) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      if (sleepCountdownSeconds <= 1) {
        setSleepCountdownSeconds(0);
        void (async () => {
          try {
            setSleepError('');
            await requestSleepMode();
            setIsSleepPopupOpen(false);
          } catch (error) {
            setSleepError(error.message || 'Unable to put the computer to sleep right now.');
          }
        })();
        return;
      }

      setSleepCountdownSeconds((current) => current - 1);
    }, 1000);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [sleepCountdownSeconds]);

  const handleAnimationModeChange = (isEnabled) => {
    setIsBackgroundAnimationEnabled(isEnabled);
  };

  const getEditableTarget = () => {
    const activeElement = document.activeElement;

    if (
      activeElement instanceof HTMLInputElement
      || activeElement instanceof HTMLTextAreaElement
    ) {
      return activeElement;
    }

    if (activeElement instanceof HTMLElement && activeElement.isContentEditable) {
      return activeElement;
    }

    return null;
  };

  const insertTextIntoEditable = (target, text) => {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? target.value.length;
      target.setRangeText(text, start, end, 'end');
      target.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }

    if (target instanceof HTMLElement && target.isContentEditable) {
      document.execCommand('insertText', false, text);
      return true;
    }

    return false;
  };

  const selectAllEditable = (target) => {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      target.focus();
      target.select();
      return true;
    }

    if (target instanceof HTMLElement && target.isContentEditable) {
      const range = document.createRange();
      range.selectNodeContents(target);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return true;
    }

    return false;
  };

  const clearEditable = (target) => {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      target.value = '';
      target.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }

    if (target instanceof HTMLElement && target.isContentEditable) {
      target.innerHTML = '';
      target.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }

    return false;
  };

  const handleFunctionAction = async (action) => {
    const target = getEditableTarget();

    try {
      switch (action) {
        case 'copy':
          document.execCommand('copy');
          break;
        case 'cut':
          document.execCommand('cut');
          break;
        case 'undo':
          document.execCommand('undo');
          break;
        case 'redo':
          document.execCommand('redo');
          break;
        case 'selectAll':
          if (!target || !selectAllEditable(target)) {
            document.execCommand('selectAll');
          }
          break;
        case 'clear':
          if (target) {
            clearEditable(target);
          }
          break;
        case 'paste': {
          const text = await navigator.clipboard.readText();
          if (target) {
            insertTextIntoEditable(target, text);
          }
          break;
        }
        default:
          break;
      }
    } catch (error) {
      window.alert(error.message || 'That edit function is unavailable right now.');
    }

    setIsFunctionPopupOpen(false);
  };

  return (
    <div ref={wrapperRef} className="flex-center" style={{ gap: '4px' }}>
      {menuItems.map((item) => (
        <div
          key={item}
          className={`left-menu-item-shell ${item === 'View' || item === 'window-icon' || item === 'Edit' || item === 'File' || item === 'Help' ? 'has-popup' : ''}`}
        >
          <button
            type="button"
            className={`flex-center ${item === 'window-icon' ? 'left-window-trigger' : 'menu-item left-menu-button'} ${(item === 'View' && isViewPopupOpen) || (item === 'window-icon' && isWindowPopupOpen) || (item === 'Edit' && isEditPopupOpen) || (item === 'File' && isFilePopupOpen) || (item === 'Help' && isHelpPopupOpen) ? 'is-open' : ''}`}
            onClick={
              item === 'View'
                ? () => {
                    setIsEditPopupOpen(false);
                    setIsFilePopupOpen(false);
                    setIsHelpPopupOpen(false);
                    setIsAnimationPopupOpen(false);
                    setIsMoreAnimationPopupOpen(false);
                    setIsFunctionPopupOpen(false);
                    setIsWindowPopupOpen(false);
                    if (sleepCountdownSeconds <= 0) {
                      setIsSleepPopupOpen(false);
                    }
                    setIsViewPopupOpen((open) => !open);
                  }
                : item === 'window-icon'
                  ? () => {
                      setIsEditPopupOpen(false);
                      setIsFilePopupOpen(false);
                      setIsHelpPopupOpen(false);
                      setIsAnimationPopupOpen(false);
                      setIsMoreAnimationPopupOpen(false);
                      setIsFunctionPopupOpen(false);
                      setIsViewPopupOpen(false);
                      if (sleepCountdownSeconds <= 0) {
                        setIsSleepPopupOpen(false);
                      }
                      setIsWindowPopupOpen((open) => !open);
                    }
                  : item === 'Edit'
                    ? () => {
                      setIsViewPopupOpen(false);
                      setIsFilePopupOpen(false);
                      setIsHelpPopupOpen(false);
                      setIsWindowPopupOpen(false);
                      setIsAnimationPopupOpen(false);
                      setIsMoreAnimationPopupOpen(false);
                      setIsFunctionPopupOpen(false);
                      if (sleepCountdownSeconds <= 0) {
                        setIsSleepPopupOpen(false);
                      }
                      setIsEditPopupOpen((open) => !open);
                    }
                  : item === 'File'
                    ? () => {
                      setIsViewPopupOpen(false);
                      setIsEditPopupOpen(false);
                      setIsHelpPopupOpen(false);
                      setIsWindowPopupOpen(false);
                      setIsAnimationPopupOpen(false);
                      setIsMoreAnimationPopupOpen(false);
                      setIsFunctionPopupOpen(false);
                      if (sleepCountdownSeconds <= 0) {
                        setIsSleepPopupOpen(false);
                      }
                      setIsFilePopupOpen((open) => !open);
                    }
                  : item === 'Help'
                    ? () => {
                      setIsViewPopupOpen(false);
                      setIsEditPopupOpen(false);
                      setIsFilePopupOpen(false);
                      setIsWindowPopupOpen(false);
                      setIsAnimationPopupOpen(false);
                      setIsMoreAnimationPopupOpen(false);
                      setIsFunctionPopupOpen(false);
                      if (sleepCountdownSeconds <= 0) {
                        setIsSleepPopupOpen(false);
                      }
                      setIsHelpPopupOpen((open) => !open);
                    }
                  : undefined
            }
            aria-label={item === 'window-icon' ? 'Open Window menu' : undefined}
            title={item === 'window-icon' ? 'Window' : undefined}
          >
            {item === 'window-icon' ? <WindowsStatusIcon /> : item}
          </button>

          {item === 'View' && isViewPopupOpen ? (
            <div className="view-ai-popup popup-aurora-surface">
              <div className="view-popup-options">
                {viewOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="view-popup-option"
                    onClick={() => handleViewOptionClick(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {item === 'Edit' && isEditPopupOpen ? (
            <div className="view-ai-popup edit-menu-popup popup-aurora-surface">
              <div className="view-popup-options">
                <button
                  type="button"
                  className="view-popup-option window-popup-option"
                  onClick={() => {
                    setIsEditPopupOpen(false);
                    setIsAnimationPopupOpen(true);
                    setIsMoreAnimationPopupOpen(false);
                    setIsFunctionPopupOpen(false);
                  }}
                >
                  <Settings size={14} />
                  <span>Animation</span>
                </button>
                <button
                  type="button"
                  className="view-popup-option window-popup-option"
                  onClick={() => {
                    setIsAnimationPopupOpen(false);
                    setIsMoreAnimationPopupOpen(false);
                    setIsFunctionPopupOpen((open) => !open);
                  }}
                >
                  <SquareTerminal size={14} />
                  <span>Function</span>
                </button>
              </div>
            </div>
          ) : null}

          {item === 'window-icon' && isWindowPopupOpen ? (
            <div className="view-ai-popup window-menu-popup popup-aurora-surface">
              <div className="view-popup-options">
                {windowOptions.map((option) => {
                  const { label, icon: Icon } = option;
                  return (
                  <button
                    key={label}
                    type="button"
                    className="view-popup-option window-popup-option"
                    onClick={() => handleWindowOptionClick(option)}
                  >
                    <Icon size={14} />
                    <span>{label}</span>
                  </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {item === 'File' && isFilePopupOpen ? (
            <div className="view-ai-popup popup-aurora-surface">
              <div className="view-popup-options">
                {['New Tab', 'Open File', 'Save', 'Exit'].map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="view-popup-option"
                    onClick={() => {
                      setIsFilePopupOpen(false);
                      if (option === 'Exit') {
                        if (window.electronAPI?.closeWindow) {
                          window.electronAPI.closeWindow();
                        } else {
                          window.close();
                        }
                      } else {
                        window.alert(`${option} clicked`);
                      }
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {item === 'Help' && isHelpPopupOpen ? (
            <div className="view-ai-popup popup-aurora-surface">
              <div className="view-popup-options">
                {['Documentation', 'Report Issue', 'About DDO'].map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="view-popup-option"
                    onClick={() => {
                      setIsHelpPopupOpen(false);
                      if (option === 'Documentation') {
                        openExternalUrl('https://github.com/Jk-patel-07/DDO-');
                      } else {
                        window.alert(`${option} - Version 1.0.0`);
                      }
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ))}

      {isAnimationPopupOpen ? (
        <div
          ref={animationPopupRef}
          style={animationDrag.dragStyle}
          className="animation-settings-popup popup-aurora-surface"
        >
          <div className="popup-drag-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div className="animation-settings-title" style={{ margin: 0 }}>Animation Settings</div>
            <button type="button" className="popup-drag-btn" {...animationDrag.dragProps}>⠿</button>
          </div>
          <div className="animation-settings-row">
            <div className="animation-settings-copy">
              <strong>Background Animation</strong>
              <span>{isBackgroundAnimationEnabled ? 'Always ON' : 'OFF'}</span>
            </div>

            <button
              type="button"
              className={`animation-toggle-switch ${isBackgroundAnimationEnabled ? 'is-on' : ''}`}
              onClick={() => handleAnimationModeChange(!isBackgroundAnimationEnabled)}
              aria-label="Toggle background animation"
            >
              <span className="animation-toggle-thumb" />
            </button>
          </div>

          <div className="animation-settings-row">
            <div className="animation-settings-copy">
              <strong>Search Box Animation</strong>
              <span>{isSearchBoxAnimationEnabled ? 'Always ON' : 'OFF'}</span>
            </div>

            <button
              type="button"
              className={`animation-toggle-switch ${isSearchBoxAnimationEnabled ? 'is-on' : ''}`}
              onClick={() => setIsSearchBoxAnimationEnabled(!isSearchBoxAnimationEnabled)}
              aria-label="Toggle search box animation"
            >
              <span className="animation-toggle-thumb" />
            </button>
          </div>

          <button
            type="button"
            className="animation-more-button"
            onClick={() => setIsMoreAnimationPopupOpen((open) => !open)}
          >
            More Animation
          </button>
        </div>
      ) : null}

      {isMoreAnimationPopupOpen ? (
        <div
          ref={moreAnimationPopupRef}
          style={moreAnimationDrag.dragStyle}
          className="animation-more-popup popup-aurora-surface"
        >
          <div className="popup-drag-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div className="animation-settings-title" style={{ margin: 0 }}>More Animation</div>
            <button type="button" className="popup-drag-btn" {...moreAnimationDrag.dragProps}>⠿</button>
          </div>
          <div className="animation-more-options">
            {[
              'Background Animation',
              'Button Click Animation',
              'Status Bar Animation',
              'Icon Hover Animation',
              'Popup Open Animation',
            ].map((option) => (
              <button
                key={option}
                type="button"
                className="animation-more-option"
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {isFunctionPopupOpen ? (
        <div
          ref={functionPopupRef}
          style={functionDrag.dragStyle}
          className="function-popup popup-aurora-surface"
        >
          <div className="popup-drag-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div className="animation-settings-title" style={{ margin: 0 }}>Functions</div>
            <button type="button" className="popup-drag-btn" {...functionDrag.dragProps}>⠿</button>
          </div>
          <div className="function-popup-options">
            {functionOptions.map(({ label, icon: Icon, action }) => (
              <button
                key={label}
                type="button"
                className="function-popup-option"
                onClick={() => void handleFunctionAction(action)}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {confirmAction ? (
        <div
          ref={confirmPopupRef}
          style={confirmDrag.dragStyle}
          className="window-confirm-popup popup-aurora-surface"
        >
          <div className="popup-drag-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div className="window-confirm-title" style={{ margin: 0 }}>{confirmAction.confirmationTitle}</div>
            <button type="button" className="popup-drag-btn" {...confirmDrag.dragProps}>⠿</button>
          </div>
          <div className="window-confirm-message">{confirmAction.confirmationMessage}</div>
          <div className="window-confirm-actions">
            <button
              type="button"
              className="window-confirm-button window-confirm-cancel"
              onClick={() => setConfirmAction(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`window-confirm-button window-confirm-accept ${confirmAction.tone === 'danger' ? 'is-danger' : ''}`}
              onClick={() => void handleConfirmAction()}
            >
              {confirmAction.confirmLabel}
            </button>
          </div>
        </div>
      ) : null}

      {isSleepPopupOpen ? (
        <div
          ref={sleepPopupRef}
          style={sleepDrag.dragStyle}
          className="sleep-timer-popup popup-aurora-surface"
        >
          <div className="popup-drag-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div className="window-confirm-title" style={{ margin: 0 }}>Sleep Timer</div>
            <button type="button" className="popup-drag-btn" {...sleepDrag.dragProps}>⠿</button>
          </div>

          <div className="sleep-timer-field">
            <label htmlFor="sleep-duration-input" className="sleep-timer-label">Enter duration</label>
            <div className="sleep-timer-controls">
              <input
                id="sleep-duration-input"
                type="number"
                min="1"
                step="1"
                value={sleepDurationValue}
                onChange={(event) => setSleepDurationValue(event.target.value)}
                className="sleep-timer-input"
              />
              <select
                value={sleepDurationUnit}
                onChange={(event) => setSleepDurationUnit(event.target.value)}
                className="sleep-timer-select"
              >
                <option value="seconds">Seconds</option>
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
              </select>
            </div>
          </div>

          {sleepCountdownSeconds > 0 ? (
            <div className="sleep-timer-countdown">
              Sleeping in <strong>{formatCountdown(sleepCountdownSeconds)}</strong>
            </div>
          ) : null}

          {sleepError ? (
            <div className="sleep-timer-error">{sleepError}</div>
          ) : null}

          <div className="window-confirm-actions sleep-timer-actions">
            <button
              type="button"
              className="window-confirm-button"
              onClick={handleStartSleepTimer}
            >
              Start Timer
            </button>
            <button
              type="button"
              className="window-confirm-button window-confirm-accept"
              onClick={() => void handleSleepNow()}
            >
              Sleep Now
            </button>
            <button
              type="button"
              className="window-confirm-button window-confirm-cancel"
              onClick={handleCancelSleepTimer}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default LeftMenu;
