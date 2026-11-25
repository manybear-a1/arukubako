import { Download, RotateCcw, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useGameStore } from '../store/useGameStore';

export function SettingsModal() {
  const activeModal = useGameStore((s) => s.activeModal);
  const setActiveModal = useGameStore((s) => s.setActiveModal);
  const exportBackupJson = useGameStore((s) => s.exportBackupJson);
  const importBackupJson = useGameStore((s) => s.importBackupJson);
  const resetWorld = useGameStore((s) => s.resetWorld);

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (activeModal !== 'settings') return null;

  const handleExport = async () => {
    try {
      const json = await exportBackupJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `arukubako-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusMsg('バックアップJSONをダウンロードしました。');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : '書き出しに失敗しました。');
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await importBackupJson(text);
      setStatusMsg('バックアップから復元しました。');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : '復元に失敗しました。');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => setActiveModal(null)}>
      <div
        className="modal-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="設定とバックアップ"
      >
        <div className="modal-header">
          <div className="modal-title">設定・あそびかた</div>
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
          <div
            style={{
              background: '#F1F5F9',
              border: '2px solid #18202E',
              borderRadius: 12,
              padding: 12,
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1.65,
              color: '#18202E'
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 4 }}>アルクバコ v0.2 の特徴</div>
            <div>1. 探索円（半径40m）が区画の端に少しでも触れると即座に解放され、実際の標高傾斜＋バイオーム地形がブロック生成されます。</div>
            <div>2. 画面上部のレアスポットレーダーで最寄りのスポット方位・距離を確認でき、仮想歩行では「向かう」で自動移動できます。</div>
            <div>3. 「クラフト」でソリッド／ガラス／ライトの3系統を作成すると、建築パレットの全19色から自由に選んで高さ48段まで建てられます。</div>
            <div>4. 建築画面では前後左右8方位の隣接区画も表示され、地形を削って整地することもできます（「地形復元」で元に戻せます）。</div>
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 6 }}>
              セーブデータのバックアップ
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={handleExport}>
                <Download size={16} />
                書き出し
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ flex: 1 }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={16} />
                読み込み
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={handleImportFile}
              />
            </div>
          </div>

          <div>
            {!confirmReset ? (
              <button
                type="button"
                className="btn-secondary"
                style={{ width: '100%', color: '#DC2626' }}
                onClick={() => setConfirmReset(true)}
              >
                <RotateCcw size={16} />
                ワールドデータを初期化
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: '#EF4444' }}
                  onClick={() => {
                    void resetWorld();
                    setConfirmReset(false);
                  }}
                >
                  本当に初期化する
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setConfirmReset(false)}
                >
                  キャンセル
                </button>
              </div>
            )}
          </div>

          {statusMsg && (
            <div style={{ fontSize: 12, color: '#059669', fontWeight: 900 }}>
              {statusMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
