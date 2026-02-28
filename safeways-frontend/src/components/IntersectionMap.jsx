import React, { useEffect, useRef, useState } from 'react';

const IntersectionMap = ({ vehicles }) => {
    const canvasRef = useRef(null);
    const [mapData, setMapData] = useState(null);
    const [boundingBox, setBoundingBox] = useState({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
    const [images, setImages] = useState({ loaded: false, userCar: null, otherCar: null });

    // 1. Preluarea datelor și OPTIMIZAREA lor
    // 1. Preluarea datelor și OPTIMIZAREA lor
    useEffect(() => {
        const userCarImg = new Image();
        userCarImg.src = '/car.png';

        const otherCarImg = new Image();
        otherCarImg.src = '/black_car.png';

        // Adăugăm onload ȘI onerror pentru a nu bloca aplicația dacă lipsește o poză
        Promise.all([
            new Promise(resolve => {
                userCarImg.onload = () => resolve(true);
                userCarImg.onerror = () => { console.warn("Nu am găsit car.png"); resolve(false); };
            }),
            new Promise(resolve => {
                otherCarImg.onload = () => resolve(true);
                otherCarImg.onerror = () => { console.warn("Nu am găsit black_car.png"); resolve(false); };
            })
        ]).then(() => {
            setImages({ loaded: true, userCar: userCarImg, otherCar: otherCarImg });
        });

        console.log("Cerem harta de la backend...");

        fetch('http://localhost:6767/api/map')
            .then(res => res.json())
            .then(data => {
                console.log(`Am primit ${data.nodes.length} noduri și ${data.arcs.length} străzi!`);

                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                const nodesDictionary = {};

                data.nodes.forEach(node => {
                    const lon = node.longitude;
                    const lat = node.latitude;

                    if (lon < minX) minX = lon;
                    if (lon > maxX) maxX = lon;
                    if (lat < minY) minY = lat;
                    if (lat > maxY) maxY = lat;

                    nodesDictionary[node.id] = node;
                });

                setBoundingBox({ minX, maxX, minY, maxY });
                setMapData({ arcs: data.arcs, nodesDict: nodesDictionary });
            })
            .catch(err => console.error("Eroare la Fetch către backend:", err));
    }, []);

    // 2. Desenarea Ultra-Rapidă
    useEffect(() => {
        if (!mapData || !canvasRef.current || !images.loaded) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const padding = 40;
        const usableWidth = canvas.width - padding * 2;
        const usableHeight = canvas.height - padding * 2;

        const rangeX = boundingBox.maxX - boundingBox.minX;
        const rangeY = boundingBox.maxY - boundingBox.minY;

        if (rangeX === 0 || rangeY === 0) return;

        const scaleX = usableWidth / rangeX;
        const scaleY = usableHeight / rangeY;
        const scale = Math.min(scaleX, scaleY);

        const offsetX = padding + (usableWidth - rangeX * scale) / 2;
        const offsetY = padding + (usableHeight - rangeY * scale) / 2;

        const getCanvasX = (mapX) => offsetX + (mapX - boundingBox.minX) * scale;
        const getCanvasY = (mapY) => canvas.height - (offsetY + (mapY - boundingBox.minY) * scale);

        // --- DESENAREA STRĂZILOR ---
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1; // Linie subțire pentru a nu aglomera orașul
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        mapData.arcs.forEach(arc => {
            // ACUM SE EXECUTA INSTANT:
            const fromNode = mapData.nodesDict[arc.from];
            const toNode = mapData.nodesDict[arc.to];

            if (fromNode && toNode) {
                ctx.moveTo(getCanvasX(fromNode.longitude), getCanvasY(fromNode.latitude));
                ctx.lineTo(getCanvasX(toNode.longitude), getCanvasY(toNode.latitude));
            }
        });
        ctx.stroke();

        // --- DESENAREA MAȘINILOR ---
        // --- DESENAREA MAȘINILOR ---
        vehicles.forEach(v => {
            const vx = getCanvasX(v.x);
            const vy = getCanvasY(v.y);

            const carImg = v.isCurrentUser ? images.userCar : images.otherCar;
            const imgWidth = 45;
            const imgHeight = 45;

            // PROTECȚIE: Desenăm imaginea DOAR dacă s-a încărcat cu succes (width > 0)
            if (carImg && carImg.width > 0) {
                ctx.drawImage(carImg, vx - imgWidth / 2, vy - imgHeight / 2, imgWidth, imgHeight);
            } else {
                // FALLBACK: Dacă imaginea lipsește, desenăm un cerc ca să vedem unde e mașina
                ctx.beginPath();
                ctx.arc(vx, vy, 10, 0, Math.PI * 2);
                ctx.fillStyle = v.isCurrentUser ? '#3b82f6' : '#ef4444'; // Albastru pentru tine, Roșu pt alții
                ctx.fill();
            }

            const labelText = v.id;
            ctx.font = '600 12px "Inter", sans-serif';
            const textWidth = ctx.measureText(labelText).width;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            if(ctx.roundRect) {
                ctx.beginPath();
                ctx.roundRect(vx + 18, vy - 18, textWidth + 16, 24, 8);
                ctx.fill();
            } else {
                ctx.fillRect(vx + 18, vy - 18, textWidth + 16, 24);
            }

            ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
            ctx.lineWidth = 1;
            if(ctx.roundRect) { ctx.stroke(); }

            ctx.fillStyle = v.isCurrentUser ? '#111827' : '#4b5563';
            ctx.fillText(labelText, vx + 26, vy - 1);
        });
    }, [mapData, boundingBox, vehicles, images]);

    return (
        <div className="map-glass-container" style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            <canvas ref={canvasRef} width={800} height={600} className="modern-canvas" />
        </div>
    );
};

export default IntersectionMap;