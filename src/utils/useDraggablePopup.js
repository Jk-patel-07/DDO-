import { useState, useEffect, useRef } from 'react';

export function useDraggablePopup(popupKey) {
  const [position, setPosition] = useState(() => {
    try {
      const saved = localStorage.getItem(`popup-position-${popupKey}`);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const positionStartRef = useRef({ x: 0, y: 0 });
  const popupRef = useRef(null);

  const onMouseDown = (e) => {
    if (e.button !== 0) return; // Only left click
    
    let startX = 0;
    let startY = 0;

    if (position) {
      startX = position.x;
      startY = position.y;
    } else if (popupRef.current) {
      const rect = popupRef.current.getBoundingClientRect();
      startX = rect.left;
      startY = rect.top;
    } else {
      startX = e.clientX - 100;
      startY = e.clientY - 20;
    }

    setDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    positionStartRef.current = { x: startX, y: startY };
    e.preventDefault();
  };

  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (e) => {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      
      let newX = positionStartRef.current.x + dx;
      let newY = positionStartRef.current.y + dy;

      let popupWidth = 300;
      let popupHeight = 300;
      if (popupRef.current) {
        popupWidth = popupRef.current.offsetWidth || 300;
        popupHeight = popupRef.current.offsetHeight || 300;
      }
      
      newX = Math.max(0, Math.min(window.innerWidth - popupWidth, newX));
      newY = Math.max(0, Math.min(window.innerHeight - popupHeight, newY));

      setPosition({ x: newX, y: newY });
    };

    const onMouseUp = () => {
      setDragging(false);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragging]);

  useEffect(() => {
    if (position) {
      try {
        localStorage.setItem(`popup-position-${popupKey}`, JSON.stringify(position));
      } catch (e) {
        // ignore
      }
    }
  }, [position, popupKey]);

  const resetPosition = () => {
    setPosition(null);
    try {
      localStorage.removeItem(`popup-position-${popupKey}`);
    } catch (e) {
      // ignore
    }
  };

  const handleDoubleClick = (e) => {
    e.preventDefault();
    resetPosition();
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    resetPosition();
  };

  const dragStyle = position ? {
    position: 'fixed',
    left: `${position.x}px`,
    top: `${position.y}px`,
    margin: 0,
    transform: 'none',
    right: 'auto',
    bottom: 'auto',
    zIndex: 9999,
  } : {};

  return {
    position,
    setPosition,
    dragging,
    popupRef,
    dragStyle,
    dragProps: {
      onMouseDown,
      onDoubleClick: handleDoubleClick,
      onContextMenu: handleContextMenu,
      style: { cursor: dragging ? 'grabbing' : 'grab' },
      title: 'Drag to Move / Double-click or Right-click to Reset'
    }
  };
}
