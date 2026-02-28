import React, { useState, useEffect } from 'react';
import './IntroScreen.css';

const IntroScreen = ({ onComplete }) => {
    const [fadeOut, setFadeOut] = useState(false);

    useEffect(() => {
        // Începem efectul de fade-out după 2.5 secunde
        const timer = setTimeout(() => {
            setFadeOut(true);
        }, 2500);

        // Apelăm funcția care ascunde complet componenta din DOM după ce se termină animația CSS
        const removeTimer = setTimeout(() => {
            if (onComplete) onComplete();
        }, 3500);

        return () => {
            clearTimeout(timer);
            clearTimeout(removeTimer);
        };
    }, [onComplete]);

    return (
        <div className={`intro-overlay ${fadeOut ? 'fade-out' : ''}`}>
            <div className="intro-content">
                <h1 className="intro-title">SafeWays</h1>
                {/* Poți schimba motto-ul cu ce dorești */}
                <p className="intro-motto">Welcome! Enjoy your safe ride!</p>

                {/* Un mic element grafic modern (linie de încărcare/puls) */}
                <div className="loading-line"></div>
            </div>
        </div>
    );
};

export default IntroScreen;