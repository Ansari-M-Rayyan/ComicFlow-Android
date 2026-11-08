import { invoke } from '@tauri-apps/api/core';
import { type Variants } from 'framer-motion';
import {
    BookOpen,
    Heart
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { fetchCoverCached } from '../../cache';
import { IssueActionSheet } from '../modals/IssueActionSheet';

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

export function CoverCard({
  cover,
  rootFolder,
  onOpenDetail,
  onRemoveFromList,
  removeListLabel,
  className = ''
}: {
  cover: any;
  rootFolder: string;
  onOpenDetail: (comic: any) => void;
  onRemoveFromList?: () => void;
  removeListLabel?: string;
  className?: string;
}) {
  const [localProgress, setLocalProgress] = useState(cover.progress);
  const [localFav, setLocalFav] = useState(cover.collections?.includes('Favorites') || false);
  const [localToRead, setLocalToRead] = useState(cover.collections?.includes('To Read') || false);
  const isCompleted = localProgress === 100;
  
  const [imgData, setImgData] = useState<string>('');
  const [showMenu, setShowMenu] = useState(false);
  const cardRef = useRef<HTMLButtonElement>(null);

  const longPressTimer = useRef<any>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const isLongPressTriggered = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    isLongPressTriggered.current = false;
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    longPressTimer.current = setTimeout(() => {
      isLongPressTriggered.current = true;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(40); } catch (_) {}
      }
      setShowMenu(true);
    }, 450);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPos.current.x);
    const dy = Math.abs(touch.clientY - touchStartPos.current.y);
    if (dx > 10 || dy > 10) {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (isLongPressTriggered.current) {
      e.preventDefault();
      e.stopPropagation();
      isLongPressTriggered.current = false;
      return;
    }
    onOpenDetail(cover);
  };

  useEffect(() => {
    setLocalProgress(cover.progress);
    setLocalFav(cover.collections?.includes('Favorites') || false);
    setLocalToRead(cover.collections?.includes('To Read') || false);
  }, [cover]);

  useEffect(() => {
    let isMounted = true;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !imgData) {
        fetchCoverCached(rootFolder, cover.path).then(res => {
          if (isMounted) setImgData(res);
        }).catch(console.error);
        observer.disconnect();
      }
    }, { rootMargin: '200px' }); 
    if (cardRef.current) observer.observe(cardRef.current);
    return () => { isMounted = false; observer.disconnect(); };
  }, [cover.path, imgData, rootFolder]);

  const toggleRead = async () => {
    const nextProgress = isCompleted ? 0 : 100;
    const now = Math.floor(Date.now() / 1000);
    setLocalProgress(nextProgress);
    try {
      if (isCompleted) await invoke('mark_as_unread', { rootFolder, comicId: cover.id });
      else await invoke('mark_as_read', { rootFolder, comicId: cover.id, totalPages: cover.totalPages });
      window.dispatchEvent(new CustomEvent('LIBRARY_PATCH', { detail: { comicId: cover.id, patch: { progress: nextProgress, lastPageRead: nextProgress === 100 ? cover.totalPages : 1, lastRead: nextProgress === 100 ? now : cover.lastRead, fresh: nextProgress === 100 ? false : cover.fresh } } }));
    } catch (error) {
      setLocalProgress(cover.progress);
      console.error(error);
    }
  };

  const toggleFav = async () => {
    const enabled = !localFav;
    setLocalFav(enabled);
    try {
      await invoke('toggle_collection', { rootFolder, id: cover.id, isSeries: false, collection: 'Favorites' });
      const collections = enabled
        ? [...(cover.collections || []).filter((c: string) => c !== 'Favorites'), 'Favorites']
        : (cover.collections || []).filter((c: string) => c !== 'Favorites');
      window.dispatchEvent(new CustomEvent('LIBRARY_PATCH', { detail: { comicId: cover.id, patch: { collections } } }));
    } catch (error) {
      setLocalFav(!enabled);
      console.error(error);
    }
  };

  const toggleToRead = async () => {
    const enabled = !localToRead;
    setLocalToRead(enabled);
    try {
      await invoke('toggle_collection', { rootFolder, id: cover.id, isSeries: false, collection: 'To Read' });
      const collections = enabled
        ? [...(cover.collections || []).filter((c: string) => c !== 'To Read'), 'To Read']
        : (cover.collections || []).filter((c: string) => c !== 'To Read');
      window.dispatchEvent(new CustomEvent('LIBRARY_PATCH', { detail: { comicId: cover.id, patch: { collections } } }));
    } catch (error) {
      setLocalToRead(!enabled);
      console.error(error);
    }
  };

  return (
    <article className={`group min-w-0 max-w-full flex flex-col ${className || 'w-36 sm:w-44 md:w-52 shrink-0'}`} style={{ contentVisibility: 'auto', containIntrinsicSize: '336px' }}>
      <button 
        ref={cardRef} 
        onClick={handleCardClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onContextMenu={(e) => { e.preventDefault(); setShowMenu(true); }}
        className="relative block aspect-[2/3] w-full overflow-hidden rounded-xl bg-card text-left shadow-lg ring-1 ring-border/30 transition-all duration-300 md:group-hover:-translate-y-2 md:group-hover:shadow-2xl md:group-hover:ring-primary/60 active:scale-95 cursor-pointer touch-manipulation select-none"
      >
        {imgData ? <img src={imgData} alt={`${cover.issue} cover`} className="size-full object-cover transition-transform duration-500 md:group-hover:scale-105 bg-black" decoding="async" loading="lazy" /> : <div className="size-full bg-white/5 flex items-center justify-center"><BookOpen className="size-8 text-white/20" /></div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-100 md:opacity-80 transition-opacity" />
        
        {localFav && <span className="absolute top-2 right-2 drop-shadow-md text-red-500"><Heart className="size-4 fill-current" /></span>}
        {isCompleted ? <span className="absolute left-2 top-2 rounded-md bg-green-600 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-white shadow-lg">Read</span> : cover.fresh ? <span className="absolute left-2 top-2 rounded-md bg-primary px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-primary-foreground shadow-lg">New</span> : null}
        
        <div className="absolute bottom-3 left-3 right-3"><div className="mt-2 h-1 overflow-hidden rounded-full bg-white/20 backdrop-blur-sm"><div className={`h-full rounded-full ${isCompleted ? 'bg-green-500' : 'bg-primary'}`} style={{ width: `${localProgress}%` }} /></div></div>
      </button>

      <div className="pt-2.5 px-0.5 w-full min-w-0 max-w-full overflow-hidden">
        <h4 
          className="text-xs sm:text-sm font-bold leading-snug text-foreground line-clamp-2 break-words min-w-0 max-w-full"
          title={cover.issue}
        >
          {cover.issue}
        </h4>
        <p className="truncate text-[11px] sm:text-xs text-muted-foreground mt-0.5 min-w-0 max-w-full">
          {cover.totalPages || '?'} Pages
        </p>
      </div>

      {/* Mobile-Native Bottom Action Sheet */}
      <IssueActionSheet
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
        comic={cover}
        imgData={imgData}
        isCompleted={isCompleted}
        isFav={localFav}
        isToRead={localToRead}
        onReadNow={() => onOpenDetail(cover)}
        onToggleRead={toggleRead}
        onToggleFav={toggleFav}
        onToggleToRead={toggleToRead}
        onRemoveFromList={onRemoveFromList}
        removeListLabel={removeListLabel}
      />
    </article>
  );
}
