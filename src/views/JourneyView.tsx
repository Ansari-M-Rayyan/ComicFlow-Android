import { invoke } from '@tauri-apps/api/core';
import {
    BookMarked,
    Download,
    MapPin,
    X
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import appLogo from '../assets/logo.png';
import { fetchPageCached } from '../cache';

export const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return ' 0m';
};

export function JourneyView({ rootFolder, onOpenMoment }: { rootFolder: string, onBack?: () => void, onOpenMoment: (comicId: string, page: number) => void }) {
  const [stats, setStats] = useState({ issuesRead: 0, readingTimeSeconds: 0 });
  const [moments, setMoments] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([ invoke('get_reading_journey', { rootFolder }), invoke('get_moments', { rootFolder }) ])
      .then(([s, m]: [any, any]) => { setStats(s); setMoments(m); })
      .catch(console.error);
  }, [rootFolder]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
        await invoke('delete_moment', { rootFolder, momentId: id });
        setMoments(prev => prev.filter(m => m.id !== id));
    } catch(e) { console.error(e); }
  };

  const handleExport = async (e: React.MouseEvent, m: any) => {
    e.stopPropagation();
    try {
      const res: any = await fetchPageCached(m.comicPath, m.page);
      const img = new Image();
      img.src = res.img;
      await new Promise(r => img.onload = r);

      const logoImg = new Image();
      logoImg.src = appLogo;
      await new Promise(r => logoImg.onload = r);

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      const barHeight = Math.max(120, img.height * 0.08); 
      canvas.height = img.height + barHeight;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = '#090909';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      ctx.fillStyle = 'rgba(10, 10, 10, 1)';
      ctx.fillRect(0, img.height, canvas.width, barHeight);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(0, img.height, canvas.width, 2); 

      const fontSize = Math.max(16, barHeight * 0.25);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${fontSize}px monospace`;
      ctx.textBaseline = 'middle';
      
      const logoSize = fontSize * 1.8; 
      const gap = 16; 
      
      const maxContentWidth = canvas.width * 0.9; 
      let text = `${m.issueTitle} • Page ${m.page} • Read on ComicFlow`;
      let textWidth = ctx.measureText(text).width;

      if (logoSize + gap + textWidth > maxContentWidth) {
        const suffix = `... • Page ${m.page} • Read on ComicFlow`;
        let truncatedTitle = m.issueTitle;
        while (truncatedTitle.length > 0 && ctx.measureText(truncatedTitle + suffix).width + logoSize + gap > maxContentWidth) {
          truncatedTitle = truncatedTitle.slice(0, -1);
        }
        text = truncatedTitle + suffix;
        textWidth = ctx.measureText(text).width;
      }
      
      const totalContentWidth = logoSize + gap + textWidth;
      const startX = (canvas.width - totalContentWidth) / 2;
      const centerY = img.height + (barHeight / 2);

      ctx.drawImage(logoImg, startX, centerY - (logoSize / 2), logoSize, logoSize);
      ctx.textAlign = 'left';
      ctx.fillText(text, startX + logoSize + gap, centerY);

      const filename = `ComicFlow_${m.issueTitle.replace(/\s/g, '_')}_Page${m.page}.png`;
      const base64Data = canvas.toDataURL('image/png', 1.0);
      try {
        await invoke('save_moment_to_gallery', { base64Data, filename });
        setExportToast('Saved to Downloads & Gallery!');
        setTimeout(() => setExportToast(null), 3000);
      } catch (saveErr) {
        // Fallback for browser testing
        const link = document.createElement('a');
        link.download = filename;
        link.href = base64Data;
        link.click();
        setExportToast('Saved!');
        setTimeout(() => setExportToast(null), 3000);
      }
    } catch(err) { console.error(err); alert("Failed to export image."); }
  };

  const [exportToast, setExportToast] = useState<string | null>(null);

  return (
    <div 
      style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 1.5rem)' }}
      className="min-h-screen bg-background pb-32 px-4 sm:px-6 lg:px-8 overflow-y-auto relative"
    >
      <div className="max-w-7xl mx-auto w-full">
        {exportToast && (
          <div className="fixed top-12 inset-x-4 z-50 max-w-sm mx-auto p-3 rounded-xl bg-primary text-primary-foreground font-semibold text-xs shadow-xl text-center animate-in fade-in slide-in-from-top-4 duration-200">
            {exportToast}
          </div>
        )}
        <div className="mb-6 flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
            <MapPin className="size-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Reading Journey & Moments</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Track your reading stats & saved panels</p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 mb-8">
          <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border/50 shadow-md">
            <p className="text-xs font-mono text-muted-foreground mb-1.5">Comics Read</p>
            <p className="text-2xl sm:text-3xl font-bold text-foreground">{stats.issuesRead}</p>
          </div>
          <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border/50 shadow-md">
            <p className="text-xs font-mono text-muted-foreground mb-1.5">Time in Vault</p>
            <p className="text-2xl sm:text-3xl font-bold text-primary">{formatTime(stats.readingTimeSeconds)}</p>
          </div>
        </div>
        
        <h2 className="text-lg sm:text-xl font-bold tracking-tight mb-4 flex items-center gap-2 text-foreground">
          <BookMarked className="size-4 text-primary" />
          <span>Saved Moments</span>
        </h2>

        {moments.length === 0 ? (
          <div className="p-8 rounded-2xl bg-card/40 border border-border/40 text-center text-muted-foreground text-sm">
            No moments saved yet. Bookmark panels while reading to keep them here!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {moments.map(m => (
              <div key={m.id} onClick={() => onOpenMoment(m.comicId, m.page)} className="group relative bg-card/60 border border-border/40 p-4 sm:p-5 rounded-2xl cursor-pointer hover:bg-card hover:border-primary/50 transition-all shadow-md active:scale-98">
                <div className="absolute top-3.5 right-3.5 flex gap-2">
                  <button onClick={(e) => handleExport(e, m)} className="p-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors" title="Export card"><Download className="size-3.5" /></button>
                  <button onClick={(e) => handleDelete(e, m.id)} className="p-1.5 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors" title="Delete moment"><X className="size-3.5" /></button>
                </div>
                <h3 className="font-bold text-sm sm:text-base mb-1 pr-16 truncate text-foreground">{m.name}</h3>
                <p className="text-xs text-muted-foreground mb-3 truncate">{m.issueTitle}</p>
                <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground uppercase tracking-widest bg-muted/40 px-3 py-1.5 rounded-lg border border-border/30">
                  <span>Page {m.page}</span>
                  <span className="text-primary font-bold">{m.percent}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
