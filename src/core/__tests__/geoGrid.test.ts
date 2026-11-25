import { describe, expect, it } from 'vitest';
import {
  distanceFromPointToPlotMeters,
  getPlotsInRadius,
  haversineMeters,
  isValidVoxelCoord,
  lngLatToMercator,
  lngLatToPlotCoord,
  makePlotId,
  mercatorToLngLat,
  parsePlotId,
  parseVoxelKey,
  plotCoordToLngLatBounds,
  plotCoordToPolygonCoords,
  voxelKey
} from '../geoGrid';

describe('geoGrid v2', () => {
  it('round-trips lng/lat through Web Mercator accurately', () => {
    const samples = [
      { lng: 139.6952, lat: 35.6717 },
      { lng: 139.2485, lat: 35.6312 },
      { lng: -73.9857, lat: 40.7484 }
    ];

    for (const s of samples) {
      const { mx, my } = lngLatToMercator(s.lng, s.lat);
      const restored = mercatorToLngLat(mx, my);
      expect(restored.lng).toBeCloseTo(s.lng, 8);
      expect(restored.lat).toBeCloseTo(s.lat, 8);
    }
  });

  it('produces seamlessly touching polygons for adjacent plots', () => {
    const center = { lng: 139.7654, lat: 35.6812 };
    const base = lngLatToPlotCoord(center.lng, center.lat);
    const polyA = plotCoordToPolygonCoords(base.gx, base.gy);
    const polyB = plotCoordToPolygonCoords(base.gx + 1, base.gy);

    expect(polyA).toHaveLength(5);
    expect(polyA[0]).toEqual(polyA[4]);
    expect(polyA[1][0]).toBeCloseTo(polyB[0][0], 10);
    expect(polyA[1][1]).toBeCloseTo(polyB[0][1], 10);
    expect(polyA[2][0]).toBeCloseTo(polyB[3][0], 10);
    expect(polyA[2][1]).toBeCloseTo(polyB[3][1], 10);
  });

  it('unlocks plots whenever circle intersects even 1m of a plot edge', () => {
    const standingPos = { lng: 139.6952, lat: 35.6717 };
    const standing = lngLatToPlotCoord(standingPos.lng, standingPos.lat);

    // Pick a point just 5m west of a distant plot's east edge (so center is ~17m away, edge is 5m away)
    const targetGx = standing.gx + 2;
    const targetGy = standing.gy;
    const bounds = plotCoordToLngLatBounds(targetGx, targetGy);
    const pointOutsideEastEdge = {
      lng: bounds.maxLng + 0.00038, // ~34m east of the east edge, center is ~46m away!
      lat: (bounds.minLat + bounds.maxLat) / 2
    };

    const edgeDist = distanceFromPointToPlotMeters(pointOutsideEastEdge, targetGx, targetGy);
    expect(edgeDist).toBeLessThanOrEqual(40);

    const unlocked = getPlotsInRadius(pointOutsideEastEdge, 40);
    expect(unlocked.some((p) => p.gx === targetGx && p.gy === targetGy)).toBe(true);
    expect(distanceFromPointToPlotMeters({ lng: (bounds.minLng + bounds.maxLng) / 2, lat: (bounds.minLat + bounds.maxLat) / 2 }, targetGx, targetGy)).toBe(0);
  });

  it('computes realistic haversine distances', () => {
    const tokyo = { lng: 139.7671, lat: 35.6812 };
    const shinjuku = { lng: 139.7006, lat: 35.6896 };
    const dist = haversineMeters(tokyo, shinjuku);
    expect(dist).toBeGreaterThan(5800);
    expect(dist).toBeLessThan(6400);
    expect(haversineMeters(tokyo, tokyo)).toBe(0);
  });

  it('supports 12x48x12 voxel bounds', () => {
    const id = makePlotId(1234, 5678);
    expect(parsePlotId(id)).toEqual({ gx: 1234, gy: 5678 });
    expect(parsePlotId('bad')).toBeNull();

    expect(isValidVoxelCoord(0, 47, 11)).toBe(true);
    expect(isValidVoxelCoord(0, 48, 0)).toBe(false);
    expect(isValidVoxelCoord(12, 0, 0)).toBe(false);
    expect(parseVoxelKey(voxelKey(3, 35, 11))).toEqual({ x: 3, y: 35, z: 11 });
    expect(parseVoxelKey('0,48,0')).toBeNull();
  });
});
