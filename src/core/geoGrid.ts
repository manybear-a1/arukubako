import type { LngLat, PlotCoord, PlotId, VoxelCoord } from './types';

export const EARTH_CIRCUMFERENCE_M = 40_075_016.68557849;
export const EARTH_RADIUS_M = 6_378_137;
export const PLOT_MERCATOR_METERS = 30;
export const PLOT_MERCATOR_SIZE = PLOT_MERCATOR_METERS / EARTH_CIRCUMFERENCE_M;
export const PLOT_VOXEL_XZ = 12;
export const PLOT_VOXEL_Y = 48;
export const PLOT_VOXEL_DIM = PLOT_VOXEL_XZ;
export const VOXEL_MERCATOR_SIZE = PLOT_MERCATOR_SIZE / PLOT_VOXEL_XZ;
export const MAX_LATITUDE = 85.05112878;

export function clampLat(lat: number): number {
  return Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));
}

export function normalizeLng(lng: number): number {
  const wrapped = ((((lng + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 && lng > 0 ? 180 : wrapped;
}

/**
 * Converts [lng, lat] to MapLibre normalized Web Mercator coordinates in [0, 1].
 */
export function lngLatToMercator(lng: number, lat: number): { mx: number; my: number } {
  const clampedLat = clampLat(lat);
  const mx = (normalizeLng(lng) + 180) / 360;
  const sin = Math.sin((clampedLat * Math.PI) / 180);
  const my = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  return { mx, my };
}

/**
 * Converts MapLibre normalized Web Mercator coordinates in [0, 1] back to [lng, lat].
 */
export function mercatorToLngLat(mx: number, my: number): LngLat {
  const lng = mx * 360 - 180;
  const n = Math.PI * (1 - 2 * my);
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { lng, lat };
}

export function makePlotId(gx: number, gy: number): PlotId {
  return `${gx}:${gy}`;
}

export function parsePlotId(plotId: PlotId): PlotCoord | null {
  const parts = plotId.split(':');
  if (parts.length !== 2) return null;
  const gx = Number(parts[0]);
  const gy = Number(parts[1]);
  if (!Number.isInteger(gx) || !Number.isInteger(gy)) return null;
  return { gx, gy };
}

export function lngLatToPlotCoord(lng: number, lat: number): PlotCoord {
  const { mx, my } = lngLatToMercator(lng, lat);
  return {
    gx: Math.floor(mx / PLOT_MERCATOR_SIZE),
    gy: Math.floor(my / PLOT_MERCATOR_SIZE)
  };
}

export function plotCoordToMercatorOrigin(gx: number, gy: number): { mx: number; my: number } {
  return {
    mx: gx * PLOT_MERCATOR_SIZE,
    my: gy * PLOT_MERCATOR_SIZE
  };
}

export function plotCoordToCenterLngLat(gx: number, gy: number): LngLat {
  return mercatorToLngLat(
    (gx + 0.5) * PLOT_MERCATOR_SIZE,
    (gy + 0.5) * PLOT_MERCATOR_SIZE
  );
}

export function plotCoordToLngLatBounds(
  gx: number,
  gy: number
): { minLng: number; maxLng: number; minLat: number; maxLat: number } {
  const minX = gx * PLOT_MERCATOR_SIZE;
  const maxX = (gx + 1) * PLOT_MERCATOR_SIZE;
  const minY = gy * PLOT_MERCATOR_SIZE; // North
  const maxY = (gy + 1) * PLOT_MERCATOR_SIZE; // South

  const nw = mercatorToLngLat(minX, minY);
  const se = mercatorToLngLat(maxX, maxY);

  return {
    minLng: nw.lng,
    maxLng: se.lng,
    minLat: se.lat,
    maxLat: nw.lat
  };
}

/**
 * Returns closed GeoJSON polygon ring [lng, lat][] for a plot tile.
 * Winding order: NW -> NE -> SE -> SW -> NW
 */
export function plotCoordToPolygonCoords(gx: number, gy: number): [number, number][] {
  const b = plotCoordToLngLatBounds(gx, gy);
  return [
    [b.minLng, b.maxLat],
    [b.maxLng, b.maxLat],
    [b.maxLng, b.minLat],
    [b.minLng, b.minLat],
    [b.minLng, b.maxLat]
  ];
}

export function plotSideLengthMeters(lat: number): number {
  return PLOT_MERCATOR_METERS * Math.cos((clampLat(lat) * Math.PI) / 180);
}

export function haversineMeters(a: LngLat, b: LngLat): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Shortest distance in meters from a point to the rectangle edge of plot (gx, gy).
 * Returns 0 when the point is inside the plot.
 */
export function distanceFromPointToPlotMeters(
  point: LngLat,
  gx: number,
  gy: number
): number {
  const b = plotCoordToLngLatBounds(gx, gy);
  const clampedLng = Math.max(b.minLng, Math.min(b.maxLng, point.lng));
  const clampedLat = Math.max(b.minLat, Math.min(b.maxLat, point.lat));
  if (clampedLng === point.lng && clampedLat === point.lat) {
    return 0;
  }
  return haversineMeters(point, { lng: clampedLng, lat: clampedLat });
}

/**
 * Lists all plots whose edges or corners intersect the circle of radiusMeters around center.
 */
export function getPlotsInRadius(center: LngLat, radiusMeters: number): PlotCoord[] {
  const centerPlot = lngLatToPlotCoord(center.lng, center.lat);
  const approxSide = Math.max(5, plotSideLengthMeters(center.lat));
  const cellSpan = Math.ceil(radiusMeters / approxSide) + 2;
  const result: PlotCoord[] = [];

  for (let dx = -cellSpan; dx <= cellSpan; dx++) {
    for (let dy = -cellSpan; dy <= cellSpan; dy++) {
      const gx = centerPlot.gx + dx;
      const gy = centerPlot.gy + dy;
      if (distanceFromPointToPlotMeters(center, gx, gy) <= radiusMeters) {
        result.push({ gx, gy });
      }
    }
  }
  return result;
}

export function voxelKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export function parseVoxelKey(key: string): VoxelCoord | null {
  const parts = key.split(',');
  if (parts.length !== 3) return null;
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  const z = Number(parts[2]);
  if (!isValidVoxelCoord(x, y, z)) return null;
  return { x, y, z };
}

export function isValidVoxelCoord(x: number, y: number, z: number): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    Number.isInteger(z) &&
    x >= 0 &&
    x < PLOT_VOXEL_XZ &&
    y >= 0 &&
    y < PLOT_VOXEL_Y &&
    z >= 0 &&
    z < PLOT_VOXEL_XZ
  );
}
