import { ReaderPreferences } from '../types';

export const APP_VERSION = '0.2.3';

export const UI_STATE_KEY = 'comicflow_ui_state_v2';
export const READER_PREFERENCES_KEY = 'comicflow_reader_preferences_v1';

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  mode: 'Single Page',
  scrollFullWidth: false,
  transitionStyle: 'Slide',
  ambientEnabled: true
};

export const readReaderPreferences = (): ReaderPreferences => {
  try {
    const saved = JSON.parse(
      localStorage.getItem(READER_PREFERENCES_KEY) || '{}'
    ) as Partial<ReaderPreferences>;

    return {
      mode:
        saved.mode === 'Single Page' ||
        saved.mode === 'Double Page' ||
        saved.mode === 'Scroll'
          ? saved.mode
          : DEFAULT_READER_PREFERENCES.mode,
      scrollFullWidth:
        typeof saved.scrollFullWidth === 'boolean'
          ? saved.scrollFullWidth
          : DEFAULT_READER_PREFERENCES.scrollFullWidth,
      transitionStyle:
        saved.transitionStyle === 'Slide' ||
        saved.transitionStyle === 'Fade' ||
        saved.transitionStyle === 'Cinematic'
          ? saved.transitionStyle
          : DEFAULT_READER_PREFERENCES.transitionStyle,
      ambientEnabled:
        typeof saved.ambientEnabled === 'boolean'
          ? saved.ambientEnabled
          : DEFAULT_READER_PREFERENCES.ambientEnabled
    };
  } catch {
    return DEFAULT_READER_PREFERENCES;
  }
};
