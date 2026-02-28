export class MapRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Valorile reale
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;

        // Valorile țintă pentru animația smooth (LERP)
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

        this.initListeners();
    }

    initListeners() {
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomFactor = e.deltaY > 0 ? 0.85 : 1.15;
            this.targetZoom *= zoomFactor;
            this.targetZoom = Math.max(0.1, Math.min(this.targetZoom, 20));
            this.startAnimation();
        });

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

    zoomIn() {
        this.targetZoom *= 1.4;
        this.targetZoom = Math.min(this.targetZoom, 20);
        this.startAnimation();
    }

    zoomOut() {
        this.targetZoom *= 0.7;
        this.targetZoom = Math.max(0.1, this.targetZoom);
        this.startAnimation();
    }

    resetView() {
        this.targetZoom = 1;
        this.targetPanX = 0;
        this.targetPanY = 0;
        this.startAnimation();
    }

    updateData({ mapData, boundingBox, vehicles, images }) {
        if (mapData) this.mapData = mapData;
        if (boundingBox) this.boundingBox = boundingBox;
        if (vehicles) this.vehicles = vehicles;
        if (images) this.images = images;

        this.startAnimation();
    }

    // --- ANIMAȚIA SMOOTH (LERP) ---
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

        // Ajustăm fin viteza animațiilor
        this.zoom += diffZoom * 0.12;
        this.panX += diffPanX * 0.3;
        this.panY += diffPanY * 0.3;

        this.draw();

        if (
            Math.abs(diffZoom) > 0.001 ||
            Math.abs(diffPanX) > 0.5 ||
            Math.abs(diffPanY) > 0.5
        ) {
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

        const { ctx, canvas, zoom, panX, panY, mapData, boundingBox, vehicles, images } = this;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const padding = 40;
        const usableWidth = canvas.width - padding * 2;
        const usableHeight = canvas.height - padding * 2;

        const rangeX = boundingBox.maxX - boundingBox.minX;
        const rangeY = boundingBox.maxY - boundingBox.minY;

        if (rangeX === 0 || rangeY === 0) return;

        const baseScaleX = usableWidth / rangeX;
        const baseScaleY = usableHeight / rangeY;
        const baseScale = Math.min(baseScaleX, baseScaleY);

        const finalScale = baseScale * zoom;

        const offsetX = padding + (usableWidth - rangeX * finalScale) / 2 + panX;
        const offsetY = padding + (usableHeight - rangeY * finalScale) / 2 - panY;

        const getCanvasX = (mapX) => offsetX + (mapX - boundingBox.minX) * finalScale;
        const getCanvasY = (mapY) => canvas.height - (offsetY + (mapY - boundingBox.minY) * finalScale);

        // --- CULLING (Optimizare Viewport) ---
        const mapXAtLeft = boundingBox.minX - offsetX / finalScale;
        const mapXAtRight = boundingBox.minX + (canvas.width - offsetX) / finalScale;

        const mapYAtTop = boundingBox.minY + (canvas.height - offsetY) / finalScale;
        const mapYAtBottom = boundingBox.minY - offsetY / finalScale;

        const marginX = Math.abs(mapXAtRight - mapXAtLeft) * 0.1;
        const marginY = Math.abs(mapYAtTop - mapYAtBottom) * 0.1;

        const visibleMinX = Math.min(mapXAtLeft, mapXAtRight) - marginX;
        const visibleMaxX = Math.max(mapXAtLeft, mapXAtRight) + marginX;
        const visibleMinY = Math.min(mapYAtTop, mapYAtBottom) - marginY;
        const visibleMaxY = Math.max(mapYAtTop, mapYAtBottom) + marginY;

        // --- 1. DESENAREA STRĂZILOR (Asfalt + Linii de sens - SUBȚIRE ȘI FIN) ---

        // AM REDUS GROSIMEA: Baza pleacă de la 2px, și crește foarte puțin cu zoom-ul
        const roadWidth = Math.max(2, 6 * zoom);

        // a) STRATUL 1: Baza drumului (Asfaltul) - Acum mult mai subțire
        ctx.strokeStyle = '#64748b'; // Gri-asfalt elegant
        ctx.lineWidth = roadWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        mapData.arcs.forEach(arc => {
            const fromNode = mapData.nodesDict[arc.from];
            const toNode = mapData.nodesDict[arc.to];

            if (fromNode && toNode) {
                // Culling (Optimizare)
                if (
                    (fromNode.longitude < visibleMinX && toNode.longitude < visibleMinX) ||
                    (fromNode.longitude > visibleMaxX && toNode.longitude > visibleMaxX) ||
                    (fromNode.latitude < visibleMinY && toNode.latitude < visibleMinY) ||
                    (fromNode.latitude > visibleMaxY && toNode.latitude > visibleMaxY)
                ) {
                    return;
                }
                ctx.moveTo(getCanvasX(fromNode.longitude), getCanvasY(fromNode.latitude));
                ctx.lineTo(getCanvasX(toNode.longitude), getCanvasY(toNode.latitude));
            }
        });
        ctx.stroke();

        // b) STRATUL 2: Marcajele rutiere (Liniile punctate - DISCRETE)
        // Le afișăm doar la zoom foarte mare
        if (zoom > 2.0) {
            ctx.strokeStyle = '#ffffff'; // Culoarea marcajului (Alb)
            // Lățimea e microscopică comparativ cu lățimea străzii
            ctx.lineWidth = Math.max(0.1, 0.5 * zoom);

            // Creăm un efect discret
            ctx.setLineDash([12 * zoom, 15 * zoom]);

            ctx.beginPath();
            mapData.arcs.forEach(arc => {
                const fromNode = mapData.nodesDict[arc.from];
                const toNode = mapData.nodesDict[arc.to];

                if (fromNode && toNode) {
                    if (
                        (fromNode.longitude < visibleMinX && toNode.longitude < visibleMinX) ||
                        (fromNode.longitude > visibleMaxX && toNode.longitude > visibleMaxX) ||
                        (fromNode.latitude < visibleMinY && toNode.latitude < visibleMinY) ||
                        (fromNode.latitude > visibleMaxY && toNode.latitude > visibleMaxY)
                    ) {
                        return;
                    }
                    ctx.moveTo(getCanvasX(fromNode.longitude), getCanvasY(fromNode.latitude));
                    ctx.lineTo(getCanvasX(toNode.longitude), getCanvasY(toNode.latitude));
                }
            });
            ctx.stroke();

            // IMPORTANT: Resetăm setLineDash!
            ctx.setLineDash([]);
        }
        // --- 2. DESENAREA INTERSECȚIILOR (Albastru Transparent) ---
        if (mapData.intersections && mapData.intersections.length > 0) {
            ctx.fillStyle = 'rgba(59, 130, 246, 0.5)'; // Culoarea albastru-transparent

            mapData.intersections.forEach(node => {
                if (
                    node.longitude >= visibleMinX && node.longitude <= visibleMaxX &&
                    node.latitude >= visibleMinY && node.latitude <= visibleMaxY
                ) {
                    ctx.beginPath();
                    ctx.arc(getCanvasX(node.longitude), getCanvasY(node.latitude), Math.max(2, 3 * zoom), 0, Math.PI * 2);
                    ctx.fill();
                }
            });
        }

        // --- 3. DESENAREA MAȘINILOR ---
        if (!images.loaded) return;

        vehicles.forEach(v => {
            const vx = getCanvasX(v.x);
            const vy = getCanvasY(v.y);

            const carImg = v.isCurrentUser ? images.userCar : images.otherCar;
            const imgScale = Math.max(0.7, Math.min(zoom, 1.5));
            const imgWidth = 45 * imgScale;
            const imgHeight = 45 * imgScale;

            if (carImg && carImg.width > 0) {
                ctx.drawImage(carImg, vx - imgWidth / 2, vy - imgHeight / 2, imgWidth, imgHeight);
            } else {
                ctx.beginPath();
                ctx.arc(vx, vy, 10 * imgScale, 0, Math.PI * 2);
                ctx.fillStyle = v.isCurrentUser ? '#3b82f6' : '#ef4444';
                ctx.fill();
            }

            const labelText = v.id;
            ctx.font = '600 12px "Inter", sans-serif';
            const textWidth = ctx.measureText(labelText).width;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            const rectX = vx + 18 * imgScale;
            const rectY = vy - 18 * imgScale;

            if(ctx.roundRect) {
                ctx.beginPath();
                ctx.roundRect(rectX, rectY, textWidth + 16, 24, 8);
                ctx.fill();
            } else {
                ctx.fillRect(rectX, rectY, textWidth + 16, 24);
            }

            ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
            ctx.lineWidth = 1;
            if(ctx.roundRect) ctx.stroke();

            ctx.fillStyle = v.isCurrentUser ? '#111827' : '#4b5563';
            ctx.fillText(labelText, rectX + 8, rectY + 16);
        });
    }
}