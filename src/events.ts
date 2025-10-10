import * as elements from './elements';
import { state, getActiveTab, getActiveAnalysis, StickerState } from './state';
import { requestRedraw, resetView, zoomTo, getMousePos, paintOnCanvas } from './canvas';
import { applyImageFilters, handleFiles, loadImageByIndex, resetImageAdjustments, deleteCurrentImage } from './image';
import { setMode, updateUIMode, initializePanels, syncCheckboxes, completeStepAndAdvance, switchTab, addNewTab, deleteTab, renderTabs, updateFullscreenButton, renameTab, renderStickers, updateCellCounters, goToWorkflowStep, minimizePanel, restorePanel, makeDraggable } from './ui';
import { analyzeSpheroid, refineContour, runMagicWand, processPaintedSpheroid, processPaintedMargin } from './analysis';
import { addToCumulativeResults, clearCumulativeResults, copyCumulativeCsv, saveCumulativeCsv, openInSheets, deleteCumulativeResult, saveProject, loadProject, updateResultsDisplay, calculateAndStoreMigrationMetrics } from './results';
import { handleGlobalKeyDown } from './shortcuts';
import { isPointInEllipse, simplifyPath, debounce, createParticleFromPixels, isCellPositionValid, showToast } from './utils';

const requestFilterAndRedraw = debounce(() => { 
    const analysis = getActiveAnalysis();
    if(analysis) applyImageFilters(analysis); 
}, 250);

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
            state.tabs = [];
            addNewTab();
            const newProjectName = 'Novo Projeto';
            if (elements.projectNameInput) elements.projectNameInput.value = newProjectName;
            if (elements.headerProjectNameInput) elements.headerProjectNameInput.value = newProjectName;
        }
    });

    elements.saveProjectButton?.addEventListener('click', saveProject);
    elements.loadProjectInput?.addEventListener('change', (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) loadProject(file);
    });

    elements.projectNameInput?.addEventListener('input', () => {
        if (elements.headerProjectNameInput) elements.headerProjectNameInput.value = elements.projectNameInput.value;
    });
    elements.headerProjectNameInput?.addEventListener('input', () => {
        if (elements.projectNameInput) elements.projectNameInput.value = elements.headerProjectNameInput.value;
    });

    elements.resetButton?.addEventListener('click', () => {
        const analysis = getActiveAnalysis();
        const activeTab = getActiveTab();
        if (analysis && analysis.originalImage && activeTab) {
            loadImageByIndex(activeTab.currentAnalysisIndex);
        }
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
            elements.bitStatus.className += ' bg-teal-500/80 text-white';
        }
        (elements.convertTo8BitButton as HTMLButtonElement).disabled = true;
        [elements.paintSpheroidButton, elements.drawSpheroidButton, elements.magicPaintButton, elements.undoPointButton].forEach(b => { if (b) (b as HTMLButtonElement).disabled = false });
        completeStepAndAdvance();
    });

    [elements.drawSpheroidButton, elements.magicPaintButton, elements.drawMarginButton, elements.setHaloPointButton, elements.setMigrationPointButton].forEach(btn => {
        if (btn) btn.addEventListener('click', () => setMode((btn as HTMLElement).dataset.mode));
    });

    elements.paintSpheroidButton?.addEventListener('click', () => { setMode(null); state.paintModeContext = 'spheroid'; updateUIMode(); });
    elements.paintMarginButton?.addEventListener('click', () => { setMode(null); state.paintModeContext = 'margin'; updateUIMode(); });
    elements.selectBackgroundButton?.addEventListener('click', () => setMode('selectBackground'));
    elements.refineContourButton?.addEventListener('click', refineContour);
    elements.smoothMarginButton?.addEventListener('click', () => {
        const analysis = getActiveAnalysis();
        if (!analysis || analysis.migrationMarginPath.length < 3) return;
        analysis.migrationMarginPath = simplifyPath(analysis.migrationMarginPath, 5);
        requestRedraw();
        updateResultsDisplay();
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
    });

    elements.clearMarginButton?.addEventListener('click', () => {
        const analysis = getActiveAnalysis();
        if (analysis) analysis.migrationMarginPath = [];
        requestRedraw();
        updateResultsDisplay();
        updateUIMode();
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
    });

    elements.confirmCellCountButton?.addEventListener('click', () => {
        const analysis = getActiveAnalysis();
        if (!analysis || !analysis.lastAnalysisResult) return;
        analysis.lastAnalysisResult.cellCount = analysis.detectedParticles.length;
        updateResultsDisplay();
        showToast('Contagem de células confirmada!');
        completeStepAndAdvance();
    });

    elements.confirmAnalysisButton?.addEventListener('click', () => {
        addToCumulativeResults();
        showToast('Análise concluída e registrada!');
        if (elements.analysisWorkflowPanel) {
            elements.analysisWorkflowPanel.classList.add('hidden');
            document.getElementById('header-analysis-btn')?.classList.remove('active');
        }
        goToWorkflowStep(0);
    });

    if (elements.resultCanvas) {
        elements.resultCanvas.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const analysis = getActiveAnalysis();
            if (!analysis || e.button !== 0) return;
            state.isDrawing = true;
            state.mouseDownPos = { x: e.clientX, y: e.clientY };
            const pos = getMousePos(e);

            if (state.paintModeContext) {
                state.lastPaintPos = pos;
                paintOnCanvas(state.lastPaintPos, state.lastPaintPos, elements.paintSpheroidCanvas);
            } else if (state.currentMode === 'drawSpheroid') {
                state.drawnPath = [pos];
                analysis.manualDrawnPath = [];
            } else if (state.currentMode === 'drawMargin') {
                state.drawnPath = [pos];
                analysis.migrationMarginPath = [];
            } else if (!state.currentMode) {
                state.isPanning = true;
                state.panStart = { x: e.clientX - state.pan.x, y: e.clientY - state.pan.y };
                elements.resultCanvas.style.cursor = 'grabbing';
            }
        });

        elements.resultCanvas.addEventListener('mousemove', (e) => {
            e.preventDefault();
            const analysis = getActiveAnalysis();
            if (!analysis) return;
            const currentPos = getMousePos(e);
            if (state.isDrawing) {
                if (state.paintModeContext) {
                    paintOnCanvas(state.lastPaintPos!, currentPos, elements.paintSpheroidCanvas);
                } else if (state.currentMode === 'drawSpheroid' || state.currentMode === 'drawMargin') {
                    state.drawnPath.push(currentPos);
                } else if (state.isPanning) {
                    state.pan.x = e.clientX - state.panStart.x;
                    state.pan.y = e.clientY - state.panStart.y;
                }
                state.lastPaintPos = currentPos;
                requestRedraw();
            }
            if (analysis.originalImage && elements.pixelInspector) {
                const x = Math.floor(currentPos.x);
                const y = Math.floor(currentPos.y);
                if (x >= 0 && x < analysis.originalImage.width && y >= 0 && y < analysis.originalImage.height) {
                    const ctx = elements.processedImageCanvas.getContext('2d', { willReadFrequently: true });
                    const brightness = ctx ? ctx.getImageData(x, y, 1, 1).data[0] : 0;
                    elements.pixelInspector.innerHTML = `X:${x} Y:${y} B:${255 - brightness}`;
                    elements.pixelInspector.classList.remove('hidden');
                } else {
                    elements.pixelInspector.classList.add('hidden');
                }
            }
        });
        
        elements.resultCanvas.addEventListener('mouseleave', () => {
            if (elements.pixelInspector) elements.pixelInspector.classList.add('hidden');
        });

        elements.resultCanvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = elements.canvasContainer?.getBoundingClientRect();
            if (!rect) return;
            zoomTo(e.deltaY < 0 ? state.zoom * 1.2 : state.zoom / 1.2, { x: e.clientX - rect.left, y: e.clientY - rect.top });
        });
    }

    window.addEventListener('mouseup', (e) => {
        if (e.button !== 0) return;
        const analysis = getActiveAnalysis();
        if (!analysis) return;

        const wasDrawing = state.isDrawing;
        state.isDrawing = false;
        state.lastPaintPos = null;

        const finalizePath = (pathType: 'spheroid' | 'margin') => {
            const simplified = simplifyPath(state.drawnPath, 1.5);
            if (simplified.length > 3) {
                if (pathType === 'spheroid') {
                    analysis.manualDrawnPath = [...simplified, simplified[0]];
                    analyzeSpheroid();
                } else {
                    analysis.migrationMarginPath = [...simplified, simplified[0]];
                    updateResultsDisplay();
                }
            } else {
                if (pathType === 'spheroid') analysis.manualDrawnPath = [];
                else analysis.migrationMarginPath = [];
            }
            state.drawnPath = [];
            setMode(null);
        };

        if ((state.currentMode === 'drawSpheroid' || state.currentMode === 'drawMargin') && wasDrawing) {
            finalizePath(state.currentMode === 'drawSpheroid' ? 'spheroid' : 'margin');
            return;
        }

        const wasPanning = state.isPanning;
        if (state.isPanning) {
            state.isPanning = false;
            if (!state.currentMode && !state.paintModeContext && elements.resultCanvas) elements.resultCanvas.style.cursor = 'grab';
        }

        const mouseUpPos = { x: e.clientX, y: e.clientY };
        const isDrag = !state.mouseDownPos || Math.hypot(mouseUpPos.x - state.mouseDownPos.x, mouseUpPos.y - state.mouseDownPos.y) > 4;
        state.mouseDownPos = null;

        if (wasPanning || isDrag) return;
        const pos = getMousePos(e);
        
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
                if (analysis.currentAnalysisStep === 2) completeStepAndAdvance();
                break;
            }
            case 'setHaloPoint': {
                if (!analysis.lastAnalysisResult.centerX) return;
                const { centerX, centerY } = analysis.lastAnalysisResult;
                analysis.haloRadiusData = { radius: Math.hypot(pos.x - centerX, pos.y - centerY), angle: Math.atan2(pos.y - centerY, pos.x - centerX) };
                calculateAndStoreMigrationMetrics();
                setMode(null);
                break;
            }
        }
    });

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

    elements.confirmPaintButton?.addEventListener('click', () => {
        if (state.paintModeContext === 'spheroid') processPaintedSpheroid();
        else if (state.paintModeContext === 'margin') processPaintedMargin();
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

    elements.addCumulativeButton?.addEventListener('click', addToCumulativeResults);
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
            const coreStepComplete = getActiveAnalysis()?.manualDrawnPath.length ?? 0 > 0;
            const isUnlocked = stepIndex <= 1 || coreStepComplete;
            if (stepIndex !== -1 && isUnlocked) goToWorkflowStep(stepIndex);
        }
    });
    
    // No-op sync checkboxes since fullscreen duplicates were removed.
    // This could be revived if a separate fullscreen UI is added back.
    // syncCheckboxes(elements.showHaloRadiusCircleCheckbox, elements.fsShowHaloRadiusCircleCheckbox);


    addNewTab();
    updateFullscreenButton(!!document.fullscreenElement);
}