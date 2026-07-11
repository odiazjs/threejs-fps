/** Client notifies server that a reload has started. */
export interface ReloadMessage {
  readonly weaponId: string;
  /** Optional override for remote reload anim length (shell sequences). */
  readonly durationSec?: number;
}

/** Client notifies server that a reload was cancelled or finished early. */
export interface ReloadStopMessage {
  readonly weaponId?: string;
}
