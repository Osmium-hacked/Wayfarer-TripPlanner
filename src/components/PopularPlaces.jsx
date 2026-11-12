import { ArrowRight, CalendarDays, MapPin } from 'lucide-react';
import { PlacePhoto } from './PlacePhoto.jsx';

export const POPULAR_PLACES = [
  { id: 'bora-bora', place: 'Bora Bora', photo: 'Mount Otemanu', region: 'French Polynesia', days: 5, prompt: '5 days in Bora Bora for a honeymoon: overwater villa, snorkelling, and sunset dinners.' },
  { id: 'lisbon', place: 'Lisbon', region: 'Portugal', days: 4, prompt: '4 days in Lisbon in May. We love seafood, viewpoints and slow mornings; no museums please. Mid-range budget.' },
  { id: 'kyoto', place: 'Kyoto', region: 'Japan', days: 5, prompt: '5 relaxed days in Kyoto in autumn: temples, gardens, and great food.' },
  { id: 'iceland', place: 'Iceland', photo: 'Seljalandsfoss', region: 'Ring Road', days: 7, prompt: '7-day Ring Road road trip around Iceland in June: hiking, hot springs, waterfalls. We have a rental car.' },
  { id: 'mexico-city', place: 'Mexico City', region: 'Mexico', days: 3, prompt: '3 days in Mexico City for a vegetarian who loves art, architecture and markets.' },
  { id: 'tokyo', place: 'Tokyo', region: 'Japan', days: 3, prompt: 'A long weekend in Tokyo with two kids (6 and 9). Budget around $200/day, at least one big park.' },
];

/**
 * Horizontal photo carousel. Clicking a card puts its example request in the composer
 * so it can be tweaked; the arrow button plans it straight away.
 */
export function PopularPlaces({ onPick, onPlan, disabled }) {
  return (
    <section className="section" aria-labelledby="popular-heading">
      <div className="section__head">
        <h2 id="popular-heading">Popular places</h2>
        <span className="section__hint">Tap to customise · arrow to plan</span>
      </div>
      <ul className="carousel">
        {POPULAR_PLACES.map((p, i) => (
          <li key={p.id} className="place-card" style={{ '--i': i }}>
            <PlacePhoto query={p.photo ?? p.place} className="place-card__photo" />
            <button type="button" className="place-card__main" onClick={() => onPick(p)} disabled={disabled} aria-label={`Use the ${p.place} example`}>
              <span className="glass-chip">
                <CalendarDays size={13} aria-hidden="true" /> {p.days} days
              </span>
              <span className="place-card__text">
                <span className="place-card__region">
                  <MapPin size={13} aria-hidden="true" /> {p.region}
                </span>
                <span className="place-card__name">{p.place}</span>
              </span>
            </button>
            <button
              type="button"
              className="glass-round place-card__go"
              onClick={() => onPlan(p)}
              disabled={disabled}
              aria-label={`Plan ${p.days} days in ${p.place} now`}
              title="Plan this trip"
            >
              <ArrowRight size={18} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
