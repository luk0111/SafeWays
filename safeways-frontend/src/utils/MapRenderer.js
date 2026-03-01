export class MapRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;

        this.targetZoom = 1;
        this.targetPanX = 0;
        this.targetPanY = 0;

        this.mapData = null;
        this.boundingBox = null;
        this.vehicles = [];
        this.images = { loaded: false };

        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;

        this.animationFrameId = null;
        this.isAnimating = false;

        this.decorations = [];
        this.buildings = [];
        this.urbanDetails = [];
        this.groundTexture = []; // Cached ground texture elements
        this.processedArcs = []; // Pre-processed arcs for better rendering
        this.showCollisionSpheres = true;
        this.trafficClouds = []; // Traffic density cloud data with opacity for smooth transitions
        this.pedestrians = []; // Pedestrian positions
        this.zebraCrossings = []; // Zebra crossing locations
        this.trafficLights = []; // Traffic light data
        this.initListeners();
    }

    initListeners() {
        // Store bound handlers for cleanup
        this.handleWheel = (e) => {
            e.preventDefault();
            const zoomFactor = e.deltaY > 0 ? 0.85 : 1.15;
            this.targetZoom *= zoomFactor;
            this.targetZoom = Math.max(0.1, Math.min(this.targetZoom, 20));
            this.startAnimation();
        };

        this.handleMouseDown = (e) => {
            this.isDragging = true;
            this.canvas.style.cursor = 'grabbing';
            this.startX = e.clientX - this.targetPanX;
            this.startY = e.clientY - this.targetPanY;
        };

        this.handleMouseMove = (e) => {
            if (!this.isDragging) return;
            this.targetPanX = e.clientX - this.startX;
            this.targetPanY = e.clientY - this.startY;
            this.startAnimation();
        };

        this.handleMouseUp = () => {
            this.isDragging = false;
            if (this.canvas) this.canvas.style.cursor = 'default';
        };

        this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
        this.canvas.addEventListener('mousedown', this.handleMouseDown);
        this.canvas.addEventListener('mousemove', this.handleMouseMove);
        window.addEventListener('mouseup', this.handleMouseUp);
    }

    destroy() {
        // Cancel any pending animation
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // Remove event listeners
        if (this.canvas) {
            this.canvas.removeEventListener('wheel', this.handleWheel);
            this.canvas.removeEventListener('mousedown', this.handleMouseDown);
            this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        }
        window.removeEventListener('mouseup', this.handleMouseUp);

        // Clear references
        this.mapData = null;
        this.decorations = [];
        this.buildings = [];
        this.urbanDetails = [];
        this.isAnimating = false;
    }

    updateData({ mapData, boundingBox, vehicles, pedestrians, zebraCrossings, trafficLights, images, showCollisionSpheres }) {
        const dataChanged = mapData && mapData !== this.mapData;
        if (mapData) this.mapData = mapData;
        if (boundingBox) this.boundingBox = boundingBox;
        if (vehicles) this.vehicles = vehicles;
        if (pedestrians) this.pedestrians = pedestrians;
        if (zebraCrossings) this.zebraCrossings = zebraCrossings; // Use passed zebra crossings from simulation
        if (trafficLights) this.trafficLights = trafficLights; // Traffic lights from simulation
        if (images) this.images = images;
        if (typeof showCollisionSpheres === 'boolean') this.showCollisionSpheres = showCollisionSpheres;

        if (dataChanged) {
            this.generateDecorations();
            this.processArcs();
            // Don't generate zebra crossings here - they come from the simulation
        }
        this.startAnimation();
    }

    /**
     * Pre-process arcs to organize by road type for proper layered rendering
     */
    processArcs() {
        if (!this.mapData || !this.mapData.arcs) return;

        // Road type hierarchy (draw order - lower types drawn first)
        const typeOrder = {
            'service': 0,
            'residential': 1,
            'living_street': 2,
            'unclassified': 2,
            'tertiary': 3,
            'secondary': 4,
            'primary': 5,
            'pedestrian': 3,
            'road': 2
        };

        // Road widths by type
        const typeWidths = {
            'primary': 1.4,
            'secondary': 1.2,
            'tertiary': 1.0,
            'residential': 0.8,
            'living_street': 0.7,
            'service': 0.6,
            'pedestrian': 0.9,
            'unclassified': 0.8,
            'road': 0.8
        };

        this.processedArcs = this.mapData.arcs.map(arc => ({
            ...arc,
            order: typeOrder[arc.type] || 2,
            widthFactor: typeWidths[arc.type] || 0.8
        })).sort((a, b) => a.order - b.order);
    }

    /**
     * Generate zebra crossings along streets at fixed intervals
     * Places zebra crossings randomly on road segments, not at intersections
     */
    generateZebraCrossings() {
        if (!this.mapData || !this.mapData.arcs || !this.mapData.nodesDict) {
            this.zebraCrossings = [];
            return;
        }

        this.zebraCrossings = [];

        // Minimum distance between zebra crossings (in coordinate units, ~50m)
        const minDistanceBetweenCrossings = 0.00045;

        // Track placed crossings to ensure minimum distance
        const placedCrossings = [];

        // For each road arc, potentially place zebra crossings
        this.mapData.arcs.forEach(arc => {
            const fromNode = this.mapData.nodesDict[arc.from];
            const toNode = this.mapData.nodesDict[arc.to];

            if (!fromNode || !toNode) return;

            // Calculate arc length
            const dx = toNode.longitude - fromNode.longitude;
            const dy = toNode.latitude - fromNode.latitude;
            const arcLength = Math.sqrt(dx * dx + dy * dy);

            // Skip very short arcs
            if (arcLength < 0.0003) return;

            // Calculate direction
            const dirX = dx / arcLength;
            const dirY = dy / arcLength;

            // Rotation for the crossing (perpendicular to road)
            const rotation = Math.atan2(dy, dx);

            // Place crossing at a random position along the arc (between 30% and 70% of the way)
            const randomT = 0.3 + Math.random() * 0.4;
            const crossingX = fromNode.longitude + dx * randomT;
            const crossingY = fromNode.latitude + dy * randomT;

            // Check minimum distance from other crossings
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
                const crossing = {
                    x: crossingX,
                    y: crossingY,
                    rotation: rotation,
                    width: 0.00006,
                    stripes: 6
                };
                this.zebraCrossings.push(crossing);
                placedCrossings.push({ x: crossingX, y: crossingY });
            }
        });
    }

    /**
     * Update traffic density clouds based on vehicle positions
     * Creates heatmap-like visualization showing traffic density
     */
    updateTrafficClouds() {
        if (!this.vehicles || this.vehicles.length === 0) {
            // Fade out existing clouds
            this.trafficClouds = this.trafficClouds.map(cloud => ({
                ...cloud,
                targetOpacity: 0,
                opacity: Math.max(0, cloud.opacity - 0.03)
            })).filter(cloud => cloud.opacity > 0.01);
            return;
        }

        // Larger cluster radius for heatmap effect (~80m)
        const clusterRadius = 0.00072;
        const visited = new Set();
        const newClusters = [];

        // Find clusters of vehicles
        this.vehicles.forEach((vehicle, idx) => {
            if (visited.has(idx)) return;

            // Find all vehicles within cluster radius
            const cluster = [vehicle];
            visited.add(idx);

            this.vehicles.forEach((other, otherIdx) => {
                if (visited.has(otherIdx)) return;

                const dx = other.x - vehicle.x;
                const dy = other.y - vehicle.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist <= clusterRadius) {
                    cluster.push(other);
                    visited.add(otherIdx);
                }
            });

            // Only create clouds for 2+ vehicles
            if (cluster.length >= 2) {
                // Calculate cluster center
                const centerX = cluster.reduce((sum, v) => sum + v.x, 0) / cluster.length;
                const centerY = cluster.reduce((sum, v) => sum + v.y, 0) / cluster.length;

                // Calculate cluster spread (max distance from center)
                let maxDist = 0;
                cluster.forEach(v => {
                    const dx = v.x - centerX;
                    const dy = v.y - centerY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > maxDist) maxDist = dist;
                });

                // Determine color based on vehicle count
                // Red: 5+ cars, Yellow: 3-4 cars, Green: 2 cars
                let color;
                if (cluster.length >= 5) {
                    color = { r: 239, g: 68, b: 68 }; // Red
                } else if (cluster.length >= 3) {
                    color = { r: 251, g: 191, b: 36 }; // Yellow
                } else {
                    color = { r: 34, g: 197, b: 94 }; // Green
                }

                // Much larger cloud radius for heatmap effect
                const baseCloudRadius = clusterRadius * 1.5;
                const spreadBonus = maxDist * 1.2;
                const densityBonus = Math.min(cluster.length * 0.00008, 0.0006); // Grows with more cars

                newClusters.push({
                    x: centerX,
                    y: centerY,
                    radius: baseCloudRadius + spreadBonus + densityBonus,
                    count: cluster.length,
                    color: color,
                    targetOpacity: 0.45 + Math.min(cluster.length * 0.03, 0.25) // More cars = more opaque
                });
            }
        });

        // Merge with existing clouds for smooth transitions
        const updatedClouds = [];

        // Update existing clouds or fade them out
        this.trafficClouds.forEach(existingCloud => {
            // Find matching new cluster (close position)
            const matchIdx = newClusters.findIndex(nc => {
                const dx = nc.x - existingCloud.x;
                const dy = nc.y - existingCloud.y;
                return Math.sqrt(dx * dx + dy * dy) < clusterRadius * 0.5;
            });

            if (matchIdx !== -1) {
                const match = newClusters[matchIdx];
                // Smooth transition to new values
                updatedClouds.push({
                    x: existingCloud.x + (match.x - existingCloud.x) * 0.12,
                    y: existingCloud.y + (match.y - existingCloud.y) * 0.12,
                    radius: existingCloud.radius + (match.radius - existingCloud.radius) * 0.1,
                    count: match.count,
                    color: match.color,
                    opacity: existingCloud.opacity + (match.targetOpacity - existingCloud.opacity) * 0.08,
                    targetOpacity: match.targetOpacity
                });
                newClusters.splice(matchIdx, 1);
            } else {
                // Fade out
                const newOpacity = existingCloud.opacity - 0.025;
                if (newOpacity > 0.01) {
                    updatedClouds.push({
                        ...existingCloud,
                        opacity: newOpacity,
                        targetOpacity: 0
                    });
                }
            }
        });

        // Add new clusters (fade in)
        newClusters.forEach(nc => {
            updatedClouds.push({
                ...nc,
                opacity: 0.03 // Start fading in
            });
        });

        this.trafficClouds = updatedClouds;
    }

    generateDecorations() {
        this.decorations = [];
        this.buildings = [];
        this.urbanDetails = [];
        this.groundTexture = [];

        if (!this.mapData || !this.boundingBox) return;
        const { minX, maxX, minY, maxY } = this.boundingBox;

        // Generate ground texture spots (subtle terrain variations)
        const textureCount = 80;
        for (let i = 0; i < textureCount; i++) {
            this.groundTexture.push({
                x: minX + Math.random() * (maxX - minX),
                y: minY + Math.random() * (maxY - minY),
                radius: 0.0008 + Math.random() * 0.002,
                opacity: 0.02 + Math.random() * 0.03,
                color: Math.random() > 0.5 ? '#c8d6c8' : '#d4dcd4' // Subtle green-gray tones
            });
        }

        // Build a quick lookup of road segments for collision detection
        const roadSegments = [];
        if (this.mapData.arcs) {
            this.mapData.arcs.forEach(arc => {
                const f = this.mapData.nodesDict[arc.from];
                const t = this.mapData.nodesDict[arc.to];
                if (f && t) {
                    roadSegments.push({ x1: f.longitude, y1: f.latitude, x2: t.longitude, y2: t.latitude });
                }
            });
        }

        // Distance from point to line segment
        const distToSegment = (px, py, seg) => {
            const dx = seg.x2 - seg.x1;
            const dy = seg.y2 - seg.y1;
            const len2 = dx * dx + dy * dy;
            if (len2 === 0) return Math.sqrt((px - seg.x1) ** 2 + (py - seg.y1) ** 2);

            let t = ((px - seg.x1) * dx + (py - seg.y1) * dy) / len2;
            t = Math.max(0, Math.min(1, t));

            const nearX = seg.x1 + t * dx;
            const nearY = seg.y1 + t * dy;
            return Math.sqrt((px - nearX) ** 2 + (py - nearY) ** 2);
        };

        // Scale factor for the bounding box (geo coords are small numbers)
        const rangeX = maxX - minX;
        const rangeY = maxY - minY;
        const roadBuffer = Math.max(rangeX, rangeY) * 0.012;
        const buildingBuffer = Math.max(rangeX, rangeY) * 0.025;

        // Helper to check if a point is safe from roads
        const isSafeFromRoads = (x, y, minDist) => {
            for (const seg of roadSegments) {
                if (distToSegment(x, y, seg) < minDist) return false;
            }
            return true;
        };

        // 1. Generate Buildings (rectangular blocks near roads)
        const buildingCount = 60;
        for (let i = 0; i < buildingCount; i++) {
            const bx = minX + Math.random() * (maxX - minX);
            const by = minY + Math.random() * (maxY - minY);

            // Buildings should be close to roads but not on them
            let nearRoad = false;
            let tooClose = false;
            for (const seg of roadSegments) {
                const dist = distToSegment(bx, by, seg);
                if (dist < roadBuffer) tooClose = true;
                if (dist < buildingBuffer && dist > roadBuffer) nearRoad = true;
            }

            if (nearRoad && !tooClose) {
                const width = (0.3 + Math.random() * 0.5) * rangeX * 0.03;
                const height = (0.3 + Math.random() * 0.5) * rangeY * 0.03;
                const rotation = Math.random() * Math.PI * 0.1 - 0.05;

                this.buildings.push({
                    x: bx, y: by,
                    width, height,
                    rotation,
                    color: ['#e8e8e8', '#e0e0e0', '#d8d8d8', '#f0f0f0'][Math.floor(Math.random() * 4)],
                    shadowColor: 'rgba(0,0,0,0.08)'
                });
            }
        }

        // 2. Generate Trees (clustered, more natural)
        const treeCount = 120;
        for (let i = 0; i < treeCount; i++) {
            const tx = minX + Math.random() * (maxX - minX);
            const ty = minY + Math.random() * (maxY - minY);

            if (isSafeFromRoads(tx, ty, roadBuffer * 1.2)) {
                // Cluster trees together
                const isCluster = Math.random() > 0.7;
                const baseSize = 2 + Math.random() * 3;

                this.decorations.push({
                    type: 'tree',
                    x: tx, y: ty,
                    size: baseSize,
                    color: ['#5a8f5d', '#4a7c4e', '#3d6b40', '#6b9e6e'][Math.floor(Math.random() * 4)]
                });

                // Add nearby trees for clusters
                if (isCluster) {
                    for (let j = 0; j < 2 + Math.floor(Math.random() * 3); j++) {
                        const cx = tx + (Math.random() - 0.5) * rangeX * 0.015;
                        const cy = ty + (Math.random() - 0.5) * rangeY * 0.015;
                        if (isSafeFromRoads(cx, cy, roadBuffer)) {
                            this.decorations.push({
                                type: 'tree',
                                x: cx, y: cy,
                                size: baseSize * (0.6 + Math.random() * 0.5),
                                color: ['#5a8f5d', '#4a7c4e', '#3d6b40'][Math.floor(Math.random() * 3)]
                            });
                        }
                    }
                }
            }
        }

        // 3. Generate small urban details (benches, lights along roads)
        roadSegments.forEach((seg, idx) => {
            if (Math.random() > 0.4) return; // Only some roads get details

            const midX = (seg.x1 + seg.x2) / 2;
            const midY = (seg.y1 + seg.y2) / 2;
            const dx = seg.x2 - seg.x1;
            const dy = seg.y2 - seg.y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len === 0) return;

            // Perpendicular offset
            const perpX = -dy / len * roadBuffer * 1.5;
            const perpY = dx / len * roadBuffer * 1.5;

            // Street lights on both sides
            if (Math.random() > 0.5) {
                this.urbanDetails.push({
                    type: 'streetlight',
                    x: midX + perpX,
                    y: midY + perpY
                });
                this.urbanDetails.push({
                    type: 'streetlight',
                    x: midX - perpX,
                    y: midY - perpY
                });
            }
        });

        // 4. Generate small park areas
        const parkCount = 3;
        for (let i = 0; i < parkCount; i++) {
            const px = minX + rangeX * 0.15 + Math.random() * rangeX * 0.7;
            const py = minY + rangeY * 0.15 + Math.random() * rangeY * 0.7;

            if (isSafeFromRoads(px, py, buildingBuffer)) {
                this.urbanDetails.push({
                    type: 'park',
                    x: px, y: py,
                    radius: rangeX * (0.015 + Math.random() * 0.01)
                });
            }
        }
    }

    startAnimation() {
        if (!this.isAnimating) {
            this.isAnimating = true;
            this.animate();
        }
    }

    animate() {
        const diffZoom = this.targetZoom - this.zoom;
        const diffPanX = this.targetPanX - this.panX;
        const diffPanY = this.targetPanY - this.panY;

        this.zoom += diffZoom * 0.12;
        this.panX += diffPanX * 0.3;
        this.panY += diffPanY * 0.3;

        this.draw();

        if (Math.abs(diffZoom) > 0.001 || Math.abs(diffPanX) > 0.5 || Math.abs(diffPanY) > 0.5) {
            this.animationFrameId = requestAnimationFrame(() => this.animate());
        } else {
            this.zoom = this.targetZoom;
            this.panX = this.targetPanX;
            this.panY = this.targetPanY;
            this.draw();
            this.isAnimating = false;
        }
    }

    draw() {
        if (!this.mapData || !this.boundingBox) return;
        const { ctx, canvas, zoom, mapData, boundingBox, vehicles, images, panX, panY } = this;

        // 1. FUNDAL
        ctx.fillStyle = '#f1f3f4';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 1b. SUBTLE TEXTURE PATTERN (adds depth to empty areas)
        ctx.save();
        ctx.globalAlpha = 0.03;
        const textureSize = 20;
        for (let x = 0; x < canvas.width; x += textureSize) {
            for (let y = 0; y < canvas.height; y += textureSize) {
                // Subtle noise pattern
                const noise = Math.sin(x * 0.1) * Math.cos(y * 0.1) * 0.5 + 0.5;
                if (noise > 0.4) {
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        }

        // Add subtle grid lines
        ctx.globalAlpha = 0.015;
        ctx.strokeStyle = '#9aa0a6';
        ctx.lineWidth = 0.5;
        const gridSize = 40;
        for (let x = 0; x < canvas.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
        ctx.restore();

        const padding = 60;
        const usableW = canvas.width - padding * 2;
        const usableH = canvas.height - padding * 2;
        const rangeX = boundingBox.maxX - boundingBox.minX;
        const rangeY = boundingBox.maxY - boundingBox.minY;
        const baseScale = Math.min(usableW / rangeX, usableH / rangeY);
        const finalScale = baseScale * zoom;

        const offsetX = padding + (usableW - rangeX * finalScale) / 2 + panX;
        const offsetY = padding + (usableH - rangeY * finalScale) / 2 - panY;

        const getX = (mx) => offsetX + (mx - boundingBox.minX) * finalScale;
        const getY = (my) => canvas.height - (offsetY + (my - boundingBox.minY) * finalScale);

        // 1c. GROUND TEXTURE SPOTS (organic terrain feel)
        if (this.groundTexture && this.groundTexture.length > 0) {
            this.groundTexture.forEach(spot => {
                const sx = getX(spot.x);
                const sy = getY(spot.y);
                const radius = spot.radius * finalScale;

                ctx.globalAlpha = spot.opacity;
                ctx.beginPath();
                ctx.arc(sx, sy, radius, 0, Math.PI * 2);
                ctx.fillStyle = spot.color;
                ctx.fill();
            });
            ctx.globalAlpha = 1;
        }

        // 2a. PARK AREAS (soft green patches)
        if (this.urbanDetails) {
            this.urbanDetails.filter(d => d.type === 'park').forEach(park => {
                const px = getX(park.x);
                const py = getY(park.y);
                const radius = park.radius * finalScale;

                // Soft gradient park
                const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius);
                gradient.addColorStop(0, 'rgba(134, 188, 134, 0.3)');
                gradient.addColorStop(0.7, 'rgba(134, 188, 134, 0.15)');
                gradient.addColorStop(1, 'rgba(134, 188, 134, 0)');

                ctx.beginPath();
                ctx.arc(px, py, radius, 0, Math.PI * 2);
                ctx.fillStyle = gradient;
                ctx.fill();
            });
        }

        // 2b. BUILDINGS (subtle rectangular shapes)
        if (this.buildings) {
            ctx.save();
            this.buildings.forEach(b => {
                const bx = getX(b.x);
                const by = getY(b.y);
                const w = b.width * finalScale;
                const h = b.height * finalScale;

                ctx.save();
                ctx.translate(bx, by);
                ctx.rotate(b.rotation);

                // Building shadow
                ctx.fillStyle = b.shadowColor;
                ctx.fillRect(-w/2 + 2, -h/2 + 2, w, h);

                // Building body
                ctx.fillStyle = b.color;
                ctx.fillRect(-w/2, -h/2, w, h);

                // Subtle border
                ctx.strokeStyle = 'rgba(0,0,0,0.06)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(-w/2, -h/2, w, h);

                ctx.restore();
            });
            ctx.restore();
        }

        // 2c. TREES (natural circles with subtle shadows)
        this.decorations.forEach(d => {
            const dx = getX(d.x);
            const dy = getY(d.y);
            const size = (d.size || 3) * zoom;

            // Tree shadow
            ctx.beginPath();
            ctx.arc(dx + 1, dy + 1, size, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.08)';
            ctx.fill();

            // Tree canopy
            ctx.beginPath();
            ctx.arc(dx, dy, size, 0, Math.PI * 2);
            ctx.fillStyle = d.color;
            ctx.fill();

            // Subtle highlight
            if (zoom > 1.5) {
                ctx.beginPath();
                ctx.arc(dx - size * 0.2, dy - size * 0.2, size * 0.3, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.15)';
                ctx.fill();
            }
        });

        // 3. DRUMURI - Clean modern style with road hierarchy
        const baseRoadW = Math.max(3, 6 * zoom);
        const arcsToRender = this.processedArcs.length > 0 ? this.processedArcs : this.mapData.arcs;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // a) Shadow/casing layer - draw all roads with subtle shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.06)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 1;

        arcsToRender.forEach(arc => {
            const f = mapData.nodesDict[arc.from];
            const t = mapData.nodesDict[arc.to];
            if (f && t) {
                const w = baseRoadW * (arc.widthFactor || 0.8);
                ctx.strokeStyle = '#d0d0d0';
                ctx.lineWidth = w + 2;
                ctx.beginPath();
                ctx.moveTo(getX(f.longitude), getY(f.latitude));
                ctx.lineTo(getX(t.longitude), getY(t.latitude));
                ctx.stroke();
            }
        });
        ctx.restore();

        // b) Road surface layer - clean white roads
        arcsToRender.forEach(arc => {
            const f = mapData.nodesDict[arc.from];
            const t = mapData.nodesDict[arc.to];
            if (f && t) {
                const w = baseRoadW * (arc.widthFactor || 0.8);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = w;
                ctx.beginPath();
                ctx.moveTo(getX(f.longitude), getY(f.latitude));
                ctx.lineTo(getX(t.longitude), getY(t.latitude));
                ctx.stroke();
            }
        });

        // c) Center line markings (only for larger roads when zoomed in)
        if (zoom > 2) {
            ctx.strokeStyle = 'rgba(200, 200, 200, 0.5)';
            ctx.setLineDash([2 * zoom, 6 * zoom]);
            arcsToRender.forEach(arc => {
                if ((arc.widthFactor || 0.8) >= 1.0) {
                    const f = mapData.nodesDict[arc.from];
                    const t = mapData.nodesDict[arc.to];
                    if (f && t) {
                        ctx.lineWidth = Math.max(0.5, 0.8 * zoom);
                        ctx.beginPath();
                        ctx.moveTo(getX(f.longitude), getY(f.latitude));
                        ctx.lineTo(getX(t.longitude), getY(t.latitude));
                        ctx.stroke();
                    }
                }
            });
            ctx.setLineDash([]);
        }

        // d) ZEBRA CROSSINGS - White background with black stripes across the road
        if (this.zebraCrossings && this.zebraCrossings.length > 0) {
            ctx.save();
            this.zebraCrossings.forEach(crossing => {
                const cx = getX(crossing.x);
                const cy = getY(crossing.y);

                // Zebra crossing dimensions - spans across the road width
                const crossingWidth = Math.max(12, baseRoadW * 1.2); // Width across the road
                const crossingLength = Math.max(6, 10 * zoom); // Length along walking direction
                const numStripes = 6;
                const stripeHeight = crossingLength / numStripes;

                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(-crossing.rotation); // Aligned with road direction

                // Draw white background rectangle
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(-crossingWidth / 2, -crossingLength / 2, crossingWidth, crossingLength);

                // Draw black stripes (alternating)
                ctx.fillStyle = '#2a2a2a';
                for (let i = 0; i < numStripes; i += 2) {
                    const y = -crossingLength / 2 + i * stripeHeight;
                    ctx.fillRect(-crossingWidth / 2, y, crossingWidth, stripeHeight);
                }

                // Draw subtle border
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(-crossingWidth / 2, -crossingLength / 2, crossingWidth, crossingLength);

                ctx.restore();
            });
            ctx.restore();
        }

        // 4. INTERSECȚII - Clean circular nodes
        const intersections = mapData.intersections || [];
        if (intersections.length > 0) {
            // Draw intersection fills to cover road overlaps
            ctx.fillStyle = '#ffffff';
            intersections.forEach(n => {
                if (n && typeof n.longitude === 'number' && typeof n.latitude === 'number') {
                    ctx.beginPath();
                    ctx.arc(getX(n.longitude), getY(n.latitude), baseRoadW * 0.6, 0, Math.PI * 2);
                    ctx.fill();
                }
            });

            // Draw subtle intersection markers
            ctx.fillStyle = 'rgba(66, 133, 244, 0.15)';
            ctx.strokeStyle = 'rgba(66, 133, 244, 0.3)';
            ctx.lineWidth = 1.5;
            intersections.forEach(n => {
                if (n && typeof n.longitude === 'number' && typeof n.latitude === 'number') {
                    ctx.beginPath();
                    ctx.arc(getX(n.longitude), getY(n.latitude), baseRoadW * 0.4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                }
            });
        }

        // 4.2 TRAFFIC LIGHTS - Draw at selected intersections
        if (this.trafficLights && this.trafficLights.length > 0) {
            this.trafficLights.forEach(light => {
                // Position is already offset from intersection center
                const lx = getX(light.x);
                const ly = getY(light.y);

                // Traffic light housing dimensions (smaller for multiple lights)
                const housingWidth = 10;
                const housingHeight = 26;
                const lightRadius = 3;

                // Calculate position offset based on light rotation
                // Place the light on the side of the road it controls
                const offsetDistance = 18;
                const lightRotation = light.rotation || 0;

                // Position perpendicular to the road direction, on the right side
                const perpAngle = lightRotation + Math.PI / 2;
                const offsetX = Math.cos(perpAngle) * offsetDistance;
                const offsetY = -Math.sin(perpAngle) * offsetDistance;

                ctx.save();

                // Translate to light position
                ctx.translate(lx + offsetX, ly + offsetY);

                // Rotate housing to face the road
                ctx.rotate(-lightRotation + Math.PI / 2);

                // Draw traffic light housing (dark gray box)
                ctx.fillStyle = '#2d2d2d';
                ctx.strokeStyle = '#1a1a1a';
                ctx.lineWidth = 1;

                // Housing background
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(-housingWidth/2, -housingHeight/2, housingWidth, housingHeight, 2);
                } else {
                    ctx.rect(-housingWidth/2, -housingHeight/2, housingWidth, housingHeight);
                }
                ctx.fill();
                ctx.stroke();

                // Draw the three lights (red, yellow, green from top to bottom)
                const lightSpacing = 7;
                const lights = [
                    { color: '#ff0000', activeColor: '#ff4444', y: -lightSpacing, isRed: true },
                    { color: '#ffaa00', activeColor: '#ffdd00', y: 0, isYellow: true },
                    { color: '#00ff00', activeColor: '#44ff44', y: lightSpacing, isGreen: true }
                ];

                lights.forEach(l => {
                    const isActive =
                        (l.isRed && light.state === 'RED') ||
                        (l.isYellow && light.state === 'YELLOW') ||
                        (l.isGreen && light.state === 'GREEN');

                    ctx.beginPath();
                    ctx.arc(0, l.y, lightRadius, 0, Math.PI * 2);

                    if (isActive) {
                        // Active light - bright with glow
                        ctx.fillStyle = l.activeColor;
                        ctx.shadowColor = l.activeColor;
                        ctx.shadowBlur = 6;
                    } else {
                        // Inactive light - dim
                        ctx.fillStyle = '#333333';
                        ctx.shadowBlur = 0;
                    }
                    ctx.fill();
                    ctx.shadowBlur = 0;

                    // Light border
                    ctx.strokeStyle = '#1a1a1a';
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                });

                // Draw AI control indicator (purple glow around housing)
                if (light.aiControlled) {
                    ctx.strokeStyle = '#a855f7';
                    ctx.lineWidth = 2;
                    ctx.shadowColor = '#a855f7';
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    if (ctx.roundRect) {
                        ctx.roundRect(-housingWidth/2 - 2, -housingHeight/2 - 2, housingWidth + 4, housingHeight + 4, 3);
                    } else {
                        ctx.rect(-housingWidth/2 - 2, -housingHeight/2 - 2, housingWidth + 4, housingHeight + 4);
                    }
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                }

                ctx.restore();
            });
        }

        // 4.5 TRAFFIC DENSITY HEATMAP (large soft colored areas showing congestion)
        this.updateTrafficClouds();
        if (this.trafficClouds && this.trafficClouds.length > 0) {
            ctx.save();

            // Draw clouds in multiple passes for a softer, more heatmap-like effect
            this.trafficClouds.forEach(cloud => {
                const cx = getX(cloud.x);
                const cy = getY(cloud.y);
                const baseRadius = cloud.radius * finalScale;
                const { r, g, b } = cloud.color;

                // Outer glow layer (largest, most transparent)
                const outerRadius = baseRadius * 1.8;
                const outerGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerRadius);
                outerGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${cloud.opacity * 0.3})`);
                outerGradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${cloud.opacity * 0.15})`);
                outerGradient.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, ${cloud.opacity * 0.05})`);
                outerGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

                ctx.beginPath();
                ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
                ctx.fillStyle = outerGradient;
                ctx.fill();

                // Middle layer
                const midRadius = baseRadius * 1.2;
                const midGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, midRadius);
                midGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${cloud.opacity * 0.5})`);
                midGradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, ${cloud.opacity * 0.35})`);
                midGradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${cloud.opacity * 0.15})`);
                midGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

                ctx.beginPath();
                ctx.arc(cx, cy, midRadius, 0, Math.PI * 2);
                ctx.fillStyle = midGradient;
                ctx.fill();

                // Core layer (smallest, most intense)
                const coreRadius = baseRadius * 0.7;
                const coreGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
                coreGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${cloud.opacity * 0.7})`);
                coreGradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${cloud.opacity * 0.4})`);
                coreGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

                ctx.beginPath();
                ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
                ctx.fillStyle = coreGradient;
                ctx.fill();
            });

            // Draw vehicle count labels on top
            this.trafficClouds.forEach(cloud => {
                const cx = getX(cloud.x);
                const cy = getY(cloud.y);
                const baseRadius = cloud.radius * finalScale;
                const { r, g, b } = cloud.color;

                if (zoom > 1.2 && cloud.opacity > 0.15) {
                    // Background pill for better readability
                    const labelText = `${cloud.count} cars`;
                    ctx.font = 'bold 12px "Inter", sans-serif';
                    const textWidth = ctx.measureText(labelText).width;

                    ctx.fillStyle = `rgba(255, 255, 255, ${cloud.opacity * 1.2})`;
                    ctx.beginPath();
                    const pillX = cx - textWidth / 2 - 8;
                    const pillY = cy - baseRadius * 0.5 - 10;
                    const pillW = textWidth + 16;
                    const pillH = 20;
                    if (ctx.roundRect) {
                        ctx.roundRect(pillX, pillY, pillW, pillH, 10);
                    } else {
                        ctx.rect(pillX, pillY, pillW, pillH);
                    }
                    ctx.fill();

                    // Text
                    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(labelText, cx, cy - baseRadius * 0.5);
                }
            });

            ctx.restore();
        }

        // 4a. CENTRAL ANTENNA SPHERE (always green, larger than vehicle spheres)
        const antenna = mapData.centralAntenna;
        if (antenna && typeof antenna.longitude === 'number' && typeof antenna.latitude === 'number') {
            const antennaX = getX(antenna.longitude);
            const antennaY = getY(antenna.latitude);

            // Fixed screen size - ~50m coverage area
            const antennaRadius = 51;
            const antennaLineWidth = 2;

            // Antenna range in coordinate units (~50m ≈ 0.00045 degrees)
            const antennaRangeCoords = 0.00045;

            // Calculate which vehicles are actually within antenna range (using coordinate distance)
            const vehiclesInRangeList = vehicles.filter(v => {
                const dx = v.x - antenna.longitude;
                const dy = v.y - antenna.latitude;
                const distance = Math.sqrt(dx * dx + dy * dy);
                return distance <= antennaRangeCoords;
            });

            const vehiclesInRange = vehiclesInRangeList.length;
            const speedingVehicles = vehiclesInRangeList.filter(v => v.speed > 50).length;
            const hasSpeedingVehicles = speedingVehicles > 0;

            // Draw antenna sphere - changes color if speeding vehicles detected
            ctx.beginPath();
            ctx.arc(antennaX, antennaY, antennaRadius, 0, Math.PI * 2);
            ctx.fillStyle = hasSpeedingVehicles ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.12)';
            ctx.fill();
            ctx.strokeStyle = hasSpeedingVehicles ? 'rgba(239, 68, 68, 0.7)' : 'rgba(34, 197, 94, 0.6)';
            ctx.lineWidth = antennaLineWidth;
            ctx.stroke();

            // Draw live stats in center of antenna sphere
            ctx.font = 'bold 9px "Inter", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#3c4043';
            ctx.fillText(`${vehiclesInRange} vehicles`, antennaX, antennaY - 6);

            if (hasSpeedingVehicles) {
                ctx.fillStyle = 'rgba(239, 68, 68, 1)';
                ctx.fillText(`⚠️ ${speedingVehicles} speeding`, antennaX, antennaY + 6);
            } else {
                ctx.fillStyle = 'rgba(34, 197, 94, 0.8)';
                ctx.fillText('✓ All OK', antennaX, antennaY + 6);
            }
        }

        // 4b. STREET LIGHTS (small decorative elements along roads)
        if (this.urbanDetails && zoom > 0.8) {
            this.urbanDetails.filter(d => d.type === 'streetlight').forEach(light => {
                const lx = getX(light.x);
                const ly = getY(light.y);
                const lightSize = Math.max(1.5, 2.5 * zoom);

                // Light glow (subtle)
                const glowGradient = ctx.createRadialGradient(lx, ly, 0, lx, ly, lightSize * 3);
                glowGradient.addColorStop(0, 'rgba(255, 248, 220, 0.25)');
                glowGradient.addColorStop(1, 'rgba(255, 248, 220, 0)');
                ctx.beginPath();
                ctx.arc(lx, ly, lightSize * 3, 0, Math.PI * 2);
                ctx.fillStyle = glowGradient;
                ctx.fill();

                // Light pole dot
                ctx.beginPath();
                ctx.arc(lx, ly, lightSize, 0, Math.PI * 2);
                ctx.fillStyle = '#666666';
                ctx.fill();

                // Light bulb
                ctx.beginPath();
                ctx.arc(lx, ly, lightSize * 0.6, 0, Math.PI * 2);
                ctx.fillStyle = '#fffef0';
                ctx.fill();
            });
        }

        // 5. MAȘINI & ETICHETE
        if (images.loaded) {
            const sphereRadius = 28; // Constant size regardless of zoom

            // Calculate screen positions and detect collisions
            const vehiclePositions = vehicles.map(v => ({
                ...v,
                screenX: getX(v.x),
                screenY: getY(v.y),
                collisionCount: 0
            }));

            // Check collisions between all pairs (only if spheres are enabled)
            if (this.showCollisionSpheres) {
                for (let i = 0; i < vehiclePositions.length; i++) {
                    for (let j = i + 1; j < vehiclePositions.length; j++) {
                        const v1 = vehiclePositions[i];
                        const v2 = vehiclePositions[j];
                        const dx = v1.screenX - v2.screenX;
                        const dy = v1.screenY - v2.screenY;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        if (dist < sphereRadius * 2) {
                            v1.collisionCount++;
                            v2.collisionCount++;
                        }
                    }
                }

                // Draw spheres first (behind cars) - but not for ambulances
                vehiclePositions.forEach(v => {
                    // Skip ambulances - they get rectangular zones instead
                    if (v.isAmbulance) return;

                    const vx = v.screenX;
                    const vy = v.screenY;

                    let fillColor, strokeColor;
                    if (v.collisionCount >= 2) {
                        // 3+ cars touching - RED
                        fillColor = 'rgba(239, 68, 68, 0.15)';
                        strokeColor = 'rgba(239, 68, 68, 0.7)';
                    } else if (v.collisionCount === 1) {
                        // 2 cars touching - YELLOW
                        fillColor = 'rgba(251, 191, 36, 0.15)';
                        strokeColor = 'rgba(251, 191, 36, 0.7)';
                    } else {
                        // No collision - BLUE
                        fillColor = 'rgba(59, 130, 246, 0.12)';
                        strokeColor = 'rgba(59, 130, 246, 0.5)';
                    }

                    // Draw sphere
                    ctx.beginPath();
                    ctx.arc(vx, vy, sphereRadius, 0, Math.PI * 2);
                    ctx.fillStyle = fillColor;
                    ctx.fill();
                    ctx.strokeStyle = strokeColor;
                    ctx.lineWidth = 2.5;
                    ctx.stroke();
                });

                // Draw ambulance rectangular zones
                vehiclePositions.filter(v => v.isAmbulance).forEach(ambulance => {
                    const ambX = ambulance.screenX;
                    const ambY = ambulance.screenY;

                    // Calculate target position on screen
                    if (typeof ambulance.targetX === 'number' && typeof ambulance.targetY === 'number') {
                        const targetScreenX = getX(ambulance.targetX);
                        const targetScreenY = getY(ambulance.targetY);

                        // Calculate direction and distance
                        const dx = targetScreenX - ambX;
                        const dy = targetScreenY - ambY;
                        const distance = Math.sqrt(dx * dx + dy * dy);

                        if (distance > 5) {
                            // Rectangle dimensions - narrower to only cover the road, not sidewalks
                            const rectWidth = 45; // Width of the rectangle (side to side) - narrower
                            const rectLength = distance; // Length to target

                            ctx.save();
                            ctx.translate(ambX, ambY);
                            ctx.rotate(-ambulance.rotation);

                            // Draw the rectangular zone in front of ambulance
                            ctx.beginPath();
                            ctx.rect(0, -rectWidth/2, rectLength, rectWidth);
                            ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
                            ctx.fill();
                            ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
                            ctx.lineWidth = 2;
                            ctx.setLineDash([5, 5]);
                            ctx.stroke();
                            ctx.setLineDash([]);

                            ctx.restore();
                        }
                    }
                });

                // Draw pedestrian detection rectangles for regular vehicles
                vehiclePositions.filter(v => !v.isAmbulance).forEach(vehicle => {
                    const vx = vehicle.screenX;
                    const vy = vehicle.screenY;

                    // Detection rectangle dimensions (smaller than ambulance zone)
                    const rectWidth = 36; // Width of the rectangle (side to side)
                    const rectLength = 50; // Length ahead (~30m detection range)

                    ctx.save();
                    ctx.translate(vx, vy);
                    ctx.rotate(-vehicle.rotation);

                    // Draw the pedestrian detection zone in front of vehicle
                    // Color changes based on whether pedestrian is detected
                    const hasDetection = vehicle.pedestrianAhead;
                    ctx.beginPath();
                    ctx.rect(0, -rectWidth/2, rectLength, rectWidth);
                    ctx.fillStyle = hasDetection ? 'rgba(251, 191, 36, 0.2)' : 'rgba(59, 130, 246, 0.08)';
                    ctx.fill();
                    ctx.strokeStyle = hasDetection ? 'rgba(251, 191, 36, 0.7)' : 'rgba(59, 130, 246, 0.3)';
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([3, 3]);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    ctx.restore();
                });
            }

            // Draw cars on top
            vehiclePositions.forEach(v => {
                const vx = v.screenX;
                const vy = v.screenY;

                // Choose appropriate image
                let carImg;
                let s = 35; // Constant size regardless of zoom

                if (v.isAmbulance) {
                    carImg = images.ambulance;
                    s = 40; // Ambulances are slightly larger
                } else {
                    carImg = v.isCurrentUser ? images.userCar : images.otherCar;
                }

                ctx.save();
                ctx.translate(vx, vy);

                if (typeof v.rotation === 'number') {
                    ctx.rotate(-v.rotation);
                }

                // Apply 50% transparency if vehicle is in ambulance zone
                if (v.inAmbulanceZone && !v.isAmbulance) {
                    ctx.globalAlpha = 0.5;
                }

                // User's personal car - neon cyan aura
                if (v.isCurrentUser) {
                    ctx.shadowColor = 'rgba(0, 255, 255, 0.9)';
                    ctx.shadowBlur = 25;
                    ctx.shadowOffsetY = 0;
                }
                // Ambulances always have emergency glow
                else if (v.isAmbulance) {
                    ctx.shadowColor = 'rgba(239, 68, 68, 0.9)';
                    ctx.shadowBlur = 20;
                    ctx.shadowOffsetY = 0;
                } else if (v.speed > 50) {
                    ctx.shadowColor = 'rgba(239, 68, 68, 0.8)';
                    ctx.shadowBlur = 15;
                    ctx.shadowOffsetY = 0;
                } else {
                    ctx.shadowColor = 'rgba(0,0,0,0.25)';
                    ctx.shadowBlur = 6;
                    ctx.shadowOffsetY = 2;
                }

                if (carImg) {
                    ctx.drawImage(carImg, -s/2, -s/2, s, s);
                }

                ctx.restore();

                // Ambulance indicator - red cross above ambulances
                if (v.isAmbulance) {
                    ctx.save();
                    // Red circle background with cross
                    ctx.beginPath();
                    ctx.arc(vx, vy - s/2 - 15, 12, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(239, 68, 68, 0.95)';
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    // Cross symbol
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 14px "Inter", sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('+', vx, vy - s/2 - 15);
                    ctx.restore();
                }
                // Exclamation mark ABOVE speeding cars (not ambulances)
                else if (v.speed > 50) {
                    ctx.save();
                    // Red circle background for exclamation
                    ctx.beginPath();
                    ctx.arc(vx, vy - s/2 - 15, 12, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(239, 68, 68, 0.95)';
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    // Exclamation mark
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 14px "Inter", sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('!', vx, vy - s/2 - 15);
                    ctx.restore();
                }

                // AI COMMAND indicator - shows when vehicle is being controlled by AI
                if (v.aiCommand) {
                    ctx.save();
                    const cmdX = vx + s/2 + 8;
                    const cmdY = vy - s/2 - 8;
                    const cmdSize = 14;

                    // Draw octagon (stop sign shape) for OPRESTE, circle for others
                    if (v.aiCommand === 'OPRESTE') {
                        ctx.beginPath();
                        const sides = 8;
                        for (let i = 0; i < sides; i++) {
                            const angle = (i * 2 * Math.PI / sides) - Math.PI / 8;
                            const px = cmdX + cmdSize * Math.cos(angle);
                            const py = cmdY + cmdSize * Math.sin(angle);
                            if (i === 0) ctx.moveTo(px, py);
                            else ctx.lineTo(px, py);
                        }
                        ctx.closePath();
                        ctx.fillStyle = 'rgba(220, 38, 38, 0.95)';
                    } else if (v.aiCommand === 'INCETINESTE') {
                        ctx.beginPath();
                        ctx.arc(cmdX, cmdY, cmdSize, 0, Math.PI * 2);
                        ctx.fillStyle = 'rgba(251, 146, 60, 0.95)';
                    } else if (v.aiCommand === 'ACCELEREAZA') {
                        ctx.beginPath();
                        ctx.arc(cmdX, cmdY, cmdSize, 0, Math.PI * 2);
                        ctx.fillStyle = 'rgba(34, 197, 94, 0.95)';
                    } else {
                        ctx.beginPath();
                        ctx.arc(cmdX, cmdY, cmdSize, 0, Math.PI * 2);
                        ctx.fillStyle = 'rgba(59, 130, 246, 0.95)';
                    }

                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    // Command text
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 7px "Inter", sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const cmdText = v.aiCommand === 'OPRESTE' ? 'STOP' :
                                   v.aiCommand === 'INCETINESTE' ? 'SLOW' :
                                   v.aiCommand === 'ACCELEREAZA' ? 'GO' : 'AI';
                    ctx.fillText(cmdText, cmdX, cmdY);

                    ctx.restore();
                }

                ctx.shadowBlur = 0;
                ctx.font = '500 10px "Inter", sans-serif';
                const label = v.id;
                const tw = ctx.measureText(label).width;

                // Label background - red for speeding vehicles
                ctx.fillStyle = v.speed > 50 ? 'rgba(239, 68, 68, 0.9)' : 'rgba(255,255,255,0.9)';
                if (ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(vx - tw/2 - 6, vy + s/2 + 4, tw + 12, 16, 8);
                    ctx.fill();
                }

                // Label text - white for speeding, dark for normal
                ctx.fillStyle = v.speed > 50 ? '#ffffff' : '#3c4043';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(label, vx, vy + s/2 + 7);

                // Speed indicator for speeding vehicles
                if (v.speed > 50) {
                    ctx.font = 'bold 8px "Inter", sans-serif';
                    ctx.fillStyle = 'rgba(239, 68, 68, 1)';
                    ctx.fillText(`${Math.round(v.speed)} km/h`, vx, vy + s/2 + 22);
                }
            });
        }

        // 5b. PEDESTRIANS - Red opaque circles with white outline
        if (this.pedestrians && this.pedestrians.length > 0) {
            const pedestrianRadius = 6; // Size of pedestrian circle

            this.pedestrians.forEach(p => {
                const px = getX(p.x);
                const py = getY(p.y);

                // Draw pedestrian as red opaque circle with solid white outline
                ctx.save();

                // If crossing, add a pulsing glow effect
                if (p.isCrossing) {
                    ctx.shadowColor = 'rgba(220, 38, 38, 0.8)';
                    ctx.shadowBlur = 12;
                }

                // Apply 50% transparency if pedestrian is in ambulance zone
                if (p.inAmbulanceZone) {
                    ctx.globalAlpha = 0.5;
                }

                // White outline (drawn first, slightly larger)
                ctx.beginPath();
                ctx.arc(px, py, pedestrianRadius + 2, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();

                // Red opaque fill - brighter when crossing
                ctx.beginPath();
                ctx.arc(px, py, pedestrianRadius, 0, Math.PI * 2);
                ctx.fillStyle = p.isCrossing ? 'rgba(239, 68, 68, 1)' : 'rgba(220, 38, 38, 0.85)';
                ctx.fill();

                // Solid white stroke outline
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.restore();
            });
        }

        // 6. PUNCTE CARDINALE (Layerul cel mai de sus - HUD)
        ctx.save();
        const screenMargin = 25;
        const cardinalSize = 28;

        // Modern circular badge style
        const drawCardinalBadge = (letter, x, y) => {
            // Background circle with subtle shadow
            ctx.shadowColor = 'rgba(0,0,0,0.15)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetY = 2;

            ctx.beginPath();
            ctx.arc(x, y, cardinalSize / 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.fill();

            // Subtle border
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Letter
            ctx.fillStyle = '#202124';
            ctx.font = '600 14px "Inter", system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(letter, x, y);
        };

        drawCardinalBadge('N', canvas.width / 2, screenMargin);
        drawCardinalBadge('S', canvas.width / 2, canvas.height - screenMargin);
        drawCardinalBadge('E', canvas.width - screenMargin, canvas.height / 2);
        drawCardinalBadge('W', screenMargin, canvas.height / 2);

        ctx.restore();
    }

    zoomIn() { this.targetZoom *= 1.4; this.startAnimation(); }
    zoomOut() { this.targetZoom *= 0.7; this.startAnimation(); }
    resetView() { this.targetZoom = 1; this.targetPanX = 0; this.targetPanY = 0; this.startAnimation(); }
}