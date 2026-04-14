// Colormap utils
export function valToRgb(val: number, min: number, max: number, cmap: string): [number, number, number] {
    const range = max - min || 1;
    let norm = Math.max(0, Math.min(1, (val - min) / range));

    if (cmap === 'Reds') {
        if (norm <= 0.5) return _interpolate([255, 245, 240], [251, 106, 74], norm * 2);
        return _interpolate([251, 106, 74], [103, 0, 13], (norm - 0.5) * 2);
    }
    if (cmap === 'Greens') {
        if (norm <= 0.5) return _interpolate([247, 252, 245], [116, 196, 118], norm * 2);
        return _interpolate([116, 196, 118], [0, 68, 27], (norm - 0.5) * 2);
    }
    if (cmap === 'Blues') {
        if (norm <= 0.5) return _interpolate([247, 251, 255], [107, 174, 214], norm * 2);
        return _interpolate([107, 174, 214], [8, 48, 107], (norm - 0.5) * 2);
    }
    
    // Custom I(2D)/I(G)
    // Monolayer (Green) vs Multilayer (Red)
    if (cmap === 'custom2DG') {
        if (val <= 0) return [255, 255, 255]; // Null pixels
        if (norm <= 0.2) return _interpolate([255, 0, 0], [255, 140, 0], norm / 0.2); // Red to Orange
        if (norm <= 0.35) return _interpolate([255, 140, 0], [255, 255, 0], (norm - 0.2) / 0.15); // Orange to Yellow
        if (norm <= 0.6) return _interpolate([255, 255, 0], [144, 238, 144], (norm - 0.35) / 0.25); // Yellow to Light Green
        if (norm <= 0.85) return _interpolate([144, 238, 144], [0, 128, 0], (norm - 0.6) / 0.25); // Light Green to Green
        if (norm <= 1.0) return _interpolate([0, 128, 0], [0, 80, 0], (norm - 0.85) / 0.15); // Green to Dark Green
        return [0, 80, 0];
    }
    
    // Custom I(D)/I(G)
    // 0: white, 0.33: light pink, 0.66: red, 1.0: dark red
    if (cmap === 'customDGdefects') {
        if (val <= 0) return [255, 255, 255];
        if (norm <= 0.33) return _interpolate([255,255,255], [255,178,178], norm/0.33);
        if (norm <= 0.66) return _interpolate([255,178,178], [255,0,0], (norm-0.33)/0.33);
        if (norm <= 1.0) return _interpolate([255,0,0], [51,0,0], (norm-0.66)/0.34);
        return [51, 0, 0];
    }
    
    // Default Viridis
    const r = Math.max(0, Math.min(255, 255 * (3.11 * norm - 1.4)));
    const g = Math.max(0, Math.min(255, 255 * (2.8 * norm - 0.7)));
    const b = Math.max(0, Math.min(255, 255 * (1.5 - 2.8 * Math.abs(norm - 0.3))));
    return [r, g, b];
}

function _interpolate(color1: number[], color2: number[], factor: number): [number, number, number] {
    const r = Math.round(color1[0] + factor * (color2[0] - color1[0]));
    const g = Math.round(color1[1] + factor * (color2[1] - color1[1]));
    const b = Math.round(color1[2] + factor * (color2[2] - color1[2]));
    return [Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b))];
}

export function getCssGradient(cmap: string): string {
    const steps = 10;
    const colors = [];
    for (let i = 0; i <= steps; i++) {
        const [r, g, b] = valToRgb(i, 0, steps, cmap);
        colors.push(`rgb(${r},${g},${b})`);
    }
    return colors.join(', ');
}
