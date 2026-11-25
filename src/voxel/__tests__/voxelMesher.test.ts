import { describe, expect, it } from 'vitest';
import { voxelKey } from '../../core/geoGrid';
import {
  buildCombinedNeighborMeshes,
  buildPlotMeshes,
  createDioramaBaseGeometry
} from '../voxelMesher';

describe('voxelMesher v2', () => {
  it('returns empty geometries for an empty plot', () => {
    const res = buildPlotMeshes({});
    expect(res.opaqueGeometry).toBeNull();
    expect(res.translucentGeometry).toBeNull();
    expect(res.emissiveGeometry).toBeNull();
    expect(res.triangleCount).toBe(0);
  });

  it('renders 6 faces (12 triangles) for a single vivid solid-color block up to height 47', () => {
    const res = buildPlotMeshes({
      [voxelKey(3, 45, 3)]: 'red'
    });
    expect(res.opaqueGeometry).not.toBeNull();
    expect(res.triangleCount).toBe(12);
    expect(res.opaqueGeometry!.index!.count).toBe(36);
    expect(res.opaqueGeometry!.attributes.uv).toBeUndefined();
    expect(res.opaqueGeometry!.attributes.color).toBeDefined();
  });

  it('culls shared hidden faces between two adjacent opaque blocks (20 triangles)', () => {
    const res = buildPlotMeshes({
      [voxelKey(4, 20, 4)]: 'cobalt',
      [voxelKey(5, 20, 4)]: 'amber'
    });
    expect(res.triangleCount).toBe(20);
    expect(res.opaqueGeometry!.index!.count).toBe(60);
  });

  it('separates translucent glass and emissive light blocks and supports muted neighbor mode', () => {
    const res = buildPlotMeshes(
      {
        [voxelKey(1, 0, 1)]: 'white',
        [voxelKey(2, 0, 1)]: 'glass',
        [voxelKey(3, 0, 1)]: 'light_cyan'
      },
      { muted: true }
    );

    expect(res.opaqueGeometry).not.toBeNull();
    expect(res.translucentGeometry).not.toBeNull();
    expect(res.emissiveGeometry).not.toBeNull();
    expect(res.triangleCount).toBe(32);
  });

  it('adds 4 foundation skirt walls (8 triangles) when foundationDepth > 0', () => {
    const res = buildPlotMeshes(
      { [voxelKey(0, 0, 0)]: 'emerald' },
      { foundationDepth: 2.5 }
    );
    expect(res.triangleCount).toBe(20); // 12 block triangles + 8 foundation skirt triangles
  });

  it('merges multiple neighbor plots into a single draw geometry set', () => {
    const res = buildCombinedNeighborMeshes([
      { voxels: { [voxelKey(1, 0, 1)]: 'gray' }, offsetX: 12, offsetY: 2, offsetZ: 0 },
      { voxels: { [voxelKey(2, 0, 2)]: 'glass' }, offsetX: -12, offsetY: -1, offsetZ: 12 }
    ]);
    expect(res.opaqueGeometry).not.toBeNull();
    expect(res.translucentGeometry).not.toBeNull();
    expect(res.triangleCount).toBe(24);
  });

  it('creates a valid diorama plinth geometry', () => {
    const base = createDioramaBaseGeometry();
    expect(base.attributes.position).toBeDefined();
    expect(base.attributes.color).toBeDefined();
    base.dispose();
  });
});
