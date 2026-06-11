import { useState, useEffect, useRef } from 'react';
import { Home, CheckCircle2, Calendar, Target, X, Check } from 'lucide-react';

const FloatingNavBar = ({ onPopupStateChange }) => {
  const [activeTab, setActiveTab] = useState(null);
  const [time, setTime] = useState(new Date());
  
  // Battery State
  const [batteryLevel, setBatteryLevel] = useState(85);
  const [isCharging, setIsCharging] = useState(false);

  // Todo State
  const [todoInput, setTodoInput] = useState('');
  const [todoItems, setTodoItems] = useState(() => {
    try {
      const saved = localStorage.getItem('ddo_todo_items');
      return saved ? JSON.parse(saved) : [
        { id: 1, text: 'Review company dashboard security', completed: true },
        { id: 2, text: 'Update system API keys', completed: false },
        { id: 3, text: 'Check notifications tray', completed: false }
      ];
    } catch {
      return [];
    }
  });

  // Ref for click-outside detection
  const containerRef = useRef(null);

  // Update clock every second
  useEffect(() => {
    const clockTimer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // Fetch real battery status if available
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.getBattery) {
      navigator.getBattery().then((bat) => {
        setBatteryLevel(Math.round(bat.level * 100));
        setIsCharging(bat.charging);

        const onLevelChange = () => setBatteryLevel(Math.round(bat.level * 100));
        const onChargingChange = () => setIsCharging(bat.charging);

        bat.addEventListener('levelchange', onLevelChange);
        bat.addEventListener('chargingchange', onChargingChange);

        return () => {
          bat.removeEventListener('levelchange', onLevelChange);
          bat.removeEventListener('chargingchange', onChargingChange);
        };
      }).catch(() => {});
    }
  }, []);

  // Save checklist to localStorage
  useEffect(() => {
    localStorage.setItem('ddo_todo_items', JSON.stringify(todoItems));
  }, [todoItems]);

  // Tell status bar whether a panel is active (to prevent auto-hiding)
  useEffect(() => {
    if (onPopupStateChange) {
      onPopupStateChange(activeTab !== null);
    }
  }, [activeTab, onPopupStateChange]);

  // Click outside handler to collapse panel
  useEffect(() => {
    const handleClickOutside = (event) => {
      // If click is outside the entire floating navbar container, collapse active tab
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setActiveTab(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTabClick = (tabName) => {
    setActiveTab((prev) => (prev === tabName ? null : tabName));
  };

  const handleAddTodo = (e) => {
    e.preventDefault();
    if (!todoInput.trim()) return;
    setTodoItems((prev) => [
      ...prev,
      { id: Date.now(), text: todoInput.trim(), completed: false }
    ]);
    setTodoInput('');
  };

  const toggleTodo = (id) => {
    setTodoItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item))
    );
  };

  const deleteTodo = (id) => {
    setTodoItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Helper for checklist progress
  const completedCount = todoItems.filter((t) => t.completed).length;
  const totalCount = todoItems.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Render Mini Month Calendar
  const renderCalendar = () => {
    const currentDay = time.getDate();
    const daysInMonth = new Date(time.getFullYear(), time.getMonth() + 1, 0).getDate();
    const firstDayIndex = new Date(time.getFullYear(), time.getMonth(), 1).getDay();
    
    const calendarCells = [];
    
    // Add empty spaces for offset
    for (let i = 0; i < firstDayIndex; i++) {
      calendarCells.push(<span key={`empty-${i}`} className="ddo-calendar-day-cell empty" />);
    }
    
    // Add day cells
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = day === currentDay;
      calendarCells.push(
        <span
          key={`day-${day}`}
          className={`ddo-calendar-day-cell ${isToday ? 'current' : ''}`}
        >
          {day}
        </span>
      );
    }

    return (
      <div className="ddo-calendar-grid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
          <span key={`header-${i}`} className="ddo-calendar-day-header">{day}</span>
        ))}
        {calendarCells}
      </div>
    );
  };

  return (
    <div ref={containerRef} className="ddo-floating-nav-container">
      {/* Pill-shaped Navigation Dock */}
      <div className="ddo-floating-nav-dock">
        <button
          type="button"
          className={`ddo-dock-item ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => handleTabClick('home')}
          aria-label="Home"
        >
          <Home
            size={18}
            className="ddo-dock-icon"
            fill={activeTab === 'home' ? 'white' : 'none'}
            stroke={activeTab === 'home' ? 'none' : 'rgba(255, 255, 255, 0.5)'}
          />
        </button>
        <button
          type="button"
          className={`ddo-dock-item ${activeTab === 'tasks' ? 'active' : ''}`}
          onClick={() => handleTabClick('tasks')}
          aria-label="Tasks"
        >
          <CheckCircle2
            size={18}
            className="ddo-dock-icon"
            fill={activeTab === 'tasks' ? 'white' : 'none'}
            stroke={activeTab === 'tasks' ? 'none' : 'rgba(255, 255, 255, 0.5)'}
          />
        </button>
        <button
          type="button"
          className={`ddo-dock-item ${activeTab === 'calendar' ? 'active' : ''}`}
          onClick={() => handleTabClick('calendar')}
          aria-label="Calendar"
        >
          <Calendar
            size={18}
            className="ddo-dock-icon"
            fill={activeTab === 'calendar' ? 'white' : 'none'}
            stroke={activeTab === 'calendar' ? 'none' : 'rgba(255, 255, 255, 0.5)'}
          />
        </button>
        <button
          type="button"
          className={`ddo-dock-item ${activeTab === 'goals' ? 'active' : ''}`}
          onClick={() => handleTabClick('goals')}
          aria-label="Goals"
        >
          <Target
            size={18}
            className="ddo-dock-icon"
            fill={activeTab === 'goals' ? 'white' : 'none'}
            stroke={activeTab === 'goals' ? 'none' : 'rgba(255, 255, 255, 0.5)'}
          />
        </button>
      </div>

      {/* Slide-out/Fade-in Content Panel */}
      {activeTab && (
        <div className="ddo-floating-nav-panel popup-aurora-surface">
          {activeTab === 'home' && (
            <div className="ddo-tab-content ddo-tab-home">
              <div className="ddo-panel-greeting">Dashboard</div>
              <p className="ddo-panel-summary">
                Welcome back. You have {todoItems.filter((t) => !t.completed).length} pending tasks.
              </p>
              <div className="ddo-quick-stats">
                <div className="ddo-stat-item">
                  <span className="ddo-stat-label">Network</span>
                  <span className="ddo-stat-value">
                    {typeof navigator !== 'undefined' && navigator.onLine ? 'Connected' : 'Offline'}
                  </span>
                </div>
                <div className="ddo-stat-item">
                  <span className="ddo-stat-label">Battery</span>
                  <span className="ddo-stat-value">
                    {batteryLevel}% {isCharging ? '⚡' : ''}
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="ddo-tab-content ddo-tab-tasks">
              <div className="ddo-panel-title">Tasks Checklist</div>
              <div className="ddo-todo-list">
                {todoItems.map((item) => (
                  <div key={item.id} className="ddo-todo-item">
                    <button
                      type="button"
                      className={`ddo-todo-check ${item.completed ? 'completed' : ''}`}
                      onClick={() => toggleTodo(item.id)}
                    >
                      {item.completed && <Check size={10} />}
                    </button>
                    <span className={`ddo-todo-text ${item.completed ? 'completed' : ''}`}>
                      {item.text}
                    </span>
                    <button
                      type="button"
                      className="ddo-todo-delete"
                      onClick={() => deleteTodo(item.id)}
                      aria-label="Delete task"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
              <form className="ddo-todo-form" onSubmit={handleAddTodo}>
                <input
                  type="text"
                  className="ddo-todo-input"
                  placeholder="Add a new task..."
                  value={todoInput}
                  onChange={(e) => setTodoInput(e.target.value)}
                />
                <button type="submit" className="ddo-todo-submit">
                  Add
                </button>
              </form>
            </div>
          )}

          {activeTab === 'calendar' && (
            <div className="ddo-tab-content ddo-tab-calendar">
              <div className="ddo-panel-title">
                {time.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </div>
              {renderCalendar()}
            </div>
          )}

          {activeTab === 'goals' && (
            <div className="ddo-tab-content ddo-tab-goals">
              <div className="ddo-panel-title">Goals & Focus</div>
              <div className="ddo-goals-list">
                <div className="ddo-goal-item">
                  <div className="ddo-goal-info">
                    <span>Daily Tasks</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="ddo-goal-progress-bg">
                    <div
                      className="ddo-goal-progress-bar"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                <div className="ddo-goal-item">
                  <div className="ddo-goal-info">
                    <span>Study Session</span>
                    <span>75%</span>
                  </div>
                  <div className="ddo-goal-progress-bg">
                    <div
                      className="ddo-goal-progress-bar study-progress"
                      style={{ width: '75%' }}
                    />
                  </div>
                </div>

                <div className="ddo-goal-item">
                  <div className="ddo-goal-info">
                    <span>Security Index</span>
                    <span>90%</span>
                  </div>
                  <div className="ddo-goal-progress-bg">
                    <div
                      className="ddo-goal-progress-bar security-progress"
                      style={{ width: '90%' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FloatingNavBar;
