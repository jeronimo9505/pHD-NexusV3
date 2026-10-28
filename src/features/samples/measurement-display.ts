/** Display only: keep the stored acquisition precision unchanged. */
export function measurementDisplay(key:string,value:unknown):string {
    const raw=String(value??'');
    if(!/^(laser|laser wavelength|laser_wavelength_nm|excitation wavelength)$/i.test(key.trim()))return raw;
    const match=raw.trim().match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?)(\s*(?:nm)?)$/i);
    if(!match||!Number.isFinite(Number(match[1])))return raw;
    return String(Math.round(Number(match[1])*10)/10)+match[2];
}
