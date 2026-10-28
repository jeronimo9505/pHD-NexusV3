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
    if(nx<=1||ny<=1)throw new Error('This spectrum has no two-dimensional acquisition area.');
    const polygon=[[0,0],[nx,0],[nx,ny],[0,ny]].map(([x,y])=>project(x,y));
    const points:number[][]=[];
    if(grid&&nx*ny<=5000)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)points.push(project(x,y));
    if(polygon.some(point=>point.some(value=>!Number.isFinite(value))))throw new Error('The map has invalid spatial coordinates.');
    return {polygon,points,gridAvailable:nx*ny<=5000};
}
