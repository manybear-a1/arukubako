import type { BackupPayload, PlayerState, PlotData, PlotId, WorldSnapshot } from '../core/types';

export interface WorldRepository {
  loadWorld(): Promise<WorldSnapshot | null>;
  savePlayerState(player: PlayerState): Promise<void>;
  savePlot(plot: PlotData): Promise<void>;
  deletePlot(plotId: PlotId): Promise<void>;
  clearAll(): Promise<void>;
  exportBackup(): Promise<BackupPayload>;
  importBackup(payload: BackupPayload): Promise<WorldSnapshot>;
}
