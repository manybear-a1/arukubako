import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import {
  PLOT_VOXEL_XZ,
  VOXEL_MERCATOR_SIZE,
  haversineMeters,
  mercatorToLngLat,
  plotCoordToCenterLngLat,
  plotCoordToLngLatBounds,
  plotSideLengthMeters
} from '../core/geoGrid';
import {
  composeEffectiveVoxels,
  generatePlotTerrainVoxels,
  samplePlotElevationGrid
} from '../core/terrainGenerator';
import type { PlotCoord, PlotData, PlotId, TimeOfDay } from '../core/types';
import { buildPlotMeshes } from './voxelMesher';

export const MIN_3D_MAP_ZOOM = 15.2;
const MAX_VISIBLE_3D_PLOTS = 36;
const MAX_CACHED_PLOTS = 56;
const FOUNDATION_DEPTH_BLOCKS = 2.5;

interface CachedPlotMesh {
  cacheKey: string;
  gx: number;
  gy: number;
  baseElevationM: number;
  elevationReliefM: number;
  group: THREE.Group;
  disposables: THREE.BufferGeometry[];
  lastUsed: number;
}

const TIME_TINTS: Record<
  TimeOfDay,
  { opaque: number; translucent: number; translucentOpacity: number; emissive: number }
> = {
  day: {
    opaque: 0xffffff,
    translucent: 0xffffff,
    translucentOpacity: 0.62,
    emissive: 0xffffff
  },
  dusk: {
    opaque: 0xffd7b8,
    translucent: 0xeec4b2,
    translucentOpacity: 0.66,
    emissive: 0xfff5b8
  },
  night: {
    opaque: 0x7b8db5,
    translucent: 0x7490bd,
    translucentOpacity: 0.72,
    emissive: 0xffffff
  }
};

function makePlotCacheKey(plot: PlotData): string {
  return `${plot.updatedAt}:${plot.biome}:${plot.baseElevationM}:${plot.elevationReliefM}:${plot.removedTerrainKeys.length}:${Object.keys(plot.voxels).length}`;
}

export class MapVoxelLayer implements maplibregl.CustomLayerInterface {
  public readonly id = 'arukubako-voxels';
  public readonly type = 'custom' as const;
  public readonly renderingMode = '3d' as const;

  private map: maplibregl.Map | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera();

  private anchorGx = 0;
  private anchorGy = 0;
  private anchorElevM = 0;
  private hasAnchor = false;

  private pendingPlots: Record<PlotId, PlotData> = {};
  private cache = new Map<PlotId, CachedPlotMesh>();
  private activePlotIds = new Set<PlotId>();
  private lruCounter = 0;
  private terrainDirty = true;

  private opaqueMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    color: TIME_TINTS.day.opaque,
    polygonOffset: true,
    polygonOffsetFactor: -1.0,
    polygonOffsetUnits: -4.0
  });
  private translucentMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    color: TIME_TINTS.day.translucent,
    transparent: true,
    opacity: TIME_TINTS.day.translucentOpacity,
    depthWrite: false
  });
  private emissiveMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    color: TIME_TINTS.day.emissive,
    polygonOffset: true,
    polygonOffsetFactor: -1.0,
    polygonOffsetUnits: -4.0
  });

  public onAdd(map: maplibregl.Map, gl: WebGLRenderingContext): void {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true
    });
    this.renderer.autoClear = false;
    this.updateVisibleViewport(this.pendingPlots);
  }

  public onRemove(): void {
    for (const entry of this.cache.values()) {
      this.scene.remove(entry.group);
      for (const geom of entry.disposables) geom.dispose();
    }
    this.cache.clear();
    this.activePlotIds.clear();
    this.opaqueMaterial.dispose();
    this.translucentMaterial.dispose();
    this.emissiveMaterial.dispose();
    this.renderer?.dispose();
    this.renderer = null;
    this.map = null;
  }

  public markTerrainDirty(): void {
    this.terrainDirty = true;
  }

  public setReferencePlot(coord: PlotCoord): void {
    if (
      !this.hasAnchor ||
      Math.abs(coord.gx - this.anchorGx) > 160 ||
      Math.abs(coord.gy - this.anchorGy) > 160
    ) {
      this.anchorGx = coord.gx;
      this.anchorGy = coord.gy;
      this.hasAnchor = true;
      this.updateVisibleViewport(this.pendingPlots);
    }
  }

  public setTimeOfDay(tod: TimeOfDay): void {
    const tint = TIME_TINTS[tod];
    this.opaqueMaterial.color.setHex(tint.opaque);
    this.translucentMaterial.color.setHex(tint.translucent);
    this.translucentMaterial.opacity = tint.translucentOpacity;
    this.emissiveMaterial.color.setHex(tint.emissive);
    this.map?.triggerRepaint();
  }

  public syncPlots(plots: Record<PlotId, PlotData>): void {
    this.pendingPlots = plots;
    if (!this.map) return;
    this.updateVisibleViewport(plots);
  }

  /**
   * Aligns all active 3D voxel plots vertically to MapLibre's live 3D terrain mesh
   * using one center terrain query per plot so plots sit flush into slopes cleanly.
   */
  public syncTerrainElevations(triggerRepaint = true): void {
    if (!this.map || !this.hasAnchor) return;
    this.terrainDirty = false;

    const hasTerrain = Boolean(this.map.getTerrain());
    const anchorCenter = mercatorToLngLat(
      this.anchorGx * PLOT_VOXEL_XZ * VOXEL_MERCATOR_SIZE,
      this.anchorGy * PLOT_VOXEL_XZ * VOXEL_MERCATOR_SIZE
    );
    const queriedAnchor = hasTerrain
      ? this.map.queryTerrainElevation([anchorCenter.lng, anchorCenter.lat])
      : null;
    this.anchorElevM =
      typeof queriedAnchor === 'number' && Number.isFinite(queriedAnchor)
        ? queriedAnchor
        : 0;

    const mapCenter = this.map.getCenter();
    const voxelMeters = Math.max(0.5, plotSideLengthMeters(mapCenter.lat) / PLOT_VOXEL_XZ);

    for (const id of this.activePlotIds) {
      const entry = this.cache.get(id);
      if (!entry) continue;

      if (hasTerrain) {
        const center = plotCoordToCenterLngLat(entry.gx, entry.gy);
        const centerM = this.map.queryTerrainElevation([center.lng, center.lat]);
        const plotMinM =
          typeof centerM === 'number' && Number.isFinite(centerM)
            ? centerM - entry.elevationReliefM * 0.45
            : null;
        const yOffset =
          plotMinM !== null ? (plotMinM - this.anchorElevM) / voxelMeters - 0.15 : 0;
        entry.group.position.set(
          (entry.gx - this.anchorGx) * PLOT_VOXEL_XZ,
          yOffset,
          (entry.gy - this.anchorGy) * PLOT_VOXEL_XZ
        );
      } else {
        entry.group.position.set(
          (entry.gx - this.anchorGx) * PLOT_VOXEL_XZ,
          0,
          (entry.gy - this.anchorGy) * PLOT_VOXEL_XZ
        );
      }
    }

    if (triggerRepaint) {
      this.map.triggerRepaint();
    }
  }

  public updateVisibleViewport(plots: Record<PlotId, PlotData> = this.pendingPlots): void {
    this.pendingPlots = plots;
    if (!this.map) return;

    const zoom = this.map.getZoom();
    if (zoom < MIN_3D_MAP_ZOOM) {
      for (const id of this.activePlotIds) {
        const entry = this.cache.get(id);
        if (entry) this.scene.remove(entry.group);
      }
      this.activePlotIds.clear();
      this.map.triggerRepaint();
      return;
    }

    const bounds = this.map.getBounds();
    const padLng = 0.0005;
    const padLat = 0.0005;
    const minLng = bounds.getWest() - padLng;
    const maxLng = bounds.getEast() + padLng;
    const minLat = bounds.getSouth() - padLat;
    const maxLat = bounds.getNorth() + padLat;
    const center = this.map.getCenter();
    const centerLngLat = { lng: center.lng, lat: center.lat };

    const candidates: Array<{ plot: PlotData; dist: number }> = [];
    for (const plot of Object.values(plots)) {
      const pb = plotCoordToLngLatBounds(plot.gx, plot.gy);
      if (
        pb.maxLng < minLng ||
        pb.minLng > maxLng ||
        pb.maxLat < minLat ||
        pb.minLat > maxLat
      ) {
        continue;
      }
      const pCenter = plotCoordToCenterLngLat(plot.gx, plot.gy);
      candidates.push({
        plot,
        dist: haversineMeters(centerLngLat, pCenter)
      });
    }

    candidates.sort((a, b) => a.dist - b.dist);
    const visible = candidates.slice(0, MAX_VISIBLE_3D_PLOTS).map((c) => c.plot);

    if (!this.hasAnchor && visible.length > 0) {
      this.anchorGx = visible[0].gx;
      this.anchorGy = visible[0].gy;
      this.hasAnchor = true;
    }

    const nextActiveIds = new Set<PlotId>();

    for (const plot of visible) {
      nextActiveIds.add(plot.plotId);
      const cacheKey = makePlotCacheKey(plot);
      let entry = this.cache.get(plot.plotId);

      if (!entry || entry.cacheKey !== cacheKey) {
        if (entry) {
          this.scene.remove(entry.group);
          for (const g of entry.disposables) g.dispose();
          this.cache.delete(plot.plotId);
        }

        const heights =
          plot.terrainHeights && plot.terrainHeights.length === PLOT_VOXEL_XZ * PLOT_VOXEL_XZ
            ? plot.terrainHeights
            : samplePlotElevationGrid(plot.gx, plot.gy).heights;

        const terrainVoxels = generatePlotTerrainVoxels(
          plot.gx,
          plot.gy,
          plot.biome,
          heights,
          plot.baseElevationM
        );
        const composed = composeEffectiveVoxels(
          terrainVoxels,
          plot.removedTerrainKeys,
          plot.voxels
        );

        const { opaqueGeometry, translucentGeometry, emissiveGeometry } = buildPlotMeshes(
          composed.voxels,
          { foundationDepth: FOUNDATION_DEPTH_BLOCKS }
        );

        const group = new THREE.Group();
        const disposables: THREE.BufferGeometry[] = [];

        if (opaqueGeometry) {
          group.add(new THREE.Mesh(opaqueGeometry, this.opaqueMaterial));
          disposables.push(opaqueGeometry);
        }
        if (emissiveGeometry) {
          group.add(new THREE.Mesh(emissiveGeometry, this.emissiveMaterial));
          disposables.push(emissiveGeometry);
        }
        if (translucentGeometry) {
          group.add(new THREE.Mesh(translucentGeometry, this.translucentMaterial));
          disposables.push(translucentGeometry);
        }

        entry = {
          cacheKey,
          gx: plot.gx,
          gy: plot.gy,
          baseElevationM: plot.baseElevationM,
          elevationReliefM: plot.elevationReliefM,
          group,
          disposables,
          lastUsed: ++this.lruCounter
        };
        this.cache.set(plot.plotId, entry);
      } else {
        entry.lastUsed = ++this.lruCounter;
      }

      if (entry.group.parent !== this.scene) {
        this.scene.add(entry.group);
      }
    }

    // Detach plots no longer visible in viewport
    for (const prevId of this.activePlotIds) {
      if (!nextActiveIds.has(prevId)) {
        const entry = this.cache.get(prevId);
        if (entry) this.scene.remove(entry.group);
      }
    }
    this.activePlotIds = nextActiveIds;

    // Purge deleted plots or LRU overflow beyond MAX_CACHED_PLOTS
    for (const [id, entry] of this.cache.entries()) {
      if (!plots[id]) {
        this.scene.remove(entry.group);
        for (const g of entry.disposables) g.dispose();
        this.cache.delete(id);
      }
    }
    if (this.cache.size > MAX_CACHED_PLOTS) {
      const sorted = Array.from(this.cache.entries())
        .filter(([id]) => !this.activePlotIds.has(id))
        .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
      const excess = this.cache.size - MAX_CACHED_PLOTS;
      for (let i = 0; i < Math.min(excess, sorted.length); i++) {
        const [id, entry] = sorted[i];
        this.scene.remove(entry.group);
        for (const g of entry.disposables) g.dispose();
        this.cache.delete(id);
      }
    }

    this.terrainDirty = true;
    if (this.map.getTerrain()) {
      this.syncTerrainElevations(false);
    }
    this.map.triggerRepaint();
  }

  public render(
    _gl: WebGLRenderingContext,
    options: maplibregl.CustomRenderMethodInput
  ): void {
    if (!this.renderer || !this.map || this.activePlotIds.size === 0 || !this.hasAnchor) {
      return;
    }
    if (this.map.getZoom() < MIN_3D_MAP_ZOOM) {
      return;
    }

    if (this.terrainDirty && this.map.getTerrain()) {
      this.syncTerrainElevations(false);
    }

    const rawMatrix =
      (options as unknown as { defaultProjectionData?: { mainMatrix?: ArrayLike<number> } })
        ?.defaultProjectionData?.mainMatrix ??
      (options as unknown as ArrayLike<number>);
    if (!rawMatrix || rawMatrix.length < 16) return;

    const anchorMercX = this.anchorGx * PLOT_VOXEL_XZ * VOXEL_MERCATOR_SIZE;
    const anchorMercY = this.anchorGy * PLOT_VOXEL_XZ * VOXEL_MERCATOR_SIZE;
    const anchorLngLat = mercatorToLngLat(anchorMercX, anchorMercY);
    const anchorMercZ = this.map.getTerrain()
      ? maplibregl.MercatorCoordinate.fromLngLat(
          [anchorLngLat.lng, anchorLngLat.lat],
          this.anchorElevM
        ).z
      : 0;
    const s = VOXEL_MERCATOR_SIZE;

    const m = new THREE.Matrix4().fromArray(rawMatrix);
    const l = new THREE.Matrix4()
      .makeTranslation(anchorMercX, anchorMercY, anchorMercZ)
      .scale(new THREE.Vector3(s, -s, s))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));

    this.camera.projectionMatrix = m.multiply(l);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }
}
