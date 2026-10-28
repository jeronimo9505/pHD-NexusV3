"""One human-readable naming convention for manual and WITec measurements."""
import json
import re
from pathlib import Path

RAMAN_FIELDS=[('Analyte','analyte',''),('Laser','laser_wavelength_nm','nm'),('Power','power','mW'),
    ('Objective','objective_magnification','x'),('Acquisition Time','integration_time_s','s'),
    ('Accumulations','accumulations','ac'),('Spots','spots','ixj'),('Size','size','um')]

def safe_name(value,limit=120):
    value=str(value).replace('µ','u').replace('μ','u').replace('×','x')
    value=re.sub(r'[<>:"/\\|?*\x00-\x1f]','-',value)
    value=re.sub(r'\s+',' ',value).strip(' .-')[:limit].rstrip(' .')
    if not value or re.fullmatch(r'(?i)(con|prn|aux|nul|com[1-9]|lpt[1-9])',value):value='Measurement-'+value
    return value

def parameters(metadata):
    raw=metadata.get('parameters',{})
    if isinstance(raw,str):
        try:raw=json.loads(raw)
        except ValueError:
            import ast
            try:raw=ast.literal_eval(raw)
            except (ValueError,SyntaxError):raw={}
    if not isinstance(raw,dict):raw={}
    if not raw:
        raw={key:metadata[key] for _,key,_ in RAMAN_FIELDS if metadata.get(key) not in (None,'')}
        if metadata.get('laser_power_uw') is not None and 'power' not in raw:raw.update(power=metadata['laser_power_uw'],**{'unit:power':'uW'})
    if any(key in raw for _,key,_ in RAMAN_FIELDS):
        return {label:(str(raw[key]).strip()+' '+str(raw.get('unit:'+key,unit))).strip()
            for label,key,unit in RAMAN_FIELDS if raw.get(key) not in (None,'')}
    return {str(key):str(value) for key,value in raw.items() if not str(key).startswith(('unit:','source:','__')) and isinstance(value,(str,int,float)) and value not in ('',None)}

def measurement_stem(metadata):
    sample=metadata.get('sample_code') or metadata.get('sample_name') or 'Measurement'
    parts=[safe_name(sample,24),safe_name(str(metadata.get('technique','Raman')).upper(),16)]
    values=parameters(metadata)
    order=[label for label,_,_ in RAMAN_FIELDS]+[key for key in values if key not in {label for label,_,_ in RAMAN_FIELDS}]
    for key in order:
        value=values.get(key,'').strip()
        if not value:continue
        if key=='Laser':
            match=re.match(r'^(\d+(?:\.\d+)?)\s*(.*)$',value)
            if match:value=f'{round(float(match[1]),1):g}'+match[2]
        token=safe_name(value.replace(' ',''),28)
        if token:parts.append(token)
    return '_'.join(parts)[:155].rstrip(' ._')

def measurement_filename(metadata,directory,spot=None,extension='.h5',exclude=None):
    directory=Path(directory);stem=measurement_stem(metadata)
    if spot is None:
        sample=safe_name(metadata.get('sample_code') or metadata.get('sample_name') or 'Measurement',24)
        numbers=[int(match.group(1)) for path in directory.glob('*.h5') if path.name.startswith(sample+'_')
            and (match:=re.search(r'_Spot(\d+)(?:_\d+)?\.h5$',path.name,re.I))]
        spot=max(numbers,default=0)+1
    budget=min(155,220-len(str(directory.resolve())))
    if budget<40:raise ValueError('The vault path is too long. Choose a shorter root folder to keep measurement names portable.')
    stem=stem[:budget].rstrip(' ._')
    base=f'{stem}_Spot{spot}';candidate=base+extension;counter=2
    while (directory/candidate).exists() and (exclude is None or (directory/candidate).resolve()!=Path(exclude).resolve()):
        candidate=f'{base}_{counter}{extension}';counter+=1
    return candidate
