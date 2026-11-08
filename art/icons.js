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
 build_temple:'<path d="m4 28 4-18 8-7 8 7 4 18ZM10 17s6-8 12 0c-6 8-12 0-12 0Z"/><circle cx="16" cy="17" r="2"/>',
 build_shipyard:'<path d="M16 9v18M7 18c0 13 18 13 18 0m-21 0h6m12 0h6M9 13h14"/><circle cx="16" cy="6" r="3"/>',
 build_airship:'<ellipse cx="16" cy="10" rx="10" ry="7"/><path d="M9 15 12 25m11-10-3 10M10 25h12v5H10ZM16 3v14"/>',
 upgrade_unit:'<path d="m16 3 4 8 9 1-7 7 2 10-8-5-8 5 2-10-7-7 9-1Z"/>',
 airship_rocket:'<path d="M11 21c-2-11 8-16 15-17-1 7-6 17-17 16Zm1-11-7 3v8l6-2m12-4-3 8h-8l2-6M8 24l-4 5"/><circle cx="21" cy="10" r="2"/>',
 move:'<path d="M5 27 27 5m-12 0h12v12M4 20v8h8"/>',
 wild:'<path fill="currentColor" fill-opacity=".15" d="M3 29v-6c0-7 17-7 17 0v6Z"/><path d="M5 10a6 6 0 0 1 12 0M3 10h16M7 12v2a4 4 0 0 0 8 0v-2M3 29v-6c0-7 17-7 17 0v6M11 20v8M25 12v17M21 4h9v7h-9Z"/>',
 warrior:'<path fill="currentColor" fill-opacity=".15" d="m3 15 7-3 7 3v6c0 4-4 7-7 9-3-2-7-5-7-9Z"/><path d="m3 15 7-3 7 3v6c0 4-4 7-7 9-3-2-7-5-7-9ZM10 16v9m-4-5h8M18 29l6-17M20 12l-1-5 4-4 6 2 1 5-4 4ZM19 5l-2-1m10-2 1-1m3 8 1 1"/>',
 firewarrior:'<circle cx="16" cy="11" r="4"/><path fill="currentColor" fill-opacity=".15" d="M9 29v-8c0-7 14-7 14 0v8Z"/><path d="M9 29v-8c0-7 14-7 14 0v8M12 21l-6-4m14 4 6-4M5 17c-6-2-3-7-1-10 0 4 4 4 4 7 0 2-1 3-3 3Zm22 0c-4 0-4-4-2-7l2-5c0 5 5 6 4 9-1 2-2 3-4 3ZM13 26h6"/>',
 shaman:'<path d="m6 9-3-5 6 2 3-4 3 4 6-2-3 5M7 11v3a5 5 0 0 0 10 0v-3M7 21l-3 8h16l-3-8M12 21v8M25 11v18m-4-22 4-5 4 5-4 5Z"/><path fill="currentColor" fill-opacity=".2" d="m21 7 4-5 4 5-4 5ZM7 21l-3 8h16l-3-8Z"/>',
 preacher:'<circle cx="11" cy="9" r="7"/><circle cx="11" cy="10" r="3"/><path fill="currentColor" fill-opacity=".15" d="m6 19-3 10h16l-3-10Z"/><path d="m6 19-3 10h16l-3-10M7 21l4 3 4-3M25 12v17m-3-10h6"/><circle cx="25" cy="8" r="4"/>',
 airship:'<ellipse cx="16" cy="11" rx="13" ry="8" fill="currentColor" fill-opacity=".15"/><path d="M16 3c-8 3-8 13 0 16 8-3 8-13 0-16ZM3 11h26M7 18l5 8m13-8-5 8M10 26h12v4H10Z"/>'
};
const unitKeys=new Set(['wild','warrior','firewarrior','shaman','preacher','airship']);
export function icon(key) {
    if(key==='warrior_attack')return '<svg class="tribal-icon" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="m6 28 12-15 3 2L9 30ZM16 12l1-7 7-3 6 6-3 7-7 1ZM17 5l-3-2m10-1 1-2m5 8 2 1M7 24l4 3"/></svg>';
    if(key==='firewarrior_attack')key='blast';
    const body=paths[key] || paths.blast;
    return `<svg class="tribal-icon" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${unitKeys.has(key)?2:1.65}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
