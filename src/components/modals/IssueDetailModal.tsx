import { invoke } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';
import {
    Book,
    BookMarked,
    BookmarkPlus,
    CheckCircle,
    Heart,
    Link2,
    PenTool,
    Play,
    Users,
    X
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { fetchCoverCached } from '../../cache';
import { SeriesMatchModal } from '../../components/modals/SeriesMatchModal';
import { isComicVineOnline } from '../../utils';
import { cleanComicDescription, parseComicFilename } from '../../utils/comicMatcher';

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

export function IssueDetailModal({ comic, vaultsData, rootFolder, onClose, onRead, onUpdate }: { comic: any, vaultsData: any[], rootFolder: string, onClose: () => void, onRead: () => void, onUpdate: (detail: { comicId: string, patch: any }) => void }) {
  const [imgData, setImgData] = useState('');
  const [localProgress, setLocalProgress] = useState(comic.progress);
  const [localCollections, setLocalCollections] = useState<string[]>(comic.collections || []);
  const [cvMetadata, setCvMetadata] = useState<any>(comic.comicVineMetadata || comic.comic_vine_metadata || null);
  const [cvLoading, setCvLoading] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [showAllCharacters, setShowAllCharacters] = useState(false);

  const series = vaultsData.flatMap((v: any) => v.series || []).find((s: any) => s.name === comic.title);
  const volumeId = (series?.comicVineVolume || series?.comic_vine_volume)?.id;

  useEffect(() => { 
    fetchCoverCached(rootFolder, comic.path).then(res => setImgData(res)).catch(console.error); 
  }, [comic.path, rootFolder]);

  const fetchCv = async (forceVolume?: any) => {
    if (!isComicVineOnline()) return;
    const apiKey = localStorage.getItem('comicvine_api_key');
    if (!apiKey) return;

    setCvLoading(true);
    try {
      const { issue: issueNum } = parseComicFilename(comic.issue, comic.title);
      let targetVolumeId = forceVolume?.id || volumeId;

      if (!targetVolumeId) {
        setCvLoading(false);
        return;
      }

      const issueRes: any = await invoke('fetch_comicvine', {
        apiKey,
        endpoint: 'issues',
        queryParams: { 
          filter: `volume:${targetVolumeId},issue_number:${issueNum}`, 
          limit: '1',
          field_list: 'id,name,issue_number,deck,description,cover_date,character_credits,person_credits,story_arc_credits,image,api_detail_url'
        }
      });
      const parsedIssue = JSON.parse(issueRes);
      if (!parsedIssue.results || parsedIssue.results.length === 0) {
        setCvMetadata({ error: true, message: `No details found for Issue #${issueNum} in this volume.` });
        return;
      }
      
      let metadata = parsedIssue.results[0];

      // Fallback: If character_credits or person_credits were not returned by list endpoint, fetch issue directly
      if (metadata?.id && (!metadata.character_credits || metadata.character_credits.length === 0 || !metadata.person_credits || metadata.person_credits.length === 0)) {
        try {
          const detailRes: any = await invoke('fetch_comicvine', {
            apiKey,
            endpoint: `issue/4000-${metadata.id}`,
            queryParams: {
              field_list: 'id,name,issue_number,deck,description,cover_date,character_credits,person_credits,story_arc_credits,image'
            }
          });
          const detailParsed = JSON.parse(detailRes);
          if (detailParsed.results) {
            metadata = { ...metadata, ...detailParsed.results };
          }
        } catch (detailErr) {
          console.warn("Single issue detail fetch fallback failed", detailErr);
        }
      }

      setCvMetadata(metadata);
      
      await invoke('save_comicvine_metadata', { rootFolder, comicId: comic.id, metadata });
      onUpdate({ comicId: comic.id, patch: { comicVineMetadata: metadata, comic_vine_metadata: metadata } });
    } catch (e) {
      console.error("ComicVine Error", e);
    } finally {
      setCvLoading(false);
    }
  };

  useEffect(() => {
    if (comic.comicVineMetadata || comic.comic_vine_metadata) {
      setCvMetadata(comic.comicVineMetadata || comic.comic_vine_metadata);
    } else if (volumeId && isComicVineOnline()) {
      fetchCv();
    } else if (!volumeId && !comic.comicVineMetadata && !comic.comic_vine_metadata) {
      invoke('read_embedded_comic_info', { filePath: comic.path })
        .then((xmlStr: any) => {
          if (xmlStr) {
            const parsed = parseComicInfoXml(xmlStr);
            if (parsed.name || parsed.description || parsed.person_credits.length > 0) {
              setCvMetadata(parsed);
            }
          }
        })
        .catch(console.error);
    }
  }, [comic.id, volumeId, comic.path]);

  const handleMatchSeries = async (vol: any) => {
    setShowMatchModal(false);
    if (!series) return;
    try {
      await invoke('save_series_volume', { rootFolder, seriesName: series.name, volumeData: vol });
      series.comicVineVolume = vol;
      series.comic_vine_volume = vol;
      fetchCv(vol);
    } catch (e) { console.error(e); }
  };

  const creators = useMemo(() => {
    if (!cvMetadata?.person_credits || !Array.isArray(cvMetadata.person_credits)) return null;
    const writers: string[] = [];
    const artists: string[] = [];
    const covers: string[] = [];

    cvMetadata.person_credits.forEach((p: any) => {
      const role = (p.role || '').toLowerCase();
      if (role.includes('writer') || role.includes('script') || role.includes('story') || role.includes('plot')) {
        if (!writers.includes(p.name)) writers.push(p.name);
      } else if (role.includes('penciller') || role.includes('artist') || role.includes('pencils') || role.includes('art') || role.includes('illustrator') || role.includes('inker')) {
        if (!artists.includes(p.name)) artists.push(p.name);
      } else if (role.includes('cover')) {
        if (!covers.includes(p.name)) covers.push(p.name);
      }
    });

    if (writers.length === 0 && artists.length === 0 && covers.length === 0) {
      if (cvMetadata.person_credits.length > 0) {
        return { all: cvMetadata.person_credits.slice(0, 4).map((p: any) => p.name) };
      }
      return null;
    }

    return { writers, artists, covers };
  }, [cvMetadata]);

  const characters = Array.isArray(cvMetadata?.character_credits) ? cvMetadata.character_credits : [];
  const visibleCharacters = showAllCharacters ? characters : characters.slice(0, 8);
  const storyArcs = Array.isArray(cvMetadata?.story_arc_credits) ? cvMetadata.story_arc_credits : [];
  const cleanDesc = useMemo(() => cvMetadata?.description ? cleanComicDescription(cvMetadata.description) : null, [cvMetadata]);
  const hasStory = cleanDesc || cvMetadata?.deck;

  const toggleCollection = async (collection: string) => {
    const enabled = !localCollections.includes(collection);
    setLocalCollections(prev => enabled ? [...prev, collection] : prev.filter(c => c !== collection));
    try {
      await invoke('toggle_collection', { rootFolder, id: comic.id, isSeries: false, collection });
      const nextCollections = enabled
        ? [...localCollections.filter(c => c !== collection), collection]
        : localCollections.filter(c => c !== collection);
      onUpdate({ comicId: comic.id, patch: { collections: nextCollections } });
    } catch (error) {
      setLocalCollections(comic.collections || []);
      console.error(error);
    }
  };

  const handleToggleRead = async () => {
    const isCompleted = localProgress === 100;
    const nextProgress = isCompleted ? 0 : 100;
    const now = Math.floor(Date.now() / 1000);
    setLocalProgress(nextProgress);
    try {
      if (isCompleted) await invoke('mark_as_unread', { rootFolder, comicId: comic.id });
      else await invoke('mark_as_read', { rootFolder, comicId: comic.id, totalPages: comic.totalPages });
      onUpdate({ comicId: comic.id, patch: { progress: nextProgress, lastPageRead: nextProgress === 100 ? comic.totalPages : 1, lastRead: nextProgress === 100 ? now : comic.lastRead, fresh: nextProgress === 100 ? false : comic.fresh } });
    } catch (error) {
      setLocalProgress(comic.progress);
      console.error(error);
    }
  };

  const isFav = localCollections.includes('Favorites');
  const isToRead = localCollections.includes('To Read');

  return (
    <>
    {showMatchModal && <SeriesMatchModal seriesTitle={comic.title} rootFolder={rootFolder} onClose={() => setShowMatchModal(false)} onMatch={handleMatchSeries} />}
    <div className="fixed inset-0 z-[80] flex items-end justify-center md:items-center p-0 md:p-6" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/85"
      />
      <motion.div
        initial={{ y: 220, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 220, opacity: 0 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        style={{ willChange: 'transform, opacity', transform: 'translateZ(0)' }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-5xl bg-card rounded-t-3xl md:rounded-3xl shadow-2xl border border-white/10 overflow-hidden flex flex-col md:flex-row h-[90vh] max-h-[92vh] md:max-h-[85vh]"
      >
        <button onClick={onClose} className="absolute top-3 right-3 p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white/90 transition-colors z-30 shadow-lg touch-manipulation min-w-[40px] min-h-[40px] flex items-center justify-center"><X className="size-5" /></button>
        
        <div className="w-full md:w-2/5 h-44 sm:h-56 md:h-auto bg-black/60 relative overflow-hidden flex items-center justify-center shrink-0">
          {imgData ? <img src={imgData} className="w-full h-full object-cover opacity-25 absolute inset-0 blur-2xl scale-125" alt="" /> : null}
          <div className="relative z-10 p-3 md:p-8 flex items-center justify-center h-full">
             {imgData ? <img src={imgData} className="max-h-36 sm:max-h-48 md:max-h-[380px] w-auto max-w-full rounded-xl shadow-2xl ring-1 ring-white/20 object-contain" alt="Cover" /> : <div className="w-28 sm:w-36 md:w-52 aspect-[2/3] animate-pulse bg-white/5 rounded-xl" />}
          </div>
        </div>
        <div className="w-full md:w-3/5 flex flex-col flex-1 min-h-0 relative bg-card z-10">
          <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-8 md:p-10 pb-6 [&::-webkit-scrollbar]:hidden relative">
          
          <div className="flex items-center gap-2 mb-2 pr-10">
             <h3 className="line-clamp-1 font-mono text-xs leading-5 uppercase tracking-[0.2em] text-primary">
               {comic.title} {(series?.comicVineVolume || series?.comic_vine_volume)?.start_year ? `(${(series?.comicVineVolume || series?.comic_vine_volume).start_year})` : ''}
             </h3>
             {volumeId ? (
               <button onClick={() => setShowMatchModal(true)} title="Series linked to ComicVine. Click to change." className="p-1 rounded text-primary/70 hover:text-primary hover:bg-white/5 transition-colors">
                 <Link2 className="size-3.5" />
               </button>
             ) : (
               <span className="text-[10px] font-mono text-muted-foreground/50 tracking-wide uppercase">(Unlinked)</span>
             )}
          </div>
          
          <h2 className="mb-3 text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-foreground leading-snug break-words">
            {cvMetadata?.name && !cvMetadata.error ? cvMetadata.name : comic.issue}
          </h2>

          {cvLoading ? (
            <div className="animate-pulse flex flex-col gap-6 mt-2">
              <div className="flex gap-2 mb-2">
                <div className="h-6 w-20 bg-white/5 rounded-full"></div>
                <div className="h-6 w-24 bg-white/5 rounded-full"></div>
              </div>
              <div className="h-28 bg-white/5 rounded-2xl w-full"></div>
              <div className="h-20 bg-white/5 rounded-2xl w-full"></div>
            </div>
          ) : (
            <motion.div variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 }}}} initial="hidden" animate="show" className="flex flex-col">
              
              {cvMetadata && !cvMetadata.error && (
                <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { ease: 'easeOut', duration: 0.25 }}}} className="mb-5 flex flex-wrap items-center gap-2">
                  {cvMetadata.cover_date && <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-muted-foreground">{cvMetadata.cover_date}</span>}
                  {cvMetadata.issue_number && <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-muted-foreground">Issue #{cvMetadata.issue_number}</span>}
                </motion.div>
              )}

              {cvMetadata?.error && (
                <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { ease: 'easeOut', duration: 0.25 }}}} className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
                  <div className="flex items-start gap-2.5 text-xs text-amber-200/90 leading-relaxed break-words">
                    <Book className="size-4 opacity-70 shrink-0 mt-0.5" />
                    <span className="flex-1 break-words">{cvMetadata.message}</span>
                  </div>
                </motion.div>
              )}

              {hasStory && !cvMetadata?.error && (
                <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { ease: 'easeOut', duration: 0.25 }}}} className="mb-6 bg-white/[0.03] border border-white/10 rounded-2xl p-5 shadow-sm">
                  <h4 className="text-[10px] font-mono uppercase tracking-widest text-primary/80 mb-2 flex items-center gap-2">⚡ Overview</h4>
                  <div className="max-h-36 overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-track]:bg-transparent">
                    {cvMetadata.deck && (
                      <p className="text-sm font-bold text-foreground mb-3 leading-relaxed break-words">{cvMetadata.deck}</p>
                    )}
                    {cleanDesc && (
                      <div 
                        className="text-sm leading-relaxed text-foreground/90 font-medium prose prose-invert max-w-none prose-p:mb-3 prose-a:text-primary prose-a:no-underline break-words"
                        dangerouslySetInnerHTML={{ __html: cleanDesc }}
                      />
                    )}
                  </div>
                </motion.div>
              )}

              {creators && (
                <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { ease: 'easeOut', duration: 0.25 }}}} className="mb-6 bg-white/[0.02] border border-white/5 rounded-2xl p-5">
                  <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/80 mb-3 flex items-center gap-2">
                    <PenTool className="size-3.5 text-primary" /> Creators
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    {creators.writers && creators.writers.length > 0 && (
                      <div>
                        <span className="text-[10px] font-mono uppercase text-muted-foreground/70 block mb-1">Writer</span>
                        <span className="font-semibold text-foreground leading-snug">{creators.writers.join(', ')}</span>
                      </div>
                    )}
                    {creators.artists && creators.artists.length > 0 && (
                      <div>
                        <span className="text-[10px] font-mono uppercase text-muted-foreground/70 block mb-1">Art / Pencils</span>
                        <span className="font-semibold text-foreground leading-snug">{creators.artists.join(', ')}</span>
                      </div>
                    )}
                    {creators.covers && creators.covers.length > 0 && (
                      <div>
                        <span className="text-[10px] font-mono uppercase text-muted-foreground/70 block mb-1">Cover</span>
                        <span className="font-semibold text-foreground leading-snug">{creators.covers.join(', ')}</span>
                      </div>
                    )}
                    {creators.all && creators.all.length > 0 && (
                      <div className="col-span-full">
                        <span className="font-semibold text-foreground leading-snug">{creators.all.join(', ')}</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {characters.length > 0 && (
                <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { ease: 'easeOut', duration: 0.25 }}}} className="mb-6">
                  <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/80 mb-2.5 flex items-center gap-2">
                    <Users className="size-3.5 text-primary" /> Characters Appearing ({characters.length})
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {visibleCharacters.map((char: any) => (
                      <span key={char.id || char.name} className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-xs text-foreground/85 font-medium">
                        {char.name}
                      </span>
                    ))}
                    {characters.length > 8 && (
                      <button
                        onClick={() => setShowAllCharacters(!showAllCharacters)}
                        className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-xs text-primary font-semibold transition-colors"
                      >
                        {showAllCharacters ? 'Show Less' : `+${characters.length - 8} more`}
                      </button>
                    )}
                  </div>
                </motion.div>
              )}

              {storyArcs.length > 0 && (
                <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { ease: 'easeOut', duration: 0.25 }}}} className="mb-8">
                  <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/80 mb-2 flex items-center gap-2">
                    <BookMarked className="size-3.5 text-primary" /> Story Arc{storyArcs.length > 1 ? 's' : ''}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {storyArcs.map((arc: any) => (
                      <span key={arc.id || arc.name} className="px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-xs font-semibold text-primary flex items-center gap-2">
                        <BookMarked className="size-3" /> {arc.name}
                      </span>
                    ))}
                  </div>
                </motion.div>
              )}

              <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { ease: 'easeOut', duration: 0.25 }}}} className="grid grid-cols-2 gap-y-6 gap-x-8 mt-auto pt-4 mb-4">
                <div><p className="text-xs text-muted-foreground uppercase font-mono mb-1">Status</p><p className="font-semibold text-foreground">{localProgress === 100 ? 'Completed' : localProgress > 0 ? 'In Progress' : 'Unread'}</p></div>
                <div><p className="text-xs text-muted-foreground uppercase font-mono mb-1">Progress</p><p className="font-semibold text-foreground">{localProgress}% ({localProgress === 100 ? comic.totalPages : comic.lastPageRead}/{comic.totalPages})</p></div>
                <div><p className="text-xs text-muted-foreground uppercase font-mono mb-1">Reading Time</p><p className="font-semibold text-foreground">{formatTime(comic.readingTime || 0)}</p></div>
                <div><p className="text-xs text-muted-foreground uppercase font-mono mb-1">Last Read</p><p className="font-semibold text-foreground">{comic.lastRead ? new Date(comic.lastRead * 1000).toLocaleDateString() : 'Never'}</p></div>
              </motion.div>
            </motion.div>
          )}
          </div>
          
          <div className="p-4 sm:p-6 md:p-8 bg-black/40 border-t border-white/10 flex flex-wrap items-center justify-between gap-4 mt-auto">
            <div className="flex items-center gap-2">
              <button onClick={() => toggleCollection('Favorites')} className={`p-3 rounded-2xl border transition-all ${isFav ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' : 'bg-white/5 border-white/10 text-muted-foreground hover:text-white'}`} title="Favorite"><Heart className={`size-5 ${isFav ? 'fill-current' : ''}`} /></button>
              <button onClick={() => toggleCollection('To Read')} className={`p-3 rounded-2xl border transition-all ${isToRead ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-white/5 border-white/10 text-muted-foreground hover:text-white'}`} title="To Read"><BookmarkPlus className={`size-5 ${isToRead ? 'fill-current' : ''}`} /></button>
              <button onClick={handleToggleRead} className={`p-3 rounded-2xl border transition-all ${localProgress === 100 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-white/5 border-white/10 text-muted-foreground hover:text-white'}`} title="Mark as Read"><CheckCircle className="size-5" /></button>
            </div>
            
            <button onClick={() => onRead()} className="flex-1 min-w-[140px] bg-primary text-primary-foreground font-bold px-8 py-3.5 rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2">
              <Play className="size-5 fill-current" />
              <span>{localProgress > 0 && localProgress < 100 ? 'Continue Reading' : 'Start Reading'}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
    </>
  );
}
