// Shared profile for the barracks roof plates and their authored surface detail.
export const BARRACKS_ROOF={y:2.15,z:.63,angle:.64,width:3.65,depth:1.94,thickness:.16};

export function fitBarracksTiles(data){
    const position=data.position.slice(),normal=data.normal.slice();
    const roof=BARRACKS_ROOF,c=Math.cos(roof.angle),s=Math.sin(roof.angle);
    for(let i=0;i<position.length;i+=3){
        // The export contains seven horizontal rows on either side of the ridge.
        const side=Math.sign(data.position[i+2]);
        const row=Math.max(0,Math.min(6,Math.round((2.6-data.position[i+1])/.125)));
        const authoredZ=side*(.73+row*.115);
        const centerZ=side*(.12+row*.19);
        const localY=data.position[i+1]-(2.6-row*.125);
        const localZ=data.position[i+2]-authoredZ;
        const surfaceY=roof.y-Math.tan(roof.angle)*(Math.abs(centerZ)-roof.z)+roof.thickness/(2*c);
        // Embed the underside 3 mm into the plate, avoiding gaps and z-fighting.
        const normalOffset=.03-.003;
        position[i+1]=surfaceY+c*(localY+normalOffset)-side*s*localZ;
        position[i+2]=centerZ+side*s*(localY+normalOffset)+c*localZ;
        normal[i+1]=c*data.normal[i+1]-side*s*data.normal[i+2];
        normal[i+2]=side*s*data.normal[i+1]+c*data.normal[i+2];
    }
    return {...data,position,normal};
}
