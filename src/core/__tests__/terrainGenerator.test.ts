import { describe, expect, it } from 'vitest';
import { detectBiomeFromFeatures } from '../biomeDetector';
import { lngLatToPlotCoord, parseVoxelKey, voxelKey } from '../geoGrid';
import {
  composeEffectiveVoxels,
  generatePlotTerrainVoxels,
  samplePlotElevationGrid
} from '../terrainGenerator';

describe('terrainGenerator & slope continuity', () => {
  it('generates sloped mountain terrain around Takao preset', () => {
    const takao = { lng: 139.2485, lat: 35.6312 };
    const coord = lngLatToPlotCoord(takao.lng, takao.lat);
    const grid = samplePlotElevationGrid(coord.gx, coord.gy);

    expect(grid.heights).toHaveLength(144);
    expect(grid.baseElevationM).toBeGreaterThan(100);
    expect(grid.elevationReliefM).toBeGreaterThan(3.5);

    const detected = detectBiomeFromFeatures([], {
      baseElevationM: grid.baseElevationM,
      elevationReliefM: grid.elevationReliefM
    });
    expect(detected).toBe('mountain');

    // Low-altitude sea-level city noise (e.g. Tokyo Station 10m with 6m relief) should NOT become mountain
    const urbanDetected = detectBiomeFromFeatures(
      [{ sourceLayer: 'building', properties: {} }],
      { baseElevationM: 10, elevationReliefM: 6.1 }
    );
    expect(urbanDetected).toBe('urban');

    const terrain = generatePlotTerrainVoxels(
      coord.gx,
      coord.gy,
      'mountain',
      grid.heights,
      grid.baseElevationM
    );

    const maxY = Object.keys(terrain).reduce((acc, k) => {
      const p = parseVoxelKey(k);
      return p && p.y > acc ? p.y : acc;
    }, 0);

    // Sloped terrain creates visible multi-block relief while leaving huge headroom below Y=47
    expect(maxY).toBeGreaterThanOrEqual(2);
    expect(maxY).toBeLessThanOrEqual(27);
  });

  it('supports excavating generated terrain and overlaying player builds', () => {
    const coord = lngLatToPlotCoord(139.6952, 35.6717);
    const grid = samplePlotElevationGrid(coord.gx, coord.gy);
    const terrain = generatePlotTerrainVoxels(
      coord.gx,
      coord.gy,
      'park',
      grid.heights,
      grid.baseElevationM
    );

    const firstKey = Object.keys(terrain)[0];
    const customKey = voxelKey(5, 30, 5);

    const composed = composeEffectiveVoxels(terrain, [firstKey], {
      [customKey]: 'red'
    });

    expect(composed.voxels[firstKey]).toBeUndefined();
    expect(composed.voxels[customKey]).toBe('red');
    expect(composed.playerKeys.has(customKey)).toBe(true);
    expect(composed.playerKeys.has(firstKey)).toBe(false);
  });
});
