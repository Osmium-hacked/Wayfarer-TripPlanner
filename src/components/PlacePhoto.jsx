import { useEffect, useState } from 'react';
import { cachedPlacePhoto, findPlacePhoto } from '../lib/photos.js';

// Deterministic warm gradient per place, shown while loading and when no photo exists.
function hueFor(text) {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function usePlacePhoto(query) {
  const [photo, setPhoto] = useState(() => cachedPlacePhoto(query) ?? null);
  useEffect(() => {
    let alive = true;
    setPhoto(cachedPlacePhoto(query) ?? null);
    findPlacePhoto(query).then((p) => alive && setPhoto(p));
    return () => {
      alive = false;
    };
  }, [query]);
  return photo;
}

/**
 * Background photo for a destination. Decorative by default (alt=""), so the
 * surrounding text carries the meaning. `credit` shows a small Wikipedia link.
 */
export function PlacePhoto({ query, className = '', credit = false, children }) {
  const photo = usePlacePhoto(query);
  const [loadedSrc, setLoadedSrc] = useState(null);
  const [failedSrc, setFailedSrc] = useState(null);
  const hue = hueFor(query);
  const src = photo?.src && photo.src !== failedSrc ? photo.src : null;

  return (
    <div className={`photo ${className}`} style={{ '--h1': hue, '--h2': (hue + 40) % 360 }}>
      {src && (
        <img
          src={src}
          alt=""
          className={`photo__img ${loadedSrc === src ? 'is-loaded' : ''}`}
          onLoad={() => setLoadedSrc(src)}
          onError={() => setFailedSrc(src)}
          referrerPolicy="no-referrer"
        />
      )}
      {children}
      {credit && src && photo.page && (
        <a className="photo__credit" href={photo.page} target="_blank" rel="noreferrer">
          Photo: Wikipedia
        </a>
      )}
    </div>
  );
}
