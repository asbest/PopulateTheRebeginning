const CELL_SIZE=32;
const CONTACT_LIFETIME=45;
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export const isMagicThreat=unit=>unit.type==='shaman'||unit.type==='firewarrior';

export function observeEnemy(observers,candidates,memory,now){
    const cells=new Map();
    for(const {position,radius} of observers){
        const minX=Math.floor((position.x-radius)/CELL_SIZE),maxX=Math.floor((position.x+radius)/CELL_SIZE);
        const minZ=Math.floor((position.z-radius)/CELL_SIZE),maxZ=Math.floor((position.z+radius)/CELL_SIZE);
        for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
            const key=`${x},${z}`;
            if(!cells.has(key))cells.set(key,[]);
            cells.get(key).push({position,radius});
        }
    }
    const seen=position=>cells.get(`${Math.floor(position.x/CELL_SIZE)},${Math.floor(position.z/CELL_SIZE)}`)
        ?.some(eye=>distance(position,eye.position)<=eye.radius);
    const visible=new Map();
    for(const entity of candidates){
        const position=entity.mesh.position;
        if(!seen(position))continue;
        visible.set(entity.id,entity);
        memory.set(entity.id,{id:entity.id,faction:entity.faction,type:entity.type,
            building:!!entity.visualMesh,position:{x:position.x,z:position.z},seenAt:now});
    }
    for(const [id,contact] of memory){
        if(now-contact.seenAt>CONTACT_LIFETIME||!visible.has(id)&&seen(contact.position))memory.delete(id);
    }
    return visible;
}

export function counterWeights(personality,contacts){
    const weights={warrior:['swarmer','hive'].includes(personality)?4:3,
        firewarrior:personality==='sorcerer'?4:2,preacher:2,spy:personality==='trickster'?2:1};
    const counts={warrior:0,firewarrior:0,preacher:0,spy:0,airship:0};
    for(const contact of contacts)if(!contact.building&&Object.hasOwn(counts,contact.type))counts[contact.type]++;
    const total=Object.values(counts).reduce((sum,count)=>sum+count,0);
    if(total>=2){
        weights.warrior+=4*counts.firewarrior/total;
        weights.firewarrior+=5*(counts.preacher+counts.airship)/total;
        weights.preacher+=3*counts.warrior/total;
        weights.spy+=2*counts.preacher/total;
    }
    return weights;
}

export function chooseBattleSpell(friends,foes,inRange,allied=[]){
    const nearby=friends.filter(unit=>inRange(unit.mesh.position));
    const enemies=foes.filter(unit=>inRange(unit.mesh.position));
    let heal,shield,blast,healScore=1.2,shieldScore=2,blastScore=2.15;
    for(const unit of nearby.slice(0,16)){
        const point=unit.mesh.position;
        const group=nearby.filter(friend=>distance(point,friend.mesh.position)<7.5);
        const injury=group.reduce((sum,friend)=>sum+1-friend.hp/friend.maxHp,0);
        if(injury>healScore){healScore=injury;heal=point;}
        if(!foes.some(enemy=>isMagicThreat(enemy)&&distance(point,enemy.mesh.position)<13))continue;
        const exposed=group.filter(friend=>!friend.shielded).length;
        if(exposed>shieldScore){shieldScore=exposed;shield=point;}
    }
    if(heal)return {type:'heal',point:heal};
    for(const unit of enemies.slice(0,16)){
        const point=unit.mesh.position;
        if(allied.some(friend=>distance(point,friend.mesh.position)<8))continue;
        const hit=enemies.reduce((sum,enemy)=>sum+Math.max(0,1-distance(point,enemy.mesh.position)/8),0);
        const risk=nearby.reduce((sum,friend)=>sum+Math.max(0,1-distance(point,friend.mesh.position)/8),0);
        const score=hit-risk*.7;
        if(score>blastScore){blastScore=score;blast=point;}
    }
    if(blast)return {type:'blast',point:blast};
    if(shield)return {type:'shield',point:shield};
    const target=enemies.find(unit=>unit.type==='preacher')||enemies[0];
    return target&&{type:target.type==='preacher'?'swarm':'lightning',point:target.mesh.position};
}

export function formationPoint(point,direction,index,ranged=false){
    const lane=index%5-2,row=Math.floor(index/5);
    const depth=(ranged?3:-1)+row*1.6;
    return {x:point.x-direction.x*depth-direction.z*lane*1.6,
        z:point.z-direction.z*depth+direction.x*lane*1.6};
}
