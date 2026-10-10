# AEGIS-COP: capabilities and limitations

This is a hackathon prototype. The table separates what is implemented from what is
simulated, partial or only planned. The evidence for each "implemented" item (tests,
browser checks) is recorded in
[project/IMPLEMENTATION_STATUS.md](project/IMPLEMENTATION_STATUS.md).

## Implemented (backend logic, persisted, tested)

| Capability | Notes |
|---|---|
| Threat-aware routing on the OSM road graph | CRITICAL = hard exclusion; HIGH/MODERATE/LOW travel-time multipliers; explicit no-safe-route result |
| Route monitoring | Persisted status (ACTIVE / AT_RISK / INVALIDATED / REPLACED) with timestamped transitions and reasons |
| Alternative recommendation and operator decision | Recommendations persisted; approve/reject recorded with time, actor and reason |
| Canonical evidence and threats | Evidence carries provenance; threats reference their evidence |
| Common Operating Picture | Snapshot and counts derived from the canonical stores; demo and simulated records flagged |
| Decision chain in the UI | Derived only from the persisted mission record and the COP |
| Coverage enforcement | Inputs > 250 m from the road network are rejected (`OUTSIDE_COVERAGE`) |
| Terrain sampling | CartoDEM, when available locally, with explicit "unavailable" reasons |
| Degraded-state reporting | Weather unknown ≠ zero rain; backend outage shown as UNREACHABLE / STALE |

## Simulated (clearly labelled in UI and API)

- **Field and sensor reports.**
  - The mission workflow's observations come from fixed simulation profiles
    (`ROAD_FLOODING_SENSOR`, `FIELD_TEAM_BLOCKAGE`) or demo scripts.
  - Each report is placed at the midpoint of the current mission route so the demo is
    reproducible.
  - The evidence "confidence" is a value declared by the profile, not a measurement.
- **Demo seed data:** threats with source `CONTROLLED_DEMO`, the field-unit roster and
  unit positions.
- **Dispatch:** "RECORD SIMULATED DISPATCH" records a status change. The backend replies
  "SIMULATED RESPONSE. NO REAL RESOURCE HAS BEEN DISPATCHED."
- **Rain scenario:** the header button supplies controlled weather values, labelled as
  CONTROLLED SCENARIO.

## Heuristic / partial

- **Hazard scores:** 0.6 × weather + 0.4 × terrain heuristics, uncalibrated, not a risk
  probability.
  - Routing penalties and the 25 m buffer are also uncalibrated
    (`backend/app/config/routing_policy.py`).
- **Threat confidence:** a single-source rule (MEDIUM/LOW, never HIGH). There is no
  multi-source corroboration.
- **Weather:** Open-Meteo at **one point** for the whole city, and unavailable offline.
  - The regional (IMD) risk feed is not configured, so the National tab shows no
    regions.
- **Terrain:** a Digital Surface Model (includes buildings and canopy), not bare earth.
  - About 12.6% of the road graph lies west of the DEM tile.
- **Drainage network and flood nowcast:** synthetic grid and prototype heuristics.
- **Incident "severity score" (80/60/40):** fixed per severity level.
- **Response-plan resource matching:** distance-based heuristic over a demo resource
  list.
- **No-safe-route results are not persisted.** They are shown when computed and must be
  recomputed after a page reload.
- **Persistence coverage:** some legacy modules keep state in memory (resources, alerts,
  citizens, legacy field evidence, audit logs).

## Not implemented (planned or out of scope)

- Live sensor, drone or field-app ingestion.
- Computer vision or YOLO inference. The legacy "AI" evidence analysis is a
  filename-keyword mock and reports itself as such.
- Multi-sensor fusion.
- Satellite change detection.
- Live GPS tracking of field units.
- Calibrated or validated flood prediction.
- Authentication, roles and audit of who may approve. The API has no auth and must be
  bound to `127.0.0.1`.
- Portability to other regions. Behaviour is only demonstrated on Hubballi-Dharwad, with
  one road graph and one DEM tile.
- A 3D globe or terrain visualisation.

## Operational caveats

- **Alternatives:** an alternative avoids only the threat zones currently known to the
  backend. It is **not** a guarantee that the road is passable or safe.
- **Travel times:** imputed by OSMnx from road-type speed defaults; not validated.
- **Map tiles:** OpenStreetMap and NASA GIBS tiles need internet access in the browser.
  The backend can run fully offline.
