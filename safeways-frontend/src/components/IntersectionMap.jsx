import React, { useEffect, useRef, useState } from 'react';

const IntersectionMap = ({ vehicles }) => {
    const canvasRef = useRef(null);
    const [mapData, setMapData] = useState(null);

    // Preluăm harta de la backend (Harta_Luxemburg.xml parsat)
    useEffect(() => {
        fetch('http://localhost:8080/api/map')
            .then(res => res.json())
            .then(data => setMapData(data));
    }, []);

    useEffect(() => {
        if (!mapData || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        // Curățăm ecranul pentru procesare în timp real [cite: 42]
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Desenăm străzile (arcele din XML) [cite: 13]
        ctx.strokeStyle = '#444';
        mapData.arcs.forEach(arc => {
            const fromNode = mapData.nodes.find(n => n.id === arc.from);
            const toNode = mapData.nodes.find(n => n.id === arc.to);
            if (fromNode && toNode) {
                ctx.beginPath();
                // Normalizăm coordonatele pentru ecran
                ctx.moveTo(fromNode.longitude / 1000, fromNode.latitude / 1000);
                ctx.lineTo(toNode.longitude / 1000, toNode.latitude / 1000);
                ctx.stroke();
            }
        });

        // Desenăm vehiculele (Agenții AI) [cite: 17, 41]
        vehicles.forEach(v => {
            ctx.fillStyle = v.type === 'AMBULANTA' ? 'red' : 'blue';
            ctx.beginPath();
            ctx.arc(v.x, v.y, 5, 0, Math.PI * 2);
            ctx.fill();
            // Etichetă ID vehicul pentru claritate [cite: 50]
            ctx.fillText(v.id, v.x + 7, v.y);
        });
    }, [mapData, vehicles]);

    return <canvas ref={canvasRef} width={800} height={600} style={{border: '1px solid #ccc'}} />;
};

export default IntersectionMap;