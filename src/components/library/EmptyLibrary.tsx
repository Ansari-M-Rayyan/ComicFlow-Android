import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderSearch,
  HelpCircle,
  Library,
  Loader2,
  X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { FolderStructureGuideModal } from '../modals/FolderStructureGuideModal';

export function EmptyLibrary({ onConnect }: { onConnect: (path: string, data: any) => void }) {
  const [scanning, setScanning] = useState(false);
  const [showPickerModal, setShowPickerModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [guideIsViewOnly, setGuideIsViewOnly] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>('/storage/emulated/0');
  const [subdirs, setSubdirs] = useState<string[]>([]);
  const [loadingDirs, setLoadingDirs] = useState(false);
  const [customPath, setCustomPath] = useState('');

  const scanFolder = async (path: string) => {
    try {
      setScanning(true);
      setShowPickerModal(false);
      const data = await invoke('scan_library', { folderPath: path });
      onConnect(path, data);
    } catch (e: any) {
      alert("Failed to scan folder: " + e);
      setScanning(false);
    }
  };

  const proceedConnect = async () => {
    try {
      const selectedFolder = await open({ directory: true, multiple: false });
      if (selectedFolder) {
        scanFolder(selectedFolder as string);
        return;
      }
    } catch (_err) {
      // Mobile platform or folder picker not supported
    }
    setShowPickerModal(true);
    loadDirectories('/storage/emulated/0');
  };

  const handleConnect = async () => {
    const hideTip = localStorage.getItem('hide_folder_structure_tip') === 'true';
    if (!hideTip) {
      setGuideIsViewOnly(false);
      setShowGuideModal(true);
      return;
    }
    proceedConnect();
  };

  const loadDirectories = async (targetPath: string) => {
    setLoadingDirs(true);
    setCurrentPath(targetPath);
    try {
      const dirs = await invoke<string[]>('list_subdirectories', { path: targetPath });
      setSubdirs(dirs);
    } catch {
      setSubdirs([]);
    } finally {
      setLoadingDirs(false);
    }
  };

  const goUp = () => {
    const parts = currentPath.split('/').filter(Boolean);
    if (parts.length > 3) {
      parts.pop();
      loadDirectories('/' + parts.join('/'));
    }
  };

  useEffect(() => {
    if (showPickerModal) {
      loadDirectories('/storage/emulated/0');
    }
  }, [showPickerModal]);

  const quickPresets = [
    { label: 'Comics Folder', path: '/storage/emulated/0/Comics' },
    { label: 'Downloads', path: '/storage/emulated/0/Download' },
    { label: 'Documents', path: '/storage/emulated/0/Documents' },
  ];

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      <div className="absolute inset-0 z-0 opacity-20">
        <div className="absolute -left-[10%] top-1/4 size-[50vw] rounded-full bg-primary blur-[150px] mix-blend-screen animate-pulse" />
        <div className="absolute -right-[10%] bottom-1/4 size-[40vw] rounded-full bg-blue-600 blur-[150px] mix-blend-screen animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 flex max-w-lg flex-col items-center text-center px-6">
        <div className="mb-8 grid size-24 place-items-center rounded-3xl bg-card border border-border/50 shadow-2xl">
          <Library className="size-10 text-primary" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">Your digital comic vault.</h1>
        <p className="mt-4 text-lg text-muted-foreground leading-relaxed">Connect your local folder. ComicFlow will parse your Vaults and Series automatically.</p>
        <button
          onClick={handleConnect}
          disabled={scanning}
          className="mt-10 inline-flex items-center gap-3 rounded-full bg-primary px-8 py-4 font-semibold text-primary-foreground shadow-xl hover:scale-105 active:scale-95 disabled:opacity-80 transition-transform"
        >
          {scanning ? (
            <>
              <Loader2 className="size-5 animate-spin" />
              <span>Scanning Vaults...</span>
            </>
          ) : (
            <>
              <FolderSearch className="size-5" />
              <span>Connect Library Folder</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setGuideIsViewOnly(true);
            setShowGuideModal(true);
          }}
          className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-3.5 py-1.5 rounded-full hover:bg-muted/50 border border-border/40"
        >
          <HelpCircle className="size-3.5 text-primary" />
          <span>Folder Structure Guide</span>
        </button>
      </motion.div>

      {/* Folder Structure Guide Modal */}
      <FolderStructureGuideModal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
        onProceed={proceedConnect}
        isViewOnly={guideIsViewOnly}
      />

      {/* Mobile Folder Selector Modal */}
      <AnimatePresence>
        {showPickerModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl bg-card border border-border/60 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
                <div className="flex items-center gap-2.5">
                  <FolderOpen className="size-5 text-primary" />
                  <span className="font-semibold text-base text-foreground">Select Comic Folder</span>
                </div>
                <button
                  onClick={() => setShowPickerModal(false)}
                  className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"
                >
                  <X className="size-5" />
                </button>
              </div>

              {/* Quick Presets */}
              <div className="px-5 py-3 border-b border-border/30 bg-muted/20">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Quick Shortcuts</p>
                <div className="flex flex-wrap gap-2">
                  {quickPresets.map((preset) => (
                    <button
                      key={preset.path}
                      onClick={() => scanFolder(preset.path)}
                      className="px-3.5 py-1.5 rounded-full bg-primary/15 hover:bg-primary/25 text-primary text-xs font-medium border border-primary/20 transition-colors flex items-center gap-1.5 active:scale-95"
                    >
                      <Folder className="size-3.5" />
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Path Breadcrumb & Actions */}
              <div className="px-5 py-2.5 flex items-center gap-2 border-b border-border/30 bg-background/50">
                <button
                  onClick={goUp}
                  className="p-1.5 rounded-lg hover:bg-muted text-foreground border border-border/40"
                  title="Go Up"
                >
                  <ArrowLeft className="size-4" />
                </button>
                <span className="text-xs text-muted-foreground font-mono truncate flex-1">{currentPath}</span>
              </div>

              {/* Directory List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-1 divide-y divide-border/10">
                {loadingDirs ? (
                  <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
                    <Loader2 className="size-5 animate-spin" />
                    <span>Loading folders...</span>
                  </div>
                ) : subdirs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No subdirectories found. You can select this folder below!
                  </div>
                ) : (
                  subdirs.map((dir) => {
                    const dirName = dir.split(/[\\/]/).pop();
                    return (
                      <div
                        key={dir}
                        className="flex items-center justify-between py-2 px-2.5 rounded-xl hover:bg-muted/40 transition-colors cursor-pointer group"
                      >
                        <div
                          onClick={() => loadDirectories(dir)}
                          className="flex items-center gap-3 flex-1 min-w-0"
                        >
                          <Folder className="size-5 text-amber-500 shrink-0" />
                          <span className="text-sm font-medium text-foreground truncate">{dirName}</span>
                          <ChevronRight className="size-4 text-muted-foreground opacity-40 ml-auto shrink-0" />
                        </div>
                        <button
                          onClick={() => scanFolder(dir)}
                          className="ml-2 px-2.5 py-1 text-xs rounded-md bg-primary/20 text-primary hover:bg-primary hover:text-primary-foreground transition-all shrink-0 font-medium"
                        >
                          Scan
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer with Select Current Folder & Custom Path */}
              <div className="p-4 border-t border-border/40 bg-card flex flex-col gap-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customPath}
                    onChange={(e) => setCustomPath(e.target.value)}
                    placeholder="Or enter custom path e.g. /sdcard/Comics"
                    className="flex-1 px-3 py-2 text-xs rounded-xl bg-muted/50 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                  />
                  <button
                    onClick={() => customPath.trim() && scanFolder(customPath.trim())}
                    disabled={!customPath.trim()}
                    className="px-4 py-2 text-xs rounded-xl bg-secondary text-secondary-foreground font-semibold hover:bg-secondary/80 disabled:opacity-50"
                  >
                    Scan Path
                  </button>
                </div>

                <button
                  onClick={() => scanFolder(currentPath)}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-md hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2"
                >
                  <FolderOpen className="size-4" />
                  <span>Select Current Folder</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
