import React, { useEffect, useRef, useState } from 'react';
import { MapRenderer } from '../utils/MapRenderer';
import { fetchBrasovMapData, calculateBoundingBox } from '../services/osmService';

const IntersectionMap = ({ vehicles }) => {
    const canvasRef = useRef(null);
    const rendererRef = useRef(null);

    const [mapData, setMapData] = useState(null);
    const [boundingBox, setBoundingBox] = useState({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
    const [images, setImages] = useState({ loaded: false, userCar: null, otherCar: null });
    const [mapSource, setMapSource] = useState('Loading...');

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

        // Fetch real map data from OpenStreetMap for Brasov, Romania
        fetchBrasovMapData()
            .then(data => {
                console.log(`🗺️ Loaded map: ${data.source}`);
                console.log(`📍 ${Object.keys(data.nodesDict).length} nodes, ${data.arcs.length} streets, ${data.intersections.length} intersections`);

                setMapSource(data.source);
                setMapData(data);
                setBoundingBox(calculateBoundingBox(data));
            })
            .catch(err => {
                console.error("Error fetching map data:", err);
            });
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

            {/* Map source indicator */}
            <div style={{
                position: 'absolute',
                bottom: '10px',
                left: '10px',
                background: 'rgba(255,255,255,0.9)',
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '10px',
                color: '#666',
                fontFamily: '"Inter", system-ui, sans-serif',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                zIndex: 10
            }}>
                📍 {mapSource}
            </div>

            <canvas ref={canvasRef} width={800} height={600} className="modern-canvas" />
        </div>
    );
};

export default IntersectionMap;

