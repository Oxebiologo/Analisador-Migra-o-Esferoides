import { state, getActiveTab, getActiveAnalysis, ImageAnalysisState } from './state';
import * as elements from './elements';
import { requestRedraw, resetView } from './canvas';
import { convolve, isImageGrayscale } from './utils';
import { updateUIMode, activateStepWorkflow, updateFullscreenButton, goToWorkflowStep, updateCellCounters, setSaveButtonState, updateCumulativeResultsDisplay } from './ui';
import { addToCumulativeResults, updateResultsDisplay } from './results';
import { initializeHistoryForAnalysis } from './analysis';

/**
 * Resets the UI for a tab that has no more images.
 */
function resetTabToEmpty() {
    const activeTab = getActiveTab();
    if (!activeTab) return;
    activeTab.currentAnalysisIndex = -1;
    
    if (elements.initialMessage) elements.initialMessage.style.removeProperty('display');
    if (elements.resultsContainer) elements.resultsContainer.classList.add('hidden');
    if (elements.resetButton) elements.resetButton.disabled = true;
    setSaveButtonState(true);
    if (elements.imageNavControls) elements.imageNavControls.classList.add('hidden');
    if (elements.mainImageNav) elements.mainImageNav.classList.add('hidden');
    document.getElementById('zoom-controls')?.classList.add('hidden');
    if (elements.fileNameDisplay) elements.fileNameDisplay.textContent = 'Nenhuma imagem carregada';
    
    elements.allCanvases.forEach(c => c.getContext('2d')?.clearRect(0, 0, c.width, c.height));
    updateResultsDisplay(); // Clear results panel
    updateCellCounters(); // Reset cell counter display
}

/**
 * Deletes the currently viewed image from the active tab.
 */
export function deleteCurrentImage() {
    const activeTab = getActiveTab();
    if (!activeTab || activeTab.analyses.length === 0) return;

    const indexToRemove = activeTab.currentAnalysisIndex;
    const deletedFilename = activeTab.analyses[indexToRemove].originalFilename;
    
    activeTab.analyses.splice(indexToRemove, 1);
    
    // Also remove from cumulative results if it was saved
    const resultIndex = activeTab.cumulativeResults.findIndex(r => r.filename === deletedFilename);
    if (resultIndex > -1) {
        activeTab.cumulativeResults.splice(resultIndex, 1);
        updateCumulativeResultsDisplay();
    }

    if (activeTab.analyses.length === 0) {
        resetTabToEmpty();
    } else {
        const newIndex = Math.min(indexToRemove, activeTab.analyses.length - 1);
        loadImageByIndex(newIndex);
    }
}


/**
 * Loads and processes a single image analysis state.
 * @param analysis The ImageAnalysisState object to process.
 */
function processAnalysis(analysis: ImageAnalysisState) {
    if (!analysis.originalImage) return;

    elements.allCanvases.forEach(c => {
        if (c) {
            c.width = analysis.originalImage!.width;
            c.height = analysis.originalImage!.height;
        }
    });

    const originalCtx = elements.originalCanvas.getContext('2d');
    if (originalCtx) {
        originalCtx.drawImage(analysis.originalImage, 0, 0);
    }

    // Check if the image is grayscale and auto-advance if it is.
    if (isImageGrayscale(elements.originalCanvas)) {
        analysis.is8Bit = true;
    }
    
    if (elements.bitStatus) {
        if (analysis.is8Bit) {
            elements.bitStatus.textContent = '8-bit';
            elements.bitStatus.className = 'text-xs font-bold ml-auto px-2 py-0.5 rounded-full bg-teal-500/80 text-white';
            if (elements.convertTo8BitButton) (elements.convertTo8BitButton as HTMLButtonElement).disabled = true;
        } else {
            elements.bitStatus.textContent = 'Cor';
            elements.bitStatus.className = 'text-xs font-bold ml-auto px-2 py-0.5 rounded-full bg-amber-500/80 text-white';
            if (elements.convertTo8BitButton) (elements.convertTo8BitButton as HTMLButtonElement).disabled = false;
        }
    }
    
    // Reset view state and apply filters for the loaded image
    if (elements.resetButton) elements.resetButton.disabled = false;
    document.getElementById('zoom-controls')?.classList.remove('hidden');

    applyImageFilters(analysis); // This will also trigger a redraw
    resetView();
    updateUIMode();
    updateFullscreenButton(!!document.fullscreenElement);
    
    // Robustly handle workflow state
    if (analysis.isCompleted) {
        // If the analysis is marked as completed, go to the final step's view
        // The goToWorkflowStep function will handle showing the "completed" state.
        goToWorkflowStep(4);
    } else {
        // If it's a "fresh" analysis at step 0 and the image is already 8-bit, skip to step 1.
        if (analysis.currentAnalysisStep === 0 && analysis.is8Bit) {
            analysis.currentAnalysisStep = 1; 
        }
        // Restore workflow to its last known step for incomplete analyses.
        goToWorkflowStep(analysis.currentAnalysisStep);
    }

    const initialMessage = document.getElementById('initial-message');
    if (initialMessage) initialMessage.style.display = 'none';
    
    // Ensure results are shown when loading a project or switching images
    if (elements.resultsContainer) elements.resultsContainer.classList.remove('hidden');
    updateResultsDisplay();
}

/**
 * Loads an image from the active tab's analyses array by its index.
 * @param index The index of the analysis to load.
 */
export function loadImageByIndex(index: number) {
    const activeTab = getActiveTab();
    if (!activeTab || index < 0 || index >= activeTab.analyses.length) return;

    addToCumulativeResults(); // Save previous analysis before switching
    activeTab.currentAnalysisIndex = index;
    const analysis = activeTab.analyses[index];
    initializeHistoryForAnalysis();

    // If switching to an unedited image that is not completed, automatically open the analysis workflow
    if (analysis.manualDrawnPath.length === 0 && !analysis.isCompleted) {
        activateStepWorkflow();
    }

    if (elements.fileNameDisplay) elements.fileNameDisplay.textContent = analysis.originalFilename;
    
    const showNav = activeTab.analyses.length > 1;
    if (elements.imageNavControls) elements.imageNavControls.classList.toggle('hidden', !showNav);
    if (elements.mainImageNav) elements.mainImageNav.classList.toggle('hidden', !showNav);
    
    const navText = `${index + 1} de ${activeTab.analyses.length}: ${analysis.originalFilename}`;
    const navTitle = analysis.originalFilename;
    
    if (elements.imageNavStatus) {
        elements.imageNavStatus.textContent = navText;
        elements.imageNavStatus.title = navTitle;
    }
    if (elements.mainImageNavStatus) {
        elements.mainImageNavStatus.textContent = navText;
        elements.mainImageNavStatus.title = navTitle;
    }


    if (elements.prevImageButton) elements.prevImageButton.disabled = (index === 0);
    if (elements.mainPrevImageButton) elements.mainPrevImageButton.disabled = (index === 0);
    
    if (elements.nextImageButton) elements.nextImageButton.disabled = (index === activeTab.analyses.length - 1);
    if (elements.mainNextImageButton) elements.mainNextImageButton.disabled = (index === activeTab.analyses.length - 1);

    const loadImageAction = (image: HTMLImageElement) => {
        analysis.originalImage = image;
        processAnalysis(analysis);
        updateCellCounters(); // Explicitly update cell counter UI on load
    };

    if (analysis.originalImage) {
        loadImageAction(analysis.originalImage);
    } else {
        loadImagePromise(analysis.file)
            .then(loadImageAction)
            .catch(err => {
                console.error("Error loading image:", err);
                if (elements.radiusResult) elements.radiusResult.innerHTML = '<p class="text-red-400">Erro ao ler arquivo.</p>';
            });
    }
}

/**
 * Applies all selected image adjustments to the processed canvas for a given analysis.
 * @param analysis The ImageAnalysisState to apply filters for.
 */
export function applyImageFilters(analysis: ImageAnalysisState) {
    if (!analysis.originalImage || !elements.processedImageCanvas || !elements.originalCanvas) return;
    
    const ctx = elements.processedImageCanvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = elements.originalCanvas;
    ctx.drawImage(elements.originalCanvas, 0, 0);
    
    let imageData = ctx.getImageData(0, 0, width, height);
    let data = imageData.data;

    if (state.backgroundColorToSubtract) {
        const tol = parseInt(elements.backgroundToleranceInput.value, 10), tolSq = tol * tol;
        const { r: bgR, g: bgG, b: bgB } = state.backgroundColorToSubtract;
        for (let i = 0; i < data.length; i += 4) {
            const dR = data[i] - bgR, dG = data[i + 1] - bgG, dB = data[i + 2] - bgB;
            if ((dR * dR + dG * dG + dB * dB) < tolSq) data[i] = data[i + 1] = data[i + 2] = 0;
        }
    }
    
    const brightness = parseInt(elements.brightnessInput.value, 10), contrast = parseInt(elements.contrastInput.value, 10);
    const sharpness = parseInt(elements.sharpnessInput.value, 10), highlights = parseInt(elements.highlightsInput.value, 10);
    const shadows = parseInt(elements.shadowsInput.value, 10), whites = parseInt(elements.whitesInput.value, 10);
    const blacks = parseInt(elements.blacksInput.value, 10), invert = elements.invertCheckbox.checked;
    const grayscale = elements.grayscaleCheckbox.checked || analysis.is8Bit;
    const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    
    for (let i = 0; i < data.length; i += 4) {
        let r = data[i], g = data[i + 1], b = data[i + 2];
        if (grayscale) { const lum = 0.299 * r + 0.587 * g + 0.114 * b; r = g = b = lum; }
        if (invert) { r = 255 - r; g = 255 - g; b = 255 - b; }
        if (highlights > 0) { const t = highlights / 100; r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
        if (highlights < 0) { const t = -highlights / 100; r *= 1 - t; g *= 1 - t; b *= 1 - t; }
        if (shadows > 0) { const t = shadows / 100; r = r * (1 - t) + 255 * t * (r/255)**2; g = g * (1-t) + 255 * t * (g/255)**2; b = b * (1-t) + 255 * t * (b/255)**2; }
        if (shadows < 0) { const t = -shadows / 100; r -= r * t; g -= g * t; b -= b * t; }
        if (brightness !== 0) { r += brightness; g += brightness; b += brightness; }
        if (contrast !== 0) { r = contrastFactor * (r - 128) + 128; g = contrastFactor * (g - 128) + 128; b = contrastFactor * (b - 128) + 128; }
        if (blacks < whites) { const range = whites - blacks; r = 255 * (r - blacks) / range; g = 255 * (g - blacks) / range; b = 255 * (b - blacks) / range; }
        data[i] = Math.max(0, Math.min(255, r)); data[i + 1] = Math.max(0, Math.min(255, g)); data[i + 2] = Math.max(0, Math.min(255, b));
    }
    
    if (sharpness > 0) {
        const amount = sharpness / 50.0;
        const kernel = [0, -amount, 0, -amount, 1 + 4 * amount, -amount, 0, -amount, 0];
        imageData = convolve({ data, width, height }, kernel);
    }
    ctx.putImageData(imageData, 0, 0);

    if (elements.binarizeCheckbox.checked && (analysis.migrationMarginPath.length > 2 || analysis.lastAnalysisResult.maxRadius)) {
        const threshold = parseInt(elements.binaryThresholdInput.value, 10);
        const binarizedImageData = ctx.getImageData(0, 0, width, height);
        const binarizedData = binarizedImageData.data;
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = width; maskCanvas.height = height;
        const maskCtx = maskCanvas.getContext('2d');
        if (maskCtx) {
            if (analysis.migrationMarginPath.length > 2) {
                maskCtx.beginPath();
                maskCtx.moveTo(analysis.migrationMarginPath[0].x, analysis.migrationMarginPath[0].y);
                for (let i = 1; i < analysis.migrationMarginPath.length; i++) maskCtx.lineTo(analysis.migrationMarginPath[i].x, analysis.migrationMarginPath[i].y);
                maskCtx.closePath(); maskCtx.fillStyle = 'white'; maskCtx.fill();
            } else if (analysis.lastAnalysisResult.maxRadius) {
                 maskCtx.beginPath(); maskCtx.arc(analysis.lastAnalysisResult.centerX, analysis.lastAnalysisResult.centerY, analysis.lastAnalysisResult.maxRadius, 0, 2*Math.PI);
                 maskCtx.fillStyle = 'white'; maskCtx.fill();
            }
            if (analysis.manualDrawnPath.length > 2) {
                maskCtx.globalCompositeOperation = 'destination-out';
                maskCtx.beginPath();
                maskCtx.moveTo(analysis.manualDrawnPath[0].x, analysis.manualDrawnPath[0].y);
                for (let i = 1; i < analysis.manualDrawnPath.length; i++) maskCtx.lineTo(analysis.manualDrawnPath[i].x, analysis.manualDrawnPath[i].y);
                maskCtx.closePath(); maskCtx.fillStyle = 'white'; maskCtx.fill();
            }
            const maskData = maskCtx.getImageData(0, 0, width, height).data;
            for (let i = 0; i < binarizedData.length; i += 4) {
                 if (maskData[i+3] > 0) {
                    const lum = 0.299 * binarizedData[i] + 0.587 * binarizedData[i+1] + 0.114 * binarizedData[i+2];
                    const value = lum > threshold ? 255 : 0;
                    binarizedData[i] = binarizedData[i+1] = binarizedData[i+2] = value;
                }
            }
        }
        ctx.putImageData(binarizedImageData, 0, 0);
    }

    state.isPaintLayerDirty = true;
    requestRedraw();
}

/**
 * Resets all image adjustment inputs to their default values.
 */
export function resetImageAdjustments() {
    if (!elements.brightnessInput) return;
    elements.brightnessInput.value = '0'; (document.getElementById('brightnessNumber') as HTMLInputElement).value = '0';
    elements.contrastInput.value = '0'; (document.getElementById('contrastNumber') as HTMLInputElement).value = '0';
    elements.sharpnessInput.value = '0'; (document.getElementById('sharpnessNumber') as HTMLInputElement).value = '0';
    elements.highlightsInput.value = '0'; (document.getElementById('highlightsNumber') as HTMLInputElement).value = '0';
    elements.shadowsInput.value = '0'; (document.getElementById('shadowsNumber') as HTMLInputElement).value = '0';
    elements.whitesInput.value = '255'; (document.getElementById('whitesNumber') as HTMLInputElement).value = '255';
    elements.blacksInput.value = '0'; (document.getElementById('blacksNumber') as HTMLInputElement).value = '0';
    elements.invertCheckbox.checked = false;
    elements.binarizeCheckbox.checked = false;
    state.backgroundColorToSubtract = null;
    const bgPreview = document.getElementById('backgroundColorPreview') as HTMLElement;
    if (bgPreview) bgPreview.style.backgroundColor = '#000';
    elements.backgroundToleranceInput.value = '20'; (document.getElementById('backgroundToleranceNumber') as HTMLInputElement).value = '20';
    elements.binaryThresholdInput.value = '128'; (document.getElementById('binaryThresholdNumber') as HTMLInputElement).value = '128';
}

/**
 * Handles incoming files from drag-and-drop or file input for the active tab.
 * @param files A list of files to process.
 * @param mode Whether to 'replace' the current file list or 'add' to it.
 */
export function handleFiles(files: File[], mode: 'replace' | 'add') {
    const activeTab = getActiveTab();
    if (!activeTab) return;

    const newAnalyses = files.filter(f => f.type.startsWith('image/')).map(f => new ImageAnalysisState(f));
    if (newAnalyses.length === 0) return;

    if (mode === 'replace' || activeTab.analyses.length === 0) {
        activeTab.analyses = newAnalyses;
        activeTab.currentAnalysisIndex = 0;
    } else { // mode === 'add'
        const firstNewIndex = activeTab.analyses.length;
        activeTab.analyses.push(...newAnalyses);
        activeTab.currentAnalysisIndex = firstNewIndex;
    }

    const showNav = activeTab.analyses.length > 1;
    if (elements.imageNavControls) elements.imageNavControls.classList.toggle('hidden', !showNav);
    if (elements.mainImageNav) elements.mainImageNav.classList.toggle('hidden', !showNav);


    loadImageByIndex(activeTab.currentAnalysisIndex);
    activateStepWorkflow();
}

/**
 * Loads a file and returns a Promise that resolves with an HTMLImageElement.
 * This is a utility for background loading without affecting the main UI.
 * @param file The file to load.
 * @returns A promise that resolves to the loaded image element.
 */
export function loadImagePromise(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = (err) => reject(err);

        const fileType = file.name.split('.').pop()?.toLowerCase();
        if (fileType === 'tif' || fileType === 'tiff') {
            reader.onload = (e) => {
                if (!e.target?.result) return reject(new Error("Failed to read TIFF file."));
                try {
                    const tiff = new (window as any).Tiff({ buffer: e.target.result });
                    const canvas = tiff.toCanvas();
                    if (canvas) {
                        const image = new Image();
                        image.onload = () => resolve(image);
                        image.onerror = (err) => reject(err);
                        image.src = canvas.toDataURL();
                    } else {
                        reject(new Error("Failed to convert TIFF to canvas."));
                    }
                } catch (tiffError) {
                    reject(tiffError);
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            reader.onload = (e) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = (err) => reject(err);
                image.src = e.target?.result as string;
            };
            reader.readAsDataURL(file);
        }
    });
}


declare global {
    interface Window { Tiff: any; UTIF: any; }
}