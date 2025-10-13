// Fix: Import 'ImageAnalysisState' to resolve reference error.
import { state, getActiveTab, getActiveAnalysis, TabState, createNewTab, StickerState, ImageAnalysisState } from './state';
import * as elements from './elements';
import { calculatePolygonArea, findContourPointAtAngle, showToast, copyToClipboard } from './utils';
import { renderTabs, switchTab, updateCumulativeResultsDisplay } from './ui';
import { requestRedraw } from './canvas';
import { loadImagePromise, applyImageFilters } from './image';
import { analyzeSpheroid } from './analysis';

/**
 * Automatically saves the current analysis to cumulative results if it hasn't been saved yet.
 */
export function addToCumulativeResults() {
    const analysis = getActiveAnalysis();
    const activeTab = getActiveTab();
    if (!analysis || !activeTab || !analysis.originalFilename || !analysis.lastAnalysisResult.centerX) return;
    
    // Prevent adding if it's already considered saved
    if(analysis.isCurrentAnalysisSaved) return;

    const scalePixels = parseFloat(elements.scaleBarPixelsInput.value) || 1;
    const scaleMicrometers = parseFloat(elements.scaleBarMicrometersInput.value) || 1;
    const toUm = (px: number) => (px / (scalePixels / scaleMicrometers));
    const toUm2 = (px2: number) => (px2 * Math.pow(scaleMicrometers / scalePixels, 2));
    
    const { coreRadius, maxMigration_px, haloMigration_px, cellCount, morphology } = analysis.lastAnalysisResult;
    
    let migrationArea = 0;
    if (morphology && analysis.migrationMarginPath.length > 2) {
         migrationArea = calculatePolygonArea(analysis.migrationMarginPath) - morphology.area;
    }

    // Check if an entry for this filename already exists and update it, otherwise push a new one.
    const existingResultIndex = activeTab.cumulativeResults.findIndex(r => r.filename === analysis.originalFilename);

    const newResult = {
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
 * Calculates migration metrics and stores them in the active analysis state.
 */
export function calculateAndStoreMigrationMetrics() {
    const analysis = getActiveAnalysis();
    if (!analysis || !analysis.lastAnalysisResult || !analysis.lastAnalysisResult.centerX) return;

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

async function executeLoadProject(projectData: any, file: File) {
    const recalculatingOverlay = document.getElementById('recalculating-overlay');
    if (recalculatingOverlay) recalculatingOverlay.classList.remove('hidden');

    try {
        state.tabs = [];
        state.nextTabId = 0;
        state.nextStickerId = 0;
        
        await executeImportTabs(projectData.tabs);

        if (elements.headerProjectNameInput) {
            const newName = file.name.replace('.spheroidproj', '');
            elements.headerProjectNameInput.value = newName;
        }
        
        // Find the correct index for the originally active tab
        const originalActiveTabId = projectData.tabs[projectData.activeTabIndex]?.id;
        let newActiveIndex = 0;
        if (originalActiveTabId !== undefined) {
            const foundIndex = state.tabs.findIndex(t => t.id === originalActiveTabId);
            if (foundIndex > -1) {
                newActiveIndex = foundIndex;
            }
        }

        renderTabs();
        switchTab(newActiveIndex, true);
    } catch (error) {
        console.error("Failed to execute load project:", error);
        showToast("Erro ao processar abas selecionadas.", 5000);
    } finally {
        if (recalculatingOverlay) recalculatingOverlay.classList.add('hidden');
    }
}


async function executeImportTabs(tabsToImport: any[]) {
    if (!tabsToImport || tabsToImport.length === 0) return;

    for (const tabData of tabsToImport) {
        const newTab = createNewTab(); // Gets a new ID
        
        // Copy all saved properties from the file data to the new TabState instance.
        // This includes 'name', 'currentAnalysisIndex', etc. but also 'analyses' as plain objects.
        Object.assign(newTab, tabData);

        // We must re-create the 'analyses' and 'stickers' arrays with proper class instances.
        const analysesData = tabData.analyses || [];
        const stickersData = tabData.stickers || [];
        
        newTab.analyses = [];
        newTab.stickers = [];

        // Restore stickers into StickerState instances
        for (const sData of stickersData) {
            const sticker = new StickerState(sData.id, sData.zIndex);
            Object.assign(sticker, sData);
            newTab.stickers.push(sticker);
            if (sData.id >= state.nextStickerId) state.nextStickerId = sData.id + 1;
        }

        // Restore analyses into ImageAnalysisState instances
        for (const analysisData of analysesData) {
            if (analysisData.fileData) {
                try {
                    const file = base64ToFile(analysisData.fileData, analysisData.originalFilename);
                    const analysis = new ImageAnalysisState(file);
                    
                    // Copy all saved properties from the loaded data into the new instance.
                    // We exclude 'fileData' itself, as it has been converted to a 'file' object.
                    const { fileData, ...restOfAnalysisData } = analysisData;
                    Object.assign(analysis, restOfAnalysisData);
                    
                    newTab.analyses.push(analysis);
                } catch (e) {
                    console.error(`Error processing file ${analysisData.originalFilename} for tab ${tabData.name}:`, e);
                }
            }
        }
        
        state.tabs.push(newTab);
    }
}

export async function loadProject(file: File, projectData: any, mode: 'replace' | 'add') {
    if (!file || !projectData || !projectData.tabs) return;

    try {
        if (mode === 'replace') {
            await executeLoadProject(projectData, file);
        } else { // mode === 'add'
            const recalculatingOverlay = document.getElementById('recalculating-overlay');
            if (recalculatingOverlay) recalculatingOverlay.classList.remove('hidden');
            try {
                await executeImportTabs(projectData.tabs);
                renderTabs();
                // Switch to the first of the newly added tabs.
                switchTab(state.tabs.length - projectData.tabs.length);
            } finally {
                if (recalculatingOverlay) recalculatingOverlay.classList.add('hidden');
            }
        }
    } catch (e) {
        console.error("Falha ao carregar o projeto:", e);
        showToast("Arquivo de projeto inválido ou corrompido.", 5000);
    }
}

export function populateSpeedAnalysisPanel() {
    const panel = elements.speedAnalysisPanel;
    if (!panel) return;

    const sourceDataContainer = panel.querySelector<HTMLElement>('#speed-analysis-source-data');
    const resultsContainer = panel.querySelector<HTMLElement>('#speed-analysis-results');
    const tabsSelectionContainer = panel.querySelector<HTMLElement>('#speed-analysis-tab-selection');
    
    if (!sourceDataContainer || !resultsContainer || !tabsSelectionContainer) return;
    
    // 1. Populate Tab Selection
    tabsSelectionContainer.innerHTML = state.tabs.map((tab, i) => `
        <label class="flex items-center space-x-2 p-1.5 rounded-md hover:bg-gray-700/50 cursor-pointer">
            <input type="checkbox" data-tab-index="${i}" class="speed-tab-checkbox w-4 h-4 text-teal-500 bg-gray-700 border-gray-600 rounded focus:ring-teal-500">
            <span class="text-sm truncate" title="${tab.name}">${tab.name}</span>
        </label>
    `).join('') || '<p class="text-xs text-gray-500 p-2">Nenhuma aba disponível.</p>';

    // Event listener for tab checkboxes
    tabsSelectionContainer.addEventListener('change', () => {
        const selectedIndexes = Array.from(tabsSelectionContainer.querySelectorAll<HTMLInputElement>('.speed-tab-checkbox:checked')).map(cb => parseInt(cb.dataset.tabIndex || '-1'));
        const sourceData = selectedIndexes.flatMap(i => state.tabs[i].cumulativeResults.map(r => ({ ...r, tabName: state.tabs[i].name }))).sort((a,b) => a.filename.localeCompare(b.filename));

        sourceDataContainer.innerHTML = `
            <table class="w-full text-xs">
                <thead class="bg-gray-700/50 sticky top-0 backdrop-blur-sm"><tr>
                    <th class="p-2 text-left">Aba</th><th class="p-2 text-left">Arquivo</th><th class="p-2 text-center w-24">Tempo (dias)</th>
                </tr></thead>
                <tbody>${sourceData.map((row, idx) => `
                    <tr class="border-t border-gray-700/50" data-row-index="${idx}">
                        <td class="p-2 truncate" title="${row.tabName}">${row.tabName}</td>
                        <td class="p-2 truncate" title="${row.filename}">${row.filename}</td>
                        <td contenteditable="true" class="p-2 text-center font-mono time-input bg-gray-800/50"></td>
                    </tr>
                `).join('')}</tbody>
            </table>
        `;
    });

    const calculateBtn = panel.querySelector('#calculate-speeds-btn');
    calculateBtn?.addEventListener('click', () => {
        if (!sourceDataContainer || !tabsSelectionContainer || !resultsContainer) return;
        
        const timeInputs = Array.from(sourceDataContainer.querySelectorAll<HTMLElement>('.time-input'));
        const selectedIndexes = Array.from(tabsSelectionContainer.querySelectorAll<HTMLInputElement>('.speed-tab-checkbox:checked')).map(cb => parseInt(cb.dataset.tabIndex || '-1'));
        const sourceData = selectedIndexes.flatMap(i => state.tabs[i].cumulativeResults.map(r => ({ ...r, tabName: state.tabs[i].name }))).sort((a,b) => a.filename.localeCompare(b.filename));

        const dataWithTime = sourceData.map((row, i) => ({
            ...row,
            time: parseFloat(timeInputs[i].innerText.replace(',', '.'))
        })).filter(row => !isNaN(row.time));

        const analysisMode = (panel.querySelector<HTMLInputElement>('input[name="speed-analysis-mode"]:checked')?.value) || 'within-tabs';

        resultsContainer.innerHTML = '';
        resultsContainer.classList.remove('hidden');

        const calculateAndRenderSpeeds = (data: any[], title: string) => {
            const sortedData = data.sort((a, b) => a.time - b.time);
            if (sortedData.length < 2) return false;
    
            const r1 = sortedData[0];
            const r2 = sortedData[sortedData.length - 1];
            const timeDiff = r2.time - r1.time;
    
            if (timeDiff <= 0) return false;
    
            const areaDiff = parseFloat(r2.migrationArea_um2) - parseFloat(r1.migrationArea_um2);
            const cellDiff = r2.cellCount - r1.cellCount;
            const spheroidGrowth = parseFloat(r2.coreRadius_um) - parseFloat(r1.coreRadius_um);
            const maxMigrationDiff = parseFloat(r2.maxMigration_um) - parseFloat(r1.maxMigration_um);
            const haloMigrationDiff = parseFloat(r2.haloMigration_um) - parseFloat(r1.haloMigration_um);
    
            const migrationSpeedArea = areaDiff / timeDiff;
            const proliferationSpeed = cellDiff / timeDiff;
            const spheroidGrowthSpeed = spheroidGrowth / timeDiff;
            const maxMigrationSpeed = maxMigrationDiff / timeDiff;
            const haloMigrationSpeed = haloMigrationDiff / timeDiff;
    
            const resultEl = document.createElement('div');
            resultEl.className = 'bg-gray-800/50 p-2 rounded-md text-xs';
            resultEl.innerHTML = `
                <h4 class="font-semibold text-teal-400">${title} (Δt = ${timeDiff.toFixed(1)} dias)</h4>
                <div class="mt-1 space-y-1">
                    <div class="flex justify-between"><span>Vel. Crescimento (Raio):</span><span class="font-mono">${spheroidGrowthSpeed.toFixed(1)} µm/dia</span></div>
                    <div class="flex justify-between"><span>Vel. Migração (Halo):</span><span class="font-mono">${haloMigrationSpeed.toFixed(1)} µm/dia</span></div>
                    <div class="flex justify-between"><span>Vel. Migração (Máx):</span><span class="font-mono">${maxMigrationSpeed.toFixed(1)} µm/dia</span></div>
                    <div class="flex justify-between pt-1 mt-1 border-t border-gray-700/50"><span>Vel. Migração (Área):</span><span class="font-mono">${migrationSpeedArea.toFixed(0)} µm²/dia</span></div>
                    <div class="flex justify-between"><span>Vel. Proliferação (Células):</span><span class="font-mono">${proliferationSpeed.toFixed(0)} células/dia</span></div>
                </div>
            `;
            resultsContainer.appendChild(resultEl);
            return true;
        };
    
        let calculationsSucceeded = false;
    
        if (analysisMode === 'within-tabs') {
            const groupedByTab = dataWithTime.reduce((acc, row) => {
                acc[row.tabName] = acc[row.tabName] || [];
                acc[row.tabName].push(row);
                return acc;
            }, {} as Record<string, any[]>);
    
            for (const tabName in groupedByTab) {
                const success = calculateAndRenderSpeeds(groupedByTab[tabName], tabName);
                if (success) calculationsSucceeded = true;
            }
        } else { // 'all-together' mode
            calculationsSucceeded = calculateAndRenderSpeeds(dataWithTime, 'Resultado Combinado');
        }
    
        if (!calculationsSucceeded) {
            resultsContainer.innerHTML = '<p class="text-xs text-amber-400 p-2">Dados insuficientes ou intervalo de tempo inválido para calcular velocidades.</p>';
        }
    });


    // Paste data logic
    const pasteArea = panel.querySelector<HTMLTextAreaElement>('#paste-data-area');
    const loadPastedBtn = panel.querySelector<HTMLButtonElement>('#load-pasted-data-btn');

    loadPastedBtn?.addEventListener('click', () => {
        if (!sourceDataContainer || !pasteArea) return;
        const text = pasteArea.value.trim();
        if (!text) return;

        const rows = text.split('\n').map(r => r.split('\t'));
        if (rows.length === 0) return;

        const allTableRows = Array.from(sourceDataContainer.querySelectorAll<HTMLElement>('tr[data-row-index]'));
        if (allTableRows.length === 0) {
            showToast("Primeiro selecione as abas para carregar a tabela de arquivos.", 4000);
            return;
        }

        let filenameIndex = 0; // default to first column
        let timeIndex = 1; // default to second column
        let foundFilenameInHeader = false;
        let foundTimeInHeader = false;

        const header = rows[0];
        // A simple heuristic: if the first cell of the first row contains "arquivo" or "file", it's a header.
        if (header.length > 0 && (header[0].toLowerCase().includes('arquivo') || header[0].toLowerCase().includes('file'))) {
            header.forEach((col, i) => {
                const lowerCol = col.toLowerCase().trim();
                if (lowerCol.includes('arquivo') || lowerCol.includes('file')) {
                    filenameIndex = i;
                    foundFilenameInHeader = true;
                }
                if (lowerCol.includes('tempo') || lowerCol.includes('time') || lowerCol.includes('dias') || lowerCol.includes('days')) {
                    timeIndex = i;
                    foundTimeInHeader = true;
                }
            });
        }
        
        const hasHeader = foundFilenameInHeader || foundTimeInHeader;
        const dataRows = hasHeader ? rows.slice(1) : rows;

        const pastedDataMap = new Map<string, string>();
        dataRows.forEach(row => {
            if (row.length > filenameIndex && row.length > timeIndex) {
                const filename = row[filenameIndex].trim();
                const time = row[timeIndex].trim();
                if (filename && time && !isNaN(parseFloat(time.replace(',', '.')))) {
                    pastedDataMap.set(filename, time);
                }
            }
        });

        if (pastedDataMap.size === 0) {
            if (foundFilenameInHeader && !foundTimeInHeader) {
                showToast("Coluna 'Tempo' não encontrada. Adicione esta coluna na sua planilha antes de colar.", 6000);
            } else {
                showToast("Formato de dados inválido. Cole uma tabela com colunas 'Arquivo' e 'Tempo'.", 5000);
            }
            return;
        }

        let matchCount = 0;
        allTableRows.forEach(tableRow => {
            const filenameCell = tableRow.querySelector<HTMLElement>('td:nth-child(2)');
            const timeInputCell = tableRow.querySelector<HTMLElement>('.time-input');
            if (filenameCell && timeInputCell) {
                const filenameInTable = filenameCell.getAttribute('title') || filenameCell.innerText;
                if (pastedDataMap.has(filenameInTable)) {
                    timeInputCell.innerText = pastedDataMap.get(filenameInTable)!.replace('.', ',');
                    matchCount++;
                }
            }
        });

        if (matchCount > 0) {
            showToast(`${matchCount} tempos foram carregados com sucesso.`, 3000);
            pasteArea.value = '';
        } else {
            showToast("Nenhum nome de arquivo na tabela corresponde aos nomes no texto colado.", 4000);
        }
    });
}