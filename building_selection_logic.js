        if (buildingHits.length > 0) {
            const hitBuilding = meshToBuilding.get(buildingHits[0].object);
            if (hitBuilding && window.isAllied(hitBuilding.faction, 0)) {
                state.selectedUnits.forEach(u => u.selectRing.visible = false);
                state.selectedUnits = [];
                if (state.selectedBuilding && state.selectedBuilding.rallyLine) state.selectedBuilding.rallyLine.visible = false;
                state.selectedBuilding = hitBuilding;
                if (state.selectedBuilding.rallyLine) state.selectedBuilding.rallyLine.visible = true;
                updateContextMenus();
                return;
            }
        }
