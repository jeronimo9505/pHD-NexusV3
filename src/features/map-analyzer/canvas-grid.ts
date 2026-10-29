const MAX_PIXELS = 16_777_216;
const positiveInteger = (value: unknown) => {
    const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
    return Number.isSafeInteger(number) && number > 0 ? number : 0;
};
const dimension = (value: unknown) => {const number = positiveInteger(value); return number <= 32767 ? number : 0;};

/** Display-only fallback. Never writes inferred geometry back to acquisition metadata. */
export function resolveCanvasGrid(rawWidth: unknown, rawHeight: unknown, rawCount: unknown, dataLength: number) {
    const count = Math.max(positiveInteger(rawCount), positiveInteger(dataLength));
    const invalid = (error: string) => ({width: 0, height: 0, count: 0, estimated: false, error});
    if (!dataLength || !count) return invalid('No mapped values available.');
    if (count > MAX_PIXELS || dataLength > MAX_PIXELS) return invalid('Map exceeds the canvas display limit.');
    let width = dimension(rawWidth), height = dimension(rawHeight);
    const estimated = !width || !height;
    if (!width && !height) width = Math.ceil(Math.sqrt(count));
    if (!width) width = Math.ceil(count / height);
    if (!height) height = Math.ceil(count / width);
    if (width * height > MAX_PIXELS) return invalid('Map exceeds the canvas display limit.');
    if (width * height < count) return invalid('Grid dimensions do not match the mapped values. Check acquisition dimensions.');
    return {width, height, count, estimated, error: ''};
}
