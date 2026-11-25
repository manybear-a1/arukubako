import { BLOCKS, STARTER_BLOCK_POOLS } from '../core/catalog';
import { samplePlotElevationGrid } from '../core/terrainGenerator';
import type {
  BackupPayload,
  BlockId,
  BlockPoolId,
  PlayerState,
  PlotData,
  PlotId,
  WorldSnapshot
} from '../core/types';
import type { WorldRepository } from './worldRepository';

const DB_NAME = 'arukubako-db';
const DB_VERSION = 1;
const STORE_META = 'meta';
const STORE_PLOTS = 'plots';
const PLAYER_KEY = 'player_state';
const LS_FALLBACK_KEY = 'arukubako_world_backup_v2';
const LS_LEGACY_KEY = 'arukubako_world_backup_v1';

const LEGACY_BLOCK_MAP: Record<string, BlockId> = {
  timber: 'brown',
  foliage: 'emerald',
  limestone: 'gray',
  slate: 'charcoal',
  terracotta: 'orange',
  chalk: 'white',
  coral: 'pink',
  mustard: 'amber',
  glass: 'glass',
  light: 'light_warm'
};

function mapBlockId(rawId: string): BlockId {
  if (rawId in BLOCKS) return rawId as BlockId;
  return LEGACY_BLOCK_MAP[rawId] ?? 'white';
}

export function migrateSnapshotToV2(raw: unknown): WorldSnapshot {
  const obj = raw as {
    player?: Partial<PlayerState> & {
      schemaVersion?: number;
      blocks?: Record<string, number>;
    };
    plots?: Record<
      string,
      Partial<PlotData> & {
        schemaVersion?: number;
        voxels?: Record<string, string>;
      }
    >;
  };

  if (!obj || !obj.player || !obj.plots) {
    throw new Error('セーブデータの形式が不正です。');
  }

  const p = obj.player;
  let blockPools: Record<BlockPoolId, number>;

  if (p.blockPools && typeof p.blockPools.solid === 'number') {
    blockPools = {
      solid: p.blockPools.solid ?? STARTER_BLOCK_POOLS.solid,
      glass: p.blockPools.glass ?? STARTER_BLOCK_POOLS.glass,
      light: p.blockPools.light ?? STARTER_BLOCK_POOLS.light
    };
  } else if (p.blocks) {
    const pools: Record<BlockPoolId, number> = { solid: 0, glass: 0, light: 0 };
    for (const [id, count] of Object.entries(p.blocks)) {
      const qty = typeof count === 'number' ? count : 0;
      if (id === 'glass') {
        pools.glass += qty;
      } else if (id === 'light' || id === 'light_warm' || id === 'light_cyan') {
        pools.light += qty;
      } else {
        pools.solid += qty;
      }
    }
    blockPools = pools;
  } else {
    blockPools = { ...STARTER_BLOCK_POOLS };
  }

  const player: PlayerState = {
    schemaVersion: 2,
    ownerId: p.ownerId ?? 'local-player',
    walkedMeters: p.walkedMeters ?? 0,
    gatherProgressMeters: p.gatherProgressMeters ?? 0,
    totalBlocksPlaced: p.totalBlocksPlaced ?? 0,
    materials: {
      wood: p.materials?.wood ?? 0,
      stone: p.materials?.stone ?? 0,
      clay: p.materials?.clay ?? 0,
      glow: p.materials?.glow ?? 0
    },
    blockPools,
    claimedMilestones: Array.isArray(p.claimedMilestones) ? p.claimedMilestones : [],
    nodeCooldowns: p.nodeCooldowns ?? {},
    lastPosition: p.lastPosition ?? { lng: 139.6952, lat: 35.6717 },
    timeOfDay: p.timeOfDay ?? 'day'
  };

  const plots: Record<PlotId, PlotData> = {};
  for (const [plotId, rawPlot] of Object.entries(obj.plots)) {
    if (!rawPlot || typeof rawPlot.gx !== 'number' || typeof rawPlot.gy !== 'number') {
      continue;
    }

    const mappedVoxels: Record<string, BlockId> = {};
    if (rawPlot.voxels) {
      for (const [vk, bid] of Object.entries(rawPlot.voxels)) {
        mappedVoxels[vk] = mapBlockId(bid);
      }
    }

    let baseElevationM = rawPlot.baseElevationM;
    let elevationReliefM = rawPlot.elevationReliefM;
    let terrainHeights = rawPlot.terrainHeights;

    if (
      typeof baseElevationM !== 'number' ||
      typeof elevationReliefM !== 'number' ||
      !Array.isArray(terrainHeights)
    ) {
      const sampled = samplePlotElevationGrid(rawPlot.gx, rawPlot.gy);
      terrainHeights = sampled.heights;
      baseElevationM = sampled.baseElevationM;
      elevationReliefM = sampled.elevationReliefM;
    }

    plots[plotId] = {
      schemaVersion: 2,
      plotId: rawPlot.plotId ?? plotId,
      gx: rawPlot.gx,
      gy: rawPlot.gy,
      biome: rawPlot.biome ?? 'open',
      unlockedAt: rawPlot.unlockedAt ?? Date.now(),
      updatedAt: rawPlot.updatedAt ?? Date.now(),
      ownerId: rawPlot.ownerId ?? player.ownerId,
      voxels: mappedVoxels,
      removedTerrainKeys: Array.isArray(rawPlot.removedTerrainKeys)
        ? rawPlot.removedTerrainKeys
        : [],
      baseElevationM,
      elevationReliefM,
      terrainHeights
    };
  }

  return { player, plots };
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
      if (!db.objectStoreNames.contains(STORE_PLOTS)) {
        db.createObjectStore(STORE_PLOTS, { keyPath: 'plotId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open error'));
  });
}

function readLsSnapshot(): WorldSnapshot | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw =
      localStorage.getItem(LS_FALLBACK_KEY) ?? localStorage.getItem(LS_LEGACY_KEY);
    if (!raw) return null;
    return migrateSnapshotToV2(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeLsSnapshot(snapshot: WorldSnapshot): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore storage quota errors
  }
}

export function validateBackupPayload(input: unknown): BackupPayload {
  if (!input || typeof input !== 'object') {
    throw new Error('バックアップデータの形式が正しくありません。');
  }
  const obj = input as Partial<BackupPayload>;
  if (
    obj.app !== 'arukubako' ||
    (obj.schemaVersion !== 1 && obj.schemaVersion !== 2) ||
    !obj.snapshot
  ) {
    throw new Error('アルクバコの有効なバックアップファイルではありません。');
  }
  const migrated = migrateSnapshotToV2(obj.snapshot);
  return {
    app: 'arukubako',
    schemaVersion: 2,
    exportedAt: obj.exportedAt ?? Date.now(),
    snapshot: migrated
  };
}

export class IndexedDbWorldRepository implements WorldRepository {
  private memoryFallback: WorldSnapshot | null = null;

  public async loadWorld(): Promise<WorldSnapshot | null> {
    if (!hasIndexedDb()) {
      return readLsSnapshot() ?? this.memoryFallback;
    }

    try {
      const db = await openDb();
      const rawPlayer = await new Promise<unknown>((resolve, reject) => {
        const tx = db.transaction(STORE_META, 'readonly');
        const req = tx.objectStore(STORE_META).get(PLAYER_KEY);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });

      if (!rawPlayer) {
        db.close();
        return readLsSnapshot();
      }

      const plotList = await new Promise<unknown[]>((resolve, reject) => {
        const tx = db.transaction(STORE_PLOTS, 'readonly');
        const req = tx.objectStore(STORE_PLOTS).getAll();
        req.onsuccess = () => resolve((req.result as unknown[]) ?? []);
        req.onerror = () => reject(req.error);
      });
      db.close();

      const plotRecord: Record<string, unknown> = {};
      for (const p of plotList) {
        const pid = (p as { plotId?: string }).plotId;
        if (pid) plotRecord[pid] = p;
      }
      return migrateSnapshotToV2({ player: rawPlayer, plots: plotRecord });
    } catch {
      return readLsSnapshot() ?? this.memoryFallback;
    }
  }

  public async savePlayerState(player: PlayerState): Promise<void> {
    const ls = readLsSnapshot();
    const base: WorldSnapshot = ls ?? this.memoryFallback ?? { player, plots: {} };
    const updated: WorldSnapshot = { ...base, player };
    this.memoryFallback = updated;
    writeLsSnapshot(updated);

    if (!hasIndexedDb()) return;

    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_META, 'readwrite');
        tx.objectStore(STORE_META).put(player, PLAYER_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch {
      // Fallback already persisted above
    }
  }

  public async savePlot(plot: PlotData): Promise<void> {
    const ls = readLsSnapshot();
    if (ls) {
      ls.plots[plot.plotId] = plot;
      writeLsSnapshot(ls);
    }
    if (this.memoryFallback) {
      this.memoryFallback.plots[plot.plotId] = plot;
    }

    if (!hasIndexedDb()) return;

    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_PLOTS, 'readwrite');
        tx.objectStore(STORE_PLOTS).put(plot);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch {
      // Fallback already persisted above
    }
  }

  public async deletePlot(plotId: PlotId): Promise<void> {
    const ls = readLsSnapshot();
    if (ls) {
      delete ls.plots[plotId];
      writeLsSnapshot(ls);
    }
    if (this.memoryFallback) {
      delete this.memoryFallback.plots[plotId];
    }

    if (!hasIndexedDb()) return;

    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_PLOTS, 'readwrite');
        tx.objectStore(STORE_PLOTS).delete(plotId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch {
      // ignore
    }
  }

  public async clearAll(): Promise<void> {
    this.memoryFallback = null;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(LS_FALLBACK_KEY);
        localStorage.removeItem(LS_LEGACY_KEY);
      }
    } catch {
      // ignore
    }

    if (!hasIndexedDb()) return;

    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([STORE_META, STORE_PLOTS], 'readwrite');
        tx.objectStore(STORE_META).clear();
        tx.objectStore(STORE_PLOTS).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch {
      // ignore
    }
  }

  public async exportBackup(): Promise<BackupPayload> {
    const snapshot = await this.loadWorld();
    if (!snapshot) {
      throw new Error('保存されたワールドデータが見つかりません。');
    }
    return {
      app: 'arukubako',
      schemaVersion: 2,
      exportedAt: Date.now(),
      snapshot
    };
  }

  public async importBackup(payload: BackupPayload): Promise<WorldSnapshot> {
    const validated = validateBackupPayload(payload);
    await this.clearAll();
    const { player, plots } = validated.snapshot;
    this.memoryFallback = { player, plots: { ...plots } };
    writeLsSnapshot(this.memoryFallback);

    if (hasIndexedDb()) {
      try {
        const db = await openDb();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction([STORE_META, STORE_PLOTS], 'readwrite');
          tx.objectStore(STORE_META).put(player, PLAYER_KEY);
          const plotStore = tx.objectStore(STORE_PLOTS);
          for (const plot of Object.values(plots)) {
            plotStore.put(plot);
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      } catch {
        // Fallback already persisted above
      }
    }

    return { player, plots: { ...plots } };
  }
}
