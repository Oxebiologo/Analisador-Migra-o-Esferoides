import * as elements from './elements';
import { state, getActiveTab, getActiveAnalysis, StickerState } from './state';
import { requestRedraw, resetView, zoomTo, getMousePos, paintOnCanvas } from './canvas';
import { applyImageFilters, handleFiles, loadImageByIndex, resetImageAdjustments, deleteCurrentImage } from './image';
import { setMode, updateUIMode, initializePanels, syncCheckboxes, completeStepAndAdvance, switchTab, addNewTab, deleteTab, renderTabs, updateFullscreenButton, renameTab, renderStickers, updateCellCounters, goToWorkflowStep, minimizePanel, restorePanel, makeDraggable, renderMinimizedPanels } from './ui';
import { analyzeSpheroid, refineContour, runMagicWand, processPaintedSpheroid, processPaintedMargin, pushToHistory, handleSpheroidEdit } from './analysis';
import { addToCumulativeResults, clearCumulativeResults, copyCumulativeCsv, saveCumulativeCsv, openInSheets, deleteCumulativeResult, saveProject, loadProject, updateResultsDisplay, calculateAndStoreMigrationMetrics } from './results';
import { handleGlobalKeyDown } from './shortcuts';
import { isPointInEllipse, simplifyPath, debounce, createParticleFromPixels, isCellPositionValid, showToast } from './utils';

const requestFilterAndRedraw = debounce(() => { 
    const analysis = getActiveAnalysis();
    if(analysis) applyImageFilters(analysis); 
}, 250);

function updateBrushToolsUI() {
    if (!elements.brushToolPaint || !elements.brushToolErase) return;
    elements.brushToolPaint.classList.toggle('active', !state.isErasing);
    elements.brushToolErase.classList.toggle('active', state.isErasing);
}

let tempProjectFileForLoad: File | null = null;
let tempProjectDataForLoad: any = null;

/**
 * Initializes all event listeners for the application.
 */
export function initializeEventListeners() {

    // File and Project Handling
    elements.imageLoader?.addEventListener('change', (e) => {
        const activeTab = getActiveTab();
        if (activeTab) addToCumulativeResults(); // Autosave
        const files = (e.target as HTMLInputElement).files;
        if (!files || files.length === 0) return;
        handleFiles(Array.from(files), 'replace');
    });

    elements.newProjectButton?.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja criar um novo projeto? Todas as abas e dados não salvos serão perdidos.')) {
            // This is a full reset.
            
            // 1. Reset core state
            state.tabs = [];
            state.activeTabIndex = -1;
            state.nextTabId = 0;
            state.nextStickerId = 0;
            state.minimizedPanels = [];
    
            // 2. Reset UI
            // Close all floating panels and deactivate header buttons
            elements.allPopupPanels.forEach(panel => {
                if (panel) panel.classList.add('hidden');
            });
            document.querySelectorAll('header .popup-button.active').forEach(btn => {
                btn.classList.remove('active');
            });
            
            // Reset project name to the default from the HTML
            const defaultProjectName = 'Analisador de Migração';
            if (elements.headerProjectNameInput) elements.headerProjectNameInput.value = defaultProjectName;
    
            // 3. Add a fresh new tab. This will call switchTab and reset the main view.
            addNewTab();
            renderMinimizedPanels(); // Clear the minimized bar
        }
    });

    elements.saveProjectButton?.addEventListener('click', saveProject);
    
    function showTabSelectionForLoad(file: File, projectData: any) {
        tempProjectFileForLoad = file;
        tempProjectDataForLoad = projectData;
    
        const { tabSelectionModal, tabSelectionList, tabSelectAll } = elements;
        if (!tabSelectionModal || !tabSelectionList || !tabSelectAll) return;
    
        tabSelectionList.innerHTML = '';
        projectData.tabs.forEach((tab: any, index: number) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <label class="flex items-center space-x-3 p-2 rounded-md hover:bg-gray-700/50 cursor-pointer">
                    <input type="checkbox" data-index="${index}" class="tab-select-checkbox w-5 h-5 text-teal-500 bg-gray-700 border-gray-600 rounded focus:ring-teal-500" checked>
                    <span class="truncate" title="${tab.name}">${tab.name}</span>
                </label>
            `;
            tabSelectionList.appendChild(li);
        });
        
        tabSelectAll.checked = true;
        tabSelectAll.onchange = () => {
            tabSelectionList.querySelectorAll<HTMLInputElement>('.tab-select-checkbox').forEach(cb => cb.checked = tabSelectAll.checked);
        };
    
        tabSelectionModal.classList.remove('hidden');
    }

    elements.loadProjectInput?.addEventListener('change', async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
    
        const recalculatingOverlay = document.getElementById('recalculating-overlay');
        const overlayText = recalculatingOverlay?.querySelector('h2');
        if (recalculatingOverlay && overlayText) {
            overlayText.textContent = 'Lendo arquivo do projeto...';
            recalculatingOverlay.classList.remove('hidden');
        }
    
        // Use a worker to read and parse the large file off the main thread
        const workerCode = `
            self.onmessage = async (event) => {
                const { file } = event.data;
                try {
                    const content = await file.text();
                    const projectData = JSON.parse(content);
                    if (!projectData.tabs) {
                        throw new Error("Formato de projeto inválido.");
                    }
                    // Post the parsed data back. JSON is structured-cloneable.
                    self.postMessage({ status: 'done', projectData: projectData });
                } catch (error) {
                    // Post error message back if something fails
                    self.postMessage({ status: 'error', error: error.message });
                }
            };
        `;
    
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(workerUrl);
    
        worker.onmessage = (event) => {
            const { status, projectData, error } = event.data;
    
            if (recalculatingOverlay && overlayText) {
                recalculatingOverlay.classList.add('hidden');
                overlayText.textContent = 'Recalculando Projeto...'; // Reset for later use
            }
    
            if (status === 'done') {
                showTabSelectionForLoad(file, projectData);
            } else {
                console.error("Falha ao ler o arquivo de projeto via worker:", error);
                showToast("Arquivo de projeto inválido ou corrompido.", 5000);
            }
    
            worker.terminate();
            URL.revokeObjectURL(workerUrl);
        };
    
        worker.onerror = (err) => {
            if (recalculatingOverlay && overlayText) {
                recalculatingOverlay.classList.add('hidden');
                overlayText.textContent = 'Recalculando Projeto...';
            }
            console.error("Worker error during project load:", err);
            showToast("Ocorreu um erro ao carregar o projeto.", 5000);
            worker.terminate();
            URL.revokeObjectURL(workerUrl);
        };
    
        // Start the worker
        worker.postMessage({ file: file });
    
        (e.target as HTMLInputElement).value = ''; // Reset input to allow loading the same file again
    });

    const closeTabSelectionModal = () => {
        if (elements.tabSelectionModal) elements.tabSelectionModal.classList.add('hidden');
        tempProjectFileForLoad = null;
        tempProjectDataForLoad = null;
    };
    
    const handleTabSelectionConfirm = (mode: 'replace' | 'add') => {
        const { tabSelectionModal, tabSelectionList } = elements;
        if (!tabSelectionModal || !tabSelectionList || !tempProjectFileForLoad || !tempProjectDataForLoad) return;
    
        const selectedIndexes = Array.from(tabSelectionList.querySelectorAll<HTMLInputElement>('.tab-select-checkbox:checked')).map(cb => parseInt(cb.dataset.index || '-1'));
        const selectedTabs = tempProjectDataForLoad.tabs.filter((_: any, i: number) => selectedIndexes.includes(i));
        
        if (selectedTabs.length > 0) {
            const projectDataWithSelection = { ...tempProjectDataForLoad, tabs: selectedTabs };
            loadProject(tempProjectFileForLoad!, projectDataWithSelection, mode);
        }
        
        closeTabSelectionModal();
    };
    
    elements.tabSelectReplaceBtn?.addEventListener('click', () => handleTabSelectionConfirm('replace'));
    elements.tabSelectAddBtn?.addEventListener('click', () => handleTabSelectionConfirm('add'));
    elements.tabSelectCancel?.addEventListener('click', closeTabSelectionModal);


    elements.headerProjectNameInput?.addEventListener('input', () => {
        const activeTab = getActiveTab();
        if(activeTab) activeTab.name = elements.headerProjectNameInput.value;
    });

    elements.saveAnalyzedButton?.addEventListener('click', () => {
        const analysis = getActiveAnalysis();
        if (!analysis || !analysis.originalImage) return;
        const saveCanvas = document.createElement('canvas');
        saveCanvas.width = analysis.originalImage.width;
        saveCanvas.height = analysis.originalImage.height;
        const ctx = saveCanvas.getContext('2d');
        if (!ctx) return;
        import('./canvas').then(({ drawForSaving }) => {
            drawForSaving(ctx);
            const imageData = ctx.getImageData(0, 0, saveCanvas.width, saveCanvas.height);
            const tiffBuffer = (window as any).UTIF.encodeImage(imageData.data.buffer, imageData.width, imageData.height);
            const blob = new Blob([tiffBuffer], { type: 'image/tiff' });
            
            const link = document.createElement('a');
            const baseName = analysis.originalFilename.split('.').slice(0, -1).join('.') || 'imagem';
            link.download = `${baseName}_Analise_Migracao.tif`;
            link.href = URL.createObjectURL(blob);
            link.click();
            URL.revokeObjectURL(link.href);
        });
    });

    // Image Adjustment Listeners
    [elements.contrastInput, elements.sharpnessInput, elements.brightnessInput, elements.highlightsInput, elements.shadowsInput, elements.whitesInput, elements.blacksInput, elements.invertCheckbox, elements.binarizeCheckbox, elements.backgroundToleranceInput, elements.binaryThresholdInput].forEach(el => {
        if (el) el.addEventListener('input', requestFilterAndRedraw);
    });
    
    const syncSliderAndNumber = (sliderId: string, numberId: string) => {
        const slider = document.getElementById(sliderId) as HTMLInputElement;
        const number = document.getElementById(numberId) as HTMLInputElement;
        if (slider && number) {
            slider.addEventListener('input', () => { number.value = slider.value; requestFilterAndRedraw(); });
            number.addEventListener('change', () => { slider.value = number.value; requestFilterAndRedraw(); });
        }
    };
    syncSliderAndNumber('brightnessInput', 'brightnessNumber');
    syncSliderAndNumber('contrastInput', 'contrastNumber');
    syncSliderAndNumber('sharpnessInput', 'sharpnessNumber');
    syncSliderAndNumber('highlightsInput', 'highlightsNumber');
    syncSliderAndNumber('shadowsInput', 'shadowsNumber');
    syncSliderAndNumber('whitesInput', 'whitesNumber');
    syncSliderAndNumber('blacksInput', 'blacksNumber');
    syncSliderAndNumber('backgroundToleranceInput', 'backgroundToleranceNumber');
    syncSliderAndNumber('binaryThresholdInput', 'binaryThresholdNumber');
    syncSliderAndNumber('magicWandToleranceInput', 'magicWandToleranceNumber');
    syncSliderAndNumber('aiToleranceInput', 'aiToleranceNumber');

    // Sync for brush controls which doesn't need a filter redraw
    elements.brushSizeInput?.addEventListener('input', () => {
        if (elements.brushSizeNumber) elements.brushSizeNumber.value = elements.brushSizeInput.value;
    });
    elements.brushSizeNumber?.addEventListener('change', () => {
        if (elements.brushSizeInput) elements.brushSizeInput.value = elements.brushSizeNumber.value;
    });

    // Sync for brush opacity controls and trigger redraw
    elements.brushOpacityInput?.addEventListener('input', () => {
        if (elements.brushOpacityNumber) elements.brushOpacityNumber.value = elements.brushOpacityInput.value;
        requestRedraw();
    });
    elements.brushOpacityNumber?.addEventListener('change', () => {
        if (elements.brushOpacityInput) elements.brushOpacityInput.value = elements.brushOpacityNumber.value;
        requestRedraw();
    });
    
    // Real-time border refinement
    const debouncedRefine = debounce(refineContour, 250);
    elements.aiToleranceInput?.addEventListener('input', () => {
        const analysis = getActiveAnalysis();
        // Only run if there is a contour to refine
        if (analysis && analysis.manualDrawnPath.length > 2) {
            debouncedRefine();
        }
    });

    elements.resetAdjustmentsButton?.addEventListener('click', () => { resetImageAdjustments(); requestFilterAndRedraw(); });

    [elements.paintCellsCheckbox, elements.showCellNumbersCheckbox, elements.rulerCheckbox, elements.iaDrawCheckbox, elements.showHaloRadiusCircleCheckbox, elements.showMaxRadiusCircleCheckbox, document.getElementById('spheroidLineColorInput'), document.getElementById('marginLineColorInput'), document.getElementById('haloLineColorInput'), document.getElementById('maxLineColorInput'), elements.layoutFontFamily, elements.rulerFontFamily, elements.rulerFontSize, elements.analysisLineWidth, elements.cellNumberFontSize].forEach(el => {
        if (el) el.addEventListener('input', (e) => {
            if ((e.target as HTMLElement).id === 'layoutFontFamily') document.body.style.fontFamily = (e.target as HTMLSelectElement).value;
            else { state.isPaintLayerDirty = true; requestRedraw(); }
        });
    });
    
    elements.convertTo8BitButton?.addEventListener('click', () => {
        const analysis = getActiveAnalysis();
        if (!analysis || !analysis.originalImage) return;
        analysis.is8Bit = true;
        applyImageFilters(analysis);
        if (elements.bitStatus) {
            elements.bitStatus.textContent = '8-bit';
            elements.bitStatus.className = 'text-xs font-bold ml-auto px-2 py-0.5 rounded-full bg-teal-500/80 text-white';
        }
        (elements.convertTo8BitButton as HTMLButtonElement).disabled = true;
        [elements.paintSpheroidButton, elements.drawSpheroidButton, elements.magicPaintButton, elements.undoPointButton].forEach(b => { if (b) (b as HTMLButtonElement).disabled = false });
        completeStepAndAdvance();
    });

    [elements.drawSpheroidButton, elements.magicPaintButton, elements.drawMarginButton, elements.setHaloPointButton, elements.setMigrationPointButton].forEach(btn => {
        if (btn) btn.addEventListener('click', () => setMode((btn as HTMLElement).dataset.mode));
    });

    elements.paintSpheroidButton?.addEventListener('click', () => {
        setMode(null);
        state.paintModeContext = 'spheroid';
        state.isErasing = false;
    
        // Convert existing contour to a paintable area for intuitive editing
        const analysis = getActiveAnalysis();
        if (analysis && analysis.manualDrawnPath.length > 0) {
            const paintCtx = elements.paintSpheroidCanvas.getContext('2d');
            if (paintCtx) {
                paintCtx.clearRect(0, 0, elements.paintSpheroidCanvas.width, elements.paintSpheroidCanvas.height);
                paintCtx.beginPath();
                paintCtx.moveTo(analysis.manualDrawnPath[0].x, analysis.manualDrawnPath[0].y);
                analysis.manualDrawnPath.forEach(p => paintCtx.lineTo(p.x, p.y));
                paintCtx.closePath();
                // Use a solid, visible color for the editable area
                paintCtx.fillStyle = '#2DD4BF'; // A solid teal color
                paintCtx.fill();
    
                // Clear the old path so it isn't drawn simultaneously
                analysis.manualDrawnPath = [];
                requestRedraw();
            }
        }
    
        updateBrushToolsUI();
        updateUIMode();
    });
    
    elements.paintMarginButton?.addEventListener('click', () => { 
        setMode(null); 
        state.paintModeContext = 'margin'; 
        state.isErasing = false;
        updateBrushToolsUI();
        updateUIMode(); 
    });

    elements.selectBackgroundButton?.addEventListener('click', () => setMode('selectBackground'));
    elements.refineContourButton?.addEventListener('click', refineContour);
    elements.smoothMarginButton?.addEventListener('click', () => {
        const analysis = getActiveAnalysis();
        if (!analysis || analysis.migrationMarginPath.length < 3) return;
        analysis.migrationMarginPath = simplifyPath(analysis.migrationMarginPath, 5);
        requestRedraw();
        updateResultsDisplay();
        pushToHistory();
    });

    elements.undoPointButton?.addEventListener('click', () => {
        const analysis = getActiveAnalysis();
        if (!analysis) return;
        if (analysis.manualDrawnPath.length > 0) {
            analysis.manualDrawnPath = [];
            state.drawnPath = [];
        }
        elements.paintSpheroidCanvas.getContext('2d')?.clearRect(0, 0, elements.paintSpheroidCanvas.width, elements.paintSpheroidCanvas.height);
        analysis.lastAnalysisResult = {};
        analysis.haloRadiusData = null;
        analysis.detectedParticles = [];
        updateResultsDisplay();
        requestRedraw();
        updateUIMode();
        [elements.setHaloPointButton, elements.setMigrationPointButton, elements.refineContourButton, elements.drawMarginButton, elements.smoothMarginButton, elements.paintMarginButton, elements.clearMarginButton].forEach(b => { if (b) (b as HTMLButtonElement).disabled = true; });
        pushToHistory();
    });

    elements.clearMarginButton?.addEventListener('click', () => {
        const analysis = getActiveAnalysis();
        if (analysis) analysis.migrationMarginPath = [];
        requestRedraw();
        updateResultsDisplay();
        updateUIMode();
        pushToHistory();
    });

    elements.addCellButton?.addEventListener('click', () => setMode('addCell'));
    elements.removeCellButton?.addEventListener('click', () => setMode('removeCell'));
    elements.clearCellsButton?.addEventListener('click', () => {
        const analysis = getActiveAnalysis();
        if (!analysis) return;
        analysis.detectedParticles = [];
        state.isPaintLayerDirty = true;
        updateCellCounters();
        requestRedraw();
        pushToHistory();
    });

    elements.confirmCellCountButton?.addEventListener('click', () => {
        const analysis = getActiveAnalysis();
        if (!analysis || !analysis.lastAnalysisResult) return;
        analysis.lastAnalysisResult.cellCount = analysis.detectedParticles.length;
        updateResultsDisplay();
        showToast('Contagem de células confirmada!');
        completeStepAndAdvance();
        pushToHistory();
    });

    elements.confirmAnalysisButton?.addEventListener('click', () => {
        const analysis = getActiveAnalysis();
        if (!analysis) return;
    
        addToCumulativeResults(); // This saves the results
        analysis.isCompleted = true;
        analysis.currentAnalysisStep = 4; // Ensure it's marked as on the last step
    
        showToast('Análise concluída e registrada!');
        
        // Hide the panel and deactivate the button
        if (elements.analysisWorkflowPanel) {
            elements.analysisWorkflowPanel.classList.add('hidden');
            document.getElementById('header-analysis-btn')?.classList.remove('active');
        }
        
        // Refresh the UI to reflect the "completed" state without activating tools
        goToWorkflowStep(4);
    });

    if (elements.resultCanvas) {
        const getCanvasPos = (clientX: number, clientY: number) => {
            if (!elements.canvasContainer) return { x: 0, y: 0 };
            const rect = elements.canvasContainer.getBoundingClientRect();
            return {
                x: (clientX - rect.left - state.pan.x) / state.zoom,
                y: (clientY - rect.top - state.pan.y) / state.zoom
            };
        };

        const onPointerDown = (clientX: number, clientY: number, isCtrl: boolean) => {
            const analysis = getActiveAnalysis();
            if (!analysis) return;

            if (isCtrl || (!state.currentMode && !state.paintModeContext)) {
                state.isPanning = true;
                state.panStart = { x: clientX - state.pan.x, y: clientY - state.pan.y };
                elements.resultCanvas!.style.cursor = 'grabbing';
                return;
            }

            state.isDrawing = true;
            state.mouseDownPos = { x: clientX, y: clientY };
            const pos = getCanvasPos(clientX, clientY);

            if (state.paintModeContext) {
                state.lastPaintPos = pos;
                if (state.paintModeContext === 'spheroid') handleSpheroidEdit(pos, pos);
                else if (state.paintModeContext === 'margin') paintOnCanvas(pos, pos, elements.paintSpheroidCanvas, state.isErasing);
            } else if (state.currentMode === 'drawSpheroid') {
                state.drawnPath = [pos];
                analysis.manualDrawnPath = [];
            } else if (state.currentMode === 'drawMargin') {
                state.drawnPath = [pos];
                analysis.migrationMarginPath = [];
            }
        };

        const onPointerMove = (clientX: number, clientY: number) => {
            const analysis = getActiveAnalysis();
            if (!analysis) return;
            const currentPos = getCanvasPos(clientX, clientY);

            if (state.isPanning) {
                state.pan.x = clientX - state.panStart.x;
                state.pan.y = clientY - state.panStart.y;
                requestRedraw();
            } else if (state.isDrawing) {
                if (state.paintModeContext) {
                    if (state.paintModeContext === 'spheroid') handleSpheroidEdit(state.lastPaintPos!, currentPos);
                    else if (state.paintModeContext === 'margin') paintOnCanvas(state.lastPaintPos!, currentPos, elements.paintSpheroidCanvas, state.isErasing);
                } else if (state.currentMode === 'drawSpheroid' || state.currentMode === 'drawMargin') {
                    state.drawnPath.push(currentPos);
                }
                state.lastPaintPos = currentPos;
                requestRedraw();
            }

            if (analysis.originalImage && elements.pixelInspector) {
                 const x = Math.floor(currentPos.x), y = Math.floor(currentPos.y);
                if (x >= 0 && x < analysis.originalImage.width && y >= 0 && y < analysis.originalImage.height) {
                    const ctx = elements.processedImageCanvas.getContext('2d', { willReadFrequently: true });
                    const brightness = ctx ? ctx.getImageData(x, y, 1, 1).data[0] : 0;
                    elements.pixelInspector.innerHTML = `X:${x} Y:${y} B:${255 - brightness}`;
                    elements.pixelInspector.classList.remove('hidden');
                } else elements.pixelInspector.classList.add('hidden');
            }
        };

        const onPointerUp = (clientX: number, clientY: number) => {
            const analysis = getActiveAnalysis();
            if (!analysis) return;
            if (state.isDrawing && state.paintModeContext) pushToHistory();
            const wasDrawing = state.isDrawing;
            state.isDrawing = false;
            state.lastPaintPos = null;

            if ((state.currentMode === 'drawSpheroid' || state.currentMode === 'drawMargin') && wasDrawing) {
                const simplified = simplifyPath(state.drawnPath, 1.5);
                if (simplified.length > 3) {
                    if (state.currentMode === 'drawSpheroid') { analysis.manualDrawnPath = [...simplified, simplified[0]]; analyzeSpheroid(); }
                    else { analysis.migrationMarginPath = [...simplified, simplified[0]]; updateResultsDisplay(); pushToHistory(); }
                } else {
                    if (state.currentMode === 'drawSpheroid') analysis.manualDrawnPath = []; else analysis.migrationMarginPath = [];
                }
                state.drawnPath = [];
                setMode(null);
                return;
            }

            if (state.isPanning) { state.isPanning = false; updateUIMode(); }
            const isDrag = !state.mouseDownPos || Math.hypot(clientX - state.mouseDownPos.x, clientY - state.mouseDownPos.y) > 4;
            state.mouseDownPos = null;
            if (isDrag) return;

            const pos = getCanvasPos(clientX, clientY);
            switch (state.currentMode) {
                case 'magicPaint': runMagicWand(pos); break;
                case 'selectBackground': {
                    const originalCtx = elements.originalCanvas.getContext('2d', { willReadFrequently: true });
                    if (!originalCtx) return;
                    const p = originalCtx.getImageData(Math.round(pos.x), Math.round(pos.y), 1, 1).data;
                    state.backgroundColorToSubtract = { r: p[0], g: p[1], b: p[2] };
                    const bgPreview = document.getElementById('backgroundColorPreview') as HTMLElement;
                    if(bgPreview) bgPreview.style.backgroundColor = `rgb(${p[0]}, ${p[1]}, ${p[2]})`;
                    applyImageFilters(analysis);
                    setMode(null);
                    break;
                }
                case 'removeCell': {
                     for(let i = analysis.detectedParticles.length - 1; i >= 0; i--) { 
                        const p = analysis.detectedParticles[i]; 
                        if (p.ellipse && isPointInEllipse(pos, p.ellipse, 2.0)) {
                            analysis.detectedParticles.splice(i, 1); 
                            state.isPaintLayerDirty = true; 
                            updateCellCounters();
                            requestRedraw();
                            pushToHistory();
                            return; 
                        } 
                    } 
                    break;
                }
                case 'addCell': {
                    const particle = createParticleFromPixels([{x: pos.x, y: pos.y}], true);
                    if (isCellPositionValid(particle.centroid)) {
                        analysis.detectedParticles.push(particle);
                        state.isPaintLayerDirty = true;
                        updateCellCounters();
                        requestRedraw();
                        pushToHistory();
                    }
                    break;
                }
                case 'setMigrationPoint': {
                    if (!analysis.lastAnalysisResult.centerX) return;
                    const { centerX, centerY } = analysis.lastAnalysisResult;
                    const maxRadius = Math.hypot(pos.x - centerX, pos.y - centerY);
                    analysis.lastAnalysisResult = { ...analysis.lastAnalysisResult, maxRadius, maxRadiusData: { point: pos, angle: Math.atan2(pos.y - centerY, pos.x - centerX) } };
                    calculateAndStoreMigrationMetrics();
                    setMode(null);
                    if (analysis.currentAnalysisStep === 2) {
                        if (confirm('Concluir a definição de raios e iniciar a contagem de células?')) {
                            completeStepAndAdvance();
                            setMode('addCell');
                        }
                    }
                    pushToHistory();
                    break;
                }
                case 'setHaloPoint': {
                    if (!analysis.lastAnalysisResult.centerX) return;
                    const { centerX, centerY } = analysis.lastAnalysisResult;
                    analysis.haloRadiusData = { radius: Math.hypot(pos.x - centerX, pos.y - centerY), angle: Math.atan2(pos.y - centerY, pos.x - centerX) };
                    calculateAndStoreMigrationMetrics();
                    setMode(null);
                    pushToHistory();
                    break;
                }
            }
        };

        // Mouse Events
        elements.resultCanvas.addEventListener('mousedown', (e) => { e.preventDefault(); if (e.button === 0) onPointerDown(e.clientX, e.clientY, e.ctrlKey); });
        elements.resultCanvas.addEventListener('mousemove', (e) => { e.preventDefault(); onPointerMove(e.clientX, e.clientY); });
        window.addEventListener('mouseup', (e) => { if (e.button === 0) onPointerUp(e.clientX, e.clientY); });
        elements.resultCanvas.addEventListener('mouseleave', () => { if (elements.pixelInspector) elements.pixelInspector.classList.add('hidden'); });

        // Touch Events
        elements.resultCanvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (e.touches.length === 1) {
                const touch = e.touches[0];
                onPointerDown(touch.clientX, touch.clientY, false);
            } else if (e.touches.length === 2) { // Two-finger pan
                state.isPanning = true;
                const t1 = e.touches[0]; const t2 = e.touches[1];
                const midX = (t1.clientX + t2.clientX) / 2;
                const midY = (t1.clientY + t2.clientY) / 2;
                state.panStart = { x: midX - state.pan.x, y: midY - state.pan.y };
            }
        }, { passive: false });

        elements.resultCanvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (e.touches.length === 1 && (state.isDrawing || state.isPanning)) {
                const touch = e.touches[0];
                onPointerMove(touch.clientX, touch.clientY);
            } else if (e.touches.length === 2 && state.isPanning) {
                 const t1 = e.touches[0]; const t2 = e.touches[1];
                const midX = (t1.clientX + t2.clientX) / 2;
                const midY = (t1.clientY + t2.clientY) / 2;
                state.pan.x = midX - state.panStart.x;
                state.pan.y = midY - state.panStart.y;
                requestRedraw();
            }
        }, { passive: false });

        window.addEventListener('touchend', (e) => {
            if (e.touches.length === 0 && (state.isDrawing || state.isPanning)) {
                const lastTouch = e.changedTouches[0];
                onPointerUp(lastTouch.clientX, lastTouch.clientY);
            }
        });
        
        elements.resultCanvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = elements.canvasContainer?.getBoundingClientRect();
            if (!rect) return;
            zoomTo(e.deltaY < 0 ? state.zoom * 1.2 : state.zoom / 1.2, { x: e.clientX - rect.left, y: e.clientY - rect.top });
        });
    }

    window.addEventListener('resize', resetView);
    window.addEventListener('keydown', handleGlobalKeyDown, false);

    initializePanels();
    if (elements.mainImageNav) {
        makeDraggable(elements.mainImageNav);
    }
    elements.zoomInButton?.addEventListener('click', () => zoomTo(state.zoom * 1.5));
    elements.zoomOutButton?.addEventListener('click', () => zoomTo(state.zoom / 1.5));
    elements.zoomResetButton?.addEventListener('click', resetView);
    
    elements.fullscreenButton?.addEventListener('click', () => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else if (document.exitFullscreen) document.exitFullscreen();
    });
    document.addEventListener('fullscreenchange', () => {
        const isFullscreen = !!document.fullscreenElement;
        document.body.classList.toggle('fullscreen-active', isFullscreen);
        updateFullscreenButton(isFullscreen);
        resetView();
    });

    elements.brushToolPaint?.addEventListener('click', () => { state.isErasing = false; updateBrushToolsUI(); });
    elements.brushToolErase?.addEventListener('click', () => { state.isErasing = true; updateBrushToolsUI(); });

    elements.confirmPaintButton?.addEventListener('click', () => {
        if (state.paintModeContext === 'spheroid') {
            const ctx = elements.paintSpheroidCanvas.getContext('2d');
            const isCanvasDirty = ctx && ctx.getImageData(0, 0, elements.paintSpheroidCanvas.width, elements.paintSpheroidCanvas.height).data.some(channel => channel !== 0);
            
            if (isCanvasDirty) {
                processPaintedSpheroid();
            } else {
                analyzeSpheroid(); // Re-analyze path if only eraser was used on it
                 pushToHistory();
            }

        } else if (state.paintModeContext === 'margin') {
            processPaintedMargin();
        }
        elements.brushControls?.classList.add('hidden');
        state.paintModeContext = null;
        updateUIMode();
    });

    elements.cancelPaintButton?.addEventListener('click', () => {
        if (state.paintModeContext && elements.brushControls) {
            elements.brushControls.classList.add('hidden');
            const ctx = elements.paintSpheroidCanvas.getContext('2d');
            if (ctx) ctx.clearRect(0,0, elements.paintSpheroidCanvas.width, elements.paintSpheroidCanvas.height);
            requestRedraw();
        }
        setMode(null);
    });

    elements.prevImageButton?.addEventListener('click', () => { 
        const activeTab = getActiveTab();
        if (activeTab && activeTab.currentAnalysisIndex > 0) loadImageByIndex(activeTab.currentAnalysisIndex - 1); 
    });
    elements.nextImageButton?.addEventListener('click', () => { 
        const activeTab = getActiveTab();
        if (activeTab && activeTab.currentAnalysisIndex < activeTab.analyses.length - 1) loadImageByIndex(activeTab.currentAnalysisIndex + 1); 
    });
    elements.mainPrevImageButton?.addEventListener('click', () => elements.prevImageButton?.click());
    elements.mainNextImageButton?.addEventListener('click', () => elements.nextImageButton?.click());

    elements.deleteImageButton?.addEventListener('click', deleteCurrentImage);
    elements.mainDeleteImageButton?.addEventListener('click', deleteCurrentImage);

    elements.addCumulativeButton?.addEventListener('click', () => {
        const analysis = getActiveAnalysis();
        if (analysis) {
            analysis.isCurrentAnalysisSaved = false; // Force it to be "unsaved" to allow updating
            addToCumulativeResults();
            showToast('Resultado adicionado/atualizado na tabela!');
        }
    });
    elements.showCumulativeButton?.addEventListener('click', () => {
        restorePanel('cumulative');
    });
    elements.clearCumulativeButton?.addEventListener('click', clearCumulativeResults);
    elements.copyCumulativeCsvButton?.addEventListener('click', copyCumulativeCsv);
    elements.saveCumulativeCsvButton?.addEventListener('click', saveCumulativeCsv);
    elements.openInSheetsButton?.addEventListener('click', openInSheets);
    elements.cumulativeResultTableContainer?.addEventListener('click', (e) => {
        const deleteBtn = (e.target as HTMLElement).closest('.delete-cumulative-btn');
        if (deleteBtn instanceof HTMLElement) {
            const index = parseInt(deleteBtn.dataset.index ?? '', 10);
            if (!isNaN(index)) deleteCumulativeResult(index);
        }
    });

    // Panel Minimization Listeners
    elements.toggleResultsButton?.addEventListener('click', () => minimizePanel('results'));
    elements.toggleCumulativeResultsButton?.addEventListener('click', () => minimizePanel('cumulative'));

    elements.minimizedPanelsBar?.addEventListener('click', (e) => {
        const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
        if (!button) return;

        if (button.dataset.panelKey) {
            restorePanel(button.dataset.panelKey);
        } else if (button.dataset.stickerId) {
            const stickerId = parseInt(button.dataset.stickerId, 10);
            const activeTab = getActiveTab();
            if (!activeTab) return;
            const stickerState = activeTab.stickers.find(s => s.id === stickerId);
            if (stickerState) {
                stickerState.isMinimized = false;
                const maxZ = activeTab.stickers.reduce((max, s) => Math.max(max, s.zIndex), 0);
                stickerState.zIndex = maxZ + 1;
                renderStickers();
            }
        }
    });

    if (elements.mainContainer && elements.dragDropOverlay) {
        let enterCounter = 0;
        elements.mainContainer.addEventListener('dragenter', (e) => { e.preventDefault(); e.stopPropagation(); enterCounter++; if (enterCounter === 1) elements.dragDropOverlay!.classList.remove('hidden'); });
        elements.dragDropOverlay.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); enterCounter--; if (enterCounter === 0) elements.dragDropOverlay!.classList.add('hidden'); });
        elements.dragDropOverlay.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
        elements.dragDropOverlay.addEventListener('drop', (e) => {
            e.preventDefault(); e.stopPropagation(); enterCounter = 0; elements.dragDropOverlay!.classList.add('hidden');
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                const activeTab = getActiveTab();
                if (activeTab && activeTab.analyses.length > 0) {
                    state.tempDroppedFiles = Array.from(files);
                    if(elements.dropOptions) elements.dropOptions.classList.remove('hidden');
                } else handleFiles(Array.from(files), 'replace');
            }
        });
        elements.dropReplaceBtn?.addEventListener('click', () => { if (state.tempDroppedFiles.length > 0) handleFiles(state.tempDroppedFiles, 'replace'); if(elements.dropOptions) elements.dropOptions.classList.add('hidden'); state.tempDroppedFiles = []; });
        elements.dropAddBtn?.addEventListener('click', () => { if (state.tempDroppedFiles.length > 0) handleFiles(state.tempDroppedFiles, 'add'); if(elements.dropOptions) elements.dropOptions.classList.add('hidden'); state.tempDroppedFiles = []; });
        elements.dropCancelBtn?.addEventListener('click', () => { if(elements.dropOptions) elements.dropOptions.classList.add('hidden'); state.tempDroppedFiles = []; });
    }

    const tabsContainer = document.getElementById('tabs-container');
    if(tabsContainer){
        tabsContainer.addEventListener('click', e => {
            const target = e.target as HTMLElement;
            if (target.closest('#add-tab-btn')) { addNewTab(); return; }
            const tabEl = target.closest('.tab-item');
            if (tabEl instanceof HTMLElement) {
                const index = parseInt(tabEl.dataset.index ?? '-1');
                const closeBtn = target.closest('.tab-close-btn');
                if (closeBtn && closeBtn.parentElement === tabEl) {
                     deleteTab(index);
                } else {
                     switchTab(index);
                }
            }
        });
        tabsContainer.addEventListener('dblclick', e => {
            const tabNameEl = (e.target as HTMLElement).closest('.tab-name');
            if (tabNameEl) {
                const tabEl = tabNameEl.closest('.tab-item');
                if (tabEl instanceof HTMLElement) {
                    const index = parseInt(tabEl.dataset.index ?? '-1');
                    if (index !== -1) renameTab(index, tabNameEl as HTMLElement);
                }
            }
        });

        // Tab Reordering Logic
        let draggedTabIndex: number | null = null;
        tabsContainer.addEventListener('dragstart', (e) => {
            const target = e.target as HTMLElement;
            const tabEl = target.closest('.tab-item');
            if (tabEl instanceof HTMLElement && e.dataTransfer) {
                draggedTabIndex = parseInt(tabEl.dataset.index ?? '-1');
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => tabEl.classList.add('opacity-50'), 0);
            }
        });

        tabsContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            const target = e.target as HTMLElement;
            const tabEl = target.closest('.tab-item');
            if (tabEl && draggedTabIndex !== null) {
                document.querySelectorAll('.tab-item.drag-over').forEach(el => el.classList.remove('drag-over'));
                tabEl.classList.add('drag-over');
            }
        });

        tabsContainer.addEventListener('dragleave', (e) => {
            const target = e.target as HTMLElement;
            const tabEl = target.closest('.tab-item');
            if (tabEl) {
                tabEl.classList.remove('drag-over');
            }
        });

        tabsContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            const target = e.target as HTMLElement;
            const dropTarget = target.closest('.tab-item');
            if (dropTarget instanceof HTMLElement && draggedTabIndex !== null) {
                const dropIndex = parseInt(dropTarget.dataset.index ?? '-1');
                const [draggedTab] = state.tabs.splice(draggedTabIndex, 1);
                state.tabs.splice(dropIndex, 0, draggedTab);

                // Update active index after reordering
                if (state.activeTabIndex === draggedTabIndex) {
                    state.activeTabIndex = dropIndex;
                } else if (draggedTabIndex < state.activeTabIndex && dropIndex >= state.activeTabIndex) {
                    state.activeTabIndex--;
                } else if (draggedTabIndex > state.activeTabIndex && dropIndex <= state.activeTabIndex) {
                    state.activeTabIndex++;
                }
                
                renderTabs(); // Re-render to reflect new order
            }
        });

        tabsContainer.addEventListener('dragend', (e) => {
            const target = e.target as HTMLElement;
            const tabEl = target.closest('.tab-item');
            if(tabEl) tabEl.classList.remove('opacity-50');
            document.querySelectorAll('.tab-item.drag-over').forEach(el => el.classList.remove('drag-over'));
            draggedTabIndex = null;
        });
    }

    elements.addStickerButton?.addEventListener('click', () => {
        const activeTab = getActiveTab();
        if (!activeTab) return;
        const maxZ = activeTab.stickers.reduce((max, s) => Math.max(max, s.zIndex), 0);
        const newSticker = new StickerState(state.nextStickerId++, maxZ + 1);
        activeTab.stickers.push(newSticker);
        renderStickers();
    });

    elements.stickerContainer?.addEventListener('mousedown', e => {
        const target = e.target as HTMLElement;
        const stickerEl = target.closest<HTMLElement>('.sticker-panel');
        if (!stickerEl) return;
        const stickerId = parseInt(stickerEl.dataset.stickerId || '-1');
        const activeTab = getActiveTab();
        if (!activeTab || stickerId === -1) return;
        const stickerState = activeTab.stickers.find(s => s.id === stickerId);
        if (!stickerState) return;
        const maxZ = activeTab.stickers.reduce((max, s) => Math.max(max, s.zIndex), 0);
        if (stickerState.zIndex < maxZ) {
            stickerState.zIndex = maxZ + 1;
            renderStickers();
        }
        if (target.classList.contains('resize-handle')) {
            e.preventDefault(); e.stopPropagation();
            const initial = { w: stickerEl.offsetWidth, h: stickerEl.offsetHeight, x: e.clientX, y: e.clientY };
            const onMouseMove = (ev: MouseEvent) => {
                stickerState.width = Math.max(150, initial.w + ev.clientX - initial.x);
                stickerState.height = Math.max(100, initial.h + ev.clientY - initial.y);
                stickerEl.style.width = `${stickerState.width}px`;
                stickerEl.style.height = `${stickerState.height}px`;
            };
            const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        } else if (target.closest('.sticker-header')) {
            if (target.matches('.sticker-title-input')) {
                return;
            }
            e.preventDefault(); e.stopPropagation();
            const initial = { x: e.clientX, y: e.clientY, stickerX: stickerEl.offsetLeft, stickerY: stickerEl.offsetTop };
             const onMouseMove = (ev: MouseEvent) => {
                stickerState.x = initial.stickerX + (ev.clientX - initial.x);
                stickerState.y = initial.stickerY + (ev.clientY - initial.y);
                stickerEl.style.left = `${stickerState.x}px`;
                stickerEl.style.top = `${stickerState.y}px`;
            };
            const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }
    });

    elements.stickerContainer?.addEventListener('click', e => {
        const target = e.target as HTMLElement;
        const stickerEl = target.closest<HTMLElement>('.sticker-panel');
        if (!stickerEl) return;
        const stickerId = parseInt(stickerEl.dataset.stickerId || '-1');
        const activeTab = getActiveTab();
        if (!activeTab || stickerId === -1) return;
        const stickerIndex = activeTab.stickers.findIndex(s => s.id === stickerId);
        if (stickerIndex === -1) return;
        if (target.closest('.sticker-settings-btn')) {
            e.stopPropagation();
            stickerEl.querySelector<HTMLElement>('.sticker-settings-popover')?.classList.toggle('open');
        }
        else if (target.closest('.sticker-minimize-btn')) { activeTab.stickers[stickerIndex].isMinimized = true; renderStickers(); }
        else if (target.closest('.sticker-close-btn')) { activeTab.stickers.splice(stickerIndex, 1); renderStickers(); }
    });
    
    elements.stickerContainer?.addEventListener('input', e => {
        const target = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        const stickerEl = target.closest<HTMLElement>('.sticker-panel');
        if (!stickerEl) return;
        const stickerId = parseInt(stickerEl.dataset.stickerId || '-1');
        const activeTab = getActiveTab();
        if (!activeTab) return;
        const stickerState = activeTab.stickers.find(s => s.id === stickerId);
        if (!stickerState) return;
        
        if (target.matches('.sticker-title-input')) { stickerState.title = target.value; }
        else if (target.matches('.sticker-textarea')) { stickerState.content = target.value; }
        else if (target.matches('.sticker-bg-color-input')) { stickerState.color = target.value; stickerEl.style.backgroundColor = stickerState.color; }
        else if (target.matches('.sticker-font-color-input')) { stickerState.fontColor = target.value; stickerEl.style.color = stickerState.fontColor; }
        else if (target.matches('.sticker-font-size-input')) { stickerState.fontSize = parseInt(target.value, 10) || 14; (stickerEl.querySelector('.sticker-textarea') as HTMLElement).style.fontSize = `${stickerState.fontSize}px`; }
        else if (target.matches('.sticker-font-select')) { stickerState.font = target.value; stickerEl.style.fontFamily = stickerState.font; }
    });

    elements.stickerContainer?.addEventListener('focusin', e => {
        const target = e.target as HTMLElement;
        if (target.matches('.sticker-textarea')) {
            const stickerEl = target.closest<HTMLElement>('.sticker-panel');
            const stickerId = parseInt(stickerEl?.dataset.stickerId || '-1');
            const stickerState = getActiveTab()?.stickers.find(s => s.id === stickerId);
            if (stickerState?.placeholderActive) {
                (target as HTMLTextAreaElement).value = '';
                target.classList.remove('placeholder-active');
                stickerState.placeholderActive = false;
            }
        }
    });

    elements.stickerContainer?.addEventListener('focusout', e => {
        const target = e.target as HTMLElement;
        if (target.matches('.sticker-textarea')) {
            const stickerEl = target.closest<HTMLElement>('.sticker-panel');
            const stickerId = parseInt(stickerEl?.dataset.stickerId || '-1');
            const stickerState = getActiveTab()?.stickers.find(s => s.id === stickerId);
            if (stickerState && (target as HTMLTextAreaElement).value.trim() === '') {
                stickerState.content = '';
                (target as HTMLTextAreaElement).value = 'Nova nota...';
                target.classList.add('placeholder-active');
                stickerState.placeholderActive = true;
            }
        }
    });

    document.getElementById('workflow-stepper')?.addEventListener('click', (e) => {
        const stepEl = (e.target as HTMLElement).closest<HTMLElement>('.workflow-step');
        if (stepEl) {
            const stepIndex = parseInt(stepEl.dataset.step || '-1');
            const analysis = getActiveAnalysis();
            if (!analysis) return;

            // If a completed analysis is clicked, un-complete it for editing.
            if (analysis.isCompleted) {
                analysis.isCompleted = false;
                analysis.isCurrentAnalysisSaved = false; // Mark for re-saving upon completion
            }

            const coreStepComplete = analysis.manualDrawnPath.length > 0;
            const isUnlocked = stepIndex <= 1 || coreStepComplete;
            if (stepIndex !== -1 && isUnlocked) goToWorkflowStep(stepIndex);
        }
    });
    
    // Speed Analysis Panel Listener
    elements.calculateSpeedsBtn?.addEventListener('click', () => {
        import('./results').then(m => m.calculateAndDisplaySpeeds());
    });

    const mobileOverlay = document.getElementById('mobile-panel-overlay');
    if (mobileOverlay) {
        mobileOverlay.addEventListener('click', () => {
            // Deactivate all header buttons that toggle panels
            document.querySelectorAll('#header-project-btn, #header-analysis-btn, #header-adjustments-btn, #header-options-btn, #header-shortcuts-btn, #header-help-btn, #header-speed-btn, #view-controls-icon-btn').forEach(btn => {
                btn.classList.remove('active');
            });
    
            // Hide all floating panels/drawers
            elements.allPopupPanels.forEach(panel => {
                if (panel) {
                    panel.classList.add('hidden');
                }
            });
        });
    }

    addNewTab();
    updateFullscreenButton(!!document.fullscreenElement);
}