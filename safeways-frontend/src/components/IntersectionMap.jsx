import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapRenderer } from '../utils/MapRenderer';
import { fetchBrasovMapData, calculateBoundingBox } from '../services/osmService';
import { VehicleSimulation } from '../services/vehicleSimulation';
import { createV2xClient } from '../services/v2xService';

const IntersectionMap = ({ useBackendSimulation = false, showCollisionSpheres = true }) => {
    const canvasRef = useRef(null);
    const rendererRef = useRef(null);
    const simulationRef = useRef(null);
    const lastTimeRef = useRef(0);
    const animationRef = useRef(null);
    const v2xClientRef = useRef(null);

    const [mapData, setMapData] = useState(null);
    const [boundingBox, setBoundingBox] = useState({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
    const [images, setImages] = useState({ loaded: false, userCar: null, otherCar: null });
    const [mapSource, setMapSource] = useState('Loading...');
    const [vehicles, setVehicles] = useState([]);

    useEffect(() => {
        let isMounted = true;

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
            if (isMounted) {
                setImages({ loaded: true, userCar: userCarImg, otherCar: otherCarImg });
            }
        });

        fetchBrasovMapData()
            .then(data => {
                if (isMounted) {
                    console.log(`🗺️ Loaded map: ${data.source}`);
                    setMapSource(data.source);
                    setMapData(data);
                    setBoundingBox(calculateBoundingBox(data));
                }
            })
            .catch(err => {
                console.error("Error fetching map data:", err);
            });

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        if (canvasRef.current && !rendererRef.current) {
            rendererRef.current = new MapRenderer(canvasRef.current);
        }

        return () => {
            if (rendererRef.current) {
                rendererRef.current.destroy?.();
                rendererRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!mapData) return;

        if (useBackendSimulation) {
            v2xClientRef.current = createV2xClient(
                (decision) => console.log("AI Decision:", decision),
                (backendVehicles) => setVehicles(backendVehicles)
            );
            v2xClientRef.current.activate();

            return () => {
                v2xClientRef.current?.deactivate();
            };
        } else {
            if (!simulationRef.current) {
                simulationRef.current = new VehicleSimulation(mapData);
                for (let i = 0; i < 3; i++) {
                    setTimeout(() => simulationRef.current?.spawnVehicle(), i * 500);
                }
            }

            let spawnInterval = setInterval(() => {
                if (simulationRef.current && simulationRef.current.vehicles.length < 12) {
                    simulationRef.current.spawnVehicle();
                }
            }, 2500);

            const gameLoop = (timestamp) => {
                const deltaTime = timestamp - lastTimeRef.current;
                lastTimeRef.current = timestamp;

                if (simulationRef.current) {
                    simulationRef.current.update(deltaTime);
                    setVehicles([...simulationRef.current.getVehicles()]);
                }

                animationRef.current = requestAnimationFrame(gameLoop);
            };

            animationRef.current = requestAnimationFrame(gameLoop);

            return () => {
                clearInterval(spawnInterval);
                if (animationRef.current) cancelAnimationFrame(animationRef.current);
            };
        }
    }, [mapData, useBackendSimulation]);

    useEffect(() => {
        if (rendererRef.current) {
            rendererRef.current.updateData({
                mapData,
                boundingBox,
                vehicles,
                images,
                showCollisionSpheres
            });
        }
    }, [mapData, boundingBox, vehicles, images, showCollisionSpheres]);

    const handleZoomIn = () => rendererRef.current?.zoomIn();
    const handleZoomOut = () => rendererRef.current?.zoomOut();
    const handleReset = () => rendererRef.current?.resetView();

    return (
        <div className="map-glass-container" style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
            <div className="map-controls">
                <button onClick={handleZoomIn} title="Zoom In">+</button>
                <button onClick={handleReset} title="Reset View">⟲</button>
                <button onClick={handleZoomOut} title="Zoom Out">−</button>
            </div>

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

