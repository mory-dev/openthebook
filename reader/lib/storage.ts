import { invoke } from '@tauri-apps/api/core';
import type { BookFormat } from './formats';

export type Theme = 'system' | 'light' | 'dark';

export type Associations = {
  pdf: boolean;
  epub: boolean;
  azw3: boolean;
  mobi: boolean;
};

export type ScrollStep = 'small' | 'medium' | 'large';

export type FormatPreference = {
  fullscreen?: boolean;
  fontScale?: number;
  displayFullBook?: boolean;
};

export type AppSettings = {
  theme: Theme;
  fontScale: number;
  fullscreen: boolean;
  displayFullBook: boolean;
  updatesEnabled: boolean;
  scrollStep: ScrollStep;
  associations: Associations;
  formatSettings?: Partial<Record<'pdf' | 'epub' | 'azw3' | 'mobi', FormatPreference>>;
};

export type BookProgress = {
  filePath: string;
  chapter: number;
  exactScrollTop?: number;
  scrollRatio?: number;
  chapterOffsetRatio?: number;
  pdfPage?: number;
  lastRead: string;
};

export type ReadingState = {
  lastBookPath?: string;
  progress: Record<string, BookProgress>;
};

export type Highlight = {
  id: string;
  filePath: string;
  format: BookFormat;
  text: string;
  locator: {
    page?: number;
    chapter?: number;
    start?: number;
    end?: number;
    prefix?: string;
    suffix?: string;
  };
  createdAt: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  fontScale: 1,
  fullscreen: true,
  displayFullBook: true,
  updatesEnabled: true,
  scrollStep: 'small',
  associations: { pdf: true, epub: true, azw3: true, mobi: true },
  formatSettings: {},
};

const STORAGE_SETTINGS = 'openthebook.settings';
const STORAGE_HIGHLIGHTS = 'openthebook.highlights';
const STORAGE_READING_STATE = 'openthebook.reading_state';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function mergeSettings(value: Partial<AppSettings> | null | undefined): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    fontScale: typeof value?.fontScale === 'number' ? Math.min(1.35, Math.max(0.85, value.fontScale)) : DEFAULT_SETTINGS.fontScale,
    fullscreen: value?.fullscreen !== false,
    displayFullBook: value?.displayFullBook !== false,
    scrollStep: value?.scrollStep === 'medium' || value?.scrollStep === 'large' ? value.scrollStep : 'small',
    associations: { ...DEFAULT_SETTINGS.associations, ...value?.associations },
    formatSettings: { ...value?.formatSettings },
  };
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const value = isTauri()
      ? await invoke<Partial<AppSettings> | null>('load_settings')
      : JSON.parse(localStorage.getItem(STORAGE_SETTINGS) ?? 'null') as Partial<AppSettings> | null;
    return mergeSettings(value);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const normalized = mergeSettings(settings);
  if (isTauri()) {
    await invoke('save_settings', { settings: normalized });
    return;
  }
  localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(normalized));
}

export async function loadHighlights(): Promise<Highlight[]> {
  try {
    const value = isTauri()
      ? await invoke<Highlight[]>('load_highlights')
      : JSON.parse(localStorage.getItem(STORAGE_HIGHLIGHTS) ?? '[]') as Highlight[];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export async function saveHighlights(highlights: Highlight[]): Promise<void> {
  if (isTauri()) {
    await invoke('save_highlights', { highlights });
    return;
  }
  localStorage.setItem(STORAGE_HIGHLIGHTS, JSON.stringify(highlights));
}

export async function getUserDataPath(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<string>('user_data_path');
  } catch {
    return null;
  }
}

export async function loadReadingState(): Promise<ReadingState> {
  try {
    const value = isTauri()
      ? await invoke<ReadingState | null>('load_reading_state')
      : JSON.parse(localStorage.getItem(STORAGE_READING_STATE) ?? 'null') as ReadingState | null;
    return {
      lastBookPath: typeof value?.lastBookPath === 'string' ? value.lastBookPath : undefined,
      progress: value?.progress && typeof value.progress === 'object' ? value.progress : {},
    };
  } catch {
    return { progress: {} };
  }
}

export async function saveReadingState(state: ReadingState): Promise<void> {
  if (isTauri()) {
    await invoke('save_reading_state', { state });
    return;
  }
  localStorage.setItem(STORAGE_READING_STATE, JSON.stringify(state));
}

export async function openDefaultApps(): Promise<void> {
  if (isTauri()) await invoke('open_default_apps');
}
