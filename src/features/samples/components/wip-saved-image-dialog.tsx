'use client';
import {useEffect,useState} from 'react';
import {X} from 'lucide-react';
import {SCIENCE_ENGINE_URL} from '@/lib/desktop';
import {getWipSpatialMapsAction} from '../wip-actions';
import type{WipGeometry,SpatialMap}from'../wip-spatial';
import {WipSpatialViewer}from'./wip-spatial-viewer';
import type {WipAnnotationSettings} from '../wip-annotations';

export function WipSavedImageDialog({image,groupId,onClose}:{image:{name:string;path:string;spatial_geometry:WipGeometry;annotation?:WipAnnotationSettings&{maps?:SpatialMap[]}};groupId:string;onClose:()=>void}){
    const[maps,setMaps]=useState<SpatialMap[]>([]),[error,setError]=useState('');
    const[vault]=useState(()=>localStorage.getItem('phdnexus_vault_root')||'');
    useEffect(()=>{let current=true;getWipSpatialMapsAction(groupId,image.spatial_geometry.project_hash).then(result=>{if(!current)return;if(result.error)setError(result.error);else setMaps(result.data||[]);});return()=>{current=false;};},[groupId,image.spatial_geometry.project_hash]);
    const available=Array.from(new Map([...(image.annotation?.maps||[]),...maps].map(item=>[item.geometry.object_id,item])).values());
    const url=`${SCIENCE_ENGINE_URL}/api/vault-file?${new URLSearchParams({path:image.path,vault_root:vault})}`;
    return<div className="fixed inset-0 z-[240] bg-slate-950/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Calibrated WITec image"><div className="bg-white w-full max-w-5xl max-h-[94vh] rounded-xl overflow-auto p-5 space-y-3"><header className="flex justify-between"><div><h2 className="font-bold">Calibrated Microscopy Image</h2><p className="text-sm text-slate-500">{image.name}</p></div><button type="button" aria-label="Close image" onClick={onClose}><X/></button></header>{error&&<p className="text-red-600 text-sm">{error}</p>}<WipSpatialViewer imageSource={url} name={image.name} geometry={image.spatial_geometry} maps={available} initialAnnotation={image.annotation}/></div></div>;
}
