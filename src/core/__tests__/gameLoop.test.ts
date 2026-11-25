import { describe, expect, it } from 'vitest';
import {
  BLUEPRINTS,
  applyBlueprintToVoxels,
  getBlueprintPoolCost,
  rotateBlueprintVoxels
} from '../blueprints';
import {
  BLOCKS,
  CRAFT_RECIPES,
  STARTER_BLOCK_POOLS,
  STARTER_MATERIALS,
  applyCraft,
  canCraft,
  rollBiomeGather
} from '../catalog';
import { canHarvestRareNode, findNearestReadyNode, getNearbyRareNodes } from '../rareNodes';

describe('gameLoop v2 core mechanics', () => {
  it('rolls biome-weighted material gathers including mountain', () => {
    const gatherSweep = (biome: 'park' | 'water' | 'urban' | 'mountain') => {
      const totals = { wood: 0, stone: 0, clay: 0, glow: 0 };
      for (let i = 0; i < 100; i++) {
        let call = 0;
        const roll = rollBiomeGather(biome, () => {
          call++;
          return call === 1 ? 0.5 : (i / 100 + call * 0.13) % 1;
        });
        totals.wood += roll.wood ?? 0;
        totals.stone += roll.stone ?? 0;
        totals.clay += roll.clay ?? 0;
        totals.glow += roll.glow ?? 0;
      }
      return totals;
    };

    const parkTotals = gatherSweep('park');
    expect(parkTotals.wood).toBeGreaterThan(parkTotals.stone);

    const waterTotals = gatherSweep('water');
    expect(waterTotals.clay).toBeGreaterThan(waterTotals.wood);

    const mountainTotals = gatherSweep('mountain');
    expect(mountainTotals.stone).toBeGreaterThan(mountainTotals.clay);
  });

  it('crafts into the 3 block pools and unlocks all 19 vivid block colors', () => {
    expect(Object.keys(BLOCKS)).toHaveLength(19);

    const solidRecipe = CRAFT_RECIPES.find((r) => r.id === 'solid_bulk')!;
    expect(canCraft(STARTER_MATERIALS, solidRecipe, 1)).toBe(true);

    const res = applyCraft(STARTER_MATERIALS, STARTER_BLOCK_POOLS, solidRecipe, 1);
    expect(res).not.toBeNull();
    expect(res!.blockPools.solid).toBe(STARTER_BLOCK_POOLS.solid + 24);
    expect(res!.materials.wood).toBe(STARTER_MATERIALS.wood - 1);
    expect(res!.materials.stone).toBe(STARTER_MATERIALS.stone - 1);
    expect(res!.materials.clay).toBe(STARTER_MATERIALS.clay - 1);

    expect(applyCraft(STARTER_MATERIALS, STARTER_BLOCK_POOLS, solidRecipe, 99)).toBeNull();
  });

  it('guarantees nearby rare node spawning and finds nearest ready node with bearing', () => {
    const pos = { lng: 139.6952, lat: 35.6717 };
    const now = 1_700_000_000_000;
    const nodes = getNearbyRareNodes(pos, {}, now, 450);
    expect(nodes.length).toBeGreaterThan(0);

    const nearest = findNearestReadyNode(nodes, pos, now);
    expect(nearest).not.toBeNull();
    expect(nearest!.distanceMeters).toBeLessThan(120);
    expect(nearest!.bearingDeg).toBeGreaterThanOrEqual(0);
    expect(nearest!.bearingDeg).toBeLessThan(360);

    const first = nearest!.node;
    expect(canHarvestRareNode(first, first.lngLat, 50, now).ok).toBe(true);
  });

  it('rotates blueprints and deducts 3-pool costs cleanly', () => {
    const towerBp = BLUEPRINTS.find((b) => b.id === 'rainbow_tower')!;
    const cost = getBlueprintPoolCost(towerBp);
    expect(cost.solid).toBeGreaterThan(0);
    expect(cost.glass).toBeGreaterThan(0);
    expect(cost.light).toBeGreaterThan(0);

    const rotated1 = rotateBlueprintVoxels(towerBp.voxels, 1);
    expect(rotated1).toHaveLength(towerBp.voxels.length);

    const res = applyBlueprintToVoxels(
      {},
      {},
      { solid: 120, glass: 40, light: 10 },
      towerBp,
      2,
      10,
      2,
      1
    );
    expect(res.placedCount).toBe(towerBp.voxels.length);
    expect(res.nextPools.solid).toBe(120 - cost.solid);
    expect(res.nextPools.glass).toBe(40 - cost.glass);
    expect(res.nextPools.light).toBe(10 - cost.light);
  });
});
