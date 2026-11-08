import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { SeriesShowcaseCard } from '../components/library/SeriesShowcaseCard';
import { StickyBreadcrumbBar } from '../components/ui/StickyBreadcrumbBar';

export function VaultDetailView({ vault, rootFolder, onBack, onViewSeries }: { vault: any, rootFolder: string, onBack: () => void, onViewSeries: (series: any) => void }) {
  const [search, setSearch] = useState('');
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, []);

  const seriesList = vault?.series || [];
  const filteredSeries = useMemo(() => {
    if (!search) return seriesList;
    const q = search.toLowerCase();
    return seriesList.filter((series: any) => {
      return (series.name || '').toLowerCase().includes(q) ||
        (series.issues || []).some((i: any) =>
          (i.issue || '').toLowerCase().includes(q) ||
          (i.title || '').toLowerCase().includes(q)
        );
    });
  }, [seriesList, search]);

  return (
    <div 
      style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 1.5rem)' }}
      className="min-h-screen bg-background pb-32 px-4 sm:px-6 lg:px-8"
    >
      <div className="max-w-7xl mx-auto w-full">
        <StickyBreadcrumbBar
          items={[{ label: 'Home', view: 'library' }, { label: vault?.name || 'Vault', view: 'vault-detail' }]}
          onNavigate={(item) => { if (item.view === 'library') onBack(); }}
          search={search}
          onSearchChange={setSearch}
          placeholder="Search series or issues..."
        />
        
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground mb-1">{vault?.name || 'Vault'}</h1>
          <p className="text-xs sm:text-sm font-mono text-muted-foreground">{seriesList.length} series inside this vault</p>
        </div>

        {filteredSeries.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {filteredSeries.map((series: any) => (
              <SeriesShowcaseCard
                key={series.id}
                series={series}
                rootFolder={rootFolder}
                onOpen={() => onViewSeries(series)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-border/50 bg-card/40 p-12 text-center">
            <Search className="mx-auto mb-4 size-8 text-muted-foreground/60" />
            <h2 className="text-lg font-bold text-foreground">No matching series</h2>
            <p className="mt-2 text-sm text-muted-foreground">Try a different series name or issue number.</p>
          </div>
        )}
      </div>
    </div>
  );
}
