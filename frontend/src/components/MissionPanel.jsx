import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '../config';

// Demo mission corridor. The route itself is computed by the backend road graph.
const MISSION = {
  name: 'Supply convoy',
  origin: { lat: 15.4030, lon: 75.0800, label: 'Navanagar staging area' },
  destination: { lat: 15.3647, lon: 75.1240, label: 'Hubballi city centre' },
};

const STATUS_STYLE = {
  ACTIVE: 'bg-blue-100 text-blue-800 border-blue-300',
  AT_RISK: 'bg-amber-100 text-amber-800 border-amber-300',
  INVALIDATED: 'bg-red-100 text-red-800 border-red-300',
  REPLACED: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

// Label the mission from the backend record; only the built-in demo corridor has names.
function missionLabel(detail) {
  const o = detail?.origin; const d = detail?.destination;
  const near = (a, b) => a && Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lon - b.lon) < 1e-4;
  if (!o || !d || (near(o, MISSION.origin) && near(d, MISSION.destination))) {
    return `${MISSION.name}: ${MISSION.origin.label} → ${MISSION.destination.label}`;
  }
  const fmt = (p) => `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`;
  return `Mission: (${fmt(o)}) → (${fmt(d)})`;
}

const score = (v) => (typeof v === 'number' ? v.toFixed(1) : '—');
const km = (m) => (typeof m === 'number' ? `${(m / 1000).toFixed(1)} km` : '—');
const mins = (s) => (typeof s === 'number' ? `${Math.round(s / 60)} min` : '—');
const time = (t) => (t ? new Date(t).toLocaleTimeString() : '—');

async function api(path, options) {
  const res = await fetch(`${API_BASE_URL}${path}`, options);
  let body = null;
  try { body = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const detail = body?.detail;
    throw new Error(typeof detail === 'string' ? detail : detail?.message || `HTTP ${res.status}`);
  }
  return body;
}

const post = (path, payload) => api(path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: payload === undefined ? undefined : JSON.stringify(payload),
});

function describeOutcome(rec) {
  switch (rec?.replacement_status) {
    case 'NO_SAFE_AVAILABLE_ROUTE': return 'No safe alternative exists: every path to the destination crosses a CRITICAL zone.';
    case 'NO_BETTER_ROUTE': return `No better alternative found. ${rec.decision?.reason || ''}`;
    case 'NO_ROUTE': return 'No alternative path exists in the road network.';
    case 'NOT_REQUIRED': return 'Replacement not required: the route is not compromised.';
    default: return rec?.message || 'No recommendation available.';
  }
}

function Metric({ label, current, proposed }) {
  return (
    <tr className="border-b border-slate-100">
      <td className="py-0.5 pr-2 text-slate-500">{label}</td>
      <td className="py-0.5 pr-2 font-mono">{current}</td>
      <td className="py-0.5 font-mono font-bold text-emerald-800">{proposed}</td>
    </tr>
  );
}

export default function MissionPanel({ copData, refreshCop, showToast, onProposedRoute, onMissionChange, onStateChange }) {
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [lastOutcome, setLastOutcome] = useState(null);

  // The mission is the most recently created monitored route (backend state).
  const route = useMemo(() => {
    const routes = copData?.monitored_routes || [];
    return [...routes].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0] || null;
  }, [copData]);

  const routeId = route?.id;
  const loadDetail = useCallback(async () => {
    if (!routeId) { setDetail(null); return; }
    try {
      setDetail(await api(`/route-monitor/${routeId}`));
      setDetailError(null);
    } catch (e) {
      setDetailError(e.message || 'request failed'); // keep last detail, but say it is not current
    }
  }, [routeId]);

  useEffect(() => { loadDetail(); }, [loadDetail, copData?.generated_at]);
  useEffect(() => { onMissionChange?.(route); }, [route, onMissionChange]);
  useEffect(() => {
    onStateChange?.({ route, detail, detailError, lastOutcome, busy });
  }, [route, detail, detailError, lastOutcome, busy, onStateChange]);

  const pending = useMemo(
    () => (detail?.recommendations || []).filter((r) => r.status === 'PENDING').slice(-1)[0] || null,
    [detail],
  );

  useEffect(() => {
    const coords = pending?.candidate_route?.route?.coordinates;
    onProposedRoute(coords ? coords.map((c) => [c[1], c[0]]) : null);
  }, [pending, onProposedRoute]);

  const run = async (label, fn) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      showToast(`${label} failed: ${e.message}`, 'error');
    } finally {
      setBusy(null);
      await refreshCop?.();
      await loadDetail();
    }
  };

  const startMission = () => run('Mission setup', async () => {
    const { origin, destination } = MISSION;
    const r = await api(`/route?origin_lat=${origin.lat}&origin_lon=${origin.lon}&destination_lat=${destination.lat}&destination_lon=${destination.lon}`);
    if (r.status !== 'success') throw new Error(r.message || 'route planning failed');
    const reg = await post('/route-monitor/register', {
      origin: { lat: origin.lat, lon: origin.lon }, destination: { lat: destination.lat, lon: destination.lon },
      route_nodes: r.route_nodes, distance_m: r.distance_m, estimated_time_s: r.estimated_time_s,
    });
    setLastOutcome(null);
    showToast(`Mission route planned: ${km(r.distance_m)}, ${mins(r.estimated_time_s)} — status ${reg.monitor_status}`, 'success');
  });

  const computeAlternative = () => run('Alternative route', async () => {
    const rec = await post(`/route-monitor/${route.id}/replacement/recommend`);
    setLastOutcome(rec);
    showToast(rec.replacement_status === 'RECOMMENDATION_READY'
      ? 'Alternative route proposed — awaiting operator decision' : describeOutcome(rec),
    rec.replacement_status === 'RECOMMENDATION_READY' ? 'info' : 'error');
  });

  const simulateReport = (profile) => run('Simulated report', async () => {
    const res = await post('/simulation/field-report', { route_id: route.id, profile });
    const status = res.route_assessment?.current_status;
    showToast(`SIMULATED report → threat ${res.threat.incident_id} (${res.threat.severity}); mission route ${status}`,
      status === 'INVALIDATED' ? 'error' : 'info');
    if (status === 'INVALIDATED') {
      const rec = await post(`/route-monitor/${route.id}/replacement/recommend`);
      setLastOutcome(rec);
    }
  });

  const checkRoute = () => run('Route check', async () => {
    const res = await post(`/route-monitor/${route.id}/check`);
    showToast(`Route check: ${res.current_status}${res.reason ? ' — ' + res.reason : ''}`,
      res.current_status === 'ACTIVE' ? 'success' : 'error');
  });

  const decide = (approve) => run(approve ? 'Approval' : 'Rejection', async () => {
    if (approve) {
      await post(`/route-monitor/${route.id}/replacement/approve`, { recommendation_id: pending.recommendation_id, approved: true });
      showToast('Replacement route approved by operator — now the active mission route', 'success');
    } else {
      await post(`/route-monitor/${route.id}/replacement/reject`, { recommendation_id: pending.recommendation_id, reason: 'Rejected by operator' });
      showToast('Replacement route rejected by operator — route remains compromised', 'info');
    }
    setLastOutcome(null);
  });

  // Threats currently on the mission route, with their linked evidence (COP state).
  const exposure = route?.hazard_summary?.threat_exposure || {};
  const threatIds = [...(exposure.critical_threat_ids || []), ...(exposure.high_threat_ids || [])];
  const threats = (copData?.threats || []).filter((t) => threatIds.includes(t.id));
  const evidenceFor = (id) => (copData?.evidence || []).filter((e) => e.threat_id === id);

  const events = useMemo(() => {
    if (!detail) return [];
    const ev = [{ t: detail.created_at, text: 'Mission route planned and monitoring started' }];
    (detail.transitions || []).forEach((tr) => ev.push({
      t: tr.timestamp,
      text: `${tr.previous_status} → ${tr.new_status}${tr.reason ? `: ${tr.reason}` : ''}`,
      tone: tr.new_status === 'INVALIDATED' ? 'red' : tr.new_status === 'REPLACED' ? 'green' : undefined,
    }));
    (detail.recommendations || []).forEach((r) => {
      ev.push({ t: r.created_at, text: `Alternative proposed (${km(r.candidate_route?.distance_m)}, ${mins(r.candidate_route?.estimated_time_s)})` });
      if (r.decided_at) {
        ev.push({
          t: r.decided_at,
          text: `Operator ${r.status === 'APPROVED' ? 'APPROVED' : 'REJECTED'} the alternative${r.decision_reason ? ` (${r.decision_reason})` : ''}`,
          tone: r.status === 'APPROVED' ? 'green' : 'amber',
        });
      }
    });
    return ev.filter((e) => e.t).sort((a, b) => new Date(a.t) - new Date(b.t));
  }, [detail]);

  const status = route?.status;
  const hs = route?.hazard_summary || {};
  const lastTransition = (detail?.transitions || []).slice(-1)[0];
  const decided = (detail?.recommendations || []).filter((r) => r.decided_at).slice(-1)[0];
  const cand = pending?.candidate_route;
  const candExposure = cand?.threat_exposure?.affected_threats || [];

  return (
    <div className="bg-slate-50 border border-slate-200 rounded p-3 space-y-2 text-[11px]">
      <div className="flex justify-between items-center border-b border-slate-200 pb-1.5">
        <span className="font-extrabold text-[10px] text-[#0B4F8A] uppercase tracking-wider">ACTIVE MISSION</span>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${STATUS_STYLE[status] || 'bg-slate-100 text-slate-600 border-slate-300'}`}>
          {busy ? `${busy.toUpperCase()}…` : status || 'NO MISSION'}
        </span>
      </div>

      {!route ? (
        <div className="space-y-2">
          <div className="text-slate-600">
            <b>{MISSION.name}:</b> {MISSION.origin.label} → {MISSION.destination.label}
          </div>
          <button onClick={startMission} disabled={!!busy}
            className="w-full bg-[#0B4F8A] hover:bg-[#083B68] text-white font-bold py-1.5 rounded text-xs disabled:opacity-50">
            START MISSION
          </button>
        </div>
      ) : (
        <>
          <div className="text-slate-700 space-y-0.5">
            <div><b>{missionLabel(detail)}</b></div>
            <div><b>Route:</b> {km(route.distance_m)} · {mins(route.estimated_time_s)} (road-graph travel time)</div>
            <div>
              <b>Hazard (heuristic):</b> {hs.overall_level ?? '—'} ({score(hs.overall_score)})
              {hs.score_basis && hs.score_basis !== 'COMPLETE' && <span className="text-amber-700"> · partial data, up to {score(hs.score_upper_bound)}</span>}
              {hs.confidence && <span className="text-slate-500"> · confidence {hs.confidence}</span>}
            </div>
          </div>

          <div className="flex gap-1.5">
            <button onClick={checkRoute} disabled={!!busy}
              className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-1 rounded text-[10px] disabled:opacity-50">
              CHECK ROUTE
            </button>
            <button onClick={() => simulateReport('ROAD_FLOODING_SENSOR')} disabled={!!busy}
              title="Creates a SIMULATED sensor report (evidence + CRITICAL threat) at the route midpoint"
              className="flex-1 bg-red-700 hover:bg-red-800 text-white font-bold py-1 rounded text-[10px] disabled:opacity-50">
              SIMULATE SENSOR REPORT
            </button>
          </div>

          {(status === 'INVALIDATED' || status === 'AT_RISK') && lastTransition && (
            <div className="bg-red-50 border border-red-200 rounded p-2">
              <div className="font-bold text-red-800">WHY THE ROUTE IS {status}</div>
              <div className="text-red-900">{lastTransition.reason}</div>
              <div className="text-slate-500 font-mono text-[10px]">recorded {time(lastTransition.timestamp)}</div>
            </div>
          )}

          {pending ? (
            <div className="bg-white border border-emerald-300 rounded p-2 space-y-1.5">
              <div className="font-bold text-emerald-800">PROPOSED ALTERNATIVE (awaiting operator decision)</div>
              <table className="w-full">
                <thead>
                  <tr className="text-[9px] uppercase text-slate-500">
                    <th className="text-left"></th><th className="text-left">Current</th><th className="text-left">Proposed</th>
                  </tr>
                </thead>
                <tbody>
                  <Metric label="Distance" current={km(route.distance_m)} proposed={km(cand?.distance_m)} />
                  <Metric label="Travel time" current={mins(route.estimated_time_s)} proposed={mins(cand?.estimated_time_s)} />
                  <Metric label="Hazard score" current={score(hs.overall_score)} proposed={score(cand?.hazard_summary?.overall_score)} />
                  <Metric label="Threat zones crossed" current={threatIds.length} proposed={candExposure.length} />
                </tbody>
              </table>
              {typeof cand?.distance_m === 'number' && typeof route.distance_m === 'number' && (
                <div className="text-slate-700">
                  <b>Trade-off:</b> {((cand.distance_m - route.distance_m) / 1000 >= 0 ? '+' : '')}{((cand.distance_m - route.distance_m) / 1000).toFixed(1)} km,
                  {' '}{(cand.estimated_time_s - route.estimated_time_s) >= 0 ? '+' : ''}{Math.round((cand.estimated_time_s - route.estimated_time_s) / 60)} min
                  {' '}to cross {candExposure.length} instead of {threatIds.length} known threat zone(s).
                </div>
              )}
              <div className="text-slate-600"><b>Engine rationale:</b> {pending.reason}</div>
              <div className="text-slate-500 text-[10px]">
                Avoids only the threat zones currently known to the backend; it is not a guarantee that the road is safe.
                Hazard scores are uncalibrated heuristics.
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => decide(true)} disabled={!!busy}
                  className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-1.5 rounded text-[10px] disabled:opacity-50">
                  APPROVE
                </button>
                <button onClick={() => decide(false)} disabled={!!busy}
                  className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-1.5 rounded text-[10px] disabled:opacity-50">
                  REJECT
                </button>
              </div>
            </div>
          ) : status === 'INVALIDATED' && (
            <div className="bg-red-50 border border-red-200 rounded p-2 space-y-1.5">
              <div className="font-bold text-red-800">Route compromised</div>
              {lastOutcome && <div className="text-red-900">{describeOutcome(lastOutcome)}</div>}
              <button onClick={computeAlternative} disabled={!!busy}
                className="w-full bg-red-700 hover:bg-red-800 text-white font-bold py-1 rounded text-[10px] disabled:opacity-50">
                {lastOutcome ? 'RECOMPUTE ALTERNATIVE' : 'COMPUTE ALTERNATIVE ROUTE'}
              </button>
            </div>
          )}

          {threats.map((t) => (
            <div key={t.id} className="bg-white border border-red-200 rounded p-2 space-y-1">
              <div className="flex justify-between items-center gap-1">
                <span className="font-bold text-red-800">THREAT ASSESSMENT</span>
                {t.is_demo && <span className="text-[9px] bg-amber-100 text-amber-800 px-1 rounded font-bold">SIMULATED</span>}
              </div>
              <div className="font-bold text-slate-900">{t.title}</div>
              <div>Severity <b>{t.severity}</b> · {t.category} · radius {t.radius_m} m</div>
              <div>Threat confidence <b>{t.confidence}</b> · source {t.source || 'unknown'} · reported {time(t.first_seen)}</div>
              {evidenceFor(t.id).map((e) => (
                <div key={e.id} className="bg-slate-50 border border-slate-200 rounded p-1.5">
                  <div><b>Evidence</b> {e.id} {e.is_simulation && <span className="text-amber-700 font-bold">(SIMULATED)</span>}</div>
                  <div>{e.source_type} {e.source_id} · {e.observation_type} · {time(e.timestamp)}</div>
                  <div>Source-declared confidence {(e.confidence * 100).toFixed(0)}%
                    {e.provenance?.confidence_basis === 'DECLARED_BY_SIMULATION_PROFILE' && ' (fixed by the simulation profile, not measured)'}
                  </div>
                </div>
              ))}
              {evidenceFor(t.id).length === 0 && <div className="text-slate-500">No evidence linked to this threat.</div>}
              <div className="text-slate-500">
                Rule: an active {routePolicyText(t.severity)}
              </div>
            </div>
          ))}


          {status === 'REPLACED' && decided?.status === 'APPROVED' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded p-2">
              <div className="font-bold text-emerald-800">OPERATOR DECISION RECORDED</div>
              <div>Approved alternative ({km(decided.candidate_route?.distance_m)} · {mins(decided.candidate_route?.estimated_time_s)}) at {time(decided.decided_at)}{decided.decided_by ? ` by ${decided.decided_by}` : ''}.</div>
              <div>The mission now follows the replacement route (green on the map) and is still monitored.</div>
            </div>
          )}

          <div className="space-y-0.5">
            <div className="font-bold text-[10px] uppercase text-slate-500">Mission log (backend record)</div>
            {detailError && (
              <div className="text-red-800 text-[10px]">Mission record could not be refreshed ({detailError}){detail ? '; showing last loaded copy' : ''}.</div>
            )}
            {events.slice(-8).map((e, i) => (
              <div key={i} className={`leading-snug ${e.tone === 'red' ? 'text-red-800' : e.tone === 'green' ? 'text-emerald-800' : e.tone === 'amber' ? 'text-amber-800' : 'text-slate-700'}`}>
                <span className="font-mono text-slate-500">{time(e.t)}</span> {e.text}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function routePolicyText(severity) {
  if (severity === 'CRITICAL') {
    return 'CRITICAL zone is a hard exclusion: any route segment within its radius + 25 m buffer is compromised (INVALIDATED), and alternatives may not enter it.';
  }
  return `${severity} zone on the route marks it AT_RISK and adds a travel-time penalty to alternatives (uncalibrated).`;
}
