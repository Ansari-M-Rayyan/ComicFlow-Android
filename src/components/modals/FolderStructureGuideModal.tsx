import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Folder,
  FolderTree,
  Sparkles,
  X
} from 'lucide-react';
import { useState } from 'react';

interface FolderStructureGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceed?: () => void;
  isViewOnly?: boolean;
}

export function FolderStructureGuideModal({
  isOpen,
  onClose,
  onProceed,
  isViewOnly = false,
}: FolderStructureGuideModalProps) {
  const [activeTab, setActiveTab] = useState<'recommended' | 'avoid'>('recommended');
  const [dontShowAgain, setDontShowAgain] = useState(false);

  if (!isOpen) return null;

  const handleProceed = () => {
    if (dontShowAgain) {
      try {
        localStorage.setItem('hide_folder_structure_tip', 'true');
      } catch (_) {}
    }
    onClose();
    if (onProceed) {
      onProceed();
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4">
        {/* Backdrop dismiss */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, y: 80, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 80, scale: 0.96 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          className="relative z-10 w-full max-w-lg rounded-t-3xl sm:rounded-2xl bg-card border border-border/80 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 bg-muted/20">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/15 text-primary border border-primary/20">
                <FolderTree className="size-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-foreground leading-tight">
                  Organize Your Comic Vault
                </h3>
                <p className="text-xs text-muted-foreground">
                  Optimal structure for automatic series & metadata matching
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Segmented Tab Switcher */}
          <div className="px-5 pt-4 pb-2 bg-card">
            <div className="grid grid-cols-2 gap-2 p-1 bg-muted/40 rounded-xl border border-border/40">
              <button
                type="button"
                onClick={() => setActiveTab('recommended')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'recommended'
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <CheckCircle2 className="size-3.5" />
                <span>Recommended</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('avoid')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'avoid'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <AlertCircle className="size-3.5" />
                <span>What to Avoid</span>
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
            {activeTab === 'recommended' ? (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                {/* Explanatory Banner */}
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/25 flex items-start gap-2.5">
                  <Sparkles className="size-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-foreground/90 leading-relaxed">
                    ComicFlow detects <strong className="text-primary font-semibold">Vaults</strong> (Publishers) and <strong className="text-primary font-semibold">Series</strong> automatically when nested in a 3-tier hierarchy:
                  </p>
                </div>

                {/* Animated Interactive Tree Showcase */}
                <div className="p-4 rounded-2xl bg-muted/25 border border-border/60 font-sans space-y-2">
                  {/* Level 1: Root Folder */}
                  <div className="flex items-center gap-2">
                    <span className="p-1 rounded-md bg-amber-500/15 text-amber-500 border border-amber-500/20">
                      <Folder className="size-4" />
                    </span>
                    <span className="text-xs font-bold text-foreground font-mono">Comics</span>
                    <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      Selected Root Folder
                    </span>
                  </div>

                  {/* Level 2 & 3: Marvel Vault */}
                  <div className="ml-3 pl-3 border-l-2 border-border/40 space-y-2 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded-md bg-blue-500/15 text-blue-400 border border-blue-500/20">
                        <Folder className="size-3.5" />
                      </span>
                      <span className="text-xs font-semibold text-foreground font-mono">Marvel</span>
                      <span className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded bg-blue-500/15 text-blue-400">
                        Publisher / Vault
                      </span>
                    </div>

                    {/* Avengers Series */}
                    <div className="ml-3 pl-3 border-l-2 border-border/30 space-y-1.5 pt-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="p-0.5 rounded bg-purple-500/15 text-purple-400">
                          <Folder className="size-3" />
                        </span>
                        <span className="text-xs font-medium text-foreground/90 font-mono">Avengers</span>
                        <span className="px-1.5 py-0.2 text-[9px] font-medium rounded bg-purple-500/15 text-purple-400">
                          Series
                        </span>
                      </div>
                      <div className="ml-3 pl-3 border-l border-border/20 flex flex-wrap gap-1.5 pt-0.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 border border-border/40 text-[11px] text-muted-foreground font-mono">
                          <FileText className="size-3 text-primary" /> Issue #1.cbz
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 border border-border/40 text-[11px] text-muted-foreground font-mono">
                          <FileText className="size-3 text-primary" /> Issue #2.cbz
                        </span>
                      </div>
                    </div>

                    {/* Spider-Man Series */}
                    <div className="ml-3 pl-3 border-l-2 border-border/30 space-y-1.5 pt-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="p-0.5 rounded bg-purple-500/15 text-purple-400">
                          <Folder className="size-3" />
                        </span>
                        <span className="text-xs font-medium text-foreground/90 font-mono">Spider-Man</span>
                        <span className="px-1.5 py-0.2 text-[9px] font-medium rounded bg-purple-500/15 text-purple-400">
                          Series
                        </span>
                      </div>
                      <div className="ml-3 pl-3 border-l border-border/20 flex flex-wrap gap-1.5 pt-0.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 border border-border/40 text-[11px] text-muted-foreground font-mono">
                          <FileText className="size-3 text-primary" /> Issue #1.cbr
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Level 2 & 3: DC Vault */}
                  <div className="ml-3 pl-3 border-l-2 border-border/40 space-y-2 pt-2">
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded-md bg-blue-500/15 text-blue-400 border border-blue-500/20">
                        <Folder className="size-3.5" />
                      </span>
                      <span className="text-xs font-semibold text-foreground font-mono">DC</span>
                      <span className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded bg-blue-500/15 text-blue-400">
                        Publisher / Vault
                      </span>
                    </div>

                    {/* Batman Series */}
                    <div className="ml-3 pl-3 border-l-2 border-border/30 space-y-1.5 pt-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="p-0.5 rounded bg-purple-500/15 text-purple-400">
                          <Folder className="size-3" />
                        </span>
                        <span className="text-xs font-medium text-foreground/90 font-mono">Batman</span>
                        <span className="px-1.5 py-0.2 text-[9px] font-medium rounded bg-purple-500/15 text-purple-400">
                          Series
                        </span>
                      </div>
                      <div className="ml-3 pl-3 border-l border-border/20 flex flex-wrap gap-1.5 pt-0.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 border border-border/40 text-[11px] text-muted-foreground font-mono">
                          <FileText className="size-3 text-primary" /> Issue #1.cbz
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 border border-border/40 text-[11px] text-muted-foreground font-mono">
                          <FileText className="size-3 text-primary" /> Issue #2.cbz
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                {/* Warning Banner */}
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-start gap-2.5">
                  <AlertCircle className="size-4 text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-200 leading-relaxed">
                    Avoid placing loose comic files directly in the root or downloads directory without subfolders:
                  </p>
                </div>

                {/* Bad Example Visual Card */}
                <div className="p-4 rounded-2xl bg-rose-950/15 border border-rose-500/20 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="p-1 rounded-md bg-amber-500/15 text-amber-500 border border-amber-500/20">
                      <Folder className="size-4" />
                    </span>
                    <span className="text-xs font-bold text-foreground font-mono">Comics</span>
                  </div>

                  <div className="ml-3 pl-3 border-l-2 border-rose-500/40 space-y-2 pt-1">
                    <div className="flex items-center gap-2 text-rose-300">
                      <span className="text-xs">❌</span>
                      <span className="text-xs font-mono text-muted-foreground line-through">Issue #1.cbz</span>
                      <span className="text-[10px] text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded">
                        Loose file (no series)
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-rose-300">
                      <span className="text-xs">❌</span>
                      <span className="text-xs font-mono text-muted-foreground line-through">Batman #05.cbz</span>
                      <span className="text-[10px] text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded">
                        Loose file (cannot match ComicVine)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-muted/40 border border-border/40 text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground">Why does this happen?</p>
                  <p>
                    ComicFlow groups your comics by series and matches volumes using the folder hierarchy. Loose files cannot be cataloged properly into shelves or volumes.
                  </p>
                </div>
              </motion.div>
            )}
          </div>

          {/* Footer Controls */}
          <div className="p-5 border-t border-border/40 bg-card flex flex-col gap-3">
            {!isViewOnly && (
              <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-muted accent-primary cursor-pointer"
                />
                <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                  Don't show this suggestion again
                </span>
              </label>
            )}

            <div className="flex gap-2">
              {isViewOnly ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-md hover:brightness-110 active:scale-98 transition-all"
                >
                  Got It
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-3 rounded-xl border border-border bg-secondary/60 hover:bg-secondary text-xs font-semibold text-foreground transition-colors active:scale-98"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleProceed}
                    className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-lg shadow-primary/25 hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2"
                  >
                    <span>Choose Comic Folder</span>
                    <ArrowRight className="size-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
