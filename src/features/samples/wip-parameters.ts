import type { WipObject } from './wip-types';

export function powerFromWipName(name:string): {value:string;unit:'µW'|'mW';source:string}|null {
    const matches=Array.from(name.matchAll(/(?:^|[-_\s])(\d+(?:[.,]\d+)?|\.\d+)\s*(uW|µW|μW|mW)(?=$|[-_\s])/gi));
    const values=matches.map(match=>({value:match[1].replace(',','.'),unit:match[2].toLowerCase()==='mw'?'mW' as const:'µW' as const,source:match[0].trim()}));
    if(!values.length||values.some(value=>!Number.isFinite(Number(value.value))))return null;
    const milliwatts=(value:typeof values[number])=>Number(value.value)*(value.unit==='µW'?.001:1);
    return values.every(value=>Math.abs(milliwatts(value)-milliwatts(values[0]))<1e-12)?values[0]:null;
}

export const WIP_PARAMETERS = [
    {key:'analyte',label:'Analyte',unit:'',units:['','M','mM','µM','nM','mol/L','mg/mL','10-6']},
    {key:'laser_wavelength_nm',label:'Laser',unit:'nm'},
    {key:'power',label:'Power',unit:'mW',units:['mW','µW','W','%']},
    {key:'objective_magnification',label:'Objective',unit:'x'},
    {key:'integration_time_s',label:'Acquisition Time',unit:'s'},
    {key:'accumulations',label:'Accumulations',unit:'ac'},
    {key:'spots',label:'Spots',unit:'ixj'},
    {key:'size',label:'Size',unit:'µm'},
] as const;

export function initialWipParameters(object: WipObject): Record<string,string> {
    const metadata=object.metadata;
    const result:Record<string,string>={};
    for(const field of WIP_PARAMETERS) {
        result[field.key]=['analyte','power'].includes(field.key)?'':metadata[field.key]==null?'':String(metadata[field.key]);
        result[`unit:${field.key}`]=field.unit;
    }
    if(object.kind==='raman'){
        const power=powerFromWipName(object.name||'');
        if(power){result.power=power.value;result['unit:power']=power.unit;result['source:power']='Measurement name: '+power.source;}
        if(!result.accumulations&&metadata.scan_method==='Area Scan'){
            result.accumulations='1';result['source:accumulations']='Editable default for Area Scan; not an explicit source accumulation count';
        }
    }
    if(object.kind==='raman'&&object.shape)result.spots=`${object.shape[0]}x${object.shape[1]}`;
    if(metadata.scan_span_x_um!=null&&metadata.scan_span_y_um!=null)
        result.size=`${metadata.scan_span_x_um}x${metadata.scan_span_y_um}`;
    return result;
}

export function characterizationParameters(reviewed: Record<string,string>): Record<string,string> {
    return Object.fromEntries(WIP_PARAMETERS.map(field=>{
        const value=(reviewed[field.key]||'').trim();
        const unit=(reviewed[`unit:${field.key}`]??field.unit).trim();
        return [field.label,value ? unit?`${value} ${unit}`:value : ''];
    }));
}
