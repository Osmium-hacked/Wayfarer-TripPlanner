// Destination photos from Wikipedia's free REST API (no key, CORS-enabled).
// Results (including "no photo") are cached in memory and localStorage so each
// place is looked up once. Failures never throw; the UI falls back to a gradient.

const CACHE_KEY = 'wayfarer:photos:v3';
const memory = new Map();
const inflight = new Map();

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeCache(key, value) {
  try {
    const cache = readCache();
    cache[key] = value;
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage full or disabled: memory cache still works */
  }
}

/**
 * "Lisbon, Portugal" → ["Lisbon, Portugal", "Lisbon", "Tourism in Lisbon", "Portugal", "Tourism in Portugal"]
 * "Tourism in X" articles almost always lead with a scenic photo, so they make a good fallback
 * when the place's own lead image is a flag, map or satellite view.
 */
// Places whose Wikipedia lead image is a flag, map or satellite view, mapped to a scenic article.
const SCENIC_ALIASES = {
  'bora bora': 'Mount Otemanu',
  iceland: 'Seljalandsfoss',
  'french polynesia': 'Mount Otemanu',
  maldives: 'Tourism in the Maldives',
};

export function photoCandidates(query) {
  const q = String(query ?? '').replace(/\s+/g, ' ').trim();
  if (!q) return [];
  const parts = q.split(/[,/(]/).map((p) => p.replace(/\)/g, '').trim()).filter(Boolean);
  const first = parts[0];
  const last = parts[parts.length - 1];
  const alias = SCENIC_ALIASES[first.toLowerCase()] ?? SCENIC_ALIASES[q.toLowerCase()];
  return [...new Set([alias, q, first, `Tourism in ${first}`, last, `Tourism in ${last}`])].filter((c) => c && c.length > 1);
}

const NOT_A_PHOTO = /(flag|map|locator|location|orthographic|projection|coat_of_arms|emblem|seal|logo|iss\d|satellite|montage|collage|diagram|svg)/i;

/** Lead images are often flags, maps or collages. Only accept real photographs. */
export function isPhotoLike(url) {
  if (!url) return false;
  const file = decodeURIComponent(url.split('?')[0].split('/').pop() || '');
  return /\.(jpe?g|webp)$/i.test(file) && !NOT_A_PHOTO.test(file);
}

/** Pick a sensible size: the original if it's small, otherwise a 1280px thumbnail. */
export function pickImageUrl(summary) {
  const original = summary?.originalimage;
  const thumb = summary?.thumbnail?.source;
  if (original?.source && original.width && original.width <= 1600) return original.source;
  if (thumb) return thumb.replace(/\/\d+px-/, '/1280px-');
  return original?.source ?? null;
}

async function lookup(title, signal) {
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, {
    signal,
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (json.type === 'disambiguation') return null;
  const src = pickImageUrl(json);
  return src && isPhotoLike(src) ? { src, page: json.content_urls?.desktop?.page ?? null, title: json.title } : null;
}

export function cachedPlacePhoto(query) {
  const key = String(query ?? '').toLowerCase().trim();
  if (memory.has(key)) return memory.get(key);
  const stored = readCache()[key];
  if (stored !== undefined) {
    memory.set(key, stored);
    return stored;
  }
  return undefined;
}

export function findPlacePhoto(query) {
  const key = String(query ?? '').toLowerCase().trim();
  if (!key) return Promise.resolve(null);
  const cached = cachedPlacePhoto(key);
  if (cached !== undefined) return Promise.resolve(cached);
  if (inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    let result = null;
    for (const candidate of photoCandidates(query)) {
      try {
        result = await lookup(candidate);
      } catch {
        return null; // offline: don't cache, try again next time
      }
      if (result) break;
    }
    memory.set(key, result);
    writeCache(key, result);
    return result;
  })().finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}
