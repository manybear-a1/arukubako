import { describe, expect, it } from 'vitest';
import { STARTER_BLOCK_POOLS, STARTER_MATERIALS } from '../../core/catalog';
import type { BackupPayload, PlayerState, PlotData } from '../../core/types';
import {
  IndexedDbWorldRepository,
  migrateSnapshotToV2,
  validateBackupPayload
} from '../indexedDbRepository';

describe('IndexedDbWorldRepository v2', () => {
  it('saves, loads, exports, and imports v2 world state cleanly', async () => {
    const repo = new IndexedDbWorldRepository();
    await repo.clearAll();

    const player: PlayerState = {
      schemaVersion: 2,
      ownerId: 'test-player',
      walkedMeters: 120,
      gatherProgressMeters: 15,
      totalBlocksPlaced: 4,
      materials: { ...STARTER_MATERIALS, wood: 10 },
      blockPools: { ...STARTER_BLOCK_POOLS },
      claimedMilestones: ['first_walk'],
      nodeCooldowns: {},
      lastPosition: { lng: 139.6952, lat: 35.6717 },
      timeOfDay: 'dusk'
    };

    const plot: PlotData = {
      schemaVersion: 2,
      plotId: '100:200',
      gx: 100,
      gy: 200,
      biome: 'mountain',
      unlockedAt: 1000,
      updatedAt: 2000,
      ownerId: 'test-player',
      voxels: { '1,10,1': 'red', '1,11,1': 'light_warm' },
      removedTerrainKeys: ['0,0,0'],
      baseElevationM: 185.2,
      elevationReliefM: 6.4
    };

    await repo.savePlayerState(player);
    await repo.savePlot(plot);

    const loaded = await repo.loadWorld();
    expect(loaded).not.toBeNull();
    expect(loaded!.player.schemaVersion).toBe(2);
    expect(loaded!.player.blockPools.solid).toBe(STARTER_BLOCK_POOLS.solid);
    expect(loaded!.plots['100:200'].voxels['1,11,1']).toBe('light_warm');
    expect(loaded!.plots['100:200'].removedTerrainKeys).toEqual(['0,0,0']);

    const backup = await repo.exportBackup();
    expect(backup.app).toBe('arukubako');
    expect(backup.schemaVersion).toBe(2);

    await repo.clearAll();
    expect(await repo.loadWorld()).toBeNull();

    const restored = await repo.importBackup(backup);
    expect(restored.player.ownerId).toBe('test-player');
    expect(restored.plots['100:200'].voxels['1,10,1']).toBe('red');
  });

  it('migrates legacy v1 snapshot seamlessly to v2 pools and blocks', () => {
    const v1Snapshot = {
      player: {
        schemaVersion: 1,
        ownerId: 'legacy-user',
        walkedMeters: 50,
        gatherProgressMeters: 0,
        totalBlocksPlaced: 2,
        materials: { wood: 2, stone: 3, clay: 1, glow: 1 },
        blocks: { timber: 10, chalk: 8, glass: 4, light: 2 },
        claimedMilestones: [],
        nodeCooldowns: {},
        lastPosition: { lng: 139.6952, lat: 35.6717 },
        timeOfDay: 'day'
      },
      plots: {
        '10:20': {
          schemaVersion: 1,
          plotId: '10:20',
          gx: 10,
          gy: 20,
          biome: 'park',
          unlockedAt: 100,
          updatedAt: 200,
          ownerId: 'legacy-user',
          voxels: { '0,0,0': 'timber', '0,1,0': 'light', '0,2,0': 'glass' }
        }
      }
    };

    const migrated = migrateSnapshotToV2(v1Snapshot);
    expect(migrated.player.schemaVersion).toBe(2);
    expect(migrated.player.blockPools).toEqual({ solid: 18, glass: 4, light: 2 });
    expect(migrated.plots['10:20'].voxels['0,0,0']).toBe('brown');
    expect(migrated.plots['10:20'].voxels['0,1,0']).toBe('light_warm');
    expect(migrated.plots['10:20'].voxels['0,2,0']).toBe('glass');
  });

  it('rejects invalid backup payloads', () => {
    expect(() => validateBackupPayload({ app: 'other' } as unknown as BackupPayload)).toThrow();
  });
});
