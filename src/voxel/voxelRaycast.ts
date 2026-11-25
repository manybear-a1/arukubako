import {
  PLOT_VOXEL_XZ,
  PLOT_VOXEL_Y,
  isValidVoxelCoord,
  voxelKey
} from '../core/geoGrid';
import type { BlockId, VoxelCoord } from '../core/types';

export interface RaycastTarget {
  hitCell: VoxelCoord | null;
  placeCell: VoxelCoord;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

function clampInt(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(val)));
}

/**
 * Analytical 3D DDA voxel raymarcher across the active 12x48x12 plot.
 * Runs in O(steps) (~10-50 iterations) with zero Three.js triangle mesh scanning.
 */
export function raycastVoxelsDDA(
  origin: Vec3Like,
  direction: Vec3Like,
  voxels: Record<string, BlockId>,
  guideY: number
): RaycastTarget | null {
  const eps = 1e-8;
  const maxBounds = [PLOT_VOXEL_XZ, PLOT_VOXEL_Y, PLOT_VOXEL_XZ];
  const origArr = [origin.x, origin.y, origin.z];
  const dirArr = [direction.x, direction.y, direction.z];

  let tMin = 0;
  let tMax = Number.POSITIVE_INFINITY;
  let entryNormal = [0, 1, 0];

  for (let axis = 0; axis < 3; axis++) {
    const o = origArr[axis];
    const d = dirArr[axis];
    const bMax = maxBounds[axis];

    if (Math.abs(d) < eps) {
      if (o < 0 || o > bMax) {
        return intersectGuidePlane(origin, direction, guideY);
      }
      continue;
    }

    let t1 = (0 - o) / d;
    let t2 = (bMax - o) / d;
    let nAxis = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      nAxis = 1;
    }

    if (t1 > tMin) {
      tMin = t1;
      entryNormal = [0, 0, 0];
      entryNormal[axis] = nAxis;
    }
    if (t2 < tMax) {
      tMax = t2;
    }
    if (tMin > tMax) {
      return intersectGuidePlane(origin, direction, guideY);
    }
  }

  const startedOutside = tMin > 0;
  const tStart = startedOutside ? tMin + 1e-4 : 0;
  const px = origin.x + direction.x * tStart;
  const py = origin.y + direction.y * tStart;
  const pz = origin.z + direction.z * tStart;

  let ix = clampInt(px, 0, PLOT_VOXEL_XZ - 1);
  let iy = clampInt(py, 0, PLOT_VOXEL_Y - 1);
  let iz = clampInt(pz, 0, PLOT_VOXEL_XZ - 1);

  if (voxels[voxelKey(ix, iy, iz)]) {
    return {
      hitCell: { x: ix, y: iy, z: iz },
      placeCell: {
        x: ix + (startedOutside ? entryNormal[0] : 0),
        y: iy + (startedOutside ? entryNormal[1] : 1),
        z: iz + (startedOutside ? entryNormal[2] : 0)
      }
    };
  }

  const stepX = direction.x > 0 ? 1 : -1;
  const stepY = direction.y > 0 ? 1 : -1;
  const stepZ = direction.z > 0 ? 1 : -1;

  const tDeltaX = Math.abs(direction.x) > eps ? Math.abs(1 / direction.x) : Number.POSITIVE_INFINITY;
  const tDeltaY = Math.abs(direction.y) > eps ? Math.abs(1 / direction.y) : Number.POSITIVE_INFINITY;
  const tDeltaZ = Math.abs(direction.z) > eps ? Math.abs(1 / direction.z) : Number.POSITIVE_INFINITY;

  let tMaxX =
    Math.abs(direction.x) > eps
      ? ((direction.x > 0 ? ix + 1 : ix) - px) / direction.x
      : Number.POSITIVE_INFINITY;
  let tMaxY =
    Math.abs(direction.y) > eps
      ? ((direction.y > 0 ? iy + 1 : iy) - py) / direction.y
      : Number.POSITIVE_INFINITY;
  let tMaxZ =
    Math.abs(direction.z) > eps
      ? ((direction.z > 0 ? iz + 1 : iz) - pz) / direction.z
      : Number.POSITIVE_INFINITY;

  let lastNormalX = 0;
  let lastNormalY = 0;
  let lastNormalZ = 0;

  for (let iter = 0; iter < 120; iter++) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      if (tStart + tMaxX > tMax) break;
      ix += stepX;
      tMaxX += tDeltaX;
      lastNormalX = -stepX;
      lastNormalY = 0;
      lastNormalZ = 0;
    } else if (tMaxY < tMaxZ) {
      if (tStart + tMaxY > tMax) break;
      iy += stepY;
      tMaxY += tDeltaY;
      lastNormalX = 0;
      lastNormalY = -stepY;
      lastNormalZ = 0;
    } else {
      if (tStart + tMaxZ > tMax) break;
      iz += stepZ;
      tMaxZ += tDeltaZ;
      lastNormalX = 0;
      lastNormalY = 0;
      lastNormalZ = -stepZ;
    }

    if (
      ix < 0 ||
      ix >= PLOT_VOXEL_XZ ||
      iy < 0 ||
      iy >= PLOT_VOXEL_Y ||
      iz < 0 ||
      iz >= PLOT_VOXEL_XZ
    ) {
      break;
    }

    if (voxels[voxelKey(ix, iy, iz)]) {
      return {
        hitCell: { x: ix, y: iy, z: iz },
        placeCell: {
          x: ix + lastNormalX,
          y: iy + lastNormalY,
          z: iz + lastNormalZ
        }
      };
    }
  }

  return intersectGuidePlane(origin, direction, guideY);
}

function intersectGuidePlane(
  origin: Vec3Like,
  direction: Vec3Like,
  guideY: number
): RaycastTarget | null {
  if (Math.abs(direction.y) <= 1e-6) return null;
  const t = (guideY - origin.y) / direction.y;
  if (t <= 0) return null;

  const gx = Math.floor(origin.x + direction.x * t);
  const gz = Math.floor(origin.z + direction.z * t);
  if (!isValidVoxelCoord(gx, guideY, gz)) return null;

  return {
    hitCell: null,
    placeCell: { x: gx, y: guideY, z: gz }
  };
}
