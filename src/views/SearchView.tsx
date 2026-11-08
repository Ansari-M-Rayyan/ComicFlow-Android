import { motion } from 'framer-motion';
import {
  BookOpen,
  CheckCircle2,
  Folder,
  Search,
  SlidersHorizontal,
  X
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { fetchCoverCached } from '../cache';

interface SearchViewProps {
  vaultsData: any[];
  rootFolder: string;
  onBack: () => void;
  onSelectComic: (comic: any) => void;
  onSelectSeries: (vault: any, series: any) => void;
}

export function SearchView({
  vaultsData,
  rootFolder,
  onBack: _onBack,
  onSelectComic,
  onSelectSeries,
}: SearchViewProps) {
  const [query, setQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const [filterCategory, setFilterCategory] = useState<'all' | 'comics' | 'series' | 'unread'>('all');

  // Flatten all issues and series for instant search
  const allEntries = useMemo(() => {
    const comicsList: any[] = [];
    const seriesList: any[] = [];

    vaultsData.forEach((v) => {
      (v.series || []).forEach((s: any) => {
        seriesList.push({ ...s, vaultId: v.id, vaultName: v.name });
        (s.issues || []).forEach((issue: any) => {
          comicsList.push({
            ...issue,
            vaultId: v.id,
            vaultName: v.name,
            seriesId: s.id,
            seriesName: s.name,
          });
        });
      });
    });

    return { comicsList, seriesList };
  }, [vaultsData]);

  // Filtered results
  const filteredResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { comics: [], series: [] };

    let comics = allEntries.comicsList.filter((c) => {
      const matchTitle = (c.issue || '').toLowerCase().includes(q);
      const matchSeries = (c.seriesName || '').toLowerCase().includes(q);
      const matchVault = (c.vaultName || '').toLowerCase().includes(q);
      return matchTitle || matchSeries || matchVault;
    });

    if (filterCategory === 'unread') {
      comics = comics.filter((c) => (c.progress || 0) < 100);
    }

    let series = allEntries.seriesList.filter((s) => {
      const matchName = (s.name || '').toLowerCase().includes(q);
      const matchVault = (s.vaultName || '').toLowerCase().includes(q);
      return matchName || matchVault;
    });

    if (filterCategory === 'comics') series = [];
    if (filterCategory === 'series') comics = [];

    return { comics, series };
  }, [query, allEntries, filterCategory]);

  const totalResultsCount = useMemo(() => {
    return filteredResults.comics.length + filteredResults.series.length;
  }, [filteredResults]);

  return (
    <div className="min-h-screen bg-background text-foreground pb-32 selection:bg-primary/20">
      {/* Sticky Search Header */}
      <header
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 1.5rem)' }}
        className="sticky top-0 z-30 bg-background/90 backdrop-blur-2xl border-b border-border/40 px-4 sm:px-6 py-3.5"
      >
        <div className="max-w-7xl mx-auto space-y-3">
          <div className="flex items-center justify-between gap-3 min-h-[44px]">
            {!isExpanded && !query ? (
              <>
                <div>
                  <h1 className="text-xl font-bold tracking-tight">Search Library</h1>
                  <p className="text-xs text-muted-foreground">Find comics, series & vaults</p>
                </div>
                <button
                  onClick={() => setIsExpanded(true)}
                  className="p-2.5 rounded-full bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground active:scale-95 transition-all"
                  aria-label="Open search input"
                >
                  <Search className="size-5" />
                </button>
              </>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative flex-1 flex items-center"
              >
                <Search className="size-4 absolute left-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search series, issues, vaults..."
                  autoFocus
                  className="w-full bg-muted/60 border border-border/70 focus:border-primary rounded-2xl pl-10 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 transition-all font-medium shadow-inner"
                />
                <button
                  onClick={() => {
                    if (query) {
                      setQuery('');
                    } else {
                      setIsExpanded(false);
                    }
                  }}
                  className="absolute right-2.5 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/80 active:scale-95 transition-all"
                  aria-label="Clear or close search"
                >
                  <X className="size-4" />
                </button>
              </motion.div>
            )}
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
            <SlidersHorizontal className="size-3.5 text-muted-foreground ml-1 mr-0.5 shrink-0" />
            {(
              [
                { id: 'all', label: 'All Results' },
                { id: 'comics', label: 'Issues Only' },
                { id: 'series', label: 'Series' },
                { id: 'unread', label: 'Unread / In Progress' },
              ] as const
            ).map((chip) => (
              <button
                key={chip.id}
                onClick={() => setFilterCategory(chip.id)}
                className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 transition-all ${
                  filterCategory === chip.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/30'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Results Container */}
      <main className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
        {!query.trim() ? (
          <div className="flex flex-col items-center justify-center pt-24 pb-12 text-center">
            <div className="size-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4 shadow-inner">
              <Search className="size-7" />
            </div>
            <h2 className="text-lg font-bold text-foreground">Search Your Vault</h2>
            <p className="text-xs text-muted-foreground max-w-xs mt-1.5 leading-relaxed">
              Type any comic title, issue number, or publisher to instantly locate stories across your local library.
            </p>
          </div>
        ) : totalResultsCount === 0 ? (
          <div className="flex flex-col items-center justify-center pt-24 pb-12 text-center">
            <div className="size-16 rounded-3xl bg-muted/40 border border-border/40 flex items-center justify-center text-muted-foreground mb-4">
              <Search className="size-7 opacity-60" />
            </div>
            <h2 className="text-lg font-bold text-foreground">No matches found</h2>
            <p className="text-xs text-muted-foreground max-w-xs mt-1.5 leading-relaxed">
              We couldn't find anything matching "{query}". Try checking for typos or searching by volume name.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Matching Series */}
            {filteredResults.series.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Folder className="size-4 text-primary" />
                  <span>Series ({filteredResults.series.length})</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredResults.series.map((s) => {
                    return (
                      <div
                        key={s.id}
                        onClick={() => {
                          const v = vaultsData.find((x) => x.id === s.vaultId);
                          if (v) onSelectSeries(v, s);
                        }}
                        className="flex items-center justify-between p-3.5 rounded-2xl bg-card/60 hover:bg-card border border-border/50 hover:border-primary/40 transition-all cursor-pointer shadow-sm active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-3 min-w-0 pr-2">
                          <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                            <Folder className="size-5" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold truncate text-foreground">{s.name}</h3>
                            <p className="text-xs text-muted-foreground font-mono truncate">
                              {s.vaultName} • {s.issues?.length || 0} issues
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-primary/10 text-primary shrink-0">
                          View
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Matching Comics */}
            {filteredResults.comics.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <BookOpen className="size-4 text-primary" />
                  <span>Issues ({filteredResults.comics.length})</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
                  {filteredResults.comics.map((comic) => (
                    <div key={comic.id} className="w-full min-w-0 max-w-full overflow-hidden">
                      <ComicSearchCard
                        comic={comic}
                        rootFolder={rootFolder}
                        onSelect={() => onSelectComic(comic)}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function ComicSearchCard({
  comic,
  rootFolder,
  onSelect,
}: {
  comic: any;
  rootFolder: string;
  onSelect: () => void;
}) {
  const [coverUrl, setCoverUrl] = useState<string>('');

  useState(() => {
    fetchCoverCached(rootFolder, comic.path)
      .then(setCoverUrl)
      .catch(() => {});
  });

  const progress = comic.progress || 0;

  return (
    <motion.div
      onClick={onSelect}
      whileTap={{ scale: 0.96 }}
      className="group flex flex-col rounded-2xl bg-card/60 hover:bg-card border border-border/50 hover:border-primary/40 overflow-hidden shadow-sm transition-all cursor-pointer w-full min-w-0 max-w-full"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted/40">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={comic.issue}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="size-full flex items-center justify-center text-muted-foreground/30">
            <BookOpen className="size-8" />
          </div>
        )}

        {/* Progress Bar */}
        {progress > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
            <div
              className={`h-full ${progress >= 100 ? 'bg-green-500' : 'bg-primary'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {progress >= 100 && (
          <span className="absolute top-2 right-2 p-1 rounded-full bg-green-500/90 text-white shadow-md">
            <CheckCircle2 className="size-3.5" />
          </span>
        )}
      </div>

      <div className="p-3 flex flex-col gap-1 min-w-0 max-w-full overflow-hidden">
        <h5 className="font-bold text-xs text-foreground line-clamp-2 break-words group-hover:text-primary transition-colors min-w-0 max-w-full">
          {comic.issue}
        </h5>
        <span className="text-[11px] text-muted-foreground truncate min-w-0 max-w-full">{comic.seriesName}</span>
      </div>
    </motion.div>
  );
}
