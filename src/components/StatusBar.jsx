import { useState, useEffect, useRef } from 'react';
import LeftMenu from './LeftMenu';
import RightTray from './RightTray';

const StatusBar = () => {
  const [isVisible, setIsVisible] = useState(true);
  const [isBackdropActive, setIsBackdropActive] = useState(false);
  const hasPointerLeftTopZoneRef = useRef(false);

  useEffect(() => {
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
          setIsVisible(false);
        }, 1500);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    document.body.dataset.theme = 'dark';
    document.documentElement.style.colorScheme = 'dark';
  }, []);

  return (
    <>
      <div className="hover-trigger-area" />
      <div
        className={`status-bar-container glass-panel flex-between status-bar ${isVisible ? '' : 'hidden'}`}
      >
        <div className={`status-popup-backdrop ${isBackdropActive ? 'active' : ''}`} />
        <div className="status-bar-content flex-between">
          <LeftMenu onPopupStateChange={setIsBackdropActive} />
          <RightTray onPopupStateChange={setIsBackdropActive} />
        </div>
      </div>
    </>
  );
};

export default StatusBar;
