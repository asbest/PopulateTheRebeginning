import re

with open('PopulateTheRebeginning.html', 'r') as f:
    content = f.read()

bad_menu = """    </div>

    <div id="tribe-menu" style="display:none; position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); flex-direction:column; align-items:center; justify-content:center; z-index:202; color:white; pointer-events:auto; overflow-y:auto;">
        <h1 style="color:white; margin-bottom:20px; text-shadow: 2px 2px 0 #000;">TRIBES CONFIGURATION</h1>
        <div id="tribe-list" style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px;"></div>
        <button class="menu-btn" onclick="addTribe()">Add Tribe</button>
        <button class="menu-btn" onclick="closeTribeMenu()">Back</button>
    </div>

        <div id="cheat-menu" style="display:none; flex-direction:column; align-items:center; margin-top:20px; border-top: 1px solid white; padding-top:10px;">
            <h2 style="color:gold; font-size:16px;">CHEATS</h2>
            <button class="menu-btn" onclick="cheatMana()">Set Mana 10000</button>
            <button class="menu-btn" onclick="cheatRange()">Unlimited Range</button>
            <button class="menu-btn" onclick="cheatImmortal()">God Mode</button>
            <button class="menu-btn" onclick="cheatDisable()">Disable Cheats</button>
        </div>
    </div>"""

good_menu = """        <div id="cheat-menu" style="display:none; flex-direction:column; align-items:center; margin-top:20px; border-top: 1px solid white; padding-top:10px;">
            <h2 style="color:gold; font-size:16px;">CHEATS</h2>
            <button class="menu-btn" onclick="cheatMana()">Set Mana 10000</button>
            <button class="menu-btn" onclick="cheatRange()">Unlimited Range</button>
            <button class="menu-btn" onclick="cheatImmortal()">God Mode</button>
            <button class="menu-btn" onclick="cheatDisable()">Disable Cheats</button>
        </div>
    </div>

    <div id="tribe-menu" style="display:none; position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); flex-direction:column; align-items:center; justify-content:center; z-index:202; color:white; pointer-events:auto; overflow-y:auto;">
        <h1 style="color:white; margin-bottom:20px; text-shadow: 2px 2px 0 #000;">TRIBES CONFIGURATION</h1>
        <div id="tribe-list" style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px;"></div>
        <button class="menu-btn" onclick="addTribe()">Add Tribe</button>
        <button class="menu-btn" onclick="closeTribeMenu()">Back</button>
    </div>"""

content = content.replace(bad_menu, good_menu)

with open('PopulateTheRebeginning.html', 'w') as f:
    f.write(content)
