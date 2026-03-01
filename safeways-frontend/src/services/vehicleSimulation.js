export class VehicleSimulation {
    constructor(mapData) {
        this.mapData = mapData;
        this.vehicles = [];
        this.pedestrians = []; // Add pedestrian array
        this.zebraCrossings = []; // Zebra crossing locations
        this.trafficLights = []; // Traffic lights at intersections
        this.adjacencyList = {};
        this.nextVehicleId = 1;
        this.nextPedestrianId = 1; // Pedestrian ID counter
        this.leftSpawnPoints = [];
        this.rightSpawnPoints = [];
        this.lastLeftSpawnIndex = 0;
        this.lastRightSpawnIndex = 0;
        this.spawnDirection = 0;
        this.speedLimit = 50; // km/h speed limit
        this.nextSpeedingTime = this.getRandomSpeedingInterval();
        this.lastUpdateTime = Date.now();

        // Ambulance settings
        this.ambulanceSpawnInterval = 15000 + Math.random() * 15000; // 15-30 seconds
        this.lastAmbulanceSpawnTime = Date.now();
        this.ambulanceCount = 0;

        // Pedestrian settings
        this.pedestrianSpawnInterval = 8000 + Math.random() * 7000; // 8-15 seconds
        this.lastPedestrianSpawnTime = Date.now();

        // Traffic light timing (in milliseconds)
        this.trafficLightGreenDuration = 8000;  // 8 seconds green
        this.trafficLightYellowDuration = 2000; // 2 seconds yellow
        this.trafficLightRedDuration = 10000;   // 10 seconds red

        this.buildGraph();
        this.generateZebraCrossings();
        this.generateTrafficLights();
    }

    // Get random interval between 5-10 seconds (in milliseconds)
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

    /**
     * Generate zebra crossings along streets at fixed intervals
     */
    generateZebraCrossings() {
        if (!this.mapData || !this.mapData.arcs || !this.mapData.nodesDict) {
            this.zebraCrossings = [];
            return;
        }

        this.zebraCrossings = [];
        const minDistanceBetweenCrossings = 0.00045; // ~50m
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
                    pedestrianCrossing: null, // ID of pedestrian currently crossing
                    width: 0.00012 // Width of zebra crossing zone
                });
                placedCrossings.push({ x: crossingX, y: crossingY });
            }
        });
    }

    /**
     * Get all zebra crossings
     */
    getZebraCrossings() {
        return this.zebraCrossings;
    }

    /**
     * Generate traffic lights at half of the intersections
     * Creates one traffic light per connected road, with proper phasing
     * Opposing directions are green together, perpendicular directions are red
     * Excludes the central antenna intersection
     */
    generateTrafficLights() {
        if (!this.mapData || !this.mapData.intersections) {
            this.trafficLights = [];
            return;
        }

        this.trafficLights = [];

        // Get the central antenna node ID to exclude it from traffic lights
        const centralNodeId = this.mapData.centralAntenna?.nodeId || null;

        // Filter out the central intersection (where the green sphere/antenna is)
        const availableIntersections = this.mapData.intersections.filter(
            intersection => intersection.id !== centralNodeId
        );

        // Place traffic lights at half of the available intersections
        const numIntersectionsWithLights = Math.ceil(availableIntersections.length / 2);

        // Shuffle and pick random intersections
        const shuffled = [...availableIntersections].sort(() => Math.random() - 0.5);
        const selectedIntersections = shuffled.slice(0, numIntersectionsWithLights);

        selectedIntersections.forEach((intersection, intersectionIndex) => {
            // Find connected arcs to this intersection
            const connectedArcs = this.mapData.arcs.filter(arc =>
                arc.from === intersection.id || arc.to === intersection.id
            );

            if (connectedArcs.length < 2) return; // Need at least 2 roads for traffic lights

            // Calculate rotation for each connected road
            const roadDirections = connectedArcs.map((arc, arcIndex) => {
                const otherNodeId = arc.from === intersection.id ? arc.to : arc.from;
                const otherNode = this.mapData.nodesDict[otherNodeId];
                if (!otherNode) return null;

                const dx = otherNode.longitude - intersection.longitude;
                const dy = otherNode.latitude - intersection.latitude;
                const rotation = Math.atan2(dy, dx);

                // Normalize rotation to 0-2PI
                const normalizedRotation = rotation < 0 ? rotation + 2 * Math.PI : rotation;

                return {
                    arcIndex,
                    nodeId: otherNodeId,
                    rotation: rotation,
                    normalizedRotation: normalizedRotation,
                    dx, dy
                };
            }).filter(Boolean);

            // Sort roads by rotation angle to group opposing directions
            roadDirections.sort((a, b) => a.normalizedRotation - b.normalizedRotation);

            // Assign phases: roads roughly opposite each other share the same phase
            // Phase 0 = first half of cycle (GREEN), Phase 1 = second half (GREEN)
            roadDirections.forEach((road, index) => {
                // Find if there's an opposing road (roughly 180 degrees apart)
                let phase = 0;

                if (roadDirections.length >= 3) {
                    // For 3+ roads: alternate phases based on position
                    // Every other road gets phase 1
                    phase = index % 2;
                } else if (roadDirections.length === 2) {
                    // For 2 roads: they're opposing, same phase
                    phase = 0;
                }

                // Stagger intersection timing so not all intersections change together
                const intersectionOffset = intersectionIndex * 5000; // 5 second offset

                // Create individual traffic light for this road
                const trafficLight = {
                    id: `traffic-light-${intersection.id}-${index}`,
                    intersectionId: intersection.id,
                    x: intersection.longitude,
                    y: intersection.latitude,
                    // Direction this light controls (incoming traffic from this road)
                    rotation: road.rotation,
                    nodeId: road.nodeId,
                    // Phase determines when this light is green (0 or 1)
                    phase: phase,
                    // Current state
                    state: 'GREEN',
                    // Timing offset for this intersection
                    intersectionOffset: intersectionOffset,
                    // Position offset from intersection center (for rendering)
                    offsetX: Math.cos(road.rotation + Math.PI) * 0.00004,
                    offsetY: Math.sin(road.rotation + Math.PI) * 0.00004
                };

                this.trafficLights.push(trafficLight);
            });
        });

        console.log(`🚦 Generated ${this.trafficLights.length} traffic lights at ${selectedIntersections.length} intersections`);
    }

    /**
     * Update traffic light states based on timing
     * Phase 0 lights: GREEN in first half of cycle
     * Phase 1 lights: GREEN in second half of cycle
     */
    updateTrafficLights() {
        const now = Date.now();
        // Full cycle = 2 phases, each with green + yellow
        const phaseDuration = this.trafficLightGreenDuration + this.trafficLightYellowDuration;
        const fullCycleDuration = phaseDuration * 2;

        this.trafficLights.forEach(light => {
            const elapsed = (now - light.intersectionOffset) % fullCycleDuration;

            // Determine which phase is currently active
            const currentPhaseIndex = Math.floor(elapsed / phaseDuration);
            const timeInPhase = elapsed % phaseDuration;

            // Check if this light's phase is active
            const isMyPhaseActive = (light.phase === currentPhaseIndex);

            if (isMyPhaseActive) {
                // This light's phase is active
                if (timeInPhase < this.trafficLightGreenDuration) {
                    light.state = 'GREEN';
                } else {
                    light.state = 'YELLOW';
                }
            } else {
                // Other phase is active, this light is red
                light.state = 'RED';
            }
        });
    }

    /**
     * Get all traffic lights with current state
     */
    getTrafficLights() {
        return this.trafficLights.map(light => ({
            id: light.id,
            intersectionId: light.intersectionId,
            x: light.x + (light.offsetX || 0),
            y: light.y + (light.offsetY || 0),
            state: light.state,
            rotation: light.rotation,
            phase: light.phase
        }));
    }

    /**
     * Check if a vehicle should stop for a traffic light
     * Returns the traffic light if vehicle should stop, null otherwise
     * Only responds to traffic lights that control the direction the vehicle is coming from
     */
    getTrafficLightAhead(vehicle) {
        if (vehicle.isAmbulance) return null; // Ambulances ignore traffic lights

        const dirX = Math.cos(vehicle.rotation);
        const dirY = Math.sin(vehicle.rotation);

        // Detection distance for traffic lights (~25m)
        const detectionDistance = 0.00025;
        // Stop distance (~10m)
        const stopDistance = 0.00009;

        let closestLight = null;
        let closestDist = Infinity;

        for (const light of this.trafficLights) {
            // Use the intersection center position for detection
            const toLightX = light.x - vehicle.x;
            const toLightY = light.y - vehicle.y;

            // Project onto vehicle direction
            const forwardDist = dirX * toLightX + dirY * toLightY;

            // Only check lights ahead
            if (forwardDist <= 0 || forwardDist > detectionDistance) continue;

            // Check lateral distance (is it on our path?)
            const lateralDist = Math.abs(-dirY * toLightX + dirX * toLightY);
            if (lateralDist > 0.00015) continue; // Not on our path

            // Check if this traffic light controls the direction we're coming from
            // The light's rotation points towards the road it controls
            // Vehicle coming from that road would have opposite rotation (roughly)
            const rotationDiff = Math.abs(this.normalizeAngle(vehicle.rotation - light.rotation));

            // Vehicle should be coming from the direction this light controls
            // (within ~60 degrees of opposite direction)
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
            speedKmH: 30 + Math.random() * 20, // Normal speed: 30-50 km/h
            rotation: targetRotation,
            targetRotation: targetRotation,
            isCurrentUser: false,
            active: true,
            direction: goingRight ? 'right' : 'left'
        };

        this.vehicles.push(vehicle);
        return vehicle;
    }

    /**
     * Spawn an ambulance (emergency vehicle)
     * Ambulances have a rectangular zone in front of them that stops other cars
     */
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
            speed: 0.00000020, // Slightly faster base speed
            speedKmH: 60 + Math.random() * 20, // 60-80 km/h - emergency speed
            rotation: targetRotation,
            targetRotation: targetRotation,
            isCurrentUser: false,
            isAmbulance: true, // Mark as ambulance
            active: true,
            direction: goingRight ? 'right' : 'left'
        };

        this.vehicles.push(ambulance);
        console.log(`🚑 Ambulance ${ambulance.id} spawned!`);
        return ambulance;
    }

    /**
     * Check if a vehicle is inside the ambulance's rectangular zone
     * The rectangle extends from the ambulance to its next target node
     */
    isInAmbulanceZone(vehicle, ambulance) {
        if (!ambulance || !ambulance.isAmbulance || !ambulance.active) return false;
        if (vehicle === ambulance) return false;
        if (vehicle.isAmbulance) return false; // Ambulances don't affect each other

        // Get ambulance's direction vector
        const ambDirX = Math.cos(ambulance.rotation);
        const ambDirY = Math.sin(ambulance.rotation);

        // Get vector from ambulance to vehicle
        const toVehicleX = vehicle.x - ambulance.x;
        const toVehicleY = vehicle.y - ambulance.y;

        // Project vehicle position onto ambulance's direction (forward distance)
        const forwardDist = ambDirX * toVehicleX + ambDirY * toVehicleY;

        // Calculate the distance to target (next node)
        const distToTarget = this.getDistance(ambulance.x, ambulance.y, ambulance.targetX, ambulance.targetY);

        // Only check vehicles that are IN FRONT of the ambulance (positive forward distance)
        // and within the distance to the next node
        if (forwardDist <= 0 || forwardDist > distToTarget) return false;

        // Calculate lateral distance (perpendicular to direction)
        const lateralDist = Math.abs(-ambDirY * toVehicleX + ambDirX * toVehicleY);

        // Rectangle width: ~20m on each side (0.00018 in coordinate units)
        const rectangleHalfWidth = 0.00018;

        return lateralDist <= rectangleHalfWidth;
    }

    /**
     * Check if a pedestrian is inside the ambulance's rectangular zone
     * Only affects pedestrians who are ON the road (crossing), not on sidewalks
     */
    isPedestrianInAmbulanceZone(pedestrian, ambulance) {
        if (!ambulance || !ambulance.isAmbulance || !ambulance.active) return false;

        // Get ambulance's direction vector
        const ambDirX = Math.cos(ambulance.rotation);
        const ambDirY = Math.sin(ambulance.rotation);

        // Get vector from ambulance to pedestrian
        const toPedX = pedestrian.x - ambulance.x;
        const toPedY = pedestrian.y - ambulance.y;

        // Project pedestrian position onto ambulance's direction (forward distance)
        const forwardDist = ambDirX * toPedX + ambDirY * toPedY;

        // Calculate the distance to target (next node)
        const distToTarget = this.getDistance(ambulance.x, ambulance.y, ambulance.targetX, ambulance.targetY);

        // Only check pedestrians that are IN FRONT of the ambulance
        if (forwardDist <= 0 || forwardDist > distToTarget) return false;

        // Calculate lateral distance (perpendicular to direction)
        const lateralDist = Math.abs(-ambDirY * toPedX + ambDirX * toPedY);

        // Rectangle width: ~5m on each side - narrower than sidewalk offset (0.00007)
        // This only affects pedestrians ON the road, not on sidewalks
        const rectangleHalfWidth = 0.00005;

        return lateralDist <= rectangleHalfWidth;
    }

    /**
     * Check if a pedestrian is in front of a vehicle (for pedestrian detection)
     * Returns distance to pedestrian if in front, otherwise null
     */
    isPedestrianInFrontOfVehicle(vehicle, pedestrian) {
        if (!vehicle || !vehicle.active || vehicle.isAmbulance) return null;
        if (!pedestrian || !pedestrian.active) return null;

        // Get vehicle's direction vector
        const dirX = Math.cos(vehicle.rotation);
        const dirY = Math.sin(vehicle.rotation);

        // Get vector from vehicle to pedestrian
        const toPedX = pedestrian.x - vehicle.x;
        const toPedY = pedestrian.y - vehicle.y;

        // Project pedestrian position onto vehicle's direction (forward distance)
        const forwardDist = dirX * toPedX + dirY * toPedY;

        // Only check pedestrians that are IN FRONT of the vehicle
        // Detection range: ~30m ahead
        const detectionRange = 0.00027;
        if (forwardDist <= 0 || forwardDist > detectionRange) return null;

        // Calculate lateral distance (perpendicular to direction)
        const lateralDist = Math.abs(-dirY * toPedX + dirX * toPedY);

        // Rectangle width: ~10m on each side (road width)
        const rectangleHalfWidth = 0.00009;

        if (lateralDist <= rectangleHalfWidth) {
            return forwardDist; // Return distance to pedestrian
        }
        return null;
    }

    /**
     * Find closest pedestrian in front of vehicle
     */
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

    /**
     * Get all ambulances currently active
     */
    getActiveAmbulances() {
        return this.vehicles.filter(v => v.isAmbulance && v.active);
    }

    /**
     * Spawn a pedestrian on the sidewalk
     * Pedestrians walk along the road edges (sidewalks) and randomly cross at zebras
     */
    spawnPedestrian() {
        if (!this.mapData || !this.mapData.arcs || this.mapData.arcs.length === 0) return null;

        // Pick a random arc (road segment) to walk along
        const randomArcIndex = Math.floor(Math.random() * this.mapData.arcs.length);
        const arc = this.mapData.arcs[randomArcIndex];

        const fromNode = this.mapData.nodesDict[arc.from];
        const toNode = this.mapData.nodesDict[arc.to];

        if (!fromNode || !toNode) return null;

        // Decide which side of the road (left or right sidewalk)
        const sidewalkSide = Math.random() > 0.5 ? 1 : -1;

        // Calculate perpendicular offset for sidewalk (wider than lane offset)
        const dx = toNode.longitude - fromNode.longitude;
        const dy = toNode.latitude - fromNode.latitude;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return null;

        const perpX = (dy / len) * sidewalkSide;
        const perpY = (-dx / len) * sidewalkSide;

        // Sidewalk offset (~8m from road center)
        const sidewalkOffset = 0.00007;

        // Start position with sidewalk offset
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
            speed: 0.00000015 + Math.random() * 0.00000008, // Much faster walking speed
            active: true,
            sidewalkSide: sidewalkSide,
            // Crossing state
            isCrossing: false,
            crossingZebra: null,
            crossingTargetX: null,
            crossingTargetY: null,
            waitingAtZebra: false,
            crossingCooldown: 0, // Prevent immediate re-crossing
            inAmbulanceZone: false // Pedestrians also affected by ambulances
        };

        this.pedestrians.push(pedestrian);
        console.log(`🚶 Pedestrian ${pedestrian.id} spawned!`);
        return pedestrian;
    }

    /**
     * Find nearby zebra crossing for a pedestrian
     */
    findNearbyZebra(pedestrian) {
        const searchRadius = 0.00025; // ~28m - larger search radius to find zebras

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

    /**
     * Check if a pedestrian is currently crossing at a zebra
     */
    isPedestrianCrossingAtZebra(zebra) {
        return this.pedestrians.some(p => p.isCrossing && p.crossingZebra === zebra.id);
    }

    /**
     * Get zebra crossings that have pedestrians crossing
     */
    getActiveZebraCrossings() {
        return this.zebraCrossings.filter(z => this.isPedestrianCrossingAtZebra(z));
    }

    /**
     * Update pedestrian positions
     */
    updatePedestrians(dt) {
        // Get active ambulances for zone checking
        const activeAmbulances = this.getActiveAmbulances();

        this.pedestrians.forEach(pedestrian => {
            if (!pedestrian.active) return;

            // Check if pedestrian is in any ambulance's zone
            let inAmbulanceZone = false;
            for (const ambulance of activeAmbulances) {
                if (this.isPedestrianInAmbulanceZone(pedestrian, ambulance)) {
                    inAmbulanceZone = true;
                    break;
                }
            }
            pedestrian.inAmbulanceZone = inAmbulanceZone;

            // If in ambulance zone, stop moving completely
            if (inAmbulanceZone) {
                return; // Skip movement this frame
            }

            // Decrease crossing cooldown
            if (pedestrian.crossingCooldown > 0) {
                pedestrian.crossingCooldown -= dt;
            }

            // If currently crossing a zebra
            if (pedestrian.isCrossing) {
                const dx = pedestrian.crossingTargetX - pedestrian.x;
                const dy = pedestrian.crossingTargetY - pedestrian.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // Check if finished crossing
                if (dist < 0.00002) {
                    // Finished crossing - switch sidewalk side
                    pedestrian.isCrossing = false;
                    pedestrian.sidewalkSide *= -1; // Switch to other side
                    pedestrian.crossingCooldown = 5000; // 5 second cooldown before crossing again

                    // Clear zebra crossing state
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
