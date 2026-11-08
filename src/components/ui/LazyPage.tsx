import { Variants } from 'framer-motion';
import {
    RotateCcw
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { fetchPageCached, fetchThumbnailCached, getPageCache, getThumbnailCache } from '../../cache';

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
  Fade: { 
    initial: { opacity: 0 }, 
    animate: { opacity: 1, transition: { duration: 0.25, ease: 'easeOut' } }, 
    exit: { opacity: 0, transition: { duration: 0.15 } } 
  },
  Slide: { 
    initial: { x: 30, opacity: 0 }, 
    animate: { x: 0, opacity: 1, transition: { duration: 0.25, ease: 'easeOut' } }, 
    exit: { x: -30, opacity: 0, transition: { duration: 0.15 } } 
  },
  Cinematic: { 
    initial: { scale: 0.96, opacity: 0 }, 
    animate: { scale: 1, opacity: 1, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } }, 
    exit: { scale: 1.03, opacity: 0, transition: { duration: 0.2 } } 
  }
};


export function LazyPage({ 
  comicPath, 
  pageNum, 
  className, 
  onVisible, 
  rootMargin = '-40% 0px -40% 0px',
  thumbnail = false,
  rootFolder = '',
  immediate = false
}: { 
  comicPath: string, 
  pageNum: number, 
  className?: string, 
  onVisible?: (p: number) => void, 
  rootMargin?: string,
  thumbnail?: boolean,
  rootFolder?: string,
  immediate?: boolean
}) {
  const [img, setImg] = useState('');
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const loadData = () => {
    if (thumbnail) {
      fetchThumbnailCached(rootFolder, comicPath, pageNum).then(dataUri => {
        setImg(dataUri);
        setError(false);
      }).catch(() => {
        setError(true);
      });
    } else {
      fetchPageCached(comicPath, pageNum).then(res => {
        setImg(res.img);
        setError(false);
      }).catch(() => {
        setError(true);
      });
    }
  };

  useEffect(() => { 
    if (thumbnail) {
      const cached = getThumbnailCache(comicPath, pageNum);
      if (cached) {
        setImg(cached);
        setError(false);
        return;
      }
    } else {
      const cached = getPageCache(`${comicPath}-${pageNum}`);
      if (cached?.img) { 
        setImg(cached.img); 
        setError(false); 
        return;
      }
    }
    setImg('');
    setError(false);

    if (immediate || rootMargin === '0px') {
      loadData();
    }
  }, [comicPath, pageNum, thumbnail, rootFolder, immediate, rootMargin]);

  useEffect(() => {
    let isMounted = true;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && onVisible) onVisible(pageNum);
      if (entry.isIntersecting && !img && !error) {
        if (thumbnail) {
          fetchThumbnailCached(rootFolder, comicPath, pageNum).then(dataUri => {
            if (isMounted) {
              setImg(dataUri);
              setError(false);
            }
          }).catch(() => {
            if (isMounted) setError(true);
          });
        } else {
          fetchPageCached(comicPath, pageNum).then(res => {
            if (isMounted) {
              setImg(res.img);
              setError(false);
            }
          }).catch(() => {
            if (isMounted) setError(true);
          });
        }
      }
    }, { rootMargin, threshold: 0 });

    if (ref.current) observer.observe(ref.current);
    return () => { isMounted = false; observer.disconnect(); };
  }, [img, comicPath, pageNum, onVisible, rootMargin, error, thumbnail, rootFolder]);

  return (
    <div ref={ref} className={className}>
      {img ? (
        <img 
          src={img} 
          className="size-full object-contain block m-0 p-0 select-none will-change-transform" 
          alt={`Page ${pageNum}`} 
          loading="lazy"
          decoding="async"
        />
      ) : error ? (
        <button 
          onClick={(e) => { e.stopPropagation(); setError(false); loadData(); }}
          className="size-full min-h-[60px] flex flex-col items-center justify-center bg-red-950/20 text-red-400 font-mono text-xs hover:bg-red-950/30 transition-colors pointer-events-auto p-2 rounded-xl"
          title="Tap to retry loading page"
        >
          <RotateCcw className="size-4 mb-1 animate-pulse" />
          <span>Retry</span>
        </button>
      ) : (
        <div className="size-full min-h-[60px] animate-pulse bg-white/5 flex items-center justify-center font-mono text-muted-foreground text-xs">
          {pageNum}
        </div>
      )}
    </div>
  );
}
