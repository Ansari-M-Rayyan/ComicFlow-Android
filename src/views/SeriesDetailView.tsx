import { motion, Variants } from 'framer-motion';
import {
    Book,
    BookOpen,
    ChevronDown, ChevronUp,
    Clock,
    FolderSearch,
    Pencil,
    Sparkles,
    WifiOff
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CoverCard } from '../components/library/CoverCard';
import { SeriesMatchModal } from '../components/modals/SeriesMatchModal';
import { StickyBreadcrumbBar } from '../components/ui/StickyBreadcrumbBar';
import { isComicVineOnline } from '../utils';
import { cleanComicDescription } from '../utils/comicMatcher';

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

export function SeriesDetailView({ series, vaultName, rootFolder, onBack, onBackHome, onOpenDetail, onMatchSeries }: { series: any, vaultName: string, rootFolder: string, onBack: () => void, onBackHome: () => void, onOpenDetail: (comic: any) => void, onMatchSeries?: (volume: any) => void }) {
  const [search, setSearch] = useState('');
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [expandedDesc, setExpandedDesc] = useState(false);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, []);

  const isOnline = isComicVineOnline();
  const volume = series?.comicVineVolume || series?.comic_vine_volume;
  const rawDesc = volume?.description || volume?.deck;
  const cleanDesc = useMemo(() => cleanComicDescription(rawDesc || ''), [rawDesc]);

  const issuesList = series?.issues || [];
  const filteredIssues = issuesList.filter((i: any) => (i.issue || '').toLowerCase().includes(search.toLowerCase()));
  
  const totalIssues = issuesList.length;
  const completed = issuesList.filter((i: any) => i.progress === 100).length;
  const inProgress = issuesList.filter((i: any) => i.progress > 0 && i.progress < 100).length;
  const unread = issuesList.filter((i: any) => i.progress === 0).length;
  const totalTime = issuesList.reduce((acc: number, i: any) => acc + (i.readingTime || 0), 0);

  const descRef = useRef<HTMLDivElement>(null);
  const [canExpand, setCanExpand] = useState(false);

  useEffect(() => {
    if (descRef.current) {
      setCanExpand(descRef.current.scrollHeight > descRef.current.clientHeight + 6);
    }
  }, [cleanDesc]);

  const handleMatch = (vol: any) => {
    setShowMatchModal(false);
    if (onMatchSeries) onMatchSeries(vol);
  };

  return (
    <div 
      style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 1.5rem)' }}
      className="min-h-screen bg-background pb-32 px-4 sm:px-6 lg:px-8"
    >
      <div className="max-w-7xl mx-auto w-full">
        {showMatchModal && (
          <SeriesMatchModal
            seriesTitle={series?.name || ''}
            rootFolder={rootFolder}
            onClose={() => setShowMatchModal(false)}
            onMatch={handleMatch}
          />
        )}

        <StickyBreadcrumbBar
          items={[{ label: 'Home', view: 'library' }, { label: vaultName, view: 'vault-detail' }, { label: series?.name || 'Series', view: 'series' }]}
          onNavigate={(item) => {
            if (item.view === 'library') onBackHome();
            else if (item.view === 'vault-detail') onBack();
          }}
          search={search}
          onSearchChange={setSearch}
          placeholder="Search issue #..."
        />

        <div className="mb-8 border-b border-border/30 pb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                  {series?.name || 'Series'}
                </h1>
                {volume ? (
                  <div className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/20 text-primary px-2.5 py-1 rounded-xl text-xs font-semibold">
                    <Sparkles className="size-3" />
                    <span>Linked: <strong className="font-bold text-foreground">{volume.name}</strong> {volume.start_year ? `(${volume.start_year})` : ''}</span>
                    <button onClick={() => setShowMatchModal(true)} title="Change ComicVine link" className="p-0.5 hover:bg-white/10 rounded-md transition-colors text-muted-foreground hover:text-white">
                      <Pencil className="size-3" />
                    </button>
                  </div>
                ) : isOnline ? (
                  <button onClick={() => setShowMatchModal(true)} className="inline-flex items-center gap-1.5 bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary px-3 py-1 rounded-xl text-xs font-bold transition-all hover:scale-[1.02] active:scale-95 shadow-sm">
                    <FolderSearch className="size-3" /> Link ComicVine
                  </button>
                ) : (
                  <div className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 text-muted-foreground/70 px-2.5 py-1 rounded-xl text-xs font-medium">
                    <WifiOff className="size-3" /> Offline
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 text-xs font-mono tracking-wide text-muted-foreground">
                <span className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5"><Book className="size-3.5 text-white" /> {totalIssues} issues</span>
                <span className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5"><Clock className="size-3.5 text-blue-400" /> {formatTime(totalTime)} total</span>
              </div>
            </div>

            <div className="flex gap-3 text-xs font-semibold shrink-0">
               <div className="flex flex-col items-center bg-green-500/10 border border-green-500/20 text-green-500 px-3.5 py-1.5 rounded-xl"><span className="text-lg font-bold">{completed}</span><span className="text-[9px] uppercase tracking-wider opacity-70">Completed</span></div>
               <div className="flex flex-col items-center bg-primary/10 border border-primary/20 text-primary px-3.5 py-1.5 rounded-xl"><span className="text-lg font-bold">{inProgress}</span><span className="text-[9px] uppercase tracking-wider opacity-70">Reading</span></div>
               <div className="flex flex-col items-center bg-white/5 border border-white/10 text-muted-foreground px-3.5 py-1.5 rounded-xl"><span className="text-lg font-bold">{unread}</span><span className="text-[9px] uppercase tracking-wider opacity-70">Unread</span></div>
            </div>
          </div>

          {cleanDesc && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }} 
              className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 relative mt-3"
            >
              <h4 className="text-[10px] font-mono uppercase tracking-widest text-primary/80 mb-1.5 flex items-center gap-1.5">
                <BookOpen className="size-3" /> Series Overview
              </h4>
              <div 
                ref={descRef}
                className={`prose prose-sm prose-invert max-w-none text-muted-foreground/85 leading-relaxed text-xs sm:text-sm ${expandedDesc ? '' : 'line-clamp-3'}`}
                dangerouslySetInnerHTML={{ __html: cleanDesc }}
              />
              {canExpand && (
                <button onClick={() => setExpandedDesc(!expandedDesc)} className="mt-2 text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
                  {expandedDesc ? <>Show Less <ChevronUp className="size-3.5" /></> : <>Read More <ChevronDown className="size-3.5" /></>}
                </button>
              )}
            </motion.div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
          {filteredIssues.map((issue: any) => (
            <div key={issue.id} className="w-full min-w-0 max-w-full overflow-hidden">
              <CoverCard 
                rootFolder={rootFolder} 
                cover={issue} 
                onOpenDetail={onOpenDetail} 
                className="w-full"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
