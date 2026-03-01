export class VehicleSimulation {
    constructor(mapData) {
        this.mapData = mapData;
        this.vehicles = [];
        this.adjacencyList = {};
        this.nextVehicleId = 1;
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

        this.buildGraph();
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
     * Get all ambulances currently active
     */
    getActiveAmbulances() {
        return this.vehicles.filter(v => v.isAmbulance && v.active);
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

        // Get all active ambulances for zone checking
        const activeAmbulances = this.getActiveAmbulances();

        // Minimum distance between cars (in coordinate units, ~10m)
        const MIN_CAR_DISTANCE = 0.00012;
        // Safe following distance (in coordinate units, ~15m)
        const SAFE_FOLLOWING_DISTANCE = 0.00018;

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

            // Update vehicle's ambulance zone state
            vehicle.inAmbulanceZone = inAmbulanceZone;

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

                // AMBULANCES: Always keep driving at full speed, ignore all obstacles
                if (vehicle.isAmbulance) {
                    effectiveSpeedKmH = vehicle.speedKmH; // Ambulances never slow down
                }
                // AMBULANCE ZONE: If vehicle is in ambulance zone, stop completely
                else if (vehicle.inAmbulanceZone) {
                    effectiveSpeedKmH = 0;
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
            // Include target position for ambulances to draw the rectangle
            targetX: v.isAmbulance ? v.targetX : undefined,
            targetY: v.isAmbulance ? v.targetY : undefined
        }));
    }
}
