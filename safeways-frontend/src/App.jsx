import React, { useState, useEffect } from 'react';
import { createV2xClient } from './services/v2xService';
import IntersectionMap from './components/IntersectionMap';
import './App.css';

function App() {
    const [vehicles, setVehicles] = useState([
        { id: 'User', type: 'NORMAL', x: 400, y: 300, speed: 50, intention: 'FATA', isCurrentUser: true },
        { id: 'Agent-1', type: 'NORMAL', x: 250, y: 150, speed: 45, intention: 'STANGA', isCurrentUser: false },
        { id: 'Agent-2', type: 'NORMAL', x: 500, y: 400, speed: 60, intention: 'DREAPTA', isCurrentUser: false }
    ]);

    useEffect(() => {
        const client = createV2xClient((decision) => {
            console.log("Decizie AI primită:", decision);
        });
        client.activate();
        return () => client.deactivate();
    }, []);

    return (
        <div className="infotainment-layout">

            {/* PANOUL DIN STÂNGA: Harta și Navigația */}
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

            {/* PANOUL DIN DREAPTA: Vremea și Media Player-ul */}
            <div className="right-panel">

                {/* Widget Vreme */}
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

                {/* Widget Media Player (Apple Music Style) */}
                <div className="media-player glass-panel">
                    <div className="album-art">
                        {/* Un placeholder gradient superb, poți pune o imagine reală cu <img> */}
                        <div className="art-placeholder"></div>
                    </div>

                    <div className="track-info">
                        <h2>Midnight City</h2>
                        <p>M83 - Hurry Up, We're Dreaming</p>
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
    );
}

export default App;