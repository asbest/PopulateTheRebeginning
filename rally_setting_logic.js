        if(terrainHits.length > 0) {
            if (state.selectedBuilding && (isRightClick || action === 'move')) {
                state.selectedBuilding.setRallyPoint(terrainHits[0].point.x, terrainHits[0].point.z);
                spawnPulse(terrainHits[0].point.x, terrainHits[0].point.y, terrainHits[0].point.z, 0xffff00);
            } else {
                performAction(terrainHits[0].point.x, terrainHits[0].point.z, isRightClick ? 'move' : action);
            }
        }
