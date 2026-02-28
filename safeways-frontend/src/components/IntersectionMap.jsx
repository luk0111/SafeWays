import React, { useEffect, useRef, useState } from 'react';
import { MapRenderer } from '../utils/MapRenderer';

const IntersectionMap = ({ vehicles }) => {
    const canvasRef = useRef(null);
    const rendererRef = useRef(null);

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

                // --- 🚦 CALCUL INTERSECȚII (cu Clustering) ---
                const nodeConnections = {};

                // Numărăm legăturile pentru fiecare nod
                data.arcs.forEach(arc => {
                    nodeConnections[arc.from] = (nodeConnections[arc.from] || 0) + 1;
                    nodeConnections[arc.to] = (nodeConnections[arc.to] || 0) + 1;
                });

                // 1. Găsim toate nodurile brute care ar putea fi intersecții
                const rawIntersections = [];
                Object.keys(nodeConnections).forEach(nodeId => {
                    // Nodurile cu >= 3 conexiuni sunt considerate intersecții de bază
                    if (nodeConnections[nodeId] >= 3 && nodesDictionary[nodeId]) {
                        rawIntersections.push(nodesDictionary[nodeId]);
                    }
                });

                // 2. Aplicăm Clustering Spațial
                const CLUSTER_THRESHOLD = 0.0004; // Distanța de unire (ajustează dacă e nevoie)
                const clusteredIntersections = [];

                rawIntersections.forEach(node => {
                    let isClustered = false;

                    // Căutăm dacă există deja un cluster în apropiere
                    for (let i = 0; i < clusteredIntersections.length; i++) {
                        const clusterCenter = clusteredIntersections[i];

                        const dx = node.longitude - clusterCenter.longitude;
                        const dy = node.latitude - clusterCenter.latitude;
                        const distance = Math.sqrt(dx * dx + dy * dy);

                        if (distance < CLUSTER_THRESHOLD) {
                            isClustered = true; // Nodul face parte din acest cluster
                            break;
                        }
                    }

                    // Dacă nu e aproape de niciunul existent, formăm un cluster nou
                    if (!isClustered) {
                        clusteredIntersections.push(node);
                    }
                });

                console.log(`🛣️ Am găsit ${rawIntersections.length} noduri de intersecție, pe care le-am grupat în ${clusteredIntersections.length} intersecții reale!`);
                // -----------------------------

                setBoundingBox({ minX, maxX, minY, maxY });

                // Trimitem intersecțiile "curățate" mai departe
                setMapData({
                    arcs: data.arcs,
                    nodesDict: nodesDictionary,
                    intersections: clusteredIntersections
                });
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