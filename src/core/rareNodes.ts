import {
  PLOT_MERCATOR_SIZE,
  haversineMeters,
  lngLatToMercator,
  mercatorToLngLat
} from './geoGrid';
import type { LngLat, MaterialId, RareNode } from './types';

export const RARE_NODE_COOLDOWN_MS = 15 * 60 * 1000;
const NODE_CELL_PLOTS = 3; // ~73m in Japan -> much livelier density

interface NodeTemplate {
  titleJa: string;
  biomeHint: RareNode['biomeHint'];
  color: string;
  rewards: Partial<Record<MaterialId, number>>;
}

const NODE_TEMPLATES: NodeTemplate[] = [
  {
    titleJa: '古木の広場',
    biomeHint: 'park',
    color: '#10B981',
    rewards: { wood: 4, clay: 1, glow: 1 }
  },
  {
    titleJa: '石材の露頭',
    biomeHint: 'urban',
    color: '#6366F1',
    rewards: { stone: 4, glow: 1 }
  },
  {
    titleJa: '川辺の粘土層',
    biomeHint: 'water',
    color: '#0EA5E9',
    rewards: { clay: 4, wood: 1, glow: 1 }
  },
  {
    titleJa: '光の結晶',
    biomeHint: 'open',
    color: '#FACC15',
    rewards: { glow: 2, wood: 1, stone: 1 }
  },
  {
    titleJa: '山頂の輝石',
    biomeHint: 'mountain',
    color: '#8B5CF6',
    rewards: { stone: 3, glow: 2 }
  }
];

function hash2D(cx: number, cy: number): number {
  let h = (cx * 374761393 + cy * 668265263) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return (h ^ (h >> 16)) >>> 0;
}

export function bearingDegreesBetween(from: LngLat, to: LngLat): number {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Deterministically generates nearby rare resource nodes within ~450m of center.
 * Guarantees the player's current cell always holds a node so exploration always has an active target.
 */
export function getNearbyRareNodes(
  center: LngLat,
  cooldowns: Record<string, number>,
  nowMs: number = Date.now(),
  maxRadiusMeters: number = 220
): RareNode[] {
  const { mx, my } = lngLatToMercator(center.lng, center.lat);
  const cellSize = PLOT_MERCATOR_SIZE * NODE_CELL_PLOTS;
  const centerCx = Math.floor(mx / cellSize);
  const centerCy = Math.floor(my / cellSize);
  const span = 5;

  const nodes: RareNode[] = [];

  for (let dx = -span; dx <= span; dx++) {
    for (let dy = -span; dy <= span; dy++) {
      const cx = centerCx + dx;
      const cy = centerCy + dy;
      const h = hash2D(cx, cy);
      const isCenterCell = dx === 0 && dy === 0;

      // ~85% spawn chance in surrounding cells; always spawn in center cell so there's always a nearby target
      if (!isCenterCell && h % 20 >= 17) continue;

      const offsetX = 0.22 + ((h >>> 4) % 56) / 100;
      const offsetY = 0.22 + ((h >>> 10) % 56) / 100;
      const nodeLngLat = mercatorToLngLat(
        (cx + offsetX) * cellSize,
        (cy + offsetY) * cellSize
      );

      if (haversineMeters(center, nodeLngLat) > maxRadiusMeters) continue;

      const template = NODE_TEMPLATES[(h >>> 16) % NODE_TEMPLATES.length];
      const id = `node:${cx}:${cy}`;
      const cooldownUntil = cooldowns[id] ?? 0;

      nodes.push({
        id,
        titleJa: template.titleJa,
        biomeHint: template.biomeHint,
        lngLat: nodeLngLat,
        color: template.color,
        rewards: { ...template.rewards },
        cooldownUntil: cooldownUntil > nowMs ? cooldownUntil : 0
      });
    }
  }

  return nodes;
}

export function canHarvestRareNode(
  node: RareNode,
  playerLngLat: LngLat,
  harvestRadiusMeters: number,
  nowMs: number = Date.now()
): { ok: boolean; distanceMeters: number; reason?: 'cooldown' | 'too_far' } {
  const distanceMeters = haversineMeters(playerLngLat, node.lngLat);
  if (node.cooldownUntil > nowMs) {
    return { ok: false, distanceMeters, reason: 'cooldown' };
  }
  if (distanceMeters > harvestRadiusMeters) {
    return { ok: false, distanceMeters, reason: 'too_far' };
  }
  return { ok: true, distanceMeters };
}

export function findNearestReadyNode(
  nodes: RareNode[],
  playerLngLat: LngLat,
  nowMs: number = Date.now()
): { node: RareNode; distanceMeters: number; bearingDeg: number } | null {
  let best: { node: RareNode; distanceMeters: number; bearingDeg: number } | null = null;
  for (const node of nodes) {
    if (node.cooldownUntil > nowMs) continue;
    const distanceMeters = haversineMeters(playerLngLat, node.lngLat);
    if (!best || distanceMeters < best.distanceMeters) {
      best = {
        node,
        distanceMeters,
        bearingDeg: bearingDegreesBetween(playerLngLat, node.lngLat)
      };
    }
  }
  return best;
}
