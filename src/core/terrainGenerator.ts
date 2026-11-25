import { sampleElevationMeters } from './elevationService';
import {
  PLOT_MERCATOR_SIZE,
  PLOT_VOXEL_XZ,
  mercatorToLngLat,
  plotCoordToCenterLngLat,
  plotSideLengthMeters,
  voxelKey
} from './geoGrid';
import type { BiomeType, BlockId } from './types';

export interface PlotElevationGrid {
  heights: number[]; // length 144 (z * 12 + x), meters rounded to 0.1m
  baseElevationM: number;
  elevationReliefM: number;
}

const MAX_TERRAIN_VOXEL_Y = 22;

function hashPlotCell(gx: number, gy: number, salt: number = 0): number {
  let h = (gx * 374761393 + gy * 668265263 + salt * 1442695041) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return (h ^ (h >> 16)) >>> 0;
}

/**
 * Samples a 12x12 elevation grid across plot (gx, gy) in meters.
 */
export function samplePlotElevationGrid(gx: number, gy: number): PlotElevationGrid {
  const heights: number[] = new Array(PLOT_VOXEL_XZ * PLOT_VOXEL_XZ);
  let minElev = Number.POSITIVE_INFINITY;
  let maxElev = Number.NEGATIVE_INFINITY;

  for (let z = 0; z < PLOT_VOXEL_XZ; z++) {
    const my = (gy + (z + 0.5) / PLOT_VOXEL_XZ) * PLOT_MERCATOR_SIZE;
    for (let x = 0; x < PLOT_VOXEL_XZ; x++) {
      const mx = (gx + (x + 0.5) / PLOT_VOXEL_XZ) * PLOT_MERCATOR_SIZE;
      const lngLat = mercatorToLngLat(mx, my);
      const elev = Math.round(sampleElevationMeters(lngLat.lng, lngLat.lat) * 10) / 10;
      heights[z * PLOT_VOXEL_XZ + x] = elev;
      if (elev < minElev) minElev = elev;
      if (elev > maxElev) maxElev = elev;
    }
  }

  return {
    heights,
    baseElevationM: Math.round(minElev * 10) / 10,
    elevationReliefM: Math.round((maxElev - minElev) * 10) / 10
  };
}

function addVoxelTree(
  voxels: Record<string, BlockId>,
  cx: number,
  groundY: number,
  cz: number,
  leafColor: BlockId
): void {
  if (groundY + 4 > MAX_TERRAIN_VOXEL_Y + 4) return;
  voxels[voxelKey(cx, groundY + 1, cz)] = 'brown';
  voxels[voxelKey(cx, groundY + 2, cz)] = 'brown';
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nx >= PLOT_VOXEL_XZ || nz < 0 || nz >= PLOT_VOXEL_XZ) continue;
      voxels[voxelKey(nx, groundY + 3, nz)] = leafColor;
      if (Math.abs(dx) + Math.abs(dz) <= 1) {
        voxels[voxelKey(nx, groundY + 4, nz)] = leafColor;
      }
    }
  }
}

/**
 * Generates actual solid-color voxel terrain + biome diorama features for plot (gx, gy).
 * Uses slope heights + cliff skirts without filling solid underground interiors.
 */
export function generatePlotTerrainVoxels(
  gx: number,
  gy: number,
  biome: BiomeType,
  heights: number[],
  baseElevationM: number
): Record<string, BlockId> {
  const center = plotCoordToCenterLngLat(gx, gy);
  const voxelMeters = Math.max(0.5, plotSideLengthMeters(center.lat) / PLOT_VOXEL_XZ);
  const voxels: Record<string, BlockId> = {};

  const topGrid: number[] = new Array(PLOT_VOXEL_XZ * PLOT_VOXEL_XZ);
  for (let z = 0; z < PLOT_VOXEL_XZ; z++) {
    for (let x = 0; x < PLOT_VOXEL_XZ; x++) {
      const elev = heights[z * PLOT_VOXEL_XZ + x] ?? baseElevationM;
      const h = Math.max(
        0,
        Math.min(MAX_TERRAIN_VOXEL_Y, Math.round((elev - baseElevationM) / voxelMeters))
      );
      topGrid[z * PLOT_VOXEL_XZ + x] = h;
    }
  }

  const plotHash = hashPlotCell(gx, gy, 1);

  for (let z = 0; z < PLOT_VOXEL_XZ; z++) {
    for (let x = 0; x < PLOT_VOXEL_XZ; x++) {
      const topY = topGrid[z * PLOT_VOXEL_XZ + x];

      // Determine skirt bottom so sloped cells never leave hollow cliff gaps
      let minAdj = topY;
      if (x === 0 || x === PLOT_VOXEL_XZ - 1 || z === 0 || z === PLOT_VOXEL_XZ - 1) {
        minAdj = 0;
      } else {
        minAdj = Math.min(
          topY,
          topGrid[z * PLOT_VOXEL_XZ + (x - 1)],
          topGrid[z * PLOT_VOXEL_XZ + (x + 1)],
          topGrid[(z - 1) * PLOT_VOXEL_XZ + x],
          topGrid[(z + 1) * PLOT_VOXEL_XZ + x]
        );
      }

      const subStart = Math.max(0, minAdj);
      const subBlock: BlockId =
        biome === 'mountain' || biome === 'urban' ? 'charcoal' : 'brown';

      for (let y = subStart; y < topY; y++) {
        voxels[voxelKey(x, y, z)] = subBlock;
      }

      // Surface block per biome
      const cellNoise = hashPlotCell(gx * 12 + x, gy * 12 + z, 7) % 10;
      let surfaceBlock: BlockId = 'lime';

      if (biome === 'park') {
        const isPath = x === 5 || z === 6;
        surfaceBlock = isPath ? 'sand' : cellNoise < 6 ? 'emerald' : 'lime';
      } else if (biome === 'water') {
        if (topY <= 1 && x >= 2 && x <= 9 && z >= 2 && z <= 9) {
          voxels[voxelKey(x, 0, z)] = 'sand';
          voxels[voxelKey(x, 1, z)] = 'glass';
          continue;
        }
        surfaceBlock = cellNoise < 5 ? 'sand' : 'emerald';
      } else if (biome === 'urban') {
        const isRoadBorder = x === 0 || z === 0;
        surfaceBlock = isRoadBorder ? 'charcoal' : 'gray';
      } else if (biome === 'residential') {
        const isLane = x === 6 || z === 6;
        surfaceBlock = isLane ? 'gray' : cellNoise < 4 ? 'lime' : 'sand';
      } else if (biome === 'mountain') {
        const prevY = x > 0 ? topGrid[z * PLOT_VOXEL_XZ + (x - 1)] : topY;
        const steep = Math.abs(topY - prevY) >= 1;
        surfaceBlock = steep ? 'gray' : cellNoise < 5 ? 'emerald' : 'teal';
      } else {
        surfaceBlock = cellNoise < 6 ? 'lime' : 'sand';
      }

      voxels[voxelKey(x, topY, z)] = surfaceBlock;
    }
  }

  // Biome surface micro-features (low & light so building stays clear)
  if (biome === 'park') {
    const t1x = 2 + (plotHash % 3);
    const t1z = 2 + ((plotHash >>> 3) % 3);
    addVoxelTree(voxels, t1x, topGrid[t1z * 12 + t1x], t1z, 'emerald');

    const t2x = 8 + ((plotHash >>> 6) % 2);
    const t2z = 8 + ((plotHash >>> 9) % 2);
    addVoxelTree(voxels, t2x, topGrid[t2z * 12 + t2x], t2z, 'lime');
  } else if (biome === 'mountain') {
    const px = 2 + (plotHash % 8);
    const pz = 2 + ((plotHash >>> 4) % 8);
    addVoxelTree(voxels, px, topGrid[pz * 12 + px], pz, 'teal');
  } else if (biome === 'urban') {
    // Low architectural foundation plinth on one corner
    const baseH = topGrid[2 * 12 + 2];
    for (let dx = 0; dx < 3; dx++) {
      for (let dz = 0; dz < 3; dz++) {
        voxels[voxelKey(2 + dx, baseH + 1, 2 + dz)] =
          dx === 1 && dz === 1 ? 'white' : 'gray';
      }
    }
    voxels[voxelKey(9, topGrid[9 * 12 + 9] + 1, 9)] = 'emerald';
  } else if (biome === 'residential') {
    const gx0 = 2;
    const gz0 = 2;
    const y0 = topGrid[gz0 * 12 + gx0];
    voxels[voxelKey(gx0, y0 + 1, gz0)] = 'emerald';
    voxels[voxelKey(gx0 + 1, y0 + 1, gz0)] = 'pink';
    voxels[voxelKey(gx0, y0 + 1, gz0 + 1)] = 'amber';
  } else if (biome === 'open') {
    const fx = 3 + (plotHash % 6);
    const fz = 3 + ((plotHash >>> 5) % 6);
    voxels[voxelKey(fx, topGrid[fz * 12 + fx] + 1, fz)] = 'amber';
  }

  return voxels;
}

/**
 * Merges generated terrain (minus player-carved cells) with player-placed voxels.
 */
export function composeEffectiveVoxels(
  terrainVoxels: Record<string, BlockId>,
  removedTerrainKeys: string[],
  playerVoxels: Record<string, BlockId>
): { voxels: Record<string, BlockId>; playerKeys: Set<string> } {
  const removedSet = new Set(removedTerrainKeys);
  const voxels: Record<string, BlockId> = {};

  for (const [k, blockId] of Object.entries(terrainVoxels)) {
    if (!removedSet.has(k)) {
      voxels[k] = blockId;
    }
  }

  const playerKeys = new Set<string>();
  for (const [k, blockId] of Object.entries(playerVoxels)) {
    voxels[k] = blockId;
    playerKeys.add(k);
  }

  return { voxels, playerKeys };
}
