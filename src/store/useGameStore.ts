import { Capacitor } from '@capacitor/core';
import { create } from 'zustand';
import { fallbackBiomeForCoord, isMountainElevation } from '../core/biomeDetector';
import {
  BIOME_META,
  BLOCK_POOLS,
  CRAFT_RECIPES,
  MILESTONES,
  PASSIVE_GATHER_DISTANCE_M,
  PRESET_SPOTS,
  RARE_NODE_HARVEST_RADIUS_M,
  STARTER_BLOCK_POOLS,
  STARTER_MATERIALS,
  UNLOCK_RADIUS_M,
  applyCraft,
  formatMaterialSummary,
  rollBiomeGather
} from '../core/catalog';
import { ensureElevationTilesForPlotNeighborhood } from '../core/elevationService';
import {
  getPlotsInRadius,
  haversineMeters,
  lngLatToPlotCoord,
  makePlotId
} from '../core/geoGrid';
import {
  RARE_NODE_COOLDOWN_MS,
  canHarvestRareNode,
  getNearbyRareNodes
} from '../core/rareNodes';
import { samplePlotElevationGrid } from '../core/terrainGenerator';
import type {
  BackupPayload,
  BiomeType,
  BlockId,
  BlockPoolId,
  BuilderTool,
  GatherToast,
  LngLat,
  LocationMode,
  MilestoneId,
  PlayerState,
  PlotData,
  PlotId,
  RareNode,
  TimeOfDay
} from '../core/types';
import { IndexedDbWorldRepository } from '../storage/indexedDbRepository';
import type { WorldRepository } from '../storage/worldRepository';

const repository: WorldRepository = new IndexedDbWorldRepository();
const DEFAULT_START = PRESET_SPOTS[0].lngLat;

function createInitialPlayerState(): PlayerState {
  return {
    schemaVersion: 2,
    ownerId: 'local-player',
    walkedMeters: 0,
    gatherProgressMeters: 0,
    totalBlocksPlaced: 0,
    materials: { ...STARTER_MATERIALS },
    blockPools: { ...STARTER_BLOCK_POOLS },
    claimedMilestones: [],
    nodeCooldowns: {},
    lastPosition: { ...DEFAULT_START },
    timeOfDay: 'day'
  };
}

function resolvePlotBiome(
  suggestedBiome: BiomeType,
  baseElevationM: number,
  elevationReliefM: number
): BiomeType {
  if (
    suggestedBiome !== 'water' &&
    isMountainElevation({ baseElevationM, elevationReliefM })
  ) {
    return 'mountain';
  }
  return suggestedBiome;
}

function unlockPlotsAround(
  position: LngLat,
  biome: BiomeType,
  plots: Record<PlotId, PlotData>,
  ownerId: string,
  nowMs: number
): { nextPlots: Record<PlotId, PlotData>; newlyUnlocked: PlotData[] } {
  const coords = getPlotsInRadius(position, UNLOCK_RADIUS_M);
  let changed = false;
  const nextPlots = { ...plots };
  const newlyUnlocked: PlotData[] = [];

  for (const coord of coords) {
    const plotId = makePlotId(coord.gx, coord.gy);
    if (!nextPlots[plotId]) {
      const elev = samplePlotElevationGrid(coord.gx, coord.gy);
      const plotBiome = resolvePlotBiome(
        biome,
        elev.baseElevationM,
        elev.elevationReliefM
      );

      const plot: PlotData = {
        schemaVersion: 2,
        plotId,
        gx: coord.gx,
        gy: coord.gy,
        biome: plotBiome,
        unlockedAt: nowMs,
        updatedAt: nowMs,
        ownerId,
        voxels: {},
        removedTerrainKeys: [],
        baseElevationM: elev.baseElevationM,
        elevationReliefM: elev.elevationReliefM,
        terrainHeights: elev.heights
      };
      nextPlots[plotId] = plot;
      newlyUnlocked.push(plot);
      changed = true;
    }
  }

  return {
    nextPlots: changed ? nextPlots : plots,
    newlyUnlocked
  };
}

function evaluateMilestones(
  player: PlayerState,
  plots: Record<PlotId, PlotData>
): { nextPlayer: PlayerState; unlockedToasts: GatherToast[] } {
  const unlockedPlotsCount = Object.keys(plots).length;
  let changed = false;
  const claimed = new Set<MilestoneId>(player.claimedMilestones);
  const materials = { ...player.materials };
  const unlockedToasts: GatherToast[] = [];

  for (const m of MILESTONES) {
    if (claimed.has(m.id)) continue;
    const value =
      m.metric === 'walkedMeters'
        ? player.walkedMeters
        : m.metric === 'placedBlocks'
        ? player.totalBlocksPlaced
        : unlockedPlotsCount;

    if (value >= m.target) {
      claimed.add(m.id);
      changed = true;
      for (const [mat, qty] of Object.entries(m.rewardMaterials) as Array<
        [keyof typeof materials, number]
      >) {
        materials[mat] = (materials[mat] ?? 0) + qty;
      }
      const rewardText = formatMaterialSummary(m.rewardMaterials);
      const detailParts = [rewardText, m.unlockLabelJa].filter(Boolean).join(' / ');
      unlockedToasts.push({
        id: `ms-${m.id}-${Date.now()}-${Math.random()}`,
        titleJa: `実績達成: ${m.titleJa}`,
        detailJa: detailParts,
        accentColor: '#EF4444',
        createdAt: Date.now()
      });
    }
  }

  if (!changed) {
    return { nextPlayer: player, unlockedToasts };
  }

  return {
    nextPlayer: {
      ...player,
      materials,
      claimedMilestones: Array.from(claimed)
    },
    unlockedToasts
  };
}

export function getUnlockedBuilderTools(claimed: MilestoneId[]): Set<BuilderTool> {
  const tools = new Set<BuilderTool>(['place', 'break', 'pick']);
  for (const m of MILESTONES) {
    if (m.unlocksTool && claimed.includes(m.id)) {
      tools.add(m.unlocksTool);
    }
  }
  return tools;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSavePlayer(player: PlayerState): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void repository.savePlayerState(player);
  }, 400);
}

export interface GameStoreState {
  initialized: boolean;
  player: PlayerState;
  plots: Record<PlotId, PlotData>;
  currentBiome: BiomeType;
  headingDeg: number;
  locationMode: LocationMode;
  gpsError: string | null;
  screen: 'map' | 'build';
  activePlotId: PlotId | null;
  selectedPlotId: PlotId | null;
  virtualTarget: LngLat | null;
  nearbyNodes: RareNode[];
  toasts: GatherToast[];
  activeModal: null | 'craft' | 'milestones' | 'settings';
  focusMapTrigger: number;

  initialize: () => Promise<void>;
  refreshElevationAround: (lngLat: LngLat) => Promise<void>;
  setLocationMode: (mode: LocationMode) => void;
  setGpsError: (err: string | null) => void;
  setCurrentBiome: (biome: BiomeType) => void;
  setVirtualTarget: (target: LngLat | null) => void;
  teleportToSpot: (lngLat: LngLat, fallbackBiome: BiomeType) => void;
  updatePosition: (nextPos: LngLat, headingDeg: number, countDistance: boolean) => void;
  harvestRareNode: (nodeId: string) => void;
  walkToRareNode: (nodeId: string) => void;
  craftBlockPool: (recipeId: string, count?: number) => boolean;
  selectPlot: (plotId: PlotId | null) => void;
  openBuildMode: (plotId: PlotId) => void;
  closeBuildMode: () => void;
  savePlotEdits: (
    plotId: PlotId,
    voxels: Record<string, BlockId>,
    removedTerrainKeys: string[],
    nextBlockPools: Record<BlockPoolId, number>,
    placedDelta: number
  ) => Promise<void>;
  setTimeOfDay: (tod: TimeOfDay) => void;
  setActiveModal: (modal: null | 'craft' | 'milestones' | 'settings') => void;
  dismissToast: (id: string) => void;
  triggerFocusMap: () => void;
  exportBackupJson: () => Promise<string>;
  importBackupJson: (jsonText: string) => Promise<void>;
  resetWorld: () => Promise<void>;
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  initialized: false,
  player: createInitialPlayerState(),
  plots: {},
  currentBiome: 'park',
  headingDeg: 0,
  locationMode: Capacitor.isNativePlatform() ? 'gps' : 'virtual',
  gpsError: null,
  screen: 'map',
  activePlotId: null,
  selectedPlotId: null,
  virtualTarget: null,
  nearbyNodes: [],
  toasts: [],
  activeModal: null,
  focusMapTrigger: 0,

  initialize: async () => {
    if (get().initialized) return;
    const loaded = await repository.loadWorld();
    const now = Date.now();

    let player = loaded?.player ?? createInitialPlayerState();
    let plots = loaded?.plots ?? {};
    const biome = fallbackBiomeForCoord(
      player.lastPosition.lng,
      player.lastPosition.lat
    );

    const unlocked = unlockPlotsAround(
      player.lastPosition,
      biome,
      plots,
      player.ownerId,
      now
    );
    plots = unlocked.nextPlots;

    const evaluated = evaluateMilestones(player, plots);
    player = evaluated.nextPlayer;

    const nearbyNodes = getNearbyRareNodes(
      player.lastPosition,
      player.nodeCooldowns,
      now
    );

    set({
      initialized: true,
      player,
      plots,
      currentBiome: biome,
      nearbyNodes,
      focusMapTrigger: 1
    });

    await repository.savePlayerState(player);
    for (const p of unlocked.newlyUnlocked) {
      await repository.savePlot(p);
    }

    // Asynchronously refine elevation from real AWS Terrarium DEM tiles
    void get().refreshElevationAround(player.lastPosition);
  },

  refreshElevationAround: async (lngLat) => {
    const centerCoord = lngLatToPlotCoord(lngLat.lng, lngLat.lat);
    const loadedNew = await ensureElevationTilesForPlotNeighborhood(
      centerCoord.gx,
      centerCoord.gy,
      3
    );
    if (!loadedNew) return;

    const state = get();
    let anyUpdated = false;
    const nextPlots = { ...state.plots };
    const updatedList: PlotData[] = [];
    const now = Date.now();

    for (const [plotId, plot] of Object.entries(state.plots)) {
      if (
        Math.abs(plot.gx - centerCoord.gx) <= 4 &&
        Math.abs(plot.gy - centerCoord.gy) <= 4
      ) {
        const elev = samplePlotElevationGrid(plot.gx, plot.gy);
        const diff =
          Math.abs(elev.baseElevationM - plot.baseElevationM) +
          Math.abs(elev.elevationReliefM - plot.elevationReliefM);
        if (diff > 0.25) {
          const nextBiome = resolvePlotBiome(
            plot.biome,
            elev.baseElevationM,
            elev.elevationReliefM
          );
          const updated: PlotData = {
            ...plot,
            biome: nextBiome,
            baseElevationM: elev.baseElevationM,
            elevationReliefM: elev.elevationReliefM,
            terrainHeights: elev.heights,
            updatedAt: now
          };
          nextPlots[plotId] = updated;
          updatedList.push(updated);
          anyUpdated = true;
        }
      }
    }

    if (anyUpdated) {
      set({ plots: nextPlots });
      for (const p of updatedList) {
        void repository.savePlot(p);
      }
    }
  },

  setLocationMode: (mode) => {
    set({
      locationMode: mode,
      gpsError: null,
      virtualTarget: null
    });
  },

  setGpsError: (err) => set({ gpsError: err }),

  setCurrentBiome: (biome) => {
    if (get().currentBiome !== biome) {
      set({ currentBiome: biome });
    }
  },

  setVirtualTarget: (target) => set({ virtualTarget: target }),

  teleportToSpot: (lngLat, fallbackBiome) => {
    const now = Date.now();
    const state = get();
    const unlocked = unlockPlotsAround(
      lngLat,
      fallbackBiome,
      state.plots,
      state.player.ownerId,
      now
    );

    let nextPlayer: PlayerState = {
      ...state.player,
      lastPosition: { ...lngLat }
    };
    const evaluated = evaluateMilestones(nextPlayer, unlocked.nextPlots);
    nextPlayer = evaluated.nextPlayer;

    const nearbyNodes = getNearbyRareNodes(lngLat, nextPlayer.nodeCooldowns, now);

    set((prev) => ({
      player: nextPlayer,
      plots: unlocked.nextPlots,
      currentBiome: fallbackBiome,
      virtualTarget: null,
      selectedPlotId: null,
      nearbyNodes,
      focusMapTrigger: prev.focusMapTrigger + 1,
      toasts: [...prev.toasts, ...evaluated.unlockedToasts].slice(-3)
    }));

    void repository.savePlayerState(nextPlayer);
    for (const p of unlocked.newlyUnlocked) {
      void repository.savePlot(p);
    }
    void get().refreshElevationAround(lngLat);
  },

  updatePosition: (nextPos, headingDeg, countDistance) => {
    const now = Date.now();
    const state = get();
    const prevPos = state.player.lastPosition;
    const stepMeters = countDistance ? haversineMeters(prevPos, nextPos) : 0;

    const walkedMeters = state.player.walkedMeters + stepMeters;
    let gatherProgress = state.player.gatherProgressMeters + stepMeters;
    const nextMaterials = { ...state.player.materials };
    const newToasts: GatherToast[] = [];

    while (gatherProgress >= PASSIVE_GATHER_DISTANCE_M) {
      gatherProgress -= PASSIVE_GATHER_DISTANCE_M;
      const rewards = rollBiomeGather(state.currentBiome);
      for (const [mat, qty] of Object.entries(rewards) as Array<
        [keyof typeof nextMaterials, number]
      >) {
        nextMaterials[mat] = (nextMaterials[mat] ?? 0) + qty;
      }
      newToasts.push({
        id: `gather-${now}-${Math.random()}`,
        titleJa: `${BIOME_META[state.currentBiome].nameJa}で採集`,
        detailJa: formatMaterialSummary(rewards),
        accentColor: BIOME_META[state.currentBiome].badgeColor,
        createdAt: now
      });
    }

    const unlocked = unlockPlotsAround(
      nextPos,
      state.currentBiome,
      state.plots,
      state.player.ownerId,
      now
    );

    if (unlocked.newlyUnlocked.length > 0) {
      newToasts.push({
        id: `unlock-${now}-${Math.random()}`,
        titleJa: '新しい区画を解放！',
        detailJa: `${unlocked.newlyUnlocked.length}区画で建築できるようになりました`,
        accentColor: '#10B981',
        createdAt: now
      });
    }

    let nextPlayer: PlayerState = {
      ...state.player,
      walkedMeters,
      gatherProgressMeters: gatherProgress,
      materials: nextMaterials,
      lastPosition: { ...nextPos }
    };

    const evaluated = evaluateMilestones(nextPlayer, unlocked.nextPlots);
    nextPlayer = evaluated.nextPlayer;

    const nearbyNodes = getNearbyRareNodes(nextPos, nextPlayer.nodeCooldowns, now);

    set((prev) => ({
      player: nextPlayer,
      plots: unlocked.nextPlots,
      headingDeg,
      nearbyNodes,
      toasts: [...prev.toasts, ...newToasts, ...evaluated.unlockedToasts].slice(-3)
    }));

    scheduleSavePlayer(nextPlayer);
    if (unlocked.newlyUnlocked.length > 0) {
      for (const p of unlocked.newlyUnlocked) {
        void repository.savePlot(p);
      }
      void get().refreshElevationAround(nextPos);
    }
  },

  harvestRareNode: (nodeId) => {
    const now = Date.now();
    const state = get();
    const node = state.nearbyNodes.find((n) => n.id === nodeId);
    if (!node) return;

    const check = canHarvestRareNode(
      node,
      state.player.lastPosition,
      RARE_NODE_HARVEST_RADIUS_M,
      now
    );
    if (!check.ok) {
      const msg =
        check.reason === 'cooldown'
          ? 'このスポットは再生成待ちです'
          : `あと ${Math.ceil(check.distanceMeters - RARE_NODE_HARVEST_RADIUS_M)}m 近づくと採集できます`;
      set((prev) => ({
        toasts: [
          ...prev.toasts,
          {
            id: `node-warn-${now}`,
            titleJa: node.titleJa,
            detailJa: msg,
            accentColor: '#64748B',
            createdAt: now
          }
        ].slice(-3)
      }));
      return;
    }

    const nextMaterials = { ...state.player.materials };
    for (const [mat, qty] of Object.entries(node.rewards) as Array<
      [keyof typeof nextMaterials, number]
    >) {
      nextMaterials[mat] = (nextMaterials[mat] ?? 0) + qty;
    }

    const nextCooldowns = {
      ...state.player.nodeCooldowns,
      [node.id]: now + RARE_NODE_COOLDOWN_MS
    };

    const nextPlayer: PlayerState = {
      ...state.player,
      materials: nextMaterials,
      nodeCooldowns: nextCooldowns
    };

    const nearbyNodes = getNearbyRareNodes(
      nextPlayer.lastPosition,
      nextCooldowns,
      now
    );

    set((prev) => ({
      player: nextPlayer,
      nearbyNodes,
      toasts: [
        ...prev.toasts,
        {
          id: `node-ok-${now}`,
          titleJa: `${node.titleJa}を採集！`,
          detailJa: formatMaterialSummary(node.rewards),
          accentColor: node.color,
          createdAt: now
        }
      ].slice(-3)
    }));

    void repository.savePlayerState(nextPlayer);
  },

  walkToRareNode: (nodeId) => {
    const state = get();
    const node = state.nearbyNodes.find((n) => n.id === nodeId);
    if (!node) return;
    const now = Date.now();
    set((prev) => ({
      virtualTarget: node.lngLat,
      toasts: [
        ...prev.toasts,
        {
          id: `walk-node-${now}`,
          titleJa: node.titleJa,
          detailJa: 'このピンに向かって歩きます',
          accentColor: node.color,
          createdAt: now
        }
      ].slice(-3)
    }));
  },

  craftBlockPool: (recipeId, count = 1) => {
    const state = get();
    const recipe = CRAFT_RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return false;
    const crafted = applyCraft(
      state.player.materials,
      state.player.blockPools,
      recipe,
      count
    );
    if (!crafted) return false;

    const nextPlayer: PlayerState = {
      ...state.player,
      materials: crafted.materials,
      blockPools: crafted.blockPools
    };

    const poolMeta = BLOCK_POOLS[recipe.pool];
    set((prev) => ({
      player: nextPlayer,
      toasts: [
        ...prev.toasts,
        {
          id: `craft-${Date.now()}-${Math.random()}`,
          titleJa: 'クラフト完了',
          detailJa: `${poolMeta.nameJa} +${recipe.outputCount * count}`,
          accentColor: poolMeta.color,
          createdAt: Date.now()
        }
      ].slice(-3)
    }));

    void repository.savePlayerState(nextPlayer);
    return true;
  },

  selectPlot: (plotId) => set({ selectedPlotId: plotId }),

  openBuildMode: (plotId) => {
    const plot = get().plots[plotId];
    if (!plot) return;
    set({
      screen: 'build',
      activePlotId: plotId,
      selectedPlotId: plotId,
      activeModal: null,
      virtualTarget: null
    });
  },

  closeBuildMode: () => {
    set({
      screen: 'map',
      activePlotId: null
    });
  },

  savePlotEdits: async (
    plotId,
    voxels,
    removedTerrainKeys,
    nextBlockPools,
    placedDelta
  ) => {
    const state = get();
    const existing = state.plots[plotId];
    if (!existing) return;

    const now = Date.now();
    const updatedPlot: PlotData = {
      ...existing,
      updatedAt: now,
      voxels: { ...voxels },
      removedTerrainKeys: [...removedTerrainKeys]
    };

    const nextPlots: Record<PlotId, PlotData> = {
      ...state.plots,
      [plotId]: updatedPlot
    };

    let nextPlayer: PlayerState = {
      ...state.player,
      blockPools: { ...nextBlockPools },
      totalBlocksPlaced: state.player.totalBlocksPlaced + Math.max(0, placedDelta)
    };

    const evaluated = evaluateMilestones(nextPlayer, nextPlots);
    nextPlayer = evaluated.nextPlayer;

    set((prev) => ({
      plots: nextPlots,
      player: nextPlayer,
      screen: 'map',
      activePlotId: null,
      selectedPlotId: plotId,
      toasts: [
        ...prev.toasts,
        {
          id: `build-save-${now}`,
          titleJa: '建築を地図へ保存しました',
          detailJa: `設置ブロック: ${Object.keys(voxels).length}個`,
          accentColor: '#2563EB',
          createdAt: now
        },
        ...evaluated.unlockedToasts
      ].slice(-3)
    }));

    await repository.savePlot(updatedPlot);
    await repository.savePlayerState(nextPlayer);
  },

  setTimeOfDay: (tod) => {
    const nextPlayer = { ...get().player, timeOfDay: tod };
    set({ player: nextPlayer });
    scheduleSavePlayer(nextPlayer);
  },

  setActiveModal: (modal) => set({ activeModal: modal }),

  dismissToast: (id) =>
    set((prev) => ({ toasts: prev.toasts.filter((t) => t.id !== id) })),

  triggerFocusMap: () =>
    set((prev) => ({ focusMapTrigger: prev.focusMapTrigger + 1 })),

  exportBackupJson: async () => {
    const state = get();
    await repository.savePlayerState(state.player);
    for (const plot of Object.values(state.plots)) {
      await repository.savePlot(plot);
    }
    const payload = await repository.exportBackup();
    return JSON.stringify(payload, null, 2);
  },

  importBackupJson: async (jsonText) => {
    const parsed = JSON.parse(jsonText) as BackupPayload;
    const restored = await repository.importBackup(parsed);
    const now = Date.now();
    const biome = fallbackBiomeForCoord(
      restored.player.lastPosition.lng,
      restored.player.lastPosition.lat
    );
    const nearbyNodes = getNearbyRareNodes(
      restored.player.lastPosition,
      restored.player.nodeCooldowns,
      now
    );

    set((prev) => ({
      player: restored.player,
      plots: restored.plots,
      currentBiome: biome,
      nearbyNodes,
      selectedPlotId: null,
      activePlotId: null,
      screen: 'map',
      activeModal: null,
      focusMapTrigger: prev.focusMapTrigger + 1,
      toasts: [
        ...prev.toasts,
        {
          id: `import-${now}`,
          titleJa: 'セーブデータを復元しました',
          detailJa: `解放区画: ${Object.keys(restored.plots).length}`,
          accentColor: '#10B981',
          createdAt: now
        }
      ].slice(-3)
    }));
  },

  resetWorld: async () => {
    await repository.clearAll();
    const now = Date.now();
    const player = createInitialPlayerState();
    const biome = fallbackBiomeForCoord(
      player.lastPosition.lng,
      player.lastPosition.lat
    );
    const unlocked = unlockPlotsAround(
      player.lastPosition,
      biome,
      {},
      player.ownerId,
      now
    );
    const nearbyNodes = getNearbyRareNodes(
      player.lastPosition,
      player.nodeCooldowns,
      now
    );

    set((prev) => ({
      player,
      plots: unlocked.nextPlots,
      currentBiome: biome,
      nearbyNodes,
      selectedPlotId: null,
      activePlotId: null,
      screen: 'map',
      activeModal: null,
      focusMapTrigger: prev.focusMapTrigger + 1,
      toasts: [
        {
          id: `reset-${now}`,
          titleJa: 'ワールドを初期化しました',
          detailJa: '新しい散歩と建築を始めましょう',
          accentColor: '#EF4444',
          createdAt: now
        }
      ]
    }));

    await repository.savePlayerState(player);
    for (const p of unlocked.newlyUnlocked) {
      await repository.savePlot(p);
    }
    void get().refreshElevationAround(player.lastPosition);
  }
}));
