import { describe, expect, it } from 'vitest';
import { isPhotoLike, photoCandidates, pickImageUrl } from '../src/lib/photos.js';

describe('photoCandidates', () => {
  it('tries the full name, the city, then tourism pages and the country', () => {
    expect(photoCandidates('Lisbon, Portugal')).toEqual(['Lisbon, Portugal', 'Lisbon', 'Tourism in Lisbon', 'Portugal', 'Tourism in Portugal']);
  });
  it('tries a scenic alias first for places with non-photo lead images', () => {
    expect(photoCandidates('Bora Bora, French Polynesia')[0]).toBe('Mount Otemanu');
  });
  it('dedupes single-part names and ignores blanks', () => {
    expect(photoCandidates('  Kyoto ')).toEqual(['Kyoto', 'Tourism in Kyoto']);
    expect(photoCandidates('')).toEqual([]);
    expect(photoCandidates(null)).toEqual([]);
  });
});

describe('pickImageUrl', () => {
  it('uses the original when it is reasonably small', () => {
    expect(pickImageUrl({ originalimage: { source: 'o.jpg', width: 1200 }, thumbnail: { source: 't/330px-x.jpg' } })).toBe('o.jpg');
  });
  it('upsizes the thumbnail when the original is huge', () => {
    expect(pickImageUrl({ originalimage: { source: 'o.jpg', width: 6000 }, thumbnail: { source: 'a/b/330px-x.jpg' } })).toBe('a/b/1280px-x.jpg');
  });
  it('returns null when there is no image', () => {
    expect(pickImageUrl({})).toBeNull();
  });
});

describe('isPhotoLike', () => {
  it.each([
    ['https://x/1280px-Positano_Sunset.JPG', true],
    ['https://x/Lisboa_-_Portugal_%2852597836992%29.jpg?utm=1', true],
    ['https://x/1280px-Flag_of_Iceland.svg.png', false],
    ['https://x/Bora_Bora_ISS006.jpg', false],
    ['https://x/2011_Dimos_Thiras.png', false],
    ['https://x/Santorini_Montage_L.jpg', false],
    [null, false],
  ])('%s → %s', (url, expected) => expect(isPhotoLike(url)).toBe(expected));
});
