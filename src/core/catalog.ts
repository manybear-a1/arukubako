import type {
  BiomeType,
  BlockDef,
  BlockId,
  BlockPoolDef,
  BlockPoolId,
  CraftRecipe,
  LngLat,
  MaterialDef,
  MaterialId,
  MilestoneDef
} from './types';

export const PASSIVE_GATHER_DISTANCE_M = 25;
export const UNLOCK_RADIUS_M = 40;
export const RARE_NODE_HARVEST_RADIUS_M = 50;

export const MATERIALS: Record<MaterialId, MaterialDef> = {
  wood: {
    id: 'wood',
    nameJa: 'ウッド',
    color: '#D97706',
    descriptionJa: '公園や山麓で多く集まる木材素材'
  },
  stone: {
    id: 'stone',
    nameJa: 'ストーン',
    color: '#64748B',
    descriptionJa: '市街地や山斜面で多く集まる石材素材'
  },
  clay: {
    id: 'clay',
    nameJa: 'クレイ',
    color: '#EA580C',
    descriptionJa: '水辺や緑地で多く集まる粘土素材'
  },
  glow: {
    id: 'glow',
    nameJa: 'グロウ',
    color: '#FACC15',
    descriptionJa: 'レアスポットや実績で手に入る発光素材'
  }
};

export const MATERIAL_ORDER: MaterialId[] = ['wood', 'stone', 'clay', 'glow'];

export const BLOCK_POOLS: Record<BlockPoolId, BlockPoolDef> = {
  solid: {
    id: 'solid',
    nameJa: 'ソリッド',
    color: '#2563EB',
    descriptionJa: '16色のカラフルな基本ブロックに共通で使える在庫'
  },
  glass: {
    id: 'glass',
    nameJa: 'ガラス',
    color: '#38BDF8',
    descriptionJa: '半透明のクリアガラスブロック用在庫'
  },
  light: {
    id: 'light',
    nameJa: 'ライト',
    color: '#FACC15',
    descriptionJa: '夜間・夕方に明るく灯る発光ブロック用在庫'
  }
};

export const BLOCK_POOL_ORDER: BlockPoolId[] = ['solid', 'glass', 'light'];

export const BLOCKS: Record<BlockId, BlockDef> = {
  red: { id: 'red', pool: 'solid', nameJa: 'レッド', color: '#EF4444' },
  orange: { id: 'orange', pool: 'solid', nameJa: 'オレンジ', color: '#F97316' },
  amber: { id: 'amber', pool: 'solid', nameJa: 'イエロー', color: '#FACC15' },
  lime: { id: 'lime', pool: 'solid', nameJa: 'ライム', color: '#84CC16' },
  emerald: { id: 'emerald', pool: 'solid', nameJa: 'グリーン', color: '#10B981' },
  teal: { id: 'teal', pool: 'solid', nameJa: 'ターコイズ', color: '#14B8A6' },
  sky: { id: 'sky', pool: 'solid', nameJa: 'スカイ', color: '#38BDF8' },
  cobalt: { id: 'cobalt', pool: 'solid', nameJa: 'ブルー', color: '#2563EB' },
  indigo: { id: 'indigo', pool: 'solid', nameJa: 'インディゴ', color: '#6366F1' },
  purple: { id: 'purple', pool: 'solid', nameJa: 'パープル', color: '#A855F7' },
  pink: { id: 'pink', pool: 'solid', nameJa: 'ピンク', color: '#EC4899' },
  brown: { id: 'brown', pool: 'solid', nameJa: 'ブラウン', color: '#92400E' },
  sand: { id: 'sand', pool: 'solid', nameJa: 'サンド', color: '#EAB366' },
  white: { id: 'white', pool: 'solid', nameJa: 'ホワイト', color: '#F8FAFC' },
  gray: { id: 'gray', pool: 'solid', nameJa: 'グレー', color: '#94A3B8' },
  charcoal: { id: 'charcoal', pool: 'solid', nameJa: 'ブラック', color: '#1E293B' },
  glass: {
    id: 'glass',
    pool: 'glass',
    nameJa: 'クリアガラス',
    color: '#38BDF8',
    translucent: true
  },
  light_warm: {
    id: 'light_warm',
    pool: 'light',
    nameJa: 'ウォームライト',
    color: '#FEF08A',
    emissive: true
  },
  light_cyan: {
    id: 'light_cyan',
    pool: 'light',
    nameJa: 'シアンライト',
    color: '#67E8F9',
    emissive: true
  }
};

export const BLOCK_ORDER: BlockId[] = [
  'red',
  'orange',
  'amber',
  'lime',
  'emerald',
  'teal',
  'sky',
  'cobalt',
  'indigo',
  'purple',
  'pink',
  'brown',
  'sand',
  'white',
  'gray',
  'charcoal',
  'glass',
  'light_warm',
  'light_cyan'
];

export const CRAFT_RECIPES: CraftRecipe[] = [
  {
    id: 'solid_from_wood',
    pool: 'solid',
    nameJa: 'ソリッドブロック（木質加工）',
    outputCount: 6,
    ingredients: { wood: 1 }
  },
  {
    id: 'solid_from_stone',
    pool: 'solid',
    nameJa: 'ソリッドブロック（石材加工）',
    outputCount: 6,
    ingredients: { stone: 1 }
  },
  {
    id: 'solid_from_clay',
    pool: 'solid',
    nameJa: 'ソリッドブロック（粘土焼成）',
    outputCount: 6,
    ingredients: { clay: 1 }
  },
  {
    id: 'solid_bulk',
    pool: 'solid',
    nameJa: 'ソリッドまとめ成形（お得）',
    outputCount: 24,
    ingredients: { wood: 1, stone: 1, clay: 1 }
  },
  {
    id: 'craft_glass',
    pool: 'glass',
    nameJa: 'クリアガラス',
    outputCount: 6,
    ingredients: { clay: 1, glow: 1 }
  },
  {
    id: 'craft_light',
    pool: 'light',
    nameJa: '発光ライト',
    outputCount: 4,
    ingredients: { glow: 1 }
  }
];

export interface BiomeMeta {
  id: BiomeType;
  nameJa: string;
  badgeColor: string;
  accentTextColor: string;
  descriptionJa: string;
  weights: Record<MaterialId, number>;
}

export const BIOME_META: Record<BiomeType, BiomeMeta> = {
  park: {
    id: 'park',
    nameJa: '公園・緑地',
    badgeColor: '#10B981',
    accentTextColor: '#FFFFFF',
    descriptionJa: 'ウッドが多く、木々の地形が生成される',
    weights: { wood: 0.55, clay: 0.25, stone: 0.14, glow: 0.06 }
  },
  water: {
    id: 'water',
    nameJa: '水辺・河川',
    badgeColor: '#0EA5E9',
    accentTextColor: '#FFFFFF',
    descriptionJa: 'クレイとグロウが出やすく、水盤地形が生成される',
    weights: { clay: 0.52, stone: 0.22, wood: 0.16, glow: 0.10 }
  },
  urban: {
    id: 'urban',
    nameJa: '市街地・駅前',
    badgeColor: '#6366F1',
    accentTextColor: '#FFFFFF',
    descriptionJa: 'ストーンが豊富で舗装と都市基礎が生成される',
    weights: { stone: 0.56, clay: 0.20, wood: 0.16, glow: 0.08 }
  },
  residential: {
    id: 'residential',
    nameJa: '住宅街',
    badgeColor: '#F97316',
    accentTextColor: '#FFFFFF',
    descriptionJa: '各素材が均等に集まり、小道と花壇が生成される',
    weights: { wood: 0.34, stone: 0.34, clay: 0.26, glow: 0.06 }
  },
  mountain: {
    id: 'mountain',
    nameJa: '山・斜面',
    badgeColor: '#8B5CF6',
    accentTextColor: '#FFFFFF',
    descriptionJa: '高低差のある岩肌と松の木が生成される',
    weights: { stone: 0.44, wood: 0.32, clay: 0.14, glow: 0.10 }
  },
  open: {
    id: 'open',
    nameJa: '街角エリア',
    badgeColor: '#14B8A6',
    accentTextColor: '#FFFFFF',
    descriptionJa: '基本4素材がバランスよく集まる草原エリア',
    weights: { wood: 0.32, stone: 0.32, clay: 0.30, glow: 0.06 }
  }
};

export const BIOME_ORDER: BiomeType[] = [
  'park',
  'water',
  'urban',
  'residential',
  'mountain',
  'open'
];

export const MILESTONES: MilestoneDef[] = [
  {
    id: 'first_walk',
    titleJa: 'はじめてのお散歩',
    descriptionJa: '累計 50m 歩く',
    metric: 'walkedMeters',
    target: 50,
    rewardMaterials: { wood: 4, stone: 4, clay: 3, glow: 1 }
  },
  {
    id: 'builder_20',
    titleJa: '箱庭ビルダー',
    descriptionJa: 'ブロックを合計 20個 設置する',
    metric: 'placedBlocks',
    target: 20,
    rewardMaterials: { wood: 3, stone: 3 },
    unlocksTool: 'line',
    unlockLabelJa: 'ライン設置ツール解放'
  },
  {
    id: 'explorer_5',
    titleJa: '街の開拓者',
    descriptionJa: '区画を 5つ 探索解放する',
    metric: 'unlockedPlots',
    target: 5,
    rewardMaterials: { glow: 3 },
    unlocksTool: 'blueprint',
    unlockLabelJa: '設計図スタンプ解放'
  },
  {
    id: 'walker_250',
    titleJa: '健脚トラベラー',
    descriptionJa: '累計 250m 歩く',
    metric: 'walkedMeters',
    target: 250,
    rewardMaterials: { clay: 5, glow: 2 },
    unlocksTool: 'fill',
    unlockLabelJa: '床塗りツール解放'
  },
  {
    id: 'master_100',
    titleJa: 'ジオラママスター',
    descriptionJa: 'ブロックを合計 100個 設置する',
    metric: 'placedBlocks',
    target: 100,
    rewardMaterials: { wood: 6, stone: 6, clay: 6, glow: 6 }
  }
];

export const STARTER_MATERIALS: Record<MaterialId, number> = {
  wood: 6,
  stone: 6,
  clay: 5,
  glow: 3
};

export const STARTER_BLOCK_POOLS: Record<BlockPoolId, number> = {
  solid: 80,
  glass: 12,
  light: 6
};

export interface PresetSpot {
  id: string;
  nameJa: string;
  subtitleJa: string;
  lngLat: LngLat;
  fallbackBiome: BiomeType;
}

export const PRESET_SPOTS: PresetSpot[] = [
  {
    id: 'yoyogi',
    nameJa: '代々木公園',
    subtitleJa: '緑豊かな公園（ウッド多め）',
    lngLat: { lng: 139.6952, lat: 35.6717 },
    fallbackBiome: 'park'
  },
  {
    id: 'takao',
    nameJa: '高尾山・山麓斜面',
    subtitleJa: '実標高の急傾斜を活かせる山エリア',
    lngLat: { lng: 139.2485, lat: 35.6312 },
    fallbackBiome: 'mountain'
  },
  {
    id: 'tokyo',
    nameJa: '東京駅・丸の内',
    subtitleJa: '舗装と都市基礎の市街地（ストーン多め）',
    lngLat: { lng: 139.7654, lat: 35.6812 },
    fallbackBiome: 'urban'
  },
  {
    id: 'kamogawa',
    nameJa: '京都・鴨川',
    subtitleJa: '川沿いの水辺エリア（クレイ多め）',
    lngLat: { lng: 135.7717, lat: 35.0042 },
    fallbackBiome: 'water'
  },
  {
    id: 'asakusa',
    nameJa: '浅草・下町',
    subtitleJa: '散策が楽しい街並み（バランス型）',
    lngLat: { lng: 139.7966, lat: 35.7124 },
    fallbackBiome: 'residential'
  }
];

export function pickWeightedMaterial(
  biome: BiomeType,
  rng: () => number = Math.random
): MaterialId {
  const weights = BIOME_META[biome].weights;
  const roll = rng();
  let acc = 0;
  for (const id of MATERIAL_ORDER) {
    acc += weights[id];
    if (roll <= acc) return id;
  }
  return 'wood';
}

export function rollBiomeGather(
  biome: BiomeType,
  rng: () => number = Math.random
): Partial<Record<MaterialId, number>> {
  const result: Partial<Record<MaterialId, number>> = {};
  const count = rng() < 0.35 ? 3 : 2;
  for (let i = 0; i < count; i++) {
    const mat = pickWeightedMaterial(biome, rng);
    result[mat] = (result[mat] ?? 0) + 1;
  }
  return result;
}

export function canCraft(
  materials: Record<MaterialId, number>,
  recipe: CraftRecipe,
  count: number = 1
): boolean {
  if (!Number.isInteger(count) || count <= 0) return false;
  for (const [mat, cost] of Object.entries(recipe.ingredients) as [MaterialId, number][]) {
    if ((materials[mat] ?? 0) < cost * count) {
      return false;
    }
  }
  return true;
}

export function applyCraft(
  materials: Record<MaterialId, number>,
  blockPools: Record<BlockPoolId, number>,
  recipe: CraftRecipe,
  count: number = 1
): { materials: Record<MaterialId, number>; blockPools: Record<BlockPoolId, number> } | null {
  if (!canCraft(materials, recipe, count)) return null;
  const nextMaterials = { ...materials };
  const nextPools = { ...blockPools };

  for (const [mat, cost] of Object.entries(recipe.ingredients) as [MaterialId, number][]) {
    nextMaterials[mat] = (nextMaterials[mat] ?? 0) - cost * count;
  }
  nextPools[recipe.pool] = (nextPools[recipe.pool] ?? 0) + recipe.outputCount * count;

  return { materials: nextMaterials, blockPools: nextPools };
}

export function formatMaterialSummary(rewards: Partial<Record<MaterialId, number>>): string {
  return MATERIAL_ORDER.filter((id) => (rewards[id] ?? 0) > 0)
    .map((id) => `${MATERIALS[id].nameJa}+${rewards[id]}`)
    .join(' / ');
}
