import { invoke } from '@tauri-apps/api/core';

// --- PERFORMANCE: CACHES & REQUEST DEDUPLICATION ---
const MAX_PAGE_CACHE = 6;
const pageCache = new Map<string, { img: string, ambient: string }>();
const pageRequests = new Map<string, Promise<{ img: string, ambient: string }>>();

const coverCache = new Map<string, string>();
const coverRequests = new Map<string, Promise<string>>();

// Bound cover extraction/decoding so library scrolling stays responsive.
const MAX_COVER_CONCURRENCY = 6;
let activeCoverLoads = 0;
const pendingCoverLoads: Array<() => void> = [];

const runNextCoverLoad = () => {
  while (activeCoverLoads < MAX_COVER_CONCURRENCY && pendingCoverLoads.length > 0) {
    const next = pendingCoverLoads.shift();
    if (!next) break;
    activeCoverLoads += 1;
    next();
  }
};

const enqueueCoverLoad = <T,>(task: () => Promise<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    pendingCoverLoads.push(() => {
      task()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          activeCoverLoads -= 1;
          runNextCoverLoad();
        });
    });
    runNextCoverLoad();
  });

export const getPageCache = (key: string) => {
  const value = pageCache.get(key);
  if (value) {
    pageCache.delete(key);
    pageCache.set(key, value); 
  }
  return value;
};

export const setPageCache = (key: string, value: { img: string, ambient: string }) => {
  pageCache.delete(key);
  pageCache.set(key, value);
  while (pageCache.size > MAX_PAGE_CACHE) {
    const oldest = pageCache.keys().next().value;
    if (!oldest) break;
    pageCache.delete(oldest);
  }
};

export const fetchCoverCached = async (rootFolder: string, filePath: string): Promise<string> => {
  if (coverCache.has(filePath)) return coverCache.get(filePath)!;
  if (coverRequests.has(filePath)) return coverRequests.get(filePath)!;

  const req = enqueueCoverLoad(() => invoke('get_comic_cover', { rootFolder, filePath })).then((res: any) => {
    coverCache.set(filePath, res);
    coverRequests.delete(filePath);
    return res;
  }).catch((e) => {
    coverRequests.delete(filePath);
    throw e;
  });

  coverRequests.set(filePath, req);
  return req;
};

const MAX_THUMBNAIL_CACHE = 60;
const thumbnailCache = new Map<string, string>();
const thumbnailRequests = new Map<string, Promise<string>>();

const setThumbnailCache = (key: string, val: string) => {
  thumbnailCache.delete(key);
  thumbnailCache.set(key, val);
  while (thumbnailCache.size > MAX_THUMBNAIL_CACHE) {
    const oldest = thumbnailCache.keys().next().value;
    if (!oldest) break;
    thumbnailCache.delete(oldest);
  }
};

export const getThumbnailCache = (comicPath: string, pageNum: number): string | undefined => {
  const key = `${comicPath}-thumb-${pageNum}`;
  const val = thumbnailCache.get(key);
  if (val) {
    thumbnailCache.delete(key);
    thumbnailCache.set(key, val);
  }
  return val;
};

export const fetchThumbnailCached = async (rootFolder: string, comicPath: string, pageNum: number): Promise<string> => {
  const key = `${comicPath}-thumb-${pageNum}`;
  if (thumbnailCache.has(key)) return thumbnailCache.get(key)!;
  if (thumbnailRequests.has(key)) return thumbnailRequests.get(key)!;

  const req = invoke('read_comic_page_thumbnail', { rootFolder, filePath: comicPath, page: pageNum - 1 })
    .then((res: any) => {
      setThumbnailCache(key, res);
      thumbnailRequests.delete(key);
      return res as string;
    })
    .catch(() => {
      thumbnailRequests.delete(key);
      // Fallback to full page if thumbnail fails
      return fetchPageCached(comicPath, pageNum).then(p => p.img);
    });

  thumbnailRequests.set(key, req);
  return req;
};

export const fetchPageCached = async (comicPath: string, pageNum: number): Promise<{ img: string, ambient: string }> => {
  const key = `${comicPath}-${pageNum}`;
  const cached = getPageCache(key);
  if (cached) return cached;
  
  if (pageRequests.has(key)) return pageRequests.get(key)!;

  const req = invoke('read_comic_page', { filePath: comicPath, page: pageNum - 1 }).then((res: any) => {
    const data = { img: res[0], ambient: res[2] };
    setPageCache(key, data);
    pageRequests.delete(key);
    return data;
  }).catch((e) => {
    pageRequests.delete(key);
    throw e;
  });

  pageRequests.set(key, req);
  return req;
};

