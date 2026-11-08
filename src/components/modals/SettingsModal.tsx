import { motion, Variants } from 'framer-motion';
import {
    CheckCircle,
    Settings2,
    Wifi, WifiOff,
    X
} from 'lucide-react';
import { useState } from 'react';

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


export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [apiKey, setApiKey] = useState(localStorage.getItem('comicvine_api_key') || '');
  const [cvEnabled, setCvEnabled] = useState(localStorage.getItem('comicvine_enabled') !== 'false');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    localStorage.setItem('comicvine_api_key', apiKey.trim());
    localStorage.setItem('comicvine_enabled', cvEnabled ? 'true' : 'false');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8" onClick={onClose}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} onClick={e => e.stopPropagation()} className="relative w-full max-w-lg bg-card rounded-3xl shadow-2xl border border-white/10 p-8 flex flex-col">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 rounded-full bg-white/5 hover:bg-white/10 text-muted-foreground transition-colors hover:text-white"><X className="size-5" /></button>
        <div className="flex items-center gap-3 mb-8">
          <Settings2 className="size-8 text-primary" />
          <h2 className="text-2xl font-bold">Settings</h2>
        </div>

        <div className="space-y-6">
          {/* ComicVine Connection Toggle */}
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 flex items-center justify-between gap-4">
            <div className="pr-2">
              <div className="flex items-center gap-2 mb-1">
                {cvEnabled ? <Wifi className="size-4 text-green-400" /> : <WifiOff className="size-4 text-muted-foreground" />}
                <h4 className="font-semibold text-sm">{cvEnabled ? 'ComicVine Integration: Enabled' : 'Offline Mode: Enabled'}</h4>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {cvEnabled 
                  ? 'App fetches covers, synopses, story arcs, and creators from ComicVine.' 
                  : 'App operates completely offline. No external network requests will be made.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCvEnabled(!cvEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${cvEnabled ? 'bg-primary' : 'bg-white/20'}`}
              role="switch"
              aria-checked={cvEnabled}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${cvEnabled ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">ComicVine API Key</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Enter your ComicVine API key to automatically fetch comic metadata, cover dates, and synopses. You can get a free key from <a href="https://comicvine.gamespot.com/api/" target="_blank" rel="noreferrer" className="text-primary hover:underline">ComicVine</a>.
            </p>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Enter API Key..."
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors font-mono"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                {showKey ? 'HIDE' : 'SHOW'}
              </button>
            </div>
          </div>
          
          <button
            onClick={handleSave}
            className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${saved ? 'bg-green-500 text-white' : 'bg-primary text-primary-foreground hover:scale-[1.02] active:scale-95'}`}
          >
            {saved ? <CheckCircle className="size-5" /> : null}
            {saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

