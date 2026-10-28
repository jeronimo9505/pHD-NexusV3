/** Spectral range is never a pixel grid. Accept only two finite spectral bounds. */
export function spectralRange(value: unknown): [number, number] | null {
    return Array.isArray(value) && value.length === 2 && typeof value[0] === 'number' && Number.isFinite(value[0]) && typeof value[1] === 'number' && Number.isFinite(value[1])
        ? [value[0], value[1]] : null;
}

export function formatSpectralRange(value: unknown): string | null {
    const bounds=spectralRange(value);
    return bounds?`${bounds[0].toFixed(0)}-${bounds[1].toFixed(0)} cm⁻¹`:null;
}

export function wipFileMetadata(extracted: {shape:number[];provenance:Record<string,any>;representative:{x:number;y:number}[]|null}) {
    const axis=extracted.provenance.axis;
    const values=extracted.representative?.map(point=>point.x).filter(Number.isFinite)||[];
    const range=spectralRange(axis?[axis.start,axis.end]:null) || (values.length?spectralRange(values.reduce(([low,high],value)=>[Math.min(low,value),Math.max(high,value)],[Infinity,-Infinity])):null);
    return {spectra:extracted.shape[0]*extracted.shape[1],points:extracted.shape[2],
        grid:{x:extracted.shape[0],y:extracted.shape[1]},...(range?{range:range.sort((a,b)=>a-b)}:{})};
}
