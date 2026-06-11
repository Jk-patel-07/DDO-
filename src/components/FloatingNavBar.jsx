import { useState, useEffect, useRef, useCallback } from 'react';
import { Home, CheckCircle2, Calendar, Target, X, Check, ChevronLeft, ChevronRight, CloudRain, CloudLightning, CloudSun, Flame, Footprints } from 'lucide-react';
import { createAuthHeaders } from '../utils/appAuth';
import { buildApiUrl } from '../utils/api';

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

  // Weather Live State
  const [weatherData, setWeatherData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState(null);
  const [searchCityQuery, setSearchCityQuery] = useState('');

  // Screen Time State
  const [screenTimeData, setScreenTimeData] = useState(null);
  const [goalInput, setGoalInput] = useState('');
  const [goalEditing, setGoalEditing] = useState(false);
  const [showCitySearch, setShowCitySearch] = useState(false);

  const fetchLiveWeather = useCallback(async (lat, lon, city) => {
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      let url = '/api/weather';
      if (city) {
        url += `?city=${encodeURIComponent(city)}`;
      } else if (lat && lon) {
        url += `?lat=${lat}&lon=${lon}`;
      } else {
        throw new Error('No location coordinates or city specified');
      }

      // Check internet connection
      if (!navigator.onLine) {
        throw new Error('Internet connection is unavailable');
      }

      const headers = createAuthHeaders ? createAuthHeaders() : {};
      const res = await fetch(buildApiUrl(url), { headers });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Weather request failed: ${res.status}`);
      }

      const data = await res.json();
      setWeatherData(data);
      if (city || data.city) {
        localStorage.setItem('ddo_last_selected_city', data.city || city);
        setShowCitySearch(false);
      }
    } catch (err) {
      console.error('Fetch weather failed:', err);
      setWeatherError(err.message || 'Failed to fetch weather data');
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'weather') return;

    const lastCity = localStorage.getItem('ddo_last_selected_city');
    if (lastCity) {
      fetchLiveWeather(null, null, lastCity);
      return;
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          fetchLiveWeather(latitude, longitude, null);
        },
        (error) => {
          console.warn('Geolocation error:', error);
          if (error.code === error.PERMISSION_DENIED) {
            setWeatherError('Location permission was denied. You can search for a city manually.');
          } else {
            setWeatherError('GPS or location service is disabled/unavailable.');
          }
          setShowCitySearch(true);
        },
        { timeout: 8000 }
      );
    } else {
      setWeatherError('Geolocation is not supported by your browser.');
      setShowCitySearch(true);
    }
  }, [activeTab, fetchLiveWeather]);

  const handleWeatherRefresh = () => {
    const lastCity = localStorage.getItem('ddo_last_selected_city');
    if (lastCity) {
      fetchLiveWeather(null, null, lastCity);
    } else if (navigator.geolocation) {
      setWeatherLoading(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          fetchLiveWeather(position.coords.latitude, position.coords.longitude, null);
        },
        (error) => {
          setWeatherError('Failed to get location. Try searching for a city manually.');
          setWeatherLoading(false);
          setShowCitySearch(true);
        }
      );
    } else {
      setWeatherError('Location services unavailable. Search manually.');
      setShowCitySearch(true);
    }
  };

  const fetchScreenTime = useCallback(async () => {
    try {
      const headers = createAuthHeaders ? createAuthHeaders() : {};
      const res = await fetch(buildApiUrl('/api/screentime'), { headers });
      if (res.ok) {
        const data = await res.json();
        setScreenTimeData(data);
        if (!goalEditing) {
          setGoalInput(String(data.dailyGoalMinutes / 60));
        }
      }
    } catch (err) {
      console.error('Failed to fetch screen time:', err);
    }
  }, [goalEditing]);

  useEffect(() => {
    if (activeTab !== 'fitness') return;
    
    fetchScreenTime();
    
    const interval = setInterval(() => {
      fetchScreenTime();
    }, 10000);
    
    return () => clearInterval(interval);
  }, [activeTab, fetchScreenTime]);

  const handleSaveGoal = async (e) => {
    if (e) e.preventDefault();
    const hours = parseFloat(goalInput);
    if (isNaN(hours) || hours <= 0) {
      alert('Please enter a valid number of hours');
      return;
    }
    const minutes = Math.round(hours * 60);
    try {
      const headers = createAuthHeaders ? createAuthHeaders() : {};
      headers['Content-Type'] = 'application/json';
      const res = await fetch(buildApiUrl('/api/screentime/goal'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ dailyGoalMinutes: minutes }),
      });
      if (res.ok) {
        const data = await res.json();
        setScreenTimeData(prev => prev ? { ...prev, dailyGoalMinutes: data.dailyGoalMinutes } : null);
        setGoalEditing(false);
      }
    } catch (err) {
      console.error('Failed to save screen time goal:', err);
    }
  };

  const formatTime = (totalSeconds) => {
    const totalMinutes = Math.floor(totalSeconds / 60);
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hrs}h ${mins}m`;
  };

  const handleCitySearchSubmit = (e) => {
    e.preventDefault();
    if (!searchCityQuery.trim()) return;
    fetchLiveWeather(null, null, searchCityQuery.trim());
  };

  const renderWeatherIcon = (iconName, iconSize = 32, className = '') => {
    switch (iconName) {
      case 'clear':
        return <CloudSun className={className} size={iconSize} />;
      case 'rainy':
      case 'drizzle':
        return <CloudRain className={className} size={iconSize} />;
      case 'thunderstorm':
        return <CloudLightning className={className} size={iconSize} />;
      case 'cloudy':
      case 'foggy':
      default:
        return <CloudSun className={className} size={iconSize} />;
    }
  };

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
              {weatherLoading ? (
                <div className="ddo-weather-loading-container">
                  <div className="ddo-weather-spinner" />
                  <span>Fetching live weather...</span>
                </div>
              ) : weatherError && !weatherData ? (
                <div className="ddo-weather-error-container">
                  <p className="ddo-weather-error-message">{weatherError}</p>
                  <form onSubmit={handleCitySearchSubmit} className="ddo-weather-search-form">
                    <input
                      type="text"
                      className="ddo-weather-search-input"
                      placeholder="Enter city name..."
                      value={searchCityQuery}
                      onChange={(e) => setSearchCityQuery(e.target.value)}
                    />
                    <button type="submit" className="ddo-weather-search-button">
                      Search
                    </button>
                  </form>
                </div>
              ) : (
                <div className="ddo-weather-widget-container">
                  {/* Weather Header: City & Actions */}
                  <div className="ddo-weather-header-row">
                    <div className="ddo-weather-location-wrap">
                      <span className="ddo-weather-city">{weatherData?.city || 'Local Area'}</span>
                      <span className="ddo-weather-desc">{weatherData?.condition || 'Clear'}</span>
                    </div>
                    <div className="ddo-weather-actions">
                      <button
                        type="button"
                        onClick={() => setShowCitySearch((prev) => !prev)}
                        className="ddo-weather-icon-btn-small"
                        title="Search City"
                      >
                        🔍
                      </button>
                      <button
                        type="button"
                        onClick={handleWeatherRefresh}
                        className="ddo-weather-icon-btn-small"
                        title="Refresh"
                      >
                        🔄
                      </button>
                    </div>
                  </div>

                  {showCitySearch && (
                    <form onSubmit={handleCitySearchSubmit} className="ddo-weather-search-form">
                      <input
                        type="text"
                        className="ddo-weather-search-input"
                        placeholder="Search city..."
                        value={searchCityQuery}
                        onChange={(e) => setSearchCityQuery(e.target.value)}
                        autoFocus
                      />
                      <button type="submit" className="ddo-weather-search-button">
                        Go
                      </button>
                    </form>
                  )}

                  {/* Main weather info row */}
                  <div className="ddo-weather-main-row">
                    {/* Left: Current Weather */}
                    <div className="ddo-weather-current">
                      {renderWeatherIcon(weatherData?.icon, 36, 'ddo-weather-current-icon')}
                      <span className="ddo-weather-current-temp">{weatherData?.temperature ?? 23}°</span>
                    </div>

                    {/* Vertical Divider */}
                    <div className="ddo-weather-divider" />

                    {/* Right: Hourly Forecast */}
                    <div className="ddo-weather-hourly-list">
                      {(weatherData?.hourly || []).map((item, index) => (
                        <div key={index} className="ddo-weather-hourly-item">
                          <span className="ddo-weather-hourly-time">{item.time}</span>
                          {renderWeatherIcon(item.icon, 16, 'ddo-weather-hourly-icon')}
                          <span className="ddo-weather-hourly-temp">{item.temp}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Weather stats divider */}
                  <div className="ddo-weather-divider-horizontal" />

                  {/* Weather Extra Details */}
                  <div className="ddo-weather-details-grid">
                    <div className="ddo-weather-detail-item">
                      <span className="ddo-weather-detail-label">FEELS LIKE</span>
                      <span className="ddo-weather-detail-value">{weatherData?.feelsLike ?? 22}°</span>
                    </div>
                    <div className="ddo-weather-detail-item">
                      <span className="ddo-weather-detail-label">HUMIDITY</span>
                      <span className="ddo-weather-detail-value">{weatherData?.humidity ?? 85}%</span>
                    </div>
                    <div className="ddo-weather-detail-item">
                      <span className="ddo-weather-detail-label">WIND</span>
                      <span className="ddo-weather-detail-value">{weatherData?.windSpeed ?? 14} km/h</span>
                    </div>
                    <div className="ddo-weather-detail-item">
                      <span className="ddo-weather-detail-label">MIN / MAX</span>
                      <span className="ddo-weather-detail-value">
                        {weatherData?.tempMin ?? 18}° / {weatherData?.tempMax ?? 25}°
                      </span>
                    </div>
                  </div>
                </div>
              )}
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

              <div className="ddo-fitness-divider" />

              {/* Screen Time Section */}
              <div className="ddo-screentime-section">
                <div className="ddo-screentime-header">
                  <span className="ddo-fitness-label">SCREEN TIME</span>
                  {screenTimeData && (
                    <span className="ddo-screentime-today-value">
                      {formatTime(screenTimeData.todaySeconds)}
                    </span>
                  )}
                </div>

                {/* Warning when goal reached */}
                {screenTimeData && screenTimeData.todaySeconds >= screenTimeData.dailyGoalMinutes * 60 && (
                  <div className="ddo-screentime-warning">
                    <span>⚠️ Goal reached ({formatTime(screenTimeData.dailyGoalMinutes * 60)})!</span>
                  </div>
                )}

                {/* Progress bar relative to goal */}
                {screenTimeData && (
                  <div className="ddo-screentime-progress-container">
                    <div className="ddo-screentime-progress-row">
                      <span className="ddo-screentime-progress-percent">
                        {Math.min(100, Math.round((screenTimeData.todaySeconds / (screenTimeData.dailyGoalMinutes * 60)) * 100))}% of goal
                      </span>
                      <span className="ddo-screentime-progress-goal-label">
                        Goal: {screenTimeData.dailyGoalMinutes / 60}h
                      </span>
                    </div>
                    <div className="ddo-screentime-progress-track">
                      <div 
                        className={`ddo-screentime-progress-bar ${screenTimeData.todaySeconds >= screenTimeData.dailyGoalMinutes * 60 ? 'exceeded' : ''}`}
                        style={{ width: `${Math.min(100, (screenTimeData.todaySeconds / (screenTimeData.dailyGoalMinutes * 60)) * 100)}%` }} 
                      />
                    </div>
                  </div>
                )}

                {/* Grid stats */}
                {screenTimeData && (
                  <div className="ddo-screentime-grid">
                    <div className="ddo-screentime-stat-card">
                      <span className="ddo-screentime-stat-label">YESTERDAY</span>
                      <span className="ddo-screentime-stat-val">
                        {formatTime(screenTimeData.yesterdaySeconds)}
                      </span>
                    </div>
                    <div className="ddo-screentime-stat-card">
                      <span className="ddo-screentime-stat-label">WEEKLY AVG</span>
                      <span className="ddo-screentime-stat-val">
                        {formatTime(screenTimeData.weeklyAverageSeconds)}
                      </span>
                    </div>
                    <div className="ddo-screentime-stat-card">
                      <span className="ddo-screentime-stat-label">STREAK</span>
                      <span className="ddo-screentime-stat-val">
                        {screenTimeData.currentStreak} {screenTimeData.currentStreak === 1 ? 'Day' : 'Days'}
                      </span>
                    </div>
                    <div className="ddo-screentime-stat-card">
                      <span className="ddo-screentime-stat-label">LONGEST</span>
                      <span className="ddo-screentime-stat-val">
                        {screenTimeData.longestStreak} {screenTimeData.longestStreak === 1 ? 'Day' : 'Days'}
                      </span>
                    </div>
                  </div>
                )}

                {/* 7-Day Usage Graph */}
                {screenTimeData && screenTimeData.last7Days && (
                  <div className="ddo-screentime-graph-container">
                    <span className="ddo-fitness-label">LAST 7 DAYS</span>
                    <div className="ddo-screentime-graph">
                      {screenTimeData.last7Days.map((day, idx) => {
                        const maxSec = Math.max(...screenTimeData.last7Days.map(d => d.seconds), screenTimeData.dailyGoalMinutes * 60, 3600);
                        const pct = (day.seconds / maxSec) * 100;
                        const isGoalReached = day.seconds >= screenTimeData.dailyGoalMinutes * 60;
                        return (
                          <div key={idx} className="ddo-screentime-graph-col">
                            <div className="ddo-screentime-graph-bar-wrapper">
                              <div 
                                className={`ddo-screentime-graph-bar ${isGoalReached ? 'goal-reached' : ''}`}
                                style={{ height: `${Math.max(4, pct)}%` }}
                                title={`${day.date}: ${formatTime(day.seconds)}`}
                              />
                            </div>
                            <span className="ddo-screentime-graph-label">{day.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Goal setting form */}
                <div className="ddo-screentime-goal-form-container">
                  {goalEditing ? (
                    <form onSubmit={handleSaveGoal} className="ddo-screentime-goal-form">
                      <label htmlFor="screen-time-goal-input" className="ddo-fitness-label">SET GOAL (HRS)</label>
                      <div className="ddo-screentime-goal-input-row">
                        <input
                          id="screen-time-goal-input"
                          type="number"
                          step="0.5"
                          min="0.5"
                          max="24"
                          className="ddo-screentime-goal-input"
                          value={goalInput}
                          onChange={(e) => setGoalInput(e.target.value)}
                        />
                        <button type="submit" className="ddo-screentime-goal-btn save">
                          Save
                        </button>
                        <button 
                          type="button" 
                          className="ddo-screentime-goal-btn cancel"
                          onClick={() => {
                            setGoalEditing(false);
                            if (screenTimeData) {
                              setGoalInput(String(screenTimeData.dailyGoalMinutes / 60));
                            }
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="ddo-screentime-goal-display-row">
                      <span className="ddo-fitness-label">DAILY GOAL</span>
                      <button 
                        className="ddo-screentime-goal-edit-btn"
                        onClick={() => setGoalEditing(true)}
                      >
                        Adjust Goal
                      </button>
                    </div>
                  )}
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
