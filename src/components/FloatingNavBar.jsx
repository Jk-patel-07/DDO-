import { useState, useEffect, useRef } from 'react';
import { Home, CheckCircle2, Calendar, Target, X, Check, ChevronLeft, ChevronRight, CloudRain, CloudLightning, CloudSun, Flame, Footprints } from 'lucide-react';

const FloatingNavBar = ({
  isNavBarVisible,
  onNavBarMouseEnter,
  onNavBarMouseLeave,
  onPopupStateChange,
}) => {
  const [activeTab, setActiveTab] = useState(null);
  const [time, setTime] = useState(new Date());

  // Calendar Navigation State (defaulting to Feb 2026 as per reference)
  const [calendarDate, setCalendarDate] = useState(() => new Date(2026, 1, 20));
  const [selectedDate, setSelectedDate] = useState(() => new Date(2026, 1, 20));
  
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

  // Collapse active tab if navigation bar becomes hidden
  useEffect(() => {
    if (!isNavBarVisible) {
      setActiveTab(null);
    }
  }, [isNavBarVisible]);

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

  const handlePrevMonth = () => {
    setCalendarDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCalendarDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const isSameDay = (d1, d2) => {
    if (!d1 || !d2) return false;
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  const getCalendarDays = () => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    
    // First day of the current month
    const firstDayOfMonth = new Date(year, month, 1);
    // Day of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    let firstDayOfWeek = firstDayOfMonth.getDay();
    // Adjust to Monday-start (0 = Monday, ..., 6 = Sunday)
    firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
    
    const days = [];
    
    // Previous month trailing days
    const prevMonthDaysCount = new Date(year, month, 0).getDate();
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthDaysCount - i;
      days.push({
        day: dayNum,
        isCurrentMonth: false,
        date: new Date(year, month - 1, dayNum)
      });
    }
    
    // Current month days
    const currentMonthDaysCount = new Date(year, month + 1, 0).getDate();
    for (let i = 1; i <= currentMonthDaysCount; i++) {
      days.push({
        day: i,
        isCurrentMonth: true,
        date: new Date(year, month, i)
      });
    }
    
    // Next month leading days to complete grid
    const totalCells = days.length > 35 ? 42 : 35;
    const nextMonthDaysToAdd = totalCells - days.length;
    for (let i = 1; i <= nextMonthDaysToAdd; i++) {
      days.push({
        day: i,
        isCurrentMonth: false,
        date: new Date(year, month + 1, i)
      });
    }
    
    return days;
  };

  return (
    <div
      ref={containerRef}
      className={`ddo-floating-nav-container ${isNavBarVisible ? 'ddo-visible' : ''}`}
      onMouseEnter={onNavBarMouseEnter}
      onMouseLeave={onNavBarMouseLeave}
    >
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
            fill="none"
            stroke={activeTab === 'home' ? '#ffffff' : 'rgba(255, 255, 255, 0.45)'}
            strokeWidth={activeTab === 'home' ? 2 : 1.5}
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
            fill="none"
            stroke={activeTab === 'tasks' ? '#ffffff' : 'rgba(255, 255, 255, 0.45)'}
            strokeWidth={activeTab === 'tasks' ? 2 : 1.5}
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
            fill="none"
            stroke={activeTab === 'calendar' ? '#ffffff' : 'rgba(255, 255, 255, 0.45)'}
            strokeWidth={activeTab === 'calendar' ? 2 : 1.5}
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
            fill="none"
            stroke={activeTab === 'goals' ? '#ffffff' : 'rgba(255, 255, 255, 0.45)'}
            strokeWidth={activeTab === 'goals' ? 2 : 1.5}
          />
        </button>
        <button
          type="button"
          className={`ddo-dock-item ${activeTab === 'weather' ? 'active' : ''}`}
          onClick={() => handleTabClick('weather')}
          aria-label="Weather"
        >
          <CloudRain
            size={18}
            className="ddo-dock-icon"
            fill="none"
            stroke={activeTab === 'weather' ? '#ffffff' : 'rgba(255, 255, 255, 0.45)'}
            strokeWidth={activeTab === 'weather' ? 2 : 1.5}
          />
        </button>
        <button
          type="button"
          className={`ddo-dock-item ${activeTab === 'fitness' ? 'active' : ''}`}
          onClick={() => handleTabClick('fitness')}
          aria-label="Fitness"
        >
          <Flame
            size={18}
            className="ddo-dock-icon"
            fill="none"
            stroke={activeTab === 'fitness' ? '#ffffff' : 'rgba(255, 255, 255, 0.45)'}
            strokeWidth={activeTab === 'fitness' ? 2 : 1.5}
          />
        </button>
      </div>

      {/* Slide-out/Fade-in Content Panel */}
      {activeTab && (
        <div className={`ddo-floating-nav-panel popup-aurora-surface ${
          activeTab === 'calendar' ? 'ddo-calendar-panel-style' : ''
        } ${
          activeTab === 'weather' ? 'ddo-weather-panel-style' : ''
        } ${
          activeTab === 'fitness' ? 'ddo-fitness-panel-style' : ''
        }`}>
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
              {/* Thin bright purple indicator line at top center */}
              <div className="ddo-calendar-indicator-line" />

              {/* Month navigation header */}
              <div className="ddo-calendar-header">
                <button
                  type="button"
                  className="ddo-calendar-nav-btn"
                  onClick={handlePrevMonth}
                  aria-label="Previous month"
                >
                  <ChevronLeft size={14} strokeWidth={1.5} />
                </button>
                <div className="ddo-calendar-title">
                  {calendarDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </div>
                <button
                  type="button"
                  className="ddo-calendar-nav-btn"
                  onClick={handleNextMonth}
                  aria-label="Next month"
                >
                  <ChevronRight size={14} strokeWidth={1.5} />
                </button>
              </div>

              {/* Weekday headers & grid */}
              <div className="ddo-calendar-grid" key={calendarDate.getMonth()}>
                {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((day) => (
                  <span key={day} className="ddo-calendar-day-header">
                    {day}
                  </span>
                ))}
                {getCalendarDays().map((dayObj, index) => {
                  const isSelected = isSameDay(dayObj.date, selectedDate);
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        setSelectedDate(dayObj.date);
                        if (!dayObj.isCurrentMonth) {
                          setCalendarDate(new Date(dayObj.date.getFullYear(), dayObj.date.getMonth(), 1));
                        }
                      }}
                      className={`ddo-calendar-day-cell ${
                        dayObj.isCurrentMonth ? 'current-month' : 'other-month'
                      } ${isSelected ? 'selected' : ''}`}
                    >
                      {dayObj.day}
                    </button>
                  );
                })}
              </div>
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

          {activeTab === 'weather' && (
            <div className="ddo-tab-content ddo-tab-weather">
              <div className="ddo-weather-widget-container">
                {/* Left: Current Weather */}
                <div className="ddo-weather-current">
                  <CloudRain className="ddo-weather-current-icon" size={32} />
                  <span className="ddo-weather-current-temp">23°</span>
                </div>

                {/* Vertical Divider */}
                <div className="ddo-weather-divider" />

                {/* Right: Hourly Forecast */}
                <div className="ddo-weather-hourly-list">
                  <div className="ddo-weather-hourly-item">
                    <span className="ddo-weather-hourly-time">4PM</span>
                    <CloudRain size={16} className="ddo-weather-hourly-icon" />
                    <span className="ddo-weather-hourly-temp">23°</span>
                  </div>
                  <div className="ddo-weather-hourly-item">
                    <span className="ddo-weather-hourly-time">5PM</span>
                    <CloudLightning size={16} className="ddo-weather-hourly-icon" />
                    <span className="ddo-weather-hourly-temp">22°</span>
                  </div>
                  <div className="ddo-weather-hourly-item">
                    <span className="ddo-weather-hourly-time">6PM</span>
                    <CloudSun size={16} className="ddo-weather-hourly-icon" />
                    <span className="ddo-weather-hourly-temp">21°</span>
                  </div>
                  <div className="ddo-weather-hourly-item">
                    <span className="ddo-weather-hourly-time">7PM</span>
                    <CloudSun size={16} className="ddo-weather-hourly-icon" />
                    <span className="ddo-weather-hourly-temp">21°</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'fitness' && (
            <div className="ddo-tab-content ddo-tab-fitness">
              {/* Top Section */}
              <div className="ddo-fitness-top">
                <div className="ddo-fitness-streak-info">
                  <Flame size={20} className="ddo-fitness-flame-icon" />
                  <div className="ddo-fitness-streak-text">
                    <span className="ddo-fitness-label">STREAK</span>
                    <span className="ddo-fitness-days">32 DAYS</span>
                  </div>
                </div>
                <Footprints size={24} className="ddo-fitness-footprints-icon" />
              </div>

              <div className="ddo-fitness-divider" />

              {/* Weekly Streak Section */}
              <div className="ddo-fitness-weekly">
                <div className="ddo-fitness-days-row">
                  <div className="ddo-fitness-day-col">
                    <div className="ddo-fitness-circle filled">
                      <Check size={8} strokeWidth={3} />
                    </div>
                    <span className="ddo-fitness-day-label">Mon</span>
                  </div>
                  <div className="ddo-fitness-day-col">
                    <div className="ddo-fitness-circle filled">
                      <Check size={8} strokeWidth={3} />
                    </div>
                    <span className="ddo-fitness-day-label">Tue</span>
                  </div>
                  <div className="ddo-fitness-day-col">
                    <div className="ddo-fitness-circle filled">
                      <Check size={8} strokeWidth={3} />
                    </div>
                    <span className="ddo-fitness-day-label">Wed</span>
                  </div>
                  <div className="ddo-fitness-day-col">
                    <div className="ddo-fitness-circle progress-circle" />
                    <span className="ddo-fitness-day-label">Thu</span>
                  </div>
                  <div className="ddo-fitness-day-col">
                    <div className="ddo-fitness-circle inactive" />
                    <span className="ddo-fitness-day-label">Fri</span>
                  </div>
                  <div className="ddo-fitness-day-col">
                    <div className="ddo-fitness-circle inactive" />
                    <span className="ddo-fitness-day-label">Sat</span>
                  </div>
                  <div className="ddo-fitness-day-col">
                    <div className="ddo-fitness-circle inactive" />
                    <span className="ddo-fitness-day-label">Sun</span>
                  </div>
                </div>
              </div>

              <div className="ddo-fitness-divider" />

              {/* Steps Section */}
              <div className="ddo-fitness-steps-container">
                <span className="ddo-fitness-label">STEPS</span>
                <div className="ddo-fitness-steps-row">
                  <div className="ddo-fitness-steps-numbers">
                    <span className="ddo-fitness-steps-count">6825</span>
                    <span className="ddo-fitness-steps-goal">/10,000</span>
                  </div>
                  <span className="ddo-fitness-steps-percentage">68%</span>
                </div>
                <div className="ddo-fitness-progress-track">
                  <div className="ddo-fitness-progress-bar" style={{ width: '68%' }} />
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
