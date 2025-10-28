import { loadingIndicator, processedImageCanvas, aiToleranceInput, radiusResult, brushSizeInput, paintSpheroidCanvas } from './elements';
import { state, getActiveAnalysis, ImageAnalysisState } from './state';
import { calculateMorphologicalMetrics, createRadialContour, simplifyPath, getConvexHull, showToast, findContourPointAtAngle, smoothPath } from './utils';
import { setMode, completeStepAndAdvance, setSaveButtonState, updateUIMode, goToWorkflowStep, updateCellCounters } from './ui';
import { calculateAndStoreMigrationMetrics, updateResultsDisplay } from './results';
import { requestRedraw, paintOnCanvas } from './canvas';

// --- HISTORY MANAGEMENT (Undo/Redo) ---

function captureState(analysis: ImageAnalysisState) {
    // Use structuredClone for a robust deep copy of the state
    return structuredClone({
        manualDrawnPath: analysis.manualDrawnPath,
        migrationMarginPath: analysis.migrationMarginPath,
        detectedParticles: analysis.detectedParticles,
        haloRadiusData: analysis.haloRadiusData,
        lastAnalysisResult: analysis.lastAnalysisResult,
        isCompleted: analysis.isCompleted,
        currentAnalysisStep: analysis.currentAnalysisStep,
    });
}

function restoreState(analysis: ImageAnalysisState, historyState: any) {
    analysis.manualDrawnPath = historyState.manualDrawnPath;
    analysis.migrationMarginPath = historyState.migrationMarginPath;
    analysis.detectedParticles = historyState.detectedParticles;
    analysis.haloRadiusData = historyState.haloRadiusData;
    analysis.lastAnalysisResult = historyState.lastAnalysisResult;
    analysis.isCompleted = historyState.isCompleted;
    analysis.currentAnalysisStep = historyState.currentAnalysisStep;

    // Trigger all necessary UI updates
    updateResultsDisplay();
    updateCellCounters();
    goToWorkflowStep(analysis.currentAnalysisStep);
    state.isPaintLayerDirty = true; // Mark cell layer for redraw
    requestRedraw();
}

/**
 * Saves the current state of the active analysis to its history stack.
 */
export function pushToHistory() {
    const analysis = getActiveAnalysis();
    if (!analysis) return;

    // Any action that modifies the analysis state means it's no longer "completed".
    analysis.isCompleted = false;
    // Mark as unsaved so it gets added to cumulative results on next auto-save trigger.
    analysis.isCurrentAnalysisSaved = false;

    // If we've undone actions and now make a new one, clear the "redo" history
    if (analysis.historyIndex < analysis.actionHistory.length - 1) {
        analysis.actionHistory.splice(analysis.historyIndex + 1);
    }
    
    analysis.actionHistory.push(captureState(analysis));
    analysis.historyIndex = analysis.actionHistory.length - 1;

    // Optional: Limit history size to prevent excessive memory usage
    if (analysis.actionHistory.length > 50) {
        analysis.actionHistory.shift();
        analysis.historyIndex--; // Adjust index since we removed the first item
    }
}

/**
 * Initializes the history for the currently active analysis, typically after loading a new image.
 */
export function initializeHistoryForAnalysis() {
    const analysis = getActiveAnalysis();
    if (!analysis) return;
    analysis.actionHistory = [captureState(analysis)];
    analysis.historyIndex = 0;
}

/**
 * Reverts the active analysis to the previous state in its history.
 */
export function undo() {
    const analysis = getActiveAnalysis();
    if (!analysis || analysis.historyIndex <= 0) return;

    analysis.historyIndex--;
    restoreState(analysis, analysis.actionHistory[analysis.historyIndex]);
    showToast('Ação desfeita');
}

/**
 * Advances the active analysis to the next state in its history.
 */
export function redo() {
    const analysis = getActiveAnalysis();
    if (!analysis || analysis.historyIndex >= analysis.actionHistory.length - 1) return;

    analysis.historyIndex++;
    restoreState(analysis, analysis.actionHistory[analysis.historyIndex]);
    showToast('Ação refeita');
}

// --- ANALYSIS FUNCTIONS ---

/**
 * Analyzes the spheroid based on the manually drawn or painted path.
 * Calculates core metrics and updates the display for the current analysis.
 */
export function analyzeSpheroid() {
    const analysis = getActiveAnalysis();
    if (!analysis || !analysis.originalImage) return;

    analysis.isCurrentAnalysisSaved = false;
    state.isPaintLayerDirty = true;

    if (analysis.manualDrawnPath.length < 3) {
        if (radiusResult) radiusResult.innerHTML = '<p class="text-yellow-400">Contorno não definido ou inválido.</p>';
        return;
    }
    
    const morphologyResult = calculateMorphologicalMetrics(analysis.manualDrawnPath, processedImageCanvas);
    const { centroid, ...morphology } = morphologyResult;

    if (!centroid || centroid.x === 0 || centroid.y === 0) {
        console.error("Failed to calculate spheroid centroid from pixel area.");
        if (radiusResult) radiusResult.innerHTML = '<p class="text-red-500">Erro: Não foi possível encontrar o centro do esferoide.</p>';
        return;
    }

    const { x: centerX, y: centerY } = centroid;
    const coreRadius = analysis.manualDrawnPath.reduce((acc, p) => acc + Math.hypot(p.x - centerX, p.y - centerY), 0) / analysis.manualDrawnPath.length;

    const newCoreAnalysis = { centerX, centerY, coreRadius, cellCount: analysis.detectedParticles.length, morphology };
    analysis.lastAnalysisResult = { ...analysis.lastAnalysisResult, ...newCoreAnalysis };

    updateResultsDisplay();
    requestRedraw();
    setSaveButtonState(false);
    
    [state.analysisElements.setHaloPointButton, state.analysisElements.setMigrationPointButton, state.analysisElements.refineContourButton, state.analysisElements.drawMarginButton, state.analysisElements.smoothMarginButton, state.analysisElements.clearMarginButton, state.analysisElements.paintMarginButton].forEach(b => {
        if (b) (b as HTMLButtonElement).disabled = false;
    });

    if (analysis.currentAnalysisStep === 0) {
        completeStepAndAdvance();
    }
    pushToHistory();
}

/**
 * Refines a user-drawn contour by aligning it to the highest gradient edge in the image.
 * This function implements the user-specified algorithm.
 */
export function refineContour() {
    const analysis = getActiveAnalysis();
    if (!analysis || analysis.manualDrawnPath.length < 3) return;
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');

    requestAnimationFrame(() => {
        try {
            const { width, height } = processedImageCanvas;
            const ctx = processedImageCanvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) throw new Error("Could not get canvas context.");
            
            const imageData = ctx.getImageData(0, 0, width, height).data;

            // Helper to get brightness of a pixel (assumes grayscale, uses R channel)
            const getBrightness = (x: number, y: number) => {
                x = Math.round(x);
                y = Math.round(y);
                if (x < 0 || x >= width || y < 0 || y >= height) return 0; // Return black for out-of-bounds
                return imageData[(y * width + x) * 4];
            };

            const centroDoObjeto = analysis.lastAnalysisResult.centerX 
                ? { x: analysis.lastAnalysisResult.centerX, y: analysis.lastAnalysisResult.centerY }
                : calculateMorphologicalMetrics(analysis.manualDrawnPath, processedImageCanvas).centroid;

            if (!centroDoObjeto || (centroDoObjeto.x === 0 && centroDoObjeto.y === 0)) {
                throw new Error("Could not determine object center.");
            }

            const novoContorno: {x: number, y: number}[] = [];
            const contornoInicial = analysis.manualDrawnPath;
            // Use the UI slider for search distance, as requested implicitly
            const DISTANCIA_BUSCA = parseInt(aiToleranceInput.value, 10) || 20;

            for (const P of contornoInicial) {
                // a. Calculate Normal Vector
                const dx = P.x - centroDoObjeto.x;
                const dy = P.y - centroDoObjeto.y;
                const mag = Math.hypot(dx, dy);

                if (mag === 0) {
                    novoContorno.push(P);
                    continue; // Skip if point is at the center
                }
                const n_unitario = { x: dx / mag, y: dy / mag };

                let gradienteMaximo = -1;
                let melhorPonto = P;
                
                // b. Define search line & c. Find Max Gradient
                for (let i = -DISTANCIA_BUSCA; i < DISTANCIA_BUSCA; i++) {
                    const ponto_de_amostra_1 = {
                        x: P.x + i * n_unitario.x,
                        y: P.y + i * n_unitario.y
                    };
                    const ponto_de_amostra_2 = {
                        x: P.x + (i + 1) * n_unitario.x,
                        y: P.y + (i + 1) * n_unitario.y
                    };
                    
                    const gradiente = Math.abs(getBrightness(ponto_de_amostra_1.x, ponto_de_amostra_1.y) - getBrightness(ponto_de_amostra_2.x, ponto_de_amostra_2.y));

                    if (gradiente > gradienteMaximo) {
                        gradienteMaximo = gradiente;
                        melhorPonto = ponto_de_amostra_1;
                    }
                }
                // d. Store Best Point
                novoContorno.push(melhorPonto);
            }
            
            // Apply smoothing to reduce jagged edges
            const finalPath = smoothPath(novoContorno, 7);

            // Finalization
            if (finalPath.length > 2) {
                analysis.manualDrawnPath = finalPath;
                analyzeSpheroid(); // Recalculates metrics and also pushes to history
            } else {
                 throw new Error("Contour refinement resulted in an invalid path.");
            }

        } catch (error) {
            console.error("Error during contour refinement:", error);
            showToast("Falha no ajuste do contorno.");
        } finally {
            if (loadingIndicator) loadingIndicator.classList.add('hidden');
        }
    });
}


/**
 * Automatically segments a region based on color similarity for the current analysis.
 * @param startPos The starting position {x, y} of the magic wand.
 */
export function runMagicWand(startPos: { x: number; y: number; }) {
    const analysis = getActiveAnalysis();
    if (!analysis) return;
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');

    requestAnimationFrame(() => {
        try {
            const { width, height } = processedImageCanvas;
            const ctx = processedImageCanvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;
            const imageData = ctx.getImageData(0, 0, width, height).data;
            const tolerance = parseInt(state.magicWand.magicWandToleranceInput.value, 10);
            const startX = Math.floor(startPos.x);
            const startY = Math.floor(startPos.y);
            const startR = imageData[(startY * width + startX) * 4];
            const visited = new Uint8Array(width * height);
            const queue: { x: number; y: number; }[] = [{ x: startX, y: startY }];
            visited[startY * width + startX] = 1;
            let head = 0;
            const blobPixels: { x: number; y: number; }[] = [];
            while (head < queue.length) {
                const p = queue[head++];
                blobPixels.push(p);
                const neighbors = [{ x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 }];
                for (const n of neighbors) {
                    if (n.x >= 0 && n.x < width && n.y >= 0 && n.y < height) {
                        const nLinearIndex = n.y * width + n.x;
                        if (visited[nLinearIndex] === 0) {
                            visited[nLinearIndex] = 1;
                            const dR = startR - imageData[nLinearIndex * 4];
                            if ((dR * dR) < tolerance * tolerance) queue.push(n);
                        }
                    }
                }
            }
            if (blobPixels.length > 20) {
                const contour = createRadialContour(blobPixels, { x: startX, y: startY });
                analysis.manualDrawnPath = simplifyPath(contour, 1.5);
                if (analysis.manualDrawnPath.length > 3) analysis.manualDrawnPath.push(analysis.manualDrawnPath[0]);
                analyzeSpheroid(); // This pushes to history
            }
        } catch (error) {
            console.error("Magic wand failed:", error);
            showToast("Falha na seleção mágica.");
        } finally {
            setMode(null);
            if (loadingIndicator) loadingIndicator.classList.add('hidden');
        }
    });
}

/**
 * Handles painting or erasing on the canvas for spheroid editing.
 * This function ONLY affects the temporary paint layer, not the data model directly.
 * @param startPos The starting point of the brush stroke.
 * @param endPos The ending point of the brush stroke.
 */
export function handleSpheroidEdit(startPos: { x: number; y: number }, endPos: { x: number; y: number }) {
    const analysis = getActiveAnalysis();
    if (!analysis) return;

    // All editing actions (painting and erasing) are performed on the temporary canvas.
    paintOnCanvas(startPos, endPos, paintSpheroidCanvas, state.isErasing);
    
    requestRedraw();
}


/**
 * Processes the painted area on the spheroid canvas to define the spheroid contour for the current analysis.
 */
export function processPaintedSpheroid() {
    const analysis = getActiveAnalysis();
    if (!analysis) return;

    const ctx = state.paint.paintSpheroidCanvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = state.paint.paintSpheroidCanvas;
    const imageData = ctx.getImageData(0, 0, width, height).data;
    
    const paintedPoints: { x: number, y: number }[] = [];
    const step = 2; // Sample pixels for performance
    for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
            // Check the alpha channel to see if pixel is painted
            if (imageData[(y * width + x) * 4 + 3] > 0) {
                paintedPoints.push({ x, y });
            }
        }
    }

    // If the user erased everything or the painted area is too small, check if a contour path still exists (from previous erasing)
    if (paintedPoints.length < 20) {
        // If there's no path either, truly clear it.
        if (analysis.manualDrawnPath.length < 3) {
             analysis.manualDrawnPath = [];
        }
        // Otherwise, we keep the existing (potentially modified) path and analyze it.
    } else {
        // Otherwise, generate a new contour from the painted area.
        let sumX = 0, sumY = 0;
        for (const p of paintedPoints) { sumX += p.x; sumY += p.y; }
        const center = { x: sumX / paintedPoints.length, y: sumY / paintedPoints.length };
        const contour = createRadialContour(paintedPoints, center);
        analysis.manualDrawnPath = simplifyPath(contour, 1.5);
        if (analysis.manualDrawnPath.length > 3) {
            analysis.manualDrawnPath.push({ ...contour[0] });
        }
    }
    
    // Always clear the temporary canvas after processing.
    ctx.clearRect(0, 0, width, height);
    
    // Set the mode back to neutral and run the analysis on the new path (or empty path).
    setMode(null);
    analyzeSpheroid(); // This will update results and push the new state to history.
}


/**
 * Processes the painted area to define the migration margin for the current analysis.
 */
export function processPaintedMargin() {
    const analysis = getActiveAnalysis();
    if (!analysis) return;

    const ctx = state.paint.paintSpheroidCanvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = state.paint.paintSpheroidCanvas;
    const imageData = ctx.getImageData(0, 0, width, height).data;
    const paintedPoints: {x: number, y: number}[] = [];
    const step = 2;
    for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
            if (imageData[(y * width + x) * 4 + 3] > 0) {
                paintedPoints.push({ x, y });
            }
        }
    }
    if (paintedPoints.length < 20) {
        showToast("Área pintada pequena demais.");
        return;
    }
    const hull = getConvexHull(paintedPoints);
    analysis.migrationMarginPath = hull;
    if (analysis.migrationMarginPath.length > 2) {
        analysis.migrationMarginPath.push(analysis.migrationMarginPath[0]);
    }
    ctx.clearRect(0, 0, width, height);
    setMode(null);
    updateResultsDisplay();
    requestRedraw();
    pushToHistory();
    if (analysis.currentAnalysisStep === 3) {
        // Don't auto-advance on the last step, wait for confirm button
    }
}