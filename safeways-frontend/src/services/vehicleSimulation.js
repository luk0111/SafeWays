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
        this.buildGraph();
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
            rotation: targetRotation,
            targetRotation: targetRotation,
            isCurrentUser: false,
            active: true,
            direction: goingRight ? 'right' : 'left'
        };

        this.vehicles.push(vehicle);
        return vehicle;
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

    update(deltaTime) {
        const dt = Math.min(deltaTime, 50);

        this.vehicles.forEach(vehicle => {
            if (!vehicle.active) return;

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
                const moveX = (dx / dist) * vehicle.speed * dt;
                const moveY = (dy / dist) * vehicle.speed * dt;

                vehicle.x += moveX;
                vehicle.y += moveY;
            }
        });

        this.vehicles = this.vehicles.filter(v => v.active);
    }

    getVehicles() {
        return this.vehicles.map(v => ({
            id: v.id,
            x: v.x,
            y: v.y,
            rotation: v.rotation,
            isCurrentUser: v.isCurrentUser,
            speed: v.speed,
            direction: v.direction
        }));
    }
}
