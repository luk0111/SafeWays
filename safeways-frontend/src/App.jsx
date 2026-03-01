import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createV2xClient } from './services/v2xService';
import { getWeatherData } from './services/weatherService';
import IntersectionMap from './components/IntersectionMap';
import IntroScreen from './components/IntroScreen';
import './App.css';

function App() {
    const [showIntro, setShowIntro] = useState(true);

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [aiEnhancing, setAiEnhancing] = useState(true);
    const [showCollisionSpheres, setShowCollisionSpheres] = useState(true);

    // --- 🌤️ WEATHER STATE ---
    const [weather, setWeather] = useState({
        temperature: '--',
        icon: '🌤️',
        city: 'Brașov',
        country: 'România',
        precipitation: '--',
        isLoading: true
    });

    // --- 🎵 MUSIC PLAYER STATES ---
    const [isPlaying, setIsPlaying] = useState(true);
    const [progress, setProgress] = useState(84); // 1:24
    const [isSkipping, setIsSkipping] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const progressBarRef = useRef(null);
    const songDuration = 243; // 4:03

    // Handle seeking when clicking/dragging on progress bar
    const handleProgressSeek = useCallback((e) => {
        if (!progressBarRef.current) return;

        const rect = progressBarRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, clickX / rect.width));
        const newProgress = Math.round(percentage * songDuration);

        setIsSkipping(true);
        setProgress(newProgress);
        setTimeout(() => setIsSkipping(false), 50);
    }, [songDuration]);

    const handleMouseDown = (e) => {
        setIsDragging(true);
        handleProgressSeek(e);
    };

    const handleMouseMove = useCallback((e) => {
        if (isDragging) {
            handleProgressSeek(e);
        }
    }, [isDragging, handleProgressSeek]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    // Add/remove mouse event listeners for dragging
    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, handleMouseMove, handleMouseUp]);

    const handleSkipPrev = () => {
        setIsSkipping(true);
        setProgress(0);
        setTimeout(() => setIsSkipping(false), 50);
    };

    const handleSkipNext = () => {
        setIsSkipping(true);
        setProgress(songDuration);
        setTimeout(() => setIsSkipping(false), 50);
    };

    const handleIntroComplete = useCallback(() => {
        setShowIntro(false);
    }, []);

    // Music Player Timer Logic
    useEffect(() => {
        let timer;
        if (isPlaying && progress < songDuration) {
            timer = setInterval(() => {
                setProgress(prev => prev + 1);
            }, 1000);
        } else if (progress >= songDuration) {
            setIsPlaying(false);
        }
        return () => clearInterval(timer);
    }, [isPlaying, progress]);

    const formatTime = (timeInSeconds) => {
        const m = Math.floor(timeInSeconds / 60);
        const s = timeInSeconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const toggleSettings = () => {
        if (isSettingsOpen && !isClosing) {
            setIsClosing(true);
            setTimeout(() => {
                setIsSettingsOpen(false);
                setIsClosing(false);
            }, 300);
        } else if (!isSettingsOpen) {
            setIsSettingsOpen(true);
        }
    };

    useEffect(() => {
        if (isDarkMode) {
            document.body.classList.add('dark-theme-active');
        } else {
            document.body.classList.remove('dark-theme-active');
        }
    }, [isDarkMode]);

    // Fetch live weather data
    useEffect(() => {
        const fetchWeather = async () => {
            try {
                const data = await getWeatherData();
                setWeather({
                    temperature: data.temperature,
                    icon: data.icon,
                    city: data.city,
                    country: data.country === 'RO' ? 'România' : data.country,
                    precipitation: data.precipitation,
                    humidity: data.humidity,
                    windSpeed: data.windSpeed,
                    description: data.description,
                    condition: data.condition,
                    isLoading: false,
                    isOffline: data.isOffline || false
                });
            } catch (error) {
                console.error('Weather fetch error:', error);
                setWeather(prev => ({ ...prev, isLoading: false, isOffline: true }));
            }
        };

        fetchWeather();

        // Refresh weather every 10 minutes
        const interval = setInterval(fetchWeather, 10 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const client = createV2xClient((decision) => {
            console.log("Decizie AI primită:", decision);
        });
        client.activate();
        return () => client.deactivate();
    }, []);

    return (
        <>
            {showIntro && <IntroScreen onComplete={handleIntroComplete} />}

            <div className="gear-only-btn" onClick={toggleSettings} title="Setări">
                <svg viewBox="0 0 24 24" width="30" height="30" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" fill="none"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
            </div>

            {(isSettingsOpen || isClosing) && (
                <div className={`mini-settings-menu ${isDarkMode ? 'dark-panel' : ''} ${isClosing ? 'closing' : ''}`}>
                    <div className="setting-row">
                        <span>Dark Theme</span>
                        <label className="switch">
                            <input type="checkbox" checked={isDarkMode} onChange={() => setIsDarkMode(!isDarkMode)} />
                            <span className="slider"></span>
                        </label>
                    </div>
                    <div className="setting-row">
                        <span>AI Traffic Enhancing</span>
                        <label className="switch">
                            <input type="checkbox" checked={aiEnhancing} onChange={() => setAiEnhancing(!aiEnhancing)} />
                            <span className="slider ai-slider"></span>
                        </label>
                    </div>
                    <div className="setting-row">
                        <span>Collision Spheres</span>
                        <label className="switch">
                            <input type="checkbox" checked={showCollisionSpheres} onChange={() => setShowCollisionSpheres(!showCollisionSpheres)} />
                            <span className="slider sphere-slider"></span>
                        </label>
                    </div>
                </div>
            )}

            <div className={`infotainment-layout ${isDarkMode ? 'dark-mode' : ''}`}>
                <div className="left-panel glass-panel">
                    <header className="dashboard-header">
                        <h1>SafeWays <span>AI-Powered Safe Driving Assistant</span></h1>
                        <div className="status-indicators">
                            <div className="status-indicator">
                                <span className="dot pulse"></span>
                                V2X Active
                            </div>
                            <div className="status-indicator offline">
                                <span className="dot"></span>
                                V2V Fallback
                            </div>
                        </div>
                    </header>
                    <div className="map-section">
                        <IntersectionMap showCollisionSpheres={showCollisionSpheres} />
                    </div>
                </div>

                <div className="right-panel">
                    <div className="weather-widget glass-panel">
                        <div className="weather-header">
                            <div className="weather-temp">
                                {weather.isLoading ? '--' : `${weather.temperature}°C`}
                            </div>
                            <div className="weather-icon">{weather.icon}</div>
                        </div>
                        <div className="weather-details">
                            <p>{weather.city}, {weather.country}</p>
                            <p className="sub-text">
                                Precipitații: <strong>{weather.isLoading ? '--' : `${weather.precipitation}%`}</strong>
                            </p>
                            {weather.humidity && !weather.isLoading && (
                                <p className="sub-text">
                                    Umiditate: <strong>{weather.humidity}%</strong>
                                </p>
                            )}
                        </div>
                        {weather.isOffline && (
                            <div className="weather-offline" style={{
                                fontSize: '0.7rem',
                                color: '#9ca3af',
                                marginTop: '8px',
                                textAlign: 'center'
                            }}>
                                ⚠️ Date offline
                            </div>
                        )}
                    </div>

                    <div className="media-player glass-panel">
                        <div className="album-art">
                            <img
                                src="https://upload.wikimedia.org/wikipedia/en/3/39/The_Weeknd_-_Starboy.png"
                                alt="Starboy Album Cover"
                                className="album-cover-img"
                            />
                        </div>
                        <div className="track-info">
                            <h2>Starboy</h2>
                            <p>The Weeknd, Kiss FM</p>
                        </div>

                        <div className="progress-container">
                            <div className="time-text">{formatTime(progress)}</div>
                            <div
                                className="progress-bar"
                                ref={progressBarRef}
                                onMouseDown={handleMouseDown}
                                style={{ cursor: 'pointer' }}
                            >
                                <div
                                    className="progress-fill"
                                    style={{
                                        width: `${(progress / songDuration) * 100}%`,
                                        transition: isSkipping || isDragging ? 'none' : 'width 1s linear'
                                    }}
                                ></div>
                                <div
                                    className="progress-thumb"
                                    style={{
                                        position: 'absolute',
                                        left: `${(progress / songDuration) * 100}%`,
                                        top: '50%',
                                        transform: 'translate(-50%, -50%)',
                                        width: '12px',
                                        height: '12px',
                                        borderRadius: '50%',
                                        backgroundColor: '#111827',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                        opacity: isDragging ? 1 : 0,
                                        transition: 'opacity 0.2s ease'
                                    }}
                                ></div>
                            </div>
                            <div className="time-text">-{formatTime(songDuration - progress)}</div>
                        </div>

                        <div className="player-controls">
                            <button className="control-btn secondary" onClick={handleSkipPrev}>⏮</button>
                            <button className="control-btn primary" onClick={() => setIsPlaying(!isPlaying)}>
                                {isPlaying ? '⏸' : '▶'}
                            </button>
                            <button className="control-btn secondary" onClick={handleSkipNext}>⏭</button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default App;