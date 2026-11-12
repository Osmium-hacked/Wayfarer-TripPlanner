import { ArrowUp, Landmark, Mountain, TreePalm, Users, Utensils, Wallet, X } from 'lucide-react';
import { useLayoutEffect } from 'react';

export const MAX_PROMPT = 2000;

export const VIBES = [
  { id: 'relaxed', label: 'Relaxed', Icon: TreePalm, text: 'a relaxed, unhurried pace' },
  { id: 'foodie', label: 'Foodie', Icon: Utensils, text: 'great local food' },
  { id: 'adventure', label: 'Adventure', Icon: Mountain, text: 'outdoor adventure' },
  { id: 'culture', label: 'Culture', Icon: Landmark, text: 'history, art and culture' },
  { id: 'family', label: 'Family', Icon: Users, text: 'kid-friendly stops' },
  { id: 'budget', label: 'Budget', Icon: Wallet, text: 'keeping costs low' },
];

/** The trip-style chips become one extra sentence appended to the request. */
export function withVibes(text, vibeIds) {
  const picked = VIBES.filter((v) => vibeIds.includes(v.id)).map((v) => v.text);
  return picked.length ? `${text}\n\nTrip style: ${picked.join(', ')}.` : text;
}

export function Composer({ value, onChange, onSubmit, onCancel, loading, textareaRef, vibes, onToggleVibe }) {
  const trimmed = value.trim();
  const tooLong = value.length > MAX_PROMPT;
  const canSubmit = trimmed.length >= 3 && !tooLong && !loading;

  // Grow the textarea with its content.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  }, [value, textareaRef]);

  const submit = (e) => {
    e.preventDefault();
    if (canSubmit) onSubmit(trimmed);
  };

  return (
    <form className="composer" onSubmit={submit} aria-busy={loading}>
      <label htmlFor="trip-prompt" className="sr-only">
        Describe your trip
      </label>
      <div className={`composer__box ${loading ? 'is-loading' : ''}`}>
        <span className={`orb ${loading ? 'orb--busy' : ''}`} aria-hidden="true" />
        <textarea
          id="trip-prompt"
          ref={textareaRef}
          value={value}
          rows={1}
          readOnly={loading}
          placeholder="Where to? e.g. “5 relaxed days in Kyoto in autumn”"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
          }}
          aria-describedby="prompt-help"
          aria-invalid={tooLong}
        />
        {/* Separate keys so React never morphs the clicked Cancel into a submit button. */}
        {loading ? (
          <button key="cancel" type="button" className="round-btn round-btn--light" onClick={onCancel} aria-label="Cancel" title="Cancel">
            <X size={18} />
          </button>
        ) : (
          <button key="submit" type="submit" className="round-btn" disabled={!canSubmit} aria-label="Plan my trip" title="Plan my trip">
            <ArrowUp size={18} />
          </button>
        )}
      </div>
      <p id="prompt-help" className={`composer__help ${tooLong ? 'is-error' : ''}`}>
        {tooLong ? (
          `${value.length - MAX_PROMPT} characters over the limit`
        ) : (
          <>
            <kbd>Enter</kbd> to plan · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line
          </>
        )}
      </p>

      <div className="vibes" role="group" aria-label="Trip style">
        {VIBES.map(({ id, label, Icon }) => {
          const on = vibes.includes(id);
          return (
            <button
              key={id}
              type="button"
              className={`vibe ${on ? 'is-on' : ''}`}
              aria-pressed={on}
              disabled={loading}
              onClick={() => onToggleVibe(id)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </form>
  );
}
