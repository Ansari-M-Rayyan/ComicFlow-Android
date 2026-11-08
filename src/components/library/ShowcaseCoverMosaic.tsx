import { Variants } from 'framer-motion';
import {
    BookOpen
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { fetchCoverCached } from '../../cache';

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


export function ShowcaseCoverMosaic({ items, rootFolder }: { items: any[], rootFolder: string }) {
  const [loadedCovers, setLoadedCovers] = useState<Record<string, string>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      const entries = await Promise.all((items || []).slice(0, 4).map(async (item: any) => {
        try {
          const src = await fetchCoverCached(rootFolder, item.path);
          return [item.id || item.path, src] as const;
        } catch {
          return null;
        }
      }));
      if (!isMounted) return;
      setLoadedCovers(prev => {
        const next = { ...prev };
        entries.forEach(entry => { if (entry) next[entry[0]] = entry[1]; });
        return next;
      });
    };

    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      load();
      return () => { isMounted = false; };
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        load();
        observer.disconnect();
      }
    }, { rootMargin: '240px' });
    observer.observe(node);

    return () => {
      isMounted = false;
      observer.disconnect();
    };
  }, [items, rootFolder]);

  const positions = [
    'left-[6%] top-4 -rotate-8',
    'left-[24%] top-1 rotate-[-2deg]',
    'left-[44%] top-3 rotate-[3deg]',
    'left-[64%] top-1 rotate-[8deg]'
  ];

  return (
    <div ref={containerRef} className="relative h-48 sm:h-56 overflow-hidden rounded-2xl bg-black/20">
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-black/20" />
      {(items || []).slice(0, 4).map((item: any, index: number) => {
        const key = item.id || item.path;
        const src = loadedCovers[key];
        return (
          <div
            key={key}
            className={`absolute ${positions[index]} w-[27%] aspect-[2/3] overflow-hidden rounded-xl border border-white/15 bg-card shadow-[0_18px_35px_-14px_rgba(0,0,0,0.85)] transition-transform duration-500 group-hover:translate-y-[-3px]`}
            style={{ zIndex: index + 1 }}
          >
            {src ? (
              <img src={src} alt="" className="size-full object-cover" decoding="async" loading="lazy" />
            ) : (
              <div className="size-full bg-white/5 flex items-center justify-center">
                <BookOpen className="size-7 text-white/15" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-white/5" />
          </div>
        );
      })}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
    </div>
  );
}

