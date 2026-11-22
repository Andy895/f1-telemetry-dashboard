# F1 Telemetry Dashboard

A second-monitor dashboard of live Formula 1 race data from [OpenF1](https://openf1.org), meant to sit beside the race on F1 TV.

![Replay of the 2025 Abu Dhabi Grand Prix](docs/replay-abu-dhabi-2025.png)

## What it does today (Phase 0)

- Pick any past session from 2023 onward and replay it at 1x, 2x, 5x or 10x, with a seek bar.
- Laid out for a portrait 1080x1920 monitor.
- Timing tower: position, gap to leader, interval (green inside 1 s), last and best lap (purple for fastest), tyre compound and age, pit stops.
- Tyre strategy chart, battles within 1 s, and a pit stop log.
- Track map: circuit outline traced from car positions and turned to stand tall, with cars drawn from a short buffer so they glide smoothly at every replay speed.
- Header with lap counter, track status (green, yellow, safety car, red, chequered) and weather.
- Race control feed: flags, penalties, incidents, newest first.
- Sync delay: hold the dashboard back N seconds to match your TV stream.

Live data (Phase 1) will use the same pipeline once an OpenF1 sponsor account is set up.

## Run it on Windows

1. Install [Node.js](https://nodejs.org) 20 or newer (the LTS installer is fine).
2. Open PowerShell in this folder and run:

   ```powershell
   npm install
   npm start
   ```

3. Open <http://localhost:8787> in a browser on the second (portrait, 1080x1920) monitor and press F11 for full screen.
4. Pick a race. The first load of a race downloads it from OpenF1 (about a minute, because the free API allows 30 requests a minute). After that it is cached in `data/cache` and loads instantly.

To jump straight into a race: `npm start -- --session 9839` (2025 Abu Dhabi GP).

### Development

```powershell
npm run dev        # server with auto-reload + Vite dev server on http://localhost:5173
npm test           # server unit tests
npm run typecheck
```

Behind a corporate proxy, set `HTTPS_PROXY` and run with `NODE_USE_ENV_PROXY=1` (Node 22.21+) so the server can reach OpenF1.

## How it works

```
OpenF1 REST (history) ──► server: replay player ──► sync delay ──► live store ──► WebSocket ──► React dashboard
OpenF1 MQTT (live, Phase 1) ─┘
```

- `server/src/openf1/client.ts` rate-limited REST client with a disk cache.
- `server/src/replay/` loads a session, merges every topic into one timeline, and plays it against the clock.
- `server/src/pipeline/` sync-delay buffer and the latest-state store (new browser tabs get a snapshot).
- `server/src/net/` WebSocket hub and HTTP server (serves the built web app).
- `web/src/` React + Zustand dashboard; car dots are interpolated at 60 fps between 3.7 Hz samples.

## Data and terms

Data comes from [OpenF1](https://openf1.org), an unofficial community project licensed CC BY-NC-SA 4.0 for non-commercial use. This project is not associated with Formula 1 or the FIA.
