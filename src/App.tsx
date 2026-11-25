import { useEffect } from 'react';
import { CraftModal } from './components/CraftModal';
import { HudOverlay } from './components/HudOverlay';
import { MapScreen } from './components/MapScreen';
import { MilestoneModal } from './components/MilestoneModal';
import { SettingsModal } from './components/SettingsModal';
import { VirtualWalkPad } from './components/VirtualWalkPad';
import { VoxelEditorScreen } from './components/VoxelEditorScreen';
import { useGameStore } from './store/useGameStore';

export function App() {
  const initialized = useGameStore((s) => s.initialized);
  const screen = useGameStore((s) => s.screen);
  const activePlotId = useGameStore((s) => s.activePlotId);
  const initialize = useGameStore((s) => s.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  if (!initialized) {
    return (
      <div
        className="app-shell"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 10
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 800 }}>アルクバコ</div>
        <div style={{ fontSize: 13, color: '#6e6256' }}>地図と箱庭を準備しています...</div>
      </div>
    );
  }

  return (
    <main className="app-shell">
      {screen === 'map' ? (
        <>
          <MapScreen />
          <HudOverlay />
          <VirtualWalkPad />
        </>
      ) : (
        <VoxelEditorScreen key={activePlotId ?? 'editor'} />
      )}

      <CraftModal />
      <MilestoneModal />
      <SettingsModal />
    </main>
  );
}

export default App;
