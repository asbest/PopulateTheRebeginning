// Narrative only: the twelve existing battles, AI rosters and victory rules stay intact.
export const CAMPAIGN_STORIES = {
    1: {
        title: 'Level 1: The Broken Shore',
        text: 'Generations after a shaman became a goddess, her name is still spoken over every harvest. Yet the sea has taken your village and the earth no longer answers its prayers. Lead the survivors to shelter; the neighboring clan is already fighting for the same ground.',
        objective: 'Complete two huts for the survivors, then defeat the rival tribe.',
        beat: 'The first clash stirs an unfamiliar pulse beneath the shore. The land remembers a power your elders never named.',
        outro: 'Your people have a home again, but the tide has not stopped rising. Other shores will need one too.'
    },
    2: {
        title: 'Level 2: The Displaced',
        text: 'Two clans driven from their homes have made common cause against yours. They are not an invading empire; they are families whose fields vanished beneath the water. Their warriors will still destroy your settlement if you cannot hold it.',
        objective: 'Complete a shelter and hold the shore for two minutes, or defeat the attackers sooner.',
        beat: 'Their fighters carry soil from drowned villages. This war began long before anyone crossed your border.',
        outro: 'The raids end. What drove these clans away remains, and more people are moving toward the high ground.'
    },
    3: {
        title: 'Level 3: Fire in the Snow',
        text: 'Far north, the winter has outlasted every season. A fire shaman burns precious mana to keep his people alive, even as the cold closes around them. The blizzard grounds your airships, leaving only a march across hostile land.',
        objective: 'Lead your shaman to the marked pass, then defeat the fire shaman. Airships are unavailable.',
        beat: 'Even fire cannot warm the soil for long. The cold is spreading from somewhere beyond this island.',
        outro: 'The flames fade, but the endless winter does not. You follow the current of spent magic inland.'
    },
    4: {
        title: 'Level 4: The Last Refuge',
        text: 'A guarded refuge controls the safest passage through the broken coast. Its cautious ruler believes every stranger will bring the disaster inside. She watches for weakness and will take your shaman’s death as the end of your claim.',
        objective: 'Defeat the refuge shaman while keeping your own alive. Sudden Death is active.',
        beat: 'The defenders have marked each year’s retreating shoreline. Their walls were built against the sea before they were built against you.',
        outro: 'The passage opens. Beyond it, several tribes are gathering where the ground hums with impossible power.'
    },
    5: {
        title: 'Level 5: The Mana Tide',
        text: 'Mana floods this archipelago without limit. Three tribes are fighting over it, convinced that one more victory will make their homes safe. As you enter the battle, you sense the current running upward, away from the world.',
        objective: 'Secure two marked mana conduits while three rival tribes fight. Mana is unlimited and units move faster.',
        beat: 'The mana tide has a destination. It is being drawn toward the heavens, to the shaman who once ascended.',
        outro: 'The conduits fall silent. The goddess is feeding her power with the world’s own magic.'
    },
    6: {
        title: 'Level 6: The Hidden Tithe',
        text: 'A shadow tribe hides the memory of the first Ascension. Its trickster shaman uses deception to protect her people from anyone seeking that knowledge. Her secret may explain how the mana tithe began.',
        objective: 'Bring your shaman into the marked shadow camp, then defeat the trickster shaman.',
        beat: 'You uncover the cost of the old miracle: the goddess’s power is sustained by mana taken from living lands.',
        outro: 'The tithe can be broken, but the bond runs through mountains, minds and storms. You must trace it to its source.'
    },
    7: {
        title: 'Level 7: The Scarred Peak',
        text: 'The mountain tribe holds ground split by generations of magic. Its fortress guards one of the ancient paths along which mana leaves the world. Stone and steep approaches favor the defenders.',
        objective: 'Secure the marked mountain conduit and defeat the fortress shaman. Shape the terrain to open an approach.',
        beat: 'Every spell changes the hillside. You can feel how much the land gives back—and how much the distant power takes.',
        outro: 'The mountain path is yours. The old bond continues into the jungle, where three tribes found another way to survive.'
    },
    8: {
        title: 'Level 8: The Shared Mind',
        text: 'Three sister tribes joined their thoughts so no family would face the failing land alone. Their shared mind protects them, but it also makes every stranger a threat. They stand together against your advance.',
        objective: 'Secure all three marked jungle conduits against the allied tribes.',
        beat: 'Within their united resistance you sense fear, not devotion to the goddess. They have been enduring the same loss.',
        outro: 'The shared conduits fall quiet. You carry their warning onward: the bond is growing stronger with every storm.'
    },
    9: {
        title: 'Level 9: Borrowed Storms',
        text: 'The stormkeeper diverts violent weather from the last safe settlements. To keep that power, he protects the flow of mana to the heavens. His bargain shelters some people while leaving others beneath the storm.',
        objective: 'Complete two shelters and withstand the storm for two and a half minutes, or defeat its keeper sooner.',
        beat: 'The lightning follows the same path as the mana tide. Weather itself is being bent around the old bargain.',
        outro: 'The settlements endure the storm. Beyond it lies a breach between worlds, guarded by those who know what waits above.'
    },
    10: {
        title: 'Level 10: The Breach Between Worlds',
        text: 'A gatekeeper stands at the route to the goddess. He believes sealing it would strand the lands that still depend on her magic. If you cross, you must find a way to end the tithe without abandoning those people.',
        objective: 'Escort both marked followers to the gate. If either dies, the mission fails.',
        beat: 'Through the breach you see the truth: the goddess holds the worlds together with power they can no longer spare.',
        outro: 'The followers cross safely, and the passage opens. Five guardians await, each bound to a different part of the bargain.'
    },
    11: {
        title: 'Level 11: The Covenant',
        text: 'Five powerful tribes uphold the Ascended’s covenant. Some fear the worlds will break without her; others fear losing the power she grants them. They fight as one, but they do not all believe in the same future.',
        objective: 'Break the covenant by securing three of the five marked guardian conduits.',
        beat: 'Their strength comes from the same failing source. Victory alone cannot heal what the covenant has consumed.',
        outro: 'The covenant loses its grip as the conduits close. For the first time, the Ascended must answer someone from the world she left behind.'
    },
    12: {
        title: 'Level 12: The Price of Divinity',
        text: 'The first Ascended waits at the heart of the bond. She saved the worlds once, then drew on them for so long that she could no longer let go. Defeat her last guardian and decide whether any one shaman should wield such power again.',
        objective: 'Defeat the final guardian shaman. Decide the fate of divine power afterward.',
        beat: 'The guardian’s resistance weakens. Beyond it, the Ascended offers you the power to preserve her order.',
        outro: 'The guardian falls. The mana tide stops for a moment. What happens next is your choice.'
    }
};

export const CAMPAIGN_ENDINGS = {
    keep: {
        title: 'The New Ascended',
        text: 'You take the power and steady the broken worlds. The storms quiet and your people have time to rebuild. But the bond still draws mana upward. You promise to use less than the last goddess did; one day, another shaman may have to judge that promise.'
    },
    return: {
        title: 'The World Remembers',
        text: 'You return the stored mana to the lands below. The bond breaks, and no single shaman can shield every village again. Storms and hardship remain, but the soil begins to answer the people who live on it. They must build their future together.'
    }
};
