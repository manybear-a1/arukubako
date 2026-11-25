import { X } from 'lucide-react';
import {
  BLOCK_POOLS,
  BLOCK_POOL_ORDER,
  CRAFT_RECIPES,
  MATERIAL_ORDER,
  MATERIALS,
  canCraft
} from '../core/catalog';
import type { MaterialId } from '../core/types';
import { useGameStore } from '../store/useGameStore';

export function CraftModal() {
  const activeModal = useGameStore((s) => s.activeModal);
  const materials = useGameStore((s) => s.player.materials);
  const blockPools = useGameStore((s) => s.player.blockPools);
  const craftBlockPool = useGameStore((s) => s.craftBlockPool);
  const setActiveModal = useGameStore((s) => s.setActiveModal);

  if (activeModal !== 'craft') return null;

  return (
    <div className="modal-backdrop" onClick={() => setActiveModal(null)}>
      <div
        className="modal-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="建材クラフト"
      >
        <div className="modal-header">
          <div className="modal-title">素材と3系統クラフト</div>
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
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 5, color: '#475569' }}>
              集めた素材
            </div>
            <div className="material-strip">
              {MATERIAL_ORDER.map((id) => {
                const m = MATERIALS[id];
                return (
                  <div key={id} className="material-chip">
                    <span className="swatch-dot" style={{ backgroundColor: m.color }} />
                    <span style={{ fontSize: 11, fontWeight: 900 }}>{m.nameJa}</span>
                    <span style={{ fontSize: 15, fontWeight: 900 }}>
                      {materials[id] ?? 0}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 5, color: '#475569' }}>
              所持ブロック在庫（建築パレットで19色から自由に選べます）
            </div>
            <div className="pool-strip">
              {BLOCK_POOL_ORDER.map((pid) => {
                const pool = BLOCK_POOLS[pid];
                return (
                  <div key={pid} className="material-chip">
                    <span className="swatch-dot" style={{ backgroundColor: pool.color }} />
                    <span style={{ fontSize: 11, fontWeight: 900 }}>{pool.nameJa}</span>
                    <span style={{ fontSize: 15, fontWeight: 900 }}>
                      {blockPools[pid] ?? 0}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CRAFT_RECIPES.map((recipe) => {
              const pool = BLOCK_POOLS[recipe.pool];
              const costText = (
                Object.entries(recipe.ingredients) as [MaterialId, number][]
              )
                .map(([matId, qty]) => `${MATERIALS[matId].nameJa}×${qty}`)
                .join(' + ');

              const can1 = canCraft(materials, recipe, 1);
              const can5 = canCraft(materials, recipe, 5);

              return (
                <div key={recipe.id} className="recipe-card">
                  <div className="recipe-info">
                    <div
                      className="block-swatch-lg"
                      style={{
                        backgroundColor: pool.color,
                        opacity: recipe.pool === 'glass' ? 0.72 : 1
                      }}
                    />
                    <div>
                      <div className="recipe-name">{recipe.nameJa}</div>
                      <div className="recipe-sub">
                        {costText} → {pool.nameJa}+{recipe.outputCount}
                      </div>
                    </div>
                  </div>
                  <div className="recipe-btns">
                    <button
                      type="button"
                      className="craft-btn"
                      disabled={!can1}
                      onClick={() => craftBlockPool(recipe.id, 1)}
                    >
                      ×1
                    </button>
                    <button
                      type="button"
                      className="craft-btn"
                      disabled={!can5}
                      onClick={() => craftBlockPool(recipe.id, 5)}
                    >
                      ×5
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
