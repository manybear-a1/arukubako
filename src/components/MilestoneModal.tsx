import { CheckCircle2, Lock, X } from 'lucide-react';
import { MILESTONES, formatMaterialSummary } from '../core/catalog';
import { useGameStore } from '../store/useGameStore';

export function MilestoneModal() {
  const activeModal = useGameStore((s) => s.activeModal);
  const player = useGameStore((s) => s.player);
  const plots = useGameStore((s) => s.plots);
  const setActiveModal = useGameStore((s) => s.setActiveModal);

  if (activeModal !== 'milestones') return null;

  const unlockedPlotCount = Object.keys(plots).length;

  return (
    <div className="modal-backdrop" onClick={() => setActiveModal(null)}>
      <div
        className="modal-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="探索と建築の実績"
      >
        <div className="modal-header">
          <div className="modal-title">探索と建築の実績</div>
          <button
            type="button"
            className="btn-close-sm"
            onClick={() => setActiveModal(null)}
            aria-label="閉じる"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="pool-strip">
            <div className="material-chip">
              <span style={{ fontSize: 10, fontWeight: 800, color: '#475569' }}>累計歩行</span>
              <span style={{ fontSize: 15, fontWeight: 900 }}>
                {Math.floor(player.walkedMeters)}m
              </span>
            </div>
            <div className="material-chip">
              <span style={{ fontSize: 10, fontWeight: 800, color: '#475569' }}>解放区画</span>
              <span style={{ fontSize: 15, fontWeight: 900 }}>
                {unlockedPlotCount}
              </span>
            </div>
            <div className="material-chip">
              <span style={{ fontSize: 10, fontWeight: 800, color: '#475569' }}>設置ブロック</span>
              <span style={{ fontSize: 15, fontWeight: 900 }}>
                {player.totalBlocksPlaced}
              </span>
            </div>
          </div>

          {MILESTONES.map((m) => {
            const achieved = player.claimedMilestones.includes(m.id);
            const current =
              m.metric === 'walkedMeters'
                ? Math.floor(player.walkedMeters)
                : m.metric === 'placedBlocks'
                ? player.totalBlocksPlaced
                : unlockedPlotCount;
            const pct = Math.min(100, Math.round((current / m.target) * 100));

            return (
              <div
                key={m.id}
                className="recipe-card"
                style={{
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: 6,
                  background: achieved ? '#ECFDF5' : '#FFFFFF'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  <div>
                    <div className="recipe-name">{m.titleJa}</div>
                    <div className="recipe-sub">{m.descriptionJa}</div>
                  </div>
                  {achieved ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 12,
                        fontWeight: 900,
                        color: '#059669'
                      }}
                    >
                      <CheckCircle2 size={16} />
                      達成
                    </span>
                  ) : (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 12,
                        fontWeight: 900,
                        color: '#475569'
                      }}
                    >
                      <Lock size={14} />
                      {Math.min(current, m.target)}/{m.target}
                    </span>
                  )}
                </div>

                <div className="gather-bar-track">
                  <div className="gather-bar-fill" style={{ width: `${pct}%` }} />
                </div>

                <div style={{ fontSize: 11, color: '#475569', fontWeight: 800 }}>
                  報酬: {formatMaterialSummary(m.rewardMaterials)}
                  {m.unlockLabelJa ? ` ／ ${m.unlockLabelJa}` : ''}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
