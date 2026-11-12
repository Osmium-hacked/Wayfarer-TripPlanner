import { ArrowRight, CalendarDays, GripVertical, WandSparkles } from 'lucide-react';
import { PlacePhoto } from './PlacePhoto.jsx';

/** First-visit intro. Shown once; "Get Started" remembers that it was seen. */
export function Welcome({ onStart }) {
  return (
    <div className="welcome">
      <div className="welcome__card glass">
        <div className="welcome__visual">
          <PlacePhoto query="Positano" className="welcome__photo" credit />
          <span className="welcome__tag">AI trip planner</span>
        </div>

        <div className="welcome__body">
          <svg className="welcome__swoosh" viewBox="0 0 300 120" aria-hidden="true">
            <path d="M10 10 H 250 a 30 30 0 0 1 30 30 v 40 a 30 30 0 0 1 -30 30 H 120" />
          </svg>
          <h1 className="welcome__title">
            Plan trips worth
            <br />
            remembering
          </h1>
          <p className="welcome__lede">
            Describe any trip in a sentence. Get a day-by-day plan you can drag, trim, and refine with AI.
          </p>
          <ul className="welcome__points">
            <li>
              <WandSparkles size={16} aria-hidden="true" /> Itineraries written in seconds
            </li>
            <li>
              <GripVertical size={16} aria-hidden="true" /> Drag stops between days
            </li>
            <li>
              <CalendarDays size={16} aria-hidden="true" /> Saved automatically
            </li>
          </ul>
          <button type="button" className="cta" onClick={onStart}>
            <span>Get Started</span>
            <span className="cta__arrow" aria-hidden="true">
              <ArrowRight size={20} />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
