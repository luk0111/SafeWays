import React, { useEffect, useRef, useState } from 'react';
import { MapRenderer } from '../utils/MapRenderer'; // Importăm noua clasă

const IntersectionMap = ({ vehicles }) => {
    const canvasRef = useRef(null);
    const rendererRef = useRef(null); // Păstrăm instanța clasei

    const [mapData, setMapData] = useState(null);
    const [boundingBox, setBoundingBox] = useState({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
    const [images, setImages] = useState({ loaded: false, userCar: null, otherCar: null });

    // 1. Preluarea datelor și imaginilor (se rulează o singură dată)
    useEffect(() => {
        const userCarImg = new Image();
        userCarImg.src = '/car.png';

        const otherCarImg = new Image();
        otherCarImg.src = '/black_car.png';

        Promise.all([
            new Promise(resolve => {
                userCarImg.onload = () => resolve(true);
                userCarImg.onerror = () => resolve(false);
            }),
            new Promise(resolve => {
                otherCarImg.onload = () => resolve(true);
                otherCarImg.onerror = () => resolve(false);
            })
        ]).then(() => {
            setImages({ loaded: true, userCar: userCarImg, otherCar: otherCarImg });
        });

        fetch('http://localhost:6767/api/map')
            .then(res => res.json())
            .then(data => {
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

    // 2. Inițializarea Motorului de Randare a Hărții (MapRenderer)
    useEffect(() => {
        if (canvasRef.current && !rendererRef.current) {
            rendererRef.current = new MapRenderer(canvasRef.current);
        }
    }, []);

    // 3. Trimiterea datelor actualizate către clasa de randare
    useEffect(() => {
        if (rendererRef.current) {
            rendererRef.current.updateData({
                mapData,
                boundingBox,
                vehicles,
                images
            });
        }
    }, [mapData, boundingBox, vehicles, images]);

    // Funcții pentru butoanele de UI
    const handleZoomIn = () => rendererRef.current?.zoomIn();
    const handleZoomOut = () => rendererRef.current?.zoomOut();
    const handleReset = () => rendererRef.current?.resetView();

    return (
        <div className="map-glass-container" style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>

            {/* Butoanele de control plutitoare */}
            <div className="map-controls">
                <button onClick={handleZoomIn} title="Zoom In">+</button>
                <button onClick={handleReset} title="Reset View">⟲</button>
                <button onClick={handleZoomOut} title="Zoom Out">−</button>
            </div>

            <canvas ref={canvasRef} width={800} height={600} className="modern-canvas" />
        </div>
    );
};

export default IntersectionMap;