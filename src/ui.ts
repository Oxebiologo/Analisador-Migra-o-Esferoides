import * as elements from './elements';
import { state, getActiveTab, createNewTab, TabState, StickerState, getActiveAnalysis } from './state';
import { requestRedraw } from './canvas';
import { loadImageByIndex } from './image';
import { addToCumulativeResults } from './results';

const panelMetadata: { [key: string]: { title: string; icon: string; panelEl: HTMLElement | null } } = {
    'results': {
        title: 'Resultados',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="text-teal-400" viewBox="0 0 16 16"><path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H2zm12 1a.5.5 0 0 1 .5.5v10.5a.5.5 0 0 1-.5-.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5H14zM4 4h8v1H4V4zm0 2h8v1H4V6zm0 2h8v1H4V8zm0 2h4v1H4v-1z"/></svg>`,
        panelEl: elements.resultsContainer
    },
    'cumulative': {
        title: 'Resultados Acumulados',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-teal-400"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`,
        panelEl: elements.cumulativeResultsContainer
    }
};

export function setMode(newMode: string | null) {
    if (state.paintModeContext) {
        state.paintModeContext = null;
        if (elements.brushControls) elements.brushControls.classList.add('hidden');
    }
    state.currentMode = (state.currentMode === newMode) ? null : newMode;
    updateUIMode();
}

export function updateUIMode() {
    const analysis = getActiveAnalysis();

    document.querySelectorAll('.manual-button').forEach(b => b.classList.remove('active'));
    if (elements.brushControls) elements.brushControls.classList.add('hidden');
    if (elements.magicWandControls) elements.magicWandControls.classList.add('hidden');
    
    let statusText = '', cursorStyle = 'grab';

    if (state.paintModeContext) {
        if (elements.brushControls) elements.brushControls.classList.remove('hidden');
        cursorStyle = 'crosshair';
        if (state.paintModeContext === 'spheroid') statusText = 'Pinte sobre o esferoide.';
        else if (state.paintModeContext === 'margin') statusText = 'Pinte a área de migração.';
        else if (state.paintModeContext === 'eraser') statusText = 'Use o pincel para apagar partes da pintura.';
    } else if (state.currentMode) {
        const activeBtn = document.querySelector(`.manual-button[data-mode="${state.currentMode}"]`) || document.getElementById(state.currentMode + 'Button');
        activeBtn?.classList.add('active');

        switch (state.currentMode) {
            case 'drawSpheroid': statusText = 'Clique e arraste para desenhar o contorno.'; cursorStyle = 'crosshair'; break;
            case 'magicPaint': statusText = 'Clique no esferoide para seleção mágica.'; cursorStyle = 'crosshair'; if (elements.magicWandControls) elements.magicWandControls.classList.remove('hidden'); break;
            case 'drawMargin': statusText = 'Desenhe a borda ao redor das células.'; cursorStyle = 'crosshair'; break;
            case 'setHaloPoint': statusText = 'Clique para definir o raio do halo.'; cursorStyle = 'pointer'; break;
            case 'setMigrationPoint': statusText = 'Clique na célula mais distante.'; cursorStyle = 'pointer'; break;
            case 'selectBackground': statusText = 'Clique na cor de fundo para remover.'; cursorStyle = 'copy'; elements.selectBackgroundButton?.classList.add('active'); break;
            case 'addCell': statusText = 'Clique para ADICIONAR uma célula.'; cursorStyle = 'crosshair'; break;
            case 'removeCell': statusText = 'Clique em uma célula para REMOVER.'; cursorStyle = 'pointer'; break;
        }
    }
    if(elements.cellCounterStatus) elements.cellCounterStatus.textContent = statusText;
    if (elements.resultCanvas) elements.resultCanvas.style.cursor = cursorStyle;

    if (analysis) {
        const hasCore = analysis.manualDrawnPath.length > 0;
        const hasMargin = analysis.migrationMarginPath.length > 0;
        if (elements.undoPointButton) (elements.undoPointButton as HTMLButtonElement).disabled = !hasCore && elements.paintSpheroidCanvas.getContext('2d')?.getImageData(1, 1, 1, 1).data[3] === 0;
        if (elements.refineContourButton) elements.refineContourButton.disabled = !hasCore;
        if (elements.drawMarginButton) (elements.drawMarginButton as HTMLButtonElement).disabled = !analysis.lastAnalysisResult.centerX;
        if (elements.smoothMarginButton) (elements.smoothMarginButton as HTMLButtonElement).disabled = !hasMargin;
        if (elements.paintMarginButton) (elements.paintMarginButton as HTMLButtonElement).disabled = !analysis.lastAnalysisResult.centerX;
        if (elements.clearMarginButton) (elements.clearMarginButton as HTMLButtonElement).disabled = !hasMargin;
    }
}

export function renderMinimizedPanels() {
    if (!elements.minimizedPanelsBar) return;
    const minimizedPanels = state.minimizedPanels.map(key => {
        const meta = panelMetadata[key];
        if (!meta) return null;
        const button = document.createElement('button');
        button.className = 'flex w-14 h-14 bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-full shadow-2xl items-center justify-center hover:bg-gray-700 transition-all';
        button.title = `Restaurar ${meta.title}`;
        button.dataset.panelKey = key;
        button.innerHTML = meta.icon;
        return button;
    }).filter(Boolean);

    // This will be called from renderStickers, so we need to clear previous content
    // and then let renderStickers append its own items.
    const panelButtons = elements.minimizedPanelsBar.querySelectorAll('[data-panel-key]');
    panelButtons.forEach(btn => btn.remove());
    
    minimizedPanels.forEach(button => {
        if (button) elements.minimizedPanelsBar.prepend(button);
    });
}

export function minimizePanel(key: string) {
    const meta = panelMetadata[key];
    if (!meta || !meta.panelEl) return;
    meta.panelEl.classList.add('hidden');
    if (!state.minimizedPanels.includes(key)) {
        state.minimizedPanels.push(key);
    }
    renderMinimizedPanels();
}

export function restorePanel(key: string) {
    const meta = panelMetadata[key];
    if (!meta || !meta.panelEl) return;
    meta.panelEl.classList.remove('hidden');
    state.minimizedPanels = state.minimizedPanels.filter(p => p !== key);
    renderMinimizedPanels();
}


export function updateCellCounters() {
    const analysis = getActiveAnalysis();
    if (!analysis || !elements.totalCellCounter) return;
    elements.totalCellCounter.textContent = String(analysis.detectedParticles.length);
}

export function updateFullscreenButton(isFullscreen: boolean) {
    if (elements.fullscreenButton) {
        elements.fullscreenButton.innerHTML = isFullscreen ?
            `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>` :
            `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
    }
}

export function setSaveButtonState(disabled: boolean) {
    if (elements.saveAnalyzedButton) elements.saveAnalyzedButton.disabled = disabled;
    if (elements.addCumulativeButton) elements.addCumulativeButton.disabled = disabled;
    // Do NOT disable the saveProjectButton here, it should always be available.
}

export function makeDraggable(popup: HTMLElement, handleSelector?: string) {
    const handle = handleSelector ? popup.querySelector(handleSelector) as HTMLElement : popup;
    if (!handle) return;

    let lastX: number, lastY: number;

    const onDragStart = (clientX: number, clientY: number) => {
        // Prevent dragging on mobile where panels are drawers
        if (window.innerWidth <= 768) {
            return;
        }
        lastX = clientX;
        lastY = clientY;
        document.addEventListener('mousemove', onMouseDragMove);
        document.addEventListener('mouseup', onDragEnd);
        document.addEventListener('touchmove', onTouchDragMove, { passive: false });
        document.addEventListener('touchend', onDragEnd);
    };

    const onDragMove = (clientX: number, clientY: number) => {
        const dx = clientX - lastX;
        const dy = clientY - lastY;
        lastX = clientX;
        lastY = clientY;
        popup.style.top = (popup.offsetTop + dy) + "px";
        popup.style.left = (popup.offsetLeft + dx) + "px";
    };
    
    const onMouseDragMove = (e: MouseEvent) => {
        onDragMove(e.clientX, e.clientY);
    };
    
    const onTouchDragMove = (e: TouchEvent) => {
        e.preventDefault();
        if (e.touches.length > 0) {
            onDragMove(e.touches[0].clientX, e.touches[0].clientY);
        }
    };

    const onDragEnd = () => {
        document.removeEventListener('mousemove', onMouseDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        document.removeEventListener('touchmove', onTouchDragMove);
        document.removeEventListener('touchend', onDragEnd);
    };

    const onMouseDown = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, input, select, textarea, a')) return;
        e.preventDefault();
        onDragStart(e.clientX, e.clientY);
    };

    const onTouchStart = (e: TouchEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, input, select, textarea, a')) return;
        if (e.touches.length === 1) {
            e.preventDefault();
            onDragStart(e.touches[0].clientX, e.touches[0].clientY);
        }
    };

    handle.addEventListener('mousedown', onMouseDown);
    handle.addEventListener('touchstart', onTouchStart, { passive: false });
}

function makeResizable(popup: HTMLElement) {
    const handle = popup.querySelector('.resize-handle') as HTMLElement;
    if (!handle) return;
    handle.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        let initW = popup.offsetWidth, initH = popup.offsetHeight, initX = e.clientX, initY = e.clientY;
        const onMouseMove = (ev: MouseEvent) => {
            popup.style.width = (initW + ev.clientX - initX) + 'px';
            popup.style.height = (initH + ev.clientY - initY) + 'px';
        };
        const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

export function syncCheckboxes(checkbox1: HTMLInputElement | null, checkbox2: HTMLInputElement | null) {
    if (!checkbox1 || !checkbox2) return;
    const sync = (s: HTMLInputElement, t: HTMLInputElement) => { if (s.checked !== t.checked) { t.checked = s.checked; t.dispatchEvent(new Event('input', { bubbles: true })); } };
    checkbox1.addEventListener('change', () => sync(checkbox1, checkbox2));
    checkbox2.addEventListener('change', () => sync(checkbox2, checkbox1));
}

export function initializePanels() {
    const panels = {
        'project': { btn: 'header-project-btn', panel: 'project-panel', content: ['project-section', 'upload-section'], title: 'Projeto & Arquivos' },
        'analysis': { btn: 'header-analysis-btn', panel: 'analysis-workflow-panel', content: ['analysis-workflow-section'], title: 'Fluxo de Análise' },
        'adjustments': { btn: 'header-adjustments-btn', panel: 'adjustments-panel', content: ['adjustments-section'], title: 'Ajustes de Imagem' },
        'options': { btn: 'header-options-btn', panel: 'options-panel', content: ['options-section'], title: 'Opções & Configurações' },
        'shortcuts': { btn: 'header-shortcuts-btn', panel: 'shortcuts-panel', content: ['shortcuts-section'], title: 'Atalhos do Teclado' },
        'view': { btn: 'view-controls-icon-btn', panel: 'view-controls-panel', content: ['view-controls-section'], title: 'Visualização' },
        'speed': { btn: 'header-speed-btn', panel: 'speed-analysis-panel', content: ['speed-analysis-section'], title: 'Análise de Velocidade' },
        'help': { btn: 'header-help-btn', panel: 'help-panel', content: ['help-section'], title: 'Ajuda & Tutorial' }
    };

    for (const key in panels) {
        const p = panels[key as keyof typeof panels];
        const panelEl = document.getElementById(p.panel) as HTMLElement;
        const buttonEl = document.getElementById(p.btn);
        if (panelEl && buttonEl) {
            panelEl.innerHTML = `<div class="popup-header flex items-center justify-between p-2 border-b border-gray-700"><h3 class="font-bold text-base ml-2">${p.title}</h3><button class="close-panel-btn p-1 rounded-md hover:bg-gray-700"><svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/></svg></button></div><div class="panel-content overflow-y-auto"></div><div class="resize-handle"></div>`;
            const contentContainer = panelEl.querySelector('.panel-content');
            p.content.forEach(id => {
                const contentEl = document.getElementById(id);
                if (contentEl) contentContainer?.appendChild(contentEl);
            });
            makeDraggable(panelEl, '.popup-header'); makeResizable(panelEl);
            
            buttonEl.addEventListener('click', () => {
                panelEl.classList.toggle('hidden');
                buttonEl.classList.toggle('active', !panelEl.classList.contains('hidden'));
                if (key === 'speed' && !panelEl.classList.contains('hidden')) {
                    import('./results').then(m => m.populateSpeedAnalysisPanel());
                }
            });
            panelEl.querySelector('.close-panel-btn')?.addEventListener('click', () => { panelEl.classList.add('hidden'); buttonEl.classList.remove('active'); });
        }
    }
    if (elements.resultsContainer) { makeDraggable(elements.resultsContainer, '.popup-header'); makeResizable(elements.resultsContainer); }
    if (elements.cumulativeResultsContainer) { makeDraggable(elements.cumulativeResultsContainer, '.popup-header'); makeResizable(elements.cumulativeResultsContainer); }
    if (elements.brushControls) { makeDraggable(elements.brushControls, '.popup-header'); makeResizable(elements.brushControls); }
}

export function goToWorkflowStep(index: number) {
    const analysis = getActiveAnalysis();
    if (!analysis || index < 0 || index > 4) return;
    
    // Handle completed analyses: show final state, allow editing, but don't auto-start tools.
    if (analysis.isCompleted) {
        // Mark all steps as done and clickable
        document.getElementById('workflow-stepper')?.querySelectorAll<HTMLElement>('.workflow-step').forEach(stepEl => {
            stepEl.classList.add('step-done', 'clickable');
            stepEl.classList.remove('step-active', 'opacity-50', 'pointer-events-none');
        });
        // Hide all step content areas
        document.getElementById('workflow-step-content-container')?.querySelectorAll<HTMLElement>('.step-content-item').forEach(contentEl => {
            contentEl.classList.remove('active');
        });
        if (elements.workflowStepInstruction) {
            elements.workflowStepInstruction.textContent = 'Análise concluída. Clique em uma etapa para editar.';
        }
        analysis.currentAnalysisStep = 4; // Visually show it's at the end
        setMode(null); // Ensure no tool is active
        return; // Exit before tool activation logic
    }

    analysis.currentAnalysisStep = index;
    const coreStepComplete = analysis.manualDrawnPath.length > 0;
    document.getElementById('workflow-stepper')?.querySelectorAll<HTMLElement>('.workflow-step').forEach((stepEl, i) => {
        stepEl.classList.remove('step-active', 'step-done', 'clickable', 'opacity-50', 'pointer-events-none');
        if (i < index) stepEl.classList.add('step-done');
        else if (i === index) stepEl.classList.add('step-active');
        const isUnlocked = i <= 1 || coreStepComplete;
        if (isUnlocked) stepEl.classList.add('clickable');
        else stepEl.classList.add('opacity-50', 'pointer-events-none');
    });
    document.getElementById('workflow-step-content-container')?.querySelectorAll<HTMLElement>('.step-content-item').forEach(contentEl => {
        contentEl.classList.toggle('active', parseInt(contentEl.dataset.step || '-1') === index);
    });

    if (elements.workflowStepInstruction) {
        let instruction = '';
        setMode(null);

        switch (index) {
            case 0:
                instruction = 'Converta a imagem para 8-bit, se necessário.';
                break;
            case 1:
                instruction = 'Pinte ou desenhe o contorno do núcleo do esferoide.';
                break;
            case 2:
                instruction = 'Marque o ponto do halo e o ponto de migração máxima.';
                break;
            case 3:
                instruction = 'Adicione ou remova as células na área de migração.';
                break;
            case 4:
                instruction = 'Defina a borda externa da área de migração.';
                break;
        }
        elements.workflowStepInstruction.textContent = instruction;
    }
}

export function activateStepWorkflow() {
    if (elements.analysisWorkflowPanel) {
        elements.analysisWorkflowPanel.classList.remove('hidden');
        document.getElementById('header-analysis-btn')?.classList.add('active');
    }
    goToWorkflowStep(0);
}

export function completeStepAndAdvance() {
    const analysis = getActiveAnalysis();
    if (!analysis) return;
    const nextStep = analysis.currentAnalysisStep + 1;
    if (nextStep <= 4) goToWorkflowStep(nextStep);
}

export function renderTabs() {
    const tabsContainer = document.getElementById('tabs-container');
    if (!tabsContainer) return;
    tabsContainer.innerHTML = '';
    state.tabs.forEach((tab, index) => {
        const tabEl = document.createElement('div');
        tabEl.className = `tab-item flex items-center justify-between gap-2 px-3 py-1.5 border-b-2 text-sm cursor-pointer hover:bg-gray-700/50 flex-shrink-0 ${index === state.activeTabIndex ? 'active' : ''}`;
        tabEl.dataset.index = String(index);
        tabEl.draggable = true; // Enable dragging for reordering
        tabEl.innerHTML = `<span class="tab-name truncate" title="${tab.name}">${tab.name}</span><button class="tab-close-btn p-1 rounded-full hover:bg-gray-600"><svg width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/></svg></button>`;
        tabsContainer.appendChild(tabEl);
    });
    const addBtn = document.createElement('button');
    addBtn.id = 'add-tab-btn';
    addBtn.className = 'ml-2 px-2 py-1 rounded-md hover:bg-gray-700 text-gray-400';
    addBtn.innerHTML = `<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>`;
    tabsContainer.appendChild(addBtn);
}

export function renameTab(index: number, nameEl: HTMLElement) {
    if (index < 0 || index >= state.tabs.length) return;
    const oldName = state.tabs[index].name;
    nameEl.contentEditable = 'true'; nameEl.focus();
    const selection = window.getSelection(); const range = document.createRange();
    range.selectNodeContents(nameEl); selection?.removeAllRanges(); selection?.addRange(range);
    const onBlur = () => {
        nameEl.contentEditable = 'false';
        state.tabs[index].name = nameEl.textContent?.trim() || oldName;
        nameEl.textContent = state.tabs[index].name;
        cleanup();
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); } else if (e.key === 'Escape') { nameEl.textContent = oldName; nameEl.blur(); }};
    const cleanup = () => { nameEl.removeEventListener('blur', onBlur); nameEl.removeEventListener('keydown', onKeyDown); };
    nameEl.addEventListener('blur', onBlur); nameEl.addEventListener('keydown', onKeyDown);
}

export function addNewTab() {
    const newTab = createNewTab();
    state.tabs.push(newTab);
    switchTab(state.tabs.length - 1);
}

export function deleteTab(index: number) {
    if (index < 0 || index >= state.tabs.length) return;
    if (state.tabs.length === 1) {
        if (confirm('Isto irá limpar a última aba. Deseja continuar?')) {
            const oldId = state.tabs[0].id;
            state.tabs[0] = new TabState(oldId, `Aba ${oldId}`);
            switchTab(0, true);
        }
        return;
    }
    const wasActive = state.activeTabIndex === index;
    state.tabs.splice(index, 1);
    if (wasActive) state.activeTabIndex = Math.max(0, index - 1);
    else if (state.activeTabIndex > index) state.activeTabIndex--;
    switchTab(state.activeTabIndex, true);
}

export function switchTab(index: number, forceReload = false) {
    if (!forceReload && (index < 0 || index >= state.tabs.length || index === state.activeTabIndex)) return;
    addToCumulativeResults(); // Autosave previous
    state.activeTabIndex = index;
    const activeTab = getActiveTab();
    if (!activeTab) return;
    state.drawnPath = []; state.currentMode = null; state.paintModeContext = null; state.backgroundColorToSubtract = null;
    elements.allCanvases.forEach(c => c.getContext('2d')?.clearRect(0, 0, c.width, c.height));
    if (activeTab.analyses.length > 0) loadImageByIndex(activeTab.currentAnalysisIndex);
    else {
        if (elements.initialMessage) elements.initialMessage.style.removeProperty('display');
        if (elements.resultsContainer) elements.resultsContainer.classList.add('hidden');
        if (elements.resetButton) elements.resetButton.disabled = true;
        setSaveButtonState(true);
        if (elements.imageNavControls) elements.imageNavControls.classList.add('hidden');
        if (elements.mainImageNav) elements.mainImageNav.classList.add('hidden');
        document.getElementById('zoom-controls')?.classList.add('hidden');
        if (elements.fileNameDisplay) elements.fileNameDisplay.textContent = 'Nenhuma imagem carregada';
    }
    renderTabs();
    updateCumulativeResultsDisplay();
    renderStickers();
    updateUIMode();
}

export function renderStickers() {
    const activeTab = getActiveTab();
    if (!elements.stickerContainer || !elements.minimizedPanelsBar || !activeTab) return;
    
    // Clear previous stickers from both containers
    elements.stickerContainer.innerHTML = '';
    const minimizedStickerButtons = elements.minimizedPanelsBar.querySelectorAll('.minimized-sticker');
    minimizedStickerButtons.forEach(btn => btn.remove());
    
    // Redraw minimized panels first to maintain order
    renderMinimizedPanels();

    activeTab.stickers.forEach(s => {
        if (s.isMinimized) {
            const el = document.createElement('button');
            el.className = 'minimized-sticker';
            el.dataset.stickerId = String(s.id);
            el.style.backgroundColor = s.color;
            el.style.setProperty('--sticker-color', s.color);
            el.title = s.title;
            elements.minimizedPanelsBar.prepend(el); // Prepend to add from the right
            return;
        }
        const el = document.createElement('div');
        el.className = 'sticker-panel';
        el.dataset.stickerId = String(s.id);
        Object.assign(el.style, { left: `${s.x}px`, top: `${s.y}px`, width: `${s.width}px`, height: `${s.height}px`, backgroundColor: s.color, color: s.fontColor, zIndex: String(s.zIndex), fontFamily: s.font });

        const popover = `
            <div class="sticker-settings-popover">
                <div class="space-y-3">
                    <div class="setting-row">
                        <label>Fundo</label>
                        <input type="color" class="sticker-bg-color-input" value="${s.color}">
                    </div>
                    <div class="setting-row">
                        <label>Fonte</label>
                        <input type="color" class="sticker-font-color-input" value="${s.fontColor}">
                    </div>
                     <div>
                        <label>Tamanho Fonte</label>
                        <input type="number" class="sticker-font-size-input bg-gray-700 w-full text-center border border-gray-600 rounded-md p-1 text-xs" min="8" max="48" value="${s.fontSize}">
                    </div>
                    <div>
                        <label>Tipo de Fonte</label>
                        <select class="sticker-font-select bg-gray-700 border border-gray-600 text-white text-xs rounded-lg block w-full p-1.5">
                            <option value="'Inter', sans-serif" ${s.font === "'Inter', sans-serif" ? 'selected' : ''}>Inter</option>
                            <option value="'Roboto Slab', serif" ${s.font === "'Roboto Slab', serif" ? 'selected' : ''}>Roboto Slab</option>
                            <option value="'Lato', sans-serif" ${s.font === "'Lato', sans-serif" ? 'selected' : ''}>Lato</option>
                            <option value="Arial, sans-serif" ${s.font === "Arial, sans-serif" ? 'selected' : ''}>Arial</option>
                            <option value="'Times New Roman', serif" ${s.font === "'Times New Roman', serif" ? 'selected' : ''}>Times New Roman</option>
                        </select>
                    </div>
                </div>
            </div>
        `;

        el.innerHTML = `
            <div class="sticker-header">
                <input type="text" class="sticker-title-input" value="${s.title}">
                <div class="sticker-controls">
                    <button class="sticker-settings-btn" title="Configurações">
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311a1.464 1.464 0 0 1-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0 2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z"/></svg>
                    </button>
                    ${popover}
                    <button class="sticker-minimize-btn" title="Minimizar">
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M2 8a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11A.5.5 0 0 1 2 8z"/></svg>
                    </button>
                    <button class="sticker-close-btn" title="Fechar">
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/></svg>
                    </button>
                </div>
            </div>
            <div class="sticker-content">
                <textarea class="sticker-textarea ${s.placeholderActive ? 'placeholder-active' : ''}" style="font-size:${s.fontSize}px;">${s.placeholderActive ? 'Nova nota...' : s.content}</textarea>
            </div>
            <div class="resize-handle"></div>
        `;
        elements.stickerContainer?.appendChild(el);
    });
}


/**
 * Renders the cumulative results data from the active tab into an HTML table.
 */
export function updateCumulativeResultsDisplay() {
    const activeTab = getActiveTab();
    if (!elements.cumulativeResultTableContainer || !activeTab) return;

    const hasResults = activeTab.cumulativeResults.length > 0;
    if(elements.copyCumulativeCsvButton) elements.copyCumulativeCsvButton.disabled = !hasResults;
    if(elements.saveCumulativeCsvButton) elements.saveCumulativeCsvButton.disabled = !hasResults;
    if(elements.clearCumulativeButton) elements.clearCumulativeButton.disabled = !hasResults;
    if(elements.openInSheetsButton) elements.openInSheetsButton.disabled = !hasResults;

    if (!hasResults) {
        elements.cumulativeResultTableContainer.innerHTML = '<p class="text-gray-400 text-center p-4">Nenhum resultado adicionado nesta aba.</p>';
        return;
    }

    let tableHtml = `<table class="w-full text-left text-xs text-gray-300">
        <thead class="bg-gray-700/50 uppercase text-gray-400 sticky top-0 backdrop-blur-sm"><tr>
            <th class="px-2 py-1">Arquivo</th><th class="px-2 py-1 text-right">Raio Núcleo (µm)</th>
            <th class="px-2 py-1 text-right">Mig. Halo (µm)</th><th class="px-2 py-1 text-right">Mig. Máx. (µm)</th>
            <th class="px-2 py-1 text-right">Células</th><th class="px-2 py-1 text-right">Área Mig. (µm²)</th>
            <th class="px-2 py-1 text-right">Diâmetro Máx. (µm)</th><th class="px-2 py-1 text-right">Circularidade</th>
            <th class="px-2 py-1 text-right">Esfericidade</th><th class="px-2 py-1 text-right">Compacidade</th>
            <th class="px-2 py-1 text-right">Solidez</th><th class="px-2 py-1 text-right">Convexidade</th>
            <th class="px-2 py-1 text-right">Entropia</th>
            <th class="px-2 py-1 text-right">Skewness</th>
            <th class="px-2 py-1 text-right">Kurtosis</th>
            <th class="px-2 py-1 text-right">Média (GL)</th>
            <th class="px-2 py-1 text-right">Variância (GL)</th>
            <th class="px-2 py-1 text-right">Grad. Médio</th>
            <th class="px-2 py-1 text-right">Var. Gradiente</th>
            <th class="px-2 py-1 text-center">Ações</th>
        </tr></thead><tbody>`;
    
    activeTab.cumulativeResults.forEach((res, index) => {
        tableHtml += `
            <tr class="border-b border-gray-700/50 hover:bg-gray-800/50">
                <td class="px-2 py-1 font-medium truncate" title="${res.filename}">${res.filename}</td>
                <td class="px-2 py-1 text-right font-mono">${res.coreRadius_um}</td>
                <td class="px-2 py-1 text-right font-mono">${res.haloMigration_um}</td>
                <td class="px-2 py-1 text-right font-mono">${res.maxMigration_um}</td>
                <td class="px-2 py-1 text-right font-mono">${new Intl.NumberFormat('pt-BR').format(res.cellCount)}</td>
                <td class="px-2 py-1 text-right font-mono">${new Intl.NumberFormat('pt-BR').format(Number(res.migrationArea_um2))}</td>
                <td class="px-2 py-1 text-right font-mono">${res.maxDiameter_um}</td>
                <td class="px-2 py-1 text-right font-mono">${res.circularity}</td>
                <td class="px-2 py-1 text-right font-mono">${res.sphericity}</td>
                <td class="px-2 py-1 text-right font-mono">${res.compactness}</td>
                <td class="px-2 py-1 text-right font-mono">${res.solidity}</td>
                <td class="px-2 py-1 text-right font-mono">${res.convexity}</td>
                <td class="px-2 py-1 text-right font-mono">${res.entropy}</td>
                <td class="px-2 py-1 text-right font-mono">${res.skewness}</td>
                <td class="px-2 py-1 text-right font-mono">${res.kurtosis}</td>
                <td class="px-2 py-1 text-right font-mono">${res.mean}</td>
                <td class="px-2 py-1 text-right font-mono">${res.variance}</td>
                <td class="px-2 py-1 text-right font-mono">${res.meanGradient}</td>
                <td class="px-2 py-1 text-right font-mono">${res.varianceGradient}</td>
                <td class="px-2 py-1 text-center"><button class="delete-cumulative-btn p-1 rounded-md hover:bg-red-500/20" data-index="${index}" title="Deletar"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="text-red-400" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg></button></td>
            </tr>`;
    });
    tableHtml += '</tbody></table>';
    elements.cumulativeResultTableContainer.innerHTML = tableHtml;
}