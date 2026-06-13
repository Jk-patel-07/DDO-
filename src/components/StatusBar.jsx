import { useState, useEffect, useRef, useCallback } from 'react';
import { EyeOff } from 'lucide-react';

import LeftMenu from './LeftMenu';
import RightTray from './RightTray';
import FloatingNavBar from './FloatingNavBar';
import { buildApiUrl } from '../utils/api';
import packageJson from '../../package.json';
import { readStoredAuthSession, createAuthHeaders } from '../utils/appAuth';

const isNewerVersion = (current, latest) => {
  if (!current || !latest) return false;
  const parse = (v) => v.replace(/^DOI-/, '').split('.').map(Number);
  const cParts = parse(current);
  const lParts = parse(latest);
  const len = Math.max(cParts.length, lParts.length);
  for (let i = 0; i < len; i++) {
    const c = cParts[i] || 0;
    const l = lParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
};

const StatusBar = () => {
  const [isVisible, setIsVisible] = useState(true);
  const [permanentlyVisible, setPermanentlyVisible] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showUpdatePopup, setShowUpdatePopup] = useState(false);

  const [isPublishPopupOpen, setIsPublishPopupOpen] = useState(false);
  const [isConfirmPopupOpen, setIsConfirmPopupOpen] = useState(false);
  
  const [pubVersionName, setPubVersionName] = useState('');
  const [pubSize, setPubSize] = useState('');
  const [pubType, setPubType] = useState('');
  const [pubChanges, setPubChanges] = useState('');
  const [pubSecurityChanges, setPubSecurityChanges] = useState('');
  const [pubBugFixes, setPubBugFixes] = useState('');
  const [pubDownloadUrl, setPubDownloadUrl] = useState('');

  // Event listener to open update popup manually triggered from Settings
  useEffect(() => {
    const handleTriggerPopup = (e) => {
      setUpdateInfo(e.detail);
      setShowUpdatePopup(true);
    };

    window.addEventListener('ddo-trigger-update-popup', handleTriggerPopup);
    return () => {
      window.removeEventListener('ddo-trigger-update-popup', handleTriggerPopup);
    };
  }, []);

  const handlePublishClick = () => {
    if (!pubVersionName.trim()) {
      window.alert('Version name is required.');
      return;
    }
    if (!pubSize.trim()) {
      window.alert('Update size is required.');
      return;
    }
    if (!pubType.trim()) {
      window.alert('Update type is required.');
      return;
    }
    if (!pubChanges.trim()) {
      window.alert('What changed details are required.');
      return;
    }
    if (!pubDownloadUrl.trim() || !/^https?:\/\//i.test(pubDownloadUrl)) {
      window.alert('A valid download URL is required (must start with http:// or https://).');
      return;
    }

    setIsConfirmPopupOpen(true);
  };

  const handleConfirmPublish = async () => {
    setIsConfirmPopupOpen(false);
    try {
      const response = await fetch(buildApiUrl('/api/update/publish'), {
        method: 'POST',
        headers: {
          ...createAuthHeaders({
            'Content-Type': 'application/json',
          }),
        },
        body: JSON.stringify({
          versionName: pubVersionName.trim(),
          size: pubSize.trim(),
          type: pubType.trim(),
          changes: pubChanges.split('\n').map(l => l.trim()).filter(Boolean),
          securityChanges: pubSecurityChanges.split('\n').map(l => l.trim()).filter(Boolean),
          bugFixes: pubBugFixes.split('\n').map(l => l.trim()).filter(Boolean),
          downloadUrl: pubDownloadUrl.trim()
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to publish update.');
      }

      window.alert('Update published successfully!');
      setIsPublishPopupOpen(false);
      
      // Clear fields
      setPubVersionName('');
      setPubSize('');
      setPubType('');
      setPubChanges('');
      setPubSecurityChanges('');
      setPubBugFixes('');
      setPubDownloadUrl('');
    } catch (err) {
      window.alert(err.message || 'Error publishing update.');
    }
  };

  const getIsDevUser = () => {
    const session = readStoredAuthSession();
    const user = session?.user;
    const adminEmail = 'admin@ddo.com';
    return !!(user && (user.role === 'admin' || user.role === 'developer' || (user.email && user.email.toLowerCase() === adminEmail)));
  };
  const isDevUser = getIsDevUser();

  const sessionForDoi = readStoredAuthSession();
  const user = sessionForDoi?.user;
  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  const isDevMode =
    import.meta.env.VITE_APP_MODE === "development";

  const isElectron =
    !!window.electronAPI;

  const showDOI = isLocalhost && isDevMode && !isElectron;

  const handleDoiClick = () => {
    const session = readStoredAuthSession();
    const token = session?.token || '';
    window.open(`http://localhost:6000/?token=${encodeURIComponent(token)}`, '_blank', 'noopener,noreferrer');
  };

  console.log("VITE_APP_MODE:", import.meta.env.VITE_APP_MODE);
  console.log("hostname:", window.location.hostname);
  console.log("user role:", user?.role);
  console.log("showDOI:", showDOI);

  useEffect(() => {
    // Check for updates ONLY in production mode (never in localhost/development)
    if (import.meta.env.VITE_APP_MODE !== 'production') {
      return;
    }

    const checkUpdates = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/update/check'));
        if (response.ok) {
          const data = await response.json();
          const currentVersion = packageJson.ddoVersion;
          if (isNewerVersion(currentVersion, data.latestVersion)) {
            setUpdateInfo(data);
            setShowUpdatePopup(true);
          }
        }
      } catch (err) {
        console.error("Failed to check for updates:", err);
      }
    };

    checkUpdates();
  }, []);

  const handleUpdateNow = () => {
    setShowUpdatePopup(false);
    if (typeof window !== 'undefined' && window.electronAPI?.openUpdateWindow) {
      window.electronAPI.openUpdateWindow(updateInfo);
    } else {
      if (updateInfo?.downloadUrl) {
        window.open(updateInfo.downloadUrl, '_blank', 'noopener,noreferrer');
      }
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem('ddo_keep_status_bar_visible', 'false');
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleTogglePermanentlyVisible = (val) => {
    setPermanentlyVisible(val);
    try {
      localStorage.setItem('ddo_keep_status_bar_visible', val ? 'true' : 'false');
    } catch (e) {
      console.error(e);
    }
  };

  const handleHide = () => {
    setIsVisible(false);
    handleTogglePermanentlyVisible(false);
  };

  const actualIsVisible = permanentlyVisible || isVisible;

  useEffect(() => {
    document.body.classList.toggle("ddo-toolbar-visible", actualIsVisible);
    document.body.classList.toggle("ddo-toolbar-hidden", !actualIsVisible);
    document.body.classList.toggle("ddo-visible", actualIsVisible);
    document.body.classList.toggle("ddo-hidden", !actualIsVisible);
  }, [actualIsVisible]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.onShowToolbar) {
      const unsubscribe = window.electronAPI.onShowToolbar(() => {
        setIsVisible(true);
      });
      return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.updateVisibility) {
      window.electronAPI.updateVisibility(actualIsVisible);
    }
  }, [actualIsVisible]);


  const [isLeftMenuPopupActive, setIsLeftMenuPopupActive] = useState(false);
  const [isLeftTrayPopupActive, setIsLeftTrayPopupActive] = useState(false);
  const [isRightTrayPopupActive, setIsRightTrayPopupActive] = useState(false);
  const [isNavBarPanelActive, setIsNavBarPanelActive] = useState(false);

  const isBackdropActive = isLeftMenuPopupActive || isLeftTrayPopupActive || isRightTrayPopupActive || isNavBarPanelActive;
  const isOtherPopupActive = isLeftMenuPopupActive || isLeftTrayPopupActive || isRightTrayPopupActive;


  const [isNavBarVisible, setIsNavBarVisible] = useState(false);
  const isMouseOverStatusBarRef = useRef(false);
  const isMouseOverNavBarRef = useRef(false);
  const navBarHideTimeoutRef = useRef(null);

  const handleStatusBarMouseEnter = () => {
    if (isOtherPopupActive) return;

    isMouseOverStatusBarRef.current = true;
    if (navBarHideTimeoutRef.current) {
      clearTimeout(navBarHideTimeoutRef.current);
      navBarHideTimeoutRef.current = null;
    }
    setIsNavBarVisible(true);
  };

  const handleStatusBarMouseLeave = () => {
    isMouseOverStatusBarRef.current = false;
    startNavBarHideTimeout();
  };

  const handleNavBarMouseEnter = () => {
    if (isOtherPopupActive) return;

    isMouseOverNavBarRef.current = true;
    if (navBarHideTimeoutRef.current) {
      clearTimeout(navBarHideTimeoutRef.current);
      navBarHideTimeoutRef.current = null;
    }
    setIsNavBarVisible(true);
  };

  const handleNavBarMouseLeave = () => {
    isMouseOverNavBarRef.current = false;
    startNavBarHideTimeout();
  };

  const startNavBarHideTimeout = () => {
    if (navBarHideTimeoutRef.current) {
      clearTimeout(navBarHideTimeoutRef.current);
    }
    navBarHideTimeoutRef.current = setTimeout(() => {
      if (!isMouseOverStatusBarRef.current && !isMouseOverNavBarRef.current) {
        setIsNavBarVisible(false);
      }
    }, 350);
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && (window.__TAURI__ || window.__TAURI_INTERNALS__)) {
      const resize = async () => {
        try {
          const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
          const appWindow = getCurrentWindow();
          let targetHeight = 32;
          if (isBackdropActive) {
            targetHeight = 600;
          } else if (isNavBarVisible) {
            targetHeight = 110;
          }
          await appWindow.setSize(new LogicalSize(520, targetHeight));
        } catch (err) {
          console.error('Failed to resize Tauri window:', err);
        }
      };
      resize();
    }
  }, [isBackdropActive, isNavBarVisible]);

  // Hide immediately when any other DDO popup opens
  useEffect(() => {
    if (isOtherPopupActive) {
      setIsNavBarVisible(false);
      isMouseOverStatusBarRef.current = false;
      isMouseOverNavBarRef.current = false;
      if (navBarHideTimeoutRef.current) {
        clearTimeout(navBarHideTimeoutRef.current);
        navBarHideTimeoutRef.current = null;
      }
    }
  }, [isOtherPopupActive]);

  // Click outside and window blur handlers to hide immediately
  useEffect(() => {
    const handleClickOutside = (e) => {
      const statusBarEl = document.querySelector('.status-bar-container');
      const navBarEl = document.querySelector('.ddo-floating-nav-container');

      const clickedOutsideStatusBar = !statusBarEl || !statusBarEl.contains(e.target);
      const clickedOutsideNavBar = !navBarEl || !navBarEl.contains(e.target);

      if (clickedOutsideStatusBar && clickedOutsideNavBar) {
        setIsNavBarVisible(false);
        isMouseOverStatusBarRef.current = false;
        isMouseOverNavBarRef.current = false;
        if (navBarHideTimeoutRef.current) {
          clearTimeout(navBarHideTimeoutRef.current);
          navBarHideTimeoutRef.current = null;
        }
      }
    };

    const handleWindowBlur = () => {
      setIsNavBarVisible(false);
      isMouseOverStatusBarRef.current = false;
      isMouseOverNavBarRef.current = false;
      if (navBarHideTimeoutRef.current) {
        clearTimeout(navBarHideTimeoutRef.current);
        navBarHideTimeoutRef.current = null;
      }
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);



  const isPointerInInteractiveRegion = useCallback((x, y) => {
    if (actualIsVisible) {
      const statusBarEl = document.querySelector('.status-bar-container');
      if (statusBarEl) {
        const rect = statusBarEl.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          return true;
        }
      }
    }

    const activePopups = document.querySelectorAll(
      '.left-menu-dropdown, .right-tray-dropdown, .ddo-floating-nav-container, ' +
      '.calculator-container, .translator-container, .wifi-password-card, .wifi-dropdown-card, ' +
      '.bluetooth-dropdown-card, .bell-dropdown-card, .profile-status-dropdown, ' +
      '.center-search-account-popup, .center-search-provider-menu, .center-search-answer-popup, ' +
      '.center-search-popup, .center-search-dropdown, .center-search-shell, ' +
      '.left-tray-container, .right-tray-container, .view-ai-popup, .animation-settings-popup, ' +
      '.animation-more-popup, .function-popup, .window-confirm-popup, .sleep-timer-popup, ' +
      '.wifi-dropdown-panel, .bluetooth-dropdown-panel, .bell-dropdown-panel, ' +
      '.spotify-now-playing-popup, .spotify-detail-popup, .whatsapp-popup-dropdown, ' +
      '.contact-popup-container, .popup-aurora-surface, .company-dashboard-popup, ' +
      '.company-dashboard-nested, .us-status-popup, .user-login-screen, .user-login-shell, ' +
      '.ddo-capture-overlay, .ddo-update-popup-card, .ddo-publish-popup-card'
    );
    for (const popup of activePopups) {
      const rect = popup.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return true;
      }
    }

    // Dynamic elementFromPoint fallback for any other interactive elements inside #root
    try {
      const el = document.elementFromPoint(x, y);
      if (el && el !== document.documentElement && el !== document.body) {
        const style = window.getComputedStyle(el);
        if (style.pointerEvents !== 'none' && !el.classList.contains('status-popup-backdrop')) {
          if (el.closest('#root')) {
            return true;
          }
        }
      }
    } catch {
      // ignore
    }

    return false;
  }, [actualIsVisible]);


  const lastIgnoreRef = useRef(null);

  const isBackdropActiveRef = useRef(isBackdropActive);
  useEffect(() => {
    isBackdropActiveRef.current = isBackdropActive;
  }, [isBackdropActive]);

  const permanentlyVisibleRef = useRef(permanentlyVisible);
  useEffect(() => {
    permanentlyVisibleRef.current = permanentlyVisible;
  }, [permanentlyVisible]);

  const isVisibleRef = useRef(isVisible);
  useEffect(() => {
    isVisibleRef.current = isVisible;
  }, [isVisible]);

  useEffect(() => {
    const handleGlobalMouseMove = (e) => {
      if (!actualIsVisible) {
        if (typeof window !== 'undefined' && window.electronAPI?.setIgnoreMouseEvents) {
          if (lastIgnoreRef.current !== true) {
            lastIgnoreRef.current = true;
            window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
          }
        }
        return;
      }

      const inRegion = isPointerInInteractiveRegion(e.clientX, e.clientY);
      
      const triggerWidth = 360;
      const triggerHeight = 6;

      const leftBound = (window.innerWidth - triggerWidth) / 2;
      const rightBound = (window.innerWidth + triggerWidth) / 2;
      const inTriggerZone = e.clientY <= triggerHeight && e.clientX >= leftBound && e.clientX <= rightBound;

      if (inTriggerZone && !window.electronAPI) {
        setIsVisible(true);
      }

      if (typeof window !== 'undefined' && window.electronAPI?.setIgnoreMouseEvents) {
        const nextIgnore = !inRegion;
        if (lastIgnoreRef.current !== nextIgnore) {
          lastIgnoreRef.current = nextIgnore;
          if (nextIgnore) {
            window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
          } else {
            window.electronAPI.setIgnoreMouseEvents(false);
          }
        }
      }
    };

    const handleGlobalMouseLeave = () => {
      if (typeof window !== 'undefined' && window.electronAPI?.setIgnoreMouseEvents) {
        if (lastIgnoreRef.current !== true) {
          lastIgnoreRef.current = true;
          window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
        }
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseleave', handleGlobalMouseLeave);

    if (typeof window !== 'undefined' && window.electronAPI?.setIgnoreMouseEvents) {
      lastIgnoreRef.current = true;
      window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseleave', handleGlobalMouseLeave);
      if (typeof window !== 'undefined' && window.electronAPI?.setIgnoreMouseEvents) {
        window.electronAPI.setIgnoreMouseEvents(false);
      }
    };
  }, [isPointerInInteractiveRegion, actualIsVisible]);


  // Cancel timeouts on unmount to prevent leaks
  useEffect(() => {
    return () => {
      if (navBarHideTimeoutRef.current) {
        clearTimeout(navBarHideTimeoutRef.current);
      }
    };
  }, []);


  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.resizeWindow) {
      const resize = () => {
        let targetHeight = 42; // standard bar height
        if (isBackdropActive) {
          targetHeight = 650; // popup open height
        } else if (isPublishPopupOpen) {
          targetHeight = 550; // publish form visible height
        } else if (showUpdatePopup) {
          targetHeight = 420; // update popup visible height
        } else if (isNavBarVisible) {
          targetHeight = 120; // navbar visible height
        }
        window.electronAPI.resizeWindow({
          width: window.innerWidth,
          height: targetHeight
        });
      };
      resize();
    }
  }, [isBackdropActive, isNavBarVisible, showUpdatePopup, isPublishPopupOpen]);

  useEffect(() => {
    document.body.dataset.theme = 'dark';
    document.documentElement.style.colorScheme = 'dark';
  }, []);

  return (
    <>
      <div
        className="top-edge-trigger"
        onMouseEnter={() => setIsVisible(true)}
      />
      <div
        className="toolbar-root status-bar-layer ddo-toolbar-layer"
        style={{ pointerEvents: 'none' }}
      >
        <div
          className={`status-bar-container glass-panel ddo-status-bar status-bar ${actualIsVisible ? 'visible' : ''}`}
          style={{ height: '42px', padding: '0 16px', pointerEvents: 'auto' }}
        >
          <div className={`status-popup-backdrop ${isBackdropActive ? 'active' : ''}`} />
          
          {/* Left Section */}
          <div className="status-bar-left-section" style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, justifyContent: 'flex-start' }}>
            {showDOI && (
              <button
                id="ddo-doi-button"
                onClick={handleDoiClick}
                style={{
                  backgroundColor: '#ea4335',
                  color: 'white',
                  border: 'none',
                  padding: '2px 8px',
                  borderRadius: '3px',
                  fontSize: '9px',
                  fontFamily: 'monospace',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  letterSpacing: '0.5px',
                  lineHeight: '1',
                  userSelect: 'none',
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
              >
                DOI
              </button>
            )}
            <LeftMenu onPopupStateChange={setIsLeftMenuPopupActive} />
            <RightTray mode="left" onPopupStateChange={setIsLeftTrayPopupActive} />
          </div>
          
          {/* Middle Section */}
          <div className="status-bar-middle-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, position: 'relative' }}>
            <div
              className="status-bar-middle-trigger"
              onMouseEnter={handleStatusBarMouseEnter}
              onMouseLeave={handleStatusBarMouseLeave}
              style={{ width: '100px', height: '42px', cursor: 'pointer', background: 'transparent' }}
            />
            <FloatingNavBar
              isNavBarVisible={isNavBarVisible}
              onNavBarMouseEnter={handleNavBarMouseEnter}
              onNavBarMouseLeave={handleNavBarMouseLeave}
              onPopupStateChange={setIsNavBarPanelActive}
              permanentlyVisible={permanentlyVisible}
              onTogglePermanentlyVisible={handleTogglePermanentlyVisible}
            />
          </div>
          
          {/* Right Section */}
          <div className="status-bar-right-section" style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, justifyContent: 'flex-end' }}>
            <RightTray mode="right" onPopupStateChange={setIsRightTrayPopupActive} />
            <div 
              className="flex-center icon-item" 
              onClick={handleHide}
              style={{ cursor: 'pointer' }}
              title="Hide Status Bar"
            >
              <EyeOff size={14} color="white" />
            </div>
          </div>
        </div>

        {showUpdatePopup && updateInfo && (
          <div 
            className="ddo-update-popup-card popup-aurora-surface"
            style={{
              position: 'absolute',
              top: '48px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '360px',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              backgroundColor: '#0d1117',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
              zIndex: 10000,
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              color: '#c9d1d9',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              pointerEvents: 'auto'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '14px', color: '#58a6ff', fontWeight: 'bold' }}>
                DDO Update Available
              </h4>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#c9d1d9' }}>
              <div><strong>Version:</strong> {updateInfo.latestVersion}</div>
              <div><strong>Size:</strong> {updateInfo.size}</div>
              <div><strong>Type:</strong> {updateInfo.type}</div>
            </div>

            {updateInfo.changes && updateInfo.changes.length > 0 && (
              <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '2px', color: '#f0f6fc' }}>What changed:</div>
                <ul style={{ margin: 0, paddingLeft: '16px', color: '#c9d1d9' }}>
                  {updateInfo.changes.map((detail, idx) => (
                    <li key={idx} style={{ marginBottom: '2px' }}>{detail}</li>
                  ))}
                </ul>
              </div>
            )}

            {updateInfo.securityChanges && updateInfo.securityChanges.length > 0 && (
              <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '2px', color: '#f0f6fc' }}>Security:</div>
                <ul style={{ margin: 0, paddingLeft: '16px', color: '#c9d1d9' }}>
                  {updateInfo.securityChanges.map((detail, idx) => (
                    <li key={idx} style={{ marginBottom: '2px' }}>{detail}</li>
                  ))}
                </ul>
              </div>
            )}

            {updateInfo.bugFixes && updateInfo.bugFixes.length > 0 && (
              <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '2px', color: '#f0f6fc' }}>Bug fixes:</div>
                <ul style={{ margin: 0, paddingLeft: '16px', color: '#c9d1d9' }}>
                  {updateInfo.bugFixes.map((detail, idx) => (
                    <li key={idx} style={{ marginBottom: '2px' }}>{detail}</li>
                  ))}
                </ul>
              </div>
            )}

            {updateInfo.graphicsInfo && (
              <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '2px', color: '#f0f6fc' }}>Graphics & Animation:</div>
                <div style={{ color: '#c9d1d9' }}>{updateInfo.graphicsInfo}</div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
              <button
                onClick={() => setShowUpdatePopup(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid #30363d',
                  color: '#c9d1d9',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  transition: 'background-color 0.2s',
                  lineHeight: '1.2'
                }}
              >
                Later
              </button>
              <button
                onClick={handleUpdateNow}
                style={{
                  backgroundColor: '#238636',
                  border: '1px solid rgba(240, 246, 252, 0.1)',
                  color: 'white',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  transition: 'background-color 0.2s',
                  lineHeight: '1.2'
                }}
              >
                Update Now
              </button>
            </div>
          </div>
        )}

        {isPublishPopupOpen && (
          <div 
            className="ddo-publish-popup-card popup-aurora-surface"
            style={{
              position: 'absolute',
              top: '48px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '400px',
              maxHeight: '480px',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              backgroundColor: '#0d1117',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
              zIndex: 10000,
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              color: '#c9d1d9',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              pointerEvents: 'auto'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #21262d', paddingBottom: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '14px', color: '#58a6ff', fontWeight: 'bold' }}>
                Publish DDO Update
              </h4>
              <button 
                onClick={() => setIsPublishPopupOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8b949e',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold'
                }}
              >
                &times;
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '350px', paddingRight: '4px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#8b949e' }}>Version name:</label>
                <input 
                  type="text" 
                  value={pubVersionName} 
                  onChange={(e) => setPubVersionName(e.target.value)}
                  placeholder="e.g. DOI-1.1"
                  style={{
                    backgroundColor: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                    color: '#c9d1d9',
                    padding: '6px 10px',
                    fontSize: '12px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#8b949e' }}>Update size:</label>
                <input 
                  type="text" 
                  value={pubSize} 
                  onChange={(e) => setPubSize(e.target.value)}
                  placeholder="e.g. 85 MB"
                  style={{
                    backgroundColor: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                    color: '#c9d1d9',
                    padding: '6px 10px',
                    fontSize: '12px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#8b949e' }}>Update type:</label>
                <input 
                  type="text" 
                  value={pubType} 
                  onChange={(e) => setPubType(e.target.value)}
                  placeholder="e.g. UI + Security Update"
                  style={{
                    backgroundColor: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                    color: '#c9d1d9',
                    padding: '6px 10px',
                    fontSize: '12px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#8b949e' }}>What changed in DDO:</label>
                <textarea 
                  value={pubChanges} 
                  onChange={(e) => setPubChanges(e.target.value)}
                  placeholder="Enter changes, one per line"
                  rows={2}
                  style={{
                    backgroundColor: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                    color: '#c9d1d9',
                    padding: '6px 10px',
                    fontSize: '12px',
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#8b949e' }}>Security changes:</label>
                <textarea 
                  value={pubSecurityChanges} 
                  onChange={(e) => setPubSecurityChanges(e.target.value)}
                  placeholder="Enter security changes, one per line"
                  rows={2}
                  style={{
                    backgroundColor: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                    color: '#c9d1d9',
                    padding: '6px 10px',
                    fontSize: '12px',
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#8b949e' }}>Bug fixes:</label>
                <textarea 
                  value={pubBugFixes} 
                  onChange={(e) => setPubBugFixes(e.target.value)}
                  placeholder="Enter bug fixes, one per line"
                  rows={2}
                  style={{
                    backgroundColor: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                    color: '#c9d1d9',
                    padding: '6px 10px',
                    fontSize: '12px',
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#8b949e' }}>Download/installer link:</label>
                <input 
                  type="text" 
                  value={pubDownloadUrl} 
                  onChange={(e) => setPubDownloadUrl(e.target.value)}
                  placeholder="https://example.com/download"
                  style={{
                    backgroundColor: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                    color: '#c9d1d9',
                    padding: '6px 10px',
                    fontSize: '12px',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #21262d', paddingTop: '8px', marginTop: '4px' }}>
              <button
                onClick={handlePublishClick}
                style={{
                  backgroundColor: '#238636',
                  border: '1px solid rgba(240, 246, 252, 0.1)',
                  color: 'white',
                  padding: '6px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                }}
              >
                Change
              </button>
            </div>
          </div>
        )}

        {isConfirmPopupOpen && (
          <div 
            className="window-confirm-popup popup-aurora-surface"
            style={{
              position: 'absolute',
              top: '120px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '320px',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              backgroundColor: '#161b22',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.7)',
              zIndex: 10001,
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              color: '#c9d1d9',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              pointerEvents: 'auto'
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: '500', lineHeight: '1.5', textAlign: 'center' }}>
              Are you sure you want to publish this DDO update to all users?
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
              <button
                onClick={() => setIsConfirmPopupOpen(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid #30363d',
                  color: '#c9d1d9',
                  padding: '6px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPublish}
                style={{
                  backgroundColor: '#ea4335',
                  border: '1px solid rgba(240, 246, 252, 0.1)',
                  color: 'white',
                  padding: '6px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default StatusBar;
