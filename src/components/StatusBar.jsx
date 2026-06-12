import { useState, useEffect, useRef } from 'react';
import LeftMenu from './LeftMenu';
import RightTray from './RightTray';
import FloatingNavBar from './FloatingNavBar';

const StatusBar = () => {
  const [isVisible, setIsVisible] = useState(true);
  const [permanentlyVisible, setPermanentlyVisible] = useState(() => {
    try {
      const saved = localStorage.getItem('ddo_keep_status_bar_visible');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const handleTogglePermanentlyVisible = (val) => {
    setPermanentlyVisible(val);
    try {
      localStorage.setItem('ddo_keep_status_bar_visible', val ? 'true' : 'false');
    } catch (e) {
      console.error(e);
    }
  };


  const [isLeftMenuPopupActive, setIsLeftMenuPopupActive] = useState(false);
  const [isRightTrayPopupActive, setIsRightTrayPopupActive] = useState(false);
  const [isNavBarPanelActive, setIsNavBarPanelActive] = useState(false);

  const isBackdropActive = isLeftMenuPopupActive || isRightTrayPopupActive || isNavBarPanelActive;
  const isOtherPopupActive = isLeftMenuPopupActive || isRightTrayPopupActive;

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

  const hasPointerLeftTopZoneRef = useRef(false);

  const [isNavBarVisible, setIsNavBarVisible] = useState(false);
  const isMouseOverStatusBarRef = useRef(false);
  const isMouseOverNavBarRef = useRef(false);
  const navBarHideTimeoutRef = useRef(null);

  const handleStatusBarMouseEnter = () => {
    // If another popup is active, do not allow showing the navigation bar
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
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

  // Monitor nav bar visibility to auto-hide status bar when nav bar closes
  useEffect(() => {
    if (permanentlyVisible) {
      return;
    }
    if (!isNavBarVisible && !isBackdropActive) {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') {
        return;
      }
      if (!isMouseOverStatusBarRef.current) {
        setIsVisible(false);
      }
    }
  }, [isNavBarVisible, isBackdropActive, permanentlyVisible]);

  useEffect(() => {
    if (permanentlyVisible) {
      return;
    }
    let timeout;
    const handleMouseMove = (e) => {
      // If mouse is within top 60px, show status bar
      if (e.clientY < 60) {
        setIsVisible(true);
        clearTimeout(timeout);
      } else {
        hasPointerLeftTopZoneRef.current = true;
        // Hide after 1.5 seconds of leaving the top area
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          if (!hasPointerLeftTopZoneRef.current) {
            return;
          }
          if (document.activeElement && document.activeElement.tagName === 'INPUT') {
            return; // Do not hide if user is typing in search
          }
          if (isBackdropActive || isNavBarVisible) {
            return; // Do not hide if any popup is active or if nav bar is visible
          }
          setIsVisible(false);
        }, 1500);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(timeout);
    };
  }, [isBackdropActive, isNavBarVisible, permanentlyVisible]);

  useEffect(() => {
    document.body.dataset.theme = 'dark';
    document.documentElement.style.colorScheme = 'dark';
  }, []);

  const actualIsVisible = permanentlyVisible ? true : isVisible;

  return (
    <>
      <div className="hover-trigger-area" />
      <div
        className={`status-bar-container glass-panel flex-between status-bar ${actualIsVisible ? '' : 'hidden'}`}
      >
        <div className={`status-popup-backdrop ${isBackdropActive ? 'active' : ''}`} />
        <div className="status-bar-content flex-between">
          <LeftMenu onPopupStateChange={setIsLeftMenuPopupActive} />
          <div
            className="status-bar-middle-trigger"
            onMouseEnter={handleStatusBarMouseEnter}
            onMouseLeave={handleStatusBarMouseLeave}
          />
          <RightTray onPopupStateChange={setIsRightTrayPopupActive} />
        </div>
        <FloatingNavBar
          isNavBarVisible={isNavBarVisible}
          onNavBarMouseEnter={handleNavBarMouseEnter}
          onNavBarMouseLeave={handleNavBarMouseLeave}
          onPopupStateChange={setIsNavBarPanelActive}
          permanentlyVisible={permanentlyVisible}
          onTogglePermanentlyVisible={handleTogglePermanentlyVisible}
        />
      </div>
    </>
  );
};

export default StatusBar;
