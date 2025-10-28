/**
 * This file defines the global, mutable state of the application.
 */

type Point = { x: number; y: number };

// FIX: Define and export AdjustmentState interface for type safety.
export interface AdjustmentState {
    brightness: number;
    contrast: number;
    sharpness: number;
    highlights: number;
    shadows: number;
    whites: number;
    blacks: number;
    invert: boolean;
    binarize: boolean;
    binaryThreshold: number;
    backgroundTolerance: number;
    backgroundColorToSubtract: { r: number, g: number, b: number } | null;
}

// FIX: Define and export default adjustment values.
export const defaultAdjustments: AdjustmentState = {
    brightness: 0,
    contrast: 0,
    sharpness: 0,
    highlights: 0,
    shadows: 0,
    whites: 255,
    blacks: 0,
    invert: false,
    binarize: false,
    binaryThreshold: 128,
    backgroundTolerance: 10,
    backgroundColorToSubtract: null,
};


export let nextStickerId = 0;

export class StickerState {
    id: number;
    title: string = 'Lembretes';
    content: string = '';
    placeholderActive: boolean = true;
    x: number = 100; y: number = 100;
    width: number = 200; height: number = 150;
    color: string = '#facc15';
    font: string = "'Inter', sans-serif";
    fontSize: number = 14;
    fontColor: string = '#1f2937';
    isMinimized: boolean = false;
    zIndex: number = 1;

    constructor(id: number, zIndex: number) {
        this.id = id;
        this.zIndex = zIndex;
        this.x = 100 + (id % 10) * 20;
        this.y = 100 + (id % 10) * 20;
    }
}

/**
 * Encapsulates all state related to the analysis of a single image.
 */
export class ImageAnalysisState {
    file: File;
    originalImage: HTMLImageElement | null = null;
    originalFilename: string;
    is8Bit: boolean = false;

    // Image-specific adjustments, null if it uses tab/global settings
    adjustments: AdjustmentState | null = null;

    // Analysis State
    lastAnalysisResult: any = {};
    haloRadiusData: any = null;
    detectedParticles: any[] = [];
    
    // Drawing State
    manualDrawnPath: Point[] = [];
    migrationMarginPath: Point[] = [];

    // Results State
    isCurrentAnalysisSaved: boolean = true; 

    // Workflow State for this specific image
    currentAnalysisStep: number = 0;
    isCompleted: boolean = false;

    // Undo/Redo History State
    actionHistory: any[] = [];
    historyIndex: number = -1;

    constructor(file: File) {
        this.file = file;
        this.originalFilename = file.name;
    }
}

export class TabState {
    id: number;
    name: string;
    
    // Holds all individual image analyses for this tab
    analyses: ImageAnalysisState[] = [];
    currentAnalysisIndex: number = -1;

    // Tab-level cumulative results and stickers
    cumulativeResults: any[] = [];
    stickers: StickerState[] = [];
    
    // FIX: Add adjustments property to TabState.
    adjustments: AdjustmentState = { ...defaultAdjustments };

    constructor(id: number, name: string) {
        this.id = id;
        this.name = name;
    }
}

export function createNewTab(name?: string): TabState {
    const newName = name || `Aba ${state.nextTabId + 1}`;
    return new TabState(state.nextTabId++, newName);
}

// The main state object
export const state = {
    tabs: [] as TabState[],
    activeTabIndex: -1,
    minimizedPanels: [] as string[],
    nextTabId: 0,
    nextStickerId: 0,
    // FIX: Add adjustmentScope and globalAdjustments for managing image filter settings.
    adjustmentScope: 'tab' as 'tab' | 'global',
    globalAdjustments: { ...defaultAdjustments },
    currentMode: null as string | null,
    // FIX: Remove backgroundColorToSubtract as it's now part of the adjustments state.
    zoom: 1,
    pan: { x: 0, y: 0 },
    panStart: { x: 0, y: 0 },
    isPanning: false,
    isDrawing: false,
    drawnPath: [] as Point[],
    mouseDownPos: null as Point | null,
    lastPaintPos: null as Point | null,
    isRedrawing: false,
    paintModeContext: null as string | null,
    isErasing: false,
    isPaintLayerDirty: true,
    isListeningForShortcut: false,
    tempDroppedFiles: [] as File[],

    paint: { paintSpheroidCanvas: document.getElementById('paintSpheroidCanvas') as HTMLCanvasElement },
    magicWand: { magicWandToleranceInput: document.getElementById('magicWandToleranceInput') as HTMLInputElement },
    scale: {
        scaleBarPixelsInput: document.getElementById('scaleBarPixelsInput') as HTMLInputElement,
        scaleBarMicrometersInput: document.getElementById('scaleBarMicrometersInput') as HTMLInputElement,
    },
    analysisElements: {
        setHaloPointButton: document.getElementById('setHaloPointButton') as HTMLButtonElement,
        setMigrationPointButton: document.getElementById('setMigrationPointButton') as HTMLButtonElement,
        refineContourButton: document.getElementById('refineContourButton') as HTMLButtonElement,
        drawMarginButton: document.getElementById('drawMarginButton') as HTMLButtonElement,
        smoothMarginButton: document.getElementById('smoothMarginButton') as HTMLButtonElement,
        clearMarginButton: document.getElementById('clearMarginButton') as HTMLButtonElement,
        paintMarginButton: document.getElementById('paintMarginButton') as HTMLButtonElement,
    },
};

/**
 * Helper function to get the state object of the currently active tab.
 */
export function getActiveTab(): TabState | null {
    if (state.activeTabIndex >= 0 && state.activeTabIndex < state.tabs.length) {
        return state.tabs[state.activeTabIndex];
    }
    return null;
}

/**
 * Helper function to get the state object of the currently active image analysis.
 */
export function getActiveAnalysis(): ImageAnalysisState | null {
    const activeTab = getActiveTab();
    if (activeTab && activeTab.currentAnalysisIndex >= 0 && activeTab.currentAnalysisIndex < activeTab.analyses.length) {
        return activeTab.analyses[activeTab.currentAnalysisIndex];
    }
    return null;
}

/**
 * Gets the currently effective adjustment settings based on the scope (image, tab, or global).
 */
export function getEffectiveAdjustments(): AdjustmentState {
    const analysis = getActiveAnalysis();
    const activeTab = getActiveTab();

    // Priority 1: Image-specific adjustments if they exist.
    if (analysis?.adjustments) {
        return analysis.adjustments;
    }

    // Priority 2: Tab-specific adjustments if scope is 'tab'.
    if (activeTab && state.adjustmentScope === 'tab') {
        return activeTab.adjustments;
    }
    
    // Fallback: Global adjustments.
    return state.globalAdjustments;
}