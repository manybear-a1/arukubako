import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { EARTH_RADIUS_M, haversineMeters } from '../core/geoGrid';
import type { LngLat } from '../core/types';

export interface GpsReading {
  lngLat: LngLat;
  headingDeg: number;
  accuracyMeters: number;
  countDistance: boolean;
}

export interface GpsCallbacks {
  onPosition: (reading: GpsReading) => void;
  onError: (messageJa: string) => void;
}

const MIN_DRIFT_METERS = 3;
const MAX_SPEED_MPS = 15;

export function moveByMeters(
  origin: LngLat,
  bearingDeg: number,
  distanceMeters: number
): LngLat {
  const angularDist = distanceMeters / EARTH_RADIUS_M;
  const bearingRad = (bearingDeg * Math.PI) / 180;
  const lat1 = (origin.lat * Math.PI) / 180;
  const lng1 = (origin.lng * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDist) +
      Math.cos(lat1) * Math.sin(angularDist) * Math.cos(bearingRad)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDist) * Math.cos(lat1),
      Math.cos(angularDist) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lng: (lng2 * 180) / Math.PI,
    lat: (lat2 * 180) / Math.PI
  };
}

export function bearingBetween(from: LngLat, to: LngLat): number {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export class GpsWatcher {
  private capWatchId: string | null = null;
  private webWatchId: number | null = null;
  private lastAccepted: { lngLat: LngLat; timestamp: number } | null = null;
  private stopped = false;

  public async start(callbacks: GpsCallbacks): Promise<void> {
    this.stopped = false;
    this.lastAccepted = null;

    if (Capacitor.isNativePlatform()) {
      try {
        const perm = await Geolocation.requestPermissions();
        if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
          callbacks.onError('位置情報の権限が許可されていません。仮想歩行モードでお試しください。');
          return;
        }
        if (this.stopped) return;

        this.capWatchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 },
          (pos, err) => {
            if (err) {
              callbacks.onError('GPS信号を取得できませんでした。屋外でお試しください。');
              return;
            }
            if (!pos) return;
            this.handleCoords(
              { lng: pos.coords.longitude, lat: pos.coords.latitude },
              pos.coords.heading ?? 0,
              pos.coords.accuracy ?? 20,
              pos.timestamp || Date.now(),
              callbacks
            );
          }
        );
      } catch {
        callbacks.onError('Android GPSセンサーの起動に失敗しました。仮想歩行モードをご利用ください。');
      }
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      callbacks.onError('このブラウザはGPSに対応していません。仮想歩行モードをご利用ください。');
      return;
    }

    this.webWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.handleCoords(
          { lng: pos.coords.longitude, lat: pos.coords.latitude },
          pos.coords.heading ?? 0,
          pos.coords.accuracy ?? 20,
          pos.timestamp || Date.now(),
          callbacks
        );
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          callbacks.onError('位置情報の許可が拒否されました。仮想歩行モードをご利用ください。');
        } else {
          callbacks.onError('現在地を取得できませんでした。仮想歩行モードで動作確認できます。');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
    );
  }

  private handleCoords(
    next: LngLat,
    heading: number,
    accuracy: number,
    timestamp: number,
    callbacks: GpsCallbacks
  ): void {
    if (this.stopped) return;

    if (!this.lastAccepted) {
      this.lastAccepted = { lngLat: next, timestamp };
      callbacks.onPosition({
        lngLat: next,
        headingDeg: Number.isFinite(heading) ? heading : 0,
        accuracyMeters: accuracy,
        countDistance: false
      });
      return;
    }

    const dist = haversineMeters(this.lastAccepted.lngLat, next);
    const dtSec = Math.max(0.5, (timestamp - this.lastAccepted.timestamp) / 1000);
    const speed = dist / dtSec;

    // Ignore micro-drift under 3m, and skip distance count on unrealistic GPS jumps
    if (dist < MIN_DRIFT_METERS) return;

    const countDistance = speed <= MAX_SPEED_MPS;
    const computedHeading =
      Number.isFinite(heading) && heading !== 0
        ? heading
        : bearingBetween(this.lastAccepted.lngLat, next);

    this.lastAccepted = { lngLat: next, timestamp };
    callbacks.onPosition({
      lngLat: next,
      headingDeg: computedHeading,
      accuracyMeters: accuracy,
      countDistance
    });
  }

  public async stop(): Promise<void> {
    this.stopped = true;
    if (this.capWatchId !== null) {
      try {
        await Geolocation.clearWatch({ id: this.capWatchId });
      } catch {
        // ignore
      }
      this.capWatchId = null;
    }
    if (this.webWatchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.webWatchId);
      this.webWatchId = null;
    }
  }
}
