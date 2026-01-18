export const CHUNK_SIZE = 40;
export const CHUNK_RES = 40;
export const RENDER_DISTANCE = 3;
export const NOISE_SCALE = 0.02;
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 70;

export const WATER_LEVEL = 1.805;
export const VISUAL_WATER_LEVEL = 0.45125;

export const COLORS = {
    water: 0x1E90FF, sand: 0xEEDC82, grass: 0x228B22, rock: 0x696969, snow: 0xFFFFFF,
    lava: 0xCF1020, skin: 0xD2B48C, shirt_wild: 0x8B4513, shirt_shaman: 0xFF4500,
    wood: 0x8B4513, straw: 0xDAA520, stone: 0x808080, red: 0x8B0000, yellow: 0xFFD700, blue: 0x4169E1
};

export const BUILDING_COSTS = { hut: 15, tower: 20, warrior: 30, fire: 40, spy: 40, shipyard: 50 };

export const ACTIONS = {
    'move': { icon: '👣', label: 'Walk', cost: 0 },
    'blast': { icon: '🔥', label: 'Blast', cost: 10 },
    'lightning': { icon: '⚡', label: 'Lght', cost: 50 },
    'raise': { icon: '▲', label: 'Rais', cost: 5 },
    'lower': { icon: '▼', label: 'Lowr', cost: 5 },
    'flatten': { icon: '➖', label: 'Flat', cost: 10 },
    'landbridge': { icon: '🌉', label: 'Bridg', cost: 20 },
    'swamp': { icon: '🌫️', label: 'Swmp', cost: 15 },
    'invisibility': { icon: '👻', label: 'Invis', cost: 20 },
    'shield': { icon: '🛡️', label: 'Shld', cost: 20 },
    'hypnotise': { icon: '🌀', label: 'Conv', cost: 50 },
    'swarm': { icon: '🐝', label: 'Swrm', cost: 20 },
    'tornado': { icon: '🌪️', label: 'Torn', cost: 60 },
    'firestorm': { icon: '☄️', label: 'Fire', cost: 80 },
    'volcano': { icon: '🌋', label: 'Volc', cost: 90 },
    'heal': { icon: '💖', label: 'Heal', cost: 10 },
    'teleport': { icon: '🌌', label: 'Tele', cost: 90 },
    'create': { icon: '👶', label: 'Spwn', cost: 100 },
    'build_hut': { icon: '🏠', label: 'Hut', cost: 15 },
    'build_tower': { icon: '🗼', label: 'Towr', cost: 20 },
    'build_warrior': { icon: '⚔️', label: 'War', cost: 30 },
    'build_fire': { icon: '🔥', label: 'Fire', cost: 40 },
    'build_spy': { icon: '🌙', label: 'Spy', cost: 40 },
    'build_shipyard': { icon: '⚓', label: 'Dock', cost: 50 },
    'build_airship': { icon: '🎈', label: 'Ship', cost: 25 }
};

export const UNIT_ICONS = {
    'wild': '👷',
    'warrior': '⚔️',
    'firewarrior': '🏹',
    'shaman': '🧙',
    'spy': '🕵️',
    'airship': '🎈'
};
