export const isComicVineOnline = (): boolean => {
  if (typeof window === 'undefined') return false;
  const enabled = localStorage.getItem('comicvine_enabled');
  if (enabled === 'false') return false;
  const apiKey = localStorage.getItem('comicvine_api_key');
  return Boolean(apiKey && apiKey.trim());
};
