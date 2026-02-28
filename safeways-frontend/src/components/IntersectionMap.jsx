import React, { useEffect, useRef, useState } from 'react';

const IntersectionMap = ({ vehicles }) => {
    const canvasRef = useRef(null);
    const [mapData, setMapData] = useState(null);
    const [images, setImages] = useState({ loaded: false, userCar: null, otherCar: null });

    useEffect(() => {
        const userCarImg = new Image();
        userCarImg.src = '/car.png';

        const otherCarImg = new Image();
        otherCarImg.src = '/black_car.png';

        Promise.all([
            new Promise(resolve => { userCarImg.onload = resolve; }),
            new Promise(resolve => { otherCarImg.onload = resolve; })
        ]).then(() => {
            setImages({ loaded: true, userCar: userCarImg, otherCar: otherCarImg });
        });

        fetch('http://localhost:8080/api/map')
            .then(res => res.json())
            .then(data => setMapData(data))
            .catch(err => console.error("Eroare la încărcarea hărții:", err));
    }, []);

    useEffect(() => {
        if (!mapData || !canvasRef.current || !images.loaded) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // --- STILIZAREA HĂRȚII (Light / Dribbble Style) ---
        // Linii gri-albăstrui deschis, foarte fine și curate
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Umbră foarte fină pentru a separa drumurile de fundal
        ctx.shadowBlur = 4;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.04)';

        mapData.arcs.forEach(arc => {
            const fromNode = mapData.nodes.find(n => n.id === arc.from);
            const toNode = mapData.nodes.find(n => n.id === arc.to);
            if (fromNode && toNode) {
                ctx.beginPath();
                ctx.moveTo(fromNode.longitude / 1000, fromNode.latitude / 1000);
                ctx.lineTo(toNode.longitude / 1000, toNode.latitude / 1000);
                ctx.stroke();
            }
        });

        // Oprim umbra pentru elementele următoare
        ctx.shadowBlur = 0;

        // --- DESENAREA VEHICULELOR ---
        vehicles.forEach(v => {
            const carImg = v.isCurrentUser ? images.userCar : images.otherCar;
            const imgWidth = 45; // Puțin mai mari pentru claritate
            const imgHeight = 45;

            ctx.drawImage(carImg, v.x - imgWidth / 2, v.y - imgHeight / 2, imgWidth, imgHeight);

            // Fundal pentru text tip "Sticlă Albă" (Light Glass)
            const labelText = v.id;
            ctx.font = '500 12px "Inter", sans-serif';
            const textWidth = ctx.measureText(labelText).width;

            // Casetă albă semi-transparentă
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            if(ctx.roundRect) {
                ctx.beginPath();
                ctx.roundRect(v.x + 18, v.y - 18, textWidth + 16, 24, 8); // Colțuri mai rotunjite
                ctx.fill();
            } else {
                ctx.fillRect(v.x + 18, v.y - 18, textWidth + 16, 24);
            }

            // Border fin pentru efectul 3D al casetei
            ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
            ctx.lineWidth = 1;
            if(ctx.roundRect) { ctx.stroke(); }

            // Desenăm textul (ID-ul mașinii) - Gri închis / Negru
            ctx.fillStyle = v.isCurrentUser ? '#111827' : '#4b5563';
            ctx.fillText(labelText, v.x + 26, v.y - 1);
        });
    }, [mapData, vehicles, images]);

    return (
        <div className="map-glass-container">
            <canvas ref={canvasRef} width={800} height={600} className="modern-canvas" />
        </div>
    );
};

export default IntersectionMap;