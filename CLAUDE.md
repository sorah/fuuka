# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Fuuka is realtime location sharing: mobile apps (Overland / OwnTracks) POST locations to
an authed API; a web map plots every user's latest position and refreshes once a second.
History is kept in DynamoDB. See `README.md` for the API reference, env vars, and full
deploy instructions — this file covers the parts that need reading multiple files.

## Layout

- `server/` — Ruby gem: Sinatra API + DynamoDB storage. Puma locally, AWS Lambda
  (container image, Function URL) in production via `apigatewayv2_rack`.
- `ui/` — React Router 7 SPA (SPA mode, `ssr: false`), TypeScript, Vite, SWR, Mapbox GL.
- `tf/` — reusable Terraform **module** (ECR/image build, Lambda, DynamoDB, S3, CloudFront).
- `utils/` — `deploy.rb` (frontend → S3 + CloudFront invalidation), `emulated_overland.rb`.

## Commands

```bash
# Local dev — runs server (Puma), ui (Vite), and a simulated location feed.
# The maintainer runs this themselves; assume it may already be up. Needs portless,
# overmind, and a populated .env. Don't launch it just to check something.
overmind start
# Frontend http://fuuka.localhost:1355 · server http://fuuka-server.localhost:1355
# (Vite proxies /api/* to the server)

# Server tests
cd server && bundle exec rspec
cd server && bundle exec rspec spec/storage_spec.rb            # one file
cd server && bundle exec rspec spec/app_spec.rb:42             # one example by line

# UI — there is no test runner or linter; "tests" means these must pass:
cd ui && pnpm typecheck && pnpm build
```

## Server architecture

- **Dependency injection via Rack env.** `Fuuka::App` is a `Sinatra::Base`; storage is not
  global. `App.rack(storage:)` returns a Rack app that stuffs the storage into
  `env['fuuka.storage']`, and handlers read it through the `storage` helper. Both entry
  points (`config.ru` for Puma, `lambda_handler.rb` for Lambda) construct `Storage` and
  call `App.rack`. Tests build the app the same way with a stubbed AWS client.

- **`Fuuka::Location`** (`location.rb`) is a `Data.define` — the single normalized reading
  shape all ingest sources produce. Units: `speed` m/s, distances meters, `course` degrees,
  `battery` 0–100. `as_data` is the DynamoDB JSON blob; `as_api` is the camelCase frontend
  shape; `from_data` reverses `as_data`.

- **Ingest** (`ingest/overland.rb`, `ingest/owntracks.rb`) are stateless `module_function`
  parsers: provider payload → `Array<Location>`. OwnTracks ignores non-`location` `_type`s
  and the endpoint must return a JSON array (`[]`); Overland returns `{"result":"ok"}`.

- **`Fuuka::Storage`** — one DynamoDB table (`pk`/`sk`) plus GSI `inverted` (`sk`/`pk`):
  - latest: `pk="latest:#{uid}"`, `sk="latest"`; history: `pk="history:#{uid}"`,
    `sk="history:#{uid}:#{iso8601}"`. `uid = base64url(sha256(name))`.
  - `all_latest` queries the `inverted` GSI for `sk="latest"`.
  - `put_location` writes latest always, but **skips the history entry when the reading is
    within `HISTORY_MIN_DISTANCE_M` (2 m) of the current latest** (haversine
    `Location#distance_to`) to avoid clutter while stationary.

- **Tests** stub the AWS SDK with `client.stub_responses` (no live DynamoDB / no Pebble).

## UI architecture

- **View state lives in the URL query string.** `useViewConfig` (`lib/config.ts`)
  parses/serializes `hidden`, `solo`, `tracking` (`track=0|1`), `soloMode` to the query
  and mirrors changes via `history.replaceState`. Defaults are omitted from the URL.
  `updateConfig` accepts a patch object **or** a functional updater (used so rapid toggles
  compose on live state).

- **Data fetching.** `home.tsx` polls `/api/locations` with SWR every 1s, paused while the
  tab is hidden (`usePageVisible`) and revalidated on return. `/api/config` supplies the
  Mapbox token. `home.tsx` is the single owner of selection (`selectedId`) and derives the
  render/fit lists from config (hidden filtered out; solo dims or hides the rest).

- **`LocationMap.tsx` follow/centering** is the most intricate piece:
  - Re-frames in a `useEffect` keyed on `fitKey` (the tracked set + rounded positions).
  - Holds the current zoom while followed users still fit; re-picks zoom only on first
    engage, the one-shot initial fit, a **membership change** (show/hide/solo), or when
    they no longer fit. A one-shot fit runs even when `track=0` so the map opens framed.
  - `paddingForPanes()` measures the real floating pane elements (`.fuuka-control`,
    `.fuuka-detail`) and offsets the camera so followed users aren't hidden behind them;
    it ignores the axis a full-width/height pane spans and clamps per axis (orientation
    aware) so a side pane can't crush the view in portrait.
  - Only a user *drag* unlocks tracking, not a zoom (see the `onDragStart` guard).

- **Speed → color** (`lib/speed.ts`) is shared by the marker and the control-pane pill:
  HSL hue interpolated blue→red, fully red at 140 km/h.

- **Panes.** `ControlPane` (users) and `DetailPane` (FR24-style stats for the selected
  user) stack in a right-docked `.fuuka-panes` container on desktop; on mobile the detail
  pane becomes a bottom sheet and the control pane collapses to floating chips. The Follow
  toggle: single click toggles follow (immediately), double-tap toggles a Screen Wake Lock
  (`lib/wakeLock.ts`, turns the button green).

## Infrastructure note

`tf/` is a Terraform **module**, not a root config — do not `terraform apply` it directly.
It's consumed from an external root configuration that passes variables in and re-exports
outputs. Editing `server/` sources changes the image tag (content hash), so a downstream
`apply` rebuilds and redeploys the Lambda.
