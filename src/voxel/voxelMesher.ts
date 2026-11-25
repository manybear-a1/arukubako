import * as THREE from 'three';
import { BLOCKS } from '../core/catalog';
import {
  PLOT_VOXEL_XZ,
  PLOT_VOXEL_Y,
  parseVoxelKey,
  voxelKey
} from '../core/geoGrid';
import type { BlockId } from '../core/types';

export interface VoxelMeshesResult {
  opaqueGeometry: THREE.BufferGeometry | null;
  translucentGeometry: THREE.BufferGeometry | null;
  emissiveGeometry: THREE.BufferGeometry | null;
  triangleCount: number;
}

export interface BuildPlotMeshesOptions {
  muted?: boolean;
  foundationDepth?: number;
}

export interface NeighborPlotMeshInput {
  voxels: Record<string, BlockId>;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
}

interface FaceDef {
  dir: [number, number, number];
  shade: number;
  corners: Array<[number, number, number]>;
  aoOffsets: Array<[[number, number, number], [number, number, number], [number, number, number]]>;
}

const FACES: FaceDef[] = [
  // +Y Top
  {
    dir: [0, 1, 0],
    shade: 1.0,
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0]
    ],
    aoOffsets: [
      [[-1, 1, 0], [0, 1, 1], [-1, 1, 1]],
      [[1, 1, 0], [0, 1, 1], [1, 1, 1]],
      [[1, 1, 0], [0, 1, -1], [1, 1, -1]],
      [[-1, 1, 0], [0, 1, -1], [-1, 1, -1]]
    ]
  },
  // -Y Bottom
  {
    dir: [0, -1, 0],
    shade: 0.68,
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1]
    ],
    aoOffsets: [
      [[-1, -1, 0], [0, -1, -1], [-1, -1, -1]],
      [[1, -1, 0], [0, -1, -1], [1, -1, -1]],
      [[1, -1, 0], [0, -1, 1], [1, -1, 1]],
      [[-1, -1, 0], [0, -1, 1], [-1, -1, 1]]
    ]
  },
  // +Z South/Front
  {
    dir: [0, 0, 1],
    shade: 0.9,
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1]
    ],
    aoOffsets: [
      [[-1, 0, 1], [0, -1, 1], [-1, -1, 1]],
      [[1, 0, 1], [0, -1, 1], [1, -1, 1]],
      [[1, 0, 1], [0, 1, 1], [1, 1, 1]],
      [[-1, 0, 1], [0, 1, 1], [-1, 1, 1]]
    ]
  },
  // -Z North/Back
  {
    dir: [0, 0, -1],
    shade: 0.86,
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0]
    ],
    aoOffsets: [
      [[1, 0, -1], [0, -1, -1], [1, -1, -1]],
      [[-1, 0, -1], [0, -1, -1], [-1, -1, -1]],
      [[-1, 0, -1], [0, 1, -1], [-1, 1, -1]],
      [[1, 0, -1], [0, 1, -1], [1, 1, -1]]
    ]
  },
  // +X East/Right
  {
    dir: [1, 0, 0],
    shade: 0.82,
    corners: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1]
    ],
    aoOffsets: [
      [[1, 0, 1], [1, -1, 0], [1, -1, 1]],
      [[1, 0, -1], [1, -1, 0], [1, -1, -1]],
      [[1, 0, -1], [1, 1, 0], [1, 1, -1]],
      [[1, 0, 1], [1, 1, 0], [1, 1, 1]]
    ]
  },
  // -X West/Left
  {
    dir: [-1, 0, 0],
    shade: 0.78,
    corners: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0]
    ],
    aoOffsets: [
      [[-1, 0, -1], [-1, -1, 0], [-1, -1, -1]],
      [[-1, 0, 1], [-1, -1, 0], [-1, -1, 1]],
      [[-1, 0, 1], [-1, 1, 0], [-1, 1, 1]],
      [[-1, 0, -1], [-1, 1, 0], [-1, 1, -1]]
    ]
  }
];

const AO_LEVELS = [1.0, 0.85, 0.72, 0.58];
const MUTED_BLEND = new THREE.Color('#DCE4EE');
const FOUNDATION_COLOR = new THREE.Color('#4A3F37');

interface GeometryBuffers {
  positions: number[];
  normals: number[];
  colors: number[];
  indices: number[];
}

function createEmptyBuffers(): GeometryBuffers {
  return { positions: [], normals: [], colors: [], indices: [] };
}

function toBufferGeometry(buf: GeometryBuffers): THREE.BufferGeometry | null {
  if (buf.indices.length === 0) return null;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(buf.normals, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(buf.colors, 3));
  geom.setIndex(buf.indices);
  geom.computeBoundingSphere();
  return geom;
}

function isOpaqueForAO(voxels: Record<string, BlockId>, x: number, y: number, z: number): boolean {
  if (
    x < 0 ||
    x >= PLOT_VOXEL_XZ ||
    y < 0 ||
    y >= PLOT_VOXEL_Y ||
    z < 0 ||
    z >= PLOT_VOXEL_XZ
  ) {
    return false;
  }
  const id = voxels[voxelKey(x, y, z)];
  if (!id) return false;
  return !BLOCKS[id]?.translucent;
}

function vertexAO(side1: boolean, side2: boolean, corner: boolean): number {
  if (side1 && side2) return AO_LEVELS[3];
  const count = (side1 ? 1 : 0) + (side2 ? 1 : 0) + (corner ? 1 : 0);
  return AO_LEVELS[count];
}

function appendFoundationSkirt(
  buf: GeometryBuffers,
  depth: number,
  offsetX: number,
  offsetY: number,
  offsetZ: number
): number {
  if (depth <= 0) return 0;
  const w = PLOT_VOXEL_XZ;
  const walls: Array<{
    normal: [number, number, number];
    shade: number;
    pts: Array<[number, number, number]>;
  }> = [
    // +Z
    {
      normal: [0, 0, 1],
      shade: 0.9,
      pts: [
        [0, -depth, w],
        [w, -depth, w],
        [w, 0, w],
        [0, 0, w]
      ]
    },
    // -Z
    {
      normal: [0, 0, -1],
      shade: 0.86,
      pts: [
        [w, -depth, 0],
        [0, -depth, 0],
        [0, 0, 0],
        [w, 0, 0]
      ]
    },
    // +X
    {
      normal: [1, 0, 0],
      shade: 0.82,
      pts: [
        [w, -depth, w],
        [w, -depth, 0],
        [w, 0, 0],
        [w, 0, w]
      ]
    },
    // -X
    {
      normal: [-1, 0, 0],
      shade: 0.78,
      pts: [
        [0, -depth, 0],
        [0, -depth, w],
        [0, 0, w],
        [0, 0, 0]
      ]
    }
  ];

  let addedTriangles = 0;
  for (const wall of walls) {
    const baseVertex = buf.positions.length / 3;
    for (const [px, py, pz] of wall.pts) {
      buf.positions.push(px + offsetX, py + offsetY, pz + offsetZ);
      buf.normals.push(wall.normal[0], wall.normal[1], wall.normal[2]);
      buf.colors.push(
        FOUNDATION_COLOR.r * wall.shade,
        FOUNDATION_COLOR.g * wall.shade,
        FOUNDATION_COLOR.b * wall.shade
      );
    }
    buf.indices.push(
      baseVertex,
      baseVertex + 1,
      baseVertex + 2,
      baseVertex,
      baseVertex + 2,
      baseVertex + 3
    );
    addedTriangles += 2;
  }
  return addedTriangles;
}

function appendPlotToBuffers(
  voxels: Record<string, BlockId>,
  opaqueBuf: GeometryBuffers,
  translucentBuf: GeometryBuffers,
  emissiveBuf: GeometryBuffers,
  offsetX: number,
  offsetY: number,
  offsetZ: number,
  muted: boolean,
  foundationDepth: number
): number {
  const colorHelper = new THREE.Color();
  let triangleCount = 0;

  for (const [key, blockId] of Object.entries(voxels)) {
    const coord = parseVoxelKey(key);
    const def = BLOCKS[blockId];
    if (!coord || !def) continue;

    const { x, y, z } = coord;
    const isTranslucent = Boolean(def.translucent);
    const isEmissive = Boolean(def.emissive);
    const targetBuf = isTranslucent
      ? translucentBuf
      : isEmissive
      ? emissiveBuf
      : opaqueBuf;

    colorHelper.set(def.color);
    if (muted) {
      colorHelper.lerp(MUTED_BLEND, 0.34);
    }

    for (const face of FACES) {
      const [dx, dy, dz] = face.dir;
      const neighborId = voxels[voxelKey(x + dx, y + dy, z + dz)];
      if (neighborId) {
        const neighborDef = BLOCKS[neighborId];
        if (isTranslucent) {
          if (neighborDef) continue;
        } else {
          if (neighborDef && !neighborDef.translucent) continue;
        }
      }

      const baseVertex = targetBuf.positions.length / 3;
      const aoValues: number[] = [];

      for (let i = 0; i < 4; i++) {
        const corner = face.corners[i];
        targetBuf.positions.push(
          x + corner[0] + offsetX,
          y + corner[1] + offsetY,
          z + corner[2] + offsetZ
        );
        targetBuf.normals.push(dx, dy, dz);

        let ao = 1.0;
        if (!isEmissive && !isTranslucent) {
          const [s1, s2, c] = face.aoOffsets[i];
          ao = vertexAO(
            isOpaqueForAO(voxels, x + s1[0], y + s1[1], z + s1[2]),
            isOpaqueForAO(voxels, x + s2[0], y + s2[1], z + s2[2]),
            isOpaqueForAO(voxels, x + c[0], y + c[1], z + c[2])
          );
        }
        aoValues.push(ao);

        const shade = isEmissive ? (muted ? 0.85 : 1.0) : face.shade * ao;
        targetBuf.colors.push(
          colorHelper.r * shade,
          colorHelper.g * shade,
          colorHelper.b * shade
        );
      }

      if (aoValues[0] + aoValues[2] < aoValues[1] + aoValues[3]) {
        targetBuf.indices.push(
          baseVertex + 1,
          baseVertex + 2,
          baseVertex + 3,
          baseVertex + 1,
          baseVertex + 3,
          baseVertex + 0
        );
      } else {
        targetBuf.indices.push(
          baseVertex + 0,
          baseVertex + 1,
          baseVertex + 2,
          baseVertex + 0,
          baseVertex + 2,
          baseVertex + 3
        );
      }
      triangleCount += 2;
    }
  }

  if (foundationDepth > 0 && Object.keys(voxels).length > 0) {
    triangleCount += appendFoundationSkirt(
      opaqueBuf,
      foundationDepth,
      offsetX,
      offsetY,
      offsetZ
    );
  }

  return triangleCount;
}

/**
 * Builds pure solid-color face-culled BufferGeometries with directional face shading and Voxel AO.
 * Supports heights up to PLOT_VOXEL_Y (48). Zero textures are used.
 */
export function buildPlotMeshes(
  voxels: Record<string, BlockId>,
  options: BuildPlotMeshesOptions = {}
): VoxelMeshesResult {
  const opaqueBuf = createEmptyBuffers();
  const translucentBuf = createEmptyBuffers();
  const emissiveBuf = createEmptyBuffers();

  const triangleCount = appendPlotToBuffers(
    voxels,
    opaqueBuf,
    translucentBuf,
    emissiveBuf,
    0,
    0,
    0,
    Boolean(options.muted),
    options.foundationDepth ?? 0
  );

  return {
    opaqueGeometry: toBufferGeometry(opaqueBuf),
    translucentGeometry: toBufferGeometry(translucentBuf),
    emissiveGeometry: toBufferGeometry(emissiveBuf),
    triangleCount
  };
}

/**
 * Merges up to 8 neighboring plots into single opaque/translucent/emissive draw geometries
 * to minimize draw calls while rotating in the 3D Voxel Editor.
 */
export function buildCombinedNeighborMeshes(
  neighbors: NeighborPlotMeshInput[]
): VoxelMeshesResult {
  const opaqueBuf = createEmptyBuffers();
  const translucentBuf = createEmptyBuffers();
  const emissiveBuf = createEmptyBuffers();
  let triangleCount = 0;

  for (const n of neighbors) {
    triangleCount += appendPlotToBuffers(
      n.voxels,
      opaqueBuf,
      translucentBuf,
      emissiveBuf,
      n.offsetX,
      n.offsetY,
      n.offsetZ,
      true,
      0
    );
  }

  return {
    opaqueGeometry: toBufferGeometry(opaqueBuf),
    translucentGeometry: toBufferGeometry(translucentBuf),
    emissiveGeometry: toBufferGeometry(emissiveBuf),
    triangleCount
  };
}

/**
 * Ground slab helper for editor preview or unit tests.
 */
export function createDioramaBaseGeometry(): THREE.BufferGeometry {
  const geom = new THREE.BoxGeometry(PLOT_VOXEL_XZ, 0.2, PLOT_VOXEL_XZ);
  geom.translate(PLOT_VOXEL_XZ / 2, -0.1, PLOT_VOXEL_XZ / 2);

  const count = geom.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color('#CBD5E1');
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geom;
}
