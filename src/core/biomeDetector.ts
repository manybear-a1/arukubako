import type { BiomeType } from './types';

export interface MapFeatureLike {
  layer?: { id?: string };
  sourceLayer?: string;
  properties?: Record<string, unknown>;
}

export interface ElevationContext {
  baseElevationM?: number;
  elevationReliefM?: number;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

export function isMountainElevation(elevation?: ElevationContext): boolean {
  if (!elevation) return false;
  const base = elevation.baseElevationM ?? 0;
  const relief = elevation.elevationReliefM ?? 0;
  return (base >= 80 && relief >= 3.0) || base >= 140 || relief >= 10;
}

/**
 * Classifies rendered OpenMapTiles / OpenFreeMap vector features plus optional elevation relief
 * into a simplified gameplay biome.
 */
export function detectBiomeFromFeatures(
  features: MapFeatureLike[],
  elevation?: ElevationContext
): BiomeType | null {
  if (!features || features.length === 0) {
    if (isMountainElevation(elevation)) {
      return 'mountain';
    }
    return null;
  }

  let parkScore = 0;
  let waterScore = 0;
  let urbanScore = 0;
  let residentialScore = 0;

  for (const f of features) {
    const layerId = text(f.layer?.id);
    const sourceLayer = text(f.sourceLayer);
    const props = f.properties ?? {};
    const cls = text(props.class);
    const subclass = text(props.subclass);

    if (
      sourceLayer === 'water' ||
      sourceLayer === 'waterway' ||
      layerId.includes('water') ||
      cls === 'river' ||
      cls === 'canal' ||
      cls === 'lake' ||
      cls === 'ocean'
    ) {
      waterScore += 4;
      continue;
    }

    if (
      sourceLayer === 'park' ||
      layerId.includes('park') ||
      cls === 'park' ||
      cls === 'wood' ||
      cls === 'forest' ||
      cls === 'grass' ||
      cls === 'garden' ||
      subclass === 'park' ||
      subclass === 'forest'
    ) {
      parkScore += 3;
      continue;
    }

    if (sourceLayer === 'landuse' || layerId.includes('landuse')) {
      if (cls === 'residential') {
        residentialScore += 3;
      } else if (
        cls === 'commercial' ||
        cls === 'industrial' ||
        cls === 'retail' ||
        cls === 'railway'
      ) {
        urbanScore += 3;
      } else if (cls === 'park' || cls === 'cemetery' || cls === 'recreation_ground') {
        parkScore += 2;
      }
      continue;
    }

    if (sourceLayer === 'building' || layerId.includes('building')) {
      urbanScore += 1;
      continue;
    }

    if (sourceLayer === 'transportation' || layerId.includes('road')) {
      if (
        cls === 'motorway' ||
        cls === 'trunk' ||
        cls === 'primary' ||
        cls === 'secondary' ||
        cls === 'rail'
      ) {
        urbanScore += 1;
      } else if (cls === 'minor' || cls === 'residential') {
        residentialScore += 1;
      }
    }
  }

  if (waterScore < 4 && isMountainElevation(elevation)) {
    return 'mountain';
  }

  const ranked: Array<[BiomeType, number]> = [
    ['water', waterScore],
    ['park', parkScore],
    ['urban', urbanScore],
    ['residential', residentialScore]
  ];
  ranked.sort((a, b) => b[1] - a[1]);

  if (ranked[0][1] <= 0) return null;
  return ranked[0][0];
}

/**
 * Deterministic spatial fallback biome when vector tiles are still loading or offline.
 */
export function fallbackBiomeForCoord(lng: number, lat: number): BiomeType {
  if (Math.hypot(lng - 139.2485, lat - 35.6312) < 0.015) return 'mountain';
  if (Math.hypot(lng - 139.6952, lat - 35.6717) < 0.008) return 'park';
  if (Math.hypot(lng - 139.7654, lat - 35.6812) < 0.008) return 'urban';
  if (Math.hypot(lng - 135.7717, lat - 35.0042) < 0.008) return 'water';
  if (Math.hypot(lng - 139.7966, lat - 35.7124) < 0.008) return 'residential';

  const cellX = Math.floor(lng * 500);
  const cellY = Math.floor(lat * 500);
  const hash = Math.abs((cellX * 73856093) ^ (cellY * 19349663)) % 10;
  if (hash < 3) return 'residential';
  if (hash < 5) return 'urban';
  if (hash < 7) return 'park';
  if (hash < 9) return 'open';
  return 'water';
}
