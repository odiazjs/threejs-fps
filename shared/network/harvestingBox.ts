export const HARVESTING_BOX_INTERACT_MESSAGE = 'interactHarvestingBox' as const;
export const HARVESTING_BOX_INSTALL_HOLD_MESSAGE = 'harvestingBoxInstallHold' as const;

export type HarvestingBoxInteractAction = 'pickup' | 'drop' | 'install';

export interface HarvestingBoxInteractMessage {
  readonly index: number;
  readonly action: HarvestingBoxInteractAction;
  /** Client feet for proximity checks. */
  readonly x: number;
  readonly z: number;
}

export interface HarvestingBoxInstallHoldMessage {
  readonly holding: boolean;
}
