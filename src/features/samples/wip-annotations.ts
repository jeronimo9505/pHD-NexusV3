import {spatialRelation,type WipGeometry,type SpatialMap} from './wip-spatial';
export interface WipAnnotationSettings {map_ids:string[];scale_um:number;show_grid:boolean}
export function defaultWipAnnotation(image:WipGeometry,maps:SpatialMap[]):WipAnnotationSettings {
    const width=image.width||0,pixel=image.um_per_pixel_x||0;
    const lengths=image.valid&&pixel>0?[1,2,5,10,20,40,50,100,200,500,1000].filter(value=>value/pixel>=20&&value/pixel<=width*.5):[];
    return {map_ids:maps.filter(map=>['inside','overlap'].includes(spatialRelation(image,map.geometry))).slice(0,12).map(map=>map.id),
        scale_um:lengths.includes(40)?40:lengths.filter(value=>value/pixel<=width*.3).at(-1)||lengths[0]||0,show_grid:false};
}
