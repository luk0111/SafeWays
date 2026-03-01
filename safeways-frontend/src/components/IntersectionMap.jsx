import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapRenderer } from '../utils/MapRenderer';
import { fetchBrasovMapData, calculateBoundingBox } from '../services/osmService';
import { VehicleSimulation } from '../services/vehicleSimulation';
import { createV2xClient } from '../services/v2xService';
import { updateVehicles, antennaTick, parseAiDecision, setAntennaPosition, isSimulationPaused } from '../services/antennaService';
import { runAITrafficControl, makeLocalDecision, analyzeTrafficDensity } from '../services/aiTrafficControlService';

const IntersectionMap = ({ useBackendSimulation = false, showCollisionSpheres = true }) => {
    const canvasRef = useRef(null);
    const rendererRef = useRef(null);
    const simulationRef = useRef(null);
    const lastTimeRef = useRef(0);
    const animationRef = useRef(null);
    const v2xClientRef = useRef(null);
    const aiControlIntervalRef = useRef(null);
    const phaseOverridesRef = useRef({});

    const [mapData, setMapData] = useState(null);
    const [boundingBox, setBoundingBox] = useState({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
    const [images, setImages] = useState({ loaded: false, userCar: null, otherCar: null });
    const [mapSource, setMapSource] = useState('Loading...');
    const [vehicles, setVehicles] = useState([]);
    const [pedestrians, setPedestrians] = useState([]);
    const [zebraCrossings, setZebraCrossings] = useState([]);
    const [trafficLights, setTrafficLights] = useState([]);
    const [aiStatus, setAiStatus] = useState({ active: false, lastDecision: null });

    useEffect(() => {
        let isMounted = true;

        const userCarImg = new Image();
        userCarImg.src = '/car.png';

        const otherCarImg = new Image();
        otherCarImg.src = '/black_car.png';

        const ambulanceImg = new Image();
        ambulanceImg.src = '/ambulance.png';

        Promise.all([
            new Promise(resolve => {
                userCarImg.onload = () => resolve(true);
                userCarImg.onerror = () => resolve(false);
            }),
            new Promise(resolve => {
                otherCarImg.onload = () => resolve(true);
                otherCarImg.onerror = () => resolve(false);
            }),
            new Promise(resolve => {
                ambulanceImg.onload = () => resolve(true);
                ambulanceImg.onerror = () => resolve(false);
            })
        ]).then(() => {
            if (isMounted) {
                setImages({ loaded: true, userCar: userCarImg, otherCar: otherCarImg, ambulance: ambulanceImg });
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
                // Get zebra crossings from simulation (they are generated once in constructor)
                setZebraCrossings([...simulationRef.current.getZebraCrossings()]);
                for (let i = 0; i < 3; i++) {
                    setTimeout(() => simulationRef.current?.spawnVehicle(), i * 500);
                }
            }

            let spawnInterval = setInterval(() => {
                if (simulationRef.current && simulationRef.current.vehicles.length < 12) {
                    simulationRef.current.spawnVehicle();
                }
            }, 2500);

            // Collision prediction interval - send vehicles to backend antenna and use tick system
            let isPredicting = false;
            let antennaInitialized = false;

            const initializeAntenna = async () => {
                // Set antenna position to center of map
                if (mapData && mapData.nodesDict && !antennaInitialized) {
                    const nodes = Object.values(mapData.nodesDict);
                    if (nodes.length > 0) {
                        const centerX = nodes.reduce((sum, n) => sum + n.longitude, 0) / nodes.length;
                        const centerY = nodes.reduce((sum, n) => sum + n.latitude, 0) / nodes.length;
                        await setAntennaPosition(centerX, centerY);
                        console.log(`📡 Antenna position set to center: [${centerX}, ${centerY}]`);
                        antennaInitialized = true;
                    }
                }
            };

            const runAntennaTick = async () => {
                if (isPredicting || !simulationRef.current) return;

                const currentVehicles = simulationRef.current.getVehicles();
                if (currentVehicles.length < 2) return;

                try {
                    // Initialize antenna position if not done
                    await initializeAntenna();

                    // Update backend with current vehicle positions
                    await updateVehicles(currentVehicles);

                    // Request antenna tick (this may BLOCK if collision detected within 2 seconds)
                    isPredicting = true;
                    console.log('📡 Antenna tick - checking for collisions...');

                    const tickResult = await antennaTick();

                    if (tickResult && tickResult.collisionPredicted) {
                        console.log('🚨 COLLISION PREDICTED!', tickResult);
                        console.log(`⏱️ Time to collision: ${tickResult.collisionInfo?.timeToCollision?.toFixed(1)}s`);
                        console.log('🤖 AI Decision:', tickResult.aiDecision);

                        // Parse and apply AI decisions to vehicles
                        const decisions = parseAiDecision(tickResult.aiDecision);
                        if (simulationRef.current) {
                            simulationRef.current.applyAiDecisions(decisions);
                        }
                    }
                } catch (error) {
                    console.error('Error in antenna tick:', error);
                } finally {
                    isPredicting = false;
                }
            };

            // Run antenna tick every 200ms (5 times per second)
            let collisionInterval = setInterval(runAntennaTick, 200);

            // AI Traffic Control - runs every 3 seconds
            let aiControlling = false;
            const runAITrafficControlLoop = async () => {
                if (aiControlling || !simulationRef.current) return;
                aiControlling = true;

                try {
                    const currentVehicles = simulationRef.current.getVehicles();
                    const currentLights = simulationRef.current.getTrafficLights();

                    // Try AI control first, fallback to local decision
                    const result = await runAITrafficControl(
                        currentVehicles,
                        currentLights,
                        mapData,
                        phaseOverridesRef.current
                    );

                    if (result.aiDecision) {
                        // AI made a decision
                        phaseOverridesRef.current = result.overrides;
                        simulationRef.current.setPhaseOverrides(result.overrides);
                        setAiStatus({ active: true, lastDecision: result.aiDecision });
                    } else if (result.analysis) {
                        // Fallback to local decision if AI unavailable
                        const localOverrides = makeLocalDecision(result.analysis, phaseOverridesRef.current);
                        phaseOverridesRef.current = localOverrides;
                        simulationRef.current.setPhaseOverrides(localOverrides);
                        setAiStatus({ active: false, lastDecision: null });
                    }
                } catch (error) {
                    console.error('AI Traffic Control error:', error);
                    setAiStatus({ active: false, lastDecision: null });
                } finally {
                    aiControlling = false;
                }
            };

            aiControlIntervalRef.current = setInterval(runAITrafficControlLoop, 3000);
            // Run once immediately
            setTimeout(runAITrafficControlLoop, 1000);

            const gameLoop = (timestamp) => {
                const deltaTime = timestamp - lastTimeRef.current;
                lastTimeRef.current = timestamp;

                if (simulationRef.current) {
                    simulationRef.current.update(deltaTime);
                    setVehicles([...simulationRef.current.getVehicles()]);
                    setPedestrians([...simulationRef.current.getPedestrians()]);
                    setTrafficLights([...simulationRef.current.getTrafficLights()]);
                }

                animationRef.current = requestAnimationFrame(gameLoop);
            };

            animationRef.current = requestAnimationFrame(gameLoop);

            return () => {
                clearInterval(spawnInterval);
                clearInterval(collisionInterval);
                if (aiControlIntervalRef.current) clearInterval(aiControlIntervalRef.current);
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
                pedestrians,
                zebraCrossings,
                trafficLights,
                images,
                showCollisionSpheres
            });
        }
    }, [mapData, boundingBox, vehicles, pedestrians, zebraCrossings, trafficLights, images, showCollisionSpheres]);

    const handleZoomIn = () => rendererRef.current?.zoomIn();
    const handleZoomOut = () => rendererRef.current?.zoomOut();
    const handleReset = () => rendererRef.current?.resetView();
    const handleAddCar = () => {
        if (simulationRef.current && !useBackendSimulation) {
            simulationRef.current.spawnVehicle();
        }
    };
    const handleAddAmbulance = () => {
        if (simulationRef.current && !useBackendSimulation) {
            simulationRef.current.spawnAmbulance();
        }
    };
    const handleAddPedestrian = () => {
        if (simulationRef.current && !useBackendSimulation) {
            simulationRef.current.spawnPedestrian();
        }
    };
    const handleAddUserCar = () => {
        if (simulationRef.current && !useBackendSimulation) {
            simulationRef.current.spawnUserCar();
        }
    };

    return (
        <div className="map-glass-container" style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
            <div className="map-controls">
                <button onClick={handleZoomIn} title="Zoom In">+</button>
                <button onClick={handleReset} title="Reset View">⟲</button>
                <button onClick={handleZoomOut} title="Zoom Out">−</button>
            </div>

            {/* Vehicle spawn controls - separate panel */}
            {!useBackendSimulation && (
                <div style={{
                    position: 'absolute',
                    right: '16px',
                    top: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'white',
                    borderRadius: '8px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                    overflow: 'hidden',
                    zIndex: 10
                }}>
                    <button
                        onClick={handleAddCar}
                        title="Add Car"
                        style={{
                            minWidth: '90px',
                            height: '36px',
                            border: 'none',
                            background: 'white',
                            color: '#5f6368',
                            fontSize: '12px',
                            fontWeight: '500',
                            fontFamily: '"Inter", system-ui, sans-serif',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderBottom: '1px solid #f1f3f4',
                            transition: 'background 0.2s, color 0.2s',
                            padding: '0 12px'
                        }}
                        onMouseEnter={(e) => {
                            e.target.style.background = '#f8f9fa';
                            e.target.style.color = '#202124';
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.background = 'white';
                            e.target.style.color = '#5f6368';
                        }}
                    >
                        Add Car
                    </button>
                    <button
                        onClick={handleAddAmbulance}
                        title="Add Ambulance"
                        style={{
                            minWidth: '90px',
                            height: '36px',
                            border: 'none',
                            background: 'white',
                            color: '#5f6368',
                            fontSize: '12px',
                            fontWeight: '500',
                            fontFamily: '"Inter", system-ui, sans-serif',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderBottom: '1px solid #f1f3f4',
                            transition: 'background 0.2s, color 0.2s',
                            padding: '0 12px'
                        }}
                        onMouseEnter={(e) => {
                            e.target.style.background = '#fef2f2';
                            e.target.style.color = '#dc2626';
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.background = 'white';
                            e.target.style.color = '#5f6368';
                        }}
                    >
                        Add Ambulance
                    </button>
                    <button
                        onClick={handleAddPedestrian}
                        title="Add Pedestrian"
                        style={{
                            minWidth: '90px',
                            height: '36px',
                            border: 'none',
                            background: 'white',
                            color: '#5f6368',
                            fontSize: '12px',
                            fontWeight: '500',
                            fontFamily: '"Inter", system-ui, sans-serif',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderBottom: '1px solid #f1f3f4',
                            transition: 'background 0.2s, color 0.2s',
                            padding: '0 12px'
                        }}
                        onMouseEnter={(e) => {
                            e.target.style.background = '#fef2f2';
                            e.target.style.color = '#dc2626';
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.background = 'white';
                            e.target.style.color = '#5f6368';
                        }}
                    >
                        Add Pedestrian
                    </button>
                    <button
                        onClick={handleAddUserCar}
                        title="Add Your Car"
                        style={{
                            minWidth: '90px',
                            height: '36px',
                            border: 'none',
                            background: 'white',
                            color: '#5f6368',
                            fontSize: '12px',
                            fontWeight: '500',
                            fontFamily: '"Inter", system-ui, sans-serif',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background 0.2s, color 0.2s',
                            padding: '0 12px'
                        }}
                        onMouseEnter={(e) => {
                            e.target.style.background = '#ecfeff';
                            e.target.style.color = '#0891b2';
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.background = 'white';
                            e.target.style.color = '#5f6368';
                        }}
                    >
                        My Car
                    </button>
                </div>
            )}

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

