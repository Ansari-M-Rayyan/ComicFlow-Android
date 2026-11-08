import { invoke } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
  HardDrive,
  RefreshCw,
  X
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface DirItem {
  name: string;
  path: string;
  hasSubdirs: boolean;
  comicCount: number;
}

interface DirectoryListing {
  currentPath: string;
  parentPath: string | null;
  items: DirItem[];
  shortcuts: DirItem[];
}

export function DirectoryPickerModal({
  initialPath,
  isOpen,
  onClose,
  onSelectFolder,
}: {
  initialPath?: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectFolder: (path: string) => void;
}) {
  const [currentPath, setCurrentPath] = useState(initialPath || '');
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = async (target?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<DirectoryListing>('list_directories', {
        currentPath: target || currentPath || null,
      });
      setListing(res);
      setCurrentPath(res.currentPath);
    } catch (err: any) {
      console.error('Failed to list directory:', err);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDirectory(initialPath);
    }
  }, [isOpen, initialPath]);

  if (!isOpen) return null;

  const handleSelectCurrent = () => {
    if (currentPath) {
      onSelectFolder(currentPath);
      onClose();
    }
  };

  // Generate breadcrumbs from path
  const pathParts = currentPath.split(/[/\\]/).filter(Boolean);

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/85"
      />

      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        style={{ willChange: 'transform, opacity', transform: 'translateZ(0)' }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl bg-card border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col h-[85vh] max-h-[85vh] overflow-hidden text-foreground"
      >
        {/* Top Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-primary/15 text-primary">
              <FolderOpen className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Select Comic Library</h2>
              <p className="text-xs text-muted-foreground">Browse and choose where your comics are stored</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
            title="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Shortcuts Bar */}
        {listing?.shortcuts && listing.shortcuts.length > 0 && (
          <div className="px-5 py-2.5 bg-black/30 border-b border-white/5 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
            <span className="text-[10px] font-mono uppercase text-muted-foreground shrink-0 mr-1 flex items-center gap-1">
              <HardDrive className="size-3" /> Quick:
            </span>
            {listing.shortcuts.map((sc) => {
              const isActive = currentPath === sc.path;
              return (
                <button
                  key={sc.path}
                  onClick={() => loadDirectory(sc.path)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground border border-white/5'
                  }`}
                >
                  <Folder className="size-3.5" />
                  <span>{sc.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Breadcrumb Path & Up Button */}
        <div className="px-5 py-3 border-b border-white/10 flex items-center gap-2 bg-black/20 text-xs shrink-0">
          {listing?.parentPath && (
            <button
              onClick={() => loadDirectory(listing.parentPath!)}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-white/80 hover:text-white transition-colors shrink-0"
              title="Go up one folder"
            >
              <ArrowLeft className="size-4" />
            </button>
          )}

          <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 font-mono text-[11px]">
            <button
              onClick={() => loadDirectory(listing?.shortcuts?.[0]?.path || '/')}
              className="text-muted-foreground hover:text-foreground hover:underline shrink-0"
            >
              /
            </button>
            {pathParts.map((part, idx) => {
              const isLast = idx === pathParts.length - 1;
              const subPath = (currentPath.startsWith('/') ? '/' : '') + pathParts.slice(0, idx + 1).join('/');
              return (
                <div key={idx} className="flex items-center gap-1 shrink-0">
                  <ChevronRight className="size-3 text-muted-foreground/50" />
                  <button
                    onClick={() => !isLast && loadDirectory(subPath)}
                    className={`truncate max-w-[140px] ${
                      isLast
                        ? 'font-bold text-primary underline underline-offset-4'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {part}
                  </button>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => loadDirectory(currentPath)}
            className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors shrink-0"
            title="Refresh"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Directory Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1.5 divide-y divide-white/[0.02]">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
              <RefreshCw className="size-6 animate-spin text-primary" />
              <p className="text-sm font-medium">Reading folders...</p>
            </div>
          ) : error ? (
            <div className="p-6 text-center">
              <p className="text-sm text-red-400 mb-3 font-semibold">{error}</p>
              <button
                onClick={() => loadDirectory(listing?.shortcuts?.[0]?.path || '/storage/emulated/0')}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold"
              >
                Reset to Default
              </button>
            </div>
          ) : listing?.items && listing.items.length > 0 ? (
            listing.items.map((item) => (
              <button
                key={item.path}
                onClick={() => loadDirectory(item.path)}
                className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-white/5 active:bg-white/10 text-left transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20 transition-colors shrink-0">
                    <Folder className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">
                      {item.name}
                    </p>
                    {item.comicCount > 0 ? (
                      <p className="text-xs text-emerald-400 flex items-center gap-1 font-medium mt-0.5">
                        <BookOpen className="size-3" />
                        <span>{item.comicCount} {item.comicCount === 1 ? 'comic' : 'comics'} found</span>
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground/70 font-mono mt-0.5">
                        {item.hasSubdirs ? 'Subfolders inside' : 'Folder'}
                      </p>
                    )}
                  </div>
                </div>

                <div className="shrink-0 text-muted-foreground/60 group-hover:text-foreground group-hover:translate-x-0.5 transition-all">
                  <ChevronRight className="size-5" />
                </div>
              </button>
            ))
          ) : (
            <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center h-48">
              <FolderOpen className="size-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-semibold text-foreground/80 mb-1">No subfolders found</p>
              <p className="text-xs text-muted-foreground/70 max-w-xs">
                You can select this folder as your comic library using the button below.
              </p>
            </div>
          )}
        </div>

        {/* Bottom Actions Bar */}
        <div className="p-4 sm:p-5 border-t border-white/10 bg-black/40 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 w-full sm:w-auto text-left">
            <span className="text-[10px] font-mono uppercase text-muted-foreground block mb-0.5">
              Current Directory:
            </span>
            <p className="font-mono text-xs font-semibold text-primary truncate max-w-md" title={currentPath}>
              {currentPath}
            </p>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white text-xs font-semibold transition-colors flex-1 sm:flex-initial"
            >
              Cancel
            </button>
            <button
              onClick={handleSelectCurrent}
              disabled={!currentPath || loading}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-1.5 flex-1 sm:flex-initial disabled:opacity-50"
            >
              <Check className="size-4" />
              <span>Select This Folder</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
