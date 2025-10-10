import { state, getActiveTab, getActiveAnalysis, TabState, ImageAnalysisState } from './state';
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

async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
}

function base64ToFile(base64: string, filename: string): File {
    const arr = base64.split(','), mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) throw new Error("Invalid base64 string");
    const bstr = atob(arr[1]); let n = bstr.length; const u8arr = new Uint8Array(n);
    while(n--) u8arr[n] = bstr.charCodeAt(n);
    return new File([u8arr], filename, {type:mimeMatch[1]});
}

export async function saveProject() {
    if (elements.saveProjectButton) {
        elements.saveProjectButton.disabled = true;
        elements.saveProjectButton.textContent = 'Salvando...';
    }
    try {
        const serializableTabs = await Promise.all(state.tabs.map(async (tab) => {
            const serializableAnalyses = await Promise.all(tab.analyses.map(async (analysis) => {
                const { originalImage, file, ...rest } = analysis;
                return {
                    ...rest,
                    fileData: await fileToBase64(file)
                };
            }));
            return { ...tab, analyses: serializableAnalyses };
        }));
        
        const projectData = { version: "1.4-recalc", tabs: serializableTabs, activeTabIndex: state.activeTabIndex };
        const blob = new Blob([JSON.stringify(projectData)], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        const projectName = elements.projectNameInput.value || "meu-projeto";
        link.download = `${projectName}.spheroidproj`;
        link.click();
        URL.revokeObjectURL(link.href);
    } catch (error) { 
        console.error("Failed to save project:", error); 
        alert("Ocorreu um erro ao salvar o projeto."); 
    } finally {
        if (elements.saveProjectButton) {
            elements.saveProjectButton.disabled = false;
            elements.saveProjectButton.textContent = 'Salvar Projeto';
        }
    }
}

export function loadProject(file: File) {
    const reader = new FileReader();
    reader.onload = async (e) => { // Make this async
        const recalculatingOverlay = document.getElementById('recalculating-overlay');
        
        // Temporarily store old state to avoid side effects in case of failure
        const oldTabs = state.tabs;
        const oldActiveIndex = state.activeTabIndex;

        try {
            const projectData = JSON.parse(e.target?.result as string);
            if (!projectData.version || !projectData.tabs) throw new Error("Formato inválido.");

            if (recalculatingOverlay) recalculatingOverlay.classList.remove('hidden');

            // Load data structure
            state.tabs = projectData.tabs.map((tabData: any) => {
                const newTab = new TabState(tabData.id, tabData.name);
                newTab.analyses = tabData.analyses.map((analysisData: any) => {
                    const imageFile = base64ToFile(analysisData.fileData, analysisData.originalFilename);
                    const analysis = new ImageAnalysisState(imageFile);
                    Object.assign(analysis, { ...analysisData, file: imageFile, originalImage: null });
                    return analysis;
                });
                newTab.currentAnalysisIndex = tabData.currentAnalysisIndex;
                newTab.stickers = tabData.stickers || [];
                // Do not load cumulative results, they will be rebuilt.
                return newTab;
            });
            
            // --- RECALCULATION LOOP ---
            for (let i = 0; i < state.tabs.length; i++) {
                const tab = state.tabs[i];
                tab.cumulativeResults = []; // Clear old results
                
                for (let j = 0; j < tab.analyses.length; j++) {
                    const analysis = tab.analyses[j];
                    
                    try {
                        // Set this as the "active" analysis for the global functions to work
                        state.activeTabIndex = i;
                        tab.currentAnalysisIndex = j;

                        // Load image data in background
                        const image = await loadImagePromise(analysis.file);
                        analysis.originalImage = image;

                        // Set up canvases
                        elements.allCanvases.forEach(c => {
                            if(c) { c.width = image.width; c.height = image.height; }
                        });
                        elements.originalCanvas.getContext('2d')?.drawImage(image, 0, 0);

                        applyImageFilters(analysis);
                        
                        // Only run analysis if there's a contour to analyze
                        if (analysis.manualDrawnPath && analysis.manualDrawnPath.length > 2) {
                            analyzeSpheroid(); 
                            calculateAndStoreMigrationMetrics();
                        }

                        // Add to cumulative results (addToCumulativeResults checks if analysis was done)
                        analysis.isCurrentAnalysisSaved = false; // Force it to be addable
                        addToCumulativeResults();

                    } catch (analysisError) {
                        console.error(`Failed to recalculate analysis for ${analysis.originalFilename}:`, analysisError);
                    }
                }
            }
            // --- END RECALCULATION ---

            // Restore final active state and refresh UI
            state.activeTabIndex = projectData.activeTabIndex ?? 0;
            const finalActiveTab = getActiveTab();
            if (finalActiveTab) {
                finalActiveTab.currentAnalysisIndex = projectData.tabs[state.activeTabIndex]?.currentAnalysisIndex ?? 0;
            }
            
            if (elements.projectNameInput && elements.headerProjectNameInput) {
                const newName = file.name.replace('.spheroidproj', '');
                elements.projectNameInput.value = newName;
                elements.headerProjectNameInput.value = newName;
            }
            
            renderTabs();
            switchTab(state.activeTabIndex, true); // Force full refresh

        } catch (error) { 
            console.error("Failed to load and recalculate project:", error); 
            alert("Erro ao carregar o projeto. O arquivo pode estar corrompido ou em um formato antigo."); 
            // Restore old state on failure
            state.tabs = oldTabs;
            state.activeTabIndex = oldActiveIndex;
        } finally {
            if (recalculatingOverlay) recalculatingOverlay.classList.add('hidden');
        }
    };
    reader.readAsText(file);
}