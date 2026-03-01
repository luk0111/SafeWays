export class VehicleSimulation {
    constructor(mapData) {
        this.mapData = mapData;
        this.vehicles = [];
        this.pedestrians = [];
        this.zebraCrossings = [];
        this.trafficLights = [];
        this.adjacencyList = {};
        this.nextVehicleId = 1;
        this.nextPedestrianId = 1;
        this.leftSpawnPoints = [];
        this.rightSpawnPoints = [];
        this.lastLeftSpawnIndex = 0;
        this.lastRightSpawnIndex = 0;
        this.spawnDirection = 0;
        this.speedLimit = 50;
        this.nextSpeedingTime = this.getRandomSpeedingInterval();
        this.lastUpdateTime = Date.now();

        this.ambulanceSpawnInterval = 15000 + Math.random() * 15000;
        this.lastAmbulanceSpawnTime = Date.now();
        this.ambulanceCount = 0;

        this.pedestrianSpawnInterval = 8000 + Math.random() * 7000;
        this.lastPedestrianSpawnTime = Date.now();

        this.trafficLightGreenDuration = 8000;
        this.trafficLightYellowDuration = 2000;
        this.trafficLightRedDuration = 10000;
        this.phaseOverrides = {};

        this.buildGraph();
        this.generateZebraCrossings();
        this.generateTrafficLights();
    }

    getRandomSpeedingInterval() {
        return 5000 + Math.random() * 5000;
    }

    buildGraph() {
        if (!this.mapData || !this.mapData.arcs) return;

        this.adjacencyList = {};

        this.mapData.arcs.forEach(arc => {
            if (!this.adjacencyList[arc.from]) {
                this.adjacencyList[arc.from] = [];
            }
            if (!this.adjacencyList[arc.to]) {
                this.adjacencyList[arc.to] = [];
            }
            this.adjacencyList[arc.from].push(arc.to);
            this.adjacencyList[arc.to].push(arc.from);
        });

        this.leftSpawnPoints = this.getLeftmostNodes();
        this.rightSpawnPoints = this.getRightmostNodes();
    }

    generateZebraCrossings() {
        if (!this.mapData || !this.mapData.arcs || !this.mapData.nodesDict) {
            this.zebraCrossings = [];
            return;
        }

        this.zebraCrossings = [];
        const minDistanceBetweenCrossings = 0.00045;
        const placedCrossings = [];

        this.mapData.arcs.forEach((arc, index) => {
            const fromNode = this.mapData.nodesDict[arc.from];
            const toNode = this.mapData.nodesDict[arc.to];

            if (!fromNode || !toNode) return;

            const dx = toNode.longitude - fromNode.longitude;
            const dy = toNode.latitude - fromNode.latitude;
            const arcLength = Math.sqrt(dx * dx + dy * dy);

            if (arcLength < 0.0003) return;

            const rotation = Math.atan2(dy, dx);
            const randomT = 0.3 + Math.random() * 0.4;
            const crossingX = fromNode.longitude + dx * randomT;
            const crossingY = fromNode.latitude + dy * randomT;

            let tooClose = false;
            for (const existing of placedCrossings) {
                const distX = crossingX - existing.x;
                const distY = crossingY - existing.y;
                const dist = Math.sqrt(distX * distX + distY * distY);
                if (dist < minDistanceBetweenCrossings) {
                    tooClose = true;
                    break;
                }
            }

            if (!tooClose) {
                this.zebraCrossings.push({
                    id: `zebra-${index}`,
                    x: crossingX,
                    y: crossingY,
                    rotation: rotation,
                    arcFrom: arc.from,
                    arcTo: arc.to,
                    pedestrianCrossing: null,
                    width: 0.00012
                });
                placedCrossings.push({ x: crossingX, y: crossingY });
            }
        });
    }

    getZebraCrossings() {
        return this.zebraCrossings;
    }

    generateTrafficLights() {
        if (!this.mapData || !this.mapData.intersections) {
            this.trafficLights = [];
            return;
        }

        this.trafficLights = [];

        const centralNodeId = this.mapData.centralAntenna?.nodeId || null;

        const availableIntersections = this.mapData.intersections.filter(
            intersection => intersection.id !== centralNodeId
        );

        const numIntersectionsWithLights = Math.ceil(availableIntersections.length / 2);

        const shuffled = [...availableIntersections].sort(() => Math.random() - 0.5);
        const selectedIntersections = shuffled.slice(0, numIntersectionsWithLights);

        selectedIntersections.forEach((intersection, intersectionIndex) => {
            const connectedArcs = this.mapData.arcs.filter(arc =>
                arc.from === intersection.id || arc.to === intersection.id
            );

            if (connectedArcs.length < 2) return;

            const roadDirections = connectedArcs.map((arc, arcIndex) => {
                const otherNodeId = arc.from === intersection.id ? arc.to : arc.from;
                const otherNode = this.mapData.nodesDict[otherNodeId];
                if (!otherNode) return null;

                const dx = otherNode.longitude - intersection.longitude;
                const dy = otherNode.latitude - intersection.latitude;
                const rotation = Math.atan2(dy, dx);

                const normalizedRotation = rotation < 0 ? rotation + 2 * Math.PI : rotation;

                return {
                    arcIndex,
                    nodeId: otherNodeId,
                    rotation: rotation,
                    normalizedRotation: normalizedRotation,
                    dx, dy
                };
            }).filter(Boolean);

            roadDirections.sort((a, b) => a.normalizedRotation - b.normalizedRotation);

            roadDirections.forEach((road, index) => {
                let phase = 0;

                if (roadDirections.length >= 3) {
                    phase = index % 2;
                } else if (roadDirections.length === 2) {
                    phase = 0;
                }

                const intersectionOffset = intersectionIndex * 5000;

                const trafficLight = {
                    id: `traffic-light-${intersection.id}-${index}`,
                    intersectionId: intersection.id,
                    x: intersection.longitude,
                    y: intersection.latitude,
                    rotation: road.rotation,
                    nodeId: road.nodeId,
                    phase: phase,
                    state: 'GREEN',
                    intersectionOffset: intersectionOffset,
                    offsetX: Math.cos(road.rotation + Math.PI) * 0.00004,
                    offsetY: Math.sin(road.rotation + Math.PI) * 0.00004
                };

                this.trafficLights.push(trafficLight);
            });
        });

        console.log(`🚦 Generated ${this.trafficLights.length} traffic lights at ${selectedIntersections.length} intersections`);
    }

    setPhaseOverrides(overrides) {
        this.phaseOverrides = overrides || {};
    }

    getPhaseOverrides() {
        return this.phaseOverrides || {};
    }

    updateTrafficLights() {
        const now = Date.now();
        const phaseDuration = this.trafficLightGreenDuration + this.trafficLightYellowDuration;
        const fullCycleDuration = phaseDuration * 2;

        this.trafficLights.forEach(light => {
            const override = this.phaseOverrides?.[light.intersectionId];
            const hasActiveOverride = override && override.until > now;

            let isMyPhaseActive;
            let timeInPhase;

            if (hasActiveOverride) {
                isMyPhaseActive = (light.phase === override.priorityPhase);
                timeInPhase = 0;
            } else {
                const elapsed = (now - light.intersectionOffset) % fullCycleDuration;
                const currentPhaseIndex = Math.floor(elapsed / phaseDuration);
                timeInPhase = elapsed % phaseDuration;
                isMyPhaseActive = (light.phase === currentPhaseIndex);
            }

            if (isMyPhaseActive) {
                if (timeInPhase < this.trafficLightGreenDuration || hasActiveOverride) {
                    light.state = 'GREEN';
                } else {
                    light.state = 'YELLOW';
                }
            } else {
                light.state = 'RED';
            }

            light.aiControlled = hasActiveOverride;
        });
    }

    getTrafficLights() {
        return this.trafficLights.map(light => ({
            id: light.id,
            intersectionId: light.intersectionId,
            x: light.x + (light.offsetX || 0),
            y: light.y + (light.offsetY || 0),
            state: light.state,
            rotation: light.rotation,
            phase: light.phase,
            aiControlled: light.aiControlled || false
        }));
    }

    getTrafficLightAhead(vehicle) {
        if (vehicle.isAmbulance) return null;

        const dirX = Math.cos(vehicle.rotation);
        const dirY = Math.sin(vehicle.rotation);

        const detectionDistance = 0.00025;
        const stopDistance = 0.00009;

        let closestLight = null;
        let closestDist = Infinity;

        for (const light of this.trafficLights) {
            const toLightX = light.x - vehicle.x;
            const toLightY = light.y - vehicle.y;

            const forwardDist = dirX * toLightX + dirY * toLightY;

            if (forwardDist <= 0 || forwardDist > detectionDistance) continue;

            const lateralDist = Math.abs(-dirY * toLightX + dirX * toLightY);
            if (lateralDist > 0.00015) continue;

            const rotationDiff = Math.abs(this.normalizeAngle(vehicle.rotation - light.rotation));

            const isCorrectDirection = rotationDiff > Math.PI * 0.6 && rotationDiff < Math.PI * 1.4;

            if (!isCorrectDirection) continue;

            if (forwardDist < closestDist) {
                closestDist = forwardDist;
                closestLight = light;
            }
        }

        if (closestLight) {
            return {
                light: closestLight,
                distance: closestDist,
                shouldStop: closestLight.state === 'RED' ||
                           (closestLight.state === 'YELLOW' && closestDist > stopDistance)
            };
        }
        return null;
    }

    getLeftmostNodes() {
        if (!this.mapData || !this.mapData.nodesDict) return [];

        const nodes = Object.values(this.mapData.nodesDict);
        const minLon = Math.min(...nodes.map(n => n.longitude));
        const threshold = minLon + (Math.max(...nodes.map(n => n.longitude)) - minLon) * 0.25;

        return nodes
            .filter(n => n.longitude <= threshold)
            .sort((a, b) => a.latitude - b.latitude)
            .map(n => n.id);
    }

    getRightmostNodes() {
        if (!this.mapData || !this.mapData.nodesDict) return [];

        const nodes = Object.values(this.mapData.nodesDict);
        const maxLon = Math.max(...nodes.map(n => n.longitude));
        const threshold = maxLon - (maxLon - Math.min(...nodes.map(n => n.longitude))) * 0.25;

        return nodes
            .filter(n => n.longitude >= threshold)
            .sort((a, b) => a.latitude - b.latitude)
            .map(n => n.id);
    }

    findPathToRight(startNodeId) {
        const rightNodes = new Set(this.getRightmostNodes());
        return this.findPath(startNodeId, rightNodes, true);
    }

    findPathToLeft(startNodeId) {
        const leftNodes = new Set(this.getLeftmostNodes());
        return this.findPath(startNodeId, leftNodes, false);
    }

    findPath(startNodeId, targetNodes, preferRight) {
        const visited = new Set();
        const queue = [[startNodeId]];

        while (queue.length > 0) {
            const path = queue.shift();
            const current = path[path.length - 1];

            if (targetNodes.has(current) && path.length > 1) {
                return path;
            }

            if (visited.has(current)) continue;
            visited.add(current);

            const neighbors = this.adjacencyList[current] || [];
            const shuffled = [...neighbors].sort(() => Math.random() - 0.5);

            for (const neighbor of shuffled) {
                if (!visited.has(neighbor)) {
                    const newPath = [...path, neighbor];

                    const neighborNode = this.mapData.nodesDict[neighbor];
                    const currentNode = this.mapData.nodesDict[current];
                    if (neighborNode && currentNode) {
                        const isPreferredDirection = preferRight
                            ? neighborNode.longitude >= currentNode.longitude - 0.001
                            : neighborNode.longitude <= currentNode.longitude + 0.001;

                        if (isPreferredDirection) {
                            queue.unshift(newPath);
                        } else {
                            queue.push(newPath);
                        }
                    }
                }
            }
        }

        return [startNodeId];
    }

    normalizeAngle(angle) {
        while (angle > Math.PI) angle -= 2 * Math.PI;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
    }

    lerpAngle(from, to, t) {
        let diff = this.normalizeAngle(to - from);
        return from + diff * t;
    }

    getNextLeftSpawnPoint() {
        if (this.leftSpawnPoints.length === 0) return null;
        const nodeId = this.leftSpawnPoints[this.lastLeftSpawnIndex % this.leftSpawnPoints.length];
        this.lastLeftSpawnIndex++;
        return nodeId;
    }

    getNextRightSpawnPoint() {
        if (this.rightSpawnPoints.length === 0) return null;
        const nodeId = this.rightSpawnPoints[this.lastRightSpawnIndex % this.rightSpawnPoints.length];
        this.lastRightSpawnIndex++;
        return nodeId;
    }

    spawnVehicle() {
        const goingRight = this.spawnDirection % 2 === 0;
        this.spawnDirection++;

        let startNodeId, path;

        if (goingRight) {
            startNodeId = this.getNextLeftSpawnPoint();
            if (!startNodeId) return null;
            path = this.findPathToRight(startNodeId);
        } else {
            startNodeId = this.getNextRightSpawnPoint();
            if (!startNodeId) return null;
            path = this.findPathToLeft(startNodeId);
        }

        if (path.length < 2) return null;

        const startNode = this.mapData.nodesDict[path[0]];
        const nextNode = this.mapData.nodesDict[path[1]];

        const targetRotation = this.calculateRotation(startNode.longitude, startNode.latitude, nextNode.longitude, nextNode.latitude);

        const offset = this.getLaneOffset(
            startNode.longitude, startNode.latitude,
            nextNode.longitude, nextNode.latitude,
            goingRight
        );

        const vehicle = {
            id: `Car-${this.nextVehicleId++}`,
            x: startNode.longitude + offset.offsetX,
            y: startNode.latitude + offset.offsetY,
            targetX: nextNode.longitude + offset.offsetX,
            targetY: nextNode.latitude + offset.offsetY,
            path: path,
            pathIndex: 0,
            speed: 0.00000015 + Math.random() * 0.00000008,
            speedKmH: 30 + Math.random() * 20,
            rotation: targetRotation,
            targetRotation: targetRotation,
            isCurrentUser: false,
            active: true,
            direction: goingRight ? 'right' : 'left'
        };

        this.vehicles.push(vehicle);
        return vehicle;
    }

    spawnAmbulance() {
        const goingRight = this.spawnDirection % 2 === 0;
        this.spawnDirection++;

        let startNodeId, path;

        if (goingRight) {
            startNodeId = this.getNextLeftSpawnPoint();
            if (!startNodeId) return null;
            path = this.findPathToRight(startNodeId);
        } else {
            startNodeId = this.getNextRightSpawnPoint();
            if (!startNodeId) return null;
            path = this.findPathToLeft(startNodeId);
        }

        if (path.length < 2) return null;

        const startNode = this.mapData.nodesDict[path[0]];
        const nextNode = this.mapData.nodesDict[path[1]];

        const targetRotation = this.calculateRotation(startNode.longitude, startNode.latitude, nextNode.longitude, nextNode.latitude);

        const offset = this.getLaneOffset(
            startNode.longitude, startNode.latitude,
            nextNode.longitude, nextNode.latitude,
            goingRight
        );

        const ambulance = {
            id: `Ambulance-${++this.ambulanceCount}`,
            x: startNode.longitude + offset.offsetX,
            y: startNode.latitude + offset.offsetY,
            targetX: nextNode.longitude + offset.offsetX,
            targetY: nextNode.latitude + offset.offsetY,
            path: path,
            pathIndex: 0,
            speed: 0.00000020,
            speedKmH: 60 + Math.random() * 20,
            rotation: targetRotation,
            targetRotation: targetRotation,
            isCurrentUser: false,
            isAmbulance: true,
            active: true,
            direction: goingRight ? 'right' : 'left'
        };

        this.vehicles.push(ambulance);
        console.log(`🚑 Ambulance ${ambulance.id} spawned!`);
        return ambulance;
    }

    isInAmbulanceZone(vehicle, ambulance) {
        if (!ambulance || !ambulance.isAmbulance || !ambulance.active) return false;
        if (vehicle === ambulance) return false;
        if (vehicle.isAmbulance) return false;

        const ambDirX = Math.cos(ambulance.rotation);
        const ambDirY = Math.sin(ambulance.rotation);

        const toVehicleX = vehicle.x - ambulance.x;
        const toVehicleY = vehicle.y - ambulance.y;

        const forwardDist = ambDirX * toVehicleX + ambDirY * toVehicleY;

        const distToTarget = this.getDistance(ambulance.x, ambulance.y, ambulance.targetX, ambulance.targetY);

        if (forwardDist <= 0 || forwardDist > distToTarget) return false;

        const lateralDist = Math.abs(-ambDirY * toVehicleX + ambDirX * toVehicleY);

        const rectangleHalfWidth = 0.00018;

        return lateralDist <= rectangleHalfWidth;
    }

    isPedestrianInAmbulanceZone(pedestrian, ambulance) {
        if (!ambulance || !ambulance.isAmbulance || !ambulance.active) return false;

        const ambDirX = Math.cos(ambulance.rotation);
        const ambDirY = Math.sin(ambulance.rotation);

        const toPedX = pedestrian.x - ambulance.x;
        const toPedY = pedestrian.y - ambulance.y;

        const forwardDist = ambDirX * toPedX + ambDirY * toPedY;

        const distToTarget = this.getDistance(ambulance.x, ambulance.y, ambulance.targetX, ambulance.targetY);

        if (forwardDist <= 0 || forwardDist > distToTarget) return false;

        const lateralDist = Math.abs(-ambDirY * toPedX + ambDirX * toPedY);

        const rectangleHalfWidth = 0.00005;

        return lateralDist <= rectangleHalfWidth;
    }

    isPedestrianInFrontOfVehicle(vehicle, pedestrian) {
        if (!vehicle || !vehicle.active || vehicle.isAmbulance) return null;
        if (!pedestrian || !pedestrian.active) return null;

        const dirX = Math.cos(vehicle.rotation);
        const dirY = Math.sin(vehicle.rotation);

        const toPedX = pedestrian.x - vehicle.x;
        const toPedY = pedestrian.y - vehicle.y;

        const forwardDist = dirX * toPedX + dirY * toPedY;

        const detectionRange = 0.00027;
        if (forwardDist <= 0 || forwardDist > detectionRange) return null;

        const lateralDist = Math.abs(-dirY * toPedX + dirX * toPedY);

        const rectangleHalfWidth = 0.00009;

        if (lateralDist <= rectangleHalfWidth) {
            return forwardDist;
        }
        return null;
    }

    findPedestrianInFront(vehicle) {
        let closestDist = Infinity;
        let closestPed = null;

        for (const ped of this.pedestrians) {
            const dist = this.isPedestrianInFrontOfVehicle(vehicle, ped);
            if (dist !== null && dist < closestDist) {
                closestDist = dist;
                closestPed = ped;
            }
        }

        return closestPed ? { pedestrian: closestPed, distance: closestDist } : null;
    }

    getActiveAmbulances() {
        return this.vehicles.filter(v => v.isAmbulance && v.active);
    }

    spawnPedestrian() {
        if (!this.mapData || !this.mapData.arcs || this.mapData.arcs.length === 0) return null;

        const randomArcIndex = Math.floor(Math.random() * this.mapData.arcs.length);
        const arc = this.mapData.arcs[randomArcIndex];

        const fromNode = this.mapData.nodesDict[arc.from];
        const toNode = this.mapData.nodesDict[arc.to];

        if (!fromNode || !toNode) return null;

        const sidewalkSide = Math.random() > 0.5 ? 1 : -1;

        const dx = toNode.longitude - fromNode.longitude;
        const dy = toNode.latitude - fromNode.latitude;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return null;

        const perpX = (dy / len) * sidewalkSide;
        const perpY = (-dx / len) * sidewalkSide;

        const sidewalkOffset = 0.00007;

        const startX = fromNode.longitude + perpX * sidewalkOffset;
        const startY = fromNode.latitude + perpY * sidewalkOffset;
        const endX = toNode.longitude + perpX * sidewalkOffset;
        const endY = toNode.latitude + perpY * sidewalkOffset;

        const pedestrian = {
            id: `Pedestrian-${this.nextPedestrianId++}`,
            x: startX,
            y: startY,
            targetX: endX,
            targetY: endY,
            startNode: arc.from,
            endNode: arc.to,
            speed: 0.00000015 + Math.random() * 0.00000008,
            active: true,
            sidewalkSide: sidewalkSide,
            isCrossing: false,
            crossingZebra: null,
            crossingTargetX: null,
            crossingTargetY: null,
            waitingAtZebra: false,
            crossingCooldown: 0,
            inAmbulanceZone: false
        };

        this.pedestrians.push(pedestrian);
        console.log(`🚶 Pedestrian ${pedestrian.id} spawned!`);
        return pedestrian;
    }

    findNearbyZebra(pedestrian) {
        const searchRadius = 0.00025;

        for (const zebra of this.zebraCrossings) {
            const dx = zebra.x - pedestrian.x;
            const dy = zebra.y - pedestrian.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < searchRadius && !zebra.pedestrianCrossing) {
                return zebra;
            }
        }
        return null;
    }

    isPedestrianCrossingAtZebra(zebra) {
        return this.pedestrians.some(p => p.isCrossing && p.crossingZebra === zebra.id);
    }

    getActiveZebraCrossings() {
        return this.zebraCrossings.filter(z => this.isPedestrianCrossingAtZebra(z));
    }

    updatePedestrians(dt) {
        const activeAmbulances = this.getActiveAmbulances();

        this.pedestrians.forEach(pedestrian => {
            if (!pedestrian.active) return;

            let inAmbulanceZone = false;
            for (const ambulance of activeAmbulances) {
                if (this.isPedestrianInAmbulanceZone(pedestrian, ambulance)) {
                    inAmbulanceZone = true;
                    break;
                }
            }
            pedestrian.inAmbulanceZone = inAmbulanceZone;

            if (inAmbulanceZone) {
                return;
            }

            if (pedestrian.crossingCooldown > 0) {
                pedestrian.crossingCooldown -= dt;
            }

            if (pedestrian.isCrossing) {
                const dx = pedestrian.crossingTargetX - pedestrian.x;
                const dy = pedestrian.crossingTargetY - pedestrian.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 0.00002) {
                    pedestrian.isCrossing = false;
                    pedestrian.sidewalkSide *= -1;
                    pedestrian.crossingCooldown = 5000;

                    const zebra = this.zebraCrossings.find(z => z.id === pedestrian.crossingZebra);
                    if (zebra) {
                        zebra.pedestrianCrossing = null;
                    }
                    pedestrian.crossingZebra = null;

                    // Set new target on the other sidewalk
                    const currentNode = this.mapData.nodesDict[pedestrian.endNode];
                    if (currentNode) {
                        const startNode = this.mapData.nodesDict[pedestrian.startNode];
                        if (startNode) {
                            const ndx = currentNode.longitude - startNode.longitude;
                            const ndy = currentNode.latitude - startNode.latitude;
                            const nlen = Math.sqrt(ndx * ndx + ndy * ndy);
                            if (nlen > 0) {
                                const perpX = (ndy / nlen) * pedestrian.sidewalkSide;
                                const perpY = (-ndx / nlen) * pedestrian.sidewalkSide;
                                const sidewalkOffset = 0.00007;
                                pedestrian.targetX = currentNode.longitude + perpX * sidewalkOffset;
                                pedestrian.targetY = currentNode.latitude + perpY * sidewalkOffset;
                            }
                        }
                    }
                    console.log(`🚶 ${pedestrian.id} finished crossing zebra`);
                    return;
                }

                // Move across the crossing - same speed as walking
                const moveX = (dx / dist) * pedestrian.speed * dt;
                const moveY = (dy / dist) * pedestrian.speed * dt;
                pedestrian.x += moveX;
                pedestrian.y += moveY;
                return;
            }

            // Pedestrians ONLY cross at zebra crossings - check for nearby zebra
            if (pedestrian.crossingCooldown <= 0) {
                const nearbyZebra = this.findNearbyZebra(pedestrian);
                if (nearbyZebra && !nearbyZebra.pedestrianCrossing) {
                    // Higher chance to cross when at a zebra (5% chance per frame when near)
                    if (Math.random() < 0.05) {
                        // Start crossing at zebra
                        pedestrian.isCrossing = true;
                        pedestrian.crossingZebra = nearbyZebra.id;
                        nearbyZebra.pedestrianCrossing = pedestrian.id;

                        // Calculate perpendicular direction to road (crossing direction)
                        const zebra = nearbyZebra;
                        const perpX = Math.cos(zebra.rotation + Math.PI / 2);
                        const perpY = Math.sin(zebra.rotation + Math.PI / 2);

                        // Distance to cross the full road width
                        const sidewalkOffset = 0.00007;
                        const crossingDistance = sidewalkOffset * 2; // Cross to the other sidewalk

                        // Set crossing target: start from zebra position, cross to opposite side
                        // The target is on the opposite sidewalk at the zebra location
                        pedestrian.crossingTargetX = zebra.x + perpX * crossingDistance * (-pedestrian.sidewalkSide);
                        pedestrian.crossingTargetY = zebra.y + perpY * crossingDistance * (-pedestrian.sidewalkSide);

                        console.log(`🚶 ${pedestrian.id} crossing at zebra ${nearbyZebra.id}`);
                        return;
                    }
                }
            }

            const dx = pedestrian.targetX - pedestrian.x;
            const dy = pedestrian.targetY - pedestrian.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Check if reached destination
            if (dist < 0.00002) {
                // Find a new random destination (continue walking)
                const neighbors = this.adjacencyList[pedestrian.endNode] || [];
                if (neighbors.length > 0) {
                    const nextNodeId = neighbors[Math.floor(Math.random() * neighbors.length)];
                    const currentNode = this.mapData.nodesDict[pedestrian.endNode];
                    const nextNode = this.mapData.nodesDict[nextNodeId];

                    if (currentNode && nextNode) {
                        // Calculate new sidewalk position
                        const ndx = nextNode.longitude - currentNode.longitude;
                        const ndy = nextNode.latitude - currentNode.latitude;
                        const nlen = Math.sqrt(ndx * ndx + ndy * ndy);

                        if (nlen > 0) {
                            const perpX = (ndy / nlen) * pedestrian.sidewalkSide;
                            const perpY = (-ndx / nlen) * pedestrian.sidewalkSide;
                            const sidewalkOffset = 0.00007;

                            pedestrian.x = currentNode.longitude + perpX * sidewalkOffset;
                            pedestrian.y = currentNode.latitude + perpY * sidewalkOffset;
                            pedestrian.targetX = nextNode.longitude + perpX * sidewalkOffset;
                            pedestrian.targetY = nextNode.latitude + perpY * sidewalkOffset;
                            pedestrian.startNode = pedestrian.endNode;
                            pedestrian.endNode = nextNodeId;
                        }
                    }
                } else {
                    // No more neighbors, deactivate
                    pedestrian.active = false;
                }
                return;
            }

            // Move towards target
            const moveX = (dx / dist) * pedestrian.speed * dt;
            const moveY = (dy / dist) * pedestrian.speed * dt;

            pedestrian.x += moveX;
            pedestrian.y += moveY;
        });

        // Remove inactive pedestrians
        this.pedestrians = this.pedestrians.filter(p => p.active);
    }

    /**
     * Get all active pedestrians
     */
    getPedestrians() {
        return this.pedestrians.map(p => ({
            id: p.id,
            x: p.x,
            y: p.y,
            active: p.active,
            isCrossing: p.isCrossing || false,
            crossingZebra: p.crossingZebra || null,
            inAmbulanceZone: p.inAmbulanceZone || false
        }));
    }

    calculateRotation(fromX, fromY, toX, toY) {
        return Math.atan2(toY - fromY, toX - fromX);
    }

    getLaneOffset(fromX, fromY, toX, toY, goingRight) {
        const dx = toX - fromX;
        const dy = toY - fromY;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return { offsetX: 0, offsetY: 0 };

        const perpX = dy / len;
        const perpY = -dx / len;

        const laneWidth = 0.000024;

        return {
            offsetX: perpX * laneWidth,
            offsetY: perpY * laneWidth
        };
    }

    // Calculate distance between two points
    getDistance(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }


    // Find the closest car in front of the given vehicle (same direction only)
    findCarInFront(vehicle, searchDistance) {
        let closest = null;
        let closestDist = Infinity;

        // Calculate vehicle's direction vector (normalized)
        const dirX = Math.cos(vehicle.rotation);
        const dirY = Math.sin(vehicle.rotation);

        for (const other of this.vehicles) {
            if (other === vehicle || !other.active) continue;

            // Only consider cars going in the same direction (same lane)
            if (other.direction !== vehicle.direction) continue;

            // Check if both cars are actually traveling in roughly the same physical direction
            // (their rotation angles should be similar - within ~60 degrees)
            const rotationDiff = Math.abs(this.normalizeAngle(vehicle.rotation - other.rotation));
            if (rotationDiff > Math.PI / 3) continue; // More than 60 degrees apart, different paths

            // Vector from this vehicle to the other
            const toOtherX = other.x - vehicle.x;
            const toOtherY = other.y - vehicle.y;
            const dist = Math.sqrt(toOtherX * toOtherX + toOtherY * toOtherY);

            // Skip if too far
            if (dist > searchDistance) continue;

            // Project the vector to other car onto our direction
            // Positive means the other car is ahead, negative means behind
            const projectionDistance = dirX * toOtherX + dirY * toOtherY;

            // Only consider cars that are truly IN FRONT (projection > small threshold)
            // A car directly behind would have a negative projection
            if (projectionDistance > 0.00001) {
                // Calculate lateral distance (how far to the side the car is)
                const lateralDistance = Math.abs(-dirY * toOtherX + dirX * toOtherY);

                // Only consider if the car is mostly ahead and not too far to the side
                // Car should be within our lane width (not in another lane)
                const laneWidth = 0.00006; // Roughly lane width

                if (lateralDistance < laneWidth) {
                    if (projectionDistance < closestDist) {
                        closestDist = projectionDistance;
                        closest = other;
                    }
                }
            }
        }

        return closest;
    }

    update(deltaTime) {
        const dt = Math.min(deltaTime, 50);
        const currentTime = Date.now();

        // Check if it's time to generate a random speeding vehicle
        if (currentTime - this.lastUpdateTime >= this.nextSpeedingTime) {
            this.generateRandomSpeeder();
            this.lastUpdateTime = currentTime;
            this.nextSpeedingTime = this.getRandomSpeedingInterval();
        }

        // Check if it's time to spawn an ambulance
        if (currentTime - this.lastAmbulanceSpawnTime >= this.ambulanceSpawnInterval) {
            // Only spawn if there are less than 2 ambulances active
            const activeAmbulances = this.getActiveAmbulances();
            if (activeAmbulances.length < 2) {
                this.spawnAmbulance();
            }
            this.lastAmbulanceSpawnTime = currentTime;
            this.ambulanceSpawnInterval = 15000 + Math.random() * 15000;
        }

        // Check if it's time to spawn a pedestrian
        if (currentTime - this.lastPedestrianSpawnTime >= this.pedestrianSpawnInterval) {
            // Only spawn if there are less than 10 pedestrians active
            if (this.pedestrians.length < 10) {
                this.spawnPedestrian();
            }
            this.lastPedestrianSpawnTime = currentTime;
            this.pedestrianSpawnInterval = 8000 + Math.random() * 7000;
        }

        // Update pedestrians
        this.updatePedestrians(dt);

        // Update traffic lights
        this.updateTrafficLights();

        // Get all active ambulances for zone checking
        const activeAmbulances = this.getActiveAmbulances();

        // Get active zebra crossings (pedestrians currently crossing)
        const activeZebraCrossings = this.getActiveZebraCrossings();

        // Minimum distance between cars (in coordinate units, ~10m)
        const MIN_CAR_DISTANCE = 0.00012;
        // Safe following distance (in coordinate units, ~15m)
        const SAFE_FOLLOWING_DISTANCE = 0.00018;
        // Distance to start slowing for zebra crossing
        const ZEBRA_SLOW_DISTANCE = 0.00025;
        // Distance to stop at zebra crossing
        const ZEBRA_STOP_DISTANCE = 0.00012;
        // Distance to stop at traffic light
        const TRAFFIC_LIGHT_STOP_DISTANCE = 0.00010;

        this.vehicles.forEach(vehicle => {
            if (!vehicle.active) return;

            // Check if this vehicle is in any ambulance's zone
            let inAmbulanceZone = false;
            for (const ambulance of activeAmbulances) {
                if (this.isInAmbulanceZone(vehicle, ambulance)) {
                    inAmbulanceZone = true;
                    break;
                }
            }

            // Check for traffic light ahead
            const trafficLightResult = this.getTrafficLightAhead(vehicle);
            vehicle.trafficLightAhead = trafficLightResult;

            // Check if approaching a zebra crossing with pedestrian
            let zebraCrossingAhead = null;
            let distToZebra = Infinity;

            // Check for pedestrian in front of vehicle (detection rectangle)
            let pedestrianAhead = null;
            let distToPedestrian = Infinity;

            if (!vehicle.isAmbulance) {
                const dirX = Math.cos(vehicle.rotation);
                const dirY = Math.sin(vehicle.rotation);

                // Check for zebra crossings ahead
                for (const zebra of activeZebraCrossings) {
                    const toZebraX = zebra.x - vehicle.x;
                    const toZebraY = zebra.y - vehicle.y;

                    // Project onto vehicle direction (is zebra ahead?)
                    const forwardDist = dirX * toZebraX + dirY * toZebraY;

                    // Only consider zebras ahead of vehicle
                    if (forwardDist > 0 && forwardDist < ZEBRA_SLOW_DISTANCE) {
                        // Check lateral distance (is it on our path?)
                        const lateralDist = Math.abs(-dirY * toZebraX + dirX * toZebraY);

                        if (lateralDist < 0.00015) { // Within road width
                            if (forwardDist < distToZebra) {
                                distToZebra = forwardDist;
                                zebraCrossingAhead = zebra;
                            }
                        }
                    }
                }

                // Check for pedestrians in front using detection rectangle
                const pedInFront = this.findPedestrianInFront(vehicle);
                if (pedInFront) {
                    pedestrianAhead = pedInFront.pedestrian;
                    distToPedestrian = pedInFront.distance;
                }
            }

            // Update vehicle's ambulance zone state
            vehicle.inAmbulanceZone = inAmbulanceZone;
            vehicle.stoppingForZebra = zebraCrossingAhead !== null;
            vehicle.pedestrianAhead = pedestrianAhead !== null;

            vehicle.rotation = this.lerpAngle(vehicle.rotation, vehicle.targetRotation, 0.12);

            const dx = vehicle.targetX - vehicle.x;
            const dy = vehicle.targetY - vehicle.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 0.00003) {
                vehicle.pathIndex++;

                if (vehicle.pathIndex >= vehicle.path.length - 1) {
                    vehicle.active = false;
                    return;
                }

                const currentNodeId = vehicle.path[vehicle.pathIndex];
                const nextNodeId = vehicle.path[vehicle.pathIndex + 1];
                const currentNode = this.mapData.nodesDict[currentNodeId];
                const nextNode = this.mapData.nodesDict[nextNodeId];

                if (currentNode && nextNode) {
                    const offset = this.getLaneOffset(
                        currentNode.longitude, currentNode.latitude,
                        nextNode.longitude, nextNode.latitude,
                        vehicle.direction === 'right'
                    );

                    vehicle.x = currentNode.longitude + offset.offsetX;
                    vehicle.y = currentNode.latitude + offset.offsetY;
                    vehicle.targetX = nextNode.longitude + offset.offsetX;
                    vehicle.targetY = nextNode.latitude + offset.offsetY;
                    vehicle.targetRotation = this.calculateRotation(currentNode.longitude, currentNode.latitude, nextNode.longitude, nextNode.latitude);
                }
            } else {
                // Check for car in front and adjust speed (but not for ambulances)
                const carInFront = vehicle.isAmbulance ? null : this.findCarInFront(vehicle, SAFE_FOLLOWING_DISTANCE);

                let effectiveSpeedKmH = vehicle.speedKmH;

                // Distance thresholds for pedestrian detection
                const PED_SLOW_DISTANCE = 0.00020; // Start slowing for pedestrian
                const PED_STOP_DISTANCE = 0.00010; // Stop for pedestrian

                // AMBULANCES: Always keep driving at full speed, ignore all obstacles
                if (vehicle.isAmbulance) {
                    effectiveSpeedKmH = vehicle.speedKmH; // Ambulances never slow down
                }
                // AMBULANCE ZONE: If vehicle is in ambulance zone, stop completely
                else if (vehicle.inAmbulanceZone) {
                    effectiveSpeedKmH = 0;
                }
                // PEDESTRIAN AHEAD: Slow down and stop for pedestrians in front
                else if (pedestrianAhead && distToPedestrian < PED_SLOW_DISTANCE) {
                    if (distToPedestrian <= PED_STOP_DISTANCE) {
                        // Stop completely for pedestrian
                        effectiveSpeedKmH = 0;
                    } else {
                        // Gradually slow down as approaching pedestrian
                        const slowdownFactor = (distToPedestrian - PED_STOP_DISTANCE) / (PED_SLOW_DISTANCE - PED_STOP_DISTANCE);
                        effectiveSpeedKmH = vehicle.speedKmH * Math.min(1, slowdownFactor * 0.4);
                        effectiveSpeedKmH = Math.max(3, effectiveSpeedKmH); // Minimum 3 km/h while slowing
                    }
                }
                // ZEBRA CROSSING: Slow down and stop for pedestrians crossing
                else if (zebraCrossingAhead) {
                    if (distToZebra <= ZEBRA_STOP_DISTANCE) {
                        // Stop completely at the zebra crossing
                        effectiveSpeedKmH = 0;
                    } else {
                        // Gradually slow down as approaching
                        const slowdownFactor = (distToZebra - ZEBRA_STOP_DISTANCE) / (ZEBRA_SLOW_DISTANCE - ZEBRA_STOP_DISTANCE);
                        effectiveSpeedKmH = vehicle.speedKmH * Math.min(1, slowdownFactor * 0.5); // Slow to 50% max
                        effectiveSpeedKmH = Math.max(5, effectiveSpeedKmH); // Minimum 5 km/h while slowing
                        if (distToZebra < ZEBRA_STOP_DISTANCE * 1.5) {
                            effectiveSpeedKmH = 0; // Stop when very close
                        }
                    }
                }
                // TRAFFIC LIGHT: Stop at red, caution at yellow, go at green
                else if (trafficLightResult && trafficLightResult.shouldStop) {
                    const distToLight = trafficLightResult.distance;
                    if (distToLight <= TRAFFIC_LIGHT_STOP_DISTANCE) {
                        // Stop at the traffic light
                        effectiveSpeedKmH = 0;
                    } else {
                        // Gradually slow down as approaching red/yellow light
                        const slowdownFactor = (distToLight - TRAFFIC_LIGHT_STOP_DISTANCE) / (0.00022 - TRAFFIC_LIGHT_STOP_DISTANCE);
                        effectiveSpeedKmH = vehicle.speedKmH * Math.min(1, slowdownFactor * 0.5);
                        effectiveSpeedKmH = Math.max(5, effectiveSpeedKmH);
                        if (distToLight < TRAFFIC_LIGHT_STOP_DISTANCE * 1.2) {
                            effectiveSpeedKmH = 0; // Stop when very close
                        }
                    }
                }
                // Apply AI command if present (from backend collision prediction)
                else if (vehicle.aiCommand) {
                    if (vehicle.aiCommand === 'OPRESTE') {
                        effectiveSpeedKmH = 0;
                    } else if (vehicle.aiCommand === 'INCETINESTE') {
                        effectiveSpeedKmH = Math.min(effectiveSpeedKmH, vehicle.aiTargetSpeed || 20);
                    } else if (vehicle.aiCommand === 'ACCELEREAZA') {
                        effectiveSpeedKmH = Math.max(effectiveSpeedKmH, vehicle.aiTargetSpeed || 60);
                    }
                } else if (carInFront) {
                    const distToCarInFront = this.getDistance(vehicle.x, vehicle.y, carInFront.x, carInFront.y);

                    // If too close, stop completely
                    if (distToCarInFront <= MIN_CAR_DISTANCE) {
                        effectiveSpeedKmH = 0;
                    }
                    // If within safe distance, match the car in front's speed or slow down
                    else if (distToCarInFront < SAFE_FOLLOWING_DISTANCE) {
                        // Gradually reduce speed as we get closer
                        const slowdownFactor = (distToCarInFront - MIN_CAR_DISTANCE) / (SAFE_FOLLOWING_DISTANCE - MIN_CAR_DISTANCE);
                        const targetSpeed = Math.min(vehicle.speedKmH, carInFront.speedKmH);
                        effectiveSpeedKmH = carInFront.speedKmH * slowdownFactor + targetSpeed * (1 - slowdownFactor);
                        effectiveSpeedKmH = Math.min(effectiveSpeedKmH, carInFront.speedKmH);
                    }
                }

                // Speed multiplier based on effectiveSpeedKmH (base speed is calibrated for ~40 km/h)
                const speedMultiplier = effectiveSpeedKmH / 40;
                const actualSpeed = vehicle.speed * speedMultiplier;

                const moveX = (dx / dist) * actualSpeed * dt;
                const moveY = (dy / dist) * actualSpeed * dt;

                vehicle.x += moveX;
                vehicle.y += moveY;
            }
        });

        this.vehicles = this.vehicles.filter(v => v.active);
    }

    /**
     * Apply AI decisions to vehicles (called from IntersectionMap when backend responds)
     */
    applyAiDecisions(decisions) {
        if (!decisions || !Array.isArray(decisions)) return;

        decisions.forEach(decision => {
            const vehicle = this.vehicles.find(v => v.id === decision.vehicleId);
            if (vehicle) {
                vehicle.aiCommand = decision.actiune;
                vehicle.aiTargetSpeed = decision.vitezaTintaKmH;
                console.log(`🤖 AI Command for ${vehicle.id}: ${decision.actiune} (target: ${decision.vitezaTintaKmH} km/h) - ${decision.motiv}`);

                // Clear AI command after 3 seconds
                setTimeout(() => {
                    if (vehicle.aiCommand === decision.actiune) {
                        vehicle.aiCommand = null;
                        vehicle.aiTargetSpeed = null;
                    }
                }, 3000);
            }
        });
    }

    // Randomly make a vehicle speed over the limit
    generateRandomSpeeder() {
        const activeVehicles = this.vehicles.filter(v => v.active && v.speedKmH <= this.speedLimit);
        if (activeVehicles.length === 0) return;

        // Pick a random vehicle to make it speed
        const randomIndex = Math.floor(Math.random() * activeVehicles.length);
        const vehicle = activeVehicles[randomIndex];

        // Set speed to 51-80 km/h (over the 50 km/h limit)
        vehicle.speedKmH = 51 + Math.random() * 29;
        console.log(`⚠️ Vehicle ${vehicle.id} is now speeding at ${Math.round(vehicle.speedKmH)} km/h!`);
    }

    getVehicles() {
        return this.vehicles.map(v => ({
            id: v.id,
            x: v.x,
            y: v.y,
            rotation: v.rotation,
            isCurrentUser: v.isCurrentUser,
            speed: v.speedKmH,
            direction: v.direction,
            aiCommand: v.aiCommand || null,
            isAmbulance: v.isAmbulance || false,
            inAmbulanceZone: v.inAmbulanceZone || false,
            stoppingForZebra: v.stoppingForZebra || false,
            pedestrianAhead: v.pedestrianAhead || false,
            stoppingForTrafficLight: v.trafficLightAhead?.shouldStop || false,
            // Include target position for all vehicles to draw detection rectangle
            targetX: v.targetX,
            targetY: v.targetY
        }));
    }
}
