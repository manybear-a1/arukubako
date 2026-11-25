import {
  Award,
  Compass,
  Footprints,
  Hammer,
  Layers,
  Moon,
  Navigation,
  Settings,
  Sun,
  Sunrise
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  BIOME_META,
  BIOME_ORDER,
  PASSIVE_GATHER_DISTANCE_M
} from '../core/catalog';
import { useGameStore } from '../store/useGameStore';

export function HudOverlay() {
  const player = useGameStore((s) => s.player);
  const currentBiome = useGameStore((s) => s.currentBiome);
  const locationMode = useGameStore((s) => s.locationMode);
  const gpsError = useGameStore((s) => s.gpsError);
  const toasts = useGameStore((s) => s.toasts);

  const setLocationMode = useGameStore((s) => s.setLocationMode);
  const setTimeOfDay = useGameStore((s) => s.setTimeOfDay);
  const setActiveModal = useGameStore((s) => s.setActiveModal);
  const triggerFocusMap = useGameStore((s) => s.triggerFocusMap);
  const dismissToast = useGameStore((s) => s.dismissToast);

  const [legendOpen, setLegendOpen] = useState(false);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) => {
      const remaining = Math.max(400, 4200 - (Date.now() - t.createdAt));
      return window.setTimeout(() => dismissToast(t.id), remaining);
    });
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [toasts, dismissToast]);

  const biomeMeta = BIOME_META[currentBiome];
  const gatherPct = Math.min(
    100,
    Math.round((player.gatherProgressMeters / PASSIVE_GATHER_DISTANCE_M) * 100)
  );
  const remainingGather = Math.max(
    1,
    Math.ceil(PASSIVE_GATHER_DISTANCE_M - player.gatherProgressMeters)
  );

  const cycleTimeOfDay = () => {
    const next =
      player.timeOfDay === 'day'
        ? 'dusk'
        : player.timeOfDay === 'dusk'
        ? 'night'
        : 'day';
    setTimeOfDay(next);
  };

  const TimeIcon =
    player.timeOfDay === 'day'
      ? Sun
      : player.timeOfDay === 'dusk'
      ? Sunrise
      : Moon;

  const totalBlocksOwned =
    (player.blockPools.solid ?? 0) +
    (player.blockPools.glass ?? 0) +
    (player.blockPools.light ?? 0);

  return (
    <>
      <div className="hud-top">
        <div className="hud-top-row">
          <div className="hud-card hud-status-card">
            <div className="hud-status-line">
              <span
                className="biome-pill"
                style={{
                  backgroundColor: biomeMeta.badgeColor,
                  color: biomeMeta.accentTextColor
                }}
              >
                {biomeMeta.nameJa}
              </span>
              <span className="walk-stat-text">
                {Math.floor(player.walkedMeters)}m 歩行
              </span>
            </div>
            <div className="gather-bar-track">
              <div className="gather-bar-fill" style={{ width: `${gatherPct}%` }} />
            </div>
            <div className="gather-bar-caption">
              <span>次の自動採集</span>
              <span>あと {remainingGather}m</span>
            </div>
          </div>

          <div className="hud-quick-actions">
            <button
              type="button"
              className={`icon-pill-btn ${legendOpen ? 'active' : ''}`}
              onClick={() => setLegendOpen((v) => !v)}
              aria-label="バイオーム凡例を表示"
              title="バイオーム凡例"
            >
              <Layers size={16} />
            </button>
            <button
              type="button"
              className="icon-pill-btn"
              onClick={cycleTimeOfDay}
              aria-label="時間帯を切り替える"
              title="昼・夕方・夜の切り替え"
            >
              <TimeIcon size={16} />
            </button>
            <button
              type="button"
              className={`icon-pill-btn ${locationMode === 'gps' ? 'active' : ''}`}
              onClick={() =>
                setLocationMode(locationMode === 'gps' ? 'virtual' : 'gps')
              }
              aria-label="GPSと仮想歩行を切り替える"
            >
              {locationMode === 'gps' ? (
                <>
                  <Navigation size={15} />
                  <span>GPS</span>
                </>
              ) : (
                <>
                  <Footprints size={15} />
                  <span>仮想歩行</span>
                </>
              )}
            </button>
          </div>
        </div>

        {legendOpen && (
          <div className="biome-legend-card" role="region" aria-label="バイオーム色分け凡例">
            {BIOME_ORDER.map((id) => {
              const meta = BIOME_META[id];
              return (
                <div key={id} className="biome-legend-item">
                  <span
                    className="biome-legend-dot"
                    style={{ backgroundColor: meta.badgeColor }}
                  />
                  <span>{meta.nameJa}</span>
                </div>
              );
            })}
          </div>
        )}

        {gpsError && (
          <div className="gps-banner">
            <span>{gpsError}</span>
            <button
              type="button"
              className="mini-chip-btn"
              style={{ flex: 'none' }}
              onClick={() => setLocationMode('virtual')}
            >
              仮想歩行へ
            </button>
          </div>
        )}

        {toasts.length > 0 && (
          <div className="toast-stack" aria-live="polite">
            {toasts.map((toast) => (
              <div
                key={toast.id}
                className="toast-item"
                style={{ borderLeftColor: toast.accentColor }}
                onClick={() => dismissToast(toast.id)}
              >
                <div className="toast-title">{toast.titleJa}</div>
                <div className="toast-detail">{toast.detailJa}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <nav className="bottom-dock" aria-label="メインメニュー">
        <button
          type="button"
          className="dock-btn"
          onClick={() => setActiveModal('craft')}
        >
          <Hammer size={19} />
          <span>クラフト ({totalBlocksOwned})</span>
        </button>
        <button
          type="button"
          className="dock-btn"
          onClick={() => setActiveModal('milestones')}
        >
          <Award size={19} />
          <span>実績 ({player.claimedMilestones.length}/5)</span>
        </button>
        <button
          type="button"
          className="dock-btn"
          onClick={triggerFocusMap}
        >
          <Compass size={19} />
          <span>現在地へ</span>
        </button>
        <button
          type="button"
          className="dock-btn"
          onClick={() => setActiveModal('settings')}
        >
          <Settings size={19} />
          <span>設定</span>
        </button>
      </nav>
    </>
  );
}
