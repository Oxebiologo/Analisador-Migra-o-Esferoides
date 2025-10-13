/**
 * This file contains selectors for all DOM elements used in the application.
 * Consolidating them here makes it easy to manage and access UI components.
 */

// Main file/project controls
export const imageLoader = document.getElementById('imageLoader') as HTMLInputElement;
export const newProjectButton = document.getElementById('newProjectButton') as HTMLButtonElement;
export const saveProjectButton = document.getElementById('saveProjectButton') as HTMLButtonElement;
export const resetButton = document.getElementById('resetButton') as HTMLButtonElement;
export const saveAnalyzedButton = document.getElementById('saveAnalyzedButton') as HTMLButtonElement;
export const headerProjectNameInput = document.getElementById('headerProjectNameInput') as HTMLInputElement;
export const loadProjectInput = document.getElementById('loadProjectInput') as HTMLInputElement;


// Canvases
export const originalCanvas = document.getElementById('originalCanvas') as HTMLCanvasElement;
export const processedImageCanvas = document.getElementById('processedImageCanvas') as HTMLCanvasElement;
export const paintCanvas = document.getElementById('paintCanvas') as HTMLCanvasElement;
export const paintSpheroidCanvas = document.getElementById('paintSpheroidCanvas') as HTMLCanvasElement;
export const manualPaintCanvas = document.getElementById('manualPaintCanvas') as HTMLCanvasElement;
export const resultCanvas = document.getElementById('resultCanvas') as HTMLCanvasElement;
export const canvasContainer = document.getElementById('canvas-container');

// Main UI Panels & Containers
export const projectPanel = document.getElementById('project-panel');
export const analysisWorkflowPanel = document.getElementById('analysis-workflow-panel');
export const adjustmentsPanel = document.getElementById('adjustments-panel');
export const optionsPanel = document.getElementById('options-panel');
export const shortcutsPanel = document.getElementById('shortcuts-panel');
export const helpPanel = document.getElementById('help-panel');
export const resultsContainer = document.getElementById('results-container');
export const cumulativeResultsContainer = document.getElementById('cumulative-results-container');
export const brushControls = document.getElementById('brushControls');
export const magicWandControls = document.getElementById('magicWandControls');
export const imageNavControls = document.getElementById('imageNavControls');
export const viewControlsPanel = document.getElementById('view-controls-panel');
export const mainContainer = document.querySelector('main') as HTMLElement;
export const dragDropOverlay = document.getElementById('drag-drop-overlay');
export const dropOptions = document.getElementById('drop-options');
export const mainImageNav = document.getElementById('main-image-nav');
export const minimizedPanelsBar = document.getElementById('minimized-panels-bar');
export const speedAnalysisPanel = document.getElementById('speed-analysis-panel');
export const tabSelectionModal = document.getElementById('tab-selection-modal');
export const tabSelectionList = document.getElementById('tab-selection-list');
export const tabSelectAll = document.getElementById('tab-select-all') as HTMLInputElement;
export const tabSelectCancel = document.getElementById('tab-select-cancel');
export const tabSelectReplaceBtn = document.getElementById('tab-select-replace-btn');
export const tabSelectAddBtn = document.getElementById('tab-select-add-btn');



// Buttons & Interactive Elements
export const addCumulativeButton = document.getElementById('addCumulativeButton') as HTMLButtonElement;
export const showCumulativeButton = document.getElementById('showCumulativeButton');
export const toggleResultsButton = document.getElementById('toggleResultsButton');
export const toggleCumulativeResultsButton = document.getElementById('toggleCumulativeResultsButton');
export const confirmPaintButton = document.getElementById('confirmPaintButton');
export const cancelPaintButton = document.getElementById('cancelPaintButton');
export const fullscreenButton = document.getElementById('fullscreenButton');
export const zoomInButton = document.getElementById('zoomInButton');
export const zoomOutButton = document.getElementById('zoomOutButton');
export const zoomResetButton = document.getElementById('zoomResetButton');
export const prevImageButton = document.getElementById('prevImageButton') as HTMLButtonElement;
export const nextImageButton = document.getElementById('nextImageButton') as HTMLButtonElement;
export const mainPrevImageButton = document.getElementById('main-prevImageButton') as HTMLButtonElement;
export const mainNextImageButton = document.getElementById('main-nextImageButton') as HTMLButtonElement;
export const deleteImageButton = document.getElementById('deleteImageButton') as HTMLButtonElement;
export const mainDeleteImageButton = document.getElementById('main-deleteImageButton') as HTMLButtonElement;
export const copyCumulativeCsvButton = document.getElementById('copyCumulativeCsvButton') as HTMLButtonElement;
export const saveCumulativeCsvButton = document.getElementById('saveCumulativeCsvButton') as HTMLButtonElement;
export const clearCumulativeButton = document.getElementById('clearCumulativeButton') as HTMLButtonElement;
export const openInSheetsButton = document.getElementById('openInSheetsButton') as HTMLButtonElement;
export const viewControlsIconBtn = document.getElementById('view-controls-icon-btn');
export const dropReplaceBtn = document.getElementById('drop-replace-btn');
export const dropAddBtn = document.getElementById('drop-add-btn');
export const dropCancelBtn = document.getElementById('drop-cancel-btn');
export const brushToolPaint = document.getElementById('brush-tool-paint') as HTMLButtonElement;
export const brushToolErase = document.getElementById('brush-tool-erase') as HTMLButtonElement;
export const headerSpeedBtn = document.getElementById('header-speed-btn');
export const headerShortcutsBtn = document.getElementById('header-shortcuts-btn');


// Fix: Cast button elements to HTMLButtonElement to provide correct types for properties like 'disabled'.
// Analysis Step Buttons
export const convertTo8BitButton = document.getElementById('convertTo8BitButton') as HTMLButtonElement;
export const paintSpheroidButton = document.getElementById('paintSpheroidButton') as HTMLButtonElement;
export const drawSpheroidButton = document.getElementById('drawSpheroidButton') as HTMLButtonElement;
export const magicPaintButton = document.getElementById('magicPaintButton') as HTMLButtonElement;
export const refineContourButton = document.getElementById('refineContourButton') as HTMLButtonElement;
export const undoPointButton = document.getElementById('undoPointButton') as HTMLButtonElement;
export const setHaloPointButton = document.getElementById('setHaloPointButton') as HTMLButtonElement;
export const setMigrationPointButton = document.getElementById('setMigrationPointButton') as HTMLButtonElement;
export const drawMarginButton = document.getElementById('drawMarginButton') as HTMLButtonElement;
export const paintMarginButton = document.getElementById('paintMarginButton') as HTMLButtonElement;
export const smoothMarginButton = document.getElementById('smoothMarginButton') as HTMLButtonElement;
export const clearMarginButton = document.getElementById('clearMarginButton') as HTMLButtonElement;
export const selectBackgroundButton = document.getElementById('selectBackgroundButton') as HTMLButtonElement;
export const addCellButton = document.getElementById('addCellButton') as HTMLButtonElement;
export const removeCellButton = document.getElementById('removeCellButton') as HTMLButtonElement;
export const clearCellsButton = document.getElementById('clearCellsButton') as HTMLButtonElement;
export const confirmCellCountButton = document.getElementById('confirmCellCountButton') as HTMLButtonElement;
export const confirmAnalysisButton = document.getElementById('confirmAnalysisButton') as HTMLButtonElement;


// Inputs & Checkboxes
export const scaleBarPixelsInput = document.getElementById('scaleBarPixelsInput') as HTMLInputElement;
export const scaleBarMicrometersInput = document.getElementById('scaleBarMicrometersInput') as HTMLInputElement;
export const resetAdjustmentsButton = document.getElementById('resetAdjustmentsButton');
export const contrastInput = document.getElementById('contrastInput') as HTMLInputElement;
export const contrastNumber = document.getElementById('contrastNumber') as HTMLInputElement;
export const sharpnessInput = document.getElementById('sharpnessInput') as HTMLInputElement;
export const sharpnessNumber = document.getElementById('sharpnessNumber') as HTMLInputElement;
export const brightnessInput = document.getElementById('brightnessInput') as HTMLInputElement;
export const brightnessNumber = document.getElementById('brightnessNumber') as HTMLInputElement;
export const highlightsInput = document.getElementById('highlightsInput') as HTMLInputElement;
export const highlightsNumber = document.getElementById('highlightsNumber') as HTMLInputElement;
export const shadowsInput = document.getElementById('shadowsInput') as HTMLInputElement;
export const shadowsNumber = document.getElementById('shadowsNumber') as HTMLInputElement;
export const whitesInput = document.getElementById('whitesInput') as HTMLInputElement;
export const whitesNumber = document.getElementById('whitesNumber') as HTMLInputElement;
export const blacksInput = document.getElementById('blacksInput') as HTMLInputElement;
export const blacksNumber = document.getElementById('blacksNumber') as HTMLInputElement;
export const grayscaleCheckbox = document.getElementById('grayscaleCheckbox') as HTMLInputElement;
export const invertCheckbox = document.getElementById('invertCheckbox') as HTMLInputElement;
export const binarizeCheckbox = document.getElementById('binarizeCheckbox') as HTMLInputElement;
export const paintCellsCheckbox = document.getElementById('paintCellsCheckbox') as HTMLInputElement;
export const showCellNumbersCheckbox = document.getElementById('showCellNumbersCheckbox') as HTMLInputElement;
export const rulerCheckbox = document.getElementById('rulerCheckbox') as HTMLInputElement;
export const iaDrawCheckbox = document.getElementById('iaDrawCheckbox') as HTMLInputElement;
export const brushSizeInput = document.getElementById('brushSizeInput') as HTMLInputElement;
export const brushSizeNumber = document.getElementById('brushSizeNumber') as HTMLInputElement;
export const brushOpacityInput = document.getElementById('brushOpacityInput') as HTMLInputElement;
export const brushOpacityNumber = document.getElementById('brushOpacityNumber') as HTMLInputElement;
export const magicWandToleranceInput = document.getElementById('magicWandToleranceInput') as HTMLInputElement;
export const magicWandToleranceNumber = document.getElementById('magicWandToleranceNumber') as HTMLInputElement;
export const binaryThresholdInput = document.getElementById('binaryThresholdInput') as HTMLInputElement;
export const binaryThresholdNumber = document.getElementById('binaryThresholdNumber') as HTMLInputElement;
export const backgroundToleranceInput = document.getElementById('backgroundToleranceInput') as HTMLInputElement;
export const backgroundToleranceNumber = document.getElementById('backgroundToleranceNumber') as HTMLInputElement;
export const showHaloRadiusCircleCheckbox = document.getElementById('showHaloRadiusCircleCheckbox') as HTMLInputElement;
export const showMaxRadiusCircleCheckbox = document.getElementById('showMaxRadiusCircleCheckbox') as HTMLInputElement;
export const aiToleranceInput = document.getElementById('aiToleranceInput') as HTMLInputElement;
export const aiToleranceNumber = document.getElementById('aiToleranceNumber') as HTMLInputElement;

export const layoutFontFamily = document.getElementById('layoutFontFamily') as HTMLSelectElement;
export const rulerFontFamily = document.getElementById('rulerFontFamily') as HTMLSelectElement;
export const rulerFontSize = document.getElementById('rulerFontSize') as HTMLInputElement;
export const cellNumberFontSize = document.getElementById('cellNumberFontSize') as HTMLInputElement;
export const analysisLineWidth = document.getElementById('analysisLineWidth') as HTMLInputElement;
export const spheroidLineColorInput = document.getElementById('spheroidLineColorInput') as HTMLInputElement;
export const marginLineColorInput = document.getElementById('marginLineColorInput') as HTMLInputElement;
export const haloLineColorInput = document.getElementById('haloLineColorInput') as HTMLInputElement;
export const maxLineColorInput = document.getElementById('maxLineColorInput') as HTMLInputElement;
export const initialMessage = document.getElementById('initial-message');
export const fileNameDisplay = document.getElementById('fileNameDisplay');



// Status & Display Elements
export const radiusResult = document.getElementById('radiusResult');
export const loadingIndicator = document.getElementById('loadingIndicator');
export const pixelInspector = document.getElementById('pixelInspector');
export const bitStatus = document.getElementById('bitStatus');
export const totalCellCounter = document.getElementById('totalCellCounter');
export const imageNavStatus = document.getElementById('imageNavStatus');
export const mainImageNavStatus = document.getElementById('main-imageNavStatus');
export const cumulativeResultTableContainer = document.getElementById('cumulativeResultTableContainer');
export const cellCounterStatus = document.getElementById('cell-counter-status');
export const workflowStepInstruction = document.getElementById('workflow-step-instruction');

// Profile elements
export const profileNameInput = document.getElementById('profileNameInput') as HTMLInputElement;
export const saveProfileButton = document.getElementById('saveProfileButton') as HTMLButtonElement;
export const deleteProfileButton = document.getElementById('deleteProfileButton') as HTMLButtonElement;
export const profileSelect = document.getElementById('profileSelect') as HTMLSelectElement;

// Sticker elements
export const addStickerButton = document.getElementById('add-sticker-btn') as HTMLButtonElement;
export const stickerContainer = document.getElementById('sticker-container') as HTMLElement;

// Collections of elements for easier manipulation
export const allCanvases = [originalCanvas, processedImageCanvas, paintCanvas, paintSpheroidCanvas, manualPaintCanvas, resultCanvas];
export const allPopupPanels = [resultsContainer, brushControls, cumulativeResultsContainer, projectPanel, analysisWorkflowPanel, adjustmentsPanel, optionsPanel, shortcutsPanel, viewControlsPanel, speedAnalysisPanel, helpPanel];