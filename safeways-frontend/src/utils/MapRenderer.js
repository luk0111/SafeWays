export class MapRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;

        this.mapData = null;
        this.boundingBox = null;
        this.vehicles = [];
        this.images = { loaded: false };

        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;

        // Variabilă pentru limitarea randărilor (optimizare performanță)
        this.animationFrameId = null;

        this.initListeners();
    }

    initListeners() {
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomAmount = e.deltaY > 0 ? 0.9 : 1.1;
            this.zoom *= zoomAmount;
            this.scheduleDraw(); // Folosim scheduleDraw în loc de this.draw()
        });

        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.canvas.style.cursor = 'grabbing';
            this.startX = e.clientX - this.panX;
            this.startY = e.clientY - this.panY;
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            this.panX = e.clientX - this.startX;
            this.panY = e.clientY - this.startY;
            this.scheduleDraw(); // Folosim scheduleDraw
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.canvas.style.cursor = 'default';
        });
    }

    zoomIn() {
        this.zoom *= 1.2;
        this.scheduleDraw();
    }

    zoomOut() {
        this.zoom *= 0.8;
        this.scheduleDraw();
    }

    resetView() {
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.scheduleDraw();
    }

    updateData({ mapData, boundingBox, vehicles, images }) {
        if (mapData) this.mapData = mapData;
        if (boundingBox) this.boundingBox = boundingBox;
        if (vehicles) this.vehicles = vehicles;
        if (images) this.images = images;
        this.scheduleDraw();
    }

    // --- OPTIMIZARE 1: Folosim RequestAnimationFrame pentru a preveni lag-ul din cauza mișcării mouse-ului ---
    scheduleDraw() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        this.animationFrameId = requestAnimationFrame(() => this.draw());
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

        // --- OPTIMIZARE 2: VIEWPORT CULLING ---
        // Calculăm ce coordonate de pe hartă sunt vizibile momentan pe ecran (pe baza pan & zoom)
        const mapXAtLeft = boundingBox.minX - offsetX / finalScale;
        const mapXAtRight = boundingBox.minX + (canvas.width - offsetX) / finalScale;

        const mapYAtTop = boundingBox.minY + (canvas.height - offsetY) / finalScale;
        const mapYAtBottom = boundingBox.minY - offsetY / finalScale;

        // Adăugăm o mică marjă (10%) pentru a nu tăia brusc străzile chiar la marginea ecranului
        const marginX = Math.abs(mapXAtRight - mapXAtLeft) * 0.1;
        const marginY = Math.abs(mapYAtTop - mapYAtBottom) * 0.1;

        const visibleMinX = Math.min(mapXAtLeft, mapXAtRight) - marginX;
        const visibleMaxX = Math.max(mapXAtLeft, mapXAtRight) + marginX;
        const visibleMinY = Math.min(mapYAtTop, mapYAtBottom) - marginY;
        const visibleMaxY = Math.max(mapYAtTop, mapYAtBottom) + marginY;

        // --- DESENAREA STRĂZILOR ---
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = Math.max(0.5, 1.5 * zoom);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        mapData.arcs.forEach(arc => {
            const fromNode = mapData.nodesDict[arc.from];
            const toNode = mapData.nodesDict[arc.to];

            if (fromNode && toNode) {
                // CULLING MAGIC: Dacă ambele puncte ale străzii sunt complet în afara ecranului, NU o desenăm deloc!
                if (
                    (fromNode.longitude < visibleMinX && toNode.longitude < visibleMinX) ||
                    (fromNode.longitude > visibleMaxX && toNode.longitude > visibleMaxX) ||
                    (fromNode.latitude < visibleMinY && toNode.latitude < visibleMinY) ||
                    (fromNode.latitude > visibleMaxY && toNode.latitude > visibleMaxY)
                ) {
                    return; // Sărim peste linia asta, salvând zeci de mii de calcule!
                }

                ctx.moveTo(getCanvasX(fromNode.longitude), getCanvasY(fromNode.latitude));
                ctx.lineTo(getCanvasX(toNode.longitude), getCanvasY(toNode.latitude));
            }
        });
        ctx.stroke();

        // --- DESENAREA MAȘINILOR ---
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