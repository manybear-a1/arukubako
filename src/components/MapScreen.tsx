import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Footprints, Hammer, Lock, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  detectBiomeFromFeatures,
  fallbackBiomeForCoord,
  type MapFeatureLike
} from '../core/biomeDetector';
import {
  BIOME_META,
  RARE_NODE_HARVEST_RADIUS_M,
  UNLOCK_RADIUS_M
} from '../core/catalog';
import {
  distanceFromPointToPlotMeters,
  haversineMeters,
  lngLatToPlotCoord,
  makePlotId,
  parsePlotId,
  plotCoordToCenterLngLat,
  plotCoordToLngLatBounds,
  plotCoordToPolygonCoords
} from '../core/geoGrid';
import type { LngLat, PlotData, PlotId, RareNode } from '../core/types';
import { GpsWatcher, moveByMeters } from '../location/locationService';
import { useGameStore } from '../store/useGameStore';
import { MapVoxelLayer } from '../voxel/mapVoxelLayer';
import { getRarePinIconId, registerRarePinImages } from '../voxel/pinIcons';

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const OFFLINE_FALLBACK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'offline-clean-bg',
      type: 'background',
      paint: { 'background-color': '#E2E8F0' }
    }
  ]
};

const SOURCE_RADIUS = 'arukubako-radius-src';
const SOURCE_PLOTS = 'arukubako-plots-src';
const SOURCE_CLUSTERS = 'arukubako-clusters-src';
const SOURCE_SELECTED_LOCKED = 'arukubako-locked-src';
const SOURCE_TERRAIN_DEM = 'arukubako-terrain-dem';
const SOURCE_RARE_NODES = 'arukubako-rare-nodes-src';
const LAYER_RARE_PINS = 'arukubako-rare-pins';

interface PlotPolygonFeature {
  type: 'Feature';
  properties: {
    plotId: string;
    biome: string;
    hasBuild: number;
    selected: number;
  };
  geometry: {
    type: 'Polygon';
    coordinates: [number, number][][];
  };
}

interface PlotFeatureCollection {
  type: 'FeatureCollection';
  features: PlotPolygonFeature[];
}

interface ClusterPointFeature {
  type: 'Feature';
  properties: {
    plotId: string;
    biome: string;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
}

function buildCircleRing(center: LngLat, radiusMeters: number, steps = 40): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 360;
    const p = moveByMeters(center, bearing, radiusMeters);
    ring.push([p.lng, p.lat]);
  }
  return ring;
}

function buildVisiblePlotsGeoJson(
  plots: Record<PlotId, PlotData>,
  selectedPlotId: PlotId | null,
  map: maplibregl.Map | null
): PlotFeatureCollection {
  const features: PlotPolygonFeature[] = [];
  const bounds = map ? map.getBounds() : null;
  const minLng = bounds ? bounds.getWest() - 0.002 : -180;
  const maxLng = bounds ? bounds.getEast() + 0.002 : 180;
  const minLat = bounds ? bounds.getSouth() - 0.002 : -90;
  const maxLat = bounds ? bounds.getNorth() + 0.002 : 90;

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

    const voxelCount = Object.keys(plot.voxels).length;
    features.push({
      type: 'Feature',
      properties: {
        plotId: plot.plotId,
        biome: plot.biome,
        hasBuild: voxelCount > 0 ? 1 : 0,
        selected: plot.plotId === selectedPlotId ? 1 : 0
      },
      geometry: {
        type: 'Polygon',
        coordinates: [plotCoordToPolygonCoords(plot.gx, plot.gy)]
      }
    });
  }
  return { type: 'FeatureCollection', features };
}

function buildClusterPointsGeoJson(plots: Record<PlotId, PlotData>): {
  type: 'FeatureCollection';
  features: ClusterPointFeature[];
} {
  const features: ClusterPointFeature[] = [];
  for (const plot of Object.values(plots)) {
    const c = plotCoordToCenterLngLat(plot.gx, plot.gy);
    features.push({
      type: 'Feature',
      properties: {
        plotId: plot.plotId,
        biome: plot.biome
      },
      geometry: {
        type: 'Point',
        coordinates: [c.lng, c.lat]
      }
    });
  }
  return { type: 'FeatureCollection', features };
}

interface RareNodePointFeature {
  type: 'Feature';
  properties: {
    nodeId: string;
    titleJa: string;
    iconId: string;
    inRange: number;
    sortKey: number;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
}

function buildRareNodesGeoJson(
  nodes: RareNode[],
  playerPos: LngLat,
  nowMs: number
): {
  collection: { type: 'FeatureCollection'; features: RareNodePointFeature[] };
  signature: string;
} {
  const features: RareNodePointFeature[] = [];
  const sigParts: string[] = [];

  for (const node of nodes) {
    const dist = haversineMeters(playerPos, node.lngLat);
    const inRange = dist <= RARE_NODE_HARVEST_RADIUS_M;
    const onCooldown = node.cooldownUntil > nowMs;
    const iconId = getRarePinIconId(node.color, inRange, onCooldown);
    const activeInRange = inRange && !onCooldown ? 1 : 0;

    features.push({
      type: 'Feature',
      properties: {
        nodeId: node.id,
        titleJa: node.titleJa,
        iconId,
        inRange: activeInRange,
        sortKey: onCooldown ? 0 : activeInRange ? 2 : 1
      },
      geometry: {
        type: 'Point',
        coordinates: [node.lngLat.lng, node.lngLat.lat]
      }
    });
    sigParts.push(`${node.id}:${iconId}`);
  }

  return {
    collection: { type: 'FeatureCollection', features },
    signature: sigParts.join('|')
  };
}

/**
 * Permanently hides OSM 3D extruded buildings so they never obstruct player voxel builds.
 */
function hideOsm3DBuildings(map: maplibregl.Map): void {
  const style = map.getStyle();
  if (!style || !style.layers) return;
  for (const layer of style.layers) {
    if (layer.id.startsWith('arukubako-')) continue;
    if (layer.type === 'fill-extrusion') {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  }
}

export function MapScreen() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const voxelLayerRef = useRef<MapVoxelLayer | null>(null);
  const playerMarkerRef = useRef<maplibregl.Marker | null>(null);
  const playerArrowRef = useRef<HTMLDivElement | null>(null);
  const styleReadyRef = useRef(false);
  const fallbackUsedRef = useRef(false);
  const lastBiomeCheckRef = useRef(0);
  const lastStandingPlotRef = useRef<string>('');
  const lastClusterPlotCountRef = useRef(-1);
  const lastRareGeoJsonSigRef = useRef('');
  const lastTerrainSyncRef = useRef(0);

  const playerPos = useGameStore((s) => s.player.lastPosition);
  const timeOfDay = useGameStore((s) => s.player.timeOfDay);
  const plots = useGameStore((s) => s.plots);
  const nearbyNodes = useGameStore((s) => s.nearbyNodes);
  const headingDeg = useGameStore((s) => s.headingDeg);
  const locationMode = useGameStore((s) => s.locationMode);
  const selectedPlotId = useGameStore((s) => s.selectedPlotId);
  const focusMapTrigger = useGameStore((s) => s.focusMapTrigger);

  const selectPlot = useGameStore((s) => s.selectPlot);
  const openBuildMode = useGameStore((s) => s.openBuildMode);
  const setCurrentBiome = useGameStore((s) => s.setCurrentBiome);
  const setVirtualTarget = useGameStore((s) => s.setVirtualTarget);
  const updatePosition = useGameStore((s) => s.updatePosition);
  const setGpsError = useGameStore((s) => s.setGpsError);

  const [mapReady, setMapReady] = useState(false);

  // Manage GPS watcher lifecycle
  useEffect(() => {
    if (locationMode !== 'gps') {
      setGpsError(null);
      return;
    }

    const watcher = new GpsWatcher();
    void watcher.start({
      onPosition: (reading) => {
        setGpsError(null);
        updatePosition(reading.lngLat, reading.headingDeg, reading.countDistance);
      },
      onError: (msg) => {
        setGpsError(msg);
      }
    });

    return () => {
      void watcher.stop();
    };
  }, [locationMode, setGpsError, updatePosition]);

  // Initialize MapLibre v5 instance
  useEffect(() => {
    if (!containerRef.current) return;

    const initialPos = useGameStore.getState().player.lastPosition;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OPENFREEMAP_STYLE,
      center: [initialPos.lng, initialPos.lat],
      zoom: 17.2,
      pitch: 54,
      bearing: -12,
      maxPitch: 75,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
      canvasContextAttributes: { antialias: true }
    });
    mapRef.current = map;

    const voxelLayer = new MapVoxelLayer();
    voxelLayerRef.current = voxelLayer;

    const refreshBiomeAtPlayer = () => {
      const state = useGameStore.getState();
      const pos = state.player.lastPosition;
      const standing = lngLatToPlotCoord(pos.lng, pos.lat);
      const standingId = makePlotId(standing.gx, standing.gy);
      const standingPlot = state.plots[standingId];
      const elevCtx = standingPlot
        ? {
            baseElevationM: standingPlot.baseElevationM,
            elevationReliefM: standingPlot.elevationReliefM
          }
        : undefined;

      const pt = map.project([pos.lng, pos.lat]);
      if (pt.x >= 0 && pt.y >= 0) {
        try {
          const features = map.queryRenderedFeatures([
            [pt.x - 16, pt.y - 16],
            [pt.x + 16, pt.y + 16]
          ]) as unknown as MapFeatureLike[];
          const nonGameFeatures = features.filter(
            (f) => !f.layer?.id?.startsWith('arukubako-')
          );
          const detected = detectBiomeFromFeatures(nonGameFeatures, elevCtx);
          setCurrentBiome(detected ?? fallbackBiomeForCoord(pos.lng, pos.lat));
          return;
        } catch {
          // fallback below
        }
      }
      setCurrentBiome(fallbackBiomeForCoord(pos.lng, pos.lat));
    };

    const setupCustomLayers = () => {
      styleReadyRef.current = true;
      const state = useGameStore.getState();
      hideOsm3DBuildings(map);

      if (!map.getSource(SOURCE_TERRAIN_DEM)) {
        map.addSource(SOURCE_TERRAIN_DEM, {
          type: 'raster-dem',
          tiles: [
            'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
          ],
          encoding: 'terrarium',
          tileSize: 256,
          maxzoom: 13
        });
      }

      try {
        map.setTerrain({
          source: SOURCE_TERRAIN_DEM,
          exaggeration: 1.0
        });
      } catch {
        // Fallback gracefully if terrain setup is unavailable
      }

      if (!map.getSource(SOURCE_RADIUS)) {
        map.addSource(SOURCE_RADIUS, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [buildCircleRing(state.player.lastPosition, UNLOCK_RADIUS_M)]
            }
          }
        });
        map.addLayer({
          id: 'arukubako-radius-fill',
          type: 'fill',
          source: SOURCE_RADIUS,
          minzoom: 13,
          paint: {
            'fill-color': '#2563EB',
            'fill-opacity': 0.08
          }
        });
        map.addLayer({
          id: 'arukubako-radius-line',
          type: 'line',
          source: SOURCE_RADIUS,
          minzoom: 13,
          paint: {
            'line-color': '#18202E',
            'line-width': 2.2,
            'line-dasharray': [2, 2],
            'line-opacity': 0.75
          }
        });
      }

      if (!map.getSource(SOURCE_PLOTS)) {
        map.addSource(SOURCE_PLOTS, {
          type: 'geojson',
          data: buildVisiblePlotsGeoJson(state.plots, state.selectedPlotId, map)
        });
        map.addLayer({
          id: 'arukubako-plots-fill',
          type: 'fill',
          source: SOURCE_PLOTS,
          minzoom: 12,
          paint: {
            'fill-color': [
              'match',
              ['get', 'biome'],
              'park',
              BIOME_META.park.badgeColor,
              'water',
              BIOME_META.water.badgeColor,
              'urban',
              BIOME_META.urban.badgeColor,
              'residential',
              BIOME_META.residential.badgeColor,
              'mountain',
              BIOME_META.mountain.badgeColor,
              'open',
              BIOME_META.open.badgeColor,
              '#14B8A6'
            ],
            'fill-opacity': [
              'case',
              ['==', ['get', 'selected'], 1],
              0.44,
              ['==', ['get', 'hasBuild'], 1],
              0.3,
              0.22
            ]
          }
        });
        map.addLayer({
          id: 'arukubako-plots-line',
          type: 'line',
          source: SOURCE_PLOTS,
          minzoom: 12,
          paint: {
            'line-color': [
              'case',
              ['==', ['get', 'selected'], 1],
              '#EF4444',
              ['==', ['get', 'hasBuild'], 1],
              '#FACC15',
              '#18202E'
            ],
            'line-width': [
              'case',
              ['==', ['get', 'selected'], 1],
              3.5,
              ['==', ['get', 'hasBuild'], 1],
              2.5,
              1.4
            ],
            'line-opacity': 0.9
          }
        });
      }

      if (!map.getSource(SOURCE_CLUSTERS)) {
        lastClusterPlotCountRef.current = Object.keys(state.plots).length;
        map.addSource(SOURCE_CLUSTERS, {
          type: 'geojson',
          data: buildClusterPointsGeoJson(state.plots),
          cluster: true,
          clusterMaxZoom: 12,
          clusterRadius: 44
        });
        map.addLayer({
          id: 'arukubako-clusters',
          type: 'circle',
          source: SOURCE_CLUSTERS,
          maxzoom: 12,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#2563EB',
            'circle-radius': ['step', ['get', 'point_count'], 16, 10, 21, 30, 26],
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#18202E'
          }
        });
        map.addLayer({
          id: 'arukubako-cluster-count',
          type: 'symbol',
          source: SOURCE_CLUSTERS,
          maxzoom: 12,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-size': 12
          },
          paint: {
            'text-color': '#FFFFFF'
          }
        });
        map.addLayer({
          id: 'arukubako-unclustered-point',
          type: 'circle',
          source: SOURCE_CLUSTERS,
          maxzoom: 12,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': '#10B981',
            'circle-radius': 7,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#18202E'
          }
        });
      }

      if (!map.getSource(SOURCE_SELECTED_LOCKED)) {
        map.addSource(SOURCE_SELECTED_LOCKED, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
        map.addLayer({
          id: 'arukubako-locked-line',
          type: 'line',
          source: SOURCE_SELECTED_LOCKED,
          minzoom: 12,
          paint: {
            'line-color': '#18202E',
            'line-width': 2.5,
            'line-dasharray': [2, 2]
          }
        });
      }

      if (!map.getLayer(voxelLayer.id)) {
        map.addLayer(voxelLayer);
      }

      registerRarePinImages(map);
      if (!map.getSource(SOURCE_RARE_NODES)) {
        const initialRare = buildRareNodesGeoJson(
          state.nearbyNodes,
          state.player.lastPosition,
          Date.now()
        );
        map.addSource(SOURCE_RARE_NODES, {
          type: 'geojson',
          data: initialRare.collection
        });
        lastRareGeoJsonSigRef.current = initialRare.signature;
        map.addLayer({
          id: LAYER_RARE_PINS,
          type: 'symbol',
          source: SOURCE_RARE_NODES,
          minzoom: 13,
          layout: {
            'icon-image': ['get', 'iconId'],
            'icon-anchor': 'bottom',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'symbol-sort-key': ['get', 'sortKey'],
            'icon-size': ['case', ['==', ['get', 'inRange'], 1], 1.15, 0.92]
          }
        });
      }
      const refCoord = lngLatToPlotCoord(
        state.player.lastPosition.lng,
        state.player.lastPosition.lat
      );
      voxelLayer.setReferencePlot(refCoord);
      voxelLayer.setTimeOfDay(state.player.timeOfDay);
      voxelLayer.syncPlots(state.plots);
      setMapReady(true);
      refreshBiomeAtPlayer();
    };

    map.on('style.load', setupCustomLayers);

    map.on('error', () => {
      if (!styleReadyRef.current && !fallbackUsedRef.current) {
        fallbackUsedRef.current = true;
        map.setStyle(OFFLINE_FALLBACK_STYLE);
      }
    });

    // Update viewport-culled plots and 3D LOD when panning/zooming settles
    const handleViewportChange = () => {
      if (!styleReadyRef.current) return;
      const state = useGameStore.getState();
      const plotSrc = map.getSource(SOURCE_PLOTS) as maplibregl.GeoJSONSource | undefined;
      plotSrc?.setData(buildVisiblePlotsGeoJson(state.plots, state.selectedPlotId, map));
      voxelLayer.updateVisibleViewport(state.plots);
    };

    map.on('moveend', handleViewportChange);
    map.on('zoomend', handleViewportChange);
    map.on('sourcedata', (e) => {
      if (e.sourceId === SOURCE_TERRAIN_DEM && e.isSourceLoaded) {
        const now = Date.now();
        if (now - lastTerrainSyncRef.current >= 500) {
          lastTerrainSyncRef.current = now;
          voxelLayer.markTerrainDirty();
          map.triggerRepaint();
        }
      }
    });

    // Player marker
    const el = document.createElement('div');
    el.className = 'player-marker';
    const arrow = document.createElement('div');
    arrow.className = 'player-marker-arrow';
    el.appendChild(arrow);
    playerArrowRef.current = arrow;

    const pMarker = new maplibregl.Marker({
      element: el,
      rotationAlignment: 'map'
    })
      .setLngLat([initialPos.lng, initialPos.lat])
      .addTo(map);
    playerMarkerRef.current = pMarker;

    map.on('mouseenter', LAYER_RARE_PINS, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', LAYER_RARE_PINS, () => {
      map.getCanvas().style.cursor = '';
    });

    // Tap rare resource pin or plot selection
    map.on('click', (e) => {
      if (map.getLayer(LAYER_RARE_PINS)) {
        const hits = map.queryRenderedFeatures(e.point, {
          layers: [LAYER_RARE_PINS]
        });
        const nodeId = hits[0]?.properties?.nodeId as string | undefined;
        if (nodeId) {
          const state = useGameStore.getState();
          const node = state.nearbyNodes.find((n) => n.id === nodeId);
          if (node) {
            const d = haversineMeters(state.player.lastPosition, node.lngLat);
            if (
              d > RARE_NODE_HARVEST_RADIUS_M &&
              state.locationMode === 'virtual' &&
              node.cooldownUntil <= Date.now()
            ) {
              state.walkToRareNode(node.id);
            } else {
              state.harvestRareNode(node.id);
            }
            return;
          }
        }
      }

      const coord = lngLatToPlotCoord(e.lngLat.lng, e.lngLat.lat);
      const plotId = makePlotId(coord.gx, coord.gy);
      selectPlot(plotId);
    });

    map.on('idle', () => {
      const now = Date.now();
      if (now - lastBiomeCheckRef.current > 1500) {
        lastBiomeCheckRef.current = now;
        refreshBiomeAtPlayer();
      }
    });

    return () => {
      pMarker.remove();
      playerMarkerRef.current = null;
      voxelLayerRef.current = null;
      styleReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [selectPlot, setCurrentBiome]);

  // Sync player marker, discovery circle, and throttled biome check
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    playerMarkerRef.current?.setLngLat([playerPos.lng, playerPos.lat]);
    if (playerArrowRef.current) {
      playerArrowRef.current.style.transform = `rotate(${headingDeg}deg) translateY(-1px)`;
    }

    if (styleReadyRef.current) {
      const radiusSrc = map.getSource(SOURCE_RADIUS) as maplibregl.GeoJSONSource | undefined;
      radiusSrc?.setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [buildCircleRing(playerPos, UNLOCK_RADIUS_M)]
        }
      });

      const standing = lngLatToPlotCoord(playerPos.lng, playerPos.lat);
      voxelLayerRef.current?.setReferencePlot(standing);

      const standingId = makePlotId(standing.gx, standing.gy);
      const now = Date.now();
      if (
        standingId !== lastStandingPlotRef.current ||
        now - lastBiomeCheckRef.current > 1500
      ) {
        lastStandingPlotRef.current = standingId;
        lastBiomeCheckRef.current = now;
        const standingPlot = useGameStore.getState().plots[standingId];
        const elevCtx = standingPlot
          ? {
              baseElevationM: standingPlot.baseElevationM,
              elevationReliefM: standingPlot.elevationReliefM
            }
          : undefined;

        const pt = map.project([playerPos.lng, playerPos.lat]);
        try {
          const features = map.queryRenderedFeatures([
            [pt.x - 16, pt.y - 16],
            [pt.x + 16, pt.y + 16]
          ]) as unknown as MapFeatureLike[];
          const nonGameFeatures = features.filter(
            (f) => !f.layer?.id?.startsWith('arukubako-')
          );
          const detected = detectBiomeFromFeatures(nonGameFeatures, elevCtx);
          setCurrentBiome(detected ?? fallbackBiomeForCoord(playerPos.lng, playerPos.lat));
        } catch {
          setCurrentBiome(fallbackBiomeForCoord(playerPos.lng, playerPos.lat));
        }
      }
    }
  }, [playerPos, headingDeg, mapReady, setCurrentBiome]);

  // Center camera on focus trigger (instant jump for far teleports, smooth ease nearby)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || focusMapTrigger === 0) return;
    const pos = useGameStore.getState().player.lastPosition;
    const cur = map.getCenter();
    const dist = haversineMeters({ lng: cur.lng, lat: cur.lat }, pos);
    if (dist > 1000) {
      map.jumpTo({ center: [pos.lng, pos.lat] });
    } else {
      map.easeTo({
        center: [pos.lng, pos.lat],
        duration: 450
      });
    }
  }, [focusMapTrigger]);

  // Sync GeoJSON sources & viewport-culled 3D voxel layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReadyRef.current) return;

    const plotSrc = map.getSource(SOURCE_PLOTS) as maplibregl.GeoJSONSource | undefined;
    plotSrc?.setData(buildVisiblePlotsGeoJson(plots, selectedPlotId, map));

    const plotCount = Object.keys(plots).length;
    if (plotCount !== lastClusterPlotCountRef.current) {
      lastClusterPlotCountRef.current = plotCount;
      const clusterSrc = map.getSource(SOURCE_CLUSTERS) as maplibregl.GeoJSONSource | undefined;
      clusterSrc?.setData(buildClusterPointsGeoJson(plots));
    }

    const lockedSrc = map.getSource(SOURCE_SELECTED_LOCKED) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (lockedSrc) {
      if (selectedPlotId && !plots[selectedPlotId]) {
        const coord = parsePlotId(selectedPlotId);
        if (coord) {
          lockedSrc.setData({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'Polygon',
                  coordinates: [plotCoordToPolygonCoords(coord.gx, coord.gy)]
                }
              }
            ]
          });
        }
      } else {
        lockedSrc.setData({ type: 'FeatureCollection', features: [] });
      }
    }

    voxelLayerRef.current?.syncPlots(plots);
  }, [plots, selectedPlotId, mapReady]);

  // Sync time-of-day
  useEffect(() => {
    if (!styleReadyRef.current) return;
    voxelLayerRef.current?.setTimeOfDay(timeOfDay);
  }, [timeOfDay, mapReady]);

  // Sync rare resource pins via GPU symbol layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReadyRef.current) return;

    registerRarePinImages(map);
    const rareSrc = map.getSource(SOURCE_RARE_NODES) as maplibregl.GeoJSONSource | undefined;
    if (!rareSrc) return;

    const { collection, signature } = buildRareNodesGeoJson(
      nearbyNodes,
      playerPos,
      Date.now()
    );
    if (signature !== lastRareGeoJsonSigRef.current) {
      lastRareGeoJsonSigRef.current = signature;
      rareSrc.setData(collection);
    }
  }, [nearbyNodes, playerPos, mapReady]);

  const selectedPlotInfo = useMemo(() => {
    if (!selectedPlotId) return null;
    const unlockedPlot = plots[selectedPlotId];
    const coord = parsePlotId(selectedPlotId);
    if (!coord) return null;
    const center = plotCoordToCenterLngLat(coord.gx, coord.gy);
    const edgeDistance = Math.round(
      distanceFromPointToPlotMeters(playerPos, coord.gx, coord.gy)
    );
    return {
      plotId: selectedPlotId,
      coord,
      center,
      edgeDistance,
      unlockedPlot
    };
  }, [selectedPlotId, plots, playerPos]);

  return (
    <>
      <div ref={containerRef} className="map-container" />
      {timeOfDay !== 'day' && <div className={`map-night-tint ${timeOfDay}`} />}

      {selectedPlotInfo && (
        <div className="plot-sheet" role="region" aria-label="区画情報">
          <div className="plot-sheet-header">
            <div className="plot-sheet-title">
              <span>
                区画 ({selectedPlotInfo.coord.gx}, {selectedPlotInfo.coord.gy})
              </span>
              {selectedPlotInfo.unlockedPlot ? (
                <span
                  className="biome-pill"
                  style={{
                    backgroundColor: BIOME_META[selectedPlotInfo.unlockedPlot.biome].badgeColor,
                    color: '#FFFFFF'
                  }}
                >
                  {BIOME_META[selectedPlotInfo.unlockedPlot.biome].nameJa}
                </span>
              ) : (
                <span
                  className="biome-pill"
                  style={{ backgroundColor: '#E2E8F0', color: '#475569' }}
                >
                  <Lock size={11} />
                  未解放
                </span>
              )}
            </div>
            <button
              type="button"
              className="btn-close-sm"
              onClick={() => selectPlot(null)}
              aria-label="区画カードを閉じる"
            >
              <X size={16} />
            </button>
          </div>

          <div className="plot-sheet-meta">
            <span>
              {selectedPlotInfo.edgeDistance === 0
                ? '現在この区画内'
                : `区画端まで 約${selectedPlotInfo.edgeDistance}m`}
            </span>
            {selectedPlotInfo.unlockedPlot ? (
              <>
                <span>
                  設置ブロック: {Object.keys(selectedPlotInfo.unlockedPlot.voxels).length}
                </span>
                <span>
                  標高 {Math.round(selectedPlotInfo.unlockedPlot.baseElevationM)}m (高低差{' '}
                  {selectedPlotInfo.unlockedPlot.elevationReliefM.toFixed(1)}m)
                </span>
              </>
            ) : (
              <span>
                探索円まであと{' '}
                {Math.max(1, selectedPlotInfo.edgeDistance - UNLOCK_RADIUS_M)}m
              </span>
            )}
          </div>

          <div className="plot-sheet-actions">
            {selectedPlotInfo.unlockedPlot ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => openBuildMode(selectedPlotInfo.plotId)}
              >
                <Hammer size={17} />
                この区画に建築する
              </button>
            ) : locationMode === 'virtual' ? (
              <button
                type="button"
                className="btn-sage"
                style={{ flex: 1 }}
                onClick={() => {
                  setVirtualTarget(selectedPlotInfo.center);
                  selectPlot(null);
                }}
              >
                <Footprints size={17} />
                この区画まで歩く
              </button>
            ) : (
              <button type="button" className="btn-primary" disabled>
                <Lock size={16} />
                現地へ歩いて解放しよう
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
