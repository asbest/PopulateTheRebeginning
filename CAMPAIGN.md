# Campaign: The Price of Divinity

Generations after a shaman ascended, the worlds she saved are running out of mana. The player leads survivors across twelve islands and discovers that the Ascended's power is sustained by a tithe drawn from living lands. Rival shamans protect their people in different ways; their motives do not make their attacks less dangerous. The final battle opens a choice between keeping the divine bond and returning its power to the world.

The story is a continuation of the original ascent premise. It does not ask the player to ascend again as an uncomplicated reward.

| Level | Chapter | Existing playable scenario | Narrative purpose |
| --- | --- | --- | --- |
| 1 | The Broken Shore | One default opponent; extra starting mana | Establish a home for survivors and notice that the land has changed. |
| 2 | The Displaced | Two allied swarmers | Show that the attackers are refugees from the same disaster. |
| 3 | Fire in the Snow | Winter, no flyers, sorcerer opponent | Meet a shaman spending mana to hold back an endless winter. |
| 4 | The Last Refuge | Opportunist, Sudden Death | Cross a defended refuge while keeping the player shaman alive. |
| 5 | The Mana Tide | Three independent rivals, infinite mana, double speed | Turn the apparent final war into the midpoint revelation: mana is flowing upward. |
| 6 | The Hidden Tithe | Night, trickster opponent | Learn the cost of the first Ascension. |
| 7 | The Scarred Peak | Mountain, fortress opponent | Trace the tithe through damaged land and use terrain shaping in battle. |
| 8 | The Shared Mind | Jungle, three allied hive opponents | Encounter tribes linked together to survive the failing land. |
| 9 | Borrowed Storms | Storm, stormkeeper opponent | Confront a guardian who protects some settlements at others' expense. |
| 10 | The Breach Between Worlds | Void, gatekeeper opponent | Reach the route to the Ascended and understand the cost of breaking the bond. |
| 11 | The Covenant | Celestial, five allied opponents | Defeat the tribes upholding the old arrangement for different reasons. |
| 12 | The Price of Divinity | Cosmic, primordial guardian opponent | Defeat the guardian and choose what happens to the stored divine power. |

Each chapter has an opening, a playable objective matching its actual win condition, a short clue that appears after the first enemy loss, and a closing passage after victory. The current chapter and discovered clue can be reread from **Campaign journal** in the pause menu. The ending offers two epilogues: **Keep the power** steadies the worlds but leaves the mana tithe in place; **Return it to the world** breaks the bond and gives the land a chance to recover without divine protection. The chosen epilogue is stored locally.

Campaign missions still use the existing AI, spells, terrain, progression and victory rules. The narrative does not depend on unimplemented features such as shifting ice bridges, flying towers or an alliance system. Chapter text and endings are maintained in `art/campaign-story.js`; the browser presentation and progression hooks are in `PopulateTheRebeginning.html`.
