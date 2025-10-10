import { GoogleGenAI, Type } from '@google/genai';
import { loadingIndicator, processedImageCanvas, radiusResult } from './elements';
import { state, getActiveAnalysis } from './state';
import { calculateMorphologicalMetrics, createRadialContour, simplifyPath, getConvexHull } from './utils';
import { setMode, completeStepAndAdvance, setSaveButtonState, updateUIMode, goToWorkflowStep, updateCellCounters } from './ui';
import { updateResultsDisplay, calculateAndStoreMigrationMetrics } from './results';
import { requestRedraw } from './canvas';
import { showToast } from './utils';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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
    
    // Calculate metrics based on scientific paper formulas and texture stats
    const morphology = calculateMorphologicalMetrics(analysis.manualDrawnPath, processedImageCanvas);
    
    // Find the center from the path for radius calculations
    let sumX = 0, sumY = 0;
    analysis.manualDrawnPath.forEach(p => { sumX += p.x; sumY += p.y; });
    const centerX = sumX / analysis.manualDrawnPath.length;
    const centerY = sumY / analysis.manualDrawnPath.length;
    const coreRadius = analysis.manualDrawnPath.reduce((acc, p) => acc + Math.hypot(p.x - centerX, p.y - centerY), 0) / analysis.manualDrawnPath.length;

    const newCoreAnalysis = {
        centerX,
        centerY,
        coreRadius,
        cellCount: analysis.detectedParticles.length,
        morphology
    };

    // Merge new core data with existing analysis data to preserve radii on project load
    analysis.lastAnalysisResult = { ...analysis.lastAnalysisResult, ...newCoreAnalysis };

    updateResultsDisplay();
    requestRedraw();
    setSaveButtonState(false);
    
    // Enable next step buttons
    [state.analysisElements.setHaloPointButton, state.analysisElements.setMigrationPointButton, state.analysisElements.refineContourButton, state.analysisElements.drawMarginButton, state.analysisElements.smoothMarginButton, state.analysisElements.clearMarginButton, state.analysisElements.paintMarginButton].forEach(b => {
        if (b) (b as HTMLButtonElement).disabled = false;
    });

    if (analysis.currentAnalysisStep === 1) {
        completeStepAndAdvance();
    }
}

/**
 * Uses the Gemini API to refine the user-drawn contour of the spheroid for the current analysis.
 */
export async function refineContour() {
    const analysis = getActiveAnalysis();
    if (!analysis || analysis.manualDrawnPath.length < 3) return;
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');

    try {
        const imagePart = {
            inlineData: {
                mimeType: 'image/jpeg',
                data: processedImageCanvas.toDataURL('image/jpeg').split(',')[1],
            },
        };

        const textPart = {
            text: `You are an expert in biomedical image analysis. Given the following image and a rough user-drawn contour of the central spheroid, refine the contour to follow the spheroid's edge more precisely. The user-drawn points are: ${JSON.stringify(analysis.manualDrawnPath)}. Return only a JSON array of the refined points in the format '[{"x": number, "y": number}, ...]', with the same number of points as the input. The first and last point should be the same if it is a closed path.`,
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            x: { type: Type.NUMBER },
                            y: { type: Type.NUMBER },
                        },
                        required: ['x', 'y'],
                    },
                },
            },
        });
        
        const jsonStr = response.text.trim();
        const refinedPath = JSON.parse(jsonStr);

        if (Array.isArray(refinedPath) && refinedPath.length > 0 && 'x' in refinedPath[0] && 'y' in refinedPath[0]) {
            analysis.manualDrawnPath = refinedPath;
            analyzeSpheroid();
        } else {
            throw new Error('Invalid path format received from API.');
        }

    } catch (error) {
        console.error("Error refining contour with Gemini:", error);
        showToast("Falha no ajuste com IA. Tente novamente.");
    } finally {
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
    }
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
            analyzeSpheroid();
        }
        setMode(null);
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
    });
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
    const step = 2;
    for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
            if (imageData[(y * width + x) * 4 + 3] > 0) paintedPoints.push({ x, y });
        }
    }
    if (paintedPoints.length < 20) {
        showToast("Área pintada pequena demais.");
        return;
    }
    let sumX = 0, sumY = 0;
    for (const p of paintedPoints) {
        sumX += p.x;
        sumY += p.y;
    }
    const center = { x: sumX / paintedPoints.length, y: sumY / paintedPoints.length };
    const contour = createRadialContour(paintedPoints, center);
    analysis.manualDrawnPath = simplifyPath(contour, 1.5);
    if (analysis.manualDrawnPath.length > 3) analysis.manualDrawnPath.push(analysis.manualDrawnPath[0]);
    ctx.clearRect(0, 0, width, height);
    setMode(null);
    analyzeSpheroid();
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
    if (analysis.currentAnalysisStep === 4) {
        // Don't auto-advance on the last step, wait for confirm button
    }
}
