export type ReaderMode = 'Single Page' | 'Double Page' | 'Scroll';
export type ReaderTransitionStyle = 'Slide' | 'Fade' | 'Cinematic';

export type ReaderPreferences = {
  mode: ReaderMode;
  scrollFullWidth: boolean;
  transitionStyle: ReaderTransitionStyle;
  ambientEnabled: boolean;
};

export type SavedUIState = {
  view?: 'library' | 'vault-detail' | 'series' | 'reader' | 'journey';
  activeVaultId?: string | null;
  activeSeriesId?: string | null;
  activeComicId?: string | null;
  momentJumpPage?: number | null;
};

export type DictionaryEntry = {
  word: string;
  partOfSpeech: string;
  definition: string;
};
