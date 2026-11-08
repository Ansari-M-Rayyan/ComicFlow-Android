import { Variants } from 'framer-motion';
import {
    ArrowRight,
    FolderOpen
} from 'lucide-react';
import { useMemo } from 'react';
import { ShowcaseCoverMosaic } from '../../components/library/ShowcaseCoverMosaic';

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


export function VaultShowcaseCard({ vault, rootFolder, onOpen }: { vault: any, rootFolder: string, onOpen: () => void }) {
  const issues = useMemo(() => {
    const all = (vault?.series || []).flatMap((series: any) => series.issues || []);
    if (all.length <= 4) return all;

    const selected: any[] = [];
    const pushUnique = (item: any) => {
      if (item && !selected.some(existing => existing.id === item.id)) selected.push(item);
    };

    pushUnique(all.find((i: any) => i.progress > 0 && i.progress < 100));
    pushUnique(all.find((i: any) => i.collections?.includes('Favorites')));
    pushUnique(all.find((i: any) => i.progress === 100));
    pushUnique(all[0]);
    pushUnique(all[all.length - 1]);

    return selected.slice(0, 4);
  }, [vault]);

  const totalIssues = useMemo(() => (vault?.series || []).reduce((acc: number, s: any) => acc + (s.issues || []).length, 0), [vault]);
  const completed = useMemo(() => (vault?.series || []).reduce((acc: number, s: any) => acc + (s.issues || []).filter((i: any) => i.progress === 100).length, 0), [vault]);
  const inProgress = useMemo(() => (vault?.series || []).reduce((acc: number, s: any) => acc + (s.issues || []).filter((i: any) => i.progress > 0 && i.progress < 100).length, 0), [vault]);
  const pct = totalIssues > 0 ? Math.round((completed / totalIssues) * 100) : 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative overflow-hidden rounded-3xl border border-border/50 bg-card text-left shadow-lg transition-all duration-500 hover:-translate-y-1 hover:border-primary/60 hover:shadow-2xl"
    >
      <ShowcaseCoverMosaic items={issues} rootFolder={rootFolder} />
      <div className="relative -mt-5 rounded-t-3xl border-t border-white/10 bg-card/95 p-5 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-primary">
              <FolderOpen className="size-3" /> Vault
            </div>
            <h3 className="min-h-[3.5rem] line-clamp-2 text-xl font-bold leading-7 text-foreground" title={vault?.name || 'Vault'}>{vault?.name || 'Vault'}</h3>
            <p className="mt-1 text-xs font-mono text-muted-foreground">
              {(vault?.series || []).length} series · {totalIssues} issues
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-mono font-bold text-foreground">
            {pct}% read
          </span>
        </div>

        <div className="mt-5 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          <span>{completed} completed</span>
          <span>{inProgress} reading</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>

        <div className="mt-5 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Explore collection</span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground transition-colors group-hover:text-primary">Open Vault <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" /></span>
        </div>
      </div>
    </button>
  );
}

