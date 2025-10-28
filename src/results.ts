import { state, getActiveTab, getActiveAnalysis, TabState, createNewTab, StickerState, ImageAnalysisState } from './state';
import * as elements from './elements';
import { calculatePolygonArea, findContourPointAtAngle, showToast, copyToClipboard, calculateMorphologicalMetrics } from './utils';
import { renderTabs, switchTab, updateCumulativeResultsDisplay } from './ui';
import { requestRedraw } from './canvas';
import { loadImagePromise, applyImageFilters } from './image';

/**
 * Creates a complete data object for a single analysis, ready for the cumulative results table.
 * @param analysis The analysis state to generate a result from.
 * @returns A result object or null if the analysis is incomplete.
 */
function createResultObject(analysis: ImageAnalysisState): any | null {
    if (!analysis.originalFilename || !analysis.lastAnalysisResult.centerX) {
        return null;
    }

    const scalePixels = parseFloat(elements.scaleBarPixelsInput.value) || 1;
    const scaleMicrometers = parseFloat(elements.scaleBarMicrometersInput.value) || 1;
    const toUm = (px: number) => (px / (scalePixels / scaleMicrometers));
    const toUm2 = (px2: number) => (px2 * Math.pow(scaleMicrometers / scalePixels, 2));

    const { coreRadius, maxMigration_px, haloMigration_px, cellCount, morphology } = analysis.lastAnalysisResult;

    let migrationArea = 0;
    if (morphology && analysis.migrationMarginPath.length > 2) {
        migrationArea = calculatePolygonArea(analysis.migrationMarginPath) - morphology.area;
    }

    return {
        filename: analysis.originalFilename,
        coreRadius_um: toUm(coreRadius).toFixed(1),
        haloMigration_um: toUm(haloMigration_px || 0).toFixed(1),
        maxMigration_um: toUm(maxMigration_px || 0).toFixed(1),
        cellCount: cellCount || 0,
        migrationArea_um2: (migrationArea > 0 ? (toUm2(migrationArea)).toFixed(0) : '0'),
        maxDiameter_um: morphology ? toUm(morphology.diameter).toFixed(1) : '0.0',
        circularity: morphology ? morphology.circularity.toFixed(3) : '0.000',
        sphericity: morphology ? morphology.sphericity.toFixed(3) : '0.000',
        compactness: morphology ? morphology.compactness.toFixed(3) : '0.000',
        solidity: morphology ? morphology.solidity.toFixed(3) : '0.000',
        convexity: morphology ? morphology.convexity.toFixed(3) : '0.000',
        entropy: morphology ? morphology.entropy.toFixed(3) : '0.000',
        skewness: morphology ? morphology.skewness.toFixed(3) : '0.000',
        kurtosis: morphology ? morphology.kurtosis.toFixed(3) : '0.000',
        mean: morphology ? morphology.mean.toFixed(3) : '0.000',
        variance: morphology ? morphology.variance.toFixed(3) : '0.000',
        meanGradient: morphology ? morphology.meanGradient.toFixed(3) : '0.000',
        varianceGradient: morphology ? morphology.varianceGradient.toFixed(3) : '0.000',
    };
}


/**
 * Automatically saves the current analysis to cumulative results if it hasn't been saved yet.
 */
export function addToCumulativeResults() {
    const analysis = getActiveAnalysis();
    const activeTab = getActiveTab();
    if (!analysis || !activeTab || analysis.isCurrentAnalysisSaved) return;

    const newResult = createResultObject(analysis);
    if (!newResult) return;

    // Check if an entry for this filename already exists and update it, otherwise push a new one.
    const existingResultIndex = activeTab.cumulativeResults.findIndex(r => r.filename === analysis.originalFilename);

    if (existingResultIndex > -1) {
        activeTab.cumulativeResults[existingResultIndex] = newResult;
    } else {
        activeTab.cumulativeResults.push(newResult);
    }

    analysis.isCurrentAnalysisSaved = true;
    updateCumulativeResultsDisplay();
}

/**
 * Updates the main results display panel with the latest data from the active analysis.
 */
export function updateResultsDisplay() {
    const analysis = getActiveAnalysis();
    if (!analysis || !analysis.originalImage || !analysis.lastAnalysisResult.centerX || !elements.radiusResult) {
        if (elements.radiusResult) elements.radiusResult.innerHTML = '<p class="text-gray-400 text-center">Aguardando análise...</p>';
        if (elements.addCumulativeButton) elements.addCumulativeButton.disabled = true;
        return;
    }
    if (elements.addCumulativeButton) elements.addCumulativeButton.disabled = false;

    const { coreRadius, maxMigration_px, haloMigration_px, cellCount, morphology } = analysis.lastAnalysisResult;
    const scalePixels = parseFloat(elements.scaleBarPixelsInput.value), scaleMicrometers = parseFloat(elements.scaleBarMicrometersInput.value);
    if (isNaN(scalePixels) || isNaN(scaleMicrometers) || scalePixels <= 0) {
        elements.radiusResult.innerHTML = '<p class="text-red-400">Escala inválida</p>'; return;
    }
    const pxPerUm = scalePixels / scaleMicrometers;
    const toUm = (px: number) => (px / pxPerUm);

    let html = `<div class="space-y-2">`;
    const addRow = (name: string, color: string, valuePx: number | undefined | null) => {
        if (valuePx === undefined || valuePx === null) return '';
        return `<div class="flex justify-between items-center text-xs"><div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full" style="background-color:${color};"></span><span>${name}</span></div><div class="font-mono">${toUm(valuePx).toFixed(1)} µm</div></div>`;
    };
    html += addRow('Raio do Núcleo', (document.getElementById('spheroidLineColorInput') as HTMLInputElement).value, coreRadius);
    html += addRow('Migração do Halo', (document.getElementById('haloLineColorInput') as HTMLInputElement).value, haloMigration_px);
    html += addRow('Migração Máxima', (document.getElementById('maxLineColorInput') as HTMLInputElement).value, maxMigration_px);

    if (cellCount !== null && cellCount !== undefined) html += `<div class="flex justify-between items-center text-xs pt-1 border-t border-gray-700"><div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-teal-400"></span><span class="font-bold">Células Vivas</span></div><div class="font-mono font-bold">${cellCount}</div></div>`;
    
    if (morphology && analysis.migrationMarginPath.length > 2) {
        const um2PerPx2 = (scaleMicrometers / scalePixels) ** 2;
        const migrationArea = calculatePolygonArea(analysis.migrationMarginPath) - morphology.area;
        if (migrationArea > 0) html += `<div class="flex justify-between items-center text-xs"><div>...</div><div class="font-mono">${new Intl.NumberFormat('pt-BR').format(+(migrationArea * um2PerPx2).toFixed(0))} µm²</div></div>`;
    }
    html += `</div>`;

    if (morphology) {
        html += `<details class="mt-2 pt-2 border-t border-gray-700" open><summary class="text-xs font-semibold text-gray-400">Detalhes Morfológicos</summary><div class="mt-2 space-y-1 pl-2">`;
        const addMorphRow = (name: string, value: number, unit = '') => value === undefined || isNaN(value) ? '' : `<div class="flex justify-between text-xs"><span>${name}</span><span class="font-mono">${value.toFixed(3)}${unit}</span></div>`;
        html += addRow('Diâmetro Máximo', '#84cc16', morphology.diameter);
        html += addMorphRow('Circularidade', morphology.circularity);
        html += addMorphRow('Esfericidade', morphology.sphericity);
        html += addMorphRow('Compacidade', morphology.compactness);
        html += addMorphRow('Solidez', morphology.solidity);
        html += addMorphRow('Convexidade', morphology.convexity);
        html += `</div></details>`;
        html += `<details class="mt-2 pt-2 border-t border-gray-700" open><summary class="text-xs font-semibold text-gray-400">Estatísticas de Textura</summary><div class="mt-2 space-y-1 pl-2">`;
        html += addMorphRow('Média (GL)', morphology.mean);
        html += addMorphRow('Variância (GL)', morphology.variance);
        html += addMorphRow('Entropia', morphology.entropy);
        html += addMorphRow('Skewness', morphology.skewness);
        html += addMorphRow('Kurtosis', morphology.kurtosis);
        html += addMorphRow('Gradiente Médio', morphology.meanGradient);
        html += addMorphRow('Variância do Grad.', morphology.varianceGradient);
        html += `</div></details>`;
    }
    elements.radiusResult.innerHTML = html;
    import('./ui').then(m => m.updateUIMode());
}

/**
 * Core logic to calculate migration metrics for a given analysis state.
 * This function modifies the analysis object directly.
 * @param analysis The analysis state to calculate metrics for.
 */
function calculateAndStoreMigrationMetricsForAnalysis(analysis: ImageAnalysisState) {
    if (!analysis.lastAnalysisResult || !analysis.lastAnalysisResult.centerX) return;

    const { centerX, centerY, maxRadius, maxRadiusData } = analysis.lastAnalysisResult;
    const center = { x: centerX, y: centerY };
    const toUm = (px: number) => (px / (parseFloat(elements.scaleBarPixelsInput.value) / parseFloat(elements.scaleBarMicrometersInput.value)));

    if (maxRadiusData && analysis.manualDrawnPath.length > 2) {
        const startP = findContourPointAtAngle(analysis.manualDrawnPath, center, maxRadiusData.angle);
        const endP = { x: center.x + maxRadius * Math.cos(maxRadiusData.angle), y: center.y + maxRadius * Math.sin(maxRadiusData.angle) };
        analysis.lastAnalysisResult.maxMigration_px = Math.hypot(endP.x - startP.x, endP.y - startP.y);
        analysis.lastAnalysisResult.maxRadiusText = `${toUm(analysis.lastAnalysisResult.maxMigration_px).toFixed(1)} µm`;
    } else {
        delete analysis.lastAnalysisResult.maxMigration_px;
        delete analysis.lastAnalysisResult.maxRadiusText;
    }

    if (analysis.haloRadiusData && analysis.manualDrawnPath.length > 2) {
        const startP = findContourPointAtAngle(analysis.manualDrawnPath, center, analysis.haloRadiusData.angle);
        const endP = { x: center.x + analysis.haloRadiusData.radius * Math.cos(analysis.haloRadiusData.angle), y: center.y + analysis.haloRadiusData.radius * Math.sin(analysis.haloRadiusData.angle) };
        analysis.lastAnalysisResult.haloMigration_px = Math.hypot(endP.x - startP.x, endP.y - startP.y);
        analysis.lastAnalysisResult.haloRadiusText = `${toUm(analysis.lastAnalysisResult.haloMigration_px).toFixed(1)} µm`;
    } else {
        delete analysis.lastAnalysisResult.haloMigration_px;
        delete analysis.lastAnalysisResult.haloRadiusText;
    }
}


/**
 * Calculates migration metrics for the currently active analysis and updates the UI.
 * This is a wrapper for the core logic function.
 */
export function calculateAndStoreMigrationMetrics() {
    const analysis = getActiveAnalysis();
    if (!analysis) return;
    
    calculateAndStoreMigrationMetricsForAnalysis(analysis);
    
    // Enable/disable delete buttons
    if (elements.deleteHaloPointButton) {
        elements.deleteHaloPointButton.disabled = !analysis.haloRadiusData;
    }
    if (elements.deleteMigrationPointButton) {
        elements.deleteMigrationPointButton.disabled = !analysis.lastAnalysisResult.maxRadiusData;
    }

    updateResultsDisplay();
    requestRedraw();
}

function getCumulativeCsvContent(forClipboard = false): string {
    const activeTab = getActiveTab();
    if (!activeTab) return "";
    const separator = forClipboard ? "\t" : ",";
    const header = ["Arquivo", "Raio Núcleo (µm)", "Migração Halo (µm)", "Migração Máx. (µm)", "Células", "Área Migração (µm²)", "Diâmetro Máximo (µm)", "Circularidade", "Esfericidade", "Compacidade", "Solidez", "Convexidade", "Entropia", "Skewness", "Kurtosis", "Média (GL)", "Variância (GL)", "Gradiente Médio", "Variância do Gradiente"].join(separator);
    const rows = activeTab.cumulativeResults.map(res => [res.filename, res.coreRadius_um, res.haloMigration_um, res.maxMigration_um, res.cellCount, res.migrationArea_um2, res.maxDiameter_um, res.circularity, res.sphericity, res.compactness, res.solidity, res.convexity, res.entropy, res.skewness, res.kurtosis, res.mean, res.variance, res.meanGradient, res.varianceGradient].join(separator));
    return [header, ...rows].join("\n");
}

export function copyCumulativeCsv() {
    copyToClipboard(getCumulativeCsvContent(true), () => showToast('Copiado para a área de transferência!'), () => showToast('Erro ao copiar.'));
}

export function saveCumulativeCsv() {
    const csvContent = getCumulativeCsvContent(false);
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const tabName = getActiveTab()?.name.replace(/ /g, '_') || 'Resultados';
    link.download = `${tabName}_Acumulados_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

export function openInSheets() {
    copyToClipboard(getCumulativeCsvContent(true), () => { window.open('https://sheets.new', '_blank'); showToast('Copiado! Cole no Google Sheets.')}, () => showToast('Erro ao copiar.'));
}

export function deleteCumulativeResult(index: number) {
    const activeTab = getActiveTab();
    if (activeTab) { activeTab.cumulativeResults.splice(index, 1); updateCumulativeResultsDisplay(); }
}

export function clearCumulativeResults() {
    const activeTab = getActiveTab();
    if (activeTab) { activeTab.cumulativeResults = []; updateCumulativeResultsDisplay(); }
}

function base64ToFile(base64: string, filename: string): File {
    const arr = base64.split(','), mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) throw new Error("Invalid base64 string");
    const bstr = atob(arr[1]); let n = bstr.length; const u8arr = new Uint8Array(n);
    while(n--) u8arr[n] = bstr.charCodeAt(n);
    return new File([u8arr], filename, {type:mimeMatch[1]});
}

export async function saveProject() {
    if (!elements.saveProjectButton) return;
    elements.saveProjectButton.disabled = true;
    elements.saveProjectButton.textContent = 'Preparando...';

    // Inlined Worker Code
    const workerCode = `
        self.onmessage = async (event) => {
            const { tabs } = event.data;

            const fileToBase64 = (file) => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(file);
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = error => reject(error);
                });
            };

            try {
                self.postMessage({ status: 'Convertendo imagens...' });
                const serializableTabs = await Promise.all(tabs.map(async (tab) => {
                    const serializableAnalyses = await Promise.all(tab.analyses.map(async (analysis) => {
                        const { file, ...rest } = analysis;
                        const fileData = await fileToBase64(file);
                        return { ...rest, fileData };
                    }));
                    return { ...tab, analyses: serializableAnalyses };
                }));

                self.postMessage({ status: 'Gerando arquivo...' });
                const projectData = { version: "1.5-worker", tabs: serializableTabs, activeTabIndex: event.data.activeTabIndex };
                const blob = new Blob([JSON.stringify(projectData)], { type: "application/json" });
                self.postMessage({ status: 'done', blob: blob });
            } catch (error) {
                self.postMessage({ status: 'error', error: error.message });
            }
        };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);

    worker.onmessage = (event) => {
        const { status, blob, error } = event.data;
        if (status === 'done' && blob) {
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            const projectName = elements.headerProjectNameInput.value || "meu-projeto";
            link.download = `${projectName}.spheroidproj`;
            link.click();
            URL.revokeObjectURL(link.href);
            if (elements.saveProjectButton) {
                elements.saveProjectButton.disabled = false;
                elements.saveProjectButton.textContent = 'Salvar Projeto';
            }
            worker.terminate();
            URL.revokeObjectURL(workerUrl);
        } else if (status === 'error') {
            console.error("Worker failed to save project:", error);
            alert("Ocorreu um erro ao salvar o projeto: " + error);
            if (elements.saveProjectButton) {
                elements.saveProjectButton.disabled = false;
                elements.saveProjectButton.textContent = 'Salvar Projeto';
            }
            worker.terminate();
            URL.revokeObjectURL(workerUrl);
        } else if (status) {
            if (elements.saveProjectButton) elements.saveProjectButton.textContent = status;
        }
    };

    worker.onerror = (err) => {
        console.error("Worker error:", err);
        alert("Falha ao iniciar o processo de salvamento em segundo plano.");
        if (elements.saveProjectButton) {
            elements.saveProjectButton.disabled = false;
            elements.saveProjectButton.textContent = 'Salvar Projeto';
        }
         worker.terminate();
         URL.revokeObjectURL(workerUrl);
    };

    const tabsForWorker = state.tabs.map(tab => ({
        ...tab,
        analyses: tab.analyses.map(analysis => {
            const { originalImage, ...rest } = analysis;
            return rest;
        })
    }));

    const dataToSend = {
        tabs: tabsForWorker,
        activeTabIndex: state.activeTabIndex
    };
    
    worker.postMessage(dataToSend);
}

async function executeImportTabs(tabsToImport: any[]) {
    if (!tabsToImport || tabsToImport.length === 0) return;

    for (const tabData of tabsToImport) {
        const newTab = createNewTab(); // Gets a new ID
        
        Object.assign(newTab, tabData);

        const analysesData = tabData.analyses || [];
        const stickersData = tabData.stickers || [];
        
        newTab.analyses = [];
        newTab.stickers = [];

        for (const sData of stickersData) {
            const sticker = new StickerState(sData.id, sData.zIndex);
            Object.assign(sticker, sData);
            newTab.stickers.push(sticker);
            if (sData.id >= state.nextStickerId) state.nextStickerId = sData.id + 1;
        }

        for (const analysisData of analysesData) {
            if (!analysisData.fileData) continue;
            try {
                const file = base64ToFile(analysisData.fileData, analysisData.originalFilename);
                const analysis = new ImageAnalysisState(file);
                const { file: _, originalImage: __, fileData: ___, ...rest } = analysisData;
                Object.assign(analysis, rest);
                newTab.analyses.push(analysis);

            } catch (error) {
                console.error(`Error processing saved analysis for ${analysisData.originalFilename}`, error);
            }
        }
        
        state.tabs.push(newTab);
        if (newTab.id >= state.nextTabId) state.nextTabId = newTab.id + 1;
    }
}

export async function loadProject(file: File, projectData: any, mode: 'replace' | 'add') {
    const recalculatingOverlay = document.getElementById('recalculating-overlay');
    if (recalculatingOverlay) recalculatingOverlay.classList.remove('hidden');

    const originalActiveTabIndex = state.activeTabIndex;

    try {
        if (mode === 'replace') {
            state.tabs = [];
            state.nextTabId = 0;
            state.nextStickerId = 0;
        }
        
        await executeImportTabs(projectData.tabs);

        if (mode === 'replace' && elements.headerProjectNameInput) {
            const newName = file.name.replace('.spheroidproj', '');
            elements.headerProjectNameInput.value = newName;
        }
        
        // --- RECALCULATION LOGIC ---
        for (const tab of state.tabs) {
            for (const analysis of tab.analyses) {
                // Only recalculate analyses that have a defined core contour
                if (analysis.manualDrawnPath && analysis.manualDrawnPath.length > 2) {
                    
                    // 1. Ensure image data is loaded into an Image element
                    if (!analysis.originalImage) {
                        analysis.originalImage = await loadImagePromise(analysis.file);
                    }

                    // 2. Prepare hidden canvases for offscreen processing
                    const { width, height } = analysis.originalImage;
                    elements.originalCanvas.width = width;
                    elements.originalCanvas.height = height;
                    elements.processedImageCanvas.width = width;
                    elements.processedImageCanvas.height = height;
                    elements.originalCanvas.getContext('2d')!.drawImage(analysis.originalImage, 0, 0);
                    
                    // 3. Apply the current global image adjustment settings
                    applyImageFilters(analysis);

                    // 4. Recalculate all metrics using the latest formulas
                    const morphologyResult = calculateMorphologicalMetrics(analysis.manualDrawnPath, elements.processedImageCanvas);
                    const { centroid, ...morphology } = morphologyResult;

                    if (centroid && centroid.x > 0) {
                         const { x: centerX, y: centerY } = centroid;
                         const coreRadius = analysis.manualDrawnPath.reduce((acc, p) => acc + Math.hypot(p.x - centerX, p.y - centerY), 0) / analysis.manualDrawnPath.length;
                         const newCoreAnalysis = { centerX, centerY, coreRadius, cellCount: analysis.detectedParticles.length, morphology };
                         analysis.lastAnalysisResult = { ...analysis.lastAnalysisResult, ...newCoreAnalysis };
                         
                         // Also recalculate derived metrics like migration distances
                         calculateAndStoreMigrationMetricsForAnalysis(analysis);
                    }
                }
            }

            // 5. After recalculating all analyses in a tab, rebuild its cumulative results table from scratch
            tab.cumulativeResults = tab.analyses
                .map(createResultObject) // Use the pure function to generate result objects
                .filter(result => result !== null); // Filter out any analyses that couldn't be processed
            
            // Mark all analyses as "saved" with the new data
            tab.analyses.forEach(a => a.isCurrentAnalysisSaved = true);
        }
        // --- END RECALCULATION ---

        let newActiveIndex = state.tabs.length - 1;
        if (mode === 'replace') {
            const originalActiveTabId = projectData.tabs[projectData.activeTabIndex]?.id;
            newActiveIndex = 0;
            if (originalActiveTabId !== undefined) {
                const foundIndex = state.tabs.findIndex(t => t.id === originalActiveTabId);
                if (foundIndex > -1) newActiveIndex = foundIndex;
            }
        } else {
             const firstNewTabId = projectData.tabs[0]?.id;
             if(firstNewTabId !== undefined) {
                const foundIndex = state.tabs.findIndex(t => t.id === firstNewTabId);
                if(foundIndex > -1) newActiveIndex = foundIndex;
             }
        }

        renderTabs();
        switchTab(newActiveIndex, true);
        showToast('Projeto carregado e resultados recalculados com sucesso!');
        
    } catch (error) {
        console.error("Failed to execute load project:", error);
        showToast("Erro ao processar o projeto. Verifique o console para detalhes.", 5000);
        state.activeTabIndex = originalActiveTabIndex; // Attempt to restore previous state
        switchTab(state.activeTabIndex, true);
    } finally {
        if (recalculatingOverlay) recalculatingOverlay.classList.add('hidden');
    }
}

function parseTimeFromTabName(tabName: string): number | null {
    // Normalize string: replace commas with dots for decimals
    const normalizedName = tabName.replace(/,/g, '.');

    // 1. Prioritize specific units like '24h' or '2d'
    const unitMatch = normalizedName.match(/(\d+(?:\.\d+)?)\s*(h|d)/i);
    if (unitMatch) {
        let value = parseFloat(unitMatch[1]);
        const unit = unitMatch[2].toLowerCase();
        if (unit === 'h') {
            value /= 24; // Convert hours to days
        }
        return value;
    }

    // 2. If no unit found, find the last number in the string
    // This regex finds all sequences of digits, possibly with a decimal point.
    const allNumbers = normalizedName.match(/\d+(?:\.\d+)?/g);
    if (allNumbers && allNumbers.length > 0) {
        // Get the last match from the array of found numbers
        const lastNumberStr = allNumbers[allNumbers.length - 1];
        return parseFloat(lastNumberStr);
    }
    
    // 3. If no numbers are found at all
    return null;
}

/**
 * Populates the speed analysis panel with all available tabs, indicating which are usable.
 */
export function populateSpeedAnalysisPanel() {
    const { speedAnalysisSelectAll, speedAnalysisTabSelection } = elements;
    if (!speedAnalysisTabSelection) return;

    speedAnalysisTabSelection.innerHTML = '';

    const createTabCheckbox = (tab: TabState) => {
        // A tab is analyzable if it contains at least one image with a defined spheroid core.
        const hasAnalyzedImage = tab.analyses.some(a => a.lastAnalysisResult && a.lastAnalysisResult.centerX);
        const isDisabled = !hasAnalyzedImage;
        const disabledClass = isDisabled ? 'opacity-50 cursor-not-allowed' : '';
        const title = isDisabled ? 'Esta aba não contém imagens com análise de núcleo concluída.' : `Analisar a aba ${tab.name}`;
        const warningIcon = isDisabled ? '<span class="text-yellow-400" title="Dados de análise ausentes">⚠️</span>' : '';

        return `
            <label class="flex items-center space-x-2 p-1.5 rounded-md hover:bg-gray-700/50 ${disabledClass}" title="${title}">
                <input type="checkbox" class="speed-tab-checkbox w-4 h-4 text-teal-500 bg-gray-700 border-gray-600 rounded focus:ring-teal-500" data-tab-id="${tab.id}" ${isDisabled ? 'disabled' : 'checked'}>
                <span class="text-sm truncate flex-grow">${tab.name}</span>
                ${warningIcon}
            </label>
        `;
    };

    speedAnalysisTabSelection.innerHTML = state.tabs.map(createTabCheckbox).join('');

    const checkboxes = speedAnalysisTabSelection.querySelectorAll<HTMLInputElement>('.speed-tab-checkbox');
    const enabledCheckboxes = Array.from(checkboxes).filter(cb => !cb.disabled);

    if (speedAnalysisSelectAll) {
        speedAnalysisSelectAll.checked = enabledCheckboxes.length > 0 && enabledCheckboxes.every(c => c.checked);
        speedAnalysisSelectAll.onchange = () => {
            enabledCheckboxes.forEach(cb => cb.checked = speedAnalysisSelectAll.checked);
            updateSpeedAnalysisTable();
        };
    }

    checkboxes.forEach(cb => {
        cb.onchange = () => {
            if (speedAnalysisSelectAll) {
                speedAnalysisSelectAll.checked = enabledCheckboxes.length > 0 && enabledCheckboxes.every(c => c.checked);
            }
            updateSpeedAnalysisTable();
        };
    });

    updateSpeedAnalysisTable();
}


function updateSpeedAnalysisTable() {
    const { speedAnalysisTimeMapping, speedAnalysisTabSelection } = elements;
    if (!speedAnalysisTimeMapping || !speedAnalysisTabSelection) return;
    
    speedAnalysisTimeMapping.innerHTML = ''; // Clear previous content

    const checkedTabIds = Array.from(speedAnalysisTabSelection.querySelectorAll<HTMLInputElement>('.speed-tab-checkbox:checked'))
        .map(cb => parseInt(cb.dataset.tabId!));

    const tableBody = document.createElement('tbody');

    state.tabs.forEach(tab => {
        if (!checkedTabIds.includes(tab.id)) return;

        const initialTime = parseTimeFromTabName(tab.name);

        const row = document.createElement('tr');
        row.dataset.tabId = String(tab.id);
        row.className = 'border-b border-gray-700/50';

        row.innerHTML = `
            <td class="p-2 truncate" title="${tab.name}">
                ${tab.name}
            </td>
            <td class="p-2">
                <input type="number" step="any" class="speed-time-input w-24 bg-gray-900 border border-gray-600 rounded-md p-1 text-right" placeholder="dias" value="${initialTime !== null ? initialTime : ''}">
            </td>
        `;
        tableBody.appendChild(row);
    });

    if (tableBody.children.length > 0) {
        speedAnalysisTimeMapping.innerHTML = `<table class="w-full text-sm">
            <thead class="bg-gray-800/50 text-xs uppercase text-gray-400">
                <tr><th class="p-2 text-left">Aba</th><th class="p-2 text-right">Tempo (dias)</th></tr>
            </thead>
            <tbody>${tableBody.innerHTML}</tbody>
        </table>`;
    } else {
        speedAnalysisTimeMapping.innerHTML = `<p class="text-xs text-gray-500 text-center p-4">Selecione uma aba válida para definir o tempo.</p>`;
    }
}


export function calculateAndDisplaySpeeds() {
    const { speedAnalysisTimeMapping, speedAnalysisResultsDisplay } = elements;
    if (!speedAnalysisTimeMapping || !speedAnalysisResultsDisplay) return;

    const metricKeys = ['coreRadius_um', 'haloMigration_um', 'maxMigration_um', 'migrationArea_um2', 'cellCount'];
    
    // Step 1: Aggregate data directly into sums and counts for each time point.
    const timeData = new Map<number, { sums: Record<string, number>, counts: Record<string, number> }>();
    const rows = speedAnalysisTimeMapping.querySelectorAll<HTMLTableRowElement>('tr[data-tab-id]');
    
    for (const row of rows) {
        const tabId = parseInt(row.dataset.tabId!, 10);
        const timeInput = row.querySelector<HTMLInputElement>('.speed-time-input');
        const time = timeInput ? parseFloat(timeInput.value) : NaN;
        const tab = state.tabs.find(t => t.id === tabId);

        if (!tab || isNaN(time) || tab.cumulativeResults.length === 0) {
            continue;
        }

        if (!timeData.has(time)) {
            timeData.set(time, {
                sums: Object.fromEntries(metricKeys.map(k => [k, 0])),
                counts: Object.fromEntries(metricKeys.map(k => [k, 0]))
            });
        }
        const currentPointData = timeData.get(time)!;

        for (const result of tab.cumulativeResults) {
            for (const key of metricKeys) {
                const value = parseFloat(result[key]);
                if (!isNaN(value)) {
                    currentPointData.sums[key] += value;
                    currentPointData.counts[key]++;
                }
            }
        }
    }

    // Step 2: Calculate the final average for each metric at each time point.
    const timePointAverages: { time: number; avgMetrics: Record<string, number>; groupName: string }[] = [];
    for (const [time, data] of timeData.entries()) {
        const avgMetrics: { [key: string]: number } = {};
        for (const key of metricKeys) {
            avgMetrics[key] = data.counts[key] > 0 ? data.sums[key] / data.counts[key] : 0;
        }
        timePointAverages.push({
            time,
            avgMetrics,
            groupName: `Dia ${time}`
        });
    }

    // Step 3: Sort time points to ensure correct interval calculation.
    const sortedTimePoints = timePointAverages.sort((a, b) => a.time - b.time);

    if (sortedTimePoints.length < 2) {
        showToast("Selecione pelo menos dois PONTOS DE TEMPO distintos com dados analisados.", 3000);
        return;
    }
    
    // Step 4: Calculate speeds for each consecutive interval.
    const intervalSpeeds: any[] = [];
    for (let i = 0; i < sortedTimePoints.length - 1; i++) {
        const group1 = sortedTimePoints[i];
        const group2 = sortedTimePoints[i + 1];
        const deltaTime = group2.time - group1.time;

        if (deltaTime <= 0) continue;

        const intervalResult: any = {
            intervalName: `${group1.groupName} → ${group2.groupName}`,
            deltaTime: deltaTime.toFixed(1)
        };

        metricKeys.forEach(key => {
            const deltaValue = group2.avgMetrics[key] - group1.avgMetrics[key];
            const speed = deltaValue / deltaTime;
            intervalResult[key] = speed;
        });
        
        intervalSpeeds.push(intervalResult);
    }
    
    // Step 5: Calculate overall speed from the very first to the very last time point.
    const avgSpeeds: { [key: string]: string } = {};
    const firstPoint = sortedTimePoints[0];
    const lastPoint = sortedTimePoints[sortedTimePoints.length - 1];
    const totalTime = lastPoint.time - firstPoint.time;

    if (totalTime > 0) {
        metricKeys.forEach(key => {
            const totalDeltaValue = lastPoint.avgMetrics[key] - firstPoint.avgMetrics[key];
            const overallSpeed = totalDeltaValue / totalTime;
            avgSpeeds[key] = overallSpeed.toFixed(1);
        });
    } else {
        metricKeys.forEach(key => { avgSpeeds[key] = '0.0'; });
    }
    
    avgSpeeds['totalTime'] = totalTime.toFixed(1);

    if (intervalSpeeds.length === 0 && totalTime <= 0) {
        showToast("Não foi possível calcular velocidades. Verifique se os tempos são sequenciais e positivos.", 4000);
        return;
    }

    // Step 6: Display results.
    const metricDisplayInfo: { [key: string]: { name: string; unit: string } } = {
        coreRadius_um: { name: 'Vel. Crescimento (Raio)', unit: 'µm/dia' },
        haloMigration_um: { name: 'Vel. Migração (Halo)', unit: 'µm/dia' },
        maxMigration_um: { name: 'Vel. Migração (Máx)', unit: 'µm/dia' },
        migrationArea_um2: { name: 'Vel. Migração (Área)', unit: 'µm²/dia' },
        cellCount: { name: 'Vel. Proliferação', unit: 'Células/dia' }
    };

    let avgTableHtml = `<details class="subsection-details" open>
        <summary><h5 class="font-semibold text-gray-300 text-sm">Resultado Geral (Início ao Fim)</h5></summary>
        <div class="subsection-content !p-2"><table class="w-full text-xs"><tbody>`;
    metricKeys.forEach(key => {
        const info = metricDisplayInfo[key];
        avgTableHtml += `<tr class="border-b border-gray-700/50"><td class="py-1 pr-2 text-gray-400">${info.name}</td><td class="py-1 pl-2 text-right font-mono text-teal-300">${avgSpeeds[key]}</td></tr>`;
    });
    avgTableHtml += `<tr class="border-b border-gray-700/50"><td class="py-1 pr-2 text-gray-400">Tempo Total (dias)</td><td class="py-1 pl-2 text-right font-mono">${totalTime.toFixed(1)}</td></tr></tbody></table></div></details>`;

    let dailyTableHtml = '';
    if (intervalSpeeds.length > 0) {
        dailyTableHtml = `<details class="subsection-details mt-2" open>
            <summary><h5 class="font-semibold text-gray-300 text-sm">Análise por Intervalo</h5></summary>
            <div class="subsection-content !p-0 overflow-x-auto"><table class="w-full text-xs text-left">
                <thead class="bg-gray-800/50 text-gray-400 uppercase"><tr>
                    <th class="p-2">Intervalo</th>
                    ${metricKeys.map(key => `<th class="p-2 text-right">${metricDisplayInfo[key].name.replace('Vel. ','')}</th>`).join('')}
                    <th class="p-2 text-right">Tempo (dias)</th>
                </tr></thead><tbody>`;
        intervalSpeeds.forEach(interval => {
            dailyTableHtml += `<tr class="border-b border-gray-700/50">
                <td class="p-2 font-semibold truncate" title="${interval.intervalName}">${interval.intervalName}</td>
                ${metricKeys.map(key => `<td class="p-2 text-right font-mono">${interval[key].toFixed(1)}</td>`).join('')}
                <td class="p-2 text-right font-mono">${interval.deltaTime}</td>
            </tr>`;
        });
        dailyTableHtml += `</tbody></table></div></details>`;
    }
    
    const panelHeader = `<div class="popup-header flex items-center justify-between p-2 border-b border-gray-700">
        <h3 class="font-bold text-base ml-2">Resultados de Velocidade</h3>
        <div class="flex items-center gap-1">
            <button id="copy-speed-results-btn" title="Copiar Resultados" class="p-2 rounded-md hover:bg-gray-700"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1-1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5-.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3z"/></svg></button>
            <button id="close-speed-results-btn" title="Fechar" class="p-2 rounded-md hover:bg-gray-700"><svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/></svg></button>
        </div></div><div class="panel-content overflow-y-auto p-2">${avgTableHtml}${dailyTableHtml}</div><div class="resize-handle"></div>`;

    speedAnalysisResultsDisplay.innerHTML = panelHeader;
    speedAnalysisResultsDisplay.classList.remove('hidden');

    document.getElementById('close-speed-results-btn')?.addEventListener('click', () => { speedAnalysisResultsDisplay.classList.add('hidden'); });
    document.getElementById('copy-speed-results-btn')?.addEventListener('click', () => {
        let text = 'Resultado Geral (Início ao Fim)\nMétrica\tValor\n';
        metricKeys.forEach(key => { const info = metricDisplayInfo[key]; text += `${info.name}\t${avgSpeeds[key]}\n`; });
        text += `Tempo Total (dias)\t${totalTime.toFixed(1)}\n\n`;

        if (intervalSpeeds.length > 0) {
            text += 'Análise por Intervalo\nIntervalo\t' + metricKeys.map(key => metricDisplayInfo[key].name.replace('Vel. ','')).join('\t') + '\tTempo (dias)\n';
            intervalSpeeds.forEach(interval => { text += `${interval.intervalName}\t${metricKeys.map(key => interval[key].toFixed(1)).join('\t')}\t${interval.deltaTime}\n`; });
        }
        copyToClipboard(text, () => showToast('Resultados copiados!'));
    });

    import('../src/ui').then(m => m.makeDraggable(speedAnalysisResultsDisplay, '.popup-header'));
}