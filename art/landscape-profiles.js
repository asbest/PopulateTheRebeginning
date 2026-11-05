// Shared, versioned world-generation parameters. Saved games store the profile
// name and seed; missing names deliberately retain the original terrain maths.
export const LANDSCAPES = Object.freeze({
    meadows: {label:'Hügelland', scale:.8, stretch:1, height:.72, uplift:1, mountains:.35, islands:.4, terraces:.25, valleys:.5, bridges:.65},
    delta: {label:'Flussdelta', scale:.66, stretch:1.8, height:.62, uplift:1, mountains:.15, islands:.7, terraces:.1, valleys:1.1, bridges:.6, channel:3.5},
    alpine: {label:'Alpine Täler', scale:.7, stretch:1.55, height:1.2, uplift:.5, mountains:1.8, islands:.25, terraces:.2, valleys:1.5, bridges:.7},
    mesas: {label:'Tafelberge', scale:.55, stretch:1, height:.75, uplift:1.5, mountains:.35, islands:.3, terraces:1.3, valleys:.5, bridges:.3},
    islands: {label:'Tropischer Archipel', scale:.8, stretch:1.1, height:.72, uplift:-2.5, mountains:.45, islands:1.8, terraces:.1, valleys:.4, bridges:.45},
    marsh: {label:'Nebelmoore', scale:.6, stretch:1.4, height:.4, uplift:.2, mountains:.1, islands:.8, terraces:.1, valleys:.8, bridges:.3, channel:2},
    volcanic: {label:'Vulkanisches Hochland', scale:.65, stretch:1.1, height:1, uplift:.5, mountains:1.3, islands:.65, terraces:.3, valleys:1.3, bridges:.55, channel:5},
    jungle: {label:'Dschungelschluchten', scale:.55, stretch:1.7, height:.85, uplift:1.7, mountains:.7, islands:.25, terraces:.65, valleys:1.7, bridges:.5, channel:4},
    coast: {label:'Zerklüftete Küste', scale:.7, stretch:2.1, height:1, uplift:-.7, mountains:1.1, islands:1.3, terraces:.15, valleys:.8, bridges:.4},
    rift: {label:'Lavaspalten', scale:.6, stretch:2, height:.85, uplift:1.6, mountains:.6, islands:.2, terraces:.55, valleys:1.5, bridges:.4, channel:8},
    highlands: {label:'Himmelsplateaus', scale:.48, stretch:1.1, height:1, uplift:2, mountains:.7, islands:.6, terraces:1.15, valleys:.5, bridges:.5},
    caldera: {label:'Zerrissene Feuerinseln', scale:.62, stretch:1.25, height:1.05, uplift:-1, mountains:1.4, islands:1.3, terraces:.2, valleys:1.2, bridges:.45, channel:4}
});
export const CAMPAIGN_LANDSCAPES = Object.freeze(Object.keys(LANDSCAPES));
export const LAVA_LEVELS = Object.freeze([7,10,12]);
