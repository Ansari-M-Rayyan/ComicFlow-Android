import { invoke } from '@tauri-apps/api/core';
import { AnimatePresence, motion, Variants } from 'framer-motion';
import {
    Book,
    BookMarked,
    BookmarkPlus,
    BookOpen, ChevronLeft,
    Coffee,
    LayoutGrid,
    Loader2,
    Maximize, Minimize,
    Moon,
    Search,
    Settings2,
    Sun,
    X,
    ZoomIn, ZoomOut
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { fetchCoverCached, fetchPageCached } from '../cache';
import { LazyPage } from '../components/ui/LazyPage';
import { READER_PREFERENCES_KEY, readReaderPreferences } from '../constants';
import { DictionaryEntry, ReaderMode, ReaderPreferences, ReaderTransitionStyle } from '../types';
import { SlidingTitle } from '../components/ui/SlidingTitle';

export const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return ' 0m';
};


export const parseComicInfoXml = (xmlStr: string) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, "application/xml");
  const getText = (tag: string) => doc.getElementsByTagName(tag)[0]?.textContent?.trim() || '';

  const name = getText('Title');
  const issue_number = getText('Number');
  const year = getText('Year');
  const month = getText('Month');
  const day = getText('Day');
  const cover_date = year ? `${year}-${month.padStart(2, '0') || '01'}-${day.padStart(2, '0') || '01'}` : '';
  const description = getText('Summary');
  const deck = description ? description.split('.')[0] + '.' : '';
  const publisher = getText('Publisher');

  const person_credits: any[] = [];
  const addPersons = (tag: string, role: string) => {
    const names = getText(tag).split(',').map(n => n.trim()).filter(bool => bool);
    names.forEach(name => person_credits.push({ name, role }));
  };
  addPersons('Writer', 'Writer');
  addPersons('Penciller', 'Penciller');
  addPersons('Inker', 'Inker');
  addPersons('Colorist', 'Colorist');
  addPersons('Letterer', 'Letterer');
  addPersons('CoverArtist', 'Cover');
  addPersons('Editor', 'Editor');

  const character_credits = getText('Characters').split(',').map(n => n.trim()).filter(bool => bool).map(name => ({ name }));
  const story_arc_credits = getText('StoryArc').split(',').map(n => n.trim()).filter(bool => bool).map(name => ({ name }));

  return { name, issue_number, cover_date, deck, description, person_credits, character_credits, story_arc_credits, publisher, isEmbedded: true };
};

export const pageTransitions: Record<string, Variants> = {
  Fade: { initial: { opacity: 0 }, animate: { opacity: 1, transition: { duration: 0.4 } }, exit: { opacity: 0 } },
  Slide: { initial: { x: 50, opacity: 0 }, animate: { x: 0, opacity: 1, transition: { duration: 0.3 } }, exit: { x: -50, opacity: 0 } },
  Cinematic: { initial: { scale: 0.95, opacity: 0, filter: 'blur(10px)' }, animate: { scale: 1, opacity: 1, filter: 'blur(0px)', transition: { duration: 0.5 } }, exit: { scale: 1.05, opacity: 0, filter: 'blur(10px)' } }
};


export function ReaderView({
  comic,
  nextComic,
  rootFolder,
  onBack,
  onReadNext,
  initialPage
}: {
  comic: any;
  nextComic: any | null;
  rootFolder: string;
  onBack: () => void;
  onReadNext: () => void;
  initialPage?: number;
}) {
  const [currentPage, setCurrentPage] = useState(
    Math.max(1, initialPage ?? comic.lastPageRead ?? 1)
  );
  const totalPages = comic.totalPages || 1;

  // Global reader preference: loaded once per reader session and persisted once
  // when this ReaderView closes. No localStorage writes happen during reading.
  const [savedReaderPreferences] = useState<ReaderPreferences>(() => readReaderPreferences());

  const [mode, setMode] = useState<ReaderMode>(savedReaderPreferences.mode);
  const [transitionStyle, setTransitionStyle] = useState<ReaderTransitionStyle>(
    savedReaderPreferences.transitionStyle
  );
  const [ambientEnabled, setAmbientEnabled] = useState(
    savedReaderPreferences.ambientEnabled
  );

  const [zoom, setZoom] = useState(1);
  const [scrollFullWidth, setScrollFullWidth] = useState(
    savedReaderPreferences.scrollFullWidth
  );
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const hasDragged = useRef(false);

  const [showControls, setShowControls] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMomentModal, setShowMomentModal] = useState(false);
  const [momentName, setMomentName] = useState("");

  const [currentAmbient, setCurrentAmbient] = useState('#090909');
  const [nextCoverData, setNextCoverData] = useState<string>('');
  const [showNextIssueOverlay, setShowNextIssueOverlay] = useState(false);
  const [showVisualGrid, setShowVisualGrid] = useState(false);
  const [showDictionary, setShowDictionary] = useState(false);
  const [dictionaryQuery, setDictionaryQuery] = useState('');
  const [dictionaryResults, setDictionaryResults] = useState<DictionaryEntry[]>([]);
  const [dictionaryLoading, setDictionaryLoading] = useState(false);
  const [dictionarySearched, setDictionarySearched] = useState(false);
  const [countdown, setCountdown] = useState(10);

  // Touch Scrubber & Floating Preview State
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPage, setScrubPage] = useState(currentPage);
  const [scrubCancel, setScrubCancel] = useState(false);
  const [scrubX, setScrubX] = useState<number>(0);
  const scrubTrackRef = useRef<HTMLDivElement>(null);
  const lastHapticPageRef = useRef<number>(currentPage);

  const handleScrubMove = (clientX: number, clientY: number) => {
    if (!scrubTrackRef.current) return;
    const rect = scrubTrackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const targetPage = Math.max(1, Math.min(totalPages, Math.round(ratio * (totalPages - 1)) + 1));
    
    // Slide up by >50px cancels jump
    const isCanceled = clientY < rect.top - 50;
    setScrubCancel(isCanceled);
    setScrubPage(targetPage);
    setScrubX(clientX);

    // Haptic tick on page change
    if (targetPage !== lastHapticPageRef.current && !isCanceled) {
      lastHapticPageRef.current = targetPage;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(8); } catch {}
      }
    }
  };

  const handleScrubStart = (clientX: number, clientY: number) => {
    setIsScrubbing(true);
    handleScrubMove(clientX, clientY);
  };

  const handleScrubEnd = () => {
    if (isScrubbing && !scrubCancel) {
      if (mode === 'Scroll') pendingScrollPageRef.current = scrubPage;
      setCurrentPage(scrubPage);
    }
    setIsScrubbing(false);
    setScrubCancel(false);
  };

  const [isPaused, setIsPaused] = useState(false);

  const sessionData = useRef({
    isPaused: false,
    lastStart: Date.now() as number | null,
    pendingFlush: 0
  });

  const baseReadingTime = useRef(comic.readingTime || 0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pendingScrollPageRef = useRef<number | null>(null);
  const scrollRestoreTargetRef = useRef<number | null>(null);
  const previousModeRef = useRef<ReaderMode>('Single Page');
  const hideControlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const readerPreferencesRef = useRef<ReaderPreferences>({
    mode: savedReaderPreferences.mode,
    scrollFullWidth: savedReaderPreferences.scrollFullWidth,
    transitionStyle: savedReaderPreferences.transitionStyle,
    ambientEnabled: savedReaderPreferences.ambientEnabled
  });

  // Keep the latest preference only in memory while reading. Persistence happens
  // once, in the cleanup effect below, when ReaderView is actually closed.
  useEffect(() => {
    readerPreferencesRef.current = {
      mode,
      scrollFullWidth,
      transitionStyle,
      ambientEnabled
    };
  }, [mode, scrollFullWidth, transitionStyle, ambientEnabled]);

  useEffect(() => {
    return () => {
      try {
        localStorage.setItem(
          READER_PREFERENCES_KEY,
          JSON.stringify(readerPreferencesRef.current)
        );
      } catch (error) {
        console.error('Failed to save reader preferences:', error);
      }
    };
  }, []);

  const searchDictionary = async (query = dictionaryQuery) => {
    const word = query.trim();
    if (!word) {
      setDictionaryResults([]);
      setDictionarySearched(false);
      return;
    }

    setDictionaryLoading(true);
    setDictionarySearched(true);

    try {
      const results = await invoke<DictionaryEntry[]>('lookup_dictionary', { query: word });
      setDictionaryResults(results || []);
    } catch (error) {
      console.error('Dictionary lookup failed:', error);
      setDictionaryResults([]);
    } finally {
      setDictionaryLoading(false);
    }
  };

  // Reset the dictionary every time it is closed so each opening starts fresh.
  useEffect(() => {
    if (!showDictionary) {
      setDictionaryQuery('');
      setDictionaryResults([]);
      setDictionarySearched(false);
      setDictionaryLoading(false);
    }
  }, [showDictionary]);

  const flushReadingTime = async () => {
    const now = Date.now();
    let activeElapsed = 0;

    if (!sessionData.current.isPaused && sessionData.current.lastStart) {
      activeElapsed = (now - sessionData.current.lastStart) / 1000;
      sessionData.current.lastStart = now;
    }

    const totalPending = sessionData.current.pendingFlush + activeElapsed;
    const toPersist = Math.floor(totalPending);

    if (toPersist > 0) {
      sessionData.current.pendingFlush = totalPending - toPersist;
      baseReadingTime.current += toPersist;

      try {
        await invoke('add_reading_time', {
          rootFolder,
          comicId: comic.id,
          secondsAdded: toPersist
        });

        window.dispatchEvent(
          new CustomEvent('LIBRARY_PATCH', {
            detail: {
              comicId: comic.id,
              patch: {
                readingTime: baseReadingTime.current
              }
            }
          })
        );
      } catch (e) {
        console.error("Failed to flush time", e);
        sessionData.current.pendingFlush += toPersist;
        baseReadingTime.current -= toPersist;
      }
    } else {
      sessionData.current.pendingFlush = totalPending;
    }
  };

  useEffect(() => {
    baseReadingTime.current = comic.readingTime || 0;

    sessionData.current = {
      isPaused: false,
      lastStart: Date.now(),
      pendingFlush: 0
    };

    setIsPaused(false);

    return () => {
      flushReadingTime();
    };
  }, [comic.id, rootFolder]);

  useEffect(() => {
    if (isPaused) {
      if (sessionData.current.lastStart) {
        const elapsed =
          (Date.now() - sessionData.current.lastStart) / 1000;

        sessionData.current.pendingFlush += elapsed;
      }

      sessionData.current.lastStart = null;
      sessionData.current.isPaused = true;

      flushReadingTime();
    } else {
      if (sessionData.current.isPaused) {
        sessionData.current.lastStart = Date.now();
        sessionData.current.isPaused = false;
      }
    }
  }, [isPaused]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!sessionData.current.isPaused) {
        flushReadingTime();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [comic.id]);

  const handleMouseEnterControls = () => {
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }

    setShowControls(true);
  };

  const handleMouseLeaveControls = () => {
    hideControlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 250);
  };

  const handleBack = () => {
    onBack();
  };

  useEffect(() => {
    if (currentPage > 0 && totalPages > 0) {
      const timer = setTimeout(() => {
        const now = Math.floor(Date.now() / 1000);
        const progress = Math.round(
          (currentPage / Math.max(1, totalPages)) * 100
        );

        invoke('update_progress', {
          rootFolder,
          comicId: comic.id,
          currentPage,
          totalPages: Math.max(1, totalPages)
        }).catch(console.error);

        window.dispatchEvent(
          new CustomEvent('LIBRARY_PATCH', {
            detail: {
              comicId: comic.id,
              patch: {
                progress,
                lastPageRead: currentPage,
                lastRead: now
              }
            }
          })
        );
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [currentPage, totalPages, comic.id, rootFolder]);

  useEffect(() => {
    let isMounted = true;

    fetchPageCached(comic.path, currentPage)
      .then(res => {
        if (isMounted) {
          setCurrentAmbient(res.ambient);
          // Prefetch next page sequentially after current page completes
          if (currentPage + 1 <= totalPages) {
            fetchPageCached(comic.path, currentPage + 1);
          }
          if (currentPage > 1) {
            fetchPageCached(comic.path, currentPage - 1);
          }
        }
      })
      .catch(console.error);

    return () => {
      isMounted = false;
    };
  }, [currentPage, comic.path, totalPages]);

  useEffect(() => {
    if (nextComic && showNextIssueOverlay) {
      fetchCoverCached(rootFolder, nextComic.path)
        .then(res => setNextCoverData(res))
        .catch(console.error);
    }
  }, [nextComic, showNextIssueOverlay, rootFolder]);

  useEffect(() => {
    setCountdown(10);
    setShowNextIssueOverlay(false);
  }, [comic.path]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    if (showNextIssueOverlay && nextComic) {
      if (countdown > 0) {
        timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      } else if (countdown === 0) {
        onReadNext();
      }
    }

    return () => clearTimeout(timer);
  }, [showNextIssueOverlay, countdown, nextComic, onReadNext]);

  // Infinite Flow:
  // Restore the page that was already active when entering Scroll mode,
  // or the page explicitly requested by a jump/preview action.
  // Normal scrolling is left entirely to the browser.
  useEffect(() => {
    if (mode !== 'Scroll' || !scrollContainerRef.current) {
      previousModeRef.current = mode;
      return;
    }

    const explicitTarget = pendingScrollPageRef.current;
    const enteringScroll = previousModeRef.current !== 'Scroll';

    if (explicitTarget === null && !enteringScroll) {
      previousModeRef.current = mode;
      return;
    }

    const targetPage = explicitTarget ?? currentPage;

    // Prevent early IntersectionObserver callbacks from replacing the
    // intended page while the Scroll view is being positioned.
    scrollRestoreTargetRef.current = targetPage;

    const restore = () => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const target = container.querySelector<HTMLElement>(
        `#scroll-page-${targetPage}`
      );

      if (!target) return;

      const isExplicitJump = explicitTarget !== null && !enteringScroll;

      target.scrollIntoView({
        behavior: isExplicitJump ? 'smooth' : 'auto',
        block: 'start'
      });

      if (isExplicitJump) {
        try {
          target.animate(
            [
              { filter: 'brightness(1.15) drop-shadow(0 0 25px rgba(255,255,255,0.25))' },
              { filter: 'brightness(1) drop-shadow(0 0 0px transparent)' }
            ],
            { duration: 700, easing: 'ease-out' }
          );
        } catch {
          // Graceful fallback if animate not supported
        }
      }

      if (pendingScrollPageRef.current === targetPage) {
        pendingScrollPageRef.current = null;
      }

      if (isExplicitJump) {
        setTimeout(() => {
          if (scrollRestoreTargetRef.current === targetPage) {
            scrollRestoreTargetRef.current = null;
          }
        }, 700);
      } else {
        requestAnimationFrame(() => {
          if (scrollRestoreTargetRef.current === targetPage) {
            scrollRestoreTargetRef.current = null;
          }
        });
      }
    };

    requestAnimationFrame(restore);
    previousModeRef.current = mode;
  }, [mode, currentPage]);

  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [currentPage, mode, zoom]);

  useEffect(() => {
    if (showVisualGrid) {
      setTimeout(() => {
        document
          .getElementById(`grid-thumb-${currentPage}`)
          ?.scrollIntoView({
            behavior: 'auto',
            inline: 'center',
            block: 'nearest'
          });
      }, 50);
    }
  }, [showVisualGrid, currentPage]);

  const handleMouseDown = (e: React.MouseEvent) => {
    hasDragged.current = false;

    if (zoom > 1) {
      setIsDragging(true);
      setStartPos({
        x: e.clientX - pan.x,
        y: e.clientY - pan.y
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      hasDragged.current = true;

      setPan({
        x: e.clientX - startPos.x,
        y: e.clientY - startPos.y
      });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);
  const swipeStartRef = useRef<{x: number, y: number, time: number} | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    hasDragged.current = false;

    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.hypot(dx, dy);
      pinchStartZoomRef.current = zoom;
    } else if (e.touches.length === 1) {
      swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() };
      if (zoom > 1) {
        setIsDragging(true);
        setStartPos({
          x: e.touches[0].clientX - pan.x,
          y: e.touches[0].clientY - pan.y
        });
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
      hasDragged.current = true;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scale = dist / pinchStartDistRef.current;
      const newZoom = Math.max(1, Math.min(5, pinchStartZoomRef.current * scale));
      setZoom(newZoom);
      if (newZoom === 1) setPan({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && isDragging && zoom > 1) {
      hasDragged.current = true;
      setPan({
        x: e.touches[0].clientX - startPos.x,
        y: e.touches[0].clientY - startPos.y
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsDragging(false);
    pinchStartDistRef.current = null;
    
    if (!hasDragged.current && swipeStartRef.current && e.changedTouches.length === 1 && zoom === 1 && mode !== 'Scroll') {
      const dx = e.changedTouches[0].clientX - swipeStartRef.current.x;
      const dy = e.changedTouches[0].clientY - swipeStartRef.current.y;
      const dt = Date.now() - swipeStartRef.current.time;
      
      if (dt < 400 && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        hasDragged.current = true; 
        if (dx > 0) goBackPage();
        else advancePage();
      }
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!hasDragged.current) {
      const x = e.clientX;

      if (x < window.innerWidth * 0.3) {
        goBackPage();
      } else if (x > window.innerWidth * 0.7) {
        advancePage();
      } else {
        setShowControls(prev => !prev);
      }
    }
  };

  const saveMoment = async () => {
    if (!momentName.trim()) return;

    const percent = Math.round((currentPage / totalPages) * 100);

    try {
      await invoke('save_moment', {
        rootFolder,
        comicId: comic.id,
        comicPath: comic.path,
        issueTitle: comic.issue || comic.title,
        page: currentPage,
        percent,
        name: momentName
      });

      setShowMomentModal(false);
      setMomentName("");
    } catch (e) {
      console.error(e);
    }
  };

  const advancePage = () => {
    if (
      showNextIssueOverlay ||
      showVisualGrid ||
      showMomentModal ||
      isPaused
    ) {
      return;
    }

    const increment = mode === 'Double Page' ? 2 : 1;

    if (currentPage + increment <= totalPages) {
      setCurrentPage(prev => prev + increment);
    } else if (currentPage < totalPages) {
      setCurrentPage(totalPages);
    } else {
      setShowNextIssueOverlay(true);
    }
  };

  const goBackPage = () => {
    if (
      showNextIssueOverlay ||
      showVisualGrid ||
      showMomentModal ||
      isPaused
    ) {
      return;
    }

    const decrement = mode === 'Double Page' ? 2 : 1;

    if (currentPage - decrement >= 1) {
      setCurrentPage(prev => prev - decrement);
    } else {
      setCurrentPage(1);
    }

    if (showNextIssueOverlay) {
      setShowNextIssueOverlay(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTypingTarget = !!target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );
      const isWindows = /Win/i.test(navigator.userAgent) || /Win/i.test(navigator.platform || '');

      // Windows-only dictionary shortcut. Ignore it while the user is typing.
      if (isWindows && !isTypingTarget && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setShowDictionary(prev => !prev);
        return;
      }

      // While the dictionary is open, let its own form handle Enter.
      // Do not let the reader's global Enter/arrow handlers flip pages behind it.
      if (showDictionary) {
        if (e.code === 'Escape') {
          e.preventDefault();
          setShowDictionary(false);
        }
        return;
      }

      if (isPaused) {
        if (
          e.code === 'Space' ||
          e.code === 'Enter' ||
          e.code === 'Escape'
        ) {
          e.preventDefault();
          setIsPaused(false);
        }
        return;
      }

      if (showMomentModal) return;

      if (showNextIssueOverlay) {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();

          if (nextComic) {
            onReadNext();
          } else {
            setShowNextIssueOverlay(false);
            handleBack();
          }
        }

        if (e.code === 'Escape') {
          setShowNextIssueOverlay(false);
          handleBack();
        }

        return;
      }

      if (
        e.code === 'Space' ||
        e.code === 'Enter' ||
        e.code === 'ArrowRight'
      ) {
        e.preventDefault();
        advancePage();
      }

      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        goBackPage();
      }

      if (e.code === 'Escape') {
        if (showDictionary) {
          setShowDictionary(false);
          return;
        }
        if (showSettings) {
          setShowSettings(false);
          return;
        }

        if (showVisualGrid) {
          setShowVisualGrid(false);
          return;
        }

        handleBack();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    currentPage,
    showNextIssueOverlay,
    showVisualGrid,
    showDictionary,
    mode,
    totalPages,
    showSettings,
    showMomentModal,
    isPaused,
    nextComic,
    onReadNext,
    handleBack
  ]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-50 flex flex-col transition-colors duration-1000 ease-out"
      style={{
        backgroundColor: ambientEnabled ? currentAmbient : '#090909'
      }}
    >
      <AnimatePresence>
        {isPaused && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-black/80 backdrop-blur-xl"
          >
            <Coffee className="size-20 text-primary mb-6 opacity-80" />
            <h2 className="text-4xl font-extrabold text-foreground mb-3">
              Taking a Break
            </h2>
            <p className="text-muted-foreground mb-10 text-lg">
              Your reading timer is currently paused.
            </p>
            <button
              onClick={() => setIsPaused(false)}
              className="px-10 py-4 rounded-full text-lg font-bold bg-primary text-primary-foreground transition-all hover:scale-105 active:scale-95 shadow-[0_0_40px_-10px_hsl(var(--primary))]"
            >
              Continue Reading
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="absolute top-0 inset-x-0 h-6 z-[40]"
        onMouseEnter={handleMouseEnterControls}
        onMouseLeave={handleMouseLeaveControls}
      />

      <motion.div
        initial={{ y: '-100%', opacity: 0 }}
        animate={{
          y: showControls ? 0 : '-100%',
          opacity: showControls ? 1 : 0
        }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        onMouseEnter={handleMouseEnterControls}
        onMouseLeave={handleMouseLeaveControls}
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px), 48px)',
        }}
        className="absolute top-0 inset-x-0 z-[50] flex min-h-[4.5rem] shrink-0 items-center justify-between border-b border-white/10 bg-black/85 backdrop-blur-2xl px-3 sm:px-5 pb-3 shadow-2xl transition-colors pointer-events-auto"
      >
        {/* Left: Back & Comic Title */}
        <div className="flex items-center gap-2 min-w-0 pr-2">
          <button
            onClick={handleBack}
            className="inline-flex items-center justify-center rounded-xl p-2 text-white/90 transition-colors hover:bg-white/15 active:bg-white/25 active:scale-95 touch-manipulation shrink-0"
            aria-label="Back to library"
          >
            <ChevronLeft className="size-5" />
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <div className="max-w-[170px] sm:max-w-xs min-w-0">
              <SlidingTitle text={comic.issue || comic.title} className="font-bold text-xs sm:text-sm text-white/95" />
            </div>
            <span className="font-mono text-[10px] text-white/60 bg-white/10 px-2 py-0.5 rounded-full shrink-0 font-medium">
              {currentPage}/{totalPages}
            </span>
          </div>
        </div>

        {/* Right: Only 2 clean action icons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setShowMomentModal(true)}
            className="rounded-full p-2 bg-white/5 hover:bg-white/15 text-white/80 hover:text-white transition-all active:scale-95"
            title="Save Moment"
          >
            <BookmarkPlus className="size-4" />
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`rounded-full p-2 transition-all active:scale-95 ${
              showSettings ? 'bg-primary text-black' : 'bg-white/5 hover:bg-white/15 text-white/80 hover:text-white'
            }`}
            title="Reader Settings"
          >
            <Settings2 className="size-4" />
          </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {showSettings && showControls && (
          <>
            <div 
              className="fixed inset-0 z-[55] bg-black/40 backdrop-blur-[2px]" 
              onClick={() => setShowSettings(false)} 
            />
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.96 }}
              onMouseEnter={handleMouseEnterControls}
              onMouseLeave={handleMouseLeaveControls}
              style={{ top: 'calc(max(env(safe-area-inset-top, 0px), 48px) + 3.75rem)' }}
              className="absolute right-3 sm:right-6 z-[60] w-72 max-w-[90vw] max-h-[calc(100vh-6rem)] overflow-y-auto bg-card/95 backdrop-blur-3xl border border-border/60 rounded-3xl shadow-2xl p-5 flex flex-col gap-4 pointer-events-auto overscroll-contain"
            >
            {/* Reading Mode Switch */}
            <div>
              <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Reading Mode</p>
              <div className="grid grid-cols-3 gap-1 bg-black/40 p-1 rounded-2xl border border-border/40">
                {(['Single Page', 'Double Page', 'Scroll'] as const).map((item) => (
                  <button
                    key={item}
                    onClick={() => {
                      if (item === 'Scroll') {
                        pendingScrollPageRef.current = currentPage;
                        scrollRestoreTargetRef.current = currentPage;
                      } else {
                        scrollRestoreTargetRef.current = null;
                        pendingScrollPageRef.current = null;
                      }
                      setMode(item);
                      setZoom(1);
                      setShowSettings(false);
                    }}
                    className={`py-2 px-1 text-[11px] font-semibold rounded-xl text-center transition-all ${
                      mode === item
                        ? 'bg-primary text-primary-foreground shadow-md'
                        : 'text-muted-foreground hover:text-white'
                    }`}
                  >
                    {item === 'Scroll' ? 'Flow' : item === 'Single Page' ? 'Single' : 'Double'}
                  </button>
                ))}
              </div>
            </div>

            {/* Zoom / Width Tuning */}
            {mode !== 'Scroll' ? (
              <div>
                <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Zoom Level</p>
                <div className="flex items-center justify-between bg-black/40 px-3 py-2 rounded-2xl border border-border/40">
                  <button
                    onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10"
                  >
                    <ZoomOut className="size-4" />
                  </button>
                  <button
                    onClick={() => setZoom(1)}
                    className="font-mono text-xs text-primary font-bold px-2 py-0.5 rounded hover:bg-primary/10"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    onClick={() => setZoom(z => Math.min(3, z + 0.25))}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10"
                  >
                    <ZoomIn className="size-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Width Layout</p>
                <button
                  onClick={() => setScrollFullWidth(!scrollFullWidth)}
                  className="w-full py-2.5 px-3 rounded-2xl bg-black/40 border border-border/40 text-xs font-semibold flex items-center justify-center gap-2 text-foreground hover:bg-white/5 transition-colors"
                >
                  {scrollFullWidth ? <Minimize className="size-4 text-primary" /> : <Maximize className="size-4 text-primary" />}
                  <span>{scrollFullWidth ? 'Fit Screen Width' : 'Fill Full Width'}</span>
                </button>
              </div>
            )}

            {/* Ambient Background Glow Toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-border/20">
              <span className="text-xs font-semibold text-foreground/90">Ambient Backdrop</span>
              <button
                onClick={() => setAmbientEnabled(!ambientEnabled)}
                className={`py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  ambientEnabled ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-muted text-muted-foreground'
                }`}
              >
                {ambientEnabled ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
                <span>{ambientEnabled ? 'On' : 'Off'}</span>
              </button>
            </div>

            {/* Transition Style (Paged Modes) */}
            {mode !== 'Scroll' && (
              <div>
                <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">Page Transition</p>
                <div className="grid grid-cols-3 gap-1">
                  {Object.keys(pageTransitions).map(style => (
                    <button
                      key={style}
                      onClick={() => {
                        setTransitionStyle(style as any);
                        setShowSettings(false);
                      }}
                      className={`py-1.5 text-[11px] font-semibold rounded-xl text-center border transition-all ${
                        transitionStyle === style
                          ? 'bg-primary/20 border-primary text-primary'
                          : 'bg-black/20 border-transparent text-muted-foreground hover:text-white'
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Reading Utilities: Dictionary & Break */}
            <div className="flex gap-2 pt-2 border-t border-border/20">
              <button
                onClick={() => { setShowSettings(false); setShowDictionary(true); }}
                className="flex-1 py-2 px-3 rounded-2xl bg-muted/40 hover:bg-muted text-xs font-semibold flex items-center justify-center gap-1.5 text-foreground border border-border/30 transition-colors"
              >
                <Book className="size-3.5 text-primary" />
                <span>Dictionary</span>
              </button>

              <button
                onClick={() => { setShowSettings(false); setIsPaused(true); }}
                className="flex-1 py-2 px-3 rounded-2xl bg-muted/40 hover:bg-muted text-xs font-semibold flex items-center justify-center gap-1.5 text-foreground border border-border/30 transition-colors"
              >
                <Coffee className="size-3.5 text-amber-500" />
                <span>Take Break</span>
              </button>
            </div>
          </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDictionary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[65] flex items-start justify-center bg-black/35 pt-20 sm:pt-24 backdrop-blur-[2px]"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setShowDictionary(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="w-[min(92vw,560px)] overflow-hidden rounded-3xl border border-white/10 bg-card/95 shadow-[0_30px_90px_rgba(0,0,0,0.55)] backdrop-blur-3xl"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
                    <Book className="size-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Dictionary</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Offline reference</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDictionary(false)}
                  className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
                  title="Close dictionary"
                  aria-label="Close dictionary"
                >
                  <X className="size-4" />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  searchDictionary();
                }}
                className="border-b border-white/10 p-5"
              >
                <div className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 transition-colors focus-within:border-primary/60 focus-within:bg-black/35">
                  <Search className="size-4 shrink-0 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <input
                    autoFocus
                    value={dictionaryQuery}
                    onChange={(e) => setDictionaryQuery(e.target.value)}
                    placeholder="Search a word..."
                    aria-label="Dictionary word"
                    className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    type="submit"
                    disabled={dictionaryLoading || !dictionaryQuery.trim()}
                    className="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {dictionaryLoading ? 'Looking…' : 'Search'}
                  </button>
                </div>
              </form>

              <div className="max-h-[55vh] overflow-y-auto px-5 py-5">
                {dictionaryLoading ? (
                  <div className="flex flex-col items-center justify-center py-14 text-center">
                    <Loader2 className="size-6 animate-spin text-primary" />
                    <p className="mt-3 text-sm text-muted-foreground">Looking up “{dictionaryQuery.trim()}”</p>
                  </div>
                ) : !dictionarySearched ? (
                  <div className="py-14 text-center">
                    <BookOpen className="mx-auto size-10 text-muted-foreground/40" />
                    <p className="mt-4 font-medium text-foreground">Find a word without leaving your comic.</p>
                    <p className="mt-1 text-sm text-muted-foreground">The dictionary works completely offline.</p>
                  </div>
                ) : dictionaryResults.length === 0 ? (
                  <div className="py-14 text-center">
                    <p className="font-semibold text-foreground">No definition found</p>
                    <p className="mt-1 text-sm text-muted-foreground">Try another spelling or a simpler form of the word.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="mb-4">
                      <p className="text-xl font-bold lowercase text-foreground">{dictionaryResults[0].word}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-primary/80">Dictionary entries</p>
                    </div>

                    {dictionaryResults.map((entry, index) => (
                      <div
                        key={`${entry.word}-${entry.partOfSpeech}-${index}`}
                        className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.05]"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className="rounded-md bg-primary/10 px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">
                            {entry.partOfSpeech}
                          </span>
                          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                            Meaning {index + 1}
                          </span>
                        </div>
                        <p className="text-sm leading-6 text-foreground/90">{entry.definition}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden w-full h-full">
        {mode === 'Scroll' && (
          <div
            ref={scrollContainerRef}
            className="flex flex-col w-full h-full overflow-auto items-center pb-24 bg-transparent"
            onClick={handleClick}
          >
            <div
              className={`flex flex-col items-center transition-all duration-300 ease-out ${
                scrollFullWidth ? 'w-full' : 'w-[90%]'
              }`}
            >
              {Array.from({ length: totalPages }).map((_, i) => (
                <div
                  key={i}
                  id={`scroll-page-${i + 1}`}
                  className="w-full flex justify-center"
                >
                  <LazyPage
                    comicPath={comic.path}
                    pageNum={i + 1}
                    onVisible={p => {
                      const restoreTarget = scrollRestoreTargetRef.current;

                      // While restoring the previous page, ignore early page
                      // visibility callbacks (usually page 1). Once the intended
                      // page becomes visible, accept it and resume normal tracking.
                      if (restoreTarget !== null) {
                        if (p === restoreTarget) {
                          setCurrentPage(p);
                          scrollRestoreTargetRef.current = null;
                        }
                        return;
                      }

                      setCurrentPage(p);
                    }}
                    className="w-full h-auto block m-0 p-0 leading-none"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {mode !== 'Scroll' && (
          <div
            className="relative flex items-center justify-center w-full h-full overflow-hidden select-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={handleClick}
            style={{
              cursor:
                zoom > 1
                  ? isDragging
                    ? 'grabbing'
                    : 'grab'
                  : 'pointer',
              touchAction: zoom > 1 ? 'none' : 'auto'
            }}
          >
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transition: isDragging
                  ? 'none'
                  : 'transform 0.2s ease-out',
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentPage}
                  variants={pageTransitions[transitionStyle]}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className={`flex items-center justify-center gap-0 ${
                    mode === 'Double Page'
                      ? 'w-full h-full'
                      : ''
                  }`}
                >
                  {mode === 'Single Page' ? (
                    <LazyPage
                      key={`S-${currentPage}`}
                      comicPath={comic.path}
                      pageNum={currentPage}
                      className="h-[98vh] w-auto max-w-[98vw] object-contain shadow-2xl drop-shadow-2xl pointer-events-none"
                    />
                  ) : (
                    <>
                      <LazyPage
                        key={`L-${currentPage}`}
                        comicPath={comic.path}
                        pageNum={currentPage}
                        className="h-[98vh] w-auto max-w-[49vw] object-contain border-r border-black/50 shadow-2xl pointer-events-none"
                      />

                      {currentPage + 1 <= totalPages && (
                        <LazyPage
                          key={`R-${currentPage}`}
                          comicPath={comic.path}
                          pageNum={currentPage + 1}
                          className="h-[98vh] w-auto max-w-[49vw] object-contain border-l border-black/50 shadow-2xl pointer-events-none"
                        />
                      )}
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showMomentModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 overflow-y-auto"
            onClick={() => setShowMomentModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-card border border-white/15 shadow-2xl rounded-3xl p-5 sm:p-6 max-w-sm w-full mx-auto my-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="size-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                    <BookmarkPlus className="size-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-foreground">Save Moment</h2>
                    <p className="text-[11px] text-muted-foreground">Bookmark this panel or page</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowMomentModal(false)}
                  className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="bg-black/40 rounded-xl p-3 mb-4 border border-white/5">
                <div className="font-semibold text-xs text-foreground truncate">
                  <SlidingTitle text={comic.issue || comic.title} className="font-semibold text-xs text-foreground" />
                </div>

                <div className="flex justify-between items-center mt-1.5 text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                  <span>Page {currentPage} of {totalPages}</span>
                  <span className="text-primary font-bold">
                    {Math.round((currentPage / totalPages) * 100)}%
                  </span>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Moment Title / Description</label>
                <input
                  autoFocus
                  value={momentName}
                  onChange={e => setMomentName(e.target.value)}
                  onKeyDown={e =>
                    e.key === 'Enter' && saveMoment()
                  }
                  placeholder="e.g. The Joker appears..."
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors"
                />
              </div>

              <div className="flex gap-2.5 justify-end">
                <button
                  onClick={() => setShowMomentModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-white hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>

                <button
                  onClick={saveMoment}
                  disabled={!momentName.trim()}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-50 transition-all active:scale-95 shadow-md"
                >
                  Save Moment
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showVisualGrid && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-3xl overflow-y-auto"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between p-6 bg-gradient-to-b from-black/80 to-transparent">
              <div className="max-w-[75vw] min-w-0">
                <SlidingTitle text={comic.issue || comic.title} className="text-xl font-bold text-white tracking-wide" />
              </div>
              <button
                onClick={() => setShowVisualGrid(false)}
                className="rounded-full p-3 bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
              >
                <X className="size-6" />
              </button>
            </div>
            
            <div className="p-8 pt-0 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4 sm:gap-6">
              {Array.from({ length: totalPages }).map((_, i) => {
                const isCurrent = currentPage === i + 1;
                
                return (
                  <button
                    id={`grid-thumb-${i + 1}`}
                    key={i}
                    onClick={() => {
                      if (mode === 'Scroll') pendingScrollPageRef.current = i + 1;
                      setCurrentPage(i + 1);
                      setShowVisualGrid(false);
                    }}
                    className={`group relative aspect-[2/3] overflow-hidden rounded-xl border-2 transition-all duration-300 ${
                      isCurrent
                        ? 'border-primary scale-105 shadow-[0_0_30px_rgba(var(--primary),0.3)] z-10'
                        : 'border-white/5 opacity-70 hover:opacity-100 hover:scale-105 hover:border-white/30'
                    }`}
                  >
                    <LazyPage
                      comicPath={comic.path}
                      pageNum={i + 1}
                      thumbnail={true}
                      rootFolder={rootFolder}
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-110"
                      rootMargin="800px"
                    />
                    
                    <div className={`absolute inset-0 flex items-end justify-center pb-2 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity ${isCurrent ? 'opacity-100' : 'group-hover:opacity-100'}`}>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold shadow-lg ${isCurrent ? 'bg-primary text-black' : 'bg-black/80 text-white'}`}>
                        {i + 1}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Touch Preview HUD Card */}
      <AnimatePresence>
        {isScrubbing && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 15 }}
            transition={{ type: 'spring', stiffness: 450, damping: 28 }}
            style={{
              bottom: 'calc(max(env(safe-area-inset-bottom, 0px), 16px) + 72px)',
              left: Math.max(16, Math.min(window.innerWidth - 156, scrubX - 70)),
            }}
            className="fixed z-50 pointer-events-none flex flex-col items-center"
          >
            <div
              className={`w-32 sm:w-36 aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl border-2 transition-colors bg-black/95 ${
                scrubCancel ? 'border-red-500/80 ring-2 ring-red-500/40' : 'border-primary shadow-[0_15px_40px_rgba(0,0,0,0.9)]'
              }`}
            >
              <LazyPage
                key={`scrub-thumb-${scrubPage}`}
                thumbnail={true}
                immediate={true}
                rootFolder={rootFolder}
                comicPath={comic.path}
                pageNum={scrubPage}
                className="size-full object-contain"
                rootMargin="0px"
              />
            </div>

            {/* Page number pill & cancel notice */}
            <div className={`mt-2 px-3 py-1 rounded-full text-xs font-mono font-bold shadow-xl border backdrop-blur-md ${
              scrubCancel 
                ? 'bg-red-950/90 text-red-300 border-red-500/50' 
                : 'bg-black/90 text-white border-white/20'
            }`}>
              {scrubCancel ? 'Release to Cancel' : `Page ${scrubPage} of ${totalPages}`}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Slim Frosted Dock */}
      <div 
        style={{ bottom: 'max(env(safe-area-inset-bottom, 0px), 14px)' }}
        className="fixed inset-x-0 z-40 flex flex-col items-center justify-end pointer-events-none px-4"
      >
        <AnimatePresence>
          {showControls && (
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.96 }}
              transition={{ type: 'spring', damping: 25, stiffness: 280 }}
              className="pointer-events-auto w-full max-w-md h-12 px-4 rounded-2xl bg-black/85 backdrop-blur-2xl border border-white/15 shadow-[0_10px_35px_rgba(0,0,0,0.8)] flex items-center gap-3"
            >
              <span className="font-mono text-xs font-bold text-white/90 w-6 text-center select-none">
                {isScrubbing ? scrubPage : currentPage}
              </span>

              {/* Scrubber Track */}
              <div
                ref={scrubTrackRef}
                onTouchStart={(e) => handleScrubStart(e.touches[0].clientX, e.touches[0].clientY)}
                onTouchMove={(e) => handleScrubMove(e.touches[0].clientX, e.touches[0].clientY)}
                onTouchEnd={handleScrubEnd}
                onTouchCancel={handleScrubEnd}
                onMouseDown={(e) => handleScrubStart(e.clientX, e.clientY)}
                onMouseMove={(e) => e.buttons === 1 && handleScrubMove(e.clientX, e.clientY)}
                onMouseUp={handleScrubEnd}
                className="relative flex-1 h-8 flex items-center cursor-pointer touch-none select-none py-2"
              >
                {/* Background Rail */}
                <div className="relative w-full h-1.5 rounded-full bg-white/20 overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${((isScrubbing ? scrubPage : currentPage) / totalPages) * 100}%` }}
                  />
                </div>

                {/* Draggable Scrubber Thumb */}
                <div
                  className="absolute size-4 -ml-2 rounded-full bg-white border-2 border-primary shadow-lg transform transition-transform hover:scale-125 active:scale-125"
                  style={{ left: `${((isScrubbing ? scrubPage : currentPage) / totalPages) * 100}%` }}
                />
              </div>

              <span className="font-mono text-xs font-bold text-white/40 w-6 text-center select-none">
                {totalPages}
              </span>

              <button
                onClick={() => setShowVisualGrid(true)}
                className="p-2 -mr-1 rounded-xl bg-white/10 hover:bg-white/20 text-white/90 active:scale-95 transition-all"
                title="Page Grid"
              >
                <LayoutGrid className="size-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showNextIssueOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-card border border-border/50 shadow-2xl rounded-3xl p-8 max-w-md w-full mx-4 text-center flex flex-col items-center"
            >
              {nextComic ? (
                <>
                  <div className="mx-auto mb-5 h-48 w-32 overflow-hidden rounded-lg shadow-xl ring-2 ring-white/20 relative group">
                    {nextCoverData ? (
                      <img
                        src={nextCoverData}
                        className="size-full object-cover bg-black"
                        alt="Next Issue Cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center bg-white/5">
                        <BookOpen className="size-8 text-white/20" />
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />
                  </div>

                  <h2 className="text-2xl font-bold mb-2">
                    Up Next
                  </h2>

                  <p className="text-muted-foreground mb-6">
                    You're about to start{' '}
                    <strong className="text-foreground">
                      {nextComic.issue}
                    </strong>
                  </p>

                  <div className="text-5xl font-mono font-bold text-primary mb-8 animate-pulse shadow-primary drop-shadow-lg">
                    {countdown}s
                  </div>

                  <div className="flex gap-3 justify-center w-full">
                    <button
                      onClick={() => {
                        setShowNextIssueOverlay(false);
                        handleBack();
                      }}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-muted-foreground hover:text-white hover:bg-white/5 transition-colors border border-border/50"
                    >
                      Go Home
                    </button>

                    <button
                      onClick={onReadNext}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_-5px_hsl(var(--primary))]"
                    >
                      Read Now
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-green-500/20 text-green-500 shadow-[0_0_30px_-5px_rgba(34,197,94,0.3)]">
                    <BookMarked className="size-8" />
                  </div>

                  <h2 className="text-3xl font-extrabold mb-3">
                    Congratulations!
                  </h2>

                  <p className="text-muted-foreground mb-8 text-lg">
                    You finished all issues in{' '}
                    <br />
                    <strong className="text-foreground">
                      {comic.title}
                    </strong>
                    .
                  </p>

                  <div className="flex justify-center w-full">
                    <button
                      onClick={() => {
                        setShowNextIssueOverlay(false);
                        handleBack();
                      }}
                      className="px-6 py-3 rounded-xl text-sm font-semibold bg-foreground text-background transition-all hover:scale-105 active:scale-95 shadow-xl w-full"
                    >
                      Back to Home Screen
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

