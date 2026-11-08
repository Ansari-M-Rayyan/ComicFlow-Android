import { invoke } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  FolderOpen,
  FolderTree,
  HardDrive,
  Heart,
  KeyRound,
  Loader2,
  RefreshCw,
  Settings2,
  Trash2,
  Wifi,
  WifiOff,
  Zap
} from 'lucide-react';
import { useState } from 'react';
import appLogo from '../assets/logo.png';
import { DirectoryPickerModal } from '../components/modals/DirectoryPickerModal';
import { FolderStructureGuideModal } from '../components/modals/FolderStructureGuideModal';

interface SettingsViewProps {
  rootFolder: string;
  onBack?: () => void;
  onChangeRootFolder: (newPath: string) => void;
  onRescanLibrary: () => Promise<void>;
}

export function SettingsView({
  rootFolder,
  onBack: _onBack,
  onChangeRootFolder,
  onRescanLibrary,
}: SettingsViewProps) {
  const [apiKey, setApiKey] = useState(localStorage.getItem('comicvine_api_key') || '');
  const [cvEnabled, setCvEnabled] = useState(localStorage.getItem('comicvine_enabled') !== 'false');
  const [showKey, setShowKey] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [testMsg, setTestMsg] = useState('');

  const [rescanLoading, setRescanLoading] = useState(false);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheResult, setCacheResult] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [showDirPicker, setShowDirPicker] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [guideIsViewOnly, setGuideIsViewOnly] = useState(false);

  // Save ComicVine Configuration
  const handleSaveCV = () => {
    setSaveStatus('saving');
    localStorage.setItem('comicvine_api_key', apiKey.trim());
    localStorage.setItem('comicvine_enabled', cvEnabled ? 'true' : 'false');
    setTimeout(() => {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    }, 300);
  };

  // Test ComicVine Connection
  const handleTestConnection = async () => {
    const keyToTest = apiKey.trim();
    if (!keyToTest) {
      setTestStatus('failed');
      setTestMsg('Please enter an API key first.');
      return;
    }

    setTestStatus('testing');
    setTestMsg('Connecting to ComicVine API...');
    try {
      const res = await invoke<string>('fetch_comicvine', {
        apiKey: keyToTest,
        endpoint: 'volumes/',
        queryParams: {
          filter: 'name:Spider-Man',
          limit: '1'
        }
      });
      if (typeof res === 'string' && res.trim().startsWith('<')) {
        throw new Error('ComicVine returned an HTML response. The key may be invalid or blocked by Cloudflare.');
      }
      const parsed = JSON.parse(res);
      if (parsed.status_code === 1 || parsed.error === 'OK') {
        setTestStatus('success');
        setTestMsg('Valid API Key! Connection verified.');
      } else {
        setTestStatus('failed');
        setTestMsg(`API returned: ${parsed.error || 'Invalid key'}`);
      }
    } catch (err: any) {
      setTestStatus('failed');
      const msg = err?.message || String(err);
      setTestMsg(`Connection failed: ${msg.length > 130 ? msg.substring(0, 130) + '...' : msg}`);
    }
  };

  // Change Comic Folder
  const handleChangeFolder = async () => {
    const hideTip = localStorage.getItem('hide_folder_structure_tip') === 'true';
    if (!hideTip) {
      setGuideIsViewOnly(false);
      setShowGuideModal(true);
      return;
    }
    setShowDirPicker(true);
  };

  // Re-scan Library
  const handleRescan = async () => {
    setRescanLoading(true);
    try {
      await onRescanLibrary();
    } catch (e: any) {
      alert('Rescan failed: ' + e);
    } finally {
      setRescanLoading(false);
    }
  };

  // Clear Thumbnail Cache
  const handleClearCache = async () => {
    if (!rootFolder) return;
    setCacheLoading(true);
    try {
      const freedBytes = await invoke<number>('clear_app_cache', { rootFolder });
      const mb = (freedBytes / (1024 * 1024)).toFixed(1);
      setCacheResult(`Cleared ${mb} MB of thumbnail cache.`);
      setTimeout(() => setCacheResult(null), 4000);
    } catch (e: any) {
      alert('Cache clear failed: ' + e);
    } finally {
      setCacheLoading(false);
    }
  };

  // Reset Library Data
  const handleResetLibrary = async () => {
    if (!rootFolder) return;
    setResetLoading(true);
    try {
      await invoke('reset_library_data', { rootFolder });
      setShowResetConfirm(false);
      await onRescanLibrary();
    } catch (e: any) {
      alert('Library reset failed: ' + e);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-32 selection:bg-primary/20">
      {/* Header */}
      <header
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 1.5rem)' }}
        className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/40 px-4 sm:px-6 lg:px-8 py-3.5"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Settings2 className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Settings & Preferences</h1>
              <p className="text-xs text-muted-foreground">Manage storage, metadata & performance</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* LEFT COLUMN: STORAGE & CACHE */}
          <div className="space-y-6">
            {/* SECTION 1: STORAGE & FOLDERS */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
                <HardDrive className="size-4 text-primary" />
                <span>Comic Library Storage</span>
              </div>

              <div className="bg-card/60 backdrop-blur-sm border border-border/60 rounded-2xl p-5 shadow-sm space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Active Comic Root Directory</label>
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/40 border border-border/40 font-mono text-xs text-foreground/90 break-all select-all">
                    <FolderOpen className="size-4 shrink-0 text-amber-500" />
                    <span className="truncate">{rootFolder || 'No directory selected'}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2.5 pt-1">
                  <button
                    onClick={handleChangeFolder}
                    className="flex-1 min-w-[140px] py-2.5 px-4 rounded-xl bg-primary/15 hover:bg-primary/25 active:scale-98 border border-primary/25 text-primary text-xs font-semibold flex items-center justify-center gap-2 transition-all"
                  >
                    <FolderOpen className="size-4" />
                    <span>Change Folder</span>
                  </button>

                  <button
                    onClick={handleRescan}
                    disabled={rescanLoading || !rootFolder}
                    className="flex-1 min-w-[140px] py-2.5 px-4 rounded-xl bg-secondary/80 hover:bg-secondary active:scale-98 text-secondary-foreground text-xs font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`size-4 ${rescanLoading ? 'animate-spin' : ''}`} />
                    <span>{rescanLoading ? 'Scanning...' : 'Re-scan Library'}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setGuideIsViewOnly(true);
                    setShowGuideModal(true);
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-muted/40 hover:bg-muted/70 active:scale-98 border border-border/40 text-xs font-medium text-muted-foreground hover:text-foreground flex items-center justify-center gap-2 transition-all"
                >
                  <FolderTree className="size-4 text-primary" />
                  <span>Folder Structure Guide</span>
                </button>
              </div>
            </section>

            {/* SECTION 3: CACHE & DATA MANAGEMENT */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
                <Database className="size-4 text-primary" />
                <span>Storage & Memory Management</span>
              </div>

              <div className="bg-card/60 backdrop-blur-sm border border-border/60 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold">Thumbnail Cache</h4>
                    <p className="text-xs text-muted-foreground">Frees up space by clearing saved preview images. They will reload automatically when needed.</p>
                  </div>
                  <button
                    onClick={handleClearCache}
                    disabled={cacheLoading || !rootFolder}
                    className="py-2 px-3 rounded-xl bg-muted/60 hover:bg-muted active:scale-98 text-xs font-semibold flex items-center gap-1.5 transition-all border border-border/40"
                  >
                    <Trash2 className="size-3.5 text-muted-foreground" />
                    <span>{cacheLoading ? 'Cleaning...' : 'Clear Cache'}</span>
                  </button>
                </div>

                {cacheResult && (
                  <div className="p-2.5 rounded-lg bg-green-500/10 text-green-400 text-xs border border-green-500/20">
                    {cacheResult}
                  </div>
                )}

                <div className="pt-3 border-t border-border/30 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-red-400">Reset Library Database</h4>
                    <p className="text-xs text-muted-foreground">Refreshes your entire comic collection and updates all folders.</p>
                  </div>
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    className="py-2 px-3 rounded-xl bg-red-500/15 hover:bg-red-500/25 active:scale-98 text-xs font-semibold text-red-400 border border-red-500/20 transition-all"
                  >
                    Reset Data
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN: COMICVINE & ABOUT */}
          <div className="space-y-6">
            {/* SECTION 2: COMICVINE INTEGRATION */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
                <KeyRound className="size-4 text-primary" />
                <span>ComicVine Metadata & Covers</span>
              </div>

              <div className="bg-card/60 backdrop-blur-sm border border-border/60 rounded-2xl p-5 shadow-sm space-y-5">
                {/* Online / Offline Toggle */}
                <div className="flex items-center justify-between gap-4 pb-4 border-b border-border/30">
                  <div className="pr-2">
                    <div className="flex items-center gap-2 mb-1">
                      {cvEnabled ? <Wifi className="size-4 text-green-500" /> : <WifiOff className="size-4 text-muted-foreground" />}
                      <h4 className="font-semibold text-sm">{cvEnabled ? 'Online Metadata: Enabled' : 'Offline Mode Active'}</h4>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Automatically pulls official covers, storylines, character lists, and volume descriptions from ComicVine.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setCvEnabled(!cvEnabled)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${cvEnabled ? 'bg-primary' : 'bg-muted'}`}
                    role="switch"
                    aria-checked={cvEnabled}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${cvEnabled ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                  </button>
                </div>

                {/* API Key Input */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground/90">ComicVine API Key</label>
                  </div>

                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Paste ComicVine API Key..."
                      className="w-full bg-muted/40 border border-border/50 rounded-xl px-3.5 py-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded bg-muted/70"
                    >
                      {showKey ? 'HIDE' : 'SHOW'}
                    </button>
                  </div>

                  {testMsg && (
                    <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${testStatus === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : testStatus === 'failed' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-muted text-muted-foreground'}`}>
                      {testStatus === 'testing' ? <Loader2 className="size-3.5 animate-spin" /> : testStatus === 'success' ? <CheckCircle2 className="size-3.5 text-green-500" /> : <AlertTriangle className="size-3.5 text-red-500" />}
                      <span>{testMsg}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testStatus === 'testing' || !apiKey.trim()}
                    className="py-2 px-3 rounded-xl border border-border text-xs font-semibold hover:bg-muted active:scale-98 transition-all disabled:opacity-50"
                  >
                    {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveCV}
                    disabled={saveStatus === 'saving'}
                    className="flex-1 py-2 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-xs shadow-md hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-1.5"
                  >
                    {saveStatus === 'saved' ? <CheckCircle2 className="size-4" /> : null}
                    <span>{saveStatus === 'saved' ? 'Saved!' : 'Save API Settings'}</span>
                  </button>
                </div>
              </div>
            </section>

            {/* SECTION 4: APP & ABI INFO */}
            <section className="bg-muted/20 border border-border/40 rounded-2xl p-5 space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <Zap className="size-3.5 text-amber-500" />
                  ComicFlow Mobile
                </span>
                <span className="font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[11px] font-bold">
                  v0.2.3 Native
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border/20">
                <span className="flex items-center gap-1.5">
                  <Cpu className="size-3.5 text-blue-400" />
                  Target Architecture
                </span>
                <span className="font-mono text-foreground font-semibold">arm64-v8a / x86_64</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Storage Framework</span>
                <span className="font-mono text-foreground">Scoped Storage & SAF</span>
              </div>
            </section>

            {/* SECTION 5: ABOUT & CREDITS */}
            <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 shadow-inner">
                  <img src={appLogo} alt="ComicFlow" className="size-6 object-contain" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-foreground tracking-tight">ComicFlow</h3>
                  <p className="text-[11px] text-muted-foreground font-mono">Next-Gen Digital Comic Reader</p>
                </div>
              </div>

              <div className="pt-2 border-t border-border/20 flex flex-col gap-1">
                <p className="text-[10px] uppercase font-mono tracking-[0.2em] text-muted-foreground">Credits & Author</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground tracking-wide">DESIGNED & MADE BY RAYYAN ANSARI</span>
                  <Heart className="size-3.5 text-rose-500 fill-rose-500 shrink-0" />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed pt-0.5">
                  Engineered with high performance Rust & Tauri for instant page turning, offline dictionary, and official ComicVine metadata.
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-sm bg-card border border-red-500/30 rounded-2xl p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center gap-3 text-red-500">
              <AlertTriangle className="size-6" />
              <h3 className="font-bold text-base text-foreground">Reset Library Index?</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This will remove your local <span className="font-mono text-foreground">panel_vault_data.json</span> mapping cache. Your actual comic files will NOT be touched. ComicFlow will perform a clean re-scan.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 text-xs rounded-xl bg-muted font-semibold hover:bg-muted/80 text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleResetLibrary}
                disabled={resetLoading}
                className="px-4 py-2 text-xs rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center gap-1.5"
              >
                {resetLoading ? <Loader2 className="size-3.5 animate-spin" /> : null}
                <span>Confirm Reset</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* DIRECTORY PICKER MODAL */}
      <DirectoryPickerModal
        isOpen={showDirPicker}
        initialPath={rootFolder}
        onClose={() => setShowDirPicker(false)}
        onSelectFolder={(path) => {
          setShowDirPicker(false);
          onChangeRootFolder(path);
        }}
      />

      {/* FOLDER STRUCTURE GUIDE MODAL */}
      <FolderStructureGuideModal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
        onProceed={() => setShowDirPicker(true)}
        isViewOnly={guideIsViewOnly}
      />
    </div>
  );
}
