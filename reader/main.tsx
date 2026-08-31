import { getCurrentWindow } from '@tauri-apps/api/window';
import { getVersion } from '@tauri-apps/api/app';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { authorFromFilename, formatFromPath, inlineChapterImages, parseAzw3, parseEpub, parseMobi, type ParsedBook } from './lib/formats';
import { Icon } from './lib/icons';
import { SHORTCUTS } from './lib/shortcuts';
import { DEFAULT_SETTINGS, loadHighlights, loadReadingState, loadSettings, openDefaultApps, saveHighlights, saveReadingState, saveSettings, type AppSettings, type BookProgress, type Highlight, type ReadingState, type ScrollStep } from './lib/storage';
import { hasPreparedUpdate, installPreparedUpdate, prepareUpdate } from './lib/update';
import './styles.css';

type OpenBook = ParsedBook & { path: string; buffer: ArrayBuffer };
type UpdateState = 'idle' | 'checking' | 'downloading' | 'ready' | 'failed';

const UPDATE_COPY: Record<UpdateState, string> = {
  idle: 'Up to date',
  checking: 'Checking for updates…',
  downloading: 'Downloading update…',
  ready: 'Update ready — installs when you close',
  failed: 'Update check failed',
};

const FORMAT_KEYS = ['pdf', 'epub', 'azw3', 'mobi'] as const;
const FONT_STEP = 0.02;
const MIN_FONT = 0.85;
const MAX_FONT = 1.35;

const materializedCache = new Map<number, string>();

type WorkerBookFormat = 'epub' | 'azw3' | 'mobi';

function parseOnMainThread(buffer: ArrayBuffer, format: WorkerBookFormat): Promise<ParsedBook> {
  if (format === 'epub') return parseEpub(buffer);
  return Promise.resolve(format === 'azw3' ? parseAzw3(buffer) : parseMobi(buffer));
}

function parseBookInWorker(buffer: ArrayBuffer, format: WorkerBookFormat): Promise<ParsedBook> {
  if (typeof Worker === 'undefined') return parseOnMainThread(buffer, format);

  const fallbackBuffer = buffer.slice(0);
  const workerBuffer = buffer.slice(0);
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./lib/book-worker.ts', import.meta.url), { type: 'module' });
    } catch {
      void parseOnMainThread(fallbackBuffer, format).then(resolve, reject);
      return;
    }

    worker.onmessage = (event: MessageEvent<{ error?: string; parsed?: ParsedBook }>) => {
      worker.terminate();
      if (event.data.parsed) resolve(event.data.parsed);
      else void parseOnMainThread(fallbackBuffer, format).then(resolve, reject);
    };
    worker.onerror = () => {
      worker.terminate();
      void parseOnMainThread(fallbackBuffer, format).then(resolve, reject);
    };
    worker.postMessage({ buffer: workerBuffer, format }, [workerBuffer]);
  });
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function shortName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function normalizeBookPath(path: string): string {
  const trimmed = path.trim().replace(/^"(.*)"$/, '$1');
  if (!trimmed.toLowerCase().startsWith('file://')) return trimmed;
  try {
    const url = new URL(trimmed);
    const decodedPath = decodeURIComponent(url.pathname);
    return decodedPath.replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, '\\');
  } catch {
    return trimmed;
  }
}

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function getScrollStepPx(step: ScrollStep): number {
  switch (step) {
    case 'medium': return 250;
    case 'large': return 500;
    case 'small':
    default:
      return 120;
  }
}

/** Absolute character offset of a DOM position inside a root element. */
function textOffset(root: Node, target: Node, offset: number): number {
  let position = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null;
  while ((current = walker.nextNode())) {
    if (current === target) {
      position += offset;
      return position;
    }
    position += current.textContent?.length ?? 0;
  }
  return position;
}

function unwrapMark(mark: Element): void {
  const parent = mark.parentNode as HTMLElement;
  if (!parent) return;
  while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
  parent.removeChild(mark);
}

/** Wrap a character range of a container's text in a mark; returns the mark. Preserves exact text ordering. */
function wrapTextRange(container: HTMLElement, start: number, end: number, className: string): HTMLElement | null {
  if (end <= start) return null;
  const targets: { node: Node; s: number; e: number }[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let current: Node | null;
  while ((current = walker.nextNode())) {
    const text = current.textContent ?? '';
    const nodeStart = offset;
    const nodeEnd = offset + text.length;
    if (nodeEnd > start && nodeStart < end) {
      targets.push({ node: current, s: Math.max(0, start - nodeStart), e: Math.min(text.length, end - nodeStart) });
    }
    offset = nodeEnd;
    if (offset >= end) break;
  }
  let created: HTMLElement | null = null;
  for (let index = targets.length - 1; index >= 0; index -= 1) {
    const { node, s, e } = targets[index];
    const text = node.textContent ?? '';
    const slice = text.slice(s, e);
    if (!slice.trim()) continue; // Do not wrap empty or whitespace-only nodes

    const parent = node.parentNode as HTMLElement | null;
    if (!parent) continue;
    const tag = parent.tagName?.toUpperCase();
    if (tag === 'TABLE' || tag === 'TBODY' || tag === 'THEAD' || tag === 'TFOOT' || tag === 'TR') {
      continue; // Never inject inline mark directly into table structures
    }

    const frag = document.createDocumentFragment();
    if (s > 0) {
      frag.appendChild(document.createTextNode(text.slice(0, s)));
    }
    const mark = document.createElement('mark');
    mark.className = className;
    mark.textContent = slice;
    frag.appendChild(mark);
    if (e < text.length) {
      frag.appendChild(document.createTextNode(text.slice(e)));
    }
    parent.replaceChild(frag, node);
    if (!created) created = mark;
  }
  return created;
}

/** Sanitized chapter HTML with images inlined as data URIs, cached per chapter. */
function materializeChapter(book: OpenBook, index: number): string {
  const cached = materializedCache.get(index);
  if (cached) return cached;
  const html = inlineChapterImages(
    book.chapters[index] ?? '',
    book.chapterPaths?.[index] ?? '',
    (name) => book.imageFiles?.get(name.toLowerCase()),
  );
  materializedCache.set(index, html);
  return html;
}

interface BookContentProps {
  book: OpenBook;
  chapter: number;
  displayFullBook: boolean;
  fontScale: number;
  onContextMenu: (event: React.MouseEvent) => void;
  bookRef: React.RefObject<HTMLElement | null>;
}

const BookContent = React.memo(function BookContent({ book, chapter, displayFullBook, fontScale, onContextMenu, bookRef }: BookContentProps) {
  return (
    <article ref={bookRef} className="book-content" style={{ fontSize: `${fontScale}em` }} onContextMenu={onContextMenu}>
      {Array.from({ length: displayFullBook ? book.chapters.length : 1 }, (_, sectionIndex) => {
        const index = displayFullBook ? sectionIndex : chapter;
        return (
          <section className={`book-section ${index === chapter ? 'book-section-active' : ''}`} data-chapter={index} key={index}>
            {displayFullBook && index > 0 ? <hr className="chapter-divider" /> : null}
            <div dangerouslySetInnerHTML={{ __html: materializeChapter(book, index) }} />
          </section>
        );
      })}
    </article>
  );
}, (prev, next) => {
  if (prev.book !== next.book) return false;
  if (prev.displayFullBook !== next.displayFullBook) return false;
  if (prev.fontScale !== next.fontScale) return false;
  if (!next.displayFullBook && prev.chapter !== next.chapter) return false;
  return true;
});

function App() {
  const [book, setBook] = useState<OpenBook | null>(null);
  const [chapter, setChapter] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [highlightsOpen, setHighlightsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [readingState, setReadingState] = useState<ReadingState>({ progress: {} });
  const [busy, setBusy] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [message, setMessage] = useState('');
  const [openError, setOpenError] = useState<{ path: string; message: string } | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>('idle');
  const [version, setVersion] = useState('0.1.0');
  const [systemDark, setSystemDark] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  ));
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findIndex, setFindIndex] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [readingPercent, setReadingPercent] = useState(0);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfTotalPages, setPdfTotalPages] = useState(1);
  const [menu, setMenu] = useState<{ x: number; y: number; text: string } | null>(null);
  const [pendingSelection, setPendingSelection] = useState<{ chapter: number; start: number; end: number; text: string } | null>(null);
  const [headerHover, setHeaderHover] = useState(false);
  const [isWindowFullscreen, setIsWindowFullscreen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const bookRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const focusHighlightRef = useRef<string | null>(null);
  const updateRef = useRef(false);
  const allowCloseRef = useRef(false);
  const hideHeaderTimerRef = useRef<number | undefined>(undefined);
  const pendingFontRatioRef = useRef<number | null>(null);
  const appliedModeRef = useRef<boolean | null>(null);
  const chapterRef = useRef(0);
  const loadRequestRef = useRef(0);
  const settingsLoadedRef = useRef(false);
  const highlightsLoadedRef = useRef(false);
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; });

  const saveProgressTimerRef = useRef<number | undefined>(undefined);
  const restoringProgressRef = useRef(false);
  const pendingRestoreRef = useRef<{ chapter: number; chapterOffsetRatio?: number; scrollRatio?: number; exactScrollTop?: number } | null>(null);
  const readingAnchorRef = useRef<{ chapter: number; chapterOffsetRatio: number }>({ chapter: 0, chapterOffsetRatio: 0 });

  useEffect(() => { chapterRef.current = chapter; });

  const chromeForced = settingsOpen || highlightsOpen || (!book && initialized && !busy);
  const chromeVisible = !initialized ? false : !book ? !busy : headerHover || settingsOpen || highlightsOpen;

  const updateWindowState = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const win = getCurrentWindow();
      const fs = await win.isFullscreen();
      setIsWindowFullscreen(fs);
    } catch { /* noop */ }
  }, []);

  const persistCurrentProgress = useCallback((ch: number, chapterRatio?: number, totalRatio?: number, exactScroll?: number, page?: number) => {
    if (!book || restoringProgressRef.current) return;
    if (saveProgressTimerRef.current !== undefined) window.clearTimeout(saveProgressTimerRef.current);
    saveProgressTimerRef.current = window.setTimeout(() => {
      setReadingState((prev) => {
        const currentProg = prev.progress[book.path] || { filePath: book.path, chapter: ch, lastRead: '' };
        const updated: BookProgress = {
          ...currentProg,
          chapter: ch,
          exactScrollTop: exactScroll !== undefined ? exactScroll : currentProg.exactScrollTop,
          chapterOffsetRatio: chapterRatio !== undefined ? chapterRatio : currentProg.chapterOffsetRatio,
          scrollRatio: totalRatio !== undefined ? totalRatio : currentProg.scrollRatio,
          pdfPage: page !== undefined ? page : currentProg.pdfPage,
          lastRead: new Date().toISOString(),
        };
        const nextState: ReadingState = {
          lastBookPath: book.path,
          progress: { ...prev.progress, [book.path]: updated },
        };
        void saveReadingState(nextState);
        return nextState;
      });
    }, 150);
  }, [book]);

  const handleFile = useCallback(async (path: string, bytes?: ArrayBuffer, savedProgress?: BookProgress) => {
    const requestId = ++loadRequestRef.current;
    const normalizedPath = normalizeBookPath(path);
    const format = formatFromPath(normalizedPath);
    if (!format) { setMessage('OpenTheBook reads PDF, EPUB, AZW3, and MOBI files.'); return; }
    setBusy(true);
    setOpenError(null);
    restoringProgressRef.current = true;
    setMessage(`Opening ${shortName(normalizedPath)}…`);
    try {
      const fileBytes = bytes ? null : await readFile(normalizedPath);
      const buffer = bytes ?? fileBytes!.buffer.slice(fileBytes!.byteOffset, fileBytes!.byteOffset + fileBytes!.byteLength);
      if (requestId !== loadRequestRef.current) return;
      const parsed: ParsedBook = format === 'pdf'
        ? { title: shortName(normalizedPath).replace(/\.pdf$/i, ''), format, chapters: [] }
        : await parseBookInWorker(buffer, format);
      if (requestId !== loadRequestRef.current) return;
      if (!parsed.author) parsed.author = authorFromFilename(normalizedPath);
      
      const targetChapter = savedProgress?.chapter ?? parsed.startChapter ?? 0;
      materializedCache.clear();
      setBook({ ...parsed, path: normalizedPath, buffer });
      setChapter(targetChapter);
      appliedModeRef.current = settingsRef.current.displayFullBook;
      setMessage('');
      setInitialized(true);

      const pref = settingsRef.current.formatSettings?.[format];
      if (pref) {
        const targetFs = pref.fullscreen !== undefined ? pref.fullscreen : settingsRef.current.fullscreen;
        const targetScale = pref.fontScale !== undefined ? pref.fontScale : settingsRef.current.fontScale;
        const targetFullBook = pref.displayFullBook !== undefined ? pref.displayFullBook : settingsRef.current.displayFullBook;
        if (targetFs !== settingsRef.current.fullscreen) {
          if (isTauri()) void getCurrentWindow().setFullscreen(targetFs);
          setIsWindowFullscreen(targetFs);
        }
        setSettings((s) => ({
          ...s,
          fullscreen: targetFs,
          fontScale: targetScale,
          displayFullBook: targetFullBook,
        }));
      }

      const targetRatio = savedProgress?.chapterOffsetRatio ?? 0;
      readingAnchorRef.current = { chapter: targetChapter, chapterOffsetRatio: targetRatio };

      if (savedProgress) {
        pendingRestoreRef.current = {
          chapter: targetChapter,
          chapterOffsetRatio: targetRatio,
          scrollRatio: savedProgress.scrollRatio ?? 0,
          exactScrollTop: savedProgress.exactScrollTop,
        };
      } else {
        pendingRestoreRef.current = null;
        setTimeout(() => { restoringProgressRef.current = false; }, 300);
      }

      setReadingState((prev) => {
        const nextState: ReadingState = {
          lastBookPath: normalizedPath,
          progress: {
            ...prev.progress,
            [normalizedPath]: {
              filePath: normalizedPath,
              chapter: targetChapter,
              exactScrollTop: savedProgress?.exactScrollTop,
              chapterOffsetRatio: targetRatio,
              scrollRatio: savedProgress?.scrollRatio ?? 0,
              pdfPage: savedProgress?.pdfPage ?? 1,
              lastRead: new Date().toISOString(),
            },
          },
        };
        void saveReadingState(nextState);
        return nextState;
      });
    } catch (error) {
      if (requestId !== loadRequestRef.current) return;
      console.error('[handleFile] Could not open book:', error);
      const errorMessage = error instanceof Error ? error.message : 'That book could not be opened.';
      setMessage(errorMessage);
      setOpenError({ path: normalizedPath, message: errorMessage });
      setInitialized(true);
      restoringProgressRef.current = false;
      pendingRestoreRef.current = null;
    } finally {
      if (requestId === loadRequestRef.current) setBusy(false);
    }
  }, []);

  // Robust, window-shape invariant scroll restoration after layout
  useLayoutEffect(() => {
    if (!book || !pendingRestoreRef.current) return;
    const restore = pendingRestoreRef.current;
    let frameId: number;
    let attempts = 0;

    const tryScroll = () => {
      attempts++;
      const stage = stageRef.current;
      const section = bookRef.current?.querySelector<HTMLElement>(`[data-chapter="${restore.chapter}"]`);
      if (stage && section && section.offsetHeight > 0) {
        const stageRect = stage.getBoundingClientRect();
        const sectionContentTop = section.getBoundingClientRect().top - stageRect.top + stage.scrollTop;
        const offset = (restore.chapterOffsetRatio ?? 0) * section.offsetHeight;
        const targetScroll = sectionContentTop + offset;
        stage.scrollTop = Math.max(0, targetScroll);
        pendingRestoreRef.current = null;
        setTimeout(() => { restoringProgressRef.current = false; }, 400);
      } else if (attempts < 15) {
        frameId = requestAnimationFrame(tryScroll);
      } else {
        pendingRestoreRef.current = null;
        restoringProgressRef.current = false;
      }
    };

    frameId = requestAnimationFrame(tryScroll);
    return () => cancelAnimationFrame(frameId);
  }, [book]);

  // Maintain exact reading paragraph across window resizing and fullscreen transitions
  useEffect(() => {
    let timer: number | undefined;
    const handleResize = () => {
      if (!book || restoringProgressRef.current || !settings.displayFullBook) return;
      if (timer !== undefined) cancelAnimationFrame(timer);
      timer = requestAnimationFrame(() => {
        const stage = stageRef.current;
        const anchor = readingAnchorRef.current;
        const section = bookRef.current?.querySelector<HTMLElement>(`[data-chapter="${anchor.chapter}"]`);
        if (stage && section && section.offsetHeight > 0) {
          const stageRect = stage.getBoundingClientRect();
          const sectionContentTop = section.getBoundingClientRect().top - stageRect.top + stage.scrollTop;
          const targetScroll = sectionContentTop + (anchor.chapterOffsetRatio * section.offsetHeight);
          stage.scrollTop = Math.max(0, targetScroll);
          persistCurrentProgress(anchor.chapter, anchor.chapterOffsetRatio, undefined, stage.scrollTop);
        }
      });
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (timer !== undefined) cancelAnimationFrame(timer);
    };
  }, [book, settings.displayFullBook, persistCurrentProgress]);

  const chooseBook = useCallback(async () => {
    if (isTauri()) {
      const selection = await open({ multiple: false, filters: [{ name: 'Books', extensions: ['pdf', 'epub', 'azw3', 'mobi'] }] });
      if (typeof selection === 'string') await handleFile(selection);
    } else {
      inputRef.current?.click();
    }
  }, [handleFile]);

  const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark);

  const changeFont = useCallback((scale: number) => {
    const stage = stageRef.current;
    if (stage) {
      const max = stage.scrollHeight - stage.clientHeight;
      pendingFontRatioRef.current = max > 0 ? stage.scrollTop / max : 0;
    }
    setSettings((value) => ({ ...value, fontScale: Math.min(MAX_FONT, Math.max(MIN_FONT, scale)) }));
  }, []);

  const scrollStage = useCallback((pixels: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.scrollBy({ top: pixels, behavior: 'smooth' });
  }, []);

  const clearPendingSelection = useCallback(() => {
    setPendingSelection(null);
    setMenu(null);
  }, []);

  const goToChapter = useCallback((index: number) => {
    setChapter(index);
    readingAnchorRef.current = { chapter: index, chapterOffsetRatio: 0 };
    persistCurrentProgress(index, 0);
    if (settings.displayFullBook && book) {
      requestAnimationFrame(() => {
        bookRef.current?.querySelector<HTMLElement>(`[data-chapter="${index}"]`)?.scrollIntoView({ block: 'start' });
      });
    }
  }, [book, persistCurrentProgress, settings.displayFullBook]);

  const goToHighlight = useCallback((highlight: Highlight) => {
    const targetChapter = highlight.locator.chapter ?? 0;
    const container = bookRef.current;
    const stage = stageRef.current;
    if (!container || !stage) return;

    if (!settings.displayFullBook && chapter !== targetChapter) {
      focusHighlightRef.current = highlight.id;
      setChapter(targetChapter);
      return;
    }

    const mark = container.querySelector<HTMLElement>(`mark[data-highlight-id="${CSS.escape(highlight.id)}"]`);
    if (mark) {
      const stageRect = stage.getBoundingClientRect();
      const markRect = mark.getBoundingClientRect();
      const markTopInContent = markRect.top - stageRect.top + stage.scrollTop;
      const targetScroll = markTopInContent - (stage.clientHeight / 2) + (markRect.height / 2);
      stage.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });

      mark.classList.add('active');
      window.setTimeout(() => mark.classList.remove('active'), 1600);
    } else {
      goToChapter(targetChapter);
    }
  }, [chapter, goToChapter, settings.displayFullBook]);

  const goFind = useCallback((delta: number) => {
    const container = bookRef.current;
    const stage = stageRef.current;
    if (!container || !stage) return;
    const marks = Array.from(container.querySelectorAll<HTMLElement>('mark.find-mark'));
    if (!marks.length) return;
    setFindIndex((curr) => {
      const next = (curr + delta + marks.length) % marks.length;
      marks.forEach((m, idx) => {
        if (idx === next) {
          m.classList.add('active');
          const stageRect = stage.getBoundingClientRect();
          const markRect = m.getBoundingClientRect();
          const markTopInContent = markRect.top - stageRect.top + stage.scrollTop;
          const targetScroll = markTopInContent - (stage.clientHeight / 2) + (markRect.height / 2);
          stage.scrollTop = Math.max(0, targetScroll);
        } else {
          m.classList.remove('active');
        }
      });
      return next;
    });
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!settingsLoadedRef.current) return;
    void saveSettings(settings);
  }, [settings]);
  useEffect(() => {
    if (!highlightsLoadedRef.current) return;
    void saveHighlights(highlights);
  }, [highlights]);

  useEffect(() => {
    if (!isTauri()) return;
    const timer = window.setTimeout(() => {
      void getVersion().then(setVersion).catch(() => {});
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isTauri() || !settingsLoadedRef.current) return;
    const win = getCurrentWindow();
    void win.setFullscreen(settings.fullscreen).then(updateWindowState);
  }, [settings.fullscreen, updateWindowState]);

  // Sync fullscreen state on window resize/unfullscreen
  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void win.onResized(async () => {
      const fs = await win.isFullscreen();
      setIsWindowFullscreen(fs);
      setSettings((s) => (s.fullscreen === fs ? s : { ...s, fullscreen: fs }));
    }).then((dispose) => { unlisten = dispose; });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (!settings.updatesEnabled) return;
    const timer = window.setTimeout(() => {
      void prepareUpdate((state) => {
        setUpdateState(state);
        if (state === 'ready') updateRef.current = true;
      });
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [settings.updatesEnabled]);

  // Bootstrap persisted state in parallel, but never block the initial window reveal on it.
  useEffect(() => {
    let cancelled = false;
    let highlightsTimer: number | undefined;
    const initialPathPromise = isTauri()
      ? invoke<string | null>('initial_book_path')
      : Promise.resolve(null);

    void Promise.all([initialPathPromise, loadSettings(), loadReadingState()]).then(([initialPath, loadedSettings, state]) => {
      if (cancelled) return;
      settingsLoadedRef.current = true;
      settingsRef.current = loadedSettings;
      setSettings(loadedSettings);
      setReadingState(state);

      const rawTargetPath = initialPath || state.lastBookPath;
      if (rawTargetPath) {
        const targetPath = normalizeBookPath(rawTargetPath);
        void handleFile(targetPath, undefined, state.progress[targetPath]);
      } else {
        setInitialized(true);
      }

      highlightsTimer = window.setTimeout(() => {
        void loadHighlights().then((loadedHighlights) => {
          if (cancelled) return;
          highlightsLoadedRef.current = true;
          setHighlights(loadedHighlights);
        });
      }, 0);
    }).catch(() => {
      if (cancelled) return;
      settingsLoadedRef.current = true;
      highlightsLoadedRef.current = true;
      setInitialized(true);
    });

    return () => {
      cancelled = true;
      if (highlightsTimer !== undefined) window.clearTimeout(highlightsTimer);
    };
  }, [handleFile]);

  const windowRevealedRef = useRef(false);

  const revealWindow = useCallback(() => {
    if (windowRevealedRef.current || !isTauri()) return;
    windowRevealedRef.current = true;
    requestAnimationFrame(() => {
      const win = getCurrentWindow();
      void win.show().then(() => win.setFocus()).catch(() => {
        void invoke('show_main_window').catch(() => {});
      });
    });
  }, []);

  // Reveal the shell on the first frame; the reading surface transitions from skeleton to content.
  useEffect(() => {
    const frame = window.requestAnimationFrame(revealWindow);
    return () => window.cancelAnimationFrame(frame);
  }, [revealWindow]);

  // Safety fallback to guarantee the hidden window is revealed even on a cold start.
  useEffect(() => {
    const timer = window.setTimeout(revealWindow, 350);
    return () => window.clearTimeout(timer);
  }, [revealWindow]);

  // Sync format-specific preferences
  useEffect(() => {
    if (!book) return;
    // This effect persists the current format's settings for the next visit.
    // The state update is intentional synchronization with the active book.
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setSettings((s) => {
      const currentPref = s.formatSettings?.[book.format];
      if (
        currentPref?.fullscreen === s.fullscreen &&
        currentPref?.fontScale === s.fontScale &&
        currentPref?.displayFullBook === s.displayFullBook
      ) {
        return s;
      }
      return {
        ...s,
        formatSettings: {
          ...s.formatSettings,
          [book.format]: {
            fullscreen: s.fullscreen,
            fontScale: s.fontScale,
            displayFullBook: s.displayFullBook,
          },
        },
      };
    });
  }, [book, settings.fullscreen, settings.fontScale, settings.displayFullBook]);

  const openFind = useCallback(() => {
    setFindOpen(true);
    setFindIndex(0);
    requestAnimationFrame(() => {
      findRef.current?.focus({ preventScroll: true });
      findRef.current?.select();
    });
  }, []);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setFindQuery('');
    setFindIndex(0);
    setTotalMatches(0);
    const container = bookRef.current;
    if (container) {
      container.querySelectorAll('mark.find-mark').forEach(unwrapMark);
      container.querySelectorAll('.book-section').forEach((sec) => sec.normalize());
    }
  }, []);

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const ctrl = event.ctrlKey || event.metaKey;
      const alt = event.altKey;
      const target = event.target as HTMLElement | null;

      // Always intercept Ctrl+F regardless of current focus (blocks native browser search dialog)
      if (ctrl && key === 'f') {
        event.preventDefault();
        setFindOpen(true);
        requestAnimationFrame(() => {
          findRef.current?.focus({ preventScroll: true });
          findRef.current?.select();
        });
        return;
      }

      // Always intercept Ctrl+G and F3 (native browser search next / prev)
      if ((ctrl && key === 'g') || key === 'f3') {
        event.preventDefault();
        if (!findOpen) {
          setFindOpen(true);
          requestAnimationFrame(() => {
            findRef.current?.focus({ preventScroll: true });
            findRef.current?.select();
          });
        } else {
          goFind(event.shiftKey ? -1 : 1);
        }
        return;
      }

      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;

      if (ctrl && !typing) {
        if (key === '=' || key === '+') { event.preventDefault(); changeFont(settings.fontScale + FONT_STEP); return; }
        if (key === '-') { event.preventDefault(); changeFont(settings.fontScale - FONT_STEP); return; }
        if (key === '0') { event.preventDefault(); changeFont(1); return; }
        if (key === 't') { event.preventDefault(); setSidebarOpen((value) => !value); return; }
        if (key === 'b' || key === 'h') { event.preventDefault(); setHighlightsOpen((value) => !value); return; }
        if (key === 's' || key === '.') { event.preventDefault(); setSettingsOpen((value) => !value); return; }
        if (key === 'q') { event.preventDefault(); if (isTauri()) void getCurrentWindow().close(); return; }
        if (key === '/' || key === '?' || event.code === 'Slash') { event.preventDefault(); setHelpOpen((value) => !value); return; }
        return;
      }

      if ((key === 'f1' || ((key === '?' || key === '/') && !typing)) && !ctrl && !alt) {
        if (key === 'f1' || key === '?') {
          event.preventDefault();
          setHelpOpen((value) => !value);
          return;
        }
      }

      if (settingsOpen || helpOpen || !book || book.format === 'pdf' || typing) return;
      const isD = key === 'd';
      const isU = key === 'u';
      const isJ = key === 'j';
      const isK = key === 'k';
      const isUp = key === 'arrowup';
      const isDown = key === 'arrowdown';
      const isLeft = key === 'arrowleft';
      const isRight = key === 'arrowright';
      const forward = isJ || isDown || isRight || isD;
      const backward = isK || isUp || isLeft || isU;
      if (!forward && !backward) return;
      event.preventDefault();

      const stage = stageRef.current;
      if (!stage) return;
      if (isD || isU || alt || isLeft || isRight) {
        scrollStage(forward ? stage.clientHeight * 0.8 : -stage.clientHeight * 0.8);
      } else {
        const stepPx = getScrollStepPx(settings.scrollStep);
        scrollStage(forward ? stepPx : -stepPx);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [book, settings, settingsOpen, helpOpen, changeFont, scrollStage, findOpen, goFind]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;

      if (event.key === 'Escape') {
        if (settingsOpen || helpOpen || findOpen || highlightsOpen || menu || pendingSelection) {
          if (settingsOpen) setSettingsOpen(false);
          if (helpOpen) setHelpOpen(false);
          if (findOpen) closeFind();
          if (highlightsOpen) setHighlightsOpen(false);
          setMenu(null);
          setPendingSelection(null);
          return;
        }
        if (isWindowFullscreen || settings.fullscreen) {
          event.preventDefault();
          if (isTauri()) {
            void getCurrentWindow().setFullscreen(false).then(() => {
              setIsWindowFullscreen(false);
              setSettings((s) => ({ ...s, fullscreen: false }));
            });
          } else {
            setSettings((s) => ({ ...s, fullscreen: false }));
          }
        }
        return;
      }

      if (event.key === 'Enter' && !typing && !settingsOpen && !helpOpen && !findOpen && !highlightsOpen && !menu) {
        event.preventDefault();
        if (isTauri()) {
          void getCurrentWindow().setFullscreen(true).then(() => {
            setIsWindowFullscreen(true);
            setSettings((s) => ({ ...s, fullscreen: true }));
          });
        } else {
          setSettings((s) => ({ ...s, fullscreen: true }));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen, helpOpen, findOpen, highlightsOpen, menu, pendingSelection, isWindowFullscreen, settings.fullscreen, closeFind]);

  // Global pointer listener to close context menu on click-away
  useEffect(() => {
    const onGlobalPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (menu && !target?.closest('.reader-menu')) {
        setMenu(null);
        setPendingSelection(null);
      }
    };
    window.addEventListener('pointerdown', onGlobalPointerDown);
    return () => window.removeEventListener('pointerdown', onGlobalPointerDown);
  }, [menu]);

  useEffect(() => {
    const closeMenu = () => { setMenu(null); setPendingSelection(null); };
    document.addEventListener('scroll', closeMenu, true);
    return () => document.removeEventListener('scroll', closeMenu, true);
  }, []);

  useEffect(() => () => {
    if (hideHeaderTimerRef.current !== undefined) window.clearTimeout(hideHeaderTimerRef.current);
    if (saveProgressTimerRef.current !== undefined) window.clearTimeout(saveProgressTimerRef.current);
  }, []);

  useLayoutEffect(() => {
    if (pendingFontRatioRef.current === null) return;
    const stage = stageRef.current;
    if (stage) {
      const max = stage.scrollHeight - stage.clientHeight;
      stage.scrollTop = pendingFontRatioRef.current * (max > 0 ? max : 0);
    }
    pendingFontRatioRef.current = null;
  }, [settings.fontScale]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested(async (event) => {
      if (allowCloseRef.current || !updateRef.current || !hasPreparedUpdate()) return;
      event.preventDefault();
      setMessage('Installing update…');
      try {
        await installPreparedUpdate();
        allowCloseRef.current = true;
        await getCurrentWindow().close();
      } catch {
        updateRef.current = false;
        setUpdateState('failed');
        setMessage('The update could not be installed. It will be tried again next time.');
      }
    }).then((dispose) => { unlisten = dispose; });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void listen<string>('open-file', (event) => { void handleFile(event.payload); }).then((dispose) => { unlisten = dispose; });
    return () => unlisten?.();
  }, [handleFile]);

  const pagedChapterKey = settings.displayFullBook ? -1 : chapter;

  // Direct, 100% exact DOM search match rendering and highlighting
  useEffect(() => {
    const container = bookRef.current;
    if (!container) return;
    const needle = findQuery.trim().toLowerCase();
    let globalMatchCount = 0;

    container.querySelectorAll<HTMLElement>('.book-section').forEach((section) => {
      const index = Number(section.dataset.chapter);
      section.querySelectorAll('mark.reader-highlight, mark.find-mark').forEach(unwrapMark);
      section.normalize();

      // Render saved highlights
      for (const highlight of highlights) {
        if (highlight.locator.chapter !== index) continue;
        if (typeof highlight.locator.start !== 'number' || typeof highlight.locator.end !== 'number') continue;
        const mark = wrapTextRange(section, highlight.locator.start, highlight.locator.end, 'reader-highlight');
        if (mark) mark.setAttribute('data-highlight-id', highlight.id);
      }

      // Render live search matches with exact DOM character alignment
      if (needle) {
        let sectionText = '';
        const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
        let current: Node | null;
        while ((current = walker.nextNode())) {
          sectionText += current.textContent ?? '';
        }
        const lower = sectionText.toLowerCase();
        const sectionMatches: { start: number; end: number }[] = [];
        let from = 0;
        while (from < lower.length) {
          const at = lower.indexOf(needle, from);
          if (at === -1) break;
          sectionMatches.push({ start: at, end: at + needle.length });
          globalMatchCount++;
          from = at + needle.length;
          if (globalMatchCount > 500) break;
        }

        // Wrap matches in reverse order so character offsets stay intact
        for (let i = sectionMatches.length - 1; i >= 0; i -= 1) {
          const m = sectionMatches[i];
          wrapTextRange(section, m.start, m.end, 'find-mark');
        }
      }
    });

    setTotalMatches(globalMatchCount);

    if (findOpen && globalMatchCount > 0) {
      const marks = Array.from(container.querySelectorAll<HTMLElement>('mark.find-mark'));
      const activeIdx = ((findIndex % marks.length) + marks.length) % marks.length;
      const stage = stageRef.current;
      marks.forEach((m, idx) => {
        if (idx === activeIdx) {
          m.classList.add('active');
          if (stage) {
            const stageRect = stage.getBoundingClientRect();
            const markRect = m.getBoundingClientRect();
            const markTopInContent = markRect.top - stageRect.top + stage.scrollTop;
            const targetScroll = markTopInContent - (stage.clientHeight / 2) + (markRect.height / 2);
            stage.scrollTop = Math.max(0, targetScroll);
          }
        } else {
          m.classList.remove('active');
        }
      });
    }

    const focusId = focusHighlightRef.current;
    if (focusId) {
      requestAnimationFrame(() => {
        const target = container.querySelector<HTMLElement>(`mark[data-highlight-id="${CSS.escape(focusId)}"]`);
        if (target && stageRef.current) {
          const stage = stageRef.current;
          const stageRect = stage.getBoundingClientRect();
          const markRect = target.getBoundingClientRect();
          const markTopInContent = markRect.top - stageRect.top + stage.scrollTop;
          const targetScroll = markTopInContent - (stage.clientHeight / 2) + (markRect.height / 2);
          stage.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
          target.classList.add('active');
          window.setTimeout(() => target.classList.remove('active'), 1600);
        }
        focusHighlightRef.current = null;
      });
    }
  }, [book, pagedChapterKey, highlights, findQuery, findOpen]);

  const handleContextMenu = (event: React.MouseEvent) => {
    if (!book || !bookRef.current) return;
    event.preventDefault();
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? '';
    if (!text || !selection || !selection.rangeCount || !bookRef.current.contains(selection.anchorNode)) {
      clearPendingSelection();
      return;
    }
    const range = selection.getRangeAt(0);
    const startNode = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer as Element;
    const section = startNode?.closest?.('.book-section') ?? null;
    const root = (section as HTMLElement | null) ?? bookRef.current;
    const start = textOffset(root, range.startContainer, range.startOffset);
    const end = textOffset(root, range.endContainer, range.endOffset);
    if (end <= start) { clearPendingSelection(); return; }
    const locatorChapter = section instanceof HTMLElement && section.dataset.chapter !== undefined ? Number(section.dataset.chapter) : chapterRef.current;
    const pending = { chapter: locatorChapter, start, end, text };
    setPendingSelection(pending);
    setMenu({ x: event.clientX, y: event.clientY, text });
  };

  const addHighlight = () => {
    if (!book || !pendingSelection) return;
    const highlight: Highlight = {
      id: uid(),
      filePath: book.path,
      format: book.format,
      text: pendingSelection.text.slice(0, 500),
      locator: { chapter: pendingSelection.chapter, start: pendingSelection.start, end: pendingSelection.end },
      createdAt: new Date().toISOString(),
    };
    setHighlights((list) => [...list, highlight]);
    setMenu(null);
    setPendingSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const removeHighlight = (id: string) => {
    setHighlights((list) => list.filter((item) => item.id !== id));
  };

  const handleStageScroll = () => {
    const stage = stageRef.current;
    if (!stage || !book || book.format === 'pdf' || restoringProgressRef.current) return;
    const maxScroll = stage.scrollHeight - stage.clientHeight;
    const totalRatio = maxScroll > 0 ? stage.scrollTop / maxScroll : 0;
    setReadingPercent(Math.round(totalRatio * 100));

    if (settings.displayFullBook) {
      const stageRect = stage.getBoundingClientRect();
      let current = 0;
      let currentSectionEl: HTMLElement | null = null;
      bookRef.current?.querySelectorAll<HTMLElement>('.book-section').forEach((section) => {
        const index = Number(section.dataset.chapter);
        const secTop = section.getBoundingClientRect().top - stageRect.top + stage.scrollTop;
        if (secTop <= stage.scrollTop + 5) {
          current = index;
          currentSectionEl = section;
        }
      });
      let chapterRatio = 0;
      if (currentSectionEl) {
        const sec = currentSectionEl as HTMLElement;
        const sectionContentTop = sec.getBoundingClientRect().top - stageRect.top + stage.scrollTop;
        const sectionHeight = sec.offsetHeight;
        if (sectionHeight > 0) {
          const offsetPx = Math.max(0, stage.scrollTop - sectionContentTop);
          chapterRatio = Math.max(0, Math.min(1, offsetPx / sectionHeight));
        }
      }
      readingAnchorRef.current = { chapter: current, chapterOffsetRatio: chapterRatio };
      if (current !== chapterRef.current) {
        setChapter(current);
      }
      persistCurrentProgress(current, chapterRatio, totalRatio, stage.scrollTop);
    } else {
      persistCurrentProgress(chapterRef.current, totalRatio, totalRatio, stage.scrollTop);
    }
  };

  const showHeader = () => {
    if (hideHeaderTimerRef.current !== undefined) window.clearTimeout(hideHeaderTimerRef.current);
    setHeaderHover(true);
    if (book) {
      hideHeaderTimerRef.current = window.setTimeout(() => {
        if (!chromeForced) setHeaderHover(false);
      }, 2500);
    }
  };

  const hideHeaderSoon = () => {
    if (hideHeaderTimerRef.current !== undefined) window.clearTimeout(hideHeaderTimerRef.current);
    hideHeaderTimerRef.current = window.setTimeout(() => {
      if (!chromeForced) setHeaderHover(false);
    }, 400);
  };

  const onStagePointerMove = (e: React.PointerEvent) => {
    if (book && headerHover && e.clientY > 75 && !chromeForced) {
      if (hideHeaderTimerRef.current !== undefined) window.clearTimeout(hideHeaderTimerRef.current);
      setHeaderHover(false);
    }
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void file.arrayBuffer().then((buffer) => handleFile(file.name, buffer));
  };

  const toggleMaximizeOrFullscreen = async () => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    if (await win.isFullscreen()) {
      await win.setFullscreen(false);
      setSettings((s) => ({ ...s, fullscreen: false }));
    } else {
      await win.toggleMaximize();
    }
    await updateWindowState();
  };

  const bookHighlights = book ? highlights.filter((highlight) => highlight.filePath === book.path) : [];
  const savedPdfPage = book ? readingState.progress[book.path]?.pdfPage ?? 1 : 1;

  const content = book?.format === 'pdf'
    ? <PdfView
        path={book.path}
        data={book.buffer}
        initialPage={savedPdfPage}
        displayFullBook={settings.displayFullBook}
        fontScale={settings.fontScale}
        onPageChange={(page, total) => {
          setPdfPage(page);
          setPdfTotalPages(total);
          persistCurrentProgress(0, 0, 0, page);
        }}
      />
      : book
      ? <BookContent book={book} chapter={chapter} displayFullBook={settings.displayFullBook} fontScale={settings.fontScale} onContextMenu={handleContextMenu} bookRef={bookRef} />
      : initialized
        ? openError
          ? <OpenErrorState error={openError} onRetry={() => void handleFile(openError.path)} onChoose={chooseBook} />
          : <EmptyState onChoose={chooseBook} />
        : <StartupSurface />;

  return <div className={`reader-app ${settings.fullscreen ? 'reader-fullscreen' : 'reader-windowed'} ${book ? 'reader-book-active' : ''} ${!initialized ? 'reader-starting' : ''} ${dark ? 'reader-dark' : ''}`} onDrop={onDrop} onDragOver={(event) => event.preventDefault()} onContextMenu={(event) => {
    if (!(event.target instanceof Node) || !bookRef.current?.contains(event.target)) {
      event.preventDefault();
      clearPendingSelection();
    }
  }}>
    <div className={`reader-chrome ${chromeVisible ? '' : 'reader-chrome-hidden'}`} onPointerEnter={showHeader} onPointerLeave={hideHeaderSoon} data-tauri-drag-region>
      <header className="reader-topbar" data-tauri-drag-region>
        <div className="reader-brand" data-tauri-drag-region><img src="/logo.png" alt="" width="28" height="28" data-tauri-drag-region /><span data-tauri-drag-region>OpenTheBook</span></div>
        <div className="reader-title" data-tauri-drag-region>{book
          ? <><span className="reader-title-main" data-tauri-drag-region>{book.title}</span>{book.author ? <span className="reader-author" data-tauri-drag-region>{book.author}</span> : null}</>
          : 'Your quiet reading space'}</div>
        <div className="reader-actions">
          <button className="icon-button" onClick={() => setHighlightsOpen((value) => !value)} aria-label="Highlights (Ctrl+B)" title="Highlights (Ctrl+B)"><Icon name="bookmark" /></button>
          <button className="icon-button" onClick={openFind} aria-label="Find in book (Ctrl+F)" title="Find (Ctrl+F)"><Icon name="search" /></button>
          <button className="icon-button" onClick={() => setSettingsOpen((value) => !value)} aria-label="Settings (Ctrl+S)" title="Settings (Ctrl+S)"><Icon name="settings" /></button>
          <button className="icon-button" onClick={() => setHelpOpen((value) => !value)} aria-label="Shortcuts & Help (Ctrl+/)" title="Shortcuts (Ctrl+/)"><Icon name="help" /></button>
          <button className="icon-button" onClick={() => setSettings((value) => ({ ...value, theme: value.theme === 'dark' ? 'light' : 'dark' }))} aria-label="Toggle reading theme" title="Toggle reading theme"><Icon name={dark ? 'sun' : 'moon'} /></button>
          {isTauri() ? <div className="window-controls">
            <button onClick={() => void getCurrentWindow().minimize()} aria-label="Minimize window" title="Minimize"><Icon name="minimize" size={15} /></button>
            <button onClick={() => void toggleMaximizeOrFullscreen()} aria-label={isWindowFullscreen ? "Exit fullscreen" : "Maximize or restore window"} title={isWindowFullscreen ? "Exit fullscreen" : "Maximize / Restore"}>
              <Icon name={isWindowFullscreen ? 'restore' : 'maximize'} size={15} />
            </button>
            <button className="close" onClick={() => void getCurrentWindow().close()} aria-label="Close window" title="Close"><Icon name="close" size={15} /></button>
          </div> : null}
        </div>
      </header>
    </div>

    {findOpen ? <div className="find-bar">
      <input
        ref={findRef}
        value={findQuery}
        onChange={(event) => { setFindQuery(event.target.value); setFindIndex(0); }}
        onKeyDown={(event) => {
          if (event.ctrlKey && event.key.toLowerCase() === 'f') {
            event.preventDefault();
            findRef.current?.select();
            return;
          }
          if ((event.ctrlKey && event.key.toLowerCase() === 'g') || event.key === 'F3') {
            event.preventDefault();
            event.stopPropagation();
            goFind(event.shiftKey ? -1 : 1);
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            goFind(event.shiftKey ? -1 : 1);
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            closeFind();
            return;
          }
        }}
        placeholder="Find in book"
        aria-label="Find in book"
      />
      <span className="find-count">{totalMatches ? `${findIndex + 1} / ${totalMatches}` : '0 / 0'}</span>
      <button type="button" onClick={() => goFind(-1)} aria-label="Previous match"><Icon name="chevron-up" size={14} /></button>
      <button type="button" onClick={() => goFind(1)} aria-label="Next match"><Icon name="chevron-down" size={14} /></button>
      <button type="button" onClick={closeFind} aria-label="Close find"><Icon name="close" size={14} /></button>
    </div> : null}

    {book && !chromeVisible ? <div className="header-hover-strip" onPointerEnter={showHeader} onPointerMove={showHeader} /> : null}
    <div className={`reader-layout ${sidebarOpen ? 'reader-layout-sidebar' : ''}`}>
      {sidebarOpen ? <aside className="reader-rail">
        <button className="rail-open" onClick={chooseBook} aria-label="Open a book"><Icon name="plus" size={16} /></button>
        {book?.chapters.length ? <div className="chapter-list">{book.chapters.map((_, index) => <button className={chapter === index ? 'active' : ''} key={index} onClick={() => goToChapter(index)}>{String(index + 1).padStart(2, '0')}</button>)}</div> : null}
      </aside> : null}
      <main className="reading-stage" ref={stageRef} onScroll={handleStageScroll} onPointerMove={onStagePointerMove}><div className="reading-paper">{busy ? <StartupSurface /> : content}</div></main>
    </div>
    {highlightsOpen ? <aside className="bookmarks-rail" aria-label="Highlights">
      <div className="rail-heading"><span>Highlights</span><button onClick={() => setHighlightsOpen(false)} aria-label="Close highlights"><Icon name="close" size={15} /></button></div>
      {bookHighlights.length
        ? <div className="bookmark-list">{bookHighlights.map((highlight) => <div className="bookmark-item" key={highlight.id} role="button" tabIndex={0} onClick={() => goToHighlight(highlight)} onKeyDown={(event) => { if (event.key === 'Enter') goToHighlight(highlight); }}>
          <p>{highlight.text}</p>
          <small>Chapter {String((highlight.locator.chapter ?? 0) + 1).padStart(2, '0')}</small>
          <button className="bookmark-remove" aria-label="Remove highlight" onClick={(event) => { event.stopPropagation(); removeHighlight(highlight.id); }}><Icon name="close" size={13} /></button>
        </div>)}</div>
        : <p className="rail-empty">Select a passage, then right-click and choose Highlight to save it here.</p>}
    </aside> : null}
    {menu ? <div className="reader-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(event) => event.preventDefault()} onContextMenu={(event) => event.preventDefault()}><button onClick={addHighlight}>Highlight</button></div> : null}
    {settingsOpen ? <SettingsModal settings={settings} onChange={setSettings} changeFont={changeFont} version={version} updateState={updateState} onOpenHelp={() => { setSettingsOpen(false); setHelpOpen(true); }} onClose={() => setSettingsOpen(false)} /> : null}
    {helpOpen ? <HelpModal onClose={() => setHelpOpen(false)} /> : null}
    <footer className="reader-status">
      <span>{message}</span>
      {updateState === 'ready' ? <span className="update-status"><i /> Update ready — it will install when you close</span> : null}
      <div className="reader-controls">
        {book ? (
          <span className="reading-progress-info">
            {book.format === 'pdf'
              ? `Page ${pdfPage} of ${pdfTotalPages || 1} · ${Math.round((pdfPage / (pdfTotalPages || 1)) * 100)}%`
              : book.chapters.length > 1
                ? `Chapter ${chapter + 1} of ${book.chapters.length} · ${readingPercent}%`
                : `${readingPercent}%`}
          </span>
        ) : null}
        <button onClick={() => changeFont(settings.fontScale - FONT_STEP)} aria-label="Decrease text size" title="Decrease text size"><Icon name="minus" size={13} /><span className="sr-only">A−</span></button>
        <span className="format-badge">{book?.format?.toUpperCase() ?? 'READY'}</span>
        <button onClick={() => changeFont(settings.fontScale + FONT_STEP)} aria-label="Increase text size" title="Increase text size"><Icon name="plus" size={13} /><span className="sr-only">A+</span></button>
      </div>
    </footer>
    <input ref={inputRef} hidden type="file" accept=".pdf,.epub,.azw3,.mobi" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.arrayBuffer().then((buffer) => handleFile(file.name, buffer)); }} />
  </div>;
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return <div className="modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="settings-modal" role="dialog" aria-label="Keyboard Shortcuts" aria-modal="true">
      <header className="modal-header"><h2>Keyboard Shortcuts</h2><button className="modal-close" onClick={onClose} aria-label="Close shortcuts"><Icon name="close" size={16} /></button></header>
      <div className="settings-body">
        <table className="shortcuts-table">
          <tbody>
            {SHORTCUTS.map((shortcut) => <tr key={shortcut.label}>
              <td>{shortcut.label}</td>
              <td>{shortcut.bindings.map((binding, index) => <React.Fragment key={`${shortcut.label}-${index}`}>
                {index > 0 ? ' / ' : null}
                {binding.map((key, keyIndex) => <React.Fragment key={key}>{keyIndex > 0 ? ' + ' : null}<kbd>{key}</kbd></React.Fragment>)}
              </React.Fragment>)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
  </div>;
}

function SettingsModal({ settings, onChange, changeFont, version, updateState, onOpenHelp, onClose }: { settings: AppSettings; onChange: (settings: AppSettings) => void; changeFont: (scale: number) => void; version: string; updateState: UpdateState; onOpenHelp: () => void; onClose: () => void }) {
  const set = (patch: Partial<AppSettings>) => onChange({ ...settings, ...patch });
  const openDocs = () => {
    if (isTauri()) void invoke('open_url', { url: 'https://openthebook.lol/docs' });
    else window.open('https://openthebook.lol/docs', '_blank', 'noopener');
  };
  return <div className="modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="settings-modal" role="dialog" aria-label="Settings" aria-modal="true">
      <header className="modal-header"><h2>Settings</h2><button className="modal-close" onClick={onClose} aria-label="Close settings"><Icon name="close" size={16} /></button></header>
      <div className="settings-body">
        <label className="setting-row"><span><b>Fullscreen</b><small>Open the reader fullscreen by default</small></span><input type="checkbox" checked={settings.fullscreen} onChange={(event) => set({ fullscreen: event.target.checked })} /></label>
        <label className="setting-row"><span><b>Display full book</b><small>Read the whole book in one continuous scroll</small></span><input type="checkbox" checked={settings.displayFullBook} onChange={(event) => set({ displayFullBook: event.target.checked })} /></label>
        <div className="setting-row"><span><b>Scroll step</b><small>Scroll step distance for J/K and arrow keys</small></span>
          <div className="segmented">{(['small', 'medium', 'large'] as const).map((step) => <button key={step} className={settings.scrollStep === step ? 'active' : ''} onClick={() => set({ scrollStep: step })}>{step === 'small' ? 'Small' : step === 'medium' ? 'Medium' : 'Large'}</button>)}</div>
        </div>
        <div className="setting-row"><span><b>Theme</b><small>Match your system or pick one</small></span><div className="segmented">{(['system', 'light', 'dark'] as const).map((theme) => <button key={theme} className={settings.theme === theme ? 'active' : ''} onClick={() => set({ theme })}>{theme}</button>)}</div></div>
        <div className="setting-row"><span><b>Text size</b><small>Ctrl + / Ctrl − adjusts it while reading</small></span><div className="segmented"><button onClick={() => changeFont(settings.fontScale - FONT_STEP)}>A−</button><button className="text-size-value">{Math.round(settings.fontScale * 100)}%</button><button onClick={() => changeFont(settings.fontScale + FONT_STEP)}>A+</button></div></div>
        <label className="setting-row"><span><b>Update checks</b><small>Check quietly after launch</small></span><input type="checkbox" checked={settings.updatesEnabled} onChange={(event) => set({ updatesEnabled: event.target.checked })} /></label>
        <div className="setting-row setting-column"><span><b>File associations</b><small>Formats OpenTheBook registers when installed</small></span>
          <div className="assoc-grid">{FORMAT_KEYS.map((format) => <label key={format}><input type="checkbox" checked={settings.associations[format]} onChange={(event) => set({ associations: { ...settings.associations, [format]: event.target.checked } })} />{format.toUpperCase()}</label>)}</div>
          <button className="mini-button" onClick={() => void openDefaultApps()}>Open default apps</button>
        </div>
        <div className="setting-row"><span><b>Keyboard shortcuts</b><small>View all quick shortcuts</small></span><button className="mini-button" onClick={onOpenHelp}>View shortcuts (Ctrl+/)</button></div>
        <div className="setting-row"><span><b>Version</b><small>OpenTheBook {version}</small></span><span className="update-state">{UPDATE_COPY[updateState]}</span></div>
        <div className="setting-row"><span><b>Help & docs</b><small>Setup guides and online documentation</small></span><button className="mini-button" onClick={openDocs}>Open docs</button></div>
      </div>
    </div>
  </div>;
}

function StartupSurface() {
  return (
    <div className="startup-surface" role="status" aria-label="Opening your book">
      <div className="startup-skeleton startup-skeleton-heading" />
      <div className="startup-skeleton startup-skeleton-line" />
      <div className="startup-skeleton startup-skeleton-line startup-skeleton-line-short" />
      <span className="startup-spinner" />
    </div>
  );
}

function EmptyState({ onChoose }: { onChoose: () => void }) {
  return <div className="empty-state"><img src="/logo.png" alt="" width="112" height="112" /><p className="empty-kicker">A quiet place to read</p><h1>Just open a book.</h1><p>Drop a PDF, EPUB, AZW3, or MOBI file here, or choose one from your computer.</p><button className="open-button" onClick={onChoose}>Choose a book <Icon name="arrow-right" size={15} /></button></div>;
}

function OpenErrorState({ error, onRetry, onChoose }: { error: { path: string; message: string }; onRetry: () => void; onChoose: () => void }) {
  return <div className="empty-state open-error-state"><img src="/logo.png" alt="" width="88" height="88" /><p className="empty-kicker">OpenTheBook could not load this file</p><h1>Couldn’t open this book.</h1><p className="open-error-message">{error.message}</p><div className="open-error-actions"><button className="open-button" onClick={onRetry}>Try again <Icon name="arrow-right" size={15} /></button><button className="mini-button" onClick={onChoose}>Choose another book</button></div></div>;
}

function PdfView({ path, data, initialPage = 1, displayFullBook = true, fontScale = 1.0, onPageChange }: { path: string; data?: ArrayBuffer; initialPage?: number; displayFullBook?: boolean; fontScale?: number; onPageChange?: (page: number, total: number) => void }) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(initialPage);
  const [pages, setPages] = useState(1);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    // Reset the loading state before starting the next asynchronous document load.
    /* eslint-disable react-hooks/set-state-in-effect */
    setLoading(true);
    setPdfError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    void (async () => {
      try {
        const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        GlobalWorkerOptions.workerSrc = worker.default;
        const bytes = data
          ? new Uint8Array(data.slice(0))
          : new Uint8Array(await readFile(path));
        const loadingTask = getDocument({ data: bytes });
        const doc = await loadingTask.promise;
        if (cancelled) {
          void doc.cleanup();
          return;
        }
        setPdfDoc(doc);
        setPages(doc.numPages);
        const validPage = Math.min(doc.numPages, Math.max(1, initialPage));
        setPage(validPage);
        onPageChange?.(validPage, doc.numPages);
        setLoading(false);
      } catch (err) {
        console.error('PDF Load error:', err);
        if (!cancelled) {
          setPdfError(err instanceof Error ? err.message : 'Could not load PDF');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, data]);

  const changePage = (newPage: number) => {
    const clamped = Math.min(pages, Math.max(1, newPage));
    setPage(clamped);
    onPageChange?.(clamped, pages);
  };

  if (pdfError) {
    return <div className="loading-state" style={{ color: '#c0392b' }}>{pdfError}</div>;
  }

  if (loading || !pdfDoc) {
    return <div className="loading-state"><span className="spinner" />Opening PDF…</div>;
  }

  if (displayFullBook) {
    return (
      <div ref={containerRef} className="pdf-view-continuous">
        {Array.from({ length: pages }, (_, i) => i + 1).map((pageNum) => (
          <PdfPageItem
            key={pageNum}
            doc={pdfDoc}
            pageNumber={pageNum}
            fontScale={fontScale}
            onVisible={(visiblePage) => {
              setPage(visiblePage);
              onPageChange?.(visiblePage, pages);
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="pdf-view">
      <PdfPageItem doc={pdfDoc} pageNumber={page} fontScale={fontScale} />
      <div className="pdf-controls">
        <button disabled={page <= 1} onClick={() => changePage(page - 1)} aria-label="Previous page"><Icon name="chevron-left" size={15} /></button>
        <span>{page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => changePage(page + 1)} aria-label="Next page"><Icon name="chevron-right" size={15} /></button>
      </div>
    </div>
  );
}

function PdfPageItem({ doc, pageNumber, fontScale, onVisible }: { doc: PDFDocumentProxy; pageNumber: number; fontScale: number; onVisible?: (page: number) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);
  const renderingRef = useRef(false);

  const renderPage = useCallback(async () => {
    if (renderingRef.current || !doc) return;
    renderingRef.current = true;
    try {
      const pdfPage: PDFPageProxy = await doc.getPage(pageNumber);
      const baseViewport = pdfPage.getViewport({ scale: 1.0 });
      const dpr = window.devicePixelRatio || 1;
      const scale = dpr * 1.5 * fontScale;
      const viewport = pdfPage.getViewport({ scale });

      const canvas = canvasRef.current;
      if (!canvas) {
        renderingRef.current = false;
        return;
      }
      const context = canvas.getContext('2d');
      if (!context) {
        renderingRef.current = false;
        return;
      }

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = '100%';
      canvas.style.maxWidth = `${baseViewport.width * fontScale * 1.25}px`;

      const renderTask = pdfPage.render({ canvas, canvasContext: context, viewport });
      await renderTask.promise;
      setRendered(true);
    } catch (err) {
      console.error(`Error rendering page ${pageNumber}:`, err);
    } finally {
      renderingRef.current = false;
    }
  }, [doc, pageNumber, fontScale]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          onVisible?.(pageNumber);
          if (!rendered && !renderingRef.current) {
            void renderPage();
          }
        }
      });
    }, { rootMargin: '800px 0px 800px 0px', threshold: 0.05 });

    observer.observe(el);
    return () => observer.disconnect();
  }, [onVisible, pageNumber, rendered, renderPage]);

  return (
    <div ref={containerRef} className="pdf-page-container" data-page={pageNumber} style={{ minHeight: rendered ? undefined : '500px' }}>
      <canvas ref={canvasRef} style={{ display: rendered ? 'block' : 'none' }} />
      {!rendered ? <div className="pdf-page-loading"><span className="spinner" style={{ marginRight: 8 }} />Page {pageNumber}</div> : null}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
