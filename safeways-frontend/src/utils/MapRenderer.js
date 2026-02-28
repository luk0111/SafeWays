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

    updateData({ mapData, boundingBox, vehicles, images }) {
        const dataChanged = mapData && mapData !== this.mapData;
        if (mapData) this.mapData = mapData;
        if (boundingBox) this.boundingBox = boundingBox;
        if (vehicles) this.vehicles = vehicles;
        if (images) this.images = images;

        if (dataChanged) {
            this.generateDecorations();
            this.processArcs();
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
            vehicles.forEach(v => {
                const vx = getX(v.x);
                const vy = getY(v.y);
                const carImg = v.isCurrentUser ? images.userCar : images.otherCar;
                const s = 35 * Math.max(0.6, Math.min(zoom, 1.2));

                ctx.save();
                ctx.translate(vx, vy);

                if (typeof v.rotation === 'number') {
                    ctx.rotate(-v.rotation);
                }

                ctx.shadowColor = 'rgba(0,0,0,0.25)';
                ctx.shadowBlur = 6;
                ctx.shadowOffsetY = 2;

                if (carImg) {
                    ctx.drawImage(carImg, -s/2, -s/2, s, s);
                }

                ctx.restore();

                ctx.shadowBlur = 0;
                ctx.font = '500 10px "Inter", sans-serif';
                const label = v.id;
                const tw = ctx.measureText(label).width;

                ctx.fillStyle = 'rgba(255,255,255,0.9)';
                if (ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(vx - tw/2 - 6, vy + s/2 + 4, tw + 12, 16, 8);
                    ctx.fill();
                }

                ctx.fillStyle = '#3c4043';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(label, vx, vy + s/2 + 7);
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