import { invoke } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';
import {
    ChevronRight,
    FolderSearch,
    Loader2,
    WifiOff,
    X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { isComicVineOnline } from '../../utils';
import { cleanComicDescription } from '../../utils/comicMatcher';
import { SlidingTitle } from '../ui/SlidingTitle';

export function SeriesMatchModal({ seriesTitle, rootFolder: _rootFolder, onClose, onMatch }: { seriesTitle: string, rootFolder?: string, onClose: () => void, onMatch: (volume: any) => void }) {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState(seriesTitle);
  const isOnline = isComicVineOnline();

  useEffect(() => { 
    if (isOnline) searchVolumes(); 
  }, []);

  const searchVolumes = async (q = query) => {
    if (!isComicVineOnline()) return;
    const apiKey = localStorage.getItem('comicvine_api_key');
    if (!apiKey) return;
    setLoading(true);
    try {
      const trimmed = q.trim();
      // Check if user pasted a direct ComicVine volume URL or volume ID
      const urlMatch = trimmed.match(/4050-(\d+)/) || trimmed.match(/comicvine\.gamespot\.com\/.*?\/(\d+)/);
      const isNumericOnly = /^\d+$/.test(trimmed) && trimmed.length >= 4;
      const directId = urlMatch ? urlMatch[1] : (isNumericOnly ? trimmed : null);

      if (directId) {
        try {
          const directRes: any = await invoke('fetch_comicvine', {
            apiKey,
            endpoint: `volume/4050-${directId}`,
            queryParams: { field_list: 'id,name,deck,description,start_year,publisher,count_of_issues,image,site_detail_url' }
          });
          const parsed = JSON.parse(directRes);
          if (parsed.results && parsed.results.id) {
            setResults([parsed.results]);
            setLoading(false);
            return;
          }
        } catch (directErr) {
          console.warn("Direct volume ID fetch failed, trying search", directErr);
        }
      }

      const searchRes: any = await invoke('fetch_comicvine', {
        apiKey,
        endpoint: 'search',
        queryParams: { resources: 'volume', query: trimmed, limit: '25' }
      });
      const parsed = JSON.parse(searchRes);
      setResults(parsed.results || []);
    } catch (e) { 
      console.error(e); 
    } finally { 
      setLoading(false); 
    }
  };

  const handleSelectVolume = async (vol: any) => {
    let volumeData = { ...vol };
    const apiKey = localStorage.getItem('comicvine_api_key');
    if (apiKey && isComicVineOnline() && (!volumeData.description || volumeData.description.length < 50)) {
      try {
        const res: any = await invoke('fetch_comicvine', {
          apiKey,
          endpoint: `volume/4050-${vol.id}`,
          queryParams: { field_list: 'id,name,deck,description,start_year,publisher,count_of_issues,image' }
        });
        const parsed = JSON.parse(res);
        if (parsed.results) {
          volumeData = { ...volumeData, ...parsed.results };
        }
      } catch (err) {
        console.warn("Could not fetch full volume detail", err);
      }
    }
    onMatch(volumeData);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 pt-[max(env(safe-area-inset-top,0px),2rem)] pb-[max(env(safe-area-inset-bottom,0px),2rem)]" onClick={onClose}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 10 }} 
        animate={{ scale: 1, opacity: 1, y: 0 }} 
        exit={{ scale: 0.95, opacity: 0 }} 
        onClick={e => e.stopPropagation()} 
        className="relative w-full max-w-2xl bg-card rounded-3xl shadow-2xl border border-white/10 p-5 sm:p-7 pt-7 sm:pt-8 flex flex-col max-h-[85vh] overflow-hidden"
      >
        <button onClick={onClose} className="absolute top-5 right-5 p-2 rounded-full bg-white/5 hover:bg-white/10 text-white z-10 transition-colors">
          <X className="size-5" />
        </button>

        <div className="flex items-center gap-2.5 pr-10 mb-1 min-w-0">
          <FolderSearch className="size-5 sm:size-6 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <SlidingTitle text={`Match Series: ${seriesTitle}`} className="text-xl sm:text-2xl font-bold text-foreground" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-4 break-words">
          Search by title or paste a direct ComicVine link (e.g. <span className="break-all font-mono opacity-80">comicvine.gamespot.com/infinity/4050-66319/</span>)
        </p>
        
        {!isOnline ? (
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 text-center my-auto">
            <WifiOff className="size-10 text-muted-foreground mx-auto mb-3 opacity-60" />
            <h3 className="text-lg font-bold mb-1">ComicVine Offline</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
              ComicVine connection is currently disabled or an API key has not been set. Enable it in Settings to search and link volumes.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4 w-full">
              <input 
                type="text" 
                value={query} 
                onChange={e => setQuery(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && searchVolumes()} 
                className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground/60" 
                placeholder="Search volume name or paste URL..." 
              />
              <button 
                onClick={() => searchVolumes()} 
                disabled={loading}
                className="shrink-0 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg hover:scale-105 active:scale-95 transition-transform disabled:opacity-50"
              >
                Search
              </button>
            </div>

            <div className="overflow-y-auto space-y-3 pr-1 flex-1">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="size-8 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground font-mono">Searching ComicVine volumes...</span>
                </div>
              ) : results.length === 0 ? (
                <div className="text-center py-16 text-sm text-muted-foreground break-words px-4">
                  No matching volumes found for "{query}". You can paste a direct ComicVine volume link (e.g. <span className="break-all font-mono opacity-80">comicvine.gamespot.com/infinity/4050-66319/</span>)
                </div>
              ) : (
                results.map(vol => (
                  <div
                    key={vol.id}
                    onClick={() => handleSelectVolume(vol)}
                    className="cursor-pointer group flex items-start gap-3.5 p-3 bg-black/40 hover:bg-white/[0.06] border border-white/10 hover:border-primary/50 rounded-2xl transition-all duration-200 shadow-md active:scale-98"
                  >
                    <div className="w-14 sm:w-16 shrink-0 aspect-[2/3] rounded-xl overflow-hidden bg-black/60 shadow-lg border border-white/10 relative">
                      <img
                        src={vol.image?.small_url || vol.image?.medium_url || vol.image?.thumb_url}
                        alt={vol.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    </div>
                    
                    <div className="flex-1 min-w-0 py-0.5">
                      {/* Title row takes full width */}
                      <div className="w-full">
                        <SlidingTitle text={vol.name} className="font-bold text-sm sm:text-base text-foreground group-hover:text-primary transition-colors" />
                      </div>

                      {/* Info row underneath with Year, Issue Count Badge, and Publisher */}
                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        {vol.start_year && (
                          <span className="text-[11px] font-mono text-muted-foreground/90 shrink-0">
                            Vol. {vol.start_year}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-full bg-primary/20 border border-primary/30 text-primary font-bold text-[10px] tracking-wide shrink-0">
                          {vol.count_of_issues} {vol.count_of_issues === 1 ? 'issue' : 'issues'}
                        </span>
                        {vol.publisher?.name && (
                          <span className="text-[11px] text-muted-foreground/80 font-medium truncate max-w-[140px]">
                            {vol.publisher.name}
                          </span>
                        )}
                      </div>

                      {(vol.deck || vol.description) && (
                        <p className="text-xs text-muted-foreground/75 line-clamp-2 leading-relaxed break-words">
                          {vol.deck || cleanComicDescription(vol.description).replace(/<[^>]+>/g, '')}
                        </p>
                      )}
                    </div>

                    <div className="self-center shrink-0 pr-1">
                      <span className="text-xs font-semibold text-muted-foreground group-hover:text-primary transition-colors flex items-center gap-0.5">
                        Select <ChevronRight className="size-4 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
