import { state, getActiveAnalysis } from "./state";
import { scaleBarMicrometersInput, scaleBarPixelsInput } from "./elements";

/**
 * A collection of pure utility functions used across the application.
 */

export function showToast(message: string, duration = 2000) {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('show', 'opacity-100', 'translate-y-0');
        setTimeout(() => {
            toast.classList.remove('show', 'opacity-100', 'translate-y-0');
            toast.classList.add('opacity-0', '-translate-y-12');
            setTimeout(() => { toast.classList.add('hidden'); }, 500);
        }, duration);
    });
}

export function copyToClipboard(text: string, successCallback?: () => void, errorCallback?: (err: Error) => void) {
    navigator.clipboard.writeText(text).then(successCallback, errorCallback);
}

export function debounce(func: (...args: any[]) => void, wait: number) {
    let timeout: number;
    return function executedFunction(...args: any[]) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = window.setTimeout(later, wait);
    };
}

export function calculatePolygonArea(path: { x: number; y: number }[]) {
    if (path.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < path.length; i++) {
        area += (path[i].x * path[(i + 1) % path.length].y - path[(i + 1) % path.length].x * path[i].y);
    }
    return Math.abs(area / 2);
}

export function getConvexHull(points: { x: number; y: number }[]) {
    if (points.length < 3) return points;
    points.sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (p1: any, p2: any, p3: any) => (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
    const lower: { x: number, y: number }[] = [], upper: { x: number, y: number }[] = [];
    for (const p of points) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
    }
    for (let i = points.length - 1; i >= 0; i--) {
        const p = points[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
    }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export function calculatePathPerimeter(path: { x: number; y: number }[]) {
    let perimeter = 0;
    if (!path || path.length < 2) return 0;
    for (let i = 0; i < path.length - 1; i++) perimeter += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
    if (path.length > 2 && (path[0].x !== path[path.length -1].x || path[0].y !== path[path.length-1].y)) {
        perimeter += Math.hypot(path[0].x - path[path.length - 1].x, path[0].y - path[path.length - 1].y);
    }
    return perimeter;
}

export function simplifyPath(points: { x: number; y: number }[], tolerance: number): { x: number; y: number }[] {
    if (points.length < 3) return points;
    const d2 = (p: any, p1: any, p2: any) => { let t, x=p1.x, y=p1.y, dx=p2.x-x, dy=p2.y-y; if(dx!==0||dy!==0) { t=((p.x-x)*dx+(p.y-y)*dy)/(dx*dx+dy*dy); if(t>1){x=p2.x;y=p2.y}else if(t>0){x+=dx*t;y+=dy*t} } dx=p.x-x; dy=p.y-y; return dx*dx+dy*dy; };
    const rdp = (pts: any, start: number, end: number, tol: number, simplified: any) => { let maxD2 = 0, index = 0; for (let i = start + 1; i < end; i++) { const d = d2(pts[i], pts[start], pts[end]); if (d > maxD2) { index = i; maxD2 = d; } } if (maxD2 > tol * tol) { rdp(pts, start, index, tol, simplified); simplified.push(pts[index]); rdp(pts, index, end, tol, simplified); } };
    const simplified = [points[0]];
    rdp(points, 0, points.length - 1, tolerance, simplified);
    simplified.push(points[points.length - 1]);
    return simplified;
}

export function smoothPath(path: { x: number; y: number }[], windowSize: number): { x: number; y: number }[] {
    if (path.length < 3 || windowSize < 1) return path;

    const smoothedPath: { x: number; y: number }[] = [];
    // Check if the path is closed by comparing start and end points
    const isClosed = path.length > 1 && path[0].x === path[path.length - 1].x && path[0].y === path[path.length - 1].y;
    const pointCount = isClosed ? path.length - 1 : path.length;

    if (pointCount === 0) return [];

    for (let i = 0; i < pointCount; i++) {
        let sumX = 0;
        let sumY = 0;
        let count = 0;
        
        for (let j = -windowSize; j <= windowSize; j++) {
            let index = i + j;
            
            if (isClosed) {
                // Wrap around for closed paths
                index = (index + pointCount) % pointCount;
            } else {
                // Clamp to boundaries for open paths
                index = Math.max(0, Math.min(pointCount - 1, index));
            }
            
            sumX += path[index].x;
            sumY += path[index].y;
            count++;
        }
        
        smoothedPath.push({ x: sumX / count, y: sumY / count });
    }
    
    // If the original path was closed, close the smoothed path too
    if (isClosed && smoothedPath.length > 0) {
        smoothedPath.push({ ...smoothedPath[0] });
    }
    
    return smoothedPath;
}

export function pointInPolygon(point: { x: number, y: number }, vs: { x: number, y: number }[]) {
    if (!vs || vs.length < 3) return false;
    let x = point.x, y = point.y, inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i].x, yi = vs[i].y, xj = vs[j].x, yj = vs[j].y;
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
}

export function findContourPointAtAngle(path: { x: number; y: number }[], center: { x: number; y: number }, angle: number) {
    const analysis = getActiveAnalysis();
    if (!path || path.length === 0) {
        const coreRadius = analysis?.lastAnalysisResult.coreRadius || 1;
        return { x: center.x + Math.cos(angle) * coreRadius, y: center.y + Math.sin(angle) * coreRadius };
    }
    let closestPoint = path[0], minAngleDiff = Infinity;
    for (const p of path) {
        const pointAngle = Math.atan2(p.y - center.y, p.x - center.x);
        let diff = Math.abs(angle - pointAngle);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff < minAngleDiff) { minAngleDiff = diff; closestPoint = p; }
    }
    return closestPoint;
}

export function convolve(pixels: { data: Uint8ClampedArray; width: number; height: number }, weights: number[]) {
    const side = Math.round(Math.sqrt(weights.length)), halfSide = Math.floor(side / 2);
    const src = pixels.data, sw = pixels.width, sh = pixels.height;
    const output = new ImageData(sw, sh), dst = output.data;
    for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
            const dstOff = (y * sw + x) * 4;
            let r = 0, g = 0, b = 0;
            for (let cy = 0; cy < side; cy++) {
                for (let cx = 0; cx < side; cx++) {
                    const scy = Math.min(sh - 1, Math.max(0, y + cy - halfSide));
                    const scx = Math.min(sw - 1, Math.max(0, x + cx - halfSide));
                    const srcOff = (scy * sw + scx) * 4;
                    const wt = weights[cy * side + cx];
                    r += src[srcOff] * wt; g += src[srcOff + 1] * wt; b += src[srcOff + 2] * wt;
                }
            }
            dst[dstOff] = r; dst[dstOff + 1] = g; dst[dstOff + 2] = b; dst[dstOff + 3] = src[dstOff + 3];
        }
    }
    return output;
}

export function createRadialContour(points: { x: number; y: number }[], center: { x: number; y: number }) {
    if (!points || points.length < 3) return points;
    const numAngles = 360, farthestPoints = new Array(numAngles).fill(null), farthestDistSq = new Array(numAngles).fill(0);
    for (const p of points) {
        const dx = p.x - center.x, dy = p.y - center.y;
        let angle = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);
        if (angle < 0) angle += 360;
        const distSq = dx * dx + dy * dy;
        if (distSq > farthestDistSq[angle]) {
            farthestDistSq[angle] = distSq;
            farthestPoints[angle] = p;
        }
    }
    return farthestPoints.filter(p => p !== null);
}

export function isCellPositionValid(pos: {x: number, y: number}) {
    const analysis = getActiveAnalysis();
    if (!pos || !analysis || !analysis.lastAnalysisResult) return false;
    const { centerX, centerY, maxRadius } = analysis.lastAnalysisResult;
    if (!analysis.manualDrawnPath || analysis.manualDrawnPath.length < 3 || pointInPolygon(pos, analysis.manualDrawnPath)) return false;
    if (maxRadius && centerX !== undefined) {
        if (Math.hypot(pos.x - centerX, pos.y - centerY) > maxRadius) return false;
    }
    return true;
}

export function isPointInEllipse(point: any, ellipse: any, scale = 1) {
    const cos = Math.cos(ellipse.angle), sin = Math.sin(ellipse.angle);
    const dx = point.x - ellipse.centroid.x, dy = point.y - ellipse.centroid.y;
    const a = (cos * dx + sin * dy), b = (sin * dx - cos * dy);
    return (a * a) / ((ellipse.radiusX*scale)**2) + (b * b) / ((ellipse.radiusY*scale)**2) <= 1;
}

export function createParticleFromPixels(pixels: any[], isManual = false) {
    const um2PerPx2 = (parseFloat(scaleBarMicrometersInput.value) / parseFloat(scaleBarPixelsInput.value)) ** 2;
    let sumX = 0, sumY = 0;
    pixels.forEach(p => { sumX += p.x; sumY += p.y; });
    const centroid = { x: sumX / pixels.length, y: sumY / pixels.length };
    return { pixels, centroid, ellipse: fitEllipse(pixels), areaUm2: pixels.length * um2PerPx2, isManual };
}

export function fitEllipse(points: any[]) {
    if (points.length < 5) {
        const centroid = points.reduce((acc, p) => ({x: acc.x + p.x, y: acc.y + p.y}), {x:0, y:0});
        if (points.length > 0) { centroid.x /= points.length; centroid.y /= points.length; }
        return { centroid, radiusX: 3, radiusY: 3, angle: 0 };
    }
    let x_ = 0, y_ = 0, n = points.length;
    points.forEach(p => { x_ += p.x; y_ += p.y; }); x_ /= n;
    let m11 = 0, m20 = 0, m02 = 0;
    points.forEach(p => { const dx = p.x-x_, dy = p.y-y_; m11 += dx * dy; m20 += dx * dx; m02 += dy * dy; });
    m11 /= n; m20 /= n; m02 /= n;
    const angle = 0.5 * Math.atan2(2 * m11, m20 - m02);
    const cos_ = Math.cos(angle), sin_ = Math.sin(angle);
    const J = m20 * sin_**2 - 2 * m11 * sin_ * cos_ + m02 * cos_**2;
    const K = m20 * cos_**2 + 2 * m11 * sin_ * cos_ + m02 * sin_**2;
    return { centroid: { x: x_, y: y_ }, radiusX: Math.sqrt(4 * J), radiusY: Math.sqrt(4 * K), angle };
}

/**
 * Extracts grayscale pixel values and their coordinates from within a polygon on a canvas.
 * @param path The polygon path.
 * @param canvas The source canvas.
 * @returns An array of objects, each containing a pixel's value and coordinates.
 */
function getPixelDataInPath(path: {x: number, y: number}[], canvas: HTMLCanvasElement): {value: number, x: number, y: number}[] {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];

    const { width, height } = canvas;
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) return [];
    
    maskCtx.moveTo(path[0].x, path[0].y);
    path.forEach(p => maskCtx.lineTo(p.x, p.y));
    maskCtx.closePath();
    maskCtx.fill();

    const imageData = ctx.getImageData(0, 0, width, height).data;
    const maskData = maskCtx.getImageData(0, 0, width, height).data;
    const pixels: {value: number, x: number, y: number}[] = [];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            if (maskData[i + 3] > 0) { // Check if the pixel is inside the mask
                const gray = Math.round(0.299 * imageData[i] + 0.587 * imageData[i+1] + 0.114 * imageData[i+2]);
                pixels.push({ value: gray, x, y });
            }
        }
    }
    return pixels;
}

/**
 * Checks if an image on a canvas is grayscale by sampling pixels.
 * @param canvas The canvas containing the image to check.
 * @returns True if the image is likely grayscale, false otherwise.
 */
export function isImageGrayscale(canvas: HTMLCanvasElement): boolean {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;

    const { width, height } = canvas;
    const imageData = ctx.getImageData(0, 0, width, height).data;
    
    // Don't check every pixel for performance. Sample up to 500 pixels.
    const numSamples = Math.min(500, width * height);
    if (numSamples === 0) return true; // Empty image is technically grayscale

    for (let i = 0; i < numSamples; i++) {
        const x = Math.floor(Math.random() * width);
        const y = Math.floor(Math.random() * height);
        const index = (y * width + x) * 4;
        const r = imageData[index];
        const g = imageData[index + 1];
        const b = imageData[index + 2];
        
        // If RGB components are not equal (within a small tolerance for artifacts), it's not grayscale.
        if (Math.abs(r - g) > 2 || Math.abs(r - b) > 2) {
            return false;
        }
    }
    return true;
}


/**
 * Calculates morphological and texture indicators.
 * @param path The array of points defining the spheroid contour.
 * @param canvas The canvas with the processed image data.
 * @returns An object containing all calculated metrics.
 */
export function calculateMorphologicalMetrics(path: {x: number, y: number}[], canvas: HTMLCanvasElement) {
    const defaultMetrics = {
        area: 0, perimeter: 0, diameter: 0, circularity: 0, sphericity: 0,
        compactness: 0, solidity: 0, convexity: 0,
        entropy: 0, skewness: 0, kurtosis: 0, mean: 0, variance: 0,
        meanGradient: 0, varianceGradient: 0,
        centroid: { x: 0, y: 0 }
    };
    
    if (path.length < 3) return defaultMetrics;

    // --- Shape-based Metrics ---
    const area = calculatePolygonArea(path);
    const perimeter = calculatePathPerimeter(path);
    const hull = getConvexHull(path.slice(0, -1));
    const convexArea = calculatePolygonArea(hull);
    const convexPerimeter = calculatePathPerimeter([...hull, hull[0]]);
    const equivalentDiameter = Math.sqrt(4 * area / Math.PI);
    let maxDistSq = 0;
    for (let i = 0; i < path.length; i++) {
        for (let j = i + 1; j < path.length; j++) {
            maxDistSq = Math.max(maxDistSq, (path[i].x - path[j].x)**2 + (path[i].y - path[j].y)**2);
        }
    }
    const maxDiameter = Math.sqrt(maxDistSq);

    const circularity = convexPerimeter > 0 ? (4 * Math.PI * area) / (convexPerimeter**2) : 0;
    const convexity = perimeter > 0 ? convexPerimeter / perimeter : 0;
    const compactness = perimeter > 0 ? (4 * Math.PI * area) / (perimeter**2) : 0;
    const solidity = convexArea > 0 ? area / convexArea : 0;
    const sphericity = perimeter > 0 ? (Math.PI * equivalentDiameter) / perimeter : 0;

    // --- Texture-based Metrics ---
    const pixelData = getPixelDataInPath(path, canvas);
    const pixelValues = pixelData.map(p => p.value);
    
    let mean = 0, variance = 0, entropy = 0, skewness = 0, kurtosis = 0;
    let meanGradient = 0, varianceGradient = 0;
    let centroid = { x: 0, y: 0 };

    const n = pixelValues.length;
    if (n > 0) {
        let sumX = 0;
        let sumY = 0;
        pixelData.forEach(p => {
            sumX += p.x;
            sumY += p.y;
        });
        centroid = { x: sumX / n, y: sumY / n };

        // Mean (GL_mean)
        mean = pixelValues.reduce((sum, val) => sum + val, 0) / n;
        
        // Sample Variance and Standard Deviation
        variance = n > 1 ? pixelValues.reduce((sum, val) => sum + (val - mean)**2, 0) / (n - 1) : 0;
        const stdDev = Math.sqrt(variance);

        // Entropy
        const histogram = new Array(256).fill(0);
        pixelValues.forEach(p => histogram[p]++);
        entropy = histogram.reduce((ent, count) => {
            if (count > 0) {
                const probability = count / n;
                // Standard Shannon Entropy formula: -Σ(p * log2(p)). This ensures a non-negative result.
                ent -= probability * Math.log2(probability);
            }
            return ent;
        }, 0);

        // Skewness & Kurtosis
        const epsilon = 1e-6; // To avoid division by zero on uniform images
        if (stdDev > epsilon) {
            // Moments are calculated with population size 'n'
            const m3 = pixelValues.reduce((sum, val) => sum + (val - mean)**3, 0) / n;
            const m4 = pixelValues.reduce((sum, val) => sum + (val - mean)**4, 0) / n;
            // Skewness and Kurtosis are normalized by sample standard deviation 'stdDev' (s)
            // This aligns with common statistical software packages like MATLAB
            skewness = m3 / (stdDev**3);
            kurtosis = m4 / (stdDev**4);
        }

        // Gradient Metrics
        const { width, height } = canvas;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
            const imageData = ctx.getImageData(0, 0, width, height).data;
            const gradients: number[] = [];
            const getGray = (x: number, y: number) => 0.299 * imageData[(y * width + x) * 4] + 0.587 * imageData[(y * width + x) * 4 + 1] + 0.114 * imageData[(y * width + x) * 4 + 2];

            pixelData.forEach(({x, y}) => {
                if (x < width - 1 && y < height - 1) {
                    const gx = getGray(x + 1, y) - getGray(x, y);
                    const gy = getGray(x, y + 1) - getGray(x, y);
                    gradients.push(Math.sqrt(gx*gx + gy*gy));
                }
            });
            
            if (gradients.length > 0) {
                meanGradient = gradients.reduce((sum, val) => sum + val, 0) / gradients.length;
                varianceGradient = gradients.reduce((sum, val) => sum + (val - meanGradient)**2, 0) / gradients.length;
            }
        }
    }

    return {
        area,
        perimeter,
        diameter: maxDiameter,
        circularity,
        sphericity,
        compactness,
        solidity,
        convexity,
        entropy,
        skewness,
        kurtosis,
        mean,
        variance,
        meanGradient,
        varianceGradient,
        centroid
    };
}