import { BLOCKS } from './catalog';
import { PLOT_VOXEL_XZ, PLOT_VOXEL_Y, voxelKey } from './geoGrid';
import type { BlockId, BlockPoolId } from './types';

export interface BlueprintVoxel {
  dx: number;
  dy: number;
  dz: number;
  blockId: BlockId;
}

export interface BlueprintDef {
  id: string;
  nameJa: string;
  descriptionJa: string;
  voxels: BlueprintVoxel[];
}

function createCottage(): BlueprintVoxel[] {
  const list: BlueprintVoxel[] = [];
  for (let x = 0; x < 4; x++) {
    for (let z = 0; z < 4; z++) {
      list.push({ dx: x, dy: 0, dz: z, blockId: 'gray' });
      const isEdge = x === 0 || x === 3 || z === 0 || z === 3;
      if (isEdge) {
        if (x === 1 && z === 3) {
          list.push({ dx: x, dy: 2, dz: z, blockId: 'brown' });
        } else if ((x === 0 || x === 3) && z === 1) {
          list.push({ dx: x, dy: 1, dz: z, blockId: 'white' });
          list.push({ dx: x, dy: 2, dz: z, blockId: 'glass' });
        } else {
          list.push({ dx: x, dy: 1, dz: z, blockId: 'white' });
          list.push({ dx: x, dy: 2, dz: z, blockId: 'white' });
        }
      }
      list.push({ dx: x, dy: 3, dz: z, blockId: 'red' });
    }
  }
  for (let x = 1; x <= 2; x++) {
    for (let z = 1; z <= 2; z++) {
      list.push({ dx: x, dy: 4, dz: z, blockId: 'orange' });
    }
  }
  list.push({ dx: 1, dy: 1, dz: 1, blockId: 'light_warm' });
  return list;
}

function createGardenTree(): BlueprintVoxel[] {
  const list: BlueprintVoxel[] = [];
  list.push({ dx: 1, dy: 0, dz: 1, blockId: 'brown' });
  list.push({ dx: 1, dy: 1, dz: 1, blockId: 'brown' });
  for (let x = 0; x <= 2; x++) {
    for (let z = 0; z <= 2; z++) {
      list.push({ dx: x, dy: 2, dz: z, blockId: 'emerald' });
      if (x === 1 || z === 1) {
        list.push({ dx: x, dy: 3, dz: z, blockId: 'lime' });
      }
    }
  }
  list.push({ dx: 0, dy: 0, dz: 0, blockId: 'pink' });
  list.push({ dx: 2, dy: 0, dz: 2, blockId: 'amber' });
  list.push({ dx: 2, dy: 0, dz: 0, blockId: 'light_warm' });
  return list;
}

function createGlassPavilion(): BlueprintVoxel[] {
  const list: BlueprintVoxel[] = [];
  for (let y = 0; y <= 5; y++) {
    for (let x = 0; x <= 2; x++) {
      for (let z = 0; z <= 2; z++) {
        const isEdge = x === 0 || x === 2 || z === 0 || z === 2;
        if (y === 0) {
          list.push({ dx: x, dy: y, dz: z, blockId: 'cobalt' });
        } else if (y === 5) {
          list.push({
            dx: x,
            dy: y,
            dz: z,
            blockId: x === 1 && z === 1 ? 'light_cyan' : 'white'
          });
        } else if (isEdge) {
          const isCorner = (x === 0 || x === 2) && (z === 0 || z === 2);
          list.push({
            dx: x,
            dy: y,
            dz: z,
            blockId: isCorner ? 'white' : 'glass'
          });
        }
      }
    }
  }
  return list;
}

function createRainbowTower(): BlueprintVoxel[] {
  const list: BlueprintVoxel[] = [];
  const bandColors: BlockId[] = [
    'cobalt',
    'sky',
    'teal',
    'emerald',
    'lime',
    'amber',
    'orange',
    'red',
    'pink',
    'purple',
    'indigo',
    'white'
  ];

  for (let y = 0; y < 12; y++) {
    const bandColor = bandColors[y % bandColors.length];
    for (let x = 0; x < 3; x++) {
      for (let z = 0; z < 3; z++) {
        const isEdge = x === 0 || x === 2 || z === 0 || z === 2;
        if (y === 0 || y === 6 || y === 11) {
          list.push({ dx: x, dy: y, dz: z, blockId: bandColor });
        } else if (isEdge) {
          const isCorner = (x === 0 || x === 2) && (z === 0 || z === 2);
          list.push({
            dx: x,
            dy: y,
            dz: z,
            blockId: isCorner ? bandColor : 'glass'
          });
        } else if (y === 5 || y === 10) {
          list.push({ dx: x, dy: y, dz: z, blockId: 'light_warm' });
        }
      }
    }
  }
  list.push({ dx: 1, dy: 12, dz: 1, blockId: 'light_cyan' });
  list.push({ dx: 1, dy: 13, dz: 1, blockId: 'amber' });
  return list;
}

export const BLUEPRINTS: BlueprintDef[] = [
  {
    id: 'mini_cottage',
    nameJa: 'カラフルコテージ',
    descriptionJa: '白壁と赤い屋根・ランプ付きの可愛いお家',
    voxels: createCottage()
  },
  {
    id: 'garden_tree',
    nameJa: '緑の庭と花壇',
    descriptionJa: '街角を彩る木とカラフルな花・明かり',
    voxels: createGardenTree()
  },
  {
    id: 'glass_pavilion',
    nameJa: 'スカイパビリオン',
    descriptionJa: 'クリアガラスとシアンライトが映える小塔',
    voxels: createGlassPavilion()
  },
  {
    id: 'rainbow_tower',
    nameJa: 'レインボータワー',
    descriptionJa: '高さ14段のカラフルな展望タワー',
    voxels: createRainbowTower()
  }
];

export function rotateBlueprintVoxels(
  voxels: BlueprintVoxel[],
  quarterTurns: 0 | 1 | 2 | 3
): BlueprintVoxel[] {
  const turns = ((quarterTurns % 4) + 4) % 4;
  if (turns === 0) return voxels;

  let maxX = 0;
  let maxZ = 0;
  for (const v of voxels) {
    if (v.dx > maxX) maxX = v.dx;
    if (v.dz > maxZ) maxZ = v.dz;
  }

  return voxels.map((v) => {
    let rx = v.dx;
    let rz = v.dz;
    let curMaxX = maxX;
    let curMaxZ = maxZ;
    for (let t = 0; t < turns; t++) {
      const nextX = curMaxZ - rz;
      const nextZ = rx;
      rx = nextX;
      rz = nextZ;
      const tmp = curMaxX;
      curMaxX = curMaxZ;
      curMaxZ = tmp;
    }
    return { dx: rx, dy: v.dy, dz: rz, blockId: v.blockId };
  });
}

export function getBlueprintPoolCost(
  blueprint: BlueprintDef
): Record<BlockPoolId, number> {
  const cost: Record<BlockPoolId, number> = { solid: 0, glass: 0, light: 0 };
  for (const v of blueprint.voxels) {
    const pool = BLOCKS[v.blockId].pool;
    cost[pool] = (cost[pool] ?? 0) + 1;
  }
  return cost;
}

/**
 * Stamps a rotated blueprint at (originX, originY, originZ), placing only into empty cells
 * within 12x48x12 and consuming from blockPools.
 */
export function applyBlueprintToVoxels(
  effectiveVoxels: Record<string, BlockId>,
  playerVoxels: Record<string, BlockId>,
  currentPools: Record<BlockPoolId, number>,
  blueprint: BlueprintDef,
  originX: number,
  originY: number,
  originZ: number,
  quarterTurns: 0 | 1 | 2 | 3 = 0
): {
  nextPlayerVoxels: Record<string, BlockId>;
  nextPools: Record<BlockPoolId, number>;
  placedCount: number;
} {
  const rotated = rotateBlueprintVoxels(blueprint.voxels, quarterTurns);
  const nextPlayerVoxels = { ...playerVoxels };
  const nextPools = { ...currentPools };
  let placedCount = 0;

  for (const v of rotated) {
    const x = originX + v.dx;
    const y = originY + v.dy;
    const z = originZ + v.dz;
    if (
      x < 0 ||
      x >= PLOT_VOXEL_XZ ||
      y < 0 ||
      y >= PLOT_VOXEL_Y ||
      z < 0 ||
      z >= PLOT_VOXEL_XZ
    ) {
      continue;
    }

    const key = voxelKey(x, y, z);
    if (effectiveVoxels[key] || nextPlayerVoxels[key]) continue;

    const pool = BLOCKS[v.blockId].pool;
    if ((nextPools[pool] ?? 0) <= 0) continue;

    nextPlayerVoxels[key] = v.blockId;
    nextPools[pool] -= 1;
    placedCount++;
  }

  return { nextPlayerVoxels, nextPools, placedCount };
}
