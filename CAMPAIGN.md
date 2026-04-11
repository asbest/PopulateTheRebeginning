# The Rebeginning: Single-Player Campaign Proposal

With the introduction of Match Settings, Biomes, and diverse AI Personalities, *Populate The Rebeginning* is perfectly positioned for a structured single-player campaign. This campaign focuses on teaching the player core mechanics progressively while introducing them to increasingly difficult tactical scenarios using the new mutators.

## Overview: The Journey of the First Shaman

The campaign follows the journey of the First Shaman, who awakens in a fractured world and must unite or conquer the scattered rival tribes.

Each level is accessed from a new "Campaign Mode" button on the main menu, loading a pre-configured scenario.

### Level 1: The Awakening (Tutorial)
*   **Objective:** Rebuild your tribe and defeat a weak neighboring clan.
*   **Opponent:** 1 AI Tribe (Personality: **Default**)
*   **Settings:** Normal Biome, Normal Speed.
*   **Modifiers:** Player begins with bonus starting mana (500) to allow free experimentation with spells.
*   **Narrative:** The First Shaman wakes up on a pristine island. You must learn to gather followers, construct basic buildings, and eliminate the feral tribe nearby.

### Level 2: The Swarm
*   **Objective:** Survive an early rush and counter-attack.
*   **Opponent:** 2 AI Tribes (Personality: **Swarmer**, Teams: Allied with each other).
*   **Settings:** Normal Biome.
*   **Modifiers:** None.
*   **Narrative:** Two aggressive clans have allied against you. They build rapidly and attack in high numbers. You must balance defense (towers, strategic spell usage) with building up a strong enough force to break their siege.

### Level 3: The Frozen Wastes
*   **Objective:** Defeat the Sorcerer King across the ice.
*   **Opponent:** 1 AI Tribe (Personality: **Sorcerer**).
*   **Settings:** **Winter Biome**.
*   **Modifiers:** **No Flyers**.
*   **Narrative:** You travel north to confront a tribe obsessed with fire magic. With airships grounded due to the blizzard, you must rely on ground troops. The shifting ice mechanic means you must carefully time your assaults when the water freezes, or risk your army drowning when the thaw comes. The enemy Sorcerer will heavily utilize fire spells and Fire Warriors.

### Level 4: The Opportunist's Trap
*   **Objective:** Defeat a highly defensive tribe without losing your Shaman.
*   **Opponent:** 1 AI Tribe (Personality: **Opportunist**).
*   **Settings:** Normal Biome.
*   **Modifiers:** **Sudden Death** (If your Shaman dies, it's an immediate Game Over).
*   **Narrative:** A cunning enemy awaits in a heavily fortified base. They won't attack you outright unless they sense weakness—specifically, if your Shaman is killed or your mana is depleted. You must carefully dismantle their defenses using spies and strategic strikes, keeping your Shaman safely protected at all times.

### Level 5: The Grand Melee (Free-for-All)
*   **Objective:** Be the last tribe standing in a chaotic fast-paced war.
*   **Opponents:** 3 AI Tribes (1 Swarmer, 1 Sorcerer, 1 Default - No Teams).
*   **Settings:** Normal Biome.
*   **Modifiers:** **Double Unit Speed**, **Infinite Mana**.
*   **Narrative:** The remaining tribes have gathered in a massive archipelago for a final, chaotic battle. With limitless magical power and lightning-fast units, the battlefield is sheer chaos. You must spam spells, maneuver rapidly, and let your enemies weaken each other before moving in for the kill.

### Post-Campaign: Endless Survival
After beating the campaign, players unlock "Survival Mode", where they face endless, increasingly difficult waves of Swarmer AIs while trying to survive as long as possible.

---

## Implementation Pathway (Future Work)

To make this campaign a reality in code, the following steps would be needed:
1.  **UI Updates:** Add a "Campaign" menu screen that lists levels. Track progress via `localStorage` (e.g., unlocking Level 2 only after Level 1 is won).
2.  **Scenario Loading Function:** Create a `loadCampaignLevel(levelId)` function that resets the game state, overrides `window.enemyAIs` with the hardcoded presets for that level, and sets the specific `state.matchSettings` (like `suddenDeath` or `winter`).
3.  **Win/Loss Hooks:** Hook into the existing Game Over/Victory screen to trigger the "Next Level" prompt instead of returning to the main menu.