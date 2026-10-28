/** Resolve identity before display names: parent IDs must not swallow child IDs. */
export function resolveWorkspaceSample(file: {sample_id?: string; sample_code?: string; sample_name?: string; name: string; h5_relative_path: string}, samples: any[]) {
    const byId = samples.find(sample => file.sample_id && sample.id === file.sample_id);
    if (byId) return byId;
    const byCode = samples.find(sample => file.sample_code && sample.sample_code?.toLowerCase() === file.sample_code.toLowerCase());
    if (byCode) return byCode;
    const candidates = samples.filter(sample => sample.sample_code).sort((a, b) => b.sample_code.length - a.sample_code.length);
    const sources = [file.name, ...file.h5_relative_path.replace(/\\/g, '/').split('/').slice(0, -1).reverse()];
    for (const source of sources) {
        const match = candidates.find(sample => {
            const code = sample.sample_code.toLowerCase();
            const text = source.toLowerCase();
            return text === code || (text.startsWith(code) && /[_\s.]/.test(text[code.length] || ''));
        });
        if (match) return match;
    }
    const named = samples.filter(sample => sample.sample_code === file.sample_name || sample.name === file.sample_name);
    return named.length === 1 ? named[0] : undefined;
}

export type ChipType = 'analyte' | 'laser' | 'power' | 'objective' | 'time' | 'acc' | 'map' | 'misc';
export interface Chip { label: string; type: ChipType; }
export function measurementChips(file: {name: string; parameters?: Record<string, unknown>}) {
    const fallback = parseFileChips(file.name);
    const fields: Record<string, ChipType> = {'Analyte':'analyte','Laser':'laser','Power':'power','Objective':'objective','Acquisition Time':'time','Accumulations':'acc','Spots':'map','Size':'map'};
    if (!file.parameters || !Object.keys(file.parameters).length) return {...fallback, source: 'filename' as const};
    const chips: Chip[] = [];
    for (const [key, type] of Object.entries(fields)) {
        const value = file.parameters[key];
        if (value == null || value === '') continue;
        let label = String(value);
        if (type === 'laser') {
            const match = label.match(/^(\d+(?:[.,]\d+)?)\s*nm$/i);
            if (match) label = `${Math.round(Number(match[1].replace(',', '.')) * 10) / 10}nm`;
        }
        chips.push({type, label});
    }
    return {chips, spot: fallback.spot, source: 'metadata' as const};
}

export function reviewedMeasurementParameters(data: Record<string, any>): Record<string, string> {
    const reviewed = data.asset_manifest?.reviewed_parameters;
    const source = reviewed && Object.keys(reviewed).length ? reviewed : data;
    return Object.fromEntries(['Analyte','Laser','Power','Objective','Acquisition Time','Accumulations','Spots','Size'].filter(key => source[key] !== undefined && source[key] !== null).map(key => [key, String(source[key])]));
}

export function physicalMapSize(parameters?: Record<string, unknown>): {width: number; height: number} | undefined {
    const match = String(parameters?.Size || '').match(/^(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(µm|μm|um|mm)$/i);
    if (!match) return undefined;
    const factor = match[3].toLowerCase() === 'mm' ? 1000 : 1;
    const width = Number(match[1].replace(',', '.')) * factor, height = Number(match[2].replace(',', '.')) * factor;
    return width > 0 && height > 0 ? {width, height} : undefined;
}

export function parseFileChips(name: string): {chips: Chip[]; spot: string | null} {
    const raw = name.replace(/\.h5$/i, '').replace(/_preprocessed(_\d+)?$/i, '').split('_').filter(Boolean);
    let start = 1;
    if (/^(RAMAN|SERS|TERS|FTIR|PL|XRD|XPS|AFM)$/i.test(raw[start] || '')) start++;
    const tokens = raw.slice(start);
    const spot = tokens.find(token => /^Spot\d+$/i.test(token)) || null;
    const chips: Chip[] = [];
    const number = '\\d+(?:[.,]\\d+)?';
    for (const token of tokens.slice(0, spot ? tokens.indexOf(spot) : tokens.length)) {
        let type: ChipType = 'analyte';
        if (new RegExp(`^${number}nm$`, 'i').test(token)) type = 'laser';
        else if (new RegExp(`^${number}[µμum]W$`, 'i').test(token)) type = 'power';
        else if (new RegExp(`^${number}x$`, 'i').test(token)) type = 'objective';
        else if (new RegExp(`^${number}s$`, 'i').test(token)) type = 'time';
        else if (/^\d+ac$/i.test(token)) type = 'acc';
        else if (/^\d+$/.test(token) && Number(token) <= 500) {chips.push({label: `${token}ac`, type: 'acc'}); continue;}
        else if (/\d+x\d+/i.test(token)) type = 'map';
        if (token.length <= 40) chips.push({label: token, type});
    }
    return {chips, spot};
}

/** Approximate wavelength families for navigation, not a colorimetric simulation. */
export function laserAppearance(label: string) {
    const wavelength = Number.parseFloat(label.replace(',', '.'));
    if (!Number.isFinite(wavelength)) return {className: 'bg-slate-50 text-slate-700 border-slate-300', band: 'Laser'};
    if (wavelength < 380) return {className: 'bg-violet-50 text-violet-800 border-violet-300', band: 'UV'};
    if (wavelength < 450) return {className: 'bg-violet-50 text-violet-800 border-violet-300', band: 'Violet'};
    if (wavelength < 500) return {className: 'bg-blue-50 text-blue-800 border-blue-300', band: 'Blue'};
    if (wavelength < 570) return {className: 'bg-green-50 text-green-800 border-green-300', band: 'Green'};
    if (wavelength < 620) return {className: 'bg-amber-50 text-amber-800 border-amber-300', band: 'Yellow / orange'};
    if (wavelength < 780) return {className: 'bg-red-50 text-red-800 border-red-300', band: 'Red'};
    return {className: 'bg-slate-100 text-slate-800 border-slate-400', band: wavelength < 1400 ? 'NIR' : 'IR'};
}
