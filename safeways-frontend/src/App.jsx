import React, { useState, useEffect } from 'react';
import { createV2xClient } from './services/v2xService';
import IntersectionMap from './components/IntersectionMap';
import IntroScreen from './components/IntroScreen';
import './App.css';

function App() {
    const [showIntro, setShowIntro] = useState(true);
    const [vehicles, setVehicles] = useState([
        { id: 'User', type: 'NORMAL', x: 400, y: 300, speed: 50, intention: 'FATA', isCurrentUser: true },
        { id: 'Agent-1', type: 'NORMAL', x: 250, y: 150, speed: 45, intention: 'STANGA', isCurrentUser: false },
        { id: 'Agent-2', type: 'NORMAL', x: 500, y: 400, speed: 60, intention: 'DREAPTA', isCurrentUser: false }
    ]);

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isClosing, setIsClosing] = useState(false); // Stare nouă pentru animația de închidere
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [aiEnhancing, setAiEnhancing] = useState(true);

    // Funcția care gestionează deschiderea/închiderea cu animație
    const toggleSettings = () => {
        if (isSettingsOpen && !isClosing) {
            setIsClosing(true); // Începe animația de închidere
            setTimeout(() => {
                setIsSettingsOpen(false); // Elimină complet din DOM după 300ms
                setIsClosing(false);
            }, 300);
        } else if (!isSettingsOpen) {
            setIsSettingsOpen(true); // Deschide meniul
        }
    };

    useEffect(() => {
        if (isDarkMode) {
            document.body.classList.add('dark-theme-active');
        } else {
            document.body.classList.remove('dark-theme-active');
        }
    }, [isDarkMode]);

    useEffect(() => {
        const client = createV2xClient((decision) => {
            console.log("Decizie AI primită:", decision);
        });
        client.activate();
        return () => client.deactivate();
    }, []);

    return (
        <>
            {showIntro && <IntroScreen onComplete={() => setShowIntro(false)} />}

            {/* Iconița de setări - acum apelăm toggleSettings */}
            <div
                className="gear-only-btn"
                onClick={toggleSettings}
                title="Setări"
            >
                {/* SVG-ul actualizat să preia stilurile din CSS */}
                <svg viewBox="0 0 24 24" width="30" height="30" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" fill="none"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
            </div>

            {/* Meniul este randat dacă e deschis SAU dacă e în curs de închidere */}
            {(isSettingsOpen || isClosing) && (
                <div className={`mini-settings-menu ${isDarkMode ? 'dark-panel' : ''} ${isClosing ? 'closing' : ''}`}>
                    <div className="setting-row">
                        <span>Tema Întunecată</span>
                        <label className="switch">
                            <input
                                type="checkbox"
                                checked={isDarkMode}
                                onChange={() => setIsDarkMode(!isDarkMode)}
                            />
                            <span className="slider"></span>
                        </label>
                    </div>
                    <div className="setting-row">
                        <span>AI Traffic Enhancing</span>
                        <label className="switch">
                            <input
                                type="checkbox"
                                checked={aiEnhancing}
                                onChange={() => setAiEnhancing(!aiEnhancing)}
                            />
                            <span className="slider ai-slider"></span>
                        </label>
                    </div>
                </div>
            )}

            <div className={`infotainment-layout ${isDarkMode ? 'dark-mode' : ''}`}>
                <div className="left-panel glass-panel">
                    <header className="dashboard-header">
                        <h1>SafeWays <span>AI-Powered Safe Driving Assistant</span></h1>
                        <div className="status-indicator">
                            <span className="dot pulse"></span>
                            V2X Active
                        </div>
                    </header>
                    <div className="map-section">
                        <IntersectionMap vehicles={vehicles} />
                    </div>
                </div>

                <div className="right-panel">
                    <div className="weather-widget glass-panel">
                        <div className="weather-header">
                            <div className="weather-temp">18°C</div>
                            <div className="weather-icon">🌤️</div>
                        </div>
                        <div className="weather-details">
                            <p>Brașov, România</p>
                            <p className="sub-text">Precipitații: <strong>10%</strong></p>
                        </div>
                    </div>

                    <div className="media-player glass-panel">
                        <div className="album-art">
                            <div className="art-placeholder"></div>
                        </div>
                        <div className="track-info">
                            <h2>Starboy</h2>
                            <p>The Weeknd, Kiss FM</p>
                        </div>
                        <div className="progress-container">
                            <div className="time-text">1:24</div>
                            <div className="progress-bar">
                                <div className="progress-fill"></div>
                            </div>
                            <div className="time-text">-2:39</div>
                        </div>
                        <div className="player-controls">
                            <button className="control-btn secondary">⏮</button>
                            <button className="control-btn primary">⏸</button>
                            <button className="control-btn secondary">⏭</button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default App;