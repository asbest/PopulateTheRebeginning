// Original vector symbols; designed for the game's tribal, elemental visual language.
const paths = {
 blast:'<path d="M16 3c2 7 8 8 7 15-1 6-13 7-14 0-1-5 4-8 4-12 1 5 3 6 3 6s3-3 0-9Z"/><path d="M16 17c-4 4-3 8 1 8 4-1 3-5-1-8Z"/>',
 lightning:'<path d="m19 3-11 15h8l-3 11 12-17h-8Z"/>',
 raise:'<path d="m3 25 8-12 6 8 5-6 7 10M16 15V3m-5 5 5-5 5 5"/>',
 lower:'<path d="m3 25 8-12 6 8 5-6 7 10M16 3v12m-5-5 5 5 5-5"/>',
 flatten:'<path d="M3 21h26M8 7l5 6m-5 0 5-6m6 0 5 6m-5 0 5-6"/>',
 landbridge:'<path d="M3 24h6v-5c0-9 14-9 14 0v5h6M4 12c8-11 16-11 24 0M5 11v13m22-13v13"/>',
 swamp:'<path d="M3 24q4-4 8 0t8 0 10 0M7 18c-6-4 0-10 0-10s6 6 0 10Zm17-2c-6-4 0-10 0-10s6 6 0 10Z"/>',
 invisibility:'<path d="M3 16s5-9 13-9 13 9 13 9-5 9-13 9S3 16 3 16ZM4 4l24 24"/><circle cx="16" cy="16" r="4"/>',
 shield:'<path d="m16 3 11 4v9c-1 6-6 10-11 13-5-3-10-7-11-13V7ZM11 16l4 4 7-9"/>',
 hypnotise:'<path d="M17 17c-4 3-8-1-5-5 4-6 13-2 12 5-1 9-14 12-19 3C-1 8 12-1 23 5"/>',
 swarm:'<ellipse cx="16" cy="19" rx="5" ry="8"/><path d="M11 18c-15-11-5-18 5-5 10-13 20-6 5 5M12 19h8m-8 4h8M13 8l-3-4m9 4 3-4"/>',
 tornado:'<path d="M4 6q12-7 24 0M6 11q10-6 20 0M9 16q7-4 14 0M12 21q4-3 8 0M15 26l3-2"/>',
 firestorm:'<path d="M27 3 11 17M21 3 8 15M29 9 15 21"/><circle cx="9" cy="23" r="5"/>',
 volcano:'<path d="m3 28 8-16h10l8 16ZM9 20l7-4 7 4M16 9V3M10 8 7 4m15 4 3-4"/>',
 heal:'<path d="M12 4h8v8h8v8h-8v8h-8v-8H4v-8h8Z"/>',
 teleport:'<ellipse cx="16" cy="16" rx="10" ry="13"/><ellipse cx="16" cy="16" rx="5" ry="9"/><path d="M2 16h11m-4-4 4 4-4 4"/>',
 create:'<circle cx="12" cy="9" r="5"/><path d="M3 28v-6c0-9 18-9 18 0v6M25 12v10m-5-5h10"/>',
 phantom:'<circle cx="11" cy="9" r="4"/><circle cx="23" cy="11" r="3"/><path d="M3 28V21c0-8 16-8 16 0v7m2-10c8-4 9 4 8 10"/>',
 build_hut:'<path d="m3 15 13-12 13 12ZM6 15v13h20V15M13 28v-9h6v9M16 3v12"/>',
 build_tower:'<path d="M6 3h20v7H6ZM10 10v18m12-18v18M6 28h20M12 14h8m-8 5h8m-8 5h8"/>',
 build_warrior:'<path d="m2 13 14-10 14 10H2Zm4 0v15h20V13m-13 4v11m6-11v11M8 15v10m16-10v10"/>',
 build_fire:'<path d="M3 27h26M5 22h22M8 22V12m16 10V12M4 12h24L16 3ZM16 15c6 4 4 8 0 8s-6-4 0-8Z"/>',
 build_spy:'<path d="m4 28 4-18 8-7 8 7 4 18ZM10 17s6-8 12 0c-6 8-12 0-12 0Z"/><circle cx="16" cy="17" r="2"/>',
 build_shipyard:'<path d="M16 9v18M7 18c0 13 18 13 18 0m-21 0h6m12 0h6M9 13h14"/><circle cx="16" cy="6" r="3"/>',
 build_airship:'<ellipse cx="16" cy="10" rx="10" ry="7"/><path d="M9 15 12 25m11-10-3 10M10 25h12v5H10ZM16 3v14"/>',
 upgrade_unit:'<path d="m16 3 4 8 9 1-7 7 2 10-8-5-8 5 2-10-7-7 9-1Z"/>',
 airship_rocket:'<path d="M11 21c-2-11 8-16 15-17-1 7-6 17-17 16Zm1-11-7 3v8l6-2m12-4-3 8h-8l2-6M8 24l-4 5"/><circle cx="21" cy="10" r="2"/>',
 move:'<path d="M5 27 27 5m-12 0h12v12M4 20v8h8"/>',
 wild:'<circle cx="16" cy="9" r="5"/><path d="M7 28V21c0-10 18-10 18 0v7M3 14l7-5m-7-3 7 8"/>',
 warrior:'<path d="m9 26 15-19 3-4-6 2L7 23ZM4 20l8 7m-7 2 4-5M3 4l10 2v9l-5 5-5-5Z"/>',
 firewarrior:'<path d="M8 28v-8c0-8 16-8 16 0v8M16 3c8 7 7 10 0 10S8 10 16 3Z"/>',
 shaman:'<path d="M7 28 16 8l9 20ZM11 7l5-4 5 4M4 28V10m-2 0 2-7 3 7M12 21h8"/>',
 spy:'<path d="M4 28 9 11l7-8 7 8 5 17ZM10 15h12m-10 6h8"/>',
 airship:'<ellipse cx="16" cy="10" rx="10" ry="7"/><path d="M9 15 12 25m11-10-3 10M10 25h12v5H10ZM16 3v14"/>'
};
export function icon(key) {
    const body=paths[key] || paths.blast;
    return `<svg class="tribal-icon" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
