import { Variants } from 'framer-motion';
import {
    BookMarked,
    FolderOutput,
    Search,
    Settings2
} from 'lucide-react';
import appLogo from '../../assets/logo.png';

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


export function TopNav({ onChangeFolder, searchQuery, onSearchChange, onJourneyClick, onOpenSettings }: { onChangeFolder?: () => void, searchQuery?: string, onSearchChange?: (s: string) => void, onJourneyClick?: () => void, onOpenSettings?: () => void }) {
  return (
    <nav className="fixed inset-x-0 top-0 z-50 hidden md:flex h-20 items-center justify-between bg-background/80 px-8 pb-4 pt-6 backdrop-blur-xl border-b border-border/20 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center overflow-hidden"><img src={appLogo} alt="ComicFlow Logo" className="size-full object-contain" /></div>
        <span className="font-mono text-xl font-bold tracking-[0.1em] text-foreground hidden sm:block">ComicFlow<span className="text-primary">.</span></span>
      </div>
      <div className="flex items-center gap-4">
        {onSearchChange !== undefined && (
          <div className="group relative hidden md:block w-72">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-colors" />
            <input aria-label="Search library" placeholder="Search vaults, series, issues..." value={searchQuery || ''} onChange={(e) => onSearchChange(e.target.value)} className="h-10 w-full rounded-full border border-border/50 bg-black/40 pl-10 pr-4 text-sm text-foreground outline-none backdrop-blur-md focus:border-primary" />
          </div>
        )}
        {onJourneyClick && (
          <button onClick={onJourneyClick} title="Reading Journey" className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm font-medium text-white shadow-lg"><BookMarked className="size-4" /><span className="hidden sm:block">Journey</span></button>
        )}
        {onChangeFolder && (
          <button onClick={onChangeFolder} title="Change Vault Folder" className="flex items-center justify-center p-2.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-white shadow-lg"><FolderOutput className="size-4" /></button>
        )}
        {onOpenSettings && (
          <button onClick={onOpenSettings} title="Settings" className="flex items-center justify-center p-2.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-white shadow-lg"><Settings2 className="size-4" /></button>
        )}

      </div>
    </nav>
  );
}

