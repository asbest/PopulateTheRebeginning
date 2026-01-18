import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import { getHeight, isBlocked } from './utils.js';
import { WATER_LEVEL } from './constants.js';

export class BinaryHeap {
    constructor(scoreFunction) { this.content = []; this.scoreFunction = scoreFunction; }
    push(element) { this.content.push(element); this.siftUp(this.content.length - 1); }
    pop() {
        const result = this.content[0]; const end = this.content.pop();
        if (this.content.length > 0) { this.content[0] = end; this.siftDown(0); }
        return result;
    }
    size() { return this.content.length; }
    siftUp(n) {
        const element = this.content[n];
        while (n > 0) {
            const parentN = Math.floor((n + 1) / 2) - 1;
            const parent = this.content[parentN];
            if (this.scoreFunction(element) < this.scoreFunction(parent)) {
                this.content[parentN] = element; this.content[n] = parent; n = parentN;
            } else break;
        }
    }
    siftDown(n) {
        const length = this.content.length; const element = this.content[n];
        while (true) {
            const child2N = (n + 1) * 2; const child1N = child2N - 1;
            let swap = null;
            if (child1N < length) {
                const child1 = this.content[child1N];
                if (this.scoreFunction(child1) < this.scoreFunction(element)) swap = child1N;
            }
            if (child2N < length) {
                const child2 = this.content[child2N];
                if (this.scoreFunction(child2) < (swap === null ? this.scoreFunction(element) : this.scoreFunction(this.content[child1N]))) swap = child2N;
            }
            if (swap !== null) { this.content[n] = this.content[swap]; this.content[swap] = element; n = swap; } else break;
        }
    }
}

export const Pathfinder = {
    GRID_SIZE: 2.0,
    findPath: function(startPos, endPos, isFlying = false, unitHeight = 1.5) {
        const startNode = { x: Math.round(startPos.x / this.GRID_SIZE), y: Math.round(startPos.z / this.GRID_SIZE) };
        const endNode = { x: Math.round(endPos.x / this.GRID_SIZE), y: Math.round(endPos.z / this.GRID_SIZE) };

        if(startNode.x === endNode.x && startNode.y === endNode.y) return [];

        const openHeap = new BinaryHeap(node => node.f);
        const openSet = new Map();
        const closedSet = new Set();

        startNode.g = 0; startNode.f = 0;
        openHeap.push(startNode);
        openSet.set(`${startNode.x},${startNode.y}`, startNode);

        let iterations = 0;
        const MAX_ITER = 10000;
        const safeH = WATER_LEVEL - unitHeight;

        while(openHeap.size() > 0) {
            iterations++;
            if(iterations > MAX_ITER) break;

            const currentNode = openHeap.pop();
            const key = `${currentNode.x},${currentNode.y}`;
            openSet.delete(key);
            closedSet.add(key);

            if(currentNode.x === endNode.x && currentNode.y === endNode.y) {
                const path = [];
                let curr = currentNode;
                while(curr.parent) {
                    path.push(new THREE.Vector3(curr.x * this.GRID_SIZE, 0, curr.y * this.GRID_SIZE));
                    curr = curr.parent;
                }
                return path.reverse();
            }

            const neighbors = [
                {x:0,y:1}, {x:1,y:0}, {x:0,y:-1}, {x:-1,y:0},
                {x:1,y:1}, {x:1,y:-1}, {x:-1,y:1}, {x:-1,y:-1}
            ];

            for(let offset of neighbors) {
                const nx = currentNode.x + offset.x;
                const ny = currentNode.y + offset.y;
                const nKey = `${nx},${ny}`;

                if(closedSet.has(nKey)) continue;

                const wx = nx * this.GRID_SIZE;
                const wz = ny * this.GRID_SIZE;
                const h = getHeight(wx, wz);

                if(!isFlying && h < safeH) continue; // Too Deep

                // Building collision check
                if(!isFlying && isBlocked(wx, wz)) continue;

                // Diagonal corner cutting check
                if (Math.abs(offset.x) === 1 && Math.abs(offset.y) === 1) {
                    if (!isFlying) {
                        const h1 = getHeight((currentNode.x + offset.x) * this.GRID_SIZE, currentNode.y * this.GRID_SIZE);
                        const h2 = getHeight(currentNode.x * this.GRID_SIZE, (currentNode.y + offset.y) * this.GRID_SIZE);
                        if (h1 < safeH || h2 < safeH) continue;
                    }
                }

                const dist = Math.sqrt(offset.x*offset.x + offset.y*offset.y);
                const currentH = getHeight(currentNode.x * this.GRID_SIZE, currentNode.y * this.GRID_SIZE);
                const dh = Math.abs(h - currentH);
                if(!isFlying && dh > 2.0) continue;

                let cost = dist + dh * 0.5;
                if (h < WATER_LEVEL) cost += 10.0; // Penalty for water
                const gScore = currentNode.g + cost;

                let neighbor = openSet.get(nKey);
                if(!neighbor) {
                    neighbor = { x: nx, y: ny, parent: currentNode, g: gScore, f: 0 };
                    const hScore = Math.sqrt((nx - endNode.x)**2 + (ny - endNode.y)**2);
                    neighbor.f = neighbor.g + hScore;
                    openHeap.push(neighbor);
                    openSet.set(nKey, neighbor);
                } else if(gScore < neighbor.g) {
                    neighbor.g = gScore;
                    neighbor.parent = currentNode;
                    neighbor.f = neighbor.g + Math.sqrt((nx - endNode.x)**2 + (ny - endNode.y)**2);
                    openHeap.push(neighbor);
                }
            }
        }
        return null;
    }
};

export function isWalkableLine(start, end, isFlying, unitHeight = 1.5) {
    const dist = start.distanceTo(end);
    const steps = Math.ceil(dist / 1.0);
    if (steps <= 1) return true;

    const dir = end.clone().sub(start).normalize();
    const checkPos = start.clone();
    const safeH = WATER_LEVEL - unitHeight;

    for(let i=1; i<steps; i++) {
        checkPos.add(dir);
        const h = getHeight(checkPos.x, checkPos.z);
        if(!isFlying) {
            if(h < safeH) return false;
            if(isBlocked(checkPos.x, checkPos.z)) return false;
        }
    }
    return true;
}

export function smoothPath(path, isFlying, unitHeight) {
    if(path.length < 3) return path;
    const newPath = [path[0]];
    let current = path[0];

    for(let i=1; i<path.length-1; i++) {
        // Check if we can go from current to path[i+1] directly
        if(isWalkableLine(current, path[i+1], isFlying, unitHeight)) {
            // Can skip path[i]
            continue;
        } else {
            // Cannot skip, add path[i]
            newPath.push(path[i]);
            current = path[i];
        }
    }
    newPath.push(path[path.length-1]);
    return newPath;
}
