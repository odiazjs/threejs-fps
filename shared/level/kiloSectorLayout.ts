import * as THREE from 'three';
import { MAP_PALETTE } from './mapPalette.js';

// Create a master group for the entire level map
const mapGroup = new THREE.Group();

const colors = {
    floor: MAP_PALETTE.carbonGrey,
    wallBase: MAP_PALETTE.ironGrey,
    panel: MAP_PALETTE.pastelOrange,
    plasma: MAP_PALETTE.pastelTeal,
    trim: MAP_PALETTE.darkGunmetal,
    accent: MAP_PALETTE.steelGrey,
};

// --- HELPER FUNCTION: OUTLINED STYLIZED GEOMETRY ---
function createStyledMesh(geometry: THREE.BufferGeometry, color: number): THREE.Group {
    const group = new THREE.Group();
    
    // Main structural material
    const material = new THREE.MeshBasicMaterial({ color: color });
    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
    
    // Stylized black outline overlay
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    const line = new THREE.LineSegments(edges, lineMat);
    group.add(line);
    
    return group;
}

// =========================================================================
// 1. FLOOR LEVEL & BASE LAYOUT
// =========================================================================
// Symmetrical cross layout floor matching the Overview Map
const centralFloorGeo = new THREE.BoxGeometry(16, 0.2, 16);
const centralFloor = createStyledMesh(centralFloorGeo, colors.floor);
centralFloor.position.set(0, -0.1, 0);
mapGroup.add(centralFloor);

// North/South/East/West Wing Floor Extensions
const wingPositions = [
    { x: 0, z: -14 }, { x: 0, z: 14 }, // North, South
    { x: 14, z: 0 }, { x: -14, z: 0 }  // East, West
];

wingPositions.forEach(pos => {
    const wingFloorGeo = new THREE.BoxGeometry(8, 0.2, 12);
    const wingFloor = createStyledMesh(wingFloorGeo, colors.floor);
    wingFloor.position.set(pos.x, -0.1, pos.z);
    // Rotate for east/west wings to match layout direction
    if (pos.x !== 0) wingFloor.rotation.y = Math.PI / 2;
    mapGroup.add(wingFloor);
});

// =========================================================================
// 2. CENTRAL OBSERVATION TOWER & CORE
// =========================================================================
const centerTowerGroup = new THREE.Group();

// Lower Foundation
const towerBaseGeo = new THREE.BoxGeometry(4, 3, 4);
const towerBase = createStyledMesh(towerBaseGeo, colors.wallBase);
towerBase.position.y = 1.5;
centerTowerGroup.add(towerBase);

// Red Core Accents
const towerPanelGeo = new THREE.BoxGeometry(4.2, 1.5, 2.5);
const towerPanelNS = createStyledMesh(towerPanelGeo, colors.panel);
towerPanelNS.position.y = 1.5;
centerTowerGroup.add(towerPanelNS);

// Upper Observation Spire
const upperSpireGeo = new THREE.BoxGeometry(2.5, 2, 2.5);
const upperSpire = createStyledMesh(upperSpireGeo, colors.wallBase);
upperSpire.position.y = 4;
centerTowerGroup.add(upperSpire);

// Glowing Top Core Ring
const topCoreGeo = new THREE.BoxGeometry(1.5, 0.5, 1.5);
const topCore = createStyledMesh(topCoreGeo, colors.plasma);
topCore.position.y = 5.25;
centerTowerGroup.add(topCore);

mapGroup.add(centerTowerGroup);

// =========================================================================
// 3. PLASMA ACCELERATOR CONDUITS (The 4 glowing cross lanes)
// =========================================================================
const conduitDirections = [
    { x: 0, z: -6, rot: 0 },         // North
    { x: 0, z: 6, rot: 0 },          // South
    { x: 6, z: 0, rot: Math.PI / 2 }, // East
    { x: -6, z: 0, rot: Math.PI / 2 } // West
];

conduitDirections.forEach(dir => {
    const conduitGroup = new THREE.Group();
    
    // Outer Frame Trench
    const frameGeo = new THREE.BoxGeometry(1.6, 0.6, 6);
    const frame = createStyledMesh(frameGeo, colors.wallBase);
    conduitGroup.add(frame);
    
    // Glowing Internal Plasma Energy Beam
    const energyGeo = new THREE.BoxGeometry(0.6, 0.2, 5.8);
    const energy = createStyledMesh(energyGeo, colors.plasma);
    energy.position.y = 0.25;
    conduitGroup.add(energy);
    
    // Position and orient the conduit lane
    conduitGroup.position.set(dir.x, 0.3, dir.z);
    conduitGroup.rotation.y = dir.rot;
    mapGroup.add(conduitGroup);
});

// =========================================================================
// 4. PERIMETER MODULAR WALLS & UPPER PLATFORMS
// =========================================================================
// Helper function to build a piece of modular, paneled defensive wall
function createModularWall(length: number, height: number, depth: number): THREE.Group {
    const wallGroup = new THREE.Group();
    
    // Structural Base Frame
    const baseGeo = new THREE.BoxGeometry(length, height, depth);
    const base = createStyledMesh(baseGeo, colors.wallBase);
    base.position.y = height / 2;
    wallGroup.add(base);
    
    // Orange accent facade panels
    const panelW = length - 0.4;
    const panelH = height - 0.6;
    const facadeGeo = new THREE.BoxGeometry(panelW, panelH, depth + 0.1);
    const facade = createStyledMesh(facadeGeo, colors.panel);
    facade.position.y = height / 2;
    wallGroup.add(facade);
    
    return wallGroup;
}

// Corner Raised L-Platforms (Top-Right High Ground in Blueprint)
const highPlatformGeo = new THREE.BoxGeometry(6, 3, 6);
const highPlatform = createStyledMesh(highPlatformGeo, colors.accent);
highPlatform.position.set(7, 1.5, -7);
mapGroup.add(highPlatform);

// Retaining Walls for the High Ground
const northWall = createModularWall(8, 4.5, 1.5);
northWall.position.set(6, 0, -10.25);
mapGroup.add(northWall);

const eastWall = createModularWall(8, 4.5, 1.5);
eastWall.position.set(10.25, 0, -6);
eastWall.rotation.y = Math.PI / 2;
mapGroup.add(eastWall);

// Staircase Access to High Ground
const stairCount = 6;
for (let i = 0; i < stairCount; i++) {
    const stairGeo = new THREE.BoxGeometry(2, 0.5, 0.5);
    const stair = createStyledMesh(stairGeo, colors.trim);
    stair.position.set(3.5, 0.25 + (i * 0.5), -4 - (i * 0.5));
    mapGroup.add(stair);
}

// =========================================================================
// 5. MODULAR ENVIRONMENTAL COVER (Spawned Scatter Blocks)
// =========================================================================
const coverLocations = [
    { x: -3, z: -3, type: 'large' },  // Center-Left Cover
    { x: 4, z: 3, type: 'long' },     // Center-Right Lower Cover
    { x: -5, z: 4, type: 'small' },    // Left Flank Crate
    { x: 0, z: -12, type: 'large' },   // North Spawn Cover
    { x: 0, z: 12, type: 'large' }     // South Spawn Cover
];

coverLocations.forEach(loc => {
    let cover;
    if (loc.type === 'large') {
        cover = createModularWall(2.5, 1.8, 1.2);
    } else if (loc.type === 'long') {
        cover = createModularWall(3.5, 1.2, 1.0);
    } else {
        // Simple standalone power cell box
        const boxGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
        cover = createStyledMesh(boxGeo, colors.plasma);
        cover.position.y = 0.6;
    }
    cover.position.set(loc.x, cover.position.y, loc.z);
    mapGroup.add(cover);
});

// =========================================================================
// 6. SCATTERED PLASMA POWER CELLS
// =========================================================================
const cellLocations = [
    { x: -2.5, y: 1.8, z: -3 }, // Stacked on top of Center-Left Cover
    { x: -6, y: 0, z: 5 },       // Ground level cluster
    { x: -6.8, y: 0, z: 5.8 },
    { x: 8, y: 3, z: -8 }        // Up on the high observation deck
];

cellLocations.forEach(loc => {
    const cellGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const cell = createStyledMesh(cellGeo, colors.plasma);
    cell.position.set(loc.x, loc.y + 0.3, loc.z);
    mapGroup.add(cell);
});

// Scale the entire map layout uniformly for scene units

const MAP_SCALE_X = 4;
const MAP_SCALE_Y = 2;
const MAP_SCALE_Z = 4;

mapGroup.scale.set(MAP_SCALE_X, MAP_SCALE_Y, MAP_SCALE_Z);

export { mapGroup };