export interface ControlHelpEntry {
  keys: string;
  description: string;
}

export const GAME_CONTROLS_HELP: readonly ControlHelpEntry[] = [
  { keys: 'WASD', description: 'Move' },
  { keys: 'Shift + W', description: 'Sprint' },
  { keys: 'Space', description: 'Jump' },
  { keys: 'C', description: 'Crouch' },
  { keys: 'Sprint / Land + C', description: 'Slide' },
  { keys: 'Space (slide)', description: 'Jump-cancel slide' },
  { keys: 'Mouse', description: 'Look around' },
  { keys: 'LMB', description: 'Shoot / melee attack' },
  { keys: 'RMB', description: 'Aim down sights' },
  { keys: 'R', description: 'Reload' },
  { keys: '1 / 2 / 3', description: 'Switch weapons' },
  { keys: 'X', description: 'Equip melee' },
  { keys: 'V', description: 'Melee attack' },
  { keys: '4', description: 'Recharge shield' },
  { keys: 'Q', description: 'Deploy shield dome' },
  { keys: 'Hold F', description: 'Pick up items' },
  { keys: 'Tab', description: 'Open inventory' },
  { keys: 'M', description: 'Toggle tactical map' },
  { keys: '5', description: 'Release mouse' },
  { keys: 'Esc', description: 'Pause game' },
];

export const INVENTORY_CONTROLS_HELP: readonly ControlHelpEntry[] = [
  { keys: 'Tab', description: 'Close inventory' },
  { keys: 'Drag out', description: 'Drop weapon / shield' },
  { keys: 'LMB', description: 'Equip item / switch loadout' },
  { keys: 'RMB', description: 'Examine item' },
];
