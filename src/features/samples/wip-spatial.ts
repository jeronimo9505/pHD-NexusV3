export interface WipGeometry {
    valid:boolean;reason?:string;project_hash:string;system_id?:string;object_id:string;
    matrix_um?:number[][];width?:number;height?:number;um_per_pixel_x?:number;convention?:string;
}
export interface SpatialMap {id:string;name:string;geometry:WipGeometry}

export function spatialOverlay(image:WipGeometry,map:WipGeometry,grid=false) {
    if(!image.valid||!map.valid||!image.matrix_um||!map.matrix_um)throw new Error(map.reason||image.reason||'Calibrated spatial transforms are required.');
    if(image.project_hash!==map.project_hash||!image.system_id||image.system_id!==map.system_id)throw new Error('A shared source coordinate frame could not be confirmed.');
    const a=image.matrix_um,b=map.matrix_um;
    const determinant=a[0][0]*a[1][1]-a[0][1]*a[1][0];
    if(!Number.isFinite(determinant)||Math.abs(determinant)<1e-15)throw new Error('The image transformation is singular.');
    const project=(x:number,y:number)=>{
        const wx=b[0][0]*x+b[0][1]*y+b[0][2]-a[0][2];
        const wy=b[1][0]*x+b[1][1]*y+b[1][2]-a[1][2];
        return [(a[1][1]*wx-a[0][1]*wy)/determinant,(-a[1][0]*wx+a[0][0]*wy)/determinant];
    };
    const nx=map.width||0,ny=map.height||0;
    if(!Number.isInteger(nx)||!Number.isInteger(ny)||nx<1||ny<1)throw new Error('Invalid acquisition dimensions.');
    const kind=nx===1&&ny===1?'point':nx===1||ny===1?'line':'area';
    const vertices=kind==='point'?[[0,0]]:kind==='line'?[[0,0],[nx===1?0:nx-1,ny===1?0:ny-1]]:[[0,0],[nx,0],[nx,ny],[0,ny]];
    const polygon=vertices.map(([x,y])=>project(x,y));
    const points:number[][]=[];
    if(grid&&nx*ny<=5000)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)points.push(project(x,y));
    if(polygon.some(point=>point.some(value=>!Number.isFinite(value))))throw new Error('The map has invalid spatial coordinates.');
    return {kind,polygon,points,gridAvailable:nx*ny<=5000};
}

/** Clip the calibrated footprint to the image; handles rotated and enclosing maps. */
export function spatialRelation(image:WipGeometry,map:WipGeometry):'inside'|'overlap'|'outside'|'unavailable' {
    try {
        const {polygon,kind}=spatialOverlay(image,map);
        const width=image.width||0,height=image.height||0;
        if(width<=0||height<=0)return 'unavailable';
        const inside=([x,y]:number[])=>x>=0&&x<=width&&y>=0&&y<=height;
        if(polygon.every(inside))return 'inside';
        if(kind==='point')return 'outside';
        let clipped=polygon;
        for(const [axis,bound,greater] of [[0,0,true],[0,width,false],[1,0,true],[1,height,false]] as const){
            const output:number[][]=[];
            for(let i=0;i<clipped.length;i++){
                const a=clipped[i],b=clipped[(i+1)%clipped.length];
                const aIn=greater?a[axis]>=bound:a[axis]<=bound,bIn=greater?b[axis]>=bound:b[axis]<=bound;
                if(aIn)output.push(a);
                if(aIn!==bIn){const t=(bound-a[axis])/(b[axis]-a[axis]);output.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
            }
            clipped=output;
        }
        return clipped.length?'overlap':'outside';
    }catch{return 'unavailable';}
}
