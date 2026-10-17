# Campaign: The Price of Divinity

Generations after a shaman ascended, the worlds she saved are running out of mana. The player leads survivors across twelve islands and discovers that the Ascended's power is sustained by a tithe drawn from living lands. Rival shamans protect their people in different ways; their motives do not make their attacks less dangerous. The final battle opens a choice between keeping the divine bond and returning its power to the world.

The story is a continuation of the original ascent premise. It does not ask the player to ascend again as an uncomplicated reward.

| Level | Chapter | Playable mission | Narrative purpose |
| --- | --- | --- | --- |
| 1 | The Broken Shore | Finish two huts, then defeat the rival tribe. | Establish a home for survivors and notice that the land has changed. |
| 2 | The Displaced | Hold a completed shelter for two minutes against two allied clans, or defeat them sooner. | Show that the attackers are refugees from the same disaster. |
| 3 | Fire in the Snow | Bring the shaman through the marked pass, then defeat the fire shaman without flyers. | Meet a shaman spending mana to hold back an endless winter. |
| 4 | The Last Refuge | Defeat the refuge shaman while protecting your own under Sudden Death. | Cross a defended refuge without destroying every defender. |
| 5 | The Mana Tide | Secure two of three marked conduits amid a free-for-all with infinite mana. | Reveal that mana is flowing upward. |
| 6 | The Hidden Tithe | Reach the marked shadow camp with your shaman, then defeat the trickster shaman. | Learn the cost of the first Ascension. |
| 7 | The Scarred Peak | Secure the mountain conduit and defeat the fortress shaman. | Trace the tithe through damaged land and use terrain shaping in battle. |
| 8 | The Shared Mind | Secure all three jungle conduits while the hive tribes resist. | Encounter tribes linked together to survive the failing land. |
| 9 | Borrowed Storms | Complete two shelters and survive the storm for two and a half minutes, or defeat the attackers sooner. | Protect settlements under borrowed storms. |
| 10 | The Breach Between Worlds | Escort two followers to the marked gate; losing either before arrival defeats the mission. | Secure the route to the Ascended without killing its guardian. |
| 11 | The Covenant | Secure three of five guardian conduits. | Break the old arrangement at its source. |
| 12 | The Price of Divinity | Defeat the primordial guardian shaman, then choose an ending. | Decide what happens to the stored divine power. |

Each chapter has an opening, an objective matching its actual win condition, a progress line under the mana bar, a mid-mission clue and a closing passage. The current chapter and discovered clue can be reread from **Campaign journal** in the pause menu. Conduits and gates are marked in the world. A conduit is secured when an allied ground unit holds its circle uncontested; escort arrivals are counted separately. Mission progress survives save/load. The ending offers two epilogues: **Keep the power** steadies the worlds but leaves the mana tithe in place; **Return it to the world** breaks the bond and gives the land a chance to recover without divine protection. The chosen epilogue is stored locally.

Campaign missions use the existing AI, spells, terrain and progression. Their rules are maintained in `art/campaign-missions.js`, chapter text and endings in `art/campaign-story.js`, and the browser presentation and progression hooks in `PopulateTheRebeginning.html`. Skirmish victory still requires defeating all enemies.
