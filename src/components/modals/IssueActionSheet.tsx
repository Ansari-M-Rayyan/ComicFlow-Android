import { invoke } from '@tauri-apps/api/core';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  BookOpen,
  CheckCircle,
  Clock,
  Heart,
  RotateCcw,
  Trash2,
  X
} from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { SlidingTitle } from '../ui/SlidingTitle';

interface IssueActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  comic: any;
  imgData?: string;
  isCompleted: boolean;
  isFav: boolean;
  isToRead: boolean;
  onReadNow: () => void;
  onToggleRead: () => void;
  onToggleFav: () => void;
  onToggleToRead: () => void;
  onRemoveFromList?: () => void;
  removeListLabel?: string;
  onComicDeleted?: (comicId: string) => void;
}

export function IssueActionSheet({
  isOpen,
  onClose,
  comic,
  imgData,
  isCompleted,
  isFav,
  isToRead,
  onReadNow,
  onToggleRead,
  onToggleFav,
  onToggleToRead,
  onRemoveFromList,
  removeListLabel,
  onComicDeleted
}: IssueActionSheetProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const rootFolder = localStorage.getItem('panel_root_folder') || '';
      await invoke('delete_comic_file', {
        rootFolder: rootFolder || null,
        filePath: comic.path,
        comicId: comic.id
      });
      window.dispatchEvent(
        new CustomEvent('LIBRARY_COMIC_DELETED', {
          detail: { comicId: comic.id, filePath: comic.path }
        })
      );
      if (onComicDeleted) onComicDeleted(comic.id);
      setShowDeleteConfirm(false);
      onClose();
    } catch (err: any) {
      setDeleteError(err?.toString() || 'Failed to delete file');
      setIsDeleting(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => {
            if (!isDeleting) {
              setShowDeleteConfirm(false);
              onClose();
            }
          }}
          className="fixed inset-0 bg-black/80"
        />

        {/* Modal / Action Sheet Container */}
        <motion.div
          initial={{ y: '100%', opacity: 0.8 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-lg bg-card border-t sm:border border-border/60 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden z-10 max-h-[85vh] flex flex-col"
          style={{
            willChange: 'transform, opacity',
            transform: 'translateZ(0)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)'
          }}
        >
          {/* Pull handle for mobile */}
          <div className="pt-3 pb-1 flex justify-center sm:hidden">
            <div className="w-10 h-1.5 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Comic Info Header */}
          <div className="p-4 sm:p-5 flex items-center gap-3.5 border-b border-border/40">
            <div className="relative size-14 shrink-0 rounded-xl overflow-hidden bg-black border border-border/40 shadow-md">
              {imgData ? (
                <img
                  src={imgData}
                  alt={comic.issue}
                  className="size-full object-cover"
                />
              ) : (
                <div className="size-full flex items-center justify-center text-muted-foreground">
                  <BookOpen className="size-6 opacity-40" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <SlidingTitle
                text={comic.issue || comic.title}
                className="text-base font-bold text-foreground leading-tight"
              />
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground font-mono">
                <span>{comic.totalPages || '?'} pages</span>
                <span>•</span>
                <span className={comic.progress === 100 ? 'text-green-400 font-bold' : ''}>
                  {comic.progress || 0}% read
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Main Action Rows */}
          {!showDeleteConfirm ? (
            <div className="p-3 sm:p-4 space-y-1.5 overflow-y-auto">
              {/* Read Now / Resume */}
              <button
                onClick={() => {
                  onClose();
                  onReadNow();
                }}
                className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-primary/10 active:bg-primary/20 text-foreground font-semibold text-sm transition-all group"
              >
                <div className="p-2 rounded-xl bg-primary/15 text-primary group-hover:scale-105 transition-transform">
                  <BookOpen className="size-5" />
                </div>
                <div className="text-left">
                  <p className="leading-none">{comic.progress > 0 && comic.progress < 100 ? 'Resume Reading' : 'Read Now'}</p>
                  <p className="text-xs text-muted-foreground font-normal mt-1">Open comic reader directly</p>
                </div>
              </button>

              {/* Mark as Read / Unread */}
              <button
                onClick={() => {
                  onToggleRead();
                  onClose();
                }}
                className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-muted/60 active:bg-muted text-foreground font-semibold text-sm transition-all group"
              >
                <div className={`p-2 rounded-xl ${isCompleted ? 'bg-amber-500/15 text-amber-400' : 'bg-green-500/15 text-green-400'} group-hover:scale-105 transition-transform`}>
                  {isCompleted ? <RotateCcw className="size-5" /> : <CheckCircle className="size-5" />}
                </div>
                <div className="text-left">
                  <p className="leading-none">{isCompleted ? 'Mark as Unread' : 'Mark as Read'}</p>
                  <p className="text-xs text-muted-foreground font-normal mt-1">
                    {isCompleted ? 'Reset progress back to 0%' : 'Set progress to 100% completed'}
                  </p>
                </div>
              </button>

              {/* Favorites Toggle */}
              <button
                onClick={() => {
                  onToggleFav();
                  onClose();
                }}
                className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-muted/60 active:bg-muted text-foreground font-semibold text-sm transition-all group"
              >
                <div className={`p-2 rounded-xl ${isFav ? 'bg-rose-500/15 text-rose-500' : 'bg-muted text-muted-foreground'} group-hover:scale-105 transition-transform`}>
                  <Heart className={`size-5 ${isFav ? 'fill-current' : ''}`} />
                </div>
                <div className="text-left">
                  <p className="leading-none">{isFav ? 'Remove from Favorites' : 'Add to Favorites'}</p>
                  <p className="text-xs text-muted-foreground font-normal mt-1">
                    {isFav ? 'Remove bookmark from favorites list' : 'Pin to your favorites collection'}
                  </p>
                </div>
              </button>

              {/* Want to Read Toggle */}
              <button
                onClick={() => {
                  onToggleToRead();
                  onClose();
                }}
                className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-muted/60 active:bg-muted text-foreground font-semibold text-sm transition-all group"
              >
                <div className={`p-2 rounded-xl ${isToRead ? 'bg-blue-500/15 text-blue-400' : 'bg-muted text-muted-foreground'} group-hover:scale-105 transition-transform`}>
                  {isToRead ? <BookmarkCheck className="size-5" /> : <Bookmark className="size-5" />}
                </div>
                <div className="text-left">
                  <p className="leading-none">{isToRead ? 'Remove from Want to Read' : 'Want to Read'}</p>
                  <p className="text-xs text-muted-foreground font-normal mt-1">
                    {isToRead ? 'Remove from reading queue' : 'Save for later reading'}
                  </p>
                </div>
              </button>

              {/* Contextual Shelf Removal */}
              {onRemoveFromList && (
                <button
                  onClick={() => {
                    onClose();
                    onRemoveFromList();
                  }}
                  className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-muted/60 active:bg-muted text-foreground font-semibold text-sm transition-all group border-t border-border/30 pt-3"
                >
                  <div className="p-2 rounded-xl bg-muted text-muted-foreground group-hover:scale-105 transition-transform">
                    <Clock className="size-5" />
                  </div>
                  <div className="text-left">
                    <p className="leading-none">{removeListLabel || 'Remove from Shelf'}</p>
                    <p className="text-xs text-muted-foreground font-normal mt-1">Hide item from this shelf</p>
                  </div>
                </button>
              )}

              {/* Delete Comic from Device */}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-rose-500/15 active:bg-rose-500/20 text-rose-400 font-semibold text-sm transition-all group border-t border-border/30 mt-1"
              >
                <div className="p-2 rounded-xl bg-rose-500/15 text-rose-500 group-hover:scale-105 transition-transform">
                  <Trash2 className="size-5" />
                </div>
                <div className="text-left">
                  <p className="leading-none text-rose-400">Delete from Device</p>
                  <p className="text-xs text-rose-400/70 font-normal mt-1">Permanently remove this comic file</p>
                </div>
              </button>
            </div>
          ) : (
            /* Delete Confirmation View */
            <div className="p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-3 text-rose-400">
                <div className="p-2.5 rounded-2xl bg-rose-500/15 border border-rose-500/20">
                  <AlertTriangle className="size-6 text-rose-500" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Delete Comic Permanently?</h3>
                  <p className="text-xs text-rose-400 font-medium">This cannot be undone</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Are you sure you want to permanently delete{' '}
                <strong className="text-foreground font-semibold">"{comic.issue || comic.title}"</strong> from your device storage? The comic file will be removed from your phone.
              </p>

              {deleteError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/20 text-rose-300 text-xs">
                  {deleteError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-3 px-4 rounded-xl border border-border/70 hover:bg-muted active:scale-98 text-xs font-bold text-foreground transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDelete}
                  className="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-98 text-white text-xs font-bold shadow-lg shadow-rose-900/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                  <span>{isDeleting ? 'Deleting...' : 'Yes, Delete'}</span>
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
