import { motion } from 'framer-motion';
import { Compass, Home, Search, Settings } from 'lucide-react';

interface BottomNavProps {
  onLibraryClick?: () => void;
  onSearchClick?: () => void;
  onJourneyClick?: () => void;
  onSettingsClick?: () => void;
  currentTab?: 'home' | 'search' | 'journey' | 'settings';
}

export function BottomNav({ 
  onLibraryClick, 
  onSearchClick, 
  onJourneyClick, 
  onSettingsClick, 
  currentTab = 'home' 
}: BottomNavProps) {
  const tabs = [
    { id: 'home', label: 'Library', icon: Home, onClick: onLibraryClick },
    { id: 'search', label: 'Search', icon: Search, onClick: onSearchClick },
    { id: 'journey', label: 'Journey', icon: Compass, onClick: onJourneyClick },
    { id: 'settings', label: 'Settings', icon: Settings, onClick: onSettingsClick },
  ] as const;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 pointer-events-none flex justify-center pb-[max(env(safe-area-inset-bottom,0px),16px)] px-4">
      <nav 
        aria-label="Navigation dock"
        className="pointer-events-auto relative flex items-center justify-between w-full max-w-[400px] sm:max-w-[440px] h-16 p-1.5
          rounded-full bg-card/85 sm:bg-card/80 backdrop-blur-xl 
          border border-white/10 shadow-[0_16px_40px_rgba(0,0,0,0.65)]
          transition-all duration-300"
      >
        <div className="grid grid-cols-4 w-full h-full items-center">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={tab.onClick}
                className={`relative flex flex-col items-center justify-center h-full w-full rounded-full transition-all duration-200 active:scale-95 group ${
                  isActive ? 'text-primary' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="bottomNavIndicator"
                    className="absolute inset-1 rounded-full bg-white/[0.08] border border-white/10 backdrop-blur-md shadow-sm -z-10"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <div className="relative flex items-center justify-center">
                  <Icon 
                    size={19} 
                    strokeWidth={isActive ? 2.2 : 1.7} 
                    className={`transition-all duration-200 ${isActive ? 'scale-105 text-primary' : 'text-zinc-400 group-hover:scale-105 group-hover:text-zinc-200'}`} 
                  />
                </div>
                <span className={`text-[10.5px] tracking-tight mt-0.5 transition-all duration-200 ${
                  isActive ? 'font-bold text-foreground' : 'font-medium text-zinc-400'
                }`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

