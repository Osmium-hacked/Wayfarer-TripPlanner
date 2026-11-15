# Wayfarer: AI trip planner

Describe a trip in plain words ("4 slow days in Lisbon, seafood and viewpoints, no museums"). An LLM returns a
**structured JSON itinerary**, and the app turns it into an interactive day-by-day plan: expand stops, remove them,
reorder them (drag and drop, buttons, or keyboard, within a day or across days), and refine the plan with follow-up
prompts that edit it in place.

It is not a chatbot. The model's text is never shown to the user directly. It is parsed, validated and normalized
into app state, and every way the model can misbehave has a defined UI outcome.

The interface uses a warm "glass" style: frosted cards over a soft peach-and-lavender backdrop, real destination
photos, black pill buttons, and matching light and dark themes.

**▶ Demo video:** [`demo/wayfarer-demo.mp4`](demo/wayfarer-demo.mp4) (2 min 20 s, captioned, desktop then mobile).

---

## Quick start

Requires **Node 20.19+**.

```bash
npm install
npm start          # API on :8787 + Vite on :5173
```

Open http://localhost:5173.

**No API key? It still runs.** Without `LLM_API_KEY` the server runs in **demo mode** and generates sample
itineraries locally (the header shows a "Demo mode" badge). To use a real model:

```bash
cp .env.example .env    # then set LLM_API_KEY (and optionally LLM_BASE_URL / LLM_MODEL)
npm start
```

Any OpenAI-compatible chat-completions endpoint works. `.env.example` has ready-made blocks for **Groq** (default,
free tier), **Gemini**, **OpenRouter** and **Ollama** (local, free).

| Command | What it does |
| --- | --- |
| `npm start` | API server + Vite dev server together |
| `npm test` | Unit tests (parsing, normalization, reducer, photo lookup) |
| `npm run smoke` | End-to-end browser test of every feature (needs `npm start` running and Chrome installed) |
| `npm run demo` | Re-records the captioned demo video to `demo/wayfarer-demo.mp4` (needs Chrome + `ffmpeg`) |
| `npm run build && npm run serve` | Production build served by the Express server (honours `PORT`) |

---

## How it works

```
 Browser (React)                                Node (Express)                 LLM provider
 ───────────────                                ──────────────                 ────────────
 Composer / RefineBar
   │  useItineraryGenerator.run()
   │    POST /api/itinerary  {prompt, current?, repair?}
   │ ─────────────────────────────────────────▶ validate body
   │                                            build messages (system schema) ─▶ /chat/completions stream=true
   │    NDJSON stream: {"type":"delta"} …       ◀── SSE deltas ──────────────────
   │ ◀───────────────────────────────────────── {"type":"done"} | {"type":"error"}
   │  live preview  ← parsePartialJson()   (throttled, best-effort)
   │  on done       ← parseModelJson() → normalizeItinerary()   ← the trust boundary
   │                    ├─ ok → dispatch(load | replace)   (undoable)
   │                    ├─ parse/shape/empty → ONE automatic repair request
   │                    └─ anything else → typed ItineraryError → ErrorPanel
```

- **The API key never reaches the browser.** The React app only talks to `/api/itinerary`; the Express server
  holds the key and calls the provider (`server/llm.js`, plain `fetch`, no SDK, so the SSE parsing is visible).
- **Streaming.** The server re-emits the provider's SSE deltas as NDJSON events. The client renders a live preview by
  parsing the *incomplete* JSON: it scans for safe cut points (after `{`/`[`/`}`/`]`, before `,`) and closes the open
  brackets (`src/lib/parseJson.js`).
- **Normalization is the trust boundary** (`src/lib/normalize.js`). Whatever the model sends, components only ever
  see one shape. Small drift is fixed silently (`activities` instead of `stops`, `"2 hours"` → `120`, `"3:30 pm"` →
  `"15:30"`, `"Restaurant"` → `food`, a stop given as a bare string, `{ "itinerary": {...} }` nesting, a bare array
  of days). Anything thrown away is reported to the user as a warning.
- **State** is a pure reducer wrapped in undo/redo history (`src/state/tripReducer.js`). User edits *and* AI
  refinements go through it, so everything is undoable and one drag = one undo step.
- **Destination photos** come from Wikipedia's free REST API (no key; `src/lib/photos.js`). Lead images are often
  flags, maps or satellite shots, so non-photos are rejected and the lookup falls back to the city, a "Tourism in X"
  article, or a small list of scenic aliases. Results are cached in `localStorage`, and a warm gradient shows while
  loading or when nothing suitable exists. Each photo links back to its Wikipedia page.

### Handling bad AI output

| What the model / network does | What the user sees |
| --- | --- |
| Prose or ```` ```json ```` fences around the JSON, `<think>` blocks, trailing chatter | Nothing. It's stripped. |
| Trailing commas | Nothing. Fixed in a fallback parse. |
| Truncated / invalid JSON, wrong shape, empty reply | "Fixing a malformed answer…" → **one automatic repair request** (the model is shown its own output and the parse error). If that also fails: an error card with *Try again*, *Edit request*, and the raw output under *Technical details*. |
| Valid but messy data (unnamed stops, unreadable budget, >14 days…) | Itinerary renders; a dismissible banner lists exactly what was skipped or trimmed. |
| Model says the input isn't a trip | A friendly "That doesn't look like a trip yet" with the model's own hint. No retry button, since retrying won't help. |
| Slow first token | "Taking a little longer than usual" after 8 s. |
| Connected but stalled | Client idle timeout after 30 s without bytes → *The AI is taking too long* + retry. Server also has a 90 s hard timeout. |
| Provider 5xx / 429 / bad key / network down / stream dropped mid-way | Specific copy for each (`src/lib/errors.js`), retry where it makes sense. |
| User fires a new request (or cancels, or switches trip) while one is in flight | The old request is **aborted** (the server aborts the upstream call too) and every state update is guarded by a run id, so a stale response can never overwrite a newer one. |
| A **refinement** fails | The current itinerary is untouched; the error appears inline above the refine bar with the instruction kept for retry. |

**Try all of these yourself:** the flask icon in the header opens a *failure simulator* (malformed JSON, wrong
shape, empty, messy data, not-a-trip, slow, stall, 503, 429). It works in demo and live mode. Disable it in production
with `ALLOW_SIMULATE=false`.

---

## Features

**Screens**
- **Welcome** (first visit only): photo card and a "Get Started" button.
- **Home:** a frosted prompt card with a gradient "orb" input; trip-style tiles (Relaxed, Foodie, Adventure, Culture,
  Family, Budget) that are added to the request; a **Popular places** photo carousel (tap a card to customise its
  request, or its arrow to plan it right away); and your saved trips with thumbnails.
- **Trip:** a full-width destination photo with back and favourite buttons, and an overlapping glass panel with the
  title, category tiles that **highlight matching stops**, a "See more" description, the per-person budget and a
  **Refine with AI** button. Below it: the day-by-day timeline, budget chart and packing list.

**Required**
- React with hooks and function components only
- Free-form text input with examples, character limit, Enter to plan (Shift+Enter for a new line)
- Real LLM through a backend proxy; structured JSON → interactive, stateful UI
- Expand / remove / reorder stops (drag & drop across days, ↑/↓ buttons, *Move to day…*, keyboard)
- Loading (step indicator + skeletons + live preview), error, and empty states
- Works on mobile: thin timeline rail, touch-friendly drag handles, sticky day navigation, safe-area aware refine bar

**Stretch**
- ✅ Different block types: timeline stops, a **budget bar chart**, a **packing checklist**
- ✅ Streaming with a live partial-JSON preview
- ✅ Refinement loop: follow-ups edit the existing itinerary (the current JSON is sent back), undoable
- ✅ Save & reload: trips autosave to `localStorage`, "My trips" drawer (favourites first), resume from the home screen
- ✅ Polish: light/dark/system theme, animations (respecting `prefers-reduced-motion`), keyboard navigation
  (↑/↓ between stops, Alt+↑/↓ to reorder, Del to remove, Ctrl+Z / Ctrl+Shift+Z), focus management after moves
  and deletes, toast undo for destructive actions

---

## Project structure

```
server/
  index.js        Express app: validation, NDJSON streaming, timeouts, error mapping
  llm.js          OpenAI-compatible streaming client (SSE parsing)
  prompts.js      System prompt (schema) + create / refine / repair message builders
  mock.js         Demo-mode generator + failure simulations
src/
  lib/
    parseJson.js  Extract JSON from model text; full + partial (streaming) parsing
    normalize.js  Validate & coerce model output into the app's trip shape
    errors.js     ItineraryError kinds + user-facing copy
    api.js        fetch + NDJSON reader, idle timeout, abort handling
    storage.js    Guarded localStorage (validated reads, quota-safe writes)
    photos.js     Wikipedia photo lookup: candidates, non-photo filter, caching
  hooks/
    useItineraryGenerator.js   stream → preview → parse → validate → repair; race-safe
    useTheme.js, useHealth.js, useToasts.jsx
  state/tripReducer.js         Pure trip reducer + undo/redo history
  components/                  Welcome, Composer, PopularPlaces, PlacePhoto, GenerationProgress,
                               ErrorPanel, TripView, DayBoard, StopCard, AddStopForm, SideCards,
                               RefineBar, SavedTrips, Header
tests/                         Vitest: parser, normalizer, reducer, photos (58 tests)
scripts/
  smoke.mjs        Playwright end-to-end check of every feature (23 steps)
  record-demo.mjs  Scripted, captioned demo recording → MP4 via ffmpeg
  shots.mjs        Screenshots of the main screens (light/dark, desktop/mobile) for design review
demo/              The recorded demo video
```

---

## Decisions & trade-offs

- **Plain `fetch` instead of an AI SDK** so the streaming and error handling are explicit and easy to explain.
  JSON mode (`response_format`) is opt-in (`LLM_JSON_MODE=true`) because some providers reject it together with
  streaming. The prompt plus the tolerant parser plus the repair loop cover the gap.
- **Hand-written normalizer instead of a schema library.** Rejecting output wasn't the goal; *salvaging* it was, so
  each field has explicit coercion rules and the user gets told what was dropped.
- **One repair attempt, not N.** It fixes most truncation/format slips without doubling latency on every failure.
- **Refine sends the whole itinerary back** and replaces it (ids re-generated, packing ticks carried over). This is
  simpler and more robust than asking the model for a patch/diff format.
- **Undo for removals is targeted** (`restoreStop` puts that exact stop back where it was), so the toast's "Undo"
  stays correct even if you made other edits in between.
- **Category tiles highlight instead of filter.** Hiding stops would break drag-and-drop ordering, so non-matching
  stops are dimmed and every interaction keeps working.
- **Photos from Wikipedia rather than a stock-photo API**: free, no key to manage, and every destination has a page.
  The trade-off is less control over image quality, handled by the non-photo filter and fallbacks.

## Known limitations

- Refinement regenerates the whole itinerary, so a model may occasionally change things it wasn't asked to change
  (mitigated by the prompt and one-click undo).
- Stops have no real geodata: map links are Google Maps searches, and travel times are the model's estimate.
- Costs/budgets are model estimates in whatever currency it picks; there is no conversion.
- Trips are stored per-browser in `localStorage` (no accounts or sync); oldest trips are dropped past 20 or on quota errors.
- Demo mode's refinement doesn't actually change the plan; it only annotates the summary.
- Photos need internet access to Wikipedia. Picking a good one is heuristic, so an occasional destination gets an
  unrepresentative photo or the gradient fallback.
- No rate limiting on the proxy endpoint. Add one before deploying publicly.

## What I'd do next

- Component tests (React Testing Library) for the generator hook's race handling and the error states
- Editable stop fields (time, notes) and a map view
- Rate limiting + request logging on the API; deploy (Render/Fly/Vercel functions)
- Diff view after a refinement ("3 stops changed on day 2")

---

## AI usage note

I built this with **Claude Code** (Anthropic's AI coding agent, Claude Opus 5.5) and I'm being upfront about how much
it did. I gave it the assignment PDF and asked for a trip planner with polished UI/UX. From there the agent:

- Chose the architecture (Vite + React frontend, Express proxy, plain `fetch` streaming instead of an SDK) and wrote
  the code: server, prompts, parser, normalizer, reducer, hooks, components, CSS and the unit tests (58 now).
- Ran the app in a browser and checked every failure mode through the built-in simulator: auto-repair, unrecoverable
  JSON, wrong shape, not-a-trip, 503, messy data, the 30 s stall timeout, and a cancel-then-resubmit race. It also
  tested drag-and-drop across days, keyboard reordering, delete + undo, refinement success and failure, and the
  layout at 375 px in light and dark themes.
- Fixed the bugs that testing found: an API/Vite port clash, focus being lost after deleting a stop, a stray separator
  in stop details, the mode badge clipping on mobile, and refinements resetting packing-list checkmarks.
- Redesigned the interface from a reference mockup I supplied (frosted glass, photo cards, black pill buttons): the
  welcome screen, home carousel, trip-style tiles, photo hero, category highlighting and favourites.
- Wrote a Playwright smoke test that drives Chrome through every feature. It caught a real bug: pressing **Cancel**
  during generation immediately restarted the request, because React reused the clicked Cancel button as the submit
  button. The fix gives the two buttons separate `key`s.
- Scripted and recorded the demo video.
- Split the work into the commit history in this repo.

My part was directing the work, deciding what to keep, and going through the code so I can explain and extend it in
the interview.

**Not yet verified:** all testing used the built-in demo generator. The live-provider path (`server/llm.js`) has not
been run against a real API key yet.

## Time spent

- **2026-11-09:** about 45 minutes to build and browser-test the first version.
- **2026-11-10:** a short session to set up the git history and publish the repo.
- **2026-11-12:** about 1½ hours for the UI redesign, the end-to-end smoke test and the demo video.

That is well under the 8-hour budget. I spent the time saved on breadth (streaming, refinement, saved trips,
theming) and on polish and testing.
