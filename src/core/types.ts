export interface LngLat {
  lng: number;
  lat: number;
}

export interface PlotCoord {
  gx: number;
  gy: number;
}

export type PlotId = string; // `${gx}:${gy}`

export interface VoxelCoord {
  x: number; // 0..11
  y: number; // 0..47 (height)
  z: number; // 0..11
}

export type BiomeType =
  | 'park'
  | 'water'
  | 'urban'
  | 'residential'
  | 'mountain'
  | 'open';

export type MaterialId = 'wood' | 'stone' | 'clay' | 'glow';

export type BlockPoolId = 'solid' | 'glass' | 'light';

export type BlockId =
  | 'red'
  | 'orange'
  | 'amber'
  | 'lime'
  | 'emerald'
  | 'teal'
  | 'sky'
  | 'cobalt'
  | 'indigo'
  | 'purple'
  | 'pink'
  | 'brown'
  | 'sand'
  | 'white'
  | 'gray'
  | 'charcoal'
  | 'glass'
  | 'light_warm'
  | 'light_cyan';

export interface MaterialDef {
  id: MaterialId;
  nameJa: string;
  color: string;
  descriptionJa: string;
}

export interface BlockPoolDef {
  id: BlockPoolId;
  nameJa: string;
  color: string;
  descriptionJa: string;
}

export interface BlockDef {
  id: BlockId;
  pool: BlockPoolId;
  nameJa: string;
  color: string;
  translucent?: boolean;
  emissive?: boolean;
}

export interface CraftRecipe {
  id: string;
  pool: BlockPoolId;
  nameJa: string;
  outputCount: number;
  ingredients: Partial<Record<MaterialId, number>>;
}

export interface PlotData {
  schemaVersion: 2;
  plotId: PlotId;
  gx: number;
  gy: number;
  biome: BiomeType;
  unlockedAt: number;
  updatedAt: number;
  ownerId: string;
  voxels: Record<string, BlockId>;
  removedTerrainKeys: string[];
  baseElevationM: number;
  elevationReliefM: number;
  terrainHeights?: number[];
}

export interface RareNode {
  id: string;
  titleJa: string;
  biomeHint: BiomeType;
  lngLat: LngLat;
  color: string;
  rewards: Partial<Record<MaterialId, number>>;
  cooldownUntil: number;
}

export type MilestoneId =
  | 'first_walk'
  | 'builder_20'
  | 'explorer_5'
  | 'walker_250'
  | 'master_100';

export type BuilderTool =
  | 'place'
  | 'break'
  | 'pick'
  | 'line'
  | 'fill'
  | 'blueprint';

export interface MilestoneDef {
  id: MilestoneId;
  titleJa: string;
  descriptionJa: string;
  metric: 'walkedMeters' | 'placedBlocks' | 'unlockedPlots';
  target: number;
  rewardMaterials: Partial<Record<MaterialId, number>>;
  unlocksTool?: Exclude<BuilderTool, 'place' | 'break' | 'pick'>;
  unlockLabelJa?: string;
}

export type TimeOfDay = 'day' | 'dusk' | 'night';
export type LocationMode = 'virtual' | 'gps';

export interface PlayerState {
  schemaVersion: 2;
  ownerId: string;
  walkedMeters: number;
  gatherProgressMeters: number;
  totalBlocksPlaced: number;
  materials: Record<MaterialId, number>;
  blockPools: Record<BlockPoolId, number>;
  claimedMilestones: MilestoneId[];
  nodeCooldowns: Record<string, number>;
  lastPosition: LngLat;
  timeOfDay: TimeOfDay;
}

export interface GatherToast {
  id: string;
  titleJa: string;
  detailJa: string;
  accentColor: string;
  createdAt: number;
}

export interface WorldSnapshot {
  player: PlayerState;
  plots: Record<PlotId, PlotData>;
}

export interface BackupPayload {
  app: 'arukubako';
  schemaVersion: 1 | 2;
  exportedAt: number;
  snapshot: WorldSnapshot;
}
