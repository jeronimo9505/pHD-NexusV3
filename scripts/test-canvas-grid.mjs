import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),context={exports:{}};
const compile=text=>ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
vm.runInNewContext(compile(fs.readFileSync('src/features/map-analyzer/canvas-grid.ts','utf8')),context);
const {resolveCanvasGrid}=context.exports;
assert.equal(resolveCanvasGrid(50,50,2500,2500).estimated,false);
assert.equal(resolveCanvasGrid(0,0,0,2500).width,50);
assert.equal(resolveCanvasGrid(0,0,0,1).height,1);
assert.equal(resolveCanvasGrid(2,0,6,6).height,3);
assert.equal(resolveCanvasGrid('50','50',2500,2500).width,50);
assert.equal(resolveCanvasGrid(0,0,40000,40000).count,40000);
assert.ok(resolveCanvasGrid(1,1,4,4).error);
assert.ok(resolveCanvasGrid(1,1,0,0).error);
assert.ok(resolveCanvasGrid(100000,100000,1e10,1).error);
assert.equal(resolveCanvasGrid(NaN,Infinity,NaN,4).width,2);
// Run the actual drawing effects with a canvas that rejects invalid allocations.
for(const [file,name] of [['rgi2-view.tsx','Rgi2GrapheneCanvas'],['rgi-view.tsx','RgiGrapheneCanvas'],['graphene-canvas-grid.tsx','RenderCanvas']]) {
    const path=`src/features/map-analyzer/components/${file}`;
    const source=ts.createSourceFile(path,fs.readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    const node=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
    for(const scenario of [{w:0,h:0,nSpectra:0,dataArr:Array(2500).fill(1),draw:true},{w:3,h:2,nSpectra:6,dataArr:[1,2,null,NaN,Infinity,3],draw:true},{w:0,h:0,nSpectra:0,dataArr:[],draw:false},{w:1,h:1,nSpectra:4,dataArr:[1,2,3,4],draw:false}]) {
        let calls=0;const effects=[];
        const ctx={createImageData(w,h){assert.ok(Number.isSafeInteger(w)&&w>0&&Number.isSafeInteger(h)&&h>0);calls++;return {data:new Uint8ClampedArray(w*h*4)};},putImageData(){},strokeRect(){}};
        const runtime={exports:{},require,resolveCanvasGrid,useRef:()=>({current:{getContext:()=>ctx}}),useEffect:effect=>effects.push(effect),valToRgb:()=>[1,2,3],getCssGradient:()=>'',cn:()=>''};
        vm.runInNewContext(compile(`${node.getText(source)}\nexports.component=${name};`),runtime);
        runtime.exports.component({...scenario,title:'Regression map',cmap:'Reds',vmin:0,vmax:null,selectedPixelIndex:-1});
        for(const effect of effects)effect();
        assert.equal(calls,scenario.draw?1:0,`${name}: incorrect allocation behavior`);
    }
}
console.log('PASS all three graphene canvases: zero/missing dimensions, real rectangular grids, empty/mismatched data, finite colors and bounded allocations');
