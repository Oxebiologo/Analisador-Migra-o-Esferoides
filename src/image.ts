import { state, getActiveTab, getActiveAnalysis, ImageAnalysisState, defaultAdjustments, getEffectiveAdjustments, TabState } from './state';
import * as elements from './elements';
import { requestRedraw, resetView } from './canvas';
import { convolve, showToast } from './utils';
import { goToWorkflowStep, updateCellCounters, setSaveButtonState, updateCumulativeResultsDisplay, updateAdjustmentUI, activateStepWorkflow } from './ui';
import { addToCumulativeResults, updateResultsDisplay } from './results';
import { initializeHistoryForAnalysis } from './analysis';

/**
 * Loads an image from a File object into an HTMLImageElement.
 * Handles standard image types and TIFF images.
 * @param file The image file to load.
 * @returns A promise that resolves with the loaded HTMLImageElement.
 */
export function loadImagePromise(file: File): Promise<HTMLImageElement> {
    const isTiff = file.name.toLowerCase().endsWith('.tif') || file.name.toLowerCase().endsWith('.tiff');

    if (isTiff) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const buffer = e.target?.result as ArrayBuffer;
                    if (!buffer) {
                        return reject(new Error("Falha ao ler o buffer do arquivo TIFF."));
                    }
                    const ifds = (window as any).UTIF.decode(buffer);
                    if (!ifds || ifds.length === 0) {
                         return reject(new Error("Não foi possível decodificar o arquivo TIFF. Formato inválido ou não suportado."));
                    }
                    const firstPage = ifds[0];
                    (window as any).UTIF.decodeImage(buffer, firstPage);
                    const rgba = (window as any).UTIF.toRGBA8(firstPage);

                    const canvas = document.createElement('canvas');
                    canvas.width = firstPage.width;
                    canvas.height = firstPage.height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                         return reject(new Error("Não foi possível criar o contexto do canvas para o TIFF."));
                    }
                    const imageData = new ImageData(new Uint8ClampedArray(rgba.buffer), firstPage.width, firstPage.height);
                    ctx.putImageData(imageData, 0, 0);

                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = (err) => reject(err);
                    img.src = canvas.toDataURL();

                } catch (err) {
                    console.error('Erro na decodificação UTIF:', err);
                    reject(err);
                }
            };
            reader.onerror = (err) => reject(err);
            reader.readAsArrayBuffer(file);
        });
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            if (e.target?.result) {
                img.src = e.target.result as string;
            } else {
                reject(new Error("O resultado da leitura do arquivo está vazio."));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export function applyImageFilters(analysis: ImageAnalysisState) {
    if (!analysis.originalImage) return;

    const { processedImageCanvas, originalCanvas } = elements;
    const { width, height } = analysis.originalImage;
    processedImageCanvas.width = width;
    processedImageCanvas.height = height;
    originalCanvas.width = width;
    originalCanvas.height = height;

    const ctx = processedImageCanvas.getContext('2d', { willReadFrequently: true });
    const originalCtx = originalCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || !originalCtx) return;

    originalCtx.drawImage(analysis.originalImage, 0, 0);

    const adjustments = getEffectiveAdjustments();

    let imageData = originalCtx.getImageData(0, 0, width, height);
    if (adjustments.backgroundColorToSubtract) {
        const { r, g, b } = adjustments.backgroundColorToSubtract;
        const tol = adjustments.backgroundTolerance;
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const dr = data[i] - r, dg = data[i + 1] - g, db = data[i + 2] - b;
            if (dr * dr + dg * dg + db * db < tol * tol) data[i + 3] = 0;
        }
    }
    ctx.putImageData(imageData, 0, 0);

    ctx.filter = `brightness(${100 + adjustments.brightness}%) contrast(${100 + adjustments.contrast}%)`;
    ctx.drawImage(processedImageCanvas, 0, 0, width, height);
    ctx.filter = 'none';

    imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const h = adjustments.highlights / 100, s = adjustments.shadows / 100;
    if (h !== 0 || s !== 0) {
        for (let i = 0; i < data.length; i += 4) {
            for (let j = 0; j < 3; j++) {
                const val = data[i+j];
                let newVal = val;
                if (h > 0) newVal += (255 - val) * h; else if (h < 0) newVal += val * h;
                if (s > 0) newVal += val * s; else if (s < 0) newVal += (255 - val) * s;
                data[i+j] = Math.max(0, Math.min(255, newVal));
            }
        }
    }

    const black = adjustments.blacks, white = adjustments.whites, range = white - black;
    if (range > 0 && range !== 255) {
        for (let i = 0; i < data.length; i += 4) {
            for (let j = 0; j < 3; j++) data[i + j] = Math.max(0, Math.min(255, (data[i + j] - black) * 255 / range));
        }
    }

    if (adjustments.invert) {
        for (let i = 0; i < data.length; i += 4) { data[i] = 255 - data[i]; data[i+1] = 255 - data[i+1]; data[i+2] = 255 - data[i+2]; }
    }
    
    // Always convert to 8-bit grayscale as the final step before sharpness
    for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = data[i+1] = data[i+2] = gray;
    }

    if (adjustments.binarize) {
        const threshold = adjustments.binaryThreshold;
        for (let i = 0; i < data.length; i += 4) {
            const val = data[i] > threshold ? 255 : 0;
            data[i] = data[i+1] = data[i+2] = val;
        }
    }
    ctx.putImageData(imageData, 0, 0);

    if (adjustments.sharpness > 0) {
        const amount = adjustments.sharpness / 100;
        const kernel = [ 0, -amount, 0, -amount, 1 + 4 * amount, -amount, 0, -amount, 0 ];
        ctx.putImageData(convolve({data: ctx.getImageData(0, 0, width, height).data, width, height}, kernel), 0, 0);
    }
    
    analysis.is8Bit = true;
    
    state.isPaintLayerDirty = true;
    requestRedraw();
}

export function resetImageAdjustments() {
    const analysis = getActiveAnalysis();
    const activeTab = getActiveTab();
    if (!activeTab) return;
    const scope = (document.querySelector('input[name="adjustment-scope"]:checked') as HTMLInputElement)?.value || 'tab';
    if (scope === 'image' && analysis) analysis.adjustments = { ...defaultAdjustments };
    else if (scope === 'global') state.globalAdjustments = { ...defaultAdjustments };
    else activeTab.adjustments = { ...defaultAdjustments };
    updateAdjustmentUI();
    if (analysis) applyImageFilters(analysis);
}

export async function handleFiles(files: File[], mode: 'replace' | 'add') {
    const activeTab = getActiveTab();
    if (!activeTab) return;
    if (elements.loadingIndicator) elements.loadingIndicator.classList.remove('hidden');

    const newAnalyses = Array.from(files).map(file => new ImageAnalysisState(file));

    if (mode === 'replace') {
        addToCumulativeResults();
        activeTab.analyses = newAnalyses;
        activeTab.currentAnalysisIndex = -1;
    } else {
        activeTab.analyses.push(...newAnalyses);
    }

    if (activeTab.analyses.length > 0) {
        await loadImageByIndex(mode === 'replace' ? 0 : activeTab.analyses.length - newAnalyses.length);
    } else {
        resetTabToEmpty(activeTab);
    }
    if (elements.loadingIndicator) elements.loadingIndicator.classList.add('hidden');
}

export function resetTabToEmpty(tab: TabState) {
    tab.currentAnalysisIndex = -1;
    if (elements.initialMessage) elements.initialMessage.style.removeProperty('display');
    if (elements.resultsContainer) elements.resultsContainer.classList.add('hidden');
    if (elements.resetButton) elements.resetButton.disabled = true;
    setSaveButtonState(true);
    if (elements.imageNavControls) elements.imageNavControls.classList.add('hidden');
    if (elements.mainImageNav) elements.mainImageNav.classList.add('hidden');
    document.getElementById('zoom-controls')?.classList.add('hidden');
    const individualAdjustmentsBtn = document.getElementById('individual-adjustments-btn');
    if (individualAdjustmentsBtn) individualAdjustmentsBtn.classList.add('hidden');
    const downloadAnalyzedImageButton = document.getElementById('downloadAnalyzedImageButton');
    if (downloadAnalyzedImageButton) downloadAnalyzedImageButton.classList.add('hidden');
    if (elements.fileNameDisplay) {
        elements.fileNameDisplay.textContent = 'Nenhuma imagem carregada';
        elements.fileNameDisplay.title = '';
    }
    if (elements.mainImageInfo) {
        elements.mainImageInfo.textContent = '';
        elements.mainImageInfo.title = '';
    }
    elements.allCanvases.forEach(c => c.getContext('2d')?.clearRect(0, 0, c.width, c.height));
    requestRedraw();
}

export async function loadImageByIndex(index: number) {
    const activeTab = getActiveTab();
    if (!activeTab || index < 0 || index >= activeTab.analyses.length) return;

    if (activeTab.currentAnalysisIndex !== -1 && activeTab.currentAnalysisIndex < activeTab.analyses.length) {
        addToCumulativeResults();
    }

    activeTab.currentAnalysisIndex = index;
    const analysis = activeTab.analyses[index];
    if (!analysis) return;
    if (elements.loadingIndicator) elements.loadingIndicator.classList.remove('hidden');

    try {
        if (!analysis.originalImage) analysis.originalImage = await loadImagePromise(analysis.file);
        
        const { width, height } = analysis.originalImage;
        elements.allCanvases.forEach(canvas => { canvas.width = width; canvas.height = height; });
        ['paintCanvas', 'paintSpheroidCanvas', 'manualPaintCanvas'].forEach(id => {
            const canvas = document.getElementById(id) as HTMLCanvasElement;
            if(canvas) canvas.getContext('2d')?.clearRect(0, 0, width, height);
        });

        applyImageFilters(analysis);
        
        if (elements.initialMessage) elements.initialMessage.style.display = 'none';
        if (elements.resultsContainer) elements.resultsContainer.classList.remove('hidden');
        if (elements.resetButton) elements.resetButton.disabled = false;
        setSaveButtonState(!analysis.lastAnalysisResult.centerX);
        if (elements.imageNavControls) elements.imageNavControls.classList.remove('hidden');
        if (elements.mainImageNav) elements.mainImageNav.classList.remove('hidden');
        document.getElementById('zoom-controls')?.classList.remove('hidden');

        // Update image name and counts
        const filename = analysis.originalFilename;
        const navCount = `(${index + 1}/${activeTab.analyses.length})`;
        if (elements.fileNameDisplay) { elements.fileNameDisplay.textContent = filename; elements.fileNameDisplay.title = filename; }
        if (elements.imageNavStatus) { elements.imageNavStatus.textContent = navCount; elements.imageNavStatus.title = filename; }
        if (elements.mainImageInfo) {
            const fullText = `${filename} ${navCount}`;
            elements.mainImageInfo.textContent = fullText;
            elements.mainImageInfo.title = fullText;
        }

        if (elements.prevImageButton) elements.prevImageButton.disabled = index === 0;
        if (elements.nextImageButton) elements.nextImageButton.disabled = index === activeTab.analyses.length - 1;
        if (elements.mainPrevImageButton) elements.mainPrevImageButton.disabled = index === 0;
        if (elements.mainNextImageButton) elements.mainNextImageButton.disabled = index === activeTab.analyses.length - 1;

        const individualAdjustmentsBtn = document.getElementById('individual-adjustments-btn');
        if (individualAdjustmentsBtn) individualAdjustmentsBtn.classList.remove('hidden');
        const downloadAnalyzedImageButton = document.getElementById('downloadAnalyzedImageButton');
        if (downloadAnalyzedImageButton) downloadAnalyzedImageButton.classList.remove('hidden');
        const imageScopeDiv = document.querySelector('#adjustment-mode-image')?.parentElement;
        if (imageScopeDiv) imageScopeDiv.classList.remove('hidden');

        updateResultsDisplay();
        updateCellCounters();
        updateAdjustmentUI();
        if (analysis.actionHistory.length === 0) initializeHistoryForAnalysis();
        goToWorkflowStep(analysis.isCompleted ? 3 : analysis.currentAnalysisStep);
        if (analysis.manualDrawnPath.length === 0 && !analysis.isCompleted) {
             activateStepWorkflow();
        }
        
        resetView();

    } catch (error) {
        console.error("Error loading image:", error);
        showToast(`Falha ao carregar a imagem: ${analysis.originalFilename}. Removendo...`, 5000);
        
        // This error handling is critical. It robustly removes the failed image
        // and tries to load the next logical one without causing a cascade of failures.
        const failedAnalysisIndex = activeTab.analyses.findIndex(a => a === analysis);
        if (failedAnalysisIndex > -1) {
            activeTab.analyses.splice(failedAnalysisIndex, 1);
            
            if (activeTab.analyses.length > 0) {
                // Try to load the image that took the place of the failed one, or the last image if it was the last one.
                const newIndexToLoad = Math.min(failedAnalysisIndex, activeTab.analyses.length - 1);
                // Use a timeout to break the promise chain and prevent deep recursion on multiple failures
                setTimeout(() => loadImageByIndex(newIndexToLoad), 0);
            } else {
                // If no images are left, reset the tab to its empty state.
                resetTabToEmpty(activeTab);
            }
        }
    } finally {
        if (elements.loadingIndicator) elements.loadingIndicator.classList.add('hidden');
    }
}

/**
 * Deletes the currently viewed image from the active tab after user confirmation.
 * This function handles all state and UI updates related to the deletion.
 */
export function deleteCurrentImage() {
    const activeTab = getActiveTab();
    if (!activeTab || activeTab.analyses.length === 0) return;

    const indexToDelete = activeTab.currentAnalysisIndex;
    if (indexToDelete < 0 || indexToDelete >= activeTab.analyses.length) return;

    const analysisToDelete = activeTab.analyses[indexToDelete];
    
    if (!confirm(`Tem certeza que deseja deletar a imagem "${analysisToDelete.originalFilename}"? Esta ação não pode ser desfeita.`)) {
        return;
    }

    // Step 1: Remove the analysis object from the tab's list.
    activeTab.analyses.splice(indexToDelete, 1);

    // Step 2: If the deleted analysis was saved, remove it from cumulative results.
    const resultIndex = activeTab.cumulativeResults.findIndex(r => r.filename === analysisToDelete.originalFilename);
    if (resultIndex > -1) {
        activeTab.cumulativeResults.splice(resultIndex, 1);
        updateCumulativeResultsDisplay();
    }
    
    // Step 3: Decide which view to show next.
    if (activeTab.analyses.length === 0) {
        // If no images are left, reset the entire tab to its initial empty state.
        resetTabToEmpty(activeTab);
    } else {
        // If images remain, determine which one to load.
        // The goal is to load the image that now occupies the deleted item's index,
        // or the new last image if the last one was deleted.
        const newIndexToLoad = Math.min(indexToDelete, activeTab.analyses.length - 1);
        
        // Important: Reset the current index *before* loading the next image
        // to prevent auto-saving the data of the image we just deleted.
        activeTab.currentAnalysisIndex = -1; 
        
        // Load the new image. This function handles all UI updates.
        loadImageByIndex(newIndexToLoad);
    }
}