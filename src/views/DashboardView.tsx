import { Variants } from 'framer-motion';
import {
    BookOpen,
    FolderOpen,
    Play,
    Sparkles
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { fetchCoverCached } from '../cache';
import { CoverCard } from '../components/library/CoverCard';
import { VaultShowcaseCard } from '../components/library/VaultShowcaseCard';
import { SlidingTitle } from '../components/ui/SlidingTitle';

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


export function DashboardView({ 
  vaultsData, 
  onViewVault, 
  onOpenReader, 
  onOpenDetail 
}: { 
  vaultsData: any[]; 
  onViewVault: (vault: any) => void; 
  onOpenReader: (comic: any) => void; 
  onOpenDetail: (comic: any) => void; 
  onChangeFolder?: () => void; 
  onJourney?: () => void; 
  onOpenSettings?: () => void; 
}) {
  const [heroImg, setHeroImg] = useState('');
  
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, []);

  const allIssues = useMemo(() => {
    if (!Array.isArray(vaultsData)) return [];
    return vaultsData.flatMap(v => (v.series || []).flatMap((s: any) => s.issues || []));
  }, [vaultsData]);
  
  // Hero section strictly represents comics currently in progress (progress > 0 && progress < 100)
  // When there are no in-progress comics, hero cleanly disappears instead of promoting unread issues.
  const continueComic = useMemo(() => {
    const active = allIssues
      .filter(i => i.progress > 0 && i.progress < 100)
      .sort((a, b) => (b.lastRead || 0) - (a.lastRead || 0));
    return active.length > 0 ? active[0] : null;
  }, [allIssues]);

  useEffect(() => {
    let isMounted = true;
    if (continueComic) {
      const rootFolder = localStorage.getItem('panel_root_folder') || '';
      fetchCoverCached(rootFolder, continueComic.path).then((url) => {
        if (isMounted) setHeroImg(url);
      }).catch(console.error);
    } else {
      setHeroImg('');
    }
    return () => { isMounted = false; };
  }, [continueComic]);

  // Contextual shelf removal state (does not alter comic files or progress)
  const [hiddenRecent, setHiddenRecent] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('cf_hidden_recent') || '[]');
    } catch {
      return [];
    }
  });

  const [hiddenNextUp, setHiddenNextUp] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('cf_hidden_next_up') || '[]');
    } catch {
      return [];
    }
  });

  const handleRemoveRecent = (id: string) => {
    setHiddenRecent(prev => {
      const next = [...prev, id];
      localStorage.setItem('cf_hidden_recent', JSON.stringify(next));
      return next;
    });
  };

  const handleRemoveNextUp = (id: string) => {
    setHiddenNextUp(prev => {
      const next = [...prev, id];
      localStorage.setItem('cf_hidden_next_up', JSON.stringify(next));
      return next;
    });
  };

  // Exclude completed (progress === 100) items and hidden items from "Recently Read"
  const recentlyRead = useMemo(() => {
    return allIssues
      .filter(i => (i.lastRead || 0) > 0 && i.progress < 100 && !hiddenRecent.includes(i.id))
      .sort((a, b) => (b.lastRead || 0) - (a.lastRead || 0))
      .slice(0, 10);
  }, [allIssues, hiddenRecent]);

  // Next Up shelf: Only suggests Issue #N+1 when Issue #N has been 100% completed
  const nextUpIssues = useMemo(() => {
    if (!Array.isArray(vaultsData)) return [];
    const list: { issue: any; lastRead: number }[] = [];

    for (const vault of vaultsData) {
      for (const series of vault.series || []) {
        const issues = series.issues || [];
        if (issues.length === 0) continue;

        let maxCompletedIdx = -1;
        let latestCompletedTime = 0;
        issues.forEach((iss: any, idx: number) => {
          if (iss.progress === 100) {
            maxCompletedIdx = Math.max(maxCompletedIdx, idx);
            if ((iss.lastRead || 0) > latestCompletedTime) {
              latestCompletedTime = iss.lastRead || 0;
            }
          }
        });

        if (maxCompletedIdx !== -1 && maxCompletedIdx + 1 < issues.length) {
          const candidate = issues[maxCompletedIdx + 1];
          if (candidate.progress < 100 && !hiddenNextUp.includes(candidate.id)) {
            list.push({
              issue: candidate,
              lastRead: latestCompletedTime,
            });
          }
        }
      }
    }

    list.sort((a, b) => b.lastRead - a.lastRead);
    return list.map(item => item.issue);
  }, [vaultsData, hiddenNextUp]);

  const favorites = useMemo(() => allIssues.filter(i => i.collections?.includes('Favorites')), [allIssues]);
  const toRead = useMemo(() => allIssues.filter(i => i.collections?.includes('To Read')), [allIssues]);

  return (
    <div className="min-h-screen bg-background pb-32 relative">
      {/* Hero Continue Reading Banner - Edge to Edge */}
      {continueComic && (
        <section 
          style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 1.5rem)' }}
          className="relative w-full overflow-hidden border-b border-border/30 pb-8 sm:pb-10 px-4 sm:px-6 lg:px-8"
        >
          {/* Ambient Glow from Continue Comic */}
          <div className="absolute inset-0 size-full object-cover opacity-35 blur-3xl bg-black scale-125 pointer-events-none">
            {heroImg && <img src={heroImg} className="size-full object-cover" alt="Hero background" />}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent pointer-events-none" />

          <div className="relative z-10 max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-center md:justify-start gap-6 md:gap-10 text-center md:text-left">
            {/* Comic Cover with Ambient Glow */}
            <div 
              onClick={() => onOpenReader(continueComic)}
              className="z-10 w-44 sm:w-52 md:w-56 lg:w-64 shrink-0 cursor-pointer group"
            >
              <div className="relative aspect-[2/3] w-full rounded-2xl shadow-[0_20px_50px_-10px_rgba(0,0,0,0.85)] ring-1 ring-white/20 transition-all duration-300 group-hover:scale-105 active:scale-95 overflow-hidden bg-black/50">
                {heroImg ? (
                  <img src={heroImg} alt={continueComic.issue} className="size-full object-cover" />
                ) : (
                  <div className="size-full animate-pulse flex items-center justify-center">
                    <BookOpen className="size-10 text-white/20" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-3">
                  <span className="text-xs font-bold text-white bg-black/60 px-3 py-1 rounded-full backdrop-blur-sm">Tap to read</span>
                </div>
              </div>
            </div>

            {/* Details and Actions */}
            <div className="w-full max-w-md md:max-w-xl">
              <div className="mb-2 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
                <span className="size-2 rounded-full bg-primary animate-pulse" />
                {continueComic.progress === 100 ? 'Read Again' : 'Continue Reading'}
              </div>
              <SlidingTitle text={continueComic.issue} className="mb-1 py-1 text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground" duration={4200} />
              <h2 className="text-sm sm:text-base text-muted-foreground font-normal mb-5 truncate">{continueComic.title} • {continueComic.progress}% Complete</h2>
              <button onClick={() => onOpenReader(continueComic)} className="inline-flex items-center justify-center gap-3 rounded-full bg-primary text-primary-foreground font-bold px-8 py-3.5 shadow-xl shadow-primary/25 hover:scale-[1.02] active:scale-95 transition-all w-full sm:w-auto">
                <Play className="size-5 fill-current" /> {continueComic.progress > 0 && continueComic.progress < 100 ? 'Resume Reading' : 'Read Again'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Vaults Section */}
      <section className={`px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto ${continueComic ? 'mt-8 sm:mt-10' : 'pt-[max(env(safe-area-inset-top,0px),1.5rem)] mt-2'}`}>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-5 flex items-center gap-2.5"><FolderOpen className="text-primary size-5 sm:size-6" /> Your Vaults</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {vaultsData.map((vault: any) => (
            <VaultShowcaseCard
              key={vault.id}
              vault={vault}
              rootFolder={localStorage.getItem('panel_root_folder') || ''}
              onOpen={() => onViewVault(vault)}
            />
          ))}
        </div>
      </section>

      {/* Recently Read Shelf */}
      {recentlyRead.length > 0 && (
        <section className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto mt-8 sm:mt-10">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-4">Recently Read</h2>
          <div className="flex gap-5 sm:gap-6 overflow-x-auto pb-4 px-1 [&::-webkit-scrollbar]:hidden">
            {recentlyRead.map((issue: any) => (
              <div key={issue.id} className="snap-start shrink-0 w-36 sm:w-44 md:w-48 min-w-0">
                <CoverCard
                  rootFolder={localStorage.getItem('panel_root_folder')||''}
                  cover={issue}
                  onOpenDetail={onOpenDetail}
                  onRemoveFromList={() => handleRemoveRecent(issue.id)}
                  removeListLabel="Remove from Recently Read"
                  className="w-full"
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Next Up Shelf */}
      {nextUpIssues.length > 0 && (
        <section className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto mt-8 sm:mt-10">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-4 flex items-center gap-2">
            <Sparkles className="size-5 text-primary" /> Next Up
          </h2>
          <div className="flex gap-5 sm:gap-6 overflow-x-auto pb-4 px-1 [&::-webkit-scrollbar]:hidden">
            {nextUpIssues.map((issue: any) => (
              <div key={issue.id} className="snap-start shrink-0 w-36 sm:w-44 md:w-48 min-w-0">
                <CoverCard
                  rootFolder={localStorage.getItem('panel_root_folder')||''}
                  cover={issue}
                  onOpenDetail={onOpenDetail}
                  onRemoveFromList={() => handleRemoveNextUp(issue.id)}
                  removeListLabel="Remove from Next Up"
                  className="w-full"
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Favorites Shelf */}
      {favorites.length > 0 && (
        <section className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto mt-8 sm:mt-10">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-4">Favorites</h2>
          <div className="flex gap-5 sm:gap-6 overflow-x-auto pb-4 px-1 [&::-webkit-scrollbar]:hidden">
            {favorites.map((issue: any) => (
              <div key={issue.id} className="snap-start shrink-0 w-36 sm:w-44 md:w-48 min-w-0">
                <CoverCard 
                  rootFolder={localStorage.getItem('panel_root_folder')||''} 
                  cover={issue} 
                  onOpenDetail={onOpenDetail} 
                  className="w-full"
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* To Read Shelf */}
      {toRead.length > 0 && (
        <section className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto mt-8 sm:mt-10">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-4">To Read</h2>
          <div className="flex gap-5 sm:gap-6 overflow-x-auto pb-4 px-1 [&::-webkit-scrollbar]:hidden">
            {toRead.map((issue: any) => (
              <div key={issue.id} className="snap-start shrink-0 w-36 sm:w-44 md:w-48 min-w-0">
                <CoverCard 
                  rootFolder={localStorage.getItem('panel_root_folder')||''} 
                  cover={issue} 
                  onOpenDetail={onOpenDetail} 
                  className="w-full"
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Bottom Spacing */}
      <div className="pb-16" />
    </div>
  );
}
