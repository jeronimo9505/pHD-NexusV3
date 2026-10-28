import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
function load(path) {
    const context={exports:{},require:name=>name==='@/lib/utils'?{cn:(...args)=>args.filter(value=>typeof value==='string').join(' ')}:name==='../workspace-display'?load('src/features/map-analyzer/workspace-display.ts'):require(name)};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
    return context.exports;
}
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {VaultLibrary}=load('src/features/map-analyzer/components/vault-library.tsx');
const child={id:'child',sample_code:'A23-c3',name:'Graphene child',parent_id:'parent'};
const props={vaultRoot:'Vault',groupId:'g',selectedH5:'book/one.h5',dbSamples:[{id:'parent',sample_code:'A23',name:'Au'},child],
    sessionFiles:[{id:'1',h5_relative_path:'book/one.h5',name:'A23-c3_RAMAN_999nm_Spot1.h5',sample_id:'child',sample_name:'Au',parameters:{Laser:'632.8 nm'},n_spectra:2500,created_at:''},
        {id:'2',h5_relative_path:'other/one.h5',name:'A23-c3_RAMAN_999nm_Spot1.h5',sample_id:'child',sample_name:'Au',parameters:{Laser:'532 nm'},n_spectra:2500,created_at:''}],
    savedWorkspaces:[{id:'s',name:'HIDDEN SESSION CONTENT'}],onSelect:()=>{},onOpenExplorer:()=>{},onRemove:()=>{}};
const html=renderToStaticMarkup(React.createElement(VaultLibrary,props));
for(const text of ['A23-c3','Graphene child','Parent A23','632.8nm','532nm'])if(!html.includes(text))throw new Error(`Missing rendered workspace detail: ${text}`);
if(html.includes('HIDDEN SESSION CONTENT'))throw new Error('Sessions must start collapsed');
console.log('PASS rendered workspace: child ID/nomenclature, parent hint, same-name acquisitions retained, metadata chips, sessions collapsed');
