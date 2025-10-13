import { state, getActiveAnalysis } from './state';
import * as elements from './elements';
import { undo, redo } from './analysis';
import { showToast } from './utils';

const SHORTCUT_STORAGE_KEY = 'spheroidAnalyzerShortcuts';

const defaultShortcuts = {
    loadImage: 'o',
    saveAnalysis: 's',
    resetAll: 'r',
    nextImage: 'ArrowRight',
    prevImage: 'ArrowLeft',
    toggleFullscreen: 'f',
    zoomIn: '+',
    zoomOut: '-',
    zoomReset: '0',
    paintSpheroid: 'p',
    drawSpheroid: 'd',
    magicPaint: 'g',
    drawMargin: 'b',
    undoContour: 'u',
    setHalo: 'h',
    setMigration: 'm',
    nextStep: ' ',
    prevStep: 'Backspace',
    toggleAdjustments: 'a',
    toggleCumulative: 't',
    goToStep1: '1',
    goToStep2: '2',
    goToStep3: '3',
    goToStep4: '4',
    goToStep5: '5',
    undoAction: 'Control+z',
    redoAction: 'Control+y',
    confirmOrAdvance: 'Enter',
};

// Helper function for step navigation shortcuts
const createStepAction = (stepIndex: number) => () => {
    const analysis = getActiveAnalysis();
    if (!analysis) return;
    // Core step (step 1, index 1) must be complete to unlock subsequent steps
    const coreStepComplete = analysis.manualDrawnPath.length > 0;
    const isUnlocked = stepIndex <= 1 || coreStepComplete;
    if (isUnlocked) {
        import('./ui').then(m => m.goToWorkflowStep(stepIndex));
    }
};

const actions: { [key: string]: { label: string, action: () => void } } = {
    loadImage: { label: "Carregar Imagem", action: () => elements.imageLoader?.click() },
    saveAnalysis: { label: "Salvar Análise", action: () => elements.saveAnalyzedButton?.click() },
    resetAll: { label: "Resetar Tudo", action: () => elements.resetButton?.click() },
    nextImage: { label: "Próxima Imagem", action: () => elements.mainNextImageButton?.click() },
    prevImage: { label: "Imagem Anterior", action: () => elements.mainPrevImageButton?.click() },
    toggleFullscreen: { label: "Tela Cheia", action: () => elements.fullscreenButton?.click() },
    zoomIn: { label: "Aumentar Zoom", action: () => elements.zoomInButton?.click() },
    zoomOut: { label: "Reduzir Zoom", action: () => elements.zoomOutButton?.click() },
    zoomReset: { label: "Resetar Zoom", action: () => elements.zoomResetButton?.click() },
    paintSpheroid: { label: "Editar Núcleo (Pincel/Borracha)", action: () => elements.paintSpheroidButton?.click() },
    drawSpheroid: { label: "Contornar Esferoide", action: () => elements.drawSpheroidButton?.click() },
    magicPaint: { label: "Mágica no Esferoide", action: () => elements.magicPaintButton?.click() },
    drawMargin: { label: "Desenhar Borda", action: () => elements.drawMarginButton?.click() },
    undoContour: { label: "Limpar Contorno", action: () => elements.undoPointButton?.click() },
    setHalo: { label: "Definir Raio Halo", action: () => elements.setHaloPointButton?.click() },
    setMigration: { label: "Definir Raio Máximo", action: () => elements.setMigrationPointButton?.click() },
    nextStep: { label: "Próxima Etapa", action: () => import('./ui').then(m => m.completeStepAndAdvance()) },
    prevStep: { label: "Etapa Anterior", action: () => {
        const analysis = getActiveAnalysis();
        if (analysis) {
            import('./ui').then(m => m.goToWorkflowStep(analysis.currentAnalysisStep - 1));
        }
    } },
    toggleAdjustments: { label: "Painel de Ajustes", action: () => (document.getElementById('header-adjustments-btn') as HTMLButtonElement)?.click() },
    toggleCumulative: { label: "Tabela de Resultados", action: () => {
        const container = document.getElementById('cumulative-results-container');
        if (container?.classList.contains('hidden')) {
            import('./ui').then(m => m.restorePanel('cumulative'));
        } else if(elements.toggleCumulativeResultsButton){
            import('./ui').then(m => m.minimizePanel('cumulative'));
        }
    }},
    confirmOrAdvance: {
        label: "Confirmar / Avançar",
        action: () => {
            const analysis = getActiveAnalysis();
            if (state.paintModeContext) {
                elements.confirmPaintButton?.click();
            } else if (analysis) {
                switch (analysis.currentAnalysisStep) {
                    case 1: // Step 2 (Núcleo)
                        if (analysis.manualDrawnPath.length > 2) {
                            if (confirm('Deseja confirmar o núcleo e avançar para a etapa de Raios? O Raio do Halo será definido automaticamente.')) {
                                const { centerX, centerY, coreRadius } = analysis.lastAnalysisResult;
                                if (centerX !== undefined && coreRadius > 0) {
                                    analysis.haloRadiusData = {
                                        radius: coreRadius,
                                        angle: -Math.PI / 2 // Straight up
                                    };
                                    import('./results').then(m => m.calculateAndStoreMigrationMetrics());
                                    import('./ui').then(m => m.completeStepAndAdvance());
                                    showToast("Raio do Halo definido automaticamente.");
                                }
                            }
                        }
                        break;
                    case 3: // Células
                        elements.confirmCellCountButton?.click();
                        break;
                    case 4: // Borda
                        elements.confirmAnalysisButton?.click();
                        break;
                }
            }
        }
    },
    goToStep1: { label: "Ir para Etapa 1 (Preparação)", action: createStepAction(0) },
    goToStep2: { label: "Ir para Etapa 2 (Núcleo)", action: createStepAction(1) },
    goToStep3: { label: "Ir para Etapa 3 (Raios)", action: createStepAction(2) },
    goToStep4: { label: "Ir para Etapa 4 (Células)", action: createStepAction(3) },
    goToStep5: { label: "Ir para Etapa 5 (Borda)", action: createStepAction(4) },
    undoAction: { label: "Desfazer Ação", action: undo },
    redoAction: { label: "Refazer Ação", action: redo },
};

let shortcutMap: { [key: string]: string } = { ...defaultShortcuts };

export function saveShortcuts() {
    try {
        localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(shortcutMap));
    } catch (e) { console.error("Failed to save shortcuts:", e); }
}

export function loadShortcuts() {
    try {
        const stored = localStorage.getItem(SHORTCUT_STORAGE_KEY);
        if (stored) {
            shortcutMap = { ...defaultShortcuts, ...JSON.parse(stored) };
        }
    } catch (e) {
        console.error("Failed to load shortcuts:", e);
        shortcutMap = { ...defaultShortcuts };
    }
}

function formatKey(key: string) {
    if (key === ' ') return 'Espaço';
    return key.replace(/Control/g, 'Ctrl').replace(/Arrow/g, '').replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function populateShortcutsPanel() {
    const list = document.getElementById('shortcuts-list');
    if (!list) return;
    list.innerHTML = '';
    Object.entries(actions).forEach(([actionId, { label }]) => {
        const shortcut = shortcutMap[actionId as keyof typeof shortcutMap] || 'N/A';
        const item = document.createElement('div');
        item.className = 'shortcut-item p-2 bg-gray-800/50 rounded-md';
        item.innerHTML = `
            <span class="text-sm text-gray-300">${label}</span>
            <kbd class="shortcut-key-display font-mono text-teal-300 bg-gray-700 px-2 py-1 rounded-md text-xs">${formatKey(shortcut)}</kbd>
            <button class="edit-shortcut-btn text-xs bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded-md" data-action="${actionId}">Editar</button>
        `;
        list.appendChild(item);
    });

    list.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.matches('.edit-shortcut-btn')) {
            const actionId = target.dataset.action;
            const display = target.previousElementSibling as HTMLElement;
            if (actionId && display) listenForNewShortcut(actionId, display);
        }
    });

    document.getElementById('resetShortcutsButton')?.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja resetar todos os atalhos para o padrão?')) {
            shortcutMap = { ...defaultShortcuts };
            saveShortcuts();
            populateShortcutsPanel();
            showToast('Atalhos restaurados para o padrão.');
        }
    });
}

function listenForNewShortcut(actionId: string, displayElement: HTMLElement) {
    state.isListeningForShortcut = true;
    displayElement.textContent = 'Pressione a tecla...';
    displayElement.classList.add('listening');

    const keydownHandler = (e: KeyboardEvent) => {
        e.preventDefault(); e.stopPropagation();
        const parts = [];
        if (e.ctrlKey) parts.push('Control');
        if (e.altKey) parts.push('Alt');
        if (e.shiftKey) parts.push('Shift');
        const keyName = (e.key === ' ' || e.key.length > 1) ? e.key : e.key.toLowerCase();
        if (!['Control', 'Alt', 'Shift', 'Meta'].includes(keyName)) parts.push(keyName);
        const newShortcut = parts.join('+');
        if (newShortcut) {
            shortcutMap[actionId as keyof typeof shortcutMap] = newShortcut;
            saveShortcuts();
            displayElement.textContent = formatKey(newShortcut);
        } else displayElement.textContent = formatKey(shortcutMap[actionId as keyof typeof shortcutMap]);
        cleanup();
    };
    
    const clickHandler = () => {
        displayElement.textContent = formatKey(shortcutMap[actionId as keyof typeof shortcutMap]);
        cleanup();
    };

    const cleanup = () => {
        displayElement.classList.remove('listening');
        state.isListeningForShortcut = false;
        window.removeEventListener('keydown', keydownHandler, { capture: true });
        window.removeEventListener('click', clickHandler, { capture: true });
    };

    window.addEventListener('keydown', keydownHandler, { capture: true });
    window.addEventListener('click', clickHandler, { capture: true });
}

export function handleGlobalKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (state.isListeningForShortcut || target.isContentEditable || target.tagName.match(/INPUT|SELECT|TEXTAREA/)) {
        return;
    }

    const key = e.key.toLowerCase();
    const actionId = Object.keys(actions).find(act => {
        const shortcut = shortcutMap[act as keyof typeof shortcutMap];
        if (!shortcut) return false;
        const shortcutParts = shortcut.toLowerCase().split('+');
        const mainKey = shortcutParts.pop();
        
        // Handle Ctrl+y for redo, which also triggers history.forward() in some browsers
        if ((e.ctrlKey || e.metaKey) && key === 'y') {
            e.preventDefault();
        }

        return key === mainKey &&
               (e.ctrlKey || e.metaKey) === shortcutParts.includes('control') &&
               e.shiftKey === shortcutParts.includes('shift') &&
               e.altKey === shortcutParts.includes('alt');
    });

    if (actionId) {
        e.preventDefault();
        actions[actionId].action();
    } else if (state.paintModeContext) {
        if (key === 'escape') elements.cancelPaintButton?.click();
    } else if (key === 'escape' && state.currentMode) {
        import('./ui').then(m => m.setMode(null));
    }
}