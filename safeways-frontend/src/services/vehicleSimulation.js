export class VehicleSimulation {
    constructor(mapData) {
        this.mapData = mapData;
        this.vehicles = [];
        this.adjacencyList = {};
        this.nextVehicleId = 1;
        this.leftSpawnPoints = [];
        this.lastSpawnIndex = 0;
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

        return nodes.filter(n => n.longitude >= threshold).map(n => n.id);
    }

    findPathToRight(startNodeId) {
        const rightNodes = new Set(this.getRightmostNodes());
        const visited = new Set();
        const queue = [[startNodeId]];

        while (queue.length > 0) {
            const path = queue.shift();
            const current = path[path.length - 1];

            if (rightNodes.has(current)) {
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
                    if (neighborNode && currentNode && neighborNode.longitude >= currentNode.longitude - 0.001) {
                        queue.unshift(newPath);
                    } else {
                        queue.push(newPath);
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

    getNextSpawnPoint() {
        if (this.leftSpawnPoints.length === 0) return null;
        const nodeId = this.leftSpawnPoints[this.lastSpawnIndex % this.leftSpawnPoints.length];
        this.lastSpawnIndex++;
        return nodeId;
    }

    spawnVehicle() {
        const startNodeId = this.getNextSpawnPoint();
        if (!startNodeId) return null;

        const path = this.findPathToRight(startNodeId);

        if (path.length < 2) return null;

        const startNode = this.mapData.nodesDict[path[0]];
        const nextNode = this.mapData.nodesDict[path[1]];

        const targetRotation = this.calculateRotation(startNode.longitude, startNode.latitude, nextNode.longitude, nextNode.latitude);

        const vehicle = {
            id: `Car-${this.nextVehicleId++}`,
            x: startNode.longitude,
            y: startNode.latitude,
            targetX: nextNode.longitude,
            targetY: nextNode.latitude,
            path: path,
            pathIndex: 0,
            speed: 0.00000015 + Math.random() * 0.00000004,
            rotation: targetRotation,
            targetRotation: targetRotation,
            isCurrentUser: false,
            active: true
        };

        this.vehicles.push(vehicle);
        return vehicle;
    }

    calculateRotation(fromX, fromY, toX, toY) {
        return Math.atan2(toY - fromY, toX - fromX);
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
                    vehicle.x = currentNode.longitude;
                    vehicle.y = currentNode.latitude;
                    vehicle.targetX = nextNode.longitude;
                    vehicle.targetY = nextNode.latitude;
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
            speed: v.speed
        }));
    }
}

