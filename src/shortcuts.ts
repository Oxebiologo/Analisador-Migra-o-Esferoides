import { state, getActiveAnalysis, getActiveTab } from './state';
import * as elements from './elements';
import { undo, redo } from './analysis';
import { switchTab, addNewTab, deleteTab, updateBrushToolsUI, setMode } from './ui';
import { deleteCurrentImage, resetImageAdjustments } from './image';
import { zoomTo, resetView } from './canvas';

const SHORTCUT_STORAGE_KEY = 'spheroidAnalyzerShortcuts';

const defaultShortcuts: { [key: string]: { default: string, name: string } } = {
    newProject: { default: 'Control+Alt+N', name: 'Novo Projeto' },
    loadProject: { default: 'Control+Alt+O', name: 'Carregar Projeto' },
    loadImage: { default: 'Control+O', name: 'Carregar Imagens' },
    saveProject: { default: 'Control+S', name: 'Salvar Projeto' },
    deleteImage: { default: 'Delete', name: 'Deletar Imagem Atual' },
    undo: { default: 'Control+Z', name: 'Desfazer' },
    redo: { default: 'Control+Y', name: 'Refazer' },
    nextImage: { default: 'ArrowRight', name: 'Próxima Imagem' },
    prevImage: { default: 'ArrowLeft', name: 'Imagem Anterior' },
    newTab: { default: 'Control+Alt+T', name: 'Nova Aba' },
    closeTab: { default: 'Control+Alt+W', name: 'Fechar Aba' },
    nextTab: { default: 'Control+Tab', name: 'Próxima Aba' },
    prevTab: { default: 'Control+Shift+Tab', name: 'Aba Anterior' },
    zoomIn: { default: '+', name: 'Aumentar Zoom' },
    zoomOut: { default: '-', name: 'Diminuir Zoom' },
    resetView: { default: '0', name: 'Resetar Zoom' },
    toggleFullscreen: { default: 'F', name: 'Tela Cheia' },
    confirmOrAdvance: { default: 'Enter', name: 'Avançar/Confirmar Etapa' },
    goBack: { default: 'Backspace', name: 'Voltar Etapa' },
    clearContour: { default: 'U', name: 'Limpar Contorno/Pintura' },
    setSpheroidContour: { default: 'D', name: 'Desenhar Contorno do Núcleo' },
    editSpheroid: { default: 'P', name: 'Editar/Pintar Núcleo' },
    magicWand: { default: 'G', name: 'Seleção Mágica (Núcleo)' },
    setHaloPoint: { default: 'H', name: 'Definir Raio do Halo' },
    setMigrationPoint: { default: 'M', name: 'Definir Ponto Máximo' },
    setMigrationMargin: { default: 'B', name: 'Desenhar Borda de Migração' },
    addCell: { default: 'Shift+A', name: 'Adicionar Célula' },
    removeCell: { default: 'Shift+R', name: 'Remover Célula' },
    clearCells: { default: 'Shift+X', name: 'Limpar Células' },
    brushTool: { default: 'B', name: 'Pincel (Modo Edição)' },
    eraserTool: { default: 'E', name: 'Borracha (Modo Edição)' },
    cancelPaint: { default: 'Escape', name: 'Cancelar Edição/Ferramenta' },
    toggleAdjustments: { default: 'A', name: 'Painel de Ajustes' },
    toggleResults: { default: 'R', name: 'Painel de Resultados' },
    toggleCumulativeResults: { default: 'T', name: 'Painel de Res. Acumulados' },
    toggleProjectPanel: { default: 'I', name: 'Painel de Projeto' },
    toggleShortcutsPanel: { default: 'K', name: 'Painel de Atalhos' },
    toggleSpeedPanel: { default: 'V', name: 'Painel de Análise de Velocidade' },
    toggleOptionsPanel: { default: 'Alt+O', name: 'Painel de Opções' },
    toggleHelpPanel: { default: 'F1', name: 'Painel de Ajuda' },
    addCumulative: { default: 'C', name: 'Adicionar aos Acumulados' },
    resetAdjustments: { default: 'Alt+R', name: 'Resetar Ajustes de Imagem' }
};

let shortcuts: { [key: string]: string } = {};

export function loadShortcuts() {
    const savedShortcuts = localStorage.getItem(SHORTCUT_STORAGE_KEY);
    const loadedShortcuts: { [key: string]: string } = savedShortcuts ? JSON.parse(savedShortcuts) : {};
    for (const action in defaultShortcuts) {
        shortcuts[action] = loadedShortcuts[action] || defaultShortcuts[action].default;
    }
}

function saveShortcuts() {
    localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(shortcuts));
}

function formatKeyString(e: KeyboardEvent): string {
    const parts = [];
    if (e.ctrlKey) parts.push('Control');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    let key = e.key;
    if (key === ' ') key = 'Space';
    // Use code for letter keys to avoid issues with keyboard layouts
    else if (/^Key[A-Z]$/.test(e.code)) key = e.code.replace('Key', '');
    // For other keys, use key property but maybe capitalize
    else if (key.length === 1 && key.match(/[a-z]/)) key = key.toUpperCase();

    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) parts.push(key);
    return parts.join('+');
}


function listenForShortcut(action: string, button: HTMLButtonElement) {
    if (state.isListeningForShortcut) return;
    state.isListeningForShortcut = true;
    const originalText = button.textContent;
    button.textContent = 'Pressione...';
    button.classList.add('listening');

    const keyListener = (e: KeyboardEvent) => {
        e.preventDefault(); e.stopPropagation();
        if (e.key === 'Escape') { 
            button.textContent = originalText;
            cleanup(); 
            return; 
        }
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
        
        const newShortcut = formatKeyString(e);
        shortcuts[action] = newShortcut;
        button.textContent = newShortcut;
        saveShortcuts();
        cleanup();
    };
    
    const clickListener = (e: MouseEvent) => { if (e.target !== button) { button.textContent = originalText; cleanup(); } };
    
    const cleanup = () => {
        state.isListeningForShortcut = false;
        button.classList.remove('listening');
        window.removeEventListener('keydown', keyListener, { capture: true });
        window.removeEventListener('click', clickListener, { capture: true });
    };

    window.addEventListener('keydown', keyListener, { capture: true });
    window.addEventListener('click', clickListener, { capture: true });
}

let listenersAttached = false;
export function populateShortcutsPanel() {
    const listEl = document.getElementById('shortcuts-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    for (const action in defaultShortcuts) {
        const item = defaultShortcuts[action];
        const shortcutItem = document.createElement('div');
        shortcutItem.className = 'shortcut-item p-2 hover:bg-gray-800 rounded-md';
        
        shortcutItem.innerHTML = `
            <span class="text-sm">${item.name}</span>
            <button class="shortcut-key-display shortcut-key" data-action="${action}">${shortcuts[action]}</button>
            <button class="edit-shortcut-btn text-xs font-semibold text-teal-400 hover:text-teal-300 transition-colors" data-action-edit="${action}">Editar</button>
        `;
        listEl.appendChild(shortcutItem);
    }
    
    if (!listenersAttached) {
        listEl.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.matches('.edit-shortcut-btn')) {
                const action = target.dataset.actionEdit;
                if (action) {
                    const displayButton = listEl.querySelector<HTMLButtonElement>(`.shortcut-key-display[data-action="${action}"]`);
                    if (displayButton) listenForShortcut(action, displayButton);
                }
            }
        });
        
        const resetButton = document.getElementById('resetShortcutsButton');
        resetButton?.addEventListener('click', () => {
             if (confirm('Tem certeza de que deseja resetar todos os atalhos para os padrões?')) {
                localStorage.removeItem(SHORTCUT_STORAGE_KEY);
                loadShortcuts();
                saveShortcuts();
                populateShortcutsPanel();
            }
        });
        listenersAttached = true;
    }
}

export function handleGlobalKeyDown(e: KeyboardEvent) {
    if (state.isListeningForShortcut || /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName) || (e.target as HTMLElement).isContentEditable) return;

    const keyString = formatKeyString(e);
    let action: string | undefined;

    // Context-aware shortcuts first (e.g., paint mode)
    if (state.paintModeContext) {
        if (keyString.toUpperCase() === shortcuts.brushTool.toUpperCase()) action = 'brushTool';
        else if (keyString.toUpperCase() === shortcuts.eraserTool.toUpperCase()) action = 'eraserTool';
    }

    // Find the matching action
    if (!action) {
        for (const act in shortcuts) {
            if (shortcuts[act].toUpperCase() === keyString.toUpperCase()) {
                action = act;
                break;
            }
        }
    }
    
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();

    switch (action) {
        case 'newProject': elements.newProjectButton?.click(); break;
        case 'loadProject': elements.loadProjectInput?.click(); break;
        case 'loadImage': elements.imageLoader?.click(); break;
        case 'saveProject': elements.saveProjectButton?.click(); break;
        case 'deleteImage': elements.mainDeleteImageButton?.click(); break;
        case 'undo': undo(); break;
        case 'redo': redo(); break;
        case 'nextImage': elements.mainNextImageButton?.click(); break;
        case 'prevImage': elements.mainPrevImageButton?.click(); break;
        case 'newTab': addNewTab(); break;
        case 'closeTab': deleteTab(state.activeTabIndex); break;
        case 'nextTab': if (state.activeTabIndex < state.tabs.length - 1) switchTab(state.activeTabIndex + 1); break;
        case 'prevTab': if (state.activeTabIndex > 0) switchTab(state.activeTabIndex - 1); break;
        case 'zoomIn': zoomTo(state.zoom * 1.5); break;
        case 'zoomOut': zoomTo(state.zoom / 1.5); break;
        case 'resetView': resetView(); break;
        case 'toggleFullscreen': elements.fullscreenButton?.click(); break;
        case 'confirmOrAdvance':
            if (state.paintModeContext) elements.confirmPaintButton?.click();
            else {
                const analysis = getActiveAnalysis();
                if (analysis) {
                    if (analysis.currentAnalysisStep === 2) elements.confirmCellCountButton?.click();
                    else if (analysis.currentAnalysisStep === 3) elements.confirmAnalysisButton?.click();
                    else import('./ui').then(m => m.completeStepAndAdvance());
                }
            }
            break;
        case 'goBack': 
            const analysis = getActiveAnalysis();
            if (analysis && analysis.currentAnalysisStep > 0) import('./ui').then(m => m.goToWorkflowStep(analysis.currentAnalysisStep - 1));
            break;
        case 'clearContour': elements.undoPointButton?.click(); break;
        case 'setSpheroidContour': elements.drawSpheroidButton?.click(); break;
        case 'editSpheroid': elements.paintSpheroidButton?.click(); break;
        case 'magicWand': elements.magicPaintButton?.click(); break;
        case 'setHaloPoint': elements.setHaloPointButton?.click(); break;
        case 'setMigrationPoint': elements.setMigrationPointButton?.click(); break;
        case 'setMigrationMargin': elements.drawMarginButton?.click(); break;
        case 'addCell': elements.addCellButton?.click(); break;
        case 'removeCell': elements.removeCellButton?.click(); break;
        case 'clearCells': elements.clearCellsButton?.click(); break;
        case 'brushTool': state.isErasing = false; updateBrushToolsUI(); break;
        case 'eraserTool': state.isErasing = true; updateBrushToolsUI(); break;
        case 'cancelPaint':
              if (state.paintModeContext) elements.cancelPaintButton?.click();
              else setMode(null);
              break;
        case 'toggleAdjustments': document.getElementById('header-adjustments-btn')?.click(); break;
        case 'toggleResults': elements.toggleResultsButton?.click(); break;
        case 'toggleCumulativeResults': elements.toggleCumulativeResultsButton?.click(); break;
        case 'toggleProjectPanel': document.getElementById('header-project-btn')?.click(); break;
        case 'toggleShortcutsPanel': elements.headerShortcutsBtn?.click(); break;
        case 'toggleSpeedPanel': elements.headerSpeedBtn?.click(); break;
        case 'toggleOptionsPanel': document.getElementById('header-options-btn')?.click(); break;
        case 'toggleHelpPanel': document.getElementById('header-help-btn')?.click(); break;
        case 'addCumulative': elements.addCumulativeButton?.click(); break;
        case 'resetAdjustments': resetImageAdjustments(); break;
    }
}