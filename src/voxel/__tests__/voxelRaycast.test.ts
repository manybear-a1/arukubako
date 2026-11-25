import { describe, expect, it } from 'vitest';
import { voxelKey } from '../../core/geoGrid';
import { raycastVoxelsDDA } from '../voxelRaycast';

describe('raycastVoxelsDDA', () => {
  it('hits the front face of a single voxel and returns adjacent placement cell', () => {
    const voxels = { [voxelKey(5, 2, 5)]: 'red' as const };
    // Ray starting at (5.5, 2.5, 10) aiming along -Z toward (5.5, 2.5, 5.5)
    const hit = raycastVoxelsDDA(
      { x: 5.5, y: 2.5, z: 10 },
      { x: 0, y: 0, z: -1 },
      voxels,
      0
    );
    expect(hit).not.toBeNull();
    expect(hit!.hitCell).toEqual({ x: 5, y: 2, z: 5 });
    expect(hit!.placeCell).toEqual({ x: 5, y: 2, z: 6 });
  });

  it('hits the top face of a tall voxel at y=40', () => {
    const voxels = { [voxelKey(3, 40, 4)]: 'cobalt' as const };
    const hit = raycastVoxelsDDA(
      { x: 3.5, y: 50, z: 4.5 },
      { x: 0, y: -1, z: 0 },
      voxels,
      0
    );
    expect(hit).not.toBeNull();
    expect(hit!.hitCell).toEqual({ x: 3, y: 40, z: 4 });
    expect(hit!.placeCell).toEqual({ x: 3, y: 41, z: 4 });
  });

  it('falls back to the height guide plane when no voxels block the ray', () => {
    const hit = raycastVoxelsDDA(
      { x: 6.5, y: 12, z: 6.5 },
      { x: 0, y: -1, z: 0 },
      {},
      3
    );
    expect(hit).not.toBeNull();
    expect(hit!.hitCell).toBeNull();
    expect(hit!.placeCell).toEqual({ x: 6, y: 3, z: 6 });
  });

  it('returns null when ray misses both voxels and guide plane bounds', () => {
    const hit = raycastVoxelsDDA(
      { x: 30, y: 10, z: 30 },
      { x: 0, y: -1, z: 0 },
      { [voxelKey(0, 0, 0)]: 'white' },
      0
    );
    expect(hit).toBeNull();
  });
});
