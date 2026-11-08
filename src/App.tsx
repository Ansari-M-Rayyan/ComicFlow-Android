import { invoke } from '@tauri-apps/api/core';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, LogOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

// Components
import { EmptyLibrary } from './components/library/EmptyLibrary';
import { IssueDetailModal } from './components/modals/IssueDetailModal';
import { BottomNav } from './components/ui/BottomNav';
import { SplashScreen } from './components/ui/SplashScreen';
import { DashboardView } from './views/DashboardView';
import { JourneyView } from './views/JourneyView';
import { ReaderView } from './views/ReaderView';
import { SearchView } from './views/SearchView';
import { SeriesDetailView } from './views/SeriesDetailView';
import { SettingsView } from './views/SettingsView';
import { VaultDetailView } from './views/VaultDetailView';

interface NavigationState {
  view: 'setup' | 'library' | 'vault-detail' | 'series' | 'reader' | 'journey' | 'settings' | 'search';
  activeVaultId?: string | null;
  activeSeriesId?: string | null;
  activeComicId?: string | null;
  momentJumpPage?: number;
  hasModal?: 'comic' | 'settings' | null;
}

const findComicById = (vaults: any[], comicId?: string | null) => {
  if (!comicId || !Array.isArray(vaults)) return null;
  for (const vault of vaults) {
    for (const series of vault.series || []) {
      const comic = (series.issues || []).find((issue: any) => issue.id === comicId);
      if (comic) return comic;
    }
  }
  return null;
};

export default function App() {
  const savedRootFolder = localStorage.getItem('panel_root_folder') || '';
  const [rootFolder, setRootFolder] = useState<string>(savedRootFolder);
  const [view, setView] = useState<'setup' | 'library' | 'vault-detail' | 'series' | 'reader' | 'journey' | 'settings' | 'search'>(savedRootFolder ? 'library' : 'setup');
  const [vaultsData, setVaultsData] = useState<any[]>([]);
  const [isAppLoading, setIsAppLoading] = useState<boolean>(true);
  const [activeVault, setActiveVault] = useState<any>(null);
  const [activeSeries, setActiveSeries] = useState<any>(null);
  const [activeComic, setActiveComic] = useState<any>(null);
  const [momentJumpPage, setMomentJumpPage] = useState<number | undefined>(undefined);
  const [globalModalComic, setGlobalModalComic] = useState<any>(null);
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);

  // --- PERFORMANCE P1: O(1) ISSUE INDEX ---
  const issueLocationById = useRef<Record<string, {vaultId: string, seriesId: string}>>({});

  const buildIssueIndex = (data: any[]) => {
    const locs: Record<string, {vaultId: string, seriesId: string}> = {};
    data.forEach(v => {
      (v.series || []).forEach((s: any) => {
        (s.issues || []).forEach((i: any) => {
          locs[i.id] = { vaultId: v.id, seriesId: s.id };
        });
      });
    });
    issueLocationById.current = locs;
  };

  // Initial history state replacement
  useEffect(() => {
    if (!window.history.state) {
      window.history.replaceState({
        view,
        activeVaultId: activeVault?.id || null,
        activeSeriesId: activeSeries?.id || null,
        activeComicId: activeComic?.id || null,
        momentJumpPage: momentJumpPage || undefined,
        hasModal: null,
      }, '');
    }
  }, []);

  // Native Android Back Navigation & Popstate Listener
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      // 1. If Exit Confirm modal is open, close it
      if (showExitConfirm) {
        setShowExitConfirm(false);
        return;
      }

      // 2. If comic modal was open, close it first
      if (globalModalComic) {
        setGlobalModalComic(null);
        return;
      }

      // 3. If user is currently on any top-level tab other than Library (e.g. Journey, Settings, Search),
      // pressing Android Back MUST immediately navigate straight to Library (Home).
      if (view === 'journey' || view === 'settings' || view === 'search') {
        setView(rootFolder ? 'library' : 'setup');
        setActiveVault(null);
        setActiveSeries(null);
        setActiveComic(null);
        return;
      }

      // 4. If user is already on Library (Home section) or Setup, show exit confirmation!
      if (view === 'library' || view === 'setup') {
        setShowExitConfirm(true);
        window.history.pushState({ view }, '');
        return;
      }

      const state = event.state as NavigationState | null;
      if (state && state.view) {
        // If popped state points to a secondary tab, route to Library instead
        if (state.view === 'journey' || state.view === 'settings' || state.view === 'search') {
          setView('library');
          setActiveVault(null);
          setActiveSeries(null);
          setActiveComic(null);
          return;
        }

        setView(state.view);
        if (state.activeVaultId) {
          setActiveVault(vaultsData.find(v => v.id === state.activeVaultId) || null);
        } else {
          setActiveVault(null);
        }
        if (state.activeSeriesId) {
          const v = vaultsData.find(v => v.id === state.activeVaultId);
          setActiveSeries(v?.series?.find((s: any) => s.id === state.activeSeriesId) || null);
        } else {
          setActiveSeries(null);
        }
        if (state.activeComicId) {
          setActiveComic(findComicById(vaultsData, state.activeComicId));
        } else {
          setActiveComic(null);
        }
        setMomentJumpPage(state.momentJumpPage);
      } else {
        // Fallback pop navigation
        if (view === 'reader') {
          setView(activeSeries ? 'series' : (activeVault ? 'vault-detail' : 'library'));
        } else if (view === 'series') {
          setView('vault-detail');
        } else {
          setView('library');
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [view, activeVault, activeSeries, activeComic, globalModalComic, showExitConfirm, vaultsData]);

  // Strict Portrait Lock outside Reader Mode ONLY on phones (allow full landscape/portrait on tablets)
  useEffect(() => {
    const handleOrientation = async () => {
      try {
        const isTabletOrDesktop = window.innerWidth >= 768 || window.matchMedia('(min-width: 768px)').matches;
        const androidBridge = (window as any).AndroidOrientation;
        const orientation = (window.screen as any)?.orientation;
        if (view === 'reader' || isTabletOrDesktop) {
          if (androidBridge?.unlockOrientation) {
            androidBridge.unlockOrientation();
          } else if (orientation?.unlock) {
            orientation.unlock();
          }
        } else {
          if (androidBridge?.lockPortrait) {
            androidBridge.lockPortrait();
          } else if (orientation?.lock) {
            await orientation.lock('portrait').catch(() => {});
          }
        }
      } catch (_) {}
    };
    handleOrientation();
  }, [view]);

  // Handle Comic Deletion event from IssueActionSheet
  useEffect(() => {
    const handleComicDeleted = (event: any) => {
      const deletedComicId = event.detail?.comicId;
      if (!deletedComicId) return;

      if (globalModalComic?.id === deletedComicId) {
        setGlobalModalComic(null);
      }
      setActiveComic((curr: any) => curr?.id === deletedComicId ? null : curr);

      // Remove from O(1) issue index
      if (issueLocationById.current[deletedComicId]) {
        delete issueLocationById.current[deletedComicId];
      }

      setVaultsData(prevVaults => {
        return prevVaults.map(v => ({
          ...v,
          series: (v.series || []).map((s: any) => ({
            ...s,
            issues: (s.issues || []).filter((i: any) => i.id !== deletedComicId)
          }))
        }));
      });

      setActiveVault((curr: any) => {
        if (!curr) return null;
        return {
          ...curr,
          series: (curr.series || []).map((s: any) => ({
            ...s,
            issues: (s.issues || []).filter((i: any) => i.id !== deletedComicId)
          }))
        };
      });

      setActiveSeries((curr: any) => {
        if (!curr) return null;
        return {
          ...curr,
          issues: (curr.issues || []).filter((i: any) => i.id !== deletedComicId)
        };
      });
    };

    window.addEventListener('LIBRARY_COMIC_DELETED', handleComicDeleted);
    return () => window.removeEventListener('LIBRARY_COMIC_DELETED', handleComicDeleted);
  }, [globalModalComic]);

  const navigateTo = useCallback((
    targetView: 'setup' | 'library' | 'vault-detail' | 'series' | 'reader' | 'journey' | 'settings' | 'search',
    vault: any = null,
    series: any = null,
    comic: any = null,
    jumpPage?: number
  ) => {
    const isTargetTopTab = targetView === 'journey' || targetView === 'settings' || targetView === 'search';
    const isCurrentTopTab = view === 'journey' || view === 'settings' || view === 'search';

    const nextState: NavigationState = {
      view: targetView,
      activeVaultId: vault?.id || null,
      activeSeriesId: series?.id || null,
      activeComicId: comic?.id || null,
      momentJumpPage: jumpPage,
      hasModal: null,
    };

    // If switching between secondary top tabs, replace history so back always points to Library
    if (isTargetTopTab && isCurrentTopTab) {
      window.history.replaceState(nextState, '');
    } else {
      window.history.pushState(nextState, '');
    }

    setActiveVault(vault);
    setActiveSeries(series);
    setActiveComic(comic);
    setMomentJumpPage(jumpPage);
    setView(targetView);
  }, [view]);

  const openComicModal = useCallback((comic: any) => {
    window.history.pushState({ ...window.history.state, hasModal: 'comic' }, '');
    setGlobalModalComic(comic);
  }, []);

  const closeComicModal = useCallback(() => {
    if (window.history.state?.hasModal === 'comic') {
      window.history.back();
    } else {
      setGlobalModalComic(null);
    }
  }, []);

  const handleBack = useCallback(() => {
    if (showExitConfirm) {
      setShowExitConfirm(false);
      return;
    }

    if (globalModalComic) {
      setGlobalModalComic(null);
      return;
    }

    if (view === 'journey' || view === 'settings' || view === 'search') {
      navigateTo(rootFolder ? 'library' : 'setup', null, null, null);
      return;
    }

    if (view === 'reader') {
      navigateTo(activeSeries ? 'series' : (activeVault ? 'vault-detail' : (rootFolder ? 'library' : 'setup')), activeVault, activeSeries, null);
    } else if (view === 'series') {
      navigateTo('vault-detail', activeVault, null, null);
    } else if (view === 'vault-detail') {
      navigateTo(rootFolder ? 'library' : 'setup', null, null, null);
    } else if (view === 'library' || view === 'setup') {
      setShowExitConfirm(true);
    } else {
      navigateTo(rootFolder ? 'library' : 'setup', null, null, null);
    }
  }, [view, activeSeries, activeVault, globalModalComic, showExitConfirm, navigateTo, rootFolder]);

  useEffect(() => {
    invoke('show_window').catch(console.error);

    const handleLibraryPatch = (event: Event) => {
      const detail = (event as CustomEvent).detail as { comicId: string, patch: any };
      if (!detail?.comicId) return;

      const loc = issueLocationById.current[detail.comicId];
      if (!loc) return; 

      setVaultsData(prev => {
        const vaults = [...prev];
        const vIdx = vaults.findIndex(v => v.id === loc.vaultId);
        if (vIdx === -1) return prev;

        const newVault = { ...vaults[vIdx] };
        const sIdx = newVault.series.findIndex((s: any) => s.id === loc.seriesId);
        if (sIdx === -1) return prev;

        const newSeries = { ...newVault.series[sIdx] };
        const iIdx = newSeries.issues.findIndex((i: any) => i.id === detail.comicId);
        if (iIdx === -1) return prev;

        const newIssue = { ...newSeries.issues[iIdx], ...detail.patch };
        newSeries.issues = [...newSeries.issues];
        newSeries.issues[iIdx] = newIssue;
        newVault.series = [...newVault.series];
        newVault.series[sIdx] = newSeries;
        vaults[vIdx] = newVault;
        
        return vaults;
      });

      setActiveVault((curr: any) => curr?.id === loc.vaultId ? { ...curr, series: curr.series.map((s: any) => s.id === loc.seriesId ? { ...s, issues: s.issues.map((i: any) => i.id === detail.comicId ? { ...i, ...detail.patch } : i) } : s) } : curr);
      setActiveSeries((curr: any) => curr?.id === loc.seriesId ? { ...curr, issues: curr.issues.map((i: any) => i.id === detail.comicId ? { ...i, ...detail.patch } : i) } : curr);
      setActiveComic((curr: any) => curr?.id === detail.comicId ? { ...curr, ...detail.patch } : curr);
      setGlobalModalComic((curr: any) => curr?.id === detail.comicId ? { ...curr, ...detail.patch } : curr);
    };

    window.addEventListener('LIBRARY_PATCH', handleLibraryPatch);
    const preventContextMenu = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', preventContextMenu);
    
    // Prevent long-press text selection toolbar and magnifying loupe across app except on input/textarea
    const preventSelect = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      e.preventDefault();
    };
    document.addEventListener('selectstart', preventSelect);

    return () => {
      window.removeEventListener('LIBRARY_PATCH', handleLibraryPatch);
      document.removeEventListener('contextmenu', preventContextMenu);
      document.removeEventListener('selectstart', preventSelect);
    };
  }, []);

  // --- PERFORMANCE P3: CACHED STARTUP ---
  useEffect(() => {
    if (!rootFolder) { setIsAppLoading(false); return; }
    let isMounted = true;
    (async () => {
      setIsAppLoading(true);
      try {
        const cachedData: any = await invoke('load_cached_library', { folderPath: rootFolder });
        if (isMounted && cachedData && cachedData.length > 0) {
          buildIssueIndex(cachedData);
          setVaultsData(cachedData);
          
          setIsAppLoading(false);
        }
      } catch (e) { console.error("Cache load failed", e); }

      try {
        const liveData: any = await invoke('scan_library', { folderPath: rootFolder });
        if (isMounted) {
          buildIssueIndex(liveData);
          setVaultsData(liveData);
          setActiveVault((curr: any) => curr ? liveData.find((v: any) => v.id === curr.id) || null : null);
          setActiveSeries((curr: any) => {
            if (!curr) return null;
            for (const v of liveData) {
              const match = (v.series || []).find((s: any) => s.id === curr.id);
              if (match) return match;
            }
            return null;
          });
          setActiveComic((curr: any) => curr ? findComicById(liveData, curr.id) || null : null);
          setGlobalModalComic((curr: any) => curr ? findComicById(liveData, curr.id) || null : null);
          setIsAppLoading(false);
        }
      } catch (e) { console.error("Live scan failed", e); setIsAppLoading(false); }
    })();
    return () => { isMounted = false; };
  }, []);

  // Safety: If somehow in reader view without an active comic and not loading, redirect to library
  useEffect(() => {
    if (view === 'reader' && !activeComic && !isAppLoading) {
      setView('library');
    }
  }, [view, activeComic, isAppLoading]);


  const handleConnect = async (path: string, data: any[]) => {
    setRootFolder(path);
    buildIssueIndex(data);
    setVaultsData(data);
    setActiveVault(null);
    setActiveSeries(null);
    setActiveComic(null);
    setMomentJumpPage(undefined);
    setGlobalModalComic(null);
    localStorage.setItem('panel_root_folder', path);
    navigateTo('library', null, null, null);
  };

  const handleChangeFolder = async (newFolder: string) => {
    if (!newFolder) return;
    setRootFolder(newFolder);
    localStorage.setItem('panel_root_folder', newFolder);
    setIsAppLoading(true);
    try {
      const data: any = await invoke('scan_library', { folderPath: newFolder });
      buildIssueIndex(data);
      setVaultsData(data);
      setActiveVault(null);
      setActiveSeries(null);
      setActiveComic(null);
      setMomentJumpPage(undefined);
      setGlobalModalComic(null);
      navigateTo('library', null, null, null);
    } catch (e: any) {
      alert('Failed to scan folder: ' + e);
    } finally {
      setIsAppLoading(false);
    }
  };

  const handleRescanLibrary = async () => {
    if (!rootFolder) return;
    const data: any = await invoke('scan_library', { folderPath: rootFolder });
    buildIssueIndex(data);
    setVaultsData(data);
  };

  const handleMatchSeriesFromView = async (vol: any) => {
    if (!safeSeries) return;
    try {
      await invoke('save_series_volume', { rootFolder, seriesName: safeSeries.name, volumeData: vol });
      const updatedSeries = { ...safeSeries, comicVineVolume: vol, comic_vine_volume: vol };
      setActiveSeries(updatedSeries);
      setVaultsData(prev => prev.map(v => ({
        ...v,
        series: (v.series || []).map((s: any) => s.id === safeSeries.id ? { ...s, comicVineVolume: vol, comic_vine_volume: vol } : s)
      })));
    } catch (e) {
      console.error("Failed to match series volume:", e);
    }
  };

  let nextComic = null;
  if (activeComic && Array.isArray(vaultsData) && vaultsData.length > 0) {
    for (const vault of vaultsData) {
      for (const series of vault.series || []) {
        const idx = (series.issues || []).findIndex((i: any) => i.id === activeComic.id);
        if (idx !== -1 && idx + 1 < series.issues.length) {
          nextComic = series.issues[idx + 1];
          break;
        }
      }
      if (nextComic) break;
    }
  }

  const safeVault = activeVault || (vaultsData.length > 0 ? vaultsData[0] : null);
  const safeSeries = activeSeries || (safeVault?.series?.[0] || null);

  const viewKey = isAppLoading
    ? 'splash'
    : view === 'vault-detail'
      ? `vault-${safeVault?.id || 'none'}`
      : view === 'series'
        ? `series-${safeSeries?.id || 'none'}`
        : view === 'reader'
          ? `reader-${activeComic?.id || 'none'}`
          : view;

  return (
    <main className="min-h-screen bg-background text-foreground selection:bg-primary/30 relative">
      <AnimatePresence>
        {globalModalComic && view !== 'reader' && (
           <IssueDetailModal 
              comic={globalModalComic} 
              vaultsData={vaultsData}
              rootFolder={rootFolder} 
              onClose={closeComicModal} 
              onUpdate={(detail) => window.dispatchEvent(new CustomEvent('LIBRARY_PATCH', { detail }))}
              onRead={() => {
                const comicToRead = { ...globalModalComic, fresh: false };
                window.dispatchEvent(new CustomEvent('LIBRARY_PATCH', { detail: { comicId: globalModalComic.id, patch: { fresh: false } } }));
                setGlobalModalComic(null);
                navigateTo('reader', activeVault, activeSeries, comicToRead);
              }} 
            />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={viewKey}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
          className="w-full min-h-screen"
        >
          {isAppLoading ? <SplashScreen /> : view === 'setup' ? (
        <EmptyLibrary onConnect={handleConnect} />
      ) : view === 'library' ? (
        <DashboardView
          vaultsData={vaultsData}
          onViewVault={(v) => navigateTo('vault-detail', v, null, null)}
          onOpenReader={(c) => {
            const comicToRead = { ...c, fresh: false };
            window.dispatchEvent(new CustomEvent('LIBRARY_PATCH', { detail: { comicId: c.id, patch: { fresh: false } } }));
            navigateTo('reader', null, null, comicToRead);
          }}
          onOpenDetail={(c) => openComicModal(c)}
          onChangeFolder={() => {
            localStorage.removeItem('panel_root_folder');
            localStorage.removeItem('comicflow_ui_state_v2');
            setRootFolder('');
            setVaultsData([]);
            setActiveVault(null);
            setActiveSeries(null);
            setActiveComic(null);
            setMomentJumpPage(undefined);
            setView('setup');
          }}
          onJourney={() => navigateTo('journey', null, null, null)}
          onOpenSettings={() => navigateTo('settings', null, null, null)}
        />
      ) : view === 'vault-detail' && safeVault ? (
        <VaultDetailView
          vault={safeVault}
          rootFolder={rootFolder}
          onBack={handleBack}
          onViewSeries={(s) => navigateTo('series', safeVault, s, null)}
        />
      ) : view === 'series' && safeSeries ? (
        <SeriesDetailView 
          series={safeSeries} 
          vaultName={safeVault?.name || 'Vault'} 
          rootFolder={rootFolder} 
          onBack={handleBack}
          onBackHome={() => navigateTo('library', null, null, null)}
          onOpenDetail={(c) => openComicModal(c)}
          onMatchSeries={handleMatchSeriesFromView}
        />
      ) : view === 'reader' ? (
        activeComic ? (
          <ReaderView
            key={`${activeComic.id}-${momentJumpPage ?? 'base'}`}
            comic={activeComic} 
            rootFolder={rootFolder} 
            nextComic={nextComic} 
            initialPage={momentJumpPage}
            onBack={handleBack} 
            onReadNext={() => {
              if (nextComic) {
                setActiveComic(nextComic);
                setMomentJumpPage(undefined);
              }
            }} 
          />
        ) : (
          <div className="flex min-h-screen flex-col items-center justify-center text-muted-foreground gap-3">
            <Loader2 className="size-6 animate-spin text-primary" />
            <span className="text-sm font-medium">Opening issue...</span>
          </div>
        )
      ) : view === 'journey' ? (
        <JourneyView 
          rootFolder={rootFolder} 
          onBack={handleBack} 
          onOpenMoment={(comicId, p) => {
            const c = findComicById(vaultsData, comicId);
            if (c) {
              const comicToRead = { ...c, fresh: false };
              window.dispatchEvent(new CustomEvent('LIBRARY_PATCH', { detail: { comicId: c.id, patch: { fresh: false } } }));
              navigateTo('reader', null, null, comicToRead, p);
            }
          }} 
        />
      ) : view === 'settings' ? (
        <SettingsView
          rootFolder={rootFolder}
          onBack={handleBack}
          onChangeRootFolder={handleChangeFolder}
          onRescanLibrary={handleRescanLibrary}
        />
      ) : view === 'search' ? (
        <SearchView
          vaultsData={vaultsData}
          rootFolder={rootFolder}
          onBack={handleBack}
          onSelectComic={(c) => openComicModal(c)}
          onSelectSeries={(v, s) => navigateTo('series', v, s, null)}
        />
      ) : null}
        </motion.div>
      </AnimatePresence>

      {/* Global Mobile Bottom Navigation Bar */}
      {view !== 'reader' && view !== 'setup' && !isAppLoading && (
        <BottomNav 
          currentTab={view === 'settings' ? 'settings' : view === 'search' ? 'search' : view === 'journey' ? 'journey' : 'home'}
          onLibraryClick={() => {
            if (view !== 'library') {
              navigateTo('library', null, null, null);
            } else {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
          onSearchClick={() => {
            navigateTo('search', null, null, null);
          }}
          onJourneyClick={() => {
            if (view !== 'journey') {
              navigateTo('journey', null, null, null);
            }
          }}
          onSettingsClick={() => {
            navigateTo('settings', null, null, null);
          }}
        />
      )}

      {/* Exit Confirmation Dialog */}
      <AnimatePresence>
        {showExitConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.92, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 10 }}
              transition={{ duration: 0.16 }}
              className="bg-card border border-border/80 rounded-2xl p-6 max-w-xs w-full shadow-2xl flex flex-col items-center text-center"
            >
              <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-3 text-amber-500">
                <LogOut className="size-6" />
              </div>
              <h3 className="text-base font-bold text-foreground mb-1.5">Close ComicFlow?</h3>
              <p className="text-xs text-muted-foreground mb-6">Do you want to close ComicFlow?</p>
              <div className="flex items-center gap-3 w-full">
                <button
                  type="button"
                  onClick={() => setShowExitConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border bg-secondary/60 hover:bg-secondary text-xs font-semibold text-foreground transition-colors active:scale-95"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => invoke('exit_app')}
                  className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-xs font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-colors active:scale-95"
                >
                  Yes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}