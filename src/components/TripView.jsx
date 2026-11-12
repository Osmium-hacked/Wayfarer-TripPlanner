import { ArrowLeft, CalendarDays, ChevronsDownUp, ChevronsUpDown, Heart, Info, MapPin, Plus, Redo2, Route, Sparkles, Undo2, WandSparkles, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { formatMoney } from '../lib/format.js';
import { findStop, tripStats } from '../state/tripReducer.js';
import { useToast } from '../hooks/useToasts.jsx';
import { DayBoard } from './DayBoard.jsx';
import { CATEGORY_META, CategoryIcon } from './icons.jsx';
import { PlacePhoto } from './PlacePhoto.jsx';
import { BudgetCard, PackingCard } from './SideCards.jsx';

// Runs after React has committed the change, so the target element exists in its new place.
function focusLater(selector) {
  setTimeout(() => document.querySelector(selector)?.focus(), 0);
}

function WarningsBanner({ warnings, onDismiss }) {
  if (!warnings.length) return null;
  return (
    <div className="notice notice--warn warnings fade-in" role="status">
      <Info size={16} aria-hidden="true" />
      <div>
        <p className="warnings__title">We tidied up the AI’s answer</p>
        <ul>
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </div>
      <button type="button" className="icon-btn icon-btn--sm" aria-label="Dismiss" onClick={onDismiss}>
        <X size={14} />
      </button>
    </div>
  );
}

/** Categories present in the trip, most common first. Clicking one highlights matching stops. */
function CategoryChips({ trip, active, onToggle }) {
  const counts = new Map();
  trip.days.forEach((d) => d.stops.forEach((s) => counts.set(s.category, (counts.get(s.category) ?? 0) + 1)));
  const cats = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!cats.length) return null;
  return (
    <div className="cat-chips" role="group" aria-label="Highlight stops by type">
      {cats.map(([cat, n]) => (
        <button
          key={cat}
          type="button"
          className={`cat-chip ${active === cat ? 'is-on' : ''}`}
          data-category={cat}
          aria-pressed={active === cat}
          onClick={() => onToggle(cat)}
          title={`Highlight ${(CATEGORY_META[cat]?.label ?? cat).toLowerCase()} stops`}
        >
          <CategoryIcon category={cat} size={18} />
          <span>{CATEGORY_META[cat]?.label ?? cat}</span>
          <small>{n}</small>
        </button>
      ))}
    </div>
  );
}

function Summary({ text }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const long = text.length > 140;
  return (
    <p className={`trip__summary ${open || !long ? '' : 'is-clamped'}`}>
      {text}{' '}
      {long && (
        <button type="button" className="link-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'See less' : 'See more…'}
        </button>
      )}
    </p>
  );
}

export function TripView({ trip, dispatch, canUndo, canRedo, warnings, onDismissWarnings, locked, onNewTrip }) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(() => new Set());
  const [highlight, setHighlight] = useState(null);
  const stats = tripStats(trip);
  const allIds = trip.days.flatMap((d) => d.stops.map((s) => s.id));
  const allExpanded = allIds.length > 0 && allIds.every((id) => expanded.has(id));

  const toggle = useCallback(
    (id) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      }),
    [],
  );

  const move = useCallback(
    (stopId, delta) => {
      dispatch({ type: 'moveStop', stopId, delta });
      focusLater(`[data-stop-focus="${stopId}"]`); // keep keyboard focus on the moved stop
    },
    [dispatch],
  );

  const moveToDay = useCallback(
    (stopId, dayId) => {
      const dayNumber = trip.days.findIndex((d) => d.id === dayId) + 1;
      dispatch({ type: 'moveStopToDay', stopId, dayId });
      toast({ message: `Moved to day ${dayNumber}` });
      focusLater(`[data-stop-focus="${stopId}"]`);
    },
    [dispatch, toast, trip.days],
  );

  const remove = useCallback(
    (stopId) => {
      const loc = findStop(trip, stopId);
      if (!loc) return;
      const day = trip.days[loc.dayIndex];
      const neighbour = day.stops[loc.stopIndex + 1] ?? day.stops[loc.stopIndex - 1];
      dispatch({ type: 'removeStop', stopId });
      toast({
        message: `Removed “${loc.stop.name}”`,
        // Put back exactly this stop, regardless of what else is on the undo stack.
        action: {
          label: 'Undo',
          onClick: () => {
            dispatch({ type: 'restoreStop', stop: loc.stop, dayId: day.id, index: loc.stopIndex });
            focusLater(`[data-stop-focus="${stopId}"]`);
          },
        },
      });
      focusLater(neighbour ? `[data-stop-focus="${neighbour.id}"]` : `[data-day-add="${day.id}"]`);
    },
    [dispatch, toast, trip],
  );

  const removeDay = useCallback(
    (dayId, index) => {
      const day = trip.days[index];
      dispatch({ type: 'removeDay', dayId });
      toast({ message: `Removed day ${index + 1}`, action: { label: 'Undo', onClick: () => dispatch({ type: 'restoreDay', day, index }) } });
    },
    [dispatch, toast, trip],
  );

  const addStop = useCallback((dayId, stop) => dispatch({ type: 'addStop', dayId, stop }), [dispatch]);
  const reorder = useCallback((columns) => dispatch({ type: 'reorder', columns }), [dispatch]);

  return (
    <article className={`trip ${locked ? 'is-locked' : ''}`} aria-busy={locked}>
      <section className="trip-hero fade-in">
        <PlacePhoto query={trip.destination || trip.title} className="trip-hero__photo" credit />
        <div className="trip-hero__bar">
          <button type="button" className="glass-round" onClick={onNewTrip} aria-label="Back to home" title="Back to home">
            <ArrowLeft size={18} />
          </button>
          <span className="trip-hero__label">Your itinerary</span>
          <button
            type="button"
            className={`glass-round heart ${trip.favorite ? 'is-on' : ''}`}
            aria-pressed={!!trip.favorite}
            aria-label={trip.favorite ? 'Remove from favourites' : 'Add to favourites'}
            title={trip.favorite ? 'Favourite' : 'Add to favourites'}
            disabled={locked}
            onClick={() => dispatch({ type: 'toggleFavorite' })}
          >
            <Heart size={18} />
          </button>
        </div>
      </section>

      <header className="trip-sheet glass fade-in">
        <ul className="stats" aria-label="Trip summary">
          <li>
            <CalendarDays size={15} aria-hidden="true" /> {stats.days} {stats.days === 1 ? 'day' : 'days'}
          </li>
          <li>
            <Route size={15} aria-hidden="true" /> {stats.stops} stops
          </li>
        </ul>
        <h1 className="trip__title">{trip.title}</h1>
        {trip.destination && (
          <p className="trip__place">
            <MapPin size={15} aria-hidden="true" /> {trip.destination}
          </p>
        )}
        <CategoryChips trip={trip} active={highlight} onToggle={(c) => setHighlight((h) => (h === c ? null : c))} />
        {trip.summary && (
          <>
            <h2 className="sheet-heading">About this trip</h2>
            <Summary text={trip.summary} />
          </>
        )}
        <div className="trip-sheet__footer">
          {stats.budgetTotal > 0 ? (
            <p className="price">
              {formatMoney(stats.budgetTotal, trip.currency)}
              <span>/ person</span>
            </p>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="btn-gradient"
            disabled={locked}
            onClick={() => document.getElementById('refine-input')?.focus()}
          >
            <WandSparkles size={17} aria-hidden="true" /> Refine with AI
          </button>
        </div>
      </header>

      <div className="toolbar" role="toolbar" aria-label="Itinerary tools">
        <div className="btn-group">
          <button type="button" className="btn btn--ghost btn--sm" disabled={!canUndo || locked} onClick={() => dispatch({ type: 'undo' })} title="Undo (Ctrl+Z)">
            <Undo2 size={15} aria-hidden="true" /> <span className="hide-sm">Undo</span>
          </button>
          <button type="button" className="btn btn--ghost btn--sm" disabled={!canRedo || locked} onClick={() => dispatch({ type: 'redo' })} title="Redo (Ctrl+Shift+Z)">
            <Redo2 size={15} aria-hidden="true" /> <span className="hide-sm">Redo</span>
          </button>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setExpanded(allExpanded ? new Set() : new Set(allIds))}
          disabled={!allIds.length}
        >
          {allExpanded ? <ChevronsDownUp size={15} aria-hidden="true" /> : <ChevronsUpDown size={15} aria-hidden="true" />}
          {allExpanded ? 'Collapse all' : 'Expand all'}
        </button>
        <button type="button" className="btn btn--secondary btn--sm toolbar__end" onClick={onNewTrip}>
          <Sparkles size={15} aria-hidden="true" /> New trip
        </button>
      </div>

      {trip.days.length > 1 && (
        <nav className="day-nav" aria-label="Jump to day">
          {trip.days.map((d, i) => (
            <a key={d.id} href={`#day-${d.id}`} className="day-nav__link" onClick={(e) => {
              e.preventDefault();
              document.getElementById(`day-${d.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}>
              <strong>Day {i + 1}</strong>
              {d.title && <span>{d.title}</span>}
            </a>
          ))}
        </nav>
      )}

      <WarningsBanner warnings={warnings} onDismiss={onDismissWarnings} />

      <div className="trip__layout">
        <div className="trip__main">
          {highlight && (
            <p className="highlight-note fade-in">
              Highlighting {(CATEGORY_META[highlight]?.label ?? highlight).toLowerCase()} stops ·{' '}
              <button type="button" className="link-btn" onClick={() => setHighlight(null)}>
                Show all
              </button>
            </p>
          )}
          <DayBoard
            trip={trip}
            highlight={highlight}
            expanded={expanded}
            locked={locked}
            onToggle={toggle}
            onMove={move}
            onMoveToDay={moveToDay}
            onRemove={remove}
            onAddStop={addStop}
            onRemoveDay={removeDay}
            onReorder={reorder}
          />
          <button type="button" className="add-day" disabled={locked || trip.days.length >= 14} onClick={() => dispatch({ type: 'addDay' })}>
            <Plus size={16} aria-hidden="true" /> Add a day
          </button>
          <p className="kbd-hints">
            <kbd>↑</kbd> <kbd>↓</kbd> move between stops · <kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> reorder · <kbd>Del</kbd> remove ·{' '}
            <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo
          </p>
        </div>
        <aside className="trip__side">
          <BudgetCard budget={trip.budget} currency={trip.currency} />
          <PackingCard
            items={trip.packingList}
            locked={locked}
            onToggle={(itemId) => dispatch({ type: 'togglePacking', itemId })}
            onAdd={(text) => dispatch({ type: 'addPacking', text })}
            onRemove={(itemId) => dispatch({ type: 'removePacking', itemId })}
          />
        </aside>
      </div>
    </article>
  );
}
