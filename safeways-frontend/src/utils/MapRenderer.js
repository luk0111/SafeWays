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

        this.decorations = []; // Stocăm pozițiile copacilor
        this.initListeners();
    }

    initListeners() {
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomFactor = e.deltaY > 0 ? 0.85 : 1.15;
            this.targetZoom *= zoomFactor;
            this.targetZoom = Math.max(0.1, Math.min(this.targetZoom, 20));
            this.startAnimation();
        }, { passive: false });

        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.canvas.style.cursor = 'grabbing';
            this.startX = e.clientX - this.targetPanX;
            this.startY = e.clientY - this.targetPanY;
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            this.targetPanX = e.clientX - this.startX;
            this.targetPanY = e.clientY - this.startY;
            this.startAnimation();
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.canvas.style.cursor = 'default';
        });
    }

    updateData({ mapData, boundingBox, vehicles, images }) {
        const dataChanged = mapData && mapData !== this.mapData;
        if (mapData) this.mapData = mapData;
        if (boundingBox) this.boundingBox = boundingBox;
        if (vehicles) this.vehicles = vehicles;
        if (images) this.images = images;

        if (dataChanged) {
            this.generateDecorations();
        }
        this.startAnimation();
    }

    generateDecorations() {
        this.decorations = [];
        if (!this.mapData || !this.boundingBox) return;
        const { minX, maxX, minY, maxY } = this.boundingBox;
        const treeCount = 400;

        for (let i = 0; i < treeCount; i++) {
            const tx = minX + Math.random() * (maxX - minX);
            const ty = minY + Math.random() * (maxY - minY);

            let isSafe = true;
            for (const nodeId in this.mapData.nodesDict) {
                const node = this.mapData.nodesDict[nodeId];
                const dist = Math.sqrt(Math.pow(tx - node.longitude, 2) + Math.pow(ty - node.latitude, 2));
                // Păstrăm distanța de siguranță față de drumuri
                if (dist < 150) { isSafe = false; break; }
            }

            if (isSafe) {
                this.decorations.push({
                    x: tx, y: ty,
                    size: 4 + Math.random() * 8, // Copaci mici, cum erau inițial
                    color: ['#2d5a27', '#1e3f1a', '#3a6d32'][Math.floor(Math.random() * 3)]
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

        // 2. DECORAȚIUNI (Copacii verzi de dinainte)
        this.decorations.forEach(d => {
            const dx = getX(d.x);
            const dy = getY(d.y);
            ctx.beginPath();
            ctx.arc(dx, dy, d.size * zoom, 0, Math.PI * 2);
            ctx.fillStyle = d.color;
            ctx.fill();
            if (zoom > 2) {
                ctx.strokeStyle = 'rgba(0,0,0,0.1)';
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }
        });

        // 3. DRUMURI - Clean modern style
        const roadW = Math.max(4, 8 * zoom);
        const casingW = roadW + 2;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Collect all unique intersection points for later
        const intersectionPoints = new Set();
        if (mapData.intersections) {
            mapData.intersections.forEach(n => {
                intersectionPoints.add(`${n.longitude},${n.latitude}`);
            });
        }

        // a) Shadow layer (subtle depth)
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.08)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;
        ctx.strokeStyle = '#e8eaed';
        ctx.lineWidth = casingW;
        ctx.beginPath();
        mapData.arcs.forEach(arc => {
            const f = mapData.nodesDict[arc.from];
            const t = mapData.nodesDict[arc.to];
            if (f && t) {
                ctx.moveTo(getX(f.longitude), getY(f.latitude));
                ctx.lineTo(getX(t.longitude), getY(t.latitude));
            }
        });
        ctx.stroke();
        ctx.restore();

        // b) Road surface (clean white)
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = roadW;
        ctx.beginPath();
        mapData.arcs.forEach(arc => {
            const f = mapData.nodesDict[arc.from];
            const t = mapData.nodesDict[arc.to];
            if (f && t) {
                ctx.moveTo(getX(f.longitude), getY(f.latitude));
                ctx.lineTo(getX(t.longitude), getY(t.latitude));
            }
        });
        ctx.stroke();

        // c) Center line markings (only when zoomed in)
        if (zoom > 1.5) {
            ctx.strokeStyle = '#e0e0e0';
            ctx.lineWidth = Math.max(0.5, 1 * zoom);
            ctx.setLineDash([3 * zoom, 8 * zoom]);
            ctx.beginPath();
            mapData.arcs.forEach(arc => {
                const f = mapData.nodesDict[arc.from];
                const t = mapData.nodesDict[arc.to];
                if (f && t) {
                    ctx.moveTo(getX(f.longitude), getY(f.latitude));
                    ctx.lineTo(getX(t.longitude), getY(t.latitude));
                }
            });
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // 4. INTERSECȚII - Clean circular nodes
        if (mapData.intersections) {
            // Draw intersection fills to cover road overlap
            ctx.fillStyle = '#ffffff';
            mapData.intersections.forEach(n => {
                ctx.beginPath();
                ctx.arc(getX(n.longitude), getY(n.latitude), roadW * 0.6, 0, Math.PI * 2);
                ctx.fill();
            });

            // Draw subtle intersection markers
            ctx.fillStyle = 'rgba(66, 133, 244, 0.15)';
            ctx.strokeStyle = 'rgba(66, 133, 244, 0.3)';
            ctx.lineWidth = 1.5;
            mapData.intersections.forEach(n => {
                ctx.beginPath();
                ctx.arc(getX(n.longitude), getY(n.latitude), roadW * 0.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            });
        }

        // 5. MAȘINI & ETICHETE
        if (images.loaded) {
            vehicles.forEach(v => {
                const vx = getX(v.x);
                const vy = getY(v.y);
                const carImg = v.isCurrentUser ? images.userCar : images.otherCar;
                const s = 45 * Math.max(0.6, Math.min(zoom, 1.2));

                ctx.shadowColor = 'rgba(0,0,0,0.2)';
                ctx.shadowBlur = 8;
                if (carImg) ctx.drawImage(carImg, vx - s/2, vy - s/2, s, s);
                ctx.shadowBlur = 0;

                ctx.font = '600 12px "Inter", sans-serif';
                const tw = ctx.measureText(v.id).width;
                ctx.fillStyle = 'white';
                if(ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(vx + 22, vy - 13, tw + 20, 26, 13);
                    ctx.fill();
                }
                ctx.fillStyle = '#3c4043';
                ctx.textAlign = 'left';
                ctx.fillText(v.id, vx + 32, vy + 4);
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