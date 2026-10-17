// Mission rules are deliberately separate from the story text and renderer.
// Every chapter has a playable condition; skirmishes keep their existing rules.
export const CAMPAIGN_MISSIONS = Object.freeze({
    1: { kind: 'settlement', huts: 2 },
    2: { kind: 'defense', seconds: 120, buildings: 1 },
    3: { kind: 'breach', radius: 16 },
    4: { kind: 'assassination' },
    5: { kind: 'capture', required: 2, seconds: 12 },
    6: { kind: 'breach', radius: 18 },
    7: { kind: 'stronghold', required: 1, seconds: 15 },
    8: { kind: 'capture', required: 3, seconds: 12 },
    9: { kind: 'defense', seconds: 150, buildings: 2 },
    10: { kind: 'escort', followers: 2, radius: 9 },
    11: { kind: 'capture', required: 3, seconds: 15 },
    12: { kind: 'assassination' }
});
