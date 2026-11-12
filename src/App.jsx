import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Composer, withVibes } from './components/Composer.jsx';
import { ErrorPanel } from './components/ErrorPanel.jsx';
import { GenerationProgress } from './components/GenerationProgress.jsx';
import { Header } from './components/Header.jsx';
import { PopularPlaces } from './components/PopularPlaces.jsx';
import { RefineBar } from './components/RefineBar.jsx';
import { SavedTripsDrawer, TripListItem } from './components/SavedTrips.jsx';
import { TripView } from './components/TripView.jsx';
import { Welcome } from './components/Welcome.jsx';
import { useHealth } from './hooks/useHealth.js';
import { useItineraryGenerator } from './hooks/useItineraryGenerator.js';
import { useTheme } from './hooks/useTheme.js';
import { useToast } from './hooks/useToasts.jsx';
import { deleteTrip, loadCurrentTrip, loadTrips, saveTrip, setCurrentTripId } from './lib/storage.js';
import { historyReducer, initialHistory, toModelShape } from './state/tripReducer.js';

const WELCOME_KEY = 'wayfarer:welcomed';
function readWelcomed() {
  try {
    return localStorage.getItem(WELCOME_KEY) === '1';
  } catch {
    return true; // storage blocked: don't trap the user on the intro
  }
}

const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

export default function App() {
  const [history, dispatch] = useReducer(historyReducer, initialHistory, (init) => {
    const saved = loadCurrentTrip();
    return saved ? { ...init, present: saved } : init;
  });
  const trip = history.present;
  const tripIdRef = useRef(trip?.id ?? null);
  tripIdRef.current = trip?.id ?? null;

  const [prompt, setPrompt] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [savedTrips, setSavedTrips] = useState(loadTrips);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [simulate, setSimulate] = useState('');
  const [vibes, setVibes] = useState([]);
  const [welcomed, setWelcomed] = useState(readWelcomed);
  const textareaRef = useRef(null);
  const focusComposerRef = useRef(false);

  const create = useItineraryGenerator();
  const refine = useItineraryGenerator();
  const health = useHealth();
  const { theme, cycle: cycleTheme } = useTheme();
  const toast = useToast();

  // Autosave every change (debounced) and remember which trip is open.
  useEffect(() => {
    if (!trip) {
      setCurrentTripId(null);
      return;
    }
    const t = setTimeout(() => {
      if (!saveTrip(trip)) toast({ message: 'Couldn’t save. Browser storage is full or disabled.', tone: 'danger' });
      setCurrentTripId(trip.id);
      setSavedTrips(loadTrips());
    }, 300);
    return () => clearTimeout(t);
  }, [trip, toast]);

  const generate = useCallback(
    async (text, vibeIds = vibes) => {
      const fullPrompt = withVibes(text, vibeIds);
      const result = await create.run({ prompt: fullPrompt, simulate });
      if (!result) return;
      const now = Date.now();
      dispatch({ type: 'load', trip: { ...result.itinerary, prompt: fullPrompt, createdAt: now, updatedAt: now } });
      setWarnings(result.warnings);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [create, simulate, vibes],
  );

  const pickPlace = useCallback((place) => {
    setPrompt(place.prompt);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => textareaRef.current?.focus({ preventScroll: true }), 0);
  }, []);

  const planPlace = useCallback(
    (place) => {
      setPrompt(place.prompt);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      generate(place.prompt);
    },
    [generate],
  );

  const startApp = useCallback(() => {
    try {
      localStorage.setItem(WELCOME_KEY, '1');
    } catch {
      /* ignore */
    }
    setWelcomed(true);
    focusComposerRef.current = true;
  }, []);

  const applyRefinement = useCallback(
    async (instruction) => {
      if (!trip) return false;
      const startedOn = trip.id;
      const before = trip;
      const result = await refine.run({
        prompt: instruction,
        current: toModelShape(trip),
        originalPrompt: trip.prompt,
        simulate,
      });
      // Ignore the result if the user switched trips while it was running.
      if (!result || tripIdRef.current !== startedOn) return false;
      dispatch({ type: 'replace', trip: result.itinerary });
      setWarnings(result.warnings);
      toast({
        message: 'Itinerary updated',
        tone: 'success',
        action: { label: 'Undo', onClick: () => dispatch({ type: 'replace', trip: before }) },
      });
      return true;
    },
    [trip, refine, simulate, toast],
  );

  const goHome = useCallback(() => {
    refine.cancel();
    create.cancel();
    dispatch({ type: 'clear' });
    setWarnings([]);
    setPrompt('');
    focusComposerRef.current = true;
    window.scrollTo({ top: 0 });
  }, [refine, create]);

  // Focus the composer once it has actually mounted (after leaving a trip or the intro).
  useEffect(() => {
    if (!trip && welcomed && focusComposerRef.current) {
      focusComposerRef.current = false;
      textareaRef.current?.focus();
    }
  }, [trip, welcomed]);

  const openTrip = useCallback(
    (saved) => {
      refine.cancel();
      create.cancel();
      dispatch({ type: 'load', trip: saved });
      setWarnings([]);
      setDrawerOpen(false);
      window.scrollTo({ top: 0 });
    },
    [refine, create],
  );

  const removeSavedTrip = useCallback(
    (victim) => {
      deleteTrip(victim.id);
      setSavedTrips(loadTrips());
      if (victim.id === tripIdRef.current) dispatch({ type: 'clear' });
      toast({
        message: `Deleted “${victim.title}”`,
        action: {
          label: 'Undo',
          onClick: () => {
            saveTrip(victim);
            setSavedTrips(loadTrips());
          },
        },
      });
    },
    [toast],
  );

  // Global undo/redo shortcuts (not while typing, where the browser's own undo applies).
  useEffect(() => {
    const onKey = (e) => {
      if (!trip || isTyping(document.activeElement) || refine.isLoading) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'undo' });
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [trip, refine.isLoading]);

  // Favourites first, then most recently edited.
  const sortedTrips = [...savedTrips].sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const recent = sortedTrips.slice(0, 4);

  if (!welcomed && !trip) {
    return <Welcome onStart={startApp} />;
  }

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Header
        health={health}
        theme={theme}
        onCycleTheme={cycleTheme}
        tripCount={savedTrips.length}
        onOpenTrips={() => setDrawerOpen(true)}
        onHome={goHome}
        simulate={simulate}
        onSimulateChange={setSimulate}
      />

      <main id="main" className={`main ${trip ? 'main--trip' : 'main--home'}`}>
        {trip ? (
          <TripView
            key={trip.id}
            trip={trip}
            dispatch={dispatch}
            canUndo={history.past.length > 0}
            canRedo={history.future.length > 0}
            warnings={warnings}
            onDismissWarnings={() => setWarnings([])}
            locked={refine.isLoading}
            onNewTrip={goHome}
          />
        ) : (
          <div className="home">
            <section className="greet glass">
              <h1 className="greet__title">Where to next?</h1>
              <p className="greet__lede">Describe a trip in your own words. We’ll plan every day.</p>
              <Composer
                value={prompt}
                onChange={setPrompt}
                onSubmit={(text) => generate(text)}
                onCancel={create.cancel}
                loading={create.isLoading}
                textareaRef={textareaRef}
                vibes={vibes}
                onToggleVibe={(id) => setVibes((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]))}
              />
            </section>

            {create.isLoading && (
              <GenerationProgress
                phase={create.phase}
                preview={create.preview}
                slow={create.slow}
                repairing={create.repairing}
                received={create.received}
              />
            )}

            {create.status === 'error' && (
              <ErrorPanel
                error={create.error}
                onRetry={() => generate(prompt.trim())}
                onEdit={() => {
                  create.reset();
                  textareaRef.current?.focus();
                }}
              />
            )}

            {!create.isLoading && <PopularPlaces onPick={pickPlace} onPlan={planPlace} disabled={create.isLoading} />}

            {!create.isLoading && recent.length > 0 && (
              <section className="section fade-in" aria-labelledby="recent-heading">
                <div className="section__head">
                  <h2 id="recent-heading">Your trips</h2>
                  <button type="button" className="link-btn" onClick={() => setDrawerOpen(true)}>
                    See all {savedTrips.length > recent.length ? savedTrips.length : ''}
                  </button>
                </div>
                <ul className="trip-list trip-list--grid">
                  {recent.map((t) => (
                    <TripListItem key={t.id} trip={t} onOpen={openTrip} />
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </main>

      {trip && <RefineBar refine={refine} onSubmit={applyRefinement} onRetry={applyRefinement} />}

      <SavedTripsDrawer
        open={drawerOpen}
        trips={sortedTrips}
        currentId={trip?.id}
        onClose={() => setDrawerOpen(false)}
        onOpen={openTrip}
        onDelete={removeSavedTrip}
      />
    </>
  );
}
