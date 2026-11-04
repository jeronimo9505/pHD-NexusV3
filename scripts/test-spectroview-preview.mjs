import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context = { exports: {}, structuredClone };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/map-analyzer/spectroview/preview-state.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { previewKey, applyPreviewParameters } = context.exports;
const spec = { model: { peak_models: { 0: { Lorentzian: {
    x0: { value: 10, min: 5, max: 15 },
    ampli: { value: 2, vary: false },
    fwhm: { value: 3, expr: 'P1_ampli + 1' },
} } } } };
const next = applyPreviewParameters(spec, { P1_x0: 12, P1_ampli: 100, P1_fwhm: 101 });
assert.equal(next.model.peak_models[0].Lorentzian.x0.value, 12);
assert.deepEqual(next.model.peak_models[0].Lorentzian.ampli, spec.model.peak_models[0].Lorentzian.ampli);
assert.deepEqual(next.model.peak_models[0].Lorentzian.fwhm, spec.model.peak_models[0].Lorentzian.fwhm);
assert.equal(spec.model.peak_models[0].Lorentzian.x0.value, 10);
assert.equal(applyPreviewParameters(spec, { P1_x0: 20 }).model.peak_models[0].Lorentzian.x0.value, 10);
assert.notEqual(previewKey('a', 0, spec), previewKey('a', 0, next));
assert.notEqual(previewKey('a', 0, spec), previewKey('a', 1, spec));
assert.notEqual(previewKey('a', 0, spec), previewKey('b', 0, spec));
console.log('PASS preview invalidation and explicit seed adoption preserving constraints');
