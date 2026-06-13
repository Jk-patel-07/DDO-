import { useState, useEffect, useRef, useCallback } from 'react';
import { EyeOff } from 'lucide-react';

import LeftMenu from './LeftMenu';
import RightTray from './RightTray';
import FloatingNavBar from './FloatingNavBar';

const StatusBar = () => {
  const [isVisible, setIsVisible] = useState(true);
  const [permanentlyVisible, setPermanentlyVisible] = useState(false);

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
      '.ddo-capture-overlay'
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
      const inRegion = isPointerInInteractiveRegion(e.clientX, e.clientY);
      
      const triggerWidth = 360;
      const triggerHeight = 6;

      const leftBound = (window.innerWidth - triggerWidth) / 2;
      const rightBound = (window.innerWidth + triggerWidth) / 2;
      const inTriggerZone = e.clientY <= triggerHeight && e.clientX >= leftBound && e.clientX <= rightBound;

      if (inTriggerZone) {
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
  }, [isPointerInInteractiveRegion]);


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
  }, [isBackdropActive, isNavBarVisible]);

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
      </div>
    </>
  );
};

export default StatusBar;
