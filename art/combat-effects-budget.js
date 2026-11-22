// A pool limits how many effects survive. This budget limits how many are
// created together, reserving some work for nearby impact cues.
const PROFILES={low:[42,12],medium:[64,18],high:[96,24],ultra:[144,32]};

export function createCombatEffectsBudget(){
    let regular=0,reserved=0;
    const stats={emitted:0,dropped:0,nearImpacts:0};
    function begin(tier){
        [regular,reserved]=PROFILES[tier]||PROFILES.high;
        stats.emitted=stats.dropped=stats.nearImpacts=0;
    }
    function claim(distanceSquared,impact=false,cost=1){
        const nearImpact=impact&&distanceSquared<=32*32;
        const weight=distanceSquared>55*55?cost*2:cost;
        if(nearImpact&&reserved>=weight)reserved-=weight;
        else if(regular>=weight)regular-=weight;
        else{stats.dropped++;return false;}
        if(nearImpact)stats.nearImpacts++;
        stats.emitted++;
        return true;
    }
    begin('high');
    return {stats,begin,claim};
}
