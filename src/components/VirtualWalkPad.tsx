import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, MapPin } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PRESET_SPOTS } from '../core/catalog';
import { haversineMeters } from '../core/geoGrid';
import { bearingBetween, moveByMeters } from '../location/locationService';
import { useGameStore } from '../store/useGameStore';

export function VirtualWalkPad() {
  const locationMode = useGameStore((s) => s.locationMode);
  const selectedPlotId = useGameStore((s) => s.selectedPlotId);
  const lastPosition = useGameStore((s) => s.player.lastPosition);
  const virtualTarget = useGameStore((s) => s.virtualTarget);
  const setVirtualTarget = useGameStore((s) => s.setVirtualTarget);
  const updatePosition = useGameStore((s) => s.updatePosition);
  const teleportToSpot = useGameStore((s) => s.teleportToSpot);

  const [fastMode, setFastMode] = useState(false);
  const [spotMenuOpen, setSpotMenuOpen] = useState(false);
  const holdDirRef = useRef<number | null>(null);

  const speedMps = fastMode ? 7.5 : 2.5;

  useEffect(() => {
    if (locationMode !== 'virtual') return;

    const timer = window.setInterval(() => {
      const store = useGameStore.getState();
      const current = store.player.lastPosition;

      if (holdDirRef.current !== null) {
        const next = moveByMeters(current, holdDirRef.current, speedMps * 0.2);
        store.updatePosition(next, holdDirRef.current, true);
        return;
      }

      if (store.virtualTarget) {
        const dist = haversineMeters(current, store.virtualTarget);
        const step = speedMps * 0.2;
        if (dist <= step) {
          const bearing = bearingBetween(current, store.virtualTarget);
          store.updatePosition(store.virtualTarget, bearing, true);
          store.setVirtualTarget(null);
        } else {
          const bearing = bearingBetween(current, store.virtualTarget);
          const next = moveByMeters(current, bearing, step);
          store.updatePosition(next, bearing, true);
        }
      }
    }, 200);

    return () => window.clearInterval(timer);
  }, [locationMode, speedMps]);

  if (locationMode !== 'virtual' || selectedPlotId) return null;

  const stepOnce = (bearingDeg: number) => {
    setVirtualTarget(null);
    const next = moveByMeters(lastPosition, bearingDeg, fastMode ? 10 : 4.5);
    updatePosition(next, bearingDeg, true);
  };

  const startHold = (bearingDeg: number) => {
    setVirtualTarget(null);
    holdDirRef.current = bearingDeg;
  };

  const stopHold = () => {
    holdDirRef.current = null;
  };

  return (
    <div className="virtual-pad" aria-label="仮想歩行コントローラー">
      {spotMenuOpen && (
        <div className="spot-menu">
          {PRESET_SPOTS.map((spot) => (
            <button
              key={spot.id}
              type="button"
              className="spot-option"
              onClick={() => {
                teleportToSpot(spot.lngLat, spot.fallbackBiome);
                setSpotMenuOpen(false);
              }}
            >
              <div className="spot-option-name">{spot.nameJa}</div>
              <div className="spot-option-sub">{spot.subtitleJa}</div>
            </button>
          ))}
        </div>
      )}

      <div className="dpad-grid">
        <div />
        <button
          type="button"
          className="dpad-btn"
          aria-label="北へ歩く"
          onClick={() => stepOnce(0)}
          onPointerDown={() => startHold(0)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
        >
          <ArrowUp size={18} />
        </button>
        <div />

        <button
          type="button"
          className="dpad-btn"
          aria-label="西へ歩く"
          onClick={() => stepOnce(270)}
          onPointerDown={() => startHold(270)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="dpad-center">{virtualTarget ? '自動' : '散歩'}</div>
        <button
          type="button"
          className="dpad-btn"
          aria-label="東へ歩く"
          onClick={() => stepOnce(90)}
          onPointerDown={() => startHold(90)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
        >
          <ArrowRight size={18} />
        </button>

        <div />
        <button
          type="button"
          className="dpad-btn"
          aria-label="南へ歩く"
          onClick={() => stepOnce(180)}
          onPointerDown={() => startHold(180)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
        >
          <ArrowDown size={18} />
        </button>
        <div />
      </div>

      <div className="virtual-pad-controls">
        <button
          type="button"
          className={`mini-chip-btn ${fastMode ? 'active' : ''}`}
          onClick={() => setFastMode((v) => !v)}
        >
          {fastMode ? '早歩き' : '徒歩'}
        </button>
        <button
          type="button"
          className={`mini-chip-btn ${spotMenuOpen ? 'active' : ''}`}
          onClick={() => setSpotMenuOpen((v) => !v)}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}
        >
          <MapPin size={11} />
          移動
        </button>
      </div>
    </div>
  );
}
