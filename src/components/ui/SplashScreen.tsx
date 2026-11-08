import { motion, Variants } from 'framer-motion';
import {
    Loader2
} from 'lucide-react';
import { useEffect, useState } from 'react';
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


export function SplashScreen() {
  const [text, setText] = useState("Waking up the vault...");
  useEffect(() => {
    const phrases = ["Waking up the vault...", "Organizing series...", "Extracting covers...", "Curating moments..."];
    let i = 0;
    const timer = setInterval(() => { i = (i + 1) % phrases.length; setText(phrases[i]); }, 2500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background overflow-hidden">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="relative z-10 flex flex-col items-center">
        <div className="relative flex size-32 items-center justify-center rounded-full bg-card border border-white/10 mb-8 shadow-2xl">
          <motion.div animate={{ rotateY: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }} className="size-16">
            <img src={appLogo} alt="ComicFlow Logo" className="size-full object-contain" />
          </motion.div>
        </div>
        <h1 className="font-mono text-5xl font-bold tracking-[0.1em] text-foreground mb-3">ComicFlow<span className="text-primary">.</span></h1>
        <div className="flex items-center gap-3 text-muted-foreground bg-black/40 px-5 py-2.5 rounded-full border border-white/5 backdrop-blur-md">
          <Loader2 className="size-4 animate-spin text-primary" />
          <span className="font-mono text-xs uppercase tracking-widest">{text}</span>
        </div>
      </motion.div>
    </div>
  );
}

