export interface CharacterPerkState {
  key: string;
  value: number;
  label: string;
  description: string;
}

export interface CharacterState {
  id: string;
  name: string;
  description: string;
  biography: string;
  faceModelFile: string;
  bodyAssetFile: string | null;
  perk: CharacterPerkState;
  cost: number;
  unlocked: boolean;
  selected: boolean;
}

export interface CharactersResponse {
  selectedCharacterId: string;
  /** Equipped store body-skin id (for previewing face on current skin). */
  selectedSkinId: string;
  characters: CharacterState[];
}

export interface SelectCharacterResponse {
  selectedCharacterId: string;
  characters: CharacterState[];
}
