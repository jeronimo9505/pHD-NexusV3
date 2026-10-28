"""Explicit-unit spatial transforms. No caption/ordering heuristics."""
import base64
import io
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

FACTORS = {'um':1., 'µm':1., 'μm':1., 'nm':.001, 'mm':1000., 'm':1_000_000.}

def geometry(entry, project_hash):
    result={'valid':False,'project_hash':project_hash,'object_id':str(entry.id)}
    try:
        payload=entry.payload
        identifier=payload.find('SpaceTransformationID') if payload else None
        if identifier is None: raise ValueError('No spatial transformation is linked to this object.')
        transform=entry.project.find_by_id(identifier.scalar())
        if transform is None or transform.class_name!='TDSpaceTransformation': raise ValueError('Unsupported spatial transformation type.')
        common=transform.tag.find('TDTransformation')
        if common is None or common.find('IsCalibrated') is None or not common['IsCalibrated'].scalar():
            raise ValueError('The source does not mark this spatial transformation as calibrated.')
        unit=common['StandardUnit'].scalar()
        if unit not in FACTORS: raise ValueError('Spatial units are missing or unsupported.')
        viewport=transform.payload['ViewPort3D']
        origin=np.asarray(viewport['WorldOrigin'].data,dtype=float).reshape(3)
        model=np.asarray(viewport['ModelOrigin'].data,dtype=float).reshape(3)
        scale=np.asarray(viewport['Scale'].data,dtype=float).reshape(3,3,order='F')
        rotation=np.asarray(viewport['Rotation'].data,dtype=float).reshape(3,3,order='F')
        linear=rotation@scale*FACTORS[unit]
        offset=(origin-rotation@scale@model)*FACTORS[unit]
        if not np.isfinite(linear).all() or not np.isfinite(offset).all(): raise ValueError('Non-finite spatial transformation.')
        if np.linalg.norm(linear[2,:2])>max(np.linalg.norm(linear[:2,:2]),1e-12)*1e-7:
            raise ValueError('Tilted 3D planes are not supported by the 2D overlay.')
        affine=np.eye(3);affine[:2,:2]=linear[:2,:2];affine[:2,2]=offset[:2]
        nx,ny=int(payload['SizeX'].scalar()),int(payload['SizeY'].scalar())
        point=entry.class_name=='TDGraph' and nx==ny==1
        if not point and abs(np.linalg.det(affine))<1e-15: raise ValueError('The spatial transformation is singular.')
        meta=entry.measurement_metadata
        for actual,key in [(nx*np.linalg.norm(linear[:2,0]),'scan_span_x_um'),(ny*np.linalg.norm(linear[:2,1]),'scan_span_y_um')]:
            expected=meta.get(key)
            if not point and expected is not None and expected>0 and not math.isclose(actual,float(expected),rel_tol=.02,abs_tol=.001):
                raise ValueError('Stored spatial units/viewport disagree with acquisition dimensions; exact overlay is disabled.')
        result.update(valid=True,matrix_um=affine.tolist(),width=nx,height=ny,
            um_per_pixel_x=float(np.linalg.norm(linear[:2,0])),um_per_pixel_y=float(np.linalg.norm(linear[:2,1])),
            system_id=meta.get('system_id'),transformation_id=str(transform.id),source_unit=unit,
            original={'ModelOrigin':model.tolist(),'WorldOrigin':origin.tolist(),'Scale':scale.tolist(),'Rotation':rotation.tolist()},
            convention='Stored viewport edges [0, SizeX] × [0, SizeY]; sample grid uses stored zero-based indices.')
    except (KeyError,TypeError,ValueError,AttributeError) as error: result['reason']=str(error)
    return result

def overlay(image, measurement, grid=False):
    if not image.get('valid') or not measurement.get('valid'): raise ValueError('A calibrated spatial transformation is required for both objects.')
    if image.get('project_hash')!=measurement.get('project_hash'): raise ValueError('These objects come from different WIP coordinate frames.')
    if not image.get('system_id') or image.get('system_id')!=measurement.get('system_id'):
        raise ValueError('A shared instrument coordinate frame could not be confirmed.')
    a=np.asarray(image['matrix_um'],dtype=float);b=np.asarray(measurement['matrix_um'],dtype=float)
    if a.shape!=(3,3) or b.shape!=(3,3) or not np.isfinite(a).all() or not np.isfinite(b).all():raise ValueError('Invalid affine matrix.')
    mapping=np.linalg.inv(a)@b
    nx,ny=int(measurement['width']),int(measurement['height'])
    if nx<1 or ny<1:raise ValueError('Invalid acquisition dimensions.')
    kind='point' if nx==ny==1 else 'line' if nx==1 or ny==1 else 'area'
    vertices=[[0,0,1]] if kind=='point' else [[0,0,1],[0 if nx==1 else nx-1,0 if ny==1 else ny-1,1]] if kind=='line' else [[0,0,1],[nx,0,1],[nx,ny,1],[0,ny,1]]
    corners=np.array(vertices,dtype=float)@mapping.T
    points=[]
    if grid and nx*ny<=5000:
        xx,yy=np.meshgrid(np.arange(nx),np.arange(ny))
        source=np.c_[xx.ravel(),yy.ravel(),np.ones(nx*ny)]
        points=(source@mapping.T)[:,:2].tolist()
    return {'kind':kind,'polygon':corners[:,:2].tolist(),'points':points,'grid_available':nx*ny<=5000,
        'convention':measurement.get('convention'),'mapping':mapping.tolist()}

def annotate(rgb_image, image_geometry, maps, scale_um, show_grid=False):
    image=rgb_image.copy().convert('RGB')
    draw=ImageDraw.Draw(image);width,height=image.size
    line=max(4,round(width/220));radius=max(2,round(width/900))
    color='#ef4444'
    for measurement in maps:
        shape=overlay(image_geometry,measurement,show_grid)
        vertices=[tuple(p) for p in shape['polygon']]
        if shape['kind']=='point':
            x,y=vertices[0];r=max(6,round(width/180));draw.ellipse((x-r,y-r,x+r,y+r),fill=color,outline='white',width=max(1,line//3))
        else:draw.line(vertices+([vertices[0]] if shape['kind']=='area' else []),fill=color,width=line)
        for x,y in shape['points']:draw.ellipse((x-radius,y-radius,x+radius,y+radius),fill=color)
    if scale_um:
        if not image_geometry.get('valid'):raise ValueError('A calibrated image is required for a scale bar.')
        length=float(scale_um)/image_geometry['um_per_pixel_x']
        if not 10<=length<=width*.6:raise ValueError('Choose a scale length appropriate for this image.')
        font_size=max(14,round(width/70))
        try:
            font=ImageFont.truetype('arial.ttf',font_size)
            label=f'{scale_um:g} µm'
        except OSError:
            font=ImageFont.load_default(size=font_size)
            label=f'{scale_um:g} um'
        x,y=width*.05,height*.92
        bbox=draw.textbbox((x,y),label,font=font)
        draw.rectangle((x-12,y-14,max(x+length,bbox[2])+12,y+font.size+8),fill='black')
        draw.line((x,y-4,x+length,y-4),fill='white',width=max(3,line*2))
        draw.text((x,y+2),label,fill='white',font=font)
    out=io.BytesIO();image.save(out,format='PNG')
    return base64.b64encode(out.getvalue()).decode()
