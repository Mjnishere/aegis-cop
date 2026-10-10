# AEGIS-COP — Demo Runbook (deterministic, offline)

Rehearsed end to end three times on 2026-10-10 with identical results (headless
Chrome against the commands below). Everything shown is a **prototype**: hazard
scores are uncalibrated heuristics, drainage is synthetic, the "AI" evidence
analysis is a mock, and coverage is Hubballi-Dharwad only.

## 0. Prerequisites (once)

```bash
# repo root
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.txt -c backend/requirements.lock.txt
cd frontend && npm ci --ignore-scripts --no-audit --no-fund && cd ..
```

Terrain needs a locally downloaded CartoDEM tile (see `data/terrain/README.md`); pass
its path with `DEM_PATH`. Without it the demo still runs, but terrain is reported as
unknown and hazard values differ from the numbers below.

## 1. Start (three terminals, from the repo root)

**Terminal 1 — backend, offline and on a fresh demo database**

```bash
cd backend
export AEGIS_DEMO_DIR=$(mktemp -d /tmp/aegis-demo-XXXX)
DATABASE_PATH=$AEGIS_DEMO_DIR/demo.db \
DEM_PATH=/path/to/cdnd43d.tif \
HTTPS_PROXY=http://127.0.0.1:9 HTTP_PROXY=http://127.0.0.1:9 NO_PROXY=localhost,127.0.0.1 \
../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The proxy variables point the backend's outbound calls (Open-Meteo, IMD) at a closed
local port, so weather is deterministically *unavailable* and the demo never depends
on venue internet. The browser's map tiles still need internet. Bind to `127.0.0.1`
only: the API has no authentication.

**Terminal 2 — frontend**

```bash
cd frontend
npm run dev            # http://localhost:5173
```

**Terminal 3 — seed and warm up (wait for the backend first)**

```bash
.venv/bin/python scripts/demo/seed_demo.py          # ~5 s; refuses if the DB is not empty
curl -s -o /dev/null -w "warm-up %{http_code} %{time_total}s\n" \
  "http://127.0.0.1:8000/api/route?origin_lat=15.4589&origin_lon=75.0078&destination_lat=15.3647&destination_lon=75.1240&hazard_aware=true"
```

The warm-up (~40 s) fills the terrain cache so the obstruction step takes ~15–20 s
instead of ~40 s. Then open http://localhost:5173 and keep the Overview tab.

## 2. Script (3–5 minutes)

| Time | Action | What the audience sees |
|---|---|---|
| 0:00 | Overview | COP: 3 DEMO threats, units, evidence (SIMULATED), layer panel with counts from the backend, "Weather unavailable — hazard scores are partial" |
| 0:30 | Planner → **Unkal - Vidyanagar → Select → PLAN** | Blue route; badge "AVOIDS ACTIVE THREAT ZONES" |
| 0:45 | Terminal 3: `.venv/bin/python scripts/demo/add_road_closure.py` | Prints the new CRITICAL DEMO threat; route 18 → 21 nodes |
| 0:55 | **Modify → PLAN** (zoom in 2 steps) | Route detours around the new red zone (+62 m) |
| 1:15 | Right panel: **START ROUTE MONITORING** (~10 s) | Corridor Dharwad → Hubballi; "LOW (39.48), partial data — up to 99.48, confidence LIMITED" (uncertainty shown, not hidden) |
| 1:35 | **OBSTRUCTION** (~15–20 s, narrate) | INVALIDATED, reason "CONTROLLED DEMO: simulated road obstruction…", proposal "18.6 km, ETA 51 min, Hazard LOW (34.75) — partial data" |
| 2:00 | Close the planner (✕), zoom in | Green proposed route around the obstruction |
| 2:15 | **APPROVE REPLACEMENT ROUTE** | Status REPLACED; COP route updated |
| 2:30 | **RUN FLOOD RESPONSE** (~20 s) | Toast sequence; header "CONTROLLED SCENARIO … CRITICAL"; demo incidents appear |
| 2:55 | **WEATHER & PREPAREDNESS** tab | "CONTROLLED DEMONSTRATION SCENARIO" badge, critical preparedness, hourly chart |
| 3:20 | **OVERVIEW** → **CHECK ROUTE** (~15 s) | INVALIDATED: "Route intersects active CRITICAL threat zone(s)…", CRITICAL (94.75), confidence MEDIUM |
| 3:40 | *(optional)* **FIND REPLACEMENT ROUTE** (up to ~45 s) | Honest "No safe alternative route avoids the blocking threat zones" |
| 4:00 | Close | Verified vs. prototype (see below) |

Talking points that are safe to claim: threat-aware routing with hard CRITICAL
exclusion and explicit no-safe-route; persisted, audited route state; COP from
canonical stores with demo/simulation labelling; explicit coverage and data-gap
reporting; 126 automated offline tests. Do **not** claim validated flood prediction,
real AI/CV, sensor fusion or regional portability.

## 3. Fallbacks

| Problem | Do this |
|---|---|
| Obstruction / replacement takes > 60 s | Narrate, then continue with the planner road-closure step (fast); next time run the warm-up first |
| No safe route / unexpected verdict | It is the real backend verdict: explain hard CRITICAL exclusion; continue with RUN FLOOD RESPONSE |
| Backend crashed | Restart Terminal 1 with the same `DATABASE_PATH` (state persists), reload the page |
| Need a clean slate | Stop backend, `export AEGIS_DEMO_DIR=$(mktemp -d /tmp/aegis-demo-XXXX)`, restart, re-seed, warm up |
| No venue internet (blank map tiles) | Layers, panels and routes still render on a blank background; narrate, or use backup screenshots |
| Frontend broken | Show the API at http://127.0.0.1:8000/docs (`/api/cop`, `/api/route`, `/api/geo/coverage`) |
| DEM file missing | Start without `DEM_PATH`: everything runs; terrain shows as unknown and scores are partial |
| Weather looks wrong in live mode | Use the offline start above (deterministic); the scenario button supplies labelled controlled weather |
