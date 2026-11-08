import { AnimatePresence, motion, Variants } from 'framer-motion';
import {
    ChevronRight,
    Search,
    X
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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

export function StickyBreadcrumbBar({
  items,
  onNavigate,
  search,
  onSearchChange,
  placeholder
}: {
  items: { label: string, view: string }[];
  onNavigate: (item: any) => void;
  search: string;
  onSearchChange: (value: string) => void;
  placeholder: string;
}) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(Boolean(search));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const next = window.scrollY > 48;
      setIsScrolled(prev => prev === next ? prev : next);
    };

    const handleScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      className={`sticky top-2 z-40 mb-6 sm:mb-8 rounded-2xl border px-3 py-1.5 transition-all duration-300 ${
        isScrolled
          ? 'border-white/10 bg-black/70 shadow-[0_12px_35px_rgba(0,0,0,0.35)] backdrop-blur-2xl'
          : 'border-transparent bg-transparent'
      }`}
    >
      <div className="flex h-9 items-center gap-2 justify-between">
        <AnimatePresence initial={false} mode="wait">
          {isSearchExpanded || search.length > 0 ? (
            <motion.div 
              key="search-box"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-2 flex-1 w-full"
            >
              <div className="relative flex-1 flex items-center">
                <Search className="pointer-events-none absolute left-3 size-4 text-primary" />
                <input
                  ref={inputRef}
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={placeholder}
                  aria-label={placeholder}
                  className="h-9 w-full rounded-xl border border-primary/40 bg-white/[0.08] pl-9 pr-8 text-xs sm:text-sm text-foreground outline-none shadow-sm placeholder:text-muted-foreground focus:border-primary focus:bg-white/[0.12] focus:ring-1 focus:ring-primary/40 transition-all"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      onSearchChange('');
                      inputRef.current?.focus();
                    }}
                    className="absolute right-2.5 p-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  onSearchChange('');
                  setIsSearchExpanded(false);
                }}
                className="shrink-0 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground rounded-lg active:bg-white/10 transition-colors"
              >
                Cancel
              </button>
            </motion.div>
          ) : (
            <div key="breadcrumb-row" className="flex items-center justify-between w-full">
              <nav className="flex min-w-0 flex-1 items-center overflow-hidden" aria-label="Breadcrumb">
                {items.map((item, idx) => (
                  <div key={item.label + idx} className="flex min-w-0 items-center shrink-0 max-w-[60%] sm:max-w-none">
                    {idx > 0 && (
                      <ChevronRight className="mx-1 sm:mx-1.5 size-3.5 shrink-0 text-muted-foreground/45" />
                    )}
                    <button
                      onClick={() => onNavigate(item)}
                      className={`min-w-0 truncate text-xs sm:text-[13px] font-medium leading-none transition-colors ${
                        idx === items.length - 1
                          ? 'pointer-events-none font-semibold text-primary'
                          : 'text-muted-foreground hover:text-foreground active:text-primary'
                      }`}
                      title={item.label}
                    >
                      {item.label}
                    </button>
                  </div>
                ))}
              </nav>

              <button
                type="button"
                onClick={() => {
                  setIsSearchExpanded(true);
                  setTimeout(() => inputRef.current?.focus(), 60);
                }}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center shrink-0"
                aria-label="Search"
              >
                <Search className="size-4" />
              </button>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
