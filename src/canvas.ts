/**
 * This file contains the core logic for the application's canvas rendering,
 * including drawing analysis results, handling zoom/pan, and painting operations.
 */

import { state, getActiveAnalysis } from './state';
import * as elements from './elements';
import { findContourPointAtAngle } from './utils';

/**
 * Requests a redraw of the results canvas on the next animation frame.
 */
export const requestRedraw = () => requestAnimationFrame(drawResults);

/**
 * Updates the paint layer canvas, which shows detected cells for the current analysis.
 */
export function updatePaintLayer() {
    const analysis = getActiveAnalysis();
    if (!analysis) return;

    const paintCtx = elements.paintCanvas.getContext('2d');
    if (!paintCtx) return;

    const { width, height } = elements.paintCanvas;
    paintCtx.clearRect(0, 0, width, height);

    if (!elements.paintCellsCheckbox.checked || analysis.detectedParticles.length === 0) {
        state.isPaintLayerDirty = false;
        return;
    }
    const validColor = '#2DD4BF';
    const hexToRgb = (hex: string) => { const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null; };
    const colorRgb = hexToRgb(validColor);

    if (!colorRgb) {
        state.isPaintLayerDirty = false;
        return;
    }

    paintCtx.fillStyle = `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.7)`;
    for (const particle of analysis.detectedParticles) {
        if (particle.ellipse) {
            const { centroid, radiusX, radiusY, angle } = particle.ellipse;
            paintCtx.beginPath();
            paintCtx.ellipse(centroid.x, centroid.y, radiusX * 1.2, radiusY * 1.2, angle, 0, 2 * Math.PI);
            paintCtx.fill();
        }
    }
    state.isPaintLayerDirty = false;
}

/**
 * Draws all analysis results onto a given canvas context for the current analysis.
 * Used for both the main display and for saving the final image.
 * @param ctx The 2D canvas rendering context to draw on.
 */
export function drawForSaving(ctx: CanvasRenderingContext2D) {
    const analysis = getActiveAnalysis();
    if (!analysis || !analysis.originalImage) return;
    if (state.isPaintLayerDirty) updatePaintLayer();

    // Draw base layers
    ctx.drawImage(elements.processedImageCanvas, 0, 0);

    // Apply real-time opacity to the temporary paint canvas during editing
    const isEditing = state.paintModeContext !== null;
    if (isEditing) {
        ctx.globalAlpha = parseInt(elements.brushOpacityInput.value, 10) / 100;
    }
    
    ctx.drawImage(elements.paintSpheroidCanvas, 0, 0);
    ctx.drawImage(elements.manualPaintCanvas, 0, 0);
    
    // Reset globalAlpha after drawing the potentially transparent layer
    if (isEditing) {
        ctx.globalAlpha = 1.0;
    }
    
    if (elements.paintCellsCheckbox.checked) {
        ctx.globalAlpha = 1.0;
        ctx.drawImage(elements.paintCanvas, 0, 0);
        ctx.globalAlpha = 1.0;
    }

    // Draw cell numbers if enabled
    if (elements.showCellNumbersCheckbox.checked && analysis.detectedParticles.length > 0) {
        const fontSize = parseInt(elements.cellNumberFontSize.value, 10) || 18;
        ctx.font = `bold ${fontSize}px Inter`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        analysis.detectedParticles.forEach((item, index) => {
            const pos = item.centroid;
            if (pos) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, fontSize * 0.7, 0, 2 * Math.PI);
                ctx.fill();
                ctx.fillStyle = '#facc15';
                ctx.fillText(String(index + 1), pos.x, pos.y + 1);
            }
        });
    }

    if (!analysis.lastAnalysisResult.centerX) return;

    const { centerX, centerY, maxRadius, maxRadiusData } = analysis.lastAnalysisResult;
    const lw = parseInt(elements.analysisLineWidth.value, 10) || 8;

    // Draw spheroid contour
    if (analysis.manualDrawnPath.length > 1) {
        ctx.strokeStyle = (document.getElementById('spheroidLineColorInput') as HTMLInputElement).value;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(analysis.manualDrawnPath[0].x, analysis.manualDrawnPath[0].y);
        analysis.manualDrawnPath.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.stroke();
    }
    
    // Draw max radius circle
    if (maxRadius > 0 && elements.showMaxRadiusCircleCheckbox.checked) {
        ctx.beginPath();
        ctx.strokeStyle = (document.getElementById('maxLineColorInput') as HTMLInputElement).value;
        ctx.lineWidth = lw;
        ctx.setLineDash([8, 8]);
        ctx.arc(centerX, centerY, maxRadius, 0, 2 * Math.PI);
        ctx.stroke();
    }

    // Draw halo radius circle
    if (analysis.haloRadiusData && elements.showHaloRadiusCircleCheckbox.checked) {
        ctx.beginPath();
        ctx.strokeStyle = (document.getElementById('haloLineColorInput') as HTMLInputElement).value;
        ctx.lineWidth = lw;
        ctx.setLineDash([4, 4]);
        ctx.arc(centerX, centerY, analysis.haloRadiusData.radius, 0, 2 * Math.PI);
        ctx.stroke();
    }
    
    ctx.setLineDash([]);
    ctx.lineWidth = lw / 2;
    
    const drawLabel = (text: string, x: number, y: number, color: string) => {
        const rulerFont = elements.rulerFontFamily.value || 'Inter';
        const fontSize = parseInt(elements.rulerFontSize.value, 10) || 60;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${fontSize}px "${rulerFont}"`;
        const textMetrics = ctx.measureText(text);
        const padding = 6;
        ctx.fillStyle = 'rgba(20, 20, 20, 0.75)';
        ctx.beginPath();
        (ctx as any).roundRect(x - textMetrics.width / 2 - padding, y - fontSize / 2 - padding, textMetrics.width + 2 * padding, fontSize + 2 * padding, [8]);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
    };

    // Draw rulers
    if (elements.rulerCheckbox.checked) {
        if (maxRadiusData) {
            const angle = maxRadiusData.angle;
            const startP = findContourPointAtAngle(analysis.manualDrawnPath, { x: centerX, y: centerY }, angle);
            const endX = centerX + maxRadius * Math.cos(angle), endY = centerY + maxRadius * Math.sin(angle);
            ctx.beginPath();
            ctx.strokeStyle = (document.getElementById('maxLineColorInput') as HTMLInputElement).value;
            ctx.moveTo(startP.x, startP.y);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            if (analysis.lastAnalysisResult.maxRadiusText) drawLabel(analysis.lastAnalysisResult.maxRadiusText, (startP.x + endX) / 2, (startP.y + endY) / 2, (document.getElementById('maxLineColorInput') as HTMLInputElement).value);
        }
        if (analysis.haloRadiusData) {
            const angle = analysis.haloRadiusData.angle;
            const startP = findContourPointAtAngle(analysis.manualDrawnPath, { x: centerX, y: centerY }, angle);
            const endX = centerX + analysis.haloRadiusData.radius * Math.cos(angle), endY = centerY + analysis.haloRadiusData.radius * Math.sin(angle);
            ctx.beginPath();
            ctx.strokeStyle = (document.getElementById('haloLineColorInput') as HTMLInputElement).value;
            ctx.moveTo(startP.x, startP.y);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            if (analysis.lastAnalysisResult.haloRadiusText) drawLabel(analysis.lastAnalysisResult.haloRadiusText, (startP.x + endX) / 2, (startP.y + endY) / 2, (document.getElementById('haloLineColorInput') as HTMLInputElement).value);
        }
    }
    
    // Draw migration margin
    if (analysis.migrationMarginPath.length > 1) {
        ctx.strokeStyle = (document.getElementById('marginLineColorInput') as HTMLInputElement).value;
        ctx.lineWidth = lw;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(analysis.migrationMarginPath[0].x, analysis.migrationMarginPath[0].y);
        for (let i = 1; i < analysis.migrationMarginPath.length; i++) ctx.lineTo(analysis.migrationMarginPath[i].x, analysis.migrationMarginPath[i].y);
        if (analysis.migrationMarginPath.length > 2) ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

/**
 * Main drawing loop for the results canvas. Applies zoom and pan transformations.
 */
function drawResults() {
    const analysis = getActiveAnalysis();
    if (!analysis || !analysis.originalImage || state.isRedrawing || !elements.resultCanvas) return;
    state.isRedrawing = true;

    elements.resultCanvas.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
    const resultCtx = elements.resultCanvas.getContext('2d');
    if (!resultCtx) { state.isRedrawing = false; return; }
    
    resultCtx.save();
    resultCtx.setTransform(1, 0, 0, 1, 0, 0);
    resultCtx.clearRect(0, 0, elements.resultCanvas.width, elements.resultCanvas.height);
    
    drawForSaving(resultCtx);
    
    // Draw the interactive user path (e.g., while drawing a contour)
    if (state.drawnPath.length > 1) {
        resultCtx.strokeStyle = 'rgba(45, 212, 191, 0.9)';
        resultCtx.lineWidth = 2;
        resultCtx.beginPath();
        resultCtx.moveTo(state.drawnPath[0].x, state.drawnPath[0].y);
        for (let i = 1; i < state.drawnPath.length; i++) resultCtx.lineTo(state.drawnPath[i].x, state.drawnPath[i].y);
        resultCtx.stroke();
    }
    
    resultCtx.restore();
    state.isRedrawing = false;
}

/**
 * Resets the canvas zoom and pan to fit the image within the container for the current analysis.
 */
export function resetView() {
    const analysis = getActiveAnalysis();
    if (!analysis || !analysis.originalImage || !elements.canvasContainer) return;
    const containerRect = elements.canvasContainer.getBoundingClientRect();
    if (containerRect.width === 0 || containerRect.height === 0) return;

    const scaleX = (containerRect.width - 40) / analysis.originalImage.width;
    const scaleY = (containerRect.height - 40) / analysis.originalImage.height;
    state.zoom = Math.min(scaleX, scaleY);
    
    const viewWidth = analysis.originalImage.width * state.zoom;
    const viewHeight = analysis.originalImage.height * state.zoom;
    state.pan = {
        x: (containerRect.width - viewWidth) / 2,
        y: (containerRect.height - viewHeight) / 2
    };
    
    requestRedraw();
}

/**
 * Zooms the canvas to a new level, optionally pivoting around a specific point.
 * @param newZoomLevel The target zoom level.
 * @param pivot The {x, y} coordinates of the zoom pivot point (in container space).
 */
export function zoomTo(newZoomLevel: number, pivot?: { x: number; y: number; }) {
    if (!elements.canvasContainer) return;
    const newZoom = Math.max(0.1, Math.min(20, newZoomLevel));
    const containerRect = elements.canvasContainer.getBoundingClientRect();
    const pivotPoint = pivot ?? { x: containerRect.width / 2, y: containerRect.height / 2 };
    const zoomFactor = newZoom / state.zoom;
    
    state.pan.x = pivotPoint.x - (pivotPoint.x - state.pan.x) * zoomFactor;
    state.pan.y = pivotPoint.y - (pivotPoint.y - state.pan.y) * zoomFactor;
    state.zoom = newZoom;
    
    requestRedraw();
}

/**
 * Converts mouse event coordinates from screen space to image space.
 * @param evt The mouse event.
 * @returns The {x, y} coordinates relative to the image.
 */
export function getMousePos(evt: MouseEvent): { x: number; y: number } {
    if (!elements.canvasContainer) return { x: 0, y: 0 };
    const containerRect = elements.canvasContainer.getBoundingClientRect();
    const xOnContainer = evt.clientX - containerRect.left;
    const yOnContainer = evt.clientY - containerRect.top;
    
    return {
        x: (xOnContainer - state.pan.x) / state.zoom,
        y: (yOnContainer - state.pan.y) / state.zoom
    };
}

/**
 * Paints a line on a target canvas, with an option for erasing.
 * @param startPos Starting position {x, y}.
 * @param endPos Ending position {x, y}.
 * @param targetCanvas The canvas element to paint on.
 * @param isErasing If true, removes content instead of adding it.
 */
export function paintOnCanvas(startPos: { x: number; y: number }, endPos: { x: number; y: number }, targetCanvas: HTMLCanvasElement, isErasing = false) {
    const ctx = targetCanvas.getContext('2d');
    if (!ctx) return;

    ctx.save();

    if (isErasing) {
        ctx.globalCompositeOperation = 'destination-out';
    } else {
        // Brush strokes are always solid; the layer's opacity is handled during rendering.
        ctx.strokeStyle = `rgba(45, 212, 191, 1)`;
    }

    ctx.beginPath();
    ctx.lineWidth = Number(elements.brushSizeInput.value);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(startPos.x, startPos.y);
    ctx.lineTo(endPos.x, endPos.y);
    ctx.stroke();

    ctx.restore();

    requestRedraw();
}
