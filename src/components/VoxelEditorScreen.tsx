import {
  ArrowLeft,
  Check,
  Eraser,
  Grid,
  Hammer,
  Layers,
  Minus,
  Moon,
  Pipette,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Sunrise,
  Undo2,
  X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { fallbackBiomeForCoord } from '../core/biomeDetector';
import {
  BLUEPRINTS,
  type BlueprintVoxel,
  applyBlueprintToVoxels,
  getBlueprintPoolCost,
  rotateBlueprintVoxels
} from '../core/blueprints';
import {
  BIOME_META,
  BLOCK_POOLS,
  BLOCKS,
  BLOCK_ORDER
} from '../core/catalog';
import { ensureElevationTilesForPlotNeighborhood } from '../core/elevationService';
import {
  PLOT_VOXEL_XZ,
  PLOT_VOXEL_Y,
  isValidVoxelCoord,
  makePlotId,
  plotCoordToCenterLngLat,
  plotSideLengthMeters,
  voxelKey
} from '../core/geoGrid';
import {
  composeEffectiveVoxels,
  generatePlotTerrainVoxels,
  samplePlotElevationGrid
} from '../core/terrainGenerator';
import type {
  BlockId,
  BlockPoolId,
  BuilderTool,
  TimeOfDay,
  VoxelCoord
} from '../core/types';
import { getUnlockedBuilderTools, useGameStore } from '../store/useGameStore';
import {
  buildCombinedNeighborMeshes,
  buildPlotMeshes,
  type NeighborPlotMeshInput
} from '../voxel/voxelMesher';
import { raycastVoxelsDDA } from '../voxel/voxelRaycast';

interface HistorySnapshot {
  playerVoxels: Record<string, BlockId>;
  removedTerrainKeys: string[];
  poolDelta: Record<BlockPoolId, number>;
  placedDelta: number;
}

function emptyPoolDelta(): Record<BlockPoolId, number> {
  return { solid: 0, glass: 0, light: 0 };
}

const EDITOR_BG: Record<TimeOfDay, string> = {
  day: 'linear-gradient(180deg, #93C5FD 0%, #E0F2FE 65%, #F8FAFC 100%)',
  dusk: 'linear-gradient(180deg, #4338CA 0%, #F97316 100%)',
  night: 'linear-gradient(180deg, #0F172A 0%, #1E293B 100%)'
};

const EDITOR_BG_HEX: Record<TimeOfDay, number> = {
  day: 0xcbe5fa,
  dusk: 0x7c5a8a,
  night: 0x141e33
};

const EDITOR_TINTS: Record<
  TimeOfDay,
  { opaque: number; translucent: number; emissive: number }
> = {
  day: { opaque: 0xffffff, translucent: 0xffffff, emissive: 0xffffff },
  dusk: { opaque: 0xffd7b8, translucent: 0xeec4b2, emissive: 0xfff5b8 },
  night: { opaque: 0x7b8db5, translucent: 0x7490bd, emissive: 0xffffff }
};

function bresenham3D(a: VoxelCoord, b: VoxelCoord): VoxelCoord[] {
  const result: VoxelCoord[] = [];
  let x1 = a.x;
  let y1 = a.y;
  let z1 = a.z;
  const x2 = b.x;
  const y2 = b.y;
  const z2 = b.z;

  result.push({ x: x1, y: y1, z: z1 });
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const dz = Math.abs(z2 - z1);
  const xs = x2 > x1 ? 1 : -1;
  const ys = y2 > y1 ? 1 : -1;
  const zs = z2 > z1 ? 1 : -1;

  if (dx >= dy && dx >= dz) {
    let p1 = 2 * dy - dx;
    let p2 = 2 * dz - dx;
    while (x1 !== x2) {
      x1 += xs;
      if (p1 >= 0) {
        y1 += ys;
        p1 -= 2 * dx;
      }
      if (p2 >= 0) {
        z1 += zs;
        p2 -= 2 * dx;
      }
      p1 += 2 * dy;
      p2 += 2 * dz;
      result.push({ x: x1, y: y1, z: z1 });
    }
  } else if (dy >= dx && dy >= dz) {
    let p1 = 2 * dx - dy;
    let p2 = 2 * dz - dy;
    while (y1 !== y2) {
      y1 += ys;
      if (p1 >= 0) {
        x1 += xs;
        p1 -= 2 * dy;
      }
      if (p2 >= 0) {
        z1 += zs;
        p2 -= 2 * dy;
      }
      p1 += 2 * dx;
      p2 += 2 * dz;
      result.push({ x: x1, y: y1, z: z1 });
    }
  } else {
    let p1 = 2 * dy - dz;
    let p2 = 2 * dx - dz;
    while (z1 !== z2) {
      z1 += zs;
      if (p1 >= 0) {
        y1 += ys;
        p1 -= 2 * dz;
      }
      if (p2 >= 0) {
        x1 += xs;
        p2 -= 2 * dz;
      }
      p1 += 2 * dy;
      p2 += 2 * dx;
      result.push({ x: x1, y: y1, z: z1 });
    }
  }

  return result;
}

function createCompassLabelSprite(text: string, bgColor: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#18202E';
    ctx.beginPath();
    ctx.arc(32, 32, 26, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.arc(32, 32, 21, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 32, 34);
  }
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.8, 1.8, 1);
  return sprite;
}

function BlueprintThumbnail({ voxels }: { voxels: BlueprintVoxel[] }) {
  const projected = useMemo(() => {
    const sorted = [...voxels].sort((a, b) => {
      const da = a.dx + a.dz;
      const db = b.dx + b.dz;
      if (da !== db) return da - db;
      if (a.dy !== b.dy) return a.dy - b.dy;
      return a.dx - b.dx;
    });

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    const polys = sorted.map((v) => {
      const ix = (v.dx - v.dz) * 5;
      const iy = (v.dx + v.dz) * 2.8 - v.dy * 4.5;
      minX = Math.min(minX, ix - 5);
      maxX = Math.max(maxX, ix + 5);
      minY = Math.min(minY, iy - 5);
      maxY = Math.max(maxY, iy + 6);
      return { ix, iy, color: BLOCKS[v.blockId].color };
    });

    const w = Math.max(12, maxX - minX + 4);
    const h = Math.max(12, maxY - minY + 4);
    return {
      polys,
      viewBox: `${minX - 2} ${minY - 2} ${w} ${h}`
    };
  }, [voxels]);

  return (
    <svg
      width={44}
      height={44}
      viewBox={projected.viewBox}
      style={{
        flexShrink: 0,
        background: '#E2E8F0',
        borderRadius: 8,
        border: '1.5px solid #18202E'
      }}
      aria-hidden="true"
    >
      {projected.polys.map((p, idx) => (
        <g key={idx}>
          <polygon
            points={`${p.ix},${p.iy - 2.8} ${p.ix + 5},${p.iy} ${p.ix},${p.iy + 2.8} ${p.ix - 5},${p.iy}`}
            fill={p.color}
            stroke="#18202E"
            strokeWidth={0.6}
          />
          <polygon
            points={`${p.ix - 5},${p.iy} ${p.ix},${p.iy + 2.8} ${p.ix},${p.iy + 7.2} ${p.ix - 5},${p.iy + 4.4}`}
            fill={p.color}
            fillOpacity={0.82}
            stroke="#18202E"
            strokeWidth={0.6}
          />
          <polygon
            points={`${p.ix + 5},${p.iy} ${p.ix},${p.iy + 2.8} ${p.ix},${p.iy + 7.2} ${p.ix + 5},${p.iy + 4.4}`}
            fill={p.color}
            fillOpacity={0.66}
            stroke="#18202E"
            strokeWidth={0.6}
          />
        </g>
      ))}
    </svg>
  );
}

export function VoxelEditorScreen() {
  const activePlotId = useGameStore((s) => s.activePlotId);
  const plots = useGameStore((s) => s.plots);
  const playerPools = useGameStore((s) => s.player.blockPools);
  const claimedMilestones = useGameStore((s) => s.player.claimedMilestones);
  const timeOfDay = useGameStore((s) => s.player.timeOfDay);

  const closeBuildMode = useGameStore((s) => s.closeBuildMode);
  const savePlotEdits = useGameStore((s) => s.savePlotEdits);
  const setTimeOfDay = useGameStore((s) => s.setTimeOfDay);
  const setActiveModal = useGameStore((s) => s.setActiveModal);

  const plot = activePlotId ? plots[activePlotId] : null;
  const unlockedTools = useMemo(
    () => getUnlockedBuilderTools(claimedMilestones),
    [claimedMilestones]
  );

  const [playerVoxels, setPlayerVoxels] = useState<Record<string, BlockId>>(() =>
    plot ? { ...plot.voxels } : {}
  );
  const [removedTerrainKeys, setRemovedTerrainKeys] = useState<string[]>(() =>
    plot ? [...plot.removedTerrainKeys] : []
  );
  const [poolDelta, setPoolDelta] = useState<Record<BlockPoolId, number>>(emptyPoolDelta);
  const [placedDelta, setPlacedDelta] = useState(0);
  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);

  const [tool, setTool] = useState<BuilderTool>('place');
  const [selectedBlock, setSelectedBlock] = useState<BlockId>('red');
  const [guideY, setGuideY] = useState(0);
  const [lineStart, setLineStart] = useState<VoxelCoord | null>(null);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState(BLUEPRINTS[0].id);
  const [blueprintAnchor, setBlueprintAnchor] = useState<{
    coord: VoxelCoord;
    turns: 0 | 1 | 2 | 3;
  } | null>(null);
  const [elevTick, setElevTick] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const effectivePools = useMemo<Record<BlockPoolId, number>>(
    () => ({
      solid: (playerPools.solid ?? 0) + (poolDelta.solid ?? 0),
      glass: (playerPools.glass ?? 0) + (poolDelta.glass ?? 0),
      light: (playerPools.light ?? 0) + (poolDelta.light ?? 0)
    }),
    [playerPools, poolDelta]
  );

  // Prefetch real Terrarium elevation tiles for center + 8 neighbor plots
  useEffect(() => {
    if (!plot) return;
    let cancelled = false;
    void ensureElevationTilesForPlotNeighborhood(plot.gx, plot.gy, 2).then((loaded) => {
      if (loaded && !cancelled) {
        setElevTick((t) => t + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [plot]);

  const centerTerrain = useMemo(() => {
    if (!plot) return {};
    const heights =
      elevTick === 0 &&
      plot.terrainHeights &&
      plot.terrainHeights.length === PLOT_VOXEL_XZ * PLOT_VOXEL_XZ
        ? plot.terrainHeights
        : samplePlotElevationGrid(plot.gx, plot.gy).heights;
    return generatePlotTerrainVoxels(
      plot.gx,
      plot.gy,
      plot.biome,
      heights,
      plot.baseElevationM
    );
  }, [plot, elevTick]);

  const composedCenter = useMemo(
    () => composeEffectiveVoxels(centerTerrain, removedTerrainKeys, playerVoxels),
    [centerTerrain, removedTerrainKeys, playerVoxels]
  );

  // Refs for Three.js scene & on-demand render scheduler
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const centerVoxelGroupRef = useRef<THREE.Group | null>(null);
  const neighborGroupRef = useRef<THREE.Group | null>(null);
  const hologramGroupRef = useRef<THREE.Group | null>(null);
  const guideGroupRef = useRef<THREE.Group | null>(null);
  const ghostMeshRef = useRef<THREE.Mesh | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const ndcRef = useRef(new THREE.Vector2());
  const isPointerDownRef = useRef(false);
  const isOrbitingRef = useRef(false);
  const requestRenderRef = useRef<(frames?: number) => void>(() => {});
  const materialsRef = useRef<{
    opaque: THREE.MeshBasicMaterial;
    translucent: THREE.MeshBasicMaterial;
    emissive: THREE.MeshBasicMaterial;
  } | null>(null);

  const latestStateRef = useRef({
    centerTerrain,
    effectiveVoxels: composedCenter.voxels,
    playerVoxels,
    removedTerrainKeys,
    poolDelta,
    placedDelta,
    effectivePools,
    tool,
    selectedBlock,
    guideY,
    lineStart,
    selectedBlueprintId
  });
  latestStateRef.current = {
    centerTerrain,
    effectiveVoxels: composedCenter.voxels,
    playerVoxels,
    removedTerrainKeys,
    poolDelta,
    placedDelta,
    effectivePools,
    tool,
    selectedBlock,
    guideY,
    lineStart,
    selectedBlueprintId
  };

  const pushHistory = useCallback((snap: HistorySnapshot) => {
    setUndoStack((prev) => [...prev.slice(-29), snap]);
    setRedoStack([]);
  }, []);

  const handleUndo = () => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [
        ...r,
        {
          playerVoxels: { ...playerVoxels },
          removedTerrainKeys: [...removedTerrainKeys],
          poolDelta: { ...poolDelta },
          placedDelta
        }
      ]);
      setPlayerVoxels(last.playerVoxels);
      setRemovedTerrainKeys(last.removedTerrainKeys);
      setPoolDelta(last.poolDelta);
      setPlacedDelta(last.placedDelta);
      setLineStart(null);
      return prev.slice(0, -1);
    });
  };

  const handleRedo = () => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = prev[prev.length - 1];
      setUndoStack((u) => [
        ...u,
        {
          playerVoxels: { ...playerVoxels },
          removedTerrainKeys: [...removedTerrainKeys],
          poolDelta: { ...poolDelta },
          placedDelta
        }
      ]);
      setPlayerVoxels(next.playerVoxels);
      setRemovedTerrainKeys(next.removedTerrainKeys);
      setPoolDelta(next.poolDelta);
      setPlacedDelta(next.placedDelta);
      setLineStart(null);
      return prev.slice(0, -1);
    });
  };

  const raycastVoxelTarget = useCallback((clientX: number, clientY: number) => {
    const host = hostRef.current;
    const camera = cameraRef.current;
    if (!host || !camera) return null;

    const rect = host.getBoundingClientRect();
    ndcRef.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );

    raycasterRef.current.setFromCamera(ndcRef.current, camera);
    const { origin, direction } = raycasterRef.current.ray;
    return raycastVoxelsDDA(
      origin,
      direction,
      latestStateRef.current.effectiveVoxels,
      latestStateRef.current.guideY
    );
  }, []);

  const handleCanvasTap = useCallback(
    (clientX: number, clientY: number) => {
      const target = raycastVoxelTarget(clientX, clientY);
      if (!target) return;

      const s = latestStateRef.current;
      setNotice(null);

      if (s.tool === 'break') {
        if (
          !target.hitCell ||
          !isValidVoxelCoord(target.hitCell.x, target.hitCell.y, target.hitCell.z)
        ) {
          return;
        }
        const k = voxelKey(target.hitCell.x, target.hitCell.y, target.hitCell.z);

        // Player block -> break & refund pool
        const playerBlock = s.playerVoxels[k];
        if (playerBlock) {
          pushHistory({
            playerVoxels: { ...s.playerVoxels },
            removedTerrainKeys: [...s.removedTerrainKeys],
            poolDelta: { ...s.poolDelta },
            placedDelta: s.placedDelta
          });
          const nextPV = { ...s.playerVoxels };
          delete nextPV[k];
          const pool = BLOCKS[playerBlock].pool;
          setPlayerVoxels(nextPV);
          setPoolDelta({
            ...s.poolDelta,
            [pool]: (s.poolDelta[pool] ?? 0) + 1
          });
          return;
        }

        // Generated terrain block -> excavate without refund
        if (s.centerTerrain[k] && !s.removedTerrainKeys.includes(k)) {
          pushHistory({
            playerVoxels: { ...s.playerVoxels },
            removedTerrainKeys: [...s.removedTerrainKeys],
            poolDelta: { ...s.poolDelta },
            placedDelta: s.placedDelta
          });
          setRemovedTerrainKeys([...s.removedTerrainKeys, k]);
        }
        return;
      }

      if (s.tool === 'pick') {
        if (!target.hitCell) return;
        const k = voxelKey(target.hitCell.x, target.hitCell.y, target.hitCell.z);
        const picked = s.effectiveVoxels[k];
        if (picked) {
          setSelectedBlock(picked);
          setTool('place');
          setNotice(`${BLOCKS[picked].nameJa}を選択しました`);
        }
        return;
      }

      const placeCoord = target.placeCell;
      if (!isValidVoxelCoord(placeCoord.x, placeCoord.y, placeCoord.z)) {
        setNotice('区画の範囲（12×48×12）の外には置けません');
        return;
      }

      if (s.tool === 'place') {
        const k = voxelKey(placeCoord.x, placeCoord.y, placeCoord.z);
        if (s.effectiveVoxels[k]) return;
        const pool = BLOCKS[s.selectedBlock].pool;
        if ((s.effectivePools[pool] ?? 0) <= 0) {
          setNotice(
            `${BLOCK_POOLS[pool].nameJa}が足りません。クラフトで補充できます`
          );
          return;
        }
        pushHistory({
          playerVoxels: { ...s.playerVoxels },
          removedTerrainKeys: [...s.removedTerrainKeys],
          poolDelta: { ...s.poolDelta },
          placedDelta: s.placedDelta
        });
        setPlayerVoxels({ ...s.playerVoxels, [k]: s.selectedBlock });
        setPoolDelta({
          ...s.poolDelta,
          [pool]: (s.poolDelta[pool] ?? 0) - 1
        });
        setPlacedDelta(s.placedDelta + 1);
        return;
      }

      if (s.tool === 'line') {
        if (!s.lineStart) {
          setLineStart(placeCoord);
          setNotice(
            `始点 (${placeCoord.x}, ${placeCoord.y}, ${placeCoord.z}) を設定。終点をタップしてください`
          );
          return;
        }
        const cells = bresenham3D(s.lineStart, placeCoord);
        const pool = BLOCKS[s.selectedBlock].pool;
        let available = s.effectivePools[pool] ?? 0;
        const nextPV = { ...s.playerVoxels };
        let placed = 0;

        for (const c of cells) {
          if (!isValidVoxelCoord(c.x, c.y, c.z)) continue;
          const k = voxelKey(c.x, c.y, c.z);
          if (s.effectiveVoxels[k] || nextPV[k]) continue;
          if (available <= 0) break;
          nextPV[k] = s.selectedBlock;
          available--;
          placed++;
        }

        setLineStart(null);
        if (placed === 0) {
          setNotice('ブロック不足または既存ブロックのため配置できませんでした');
          return;
        }

        pushHistory({
          playerVoxels: { ...s.playerVoxels },
          removedTerrainKeys: [...s.removedTerrainKeys],
          poolDelta: { ...s.poolDelta },
          placedDelta: s.placedDelta
        });
        setPlayerVoxels(nextPV);
        setPoolDelta({
          ...s.poolDelta,
          [pool]: (s.poolDelta[pool] ?? 0) - placed
        });
        setPlacedDelta(s.placedDelta + placed);
        return;
      }

      if (s.tool === 'fill') {
        const pool = BLOCKS[s.selectedBlock].pool;
        let available = s.effectivePools[pool] ?? 0;
        const nextPV = { ...s.playerVoxels };
        let placed = 0;

        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            const nx = placeCoord.x + dx;
            const nz = placeCoord.z + dz;
            if (!isValidVoxelCoord(nx, placeCoord.y, nz)) continue;
            const k = voxelKey(nx, placeCoord.y, nz);
            if (s.effectiveVoxels[k] || nextPV[k]) continue;
            if (available <= 0) break;
            nextPV[k] = s.selectedBlock;
            available--;
            placed++;
          }
        }

        if (placed === 0) {
          setNotice('置ける空きマスまたは在庫がありません');
          return;
        }
        pushHistory({
          playerVoxels: { ...s.playerVoxels },
          removedTerrainKeys: [...s.removedTerrainKeys],
          poolDelta: { ...s.poolDelta },
          placedDelta: s.placedDelta
        });
        setPlayerVoxels(nextPV);
        setPoolDelta({
          ...s.poolDelta,
          [pool]: (s.poolDelta[pool] ?? 0) - placed
        });
        setPlacedDelta(s.placedDelta + placed);
        return;
      }

      if (s.tool === 'blueprint') {
        setBlueprintAnchor((prev) => ({
          coord: placeCoord,
          turns: prev ? prev.turns : 0
        }));
        setNotice('3Dプレビューを確認し「配置確定」を押してください');
      }
    },
    [pushHistory, raycastVoxelTarget]
  );

  // Initialize Three.js viewport with on-demand rendering
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(EDITOR_BG_HEX[useGameStore.getState().player.timeOfDay]);
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(
      45,
      host.clientWidth / Math.max(1, host.clientHeight),
      0.1,
      280
    );
    camera.position.set(19, 17, 21);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(6, 2.5, 6);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.minDistance = 6;
    controls.maxDistance = 65;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.update();
    controlsRef.current = controls;

    const opaqueMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const translucentMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.62,
      depthWrite: false
    });
    const emissiveMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      color: 0xffffff
    });
    materialsRef.current = {
      opaque: opaqueMat,
      translucent: translucentMat,
      emissive: emissiveMat
    };

    // Active center plot outline frame + subtle ground grid
    const borderGeom = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(PLOT_VOXEL_XZ, 0.04, PLOT_VOXEL_XZ)
    );
    const borderLine = new THREE.LineSegments(
      borderGeom,
      new THREE.LineBasicMaterial({ color: 0x18202e })
    );
    borderLine.position.set(PLOT_VOXEL_XZ / 2, 0.02, PLOT_VOXEL_XZ / 2);
    scene.add(borderLine);

    const groundGrid = new THREE.GridHelper(
      PLOT_VOXEL_XZ,
      PLOT_VOXEL_XZ,
      0x18202e,
      0x94a3b8
    );
    groundGrid.position.set(PLOT_VOXEL_XZ / 2, 0.008, PLOT_VOXEL_XZ / 2);
    scene.add(groundGrid);

    // Compass labels N / E / S / W on the 4 borders
    const labelN = createCompassLabelSprite('N', '#EF4444');
    labelN.position.set(6, 1.5, -1.2);
    const labelS = createCompassLabelSprite('S', '#2563EB');
    labelS.position.set(6, 1.5, 13.2);
    const labelE = createCompassLabelSprite('E', '#10B981');
    labelE.position.set(13.2, 1.5, 6);
    const labelW = createCompassLabelSprite('W', '#F59E0B');
    labelW.position.set(-1.2, 1.5, 6);
    scene.add(labelN, labelS, labelE, labelW);

    // Height guide plane
    const guideGroup = new THREE.Group();
    const guideGrid = new THREE.GridHelper(
      PLOT_VOXEL_XZ,
      PLOT_VOXEL_XZ,
      0x2563eb,
      0x2563eb
    );
    guideGrid.position.set(PLOT_VOXEL_XZ / 2, 0.015, PLOT_VOXEL_XZ / 2);
    (guideGrid.material as THREE.Material).transparent = true;
    (guideGrid.material as THREE.Material).opacity = 0.52;
    guideGroup.add(guideGrid);
    scene.add(guideGroup);
    guideGroupRef.current = guideGroup;

    // Ghost target wireframe
    const ghostGeom = new THREE.BoxGeometry(1.03, 1.03, 1.03);
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      wireframe: true,
      transparent: true,
      opacity: 0.85
    });
    const ghostMesh = new THREE.Mesh(ghostGeom, ghostMat);
    ghostMesh.visible = false;
    scene.add(ghostMesh);
    ghostMeshRef.current = ghostMesh;

    const neighborGroup = new THREE.Group();
    scene.add(neighborGroup);
    neighborGroupRef.current = neighborGroup;

    const centerVoxelGroup = new THREE.Group();
    scene.add(centerVoxelGroup);
    centerVoxelGroupRef.current = centerVoxelGroup;

    const hologramGroup = new THREE.Group();
    scene.add(hologramGroup);
    hologramGroupRef.current = hologramGroup;

    // On-demand render loop (zero idle GPU burn & zero damping spin loop)
    let rafId = 0;
    let hoverRafId = 0;
    let framesLeft = 2;
    let updatingControls = false;
    const lastCamPos = camera.position.clone();
    const lastTargetPos = controls.target.clone();

    const tick = () => {
      rafId = 0;
      updatingControls = true;
      controls.update();
      updatingControls = false;
      renderer.render(scene, camera);

      const moved =
        camera.position.distanceToSquared(lastCamPos) > 1e-6 ||
        controls.target.distanceToSquared(lastTargetPos) > 1e-6;
      lastCamPos.copy(camera.position);
      lastTargetPos.copy(controls.target);

      if (framesLeft > 0) framesLeft--;
      if (isOrbitingRef.current || moved || framesLeft > 0) {
        rafId = requestAnimationFrame(tick);
      }
    };

    const requestRender = (frames: number = 2) => {
      framesLeft = Math.max(framesLeft, frames);
      if (!rafId) {
        rafId = requestAnimationFrame(tick);
      }
    };
    requestRenderRef.current = requestRender;

    const onControlsStart = () => {
      isOrbitingRef.current = true;
      if (ghostMeshRef.current && ghostMeshRef.current.visible) {
        ghostMeshRef.current.visible = false;
      }
      requestRender(2);
    };

    const onControlsEnd = () => {
      isOrbitingRef.current = false;
      requestRender(20);
    };

    const onControlsChange = () => {
      if (!updatingControls) requestRender(2);
    };

    controls.addEventListener('start', onControlsStart);
    controls.addEventListener('end', onControlsEnd);
    controls.addEventListener('change', onControlsChange);
    requestRender(4);

    // Gesture handling (tap vs orbit)
    let downX = 0;
    let downY = 0;
    let downTime = 0;
    let lastHoverX = 0;
    let lastHoverY = 0;

    const onPointerDown = (e: PointerEvent) => {
      isPointerDownRef.current = true;
      downX = e.clientX;
      downY = e.clientY;
      downTime = performance.now();
      requestRender(4);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (
        e.pointerType === 'touch' ||
        isPointerDownRef.current ||
        isOrbitingRef.current ||
        e.buttons !== 0
      ) {
        if (ghostMeshRef.current && ghostMeshRef.current.visible) {
          ghostMeshRef.current.visible = false;
          requestRender(1);
        }
        return;
      }

      lastHoverX = e.clientX;
      lastHoverY = e.clientY;
      if (hoverRafId) return;

      hoverRafId = requestAnimationFrame(() => {
        hoverRafId = 0;
        if (isPointerDownRef.current || isOrbitingRef.current) return;
        const t = raycastVoxelTarget(lastHoverX, lastHoverY);
        const gm = ghostMeshRef.current;
        if (!gm) return;
        if (!t) {
          if (gm.visible) {
            gm.visible = false;
            requestRender(1);
          }
          return;
        }
        const c =
          latestStateRef.current.tool === 'break' || latestStateRef.current.tool === 'pick'
            ? t.hitCell
            : t.placeCell;
        if (c && isValidVoxelCoord(c.x, c.y, c.z)) {
          gm.position.set(c.x + 0.5, c.y + 0.5, c.z + 0.5);
          gm.visible = true;
        } else {
          gm.visible = false;
        }
        requestRender(1);
      });
    };

    const onPointerUp = (e: PointerEvent) => {
      isPointerDownRef.current = false;
      const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
      const dt = performance.now() - downTime;
      if (dist < 10 && dt < 360) {
        handleCanvasTap(e.clientX, e.clientY);
      }
      requestRender(18);
    };

    const onPointerCancel = () => {
      isPointerDownRef.current = false;
      isOrbitingRef.current = false;
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('pointerdown', onPointerDown);
    domEl.addEventListener('pointermove', onPointerMove);
    domEl.addEventListener('pointerup', onPointerUp);
    domEl.addEventListener('pointercancel', onPointerCancel);

    const onResize = () => {
      if (!host) return;
      camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
      requestRender(2);
    };
    window.addEventListener('resize', onResize);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (hoverRafId) cancelAnimationFrame(hoverRafId);
      controls.removeEventListener('start', onControlsStart);
      controls.removeEventListener('end', onControlsEnd);
      controls.removeEventListener('change', onControlsChange);
      window.removeEventListener('resize', onResize);
      domEl.removeEventListener('pointerdown', onPointerDown);
      domEl.removeEventListener('pointermove', onPointerMove);
      domEl.removeEventListener('pointerup', onPointerUp);
      domEl.removeEventListener('pointercancel', onPointerCancel);
      controls.dispose();
      borderGeom.dispose();
      ghostGeom.dispose();
      ghostMat.dispose();
      for (const s of [labelN, labelS, labelE, labelW]) {
        s.material.map?.dispose();
        s.material.dispose();
      }
      opaqueMat.dispose();
      translucentMat.dispose();
      emissiveMat.dispose();
      sceneRef.current = null;
      renderer.dispose();
      if (domEl.parentNode === host) host.removeChild(domEl);
    };
  }, [handleCanvasTap, raycastVoxelTarget]);

  // Rebuild active center plot mesh
  useEffect(() => {
    const group = centerVoxelGroupRef.current;
    const mats = materialsRef.current;
    if (!group || !mats) return;

    while (group.children.length > 0) {
      const child = group.children[0] as THREE.Mesh;
      group.remove(child);
      child.geometry.dispose();
    }

    const { opaqueGeometry, translucentGeometry, emissiveGeometry } = buildPlotMeshes(
      composedCenter.voxels
    );
    if (opaqueGeometry) group.add(new THREE.Mesh(opaqueGeometry, mats.opaque));
    if (emissiveGeometry) group.add(new THREE.Mesh(emissiveGeometry, mats.emissive));
    if (translucentGeometry) group.add(new THREE.Mesh(translucentGeometry, mats.translucent));
    requestRenderRef.current(2);
  }, [composedCenter]);

  // Build merged 8-neighbor context meshes (1-3 draw calls total) with continuous elevation
  useEffect(() => {
    const nGroup = neighborGroupRef.current;
    const mats = materialsRef.current;
    if (!nGroup || !mats || !plot) return;

    while (nGroup.children.length > 0) {
      const child = nGroup.children[0] as THREE.Mesh;
      nGroup.remove(child);
      child.geometry.dispose();
    }

    const centerLngLat = plotCoordToCenterLngLat(plot.gx, plot.gy);
    const voxelMeters = Math.max(0.5, plotSideLengthMeters(centerLngLat.lat) / PLOT_VOXEL_XZ);
    const neighborInputs: NeighborPlotMeshInput[] = [];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue;
        const nx = plot.gx + dx;
        const ny = plot.gy + dz;
        const nId = makePlotId(nx, ny);
        const existing = plots[nId];

        const elev = existing
          ? {
              heights:
                elevTick === 0 &&
                existing.terrainHeights &&
                existing.terrainHeights.length === 144
                  ? existing.terrainHeights
                  : samplePlotElevationGrid(nx, ny).heights,
              baseElevationM: existing.baseElevationM
            }
          : samplePlotElevationGrid(nx, ny);

        const nCenter = plotCoordToCenterLngLat(nx, ny);
        const nBiome = existing?.biome ?? fallbackBiomeForCoord(nCenter.lng, nCenter.lat);
        const terrain = generatePlotTerrainVoxels(
          nx,
          ny,
          nBiome,
          elev.heights,
          elev.baseElevationM
        );
        const composed = composeEffectiveVoxels(
          terrain,
          existing?.removedTerrainKeys ?? [],
          existing?.voxels ?? {}
        );

        neighborInputs.push({
          voxels: composed.voxels,
          offsetX: dx * PLOT_VOXEL_XZ,
          offsetY: (elev.baseElevationM - plot.baseElevationM) / voxelMeters,
          offsetZ: dz * PLOT_VOXEL_XZ
        });
      }
    }

    const { opaqueGeometry, translucentGeometry, emissiveGeometry } =
      buildCombinedNeighborMeshes(neighborInputs);
    if (opaqueGeometry) nGroup.add(new THREE.Mesh(opaqueGeometry, mats.opaque));
    if (emissiveGeometry) nGroup.add(new THREE.Mesh(emissiveGeometry, mats.emissive));
    if (translucentGeometry) nGroup.add(new THREE.Mesh(translucentGeometry, mats.translucent));

    requestRenderRef.current(2);
  }, [plot, plots, elevTick]);

  // Build 3D translucent blueprint hologram preview
  useEffect(() => {
    const hGroup = hologramGroupRef.current;
    if (!hGroup) return;

    while (hGroup.children.length > 0) {
      const child = hGroup.children[0] as THREE.Mesh;
      hGroup.remove(child);
      child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else {
        child.material.dispose();
      }
    }

    if (tool !== 'blueprint' || !blueprintAnchor) {
      requestRenderRef.current(1);
      return;
    }

    const bp = BLUEPRINTS.find((b) => b.id === selectedBlueprintId) ?? BLUEPRINTS[0];
    const rotated = rotateBlueprintVoxels(bp.voxels, blueprintAnchor.turns);
    const previewMap: Record<string, BlockId> = {};
    for (const v of rotated) {
      const x = blueprintAnchor.coord.x + v.dx;
      const y = blueprintAnchor.coord.y + v.dy;
      const z = blueprintAnchor.coord.z + v.dz;
      if (isValidVoxelCoord(x, y, z)) {
        previewMap[voxelKey(x, y, z)] = v.blockId;
      }
    }

    const { opaqueGeometry, translucentGeometry, emissiveGeometry } =
      buildPlotMeshes(previewMap);
    const holoMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.62,
      depthWrite: false
    });

    for (const geom of [opaqueGeometry, translucentGeometry, emissiveGeometry]) {
      if (geom) hGroup.add(new THREE.Mesh(geom, holoMat));
    }

    requestRenderRef.current(2);
  }, [tool, blueprintAnchor, selectedBlueprintId]);

  // Update height guide plane & gently adjust camera target when building high
  useEffect(() => {
    if (guideGroupRef.current) {
      guideGroupRef.current.position.y = guideY;
      guideGroupRef.current.visible = guideY > 0;
    }
    if (controlsRef.current) {
      controlsRef.current.target.y = Math.max(2.5, guideY + 1);
    }
    requestRenderRef.current(6);
  }, [guideY]);

  // Update time-of-day tints & scene background
  useEffect(() => {
    const mats = materialsRef.current;
    if (!mats) return;
    const tint = EDITOR_TINTS[timeOfDay];
    mats.opaque.color.setHex(tint.opaque);
    mats.translucent.color.setHex(tint.translucent);
    mats.emissive.color.setHex(tint.emissive);
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(EDITOR_BG_HEX[timeOfDay]);
    }
    requestRenderRef.current(2);
  }, [timeOfDay]);

  if (!plot) return null;

  const cycleTime = () => {
    setTimeOfDay(timeOfDay === 'day' ? 'dusk' : timeOfDay === 'dusk' ? 'night' : 'day');
  };

  const TimeIcon =
    timeOfDay === 'day' ? Sun : timeOfDay === 'dusk' ? Sunrise : Moon;

  const toolItems: Array<{
    id: BuilderTool;
    label: string;
    icon: typeof Hammer;
  }> = [
    { id: 'place', label: '置く', icon: Hammer },
    { id: 'break', label: '壊す', icon: Eraser },
    { id: 'pick', label: 'スポイト', icon: Pipette },
    { id: 'line', label: 'ライン', icon: SlidersHorizontal },
    { id: 'fill', label: '床塗り', icon: Grid },
    { id: 'blueprint', label: '設計図', icon: Layers }
  ];

  const handleConfirmBlueprint = () => {
    if (!blueprintAnchor) return;
    const bp = BLUEPRINTS.find((b) => b.id === selectedBlueprintId) ?? BLUEPRINTS[0];
    const res = applyBlueprintToVoxels(
      composedCenter.voxels,
      playerVoxels,
      effectivePools,
      bp,
      blueprintAnchor.coord.x,
      blueprintAnchor.coord.y,
      blueprintAnchor.coord.z,
      blueprintAnchor.turns
    );

    if (res.placedCount === 0) {
      setNotice(`${bp.nameJa}用の在庫が足りないか、空いている場所がありません`);
      return;
    }

    pushHistory({
      playerVoxels: { ...playerVoxels },
      removedTerrainKeys: [...removedTerrainKeys],
      poolDelta: { ...poolDelta },
      placedDelta
    });

    setPlayerVoxels(res.nextPlayerVoxels);
    setPoolDelta({
      solid: poolDelta.solid + (res.nextPools.solid - effectivePools.solid),
      glass: poolDelta.glass + (res.nextPools.glass - effectivePools.glass),
      light: poolDelta.light + (res.nextPools.light - effectivePools.light)
    });
    setPlacedDelta(placedDelta + res.placedCount);
    setBlueprintAnchor(null);
    setNotice(`${bp.nameJa}（${res.placedCount}個）を配置しました`);
  };

  const handleRestoreTerrain = () => {
    if (removedTerrainKeys.length === 0) return;
    pushHistory({
      playerVoxels: { ...playerVoxels },
      removedTerrainKeys: [...removedTerrainKeys],
      poolDelta: { ...poolDelta },
      placedDelta
    });
    setRemovedTerrainKeys([]);
    setNotice('自動生成された地形を元に戻しました');
  };

  const handleSave = async () => {
    await savePlotEdits(
      plot.plotId,
      playerVoxels,
      removedTerrainKeys,
      effectivePools,
      placedDelta
    );
  };

  return (
    <div className="builder-root" style={{ background: EDITOR_BG[timeOfDay] }}>
      <div ref={hostRef} className="builder-canvas-host" />

      <div className="builder-topbar">
        <div className="builder-topbar-group">
          <button
            type="button"
            className="icon-pill-btn"
            onClick={closeBuildMode}
            aria-label="保存せず地図へ戻る"
          >
            <ArrowLeft size={17} />
          </button>
          <div className="builder-title-pill">
            {BIOME_META[plot.biome].nameJa} ({Object.keys(playerVoxels).length})
          </div>
        </div>

        <div className="builder-topbar-group">
          <button
            type="button"
            className="icon-pill-btn"
            onClick={cycleTime}
            aria-label="時間帯を切り替える"
          >
            <TimeIcon size={16} />
          </button>
          <button
            type="button"
            className="icon-pill-btn"
            disabled={undoStack.length === 0}
            onClick={handleUndo}
            aria-label="元に戻す"
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            className="icon-pill-btn"
            disabled={redoStack.length === 0}
            onClick={handleRedo}
            aria-label="やり直す"
          >
            <Redo2 size={16} />
          </button>
          <button
            type="button"
            className="btn-sage"
            style={{ minHeight: 44, padding: '0 12px' }}
            onClick={() => void handleSave()}
          >
            <Check size={16} />
            保存して地図へ
          </button>
        </div>
      </div>

      {notice && (
        <div
          style={{
            position: 'absolute',
            top: 64,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 25,
            background: '#18202E',
            color: '#FFFFFF',
            border: '2px solid #FFFFFF',
            padding: '7px 14px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 800,
            maxWidth: '90%',
            textAlign: 'center',
            pointerEvents: 'none'
          }}
        >
          {notice}
        </div>
      )}

      <div className="builder-height-panel" aria-label="高さガイド">
        <span style={{ fontSize: 11, fontWeight: 900, minWidth: 38 }}>
          Y={guideY}
        </span>
        <button
          type="button"
          className="height-step-btn"
          onClick={() => setGuideY((y) => Math.max(0, y - 1))}
          aria-label="高さを下げる"
        >
          <Minus size={14} />
        </button>
        <input
          type="range"
          min={0}
          max={PLOT_VOXEL_Y - 1}
          value={guideY}
          onChange={(e) => setGuideY(Number(e.target.value))}
          className="height-slider"
          aria-label="高さガイドスライダー"
        />
        <button
          type="button"
          className="height-step-btn"
          onClick={() => setGuideY((y) => Math.min(PLOT_VOXEL_Y - 1, y + 1))}
          aria-label="高さを上げる"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="builder-bottom-dock">
        {tool === 'blueprint' && blueprintAnchor && (
          <div className="blueprint-hologram-bar">
            <button
              type="button"
              className="mini-chip-btn"
              style={{ flex: 'none', padding: '0 10px', minHeight: 34 }}
              onClick={() =>
                setBlueprintAnchor((prev) =>
                  prev
                    ? {
                        ...prev,
                        turns: ((prev.turns + 1) % 4) as 0 | 1 | 2 | 3
                      }
                    : null
                )
              }
            >
              <RotateCw size={12} style={{ marginRight: 3, verticalAlign: 'middle' }} />
              90°回転
            </button>
            <button
              type="button"
              className="craft-btn"
              style={{ background: '#10B981', minHeight: 34 }}
              onClick={handleConfirmBlueprint}
            >
              配置確定
            </button>
            <button
              type="button"
              className="mini-chip-btn"
              style={{ flex: 'none', padding: '0 8px', minHeight: 34 }}
              onClick={() => setBlueprintAnchor(null)}
              aria-label="プレビューをキャンセル"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {tool === 'blueprint' && (
          <div className="blueprint-tray" aria-label="設計図一覧">
            {BLUEPRINTS.map((bp) => {
              const cost = getBlueprintPoolCost(bp);
              return (
                <button
                  key={bp.id}
                  type="button"
                  className={`blueprint-card-btn ${
                    selectedBlueprintId === bp.id ? 'selected' : ''
                  }`}
                  onClick={() => {
                    setSelectedBlueprintId(bp.id);
                    setNotice('配置したい地面やブロックの上をタップしてください');
                  }}
                >
                  <BlueprintThumbnail voxels={bp.voxels} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 900 }}>{bp.nameJa}</div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#475569', marginTop: 2 }}>
                      固 {cost.solid}/{effectivePools.solid} · 硝 {cost.glass}/{effectivePools.glass} · 灯 {cost.light}/{effectivePools.light}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="builder-tools-row">
          {toolItems.map((item) => {
            const Icon = item.icon;
            const unlocked = unlockedTools.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                className={`tool-chip ${tool === item.id ? 'active' : ''} ${
                  !unlocked ? 'locked' : ''
                }`}
                onClick={() => {
                  if (!unlocked) {
                    setNotice('探索・建築の実績を達成すると解放されます');
                    return;
                  }
                  setLineStart(null);
                  setBlueprintAnchor(null);
                  setTool(item.id);
                }}
              >
                <Icon size={14} />
                <span>{item.label}</span>
              </button>
            );
          })}
          {removedTerrainKeys.length > 0 && (
            <button type="button" className="tool-chip" onClick={handleRestoreTerrain}>
              <RotateCcw size={14} />
              <span>地形復元</span>
            </button>
          )}
          <button
            type="button"
            className="tool-chip"
            onClick={() => setActiveModal('craft')}
          >
            <Sparkles size={14} />
            <span>補充クラフト</span>
          </button>
        </div>

        <div className="pool-bar" aria-label="ブロック系統在庫">
          <span className="pool-badge">
            <span className="swatch-dot" style={{ width: 12, height: 12, background: BLOCK_POOLS.solid.color }} />
            ソリッド: {effectivePools.solid}
          </span>
          <span className="pool-badge">
            <span className="swatch-dot" style={{ width: 12, height: 12, background: BLOCK_POOLS.glass.color }} />
            ガラス: {effectivePools.glass}
          </span>
          <span className="pool-badge">
            <span className="swatch-dot" style={{ width: 12, height: 12, background: BLOCK_POOLS.light.color }} />
            ライト: {effectivePools.light}
          </span>
        </div>

        <div className="palette-row" aria-label="ブロックカラーパレット">
          {BLOCK_ORDER.map((id) => {
            const b = BLOCKS[id];
            const poolCount = effectivePools[b.pool] ?? 0;
            return (
              <button
                key={id}
                type="button"
                className={`palette-item ${selectedBlock === id ? 'selected' : ''} ${
                  poolCount <= 0 ? 'empty' : ''
                }`}
                onClick={() => {
                  setSelectedBlock(id);
                  if (tool === 'break' || tool === 'pick') setTool('place');
                }}
              >
                <span
                  className="block-swatch-lg"
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 7,
                    backgroundColor: b.color,
                    opacity: b.translucent ? 0.72 : 1
                  }}
                />
                <span className="palette-label">{b.nameJa}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
