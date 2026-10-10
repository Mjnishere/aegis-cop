import React from 'react';

// Observation -> Evidence -> Threat -> Route impact -> Recommendation -> Human decision,
// derived only from backend state: the monitored-route record (transitions and
// recommendations from GET /route-monitor/{id}) and the COP snapshot. Nothing here is
// stored separately, so the chain cannot disagree with the mission log or the map.

const THREAT_ID_RE = /THREAT-\d{4}-[A-F0-9]+/g;

const STEP_STYLE = {
  done: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  active: 'border-blue-400 bg-blue-50 text-blue-900 ring-1 ring-blue-300',
  warn: 'border-amber-300 bg-amber-50 text-amber-900',
  fail: 'border-red-300 bg-red-50 text-red-900',
  pending: 'border-slate-200 bg-white text-slate-400',
};
const STEP_MARK = { done: '✓', active: '●', warn: '!', fail: '✕', pending: '○' };

const km = (m) => (typeof m === 'number' ? `${(m / 1000).toFixed(1)} km` : '—');
const mins = (s) => (typeof s === 'number' ? `${Math.round(s / 60)} min` : '—');
const time = (t) => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

export function deriveChain(mission, copData) {
  const { route, detail, detailError, lastOutcome } = mission || {};
  const step = (key, label, state, detailText, at) => ({ key, label, state, detail: detailText, at });

  if (!route) {
    return {
      steps: [
        step('mission', 'MISSION SETUP', 'active', 'No mission yet'),
        step('observation', 'OBSERVATION RECEIVED', 'pending', ''),
        step('threat', 'THREAT LINKED', 'pending', ''),
        step('impact', 'ROUTE IMPACTED', 'pending', ''),
        step('alternative', 'ALTERNATIVE PROPOSED', 'pending', ''),
        step('decision', 'OPERATOR DECISION', 'pending', ''),
        step('replaced', 'ROUTE REPLACED', 'pending', ''),
      ],
      next: 'Start the mission: Active Mission → START MISSION.',
    };
  }

  if (!detail) {
    // Without the persisted mission record the chain cannot be derived; do not guess.
    const why = detailError ? `Mission record unavailable (${detailError})` : 'Loading mission record…';
    return {
      steps: [
        step('mission', 'MISSION ACTIVE', 'done', `${km(route.distance_m)} · ${mins(route.estimated_time_s)} · last known ${route.status}`),
        ...['OBSERVATION RECEIVED', 'THREAT LINKED', 'ROUTE IMPACTED', 'ALTERNATIVE PROPOSED', 'OPERATOR DECISION', 'ROUTE REPLACED']
          .map((label, i) => step(`unknown-${i}`, label, detailError ? 'warn' : 'pending', detailError ? 'unknown' : '')),
      ],
      next: detailError ? `${why}. Steps are unknown until the backend responds.` : why,
    };
  }

  const transitions = detail?.transitions || [];
  const recs = detail?.recommendations || [];
  const impact = [...transitions].reverse().find((t) => ['INVALIDATED', 'AT_RISK'].includes(t.new_status));
  // Backend timestamps for transitions and recommendations share one ISO format, so
  // string comparison orders them correctly.
  const after = (ts) => impact && ts && ts >= impact.timestamp;

  const threatIds = impact ? [...new Set(impact.reason?.match(THREAT_ID_RE) || [])] : [];
  const threats = threatIds.map((id) => (copData?.threats || []).find((t) => t.id === id) || { id, inactive: true });
  const evidence = (copData?.evidence || []).filter((e) => threatIds.includes(e.threat_id));
  const recsAfter = recs.filter((r) => after(r.created_at));
  const latestRec = recsAfter[recsAfter.length - 1];
  const replaced = transitions.find((t) => t.new_status === 'REPLACED' && after(t.timestamp));
  const failedOutcome = lastOutcome && lastOutcome.replacement_status !== 'RECOMMENDATION_READY' ? lastOutcome : null;

  const steps = [step('mission', 'MISSION ACTIVE', 'done', `${km(route.distance_m)} · ${mins(route.estimated_time_s)}`, detail?.created_at)];

  // Observation / evidence
  if (!impact) {
    steps.push(step('observation', 'OBSERVATION RECEIVED', 'pending', 'Awaiting a report'));
  } else if (evidence.length) {
    const e = evidence[evidence.length - 1];
    steps.push(step('observation', 'OBSERVATION RECEIVED', 'done',
      `${e.source_type} ${e.source_id || ''}${e.is_simulation ? ' · SIMULATED' : ''}`, e.timestamp));
  } else {
    steps.push(step('observation', 'OBSERVATION RECEIVED', threatIds.length ? 'warn' : 'pending',
      threatIds.length ? 'No evidence linked to the threat' : 'Not observation-driven'));
  }

  // Threat
  if (!impact) {
    steps.push(step('threat', 'THREAT LINKED', 'pending', ''));
  } else if (threats.length) {
    const t = threats[0];
    steps.push(step('threat', 'THREAT LINKED', 'done',
      t.inactive ? `${t.id} (no longer active)` : `${t.severity} · confidence ${t.confidence}${t.is_demo ? ' · SIMULATED' : ''}`, t.first_seen));
  } else {
    steps.push(step('threat', 'THREAT LINKED', 'warn', 'Invalidated without a threat (manual)'));
  }

  // Impact
  steps.push(impact
    ? step('impact', 'ROUTE IMPACTED', replaced ? 'done' : impact.new_status === 'INVALIDATED' ? 'fail' : 'warn',
      replaced ? `${impact.new_status} (resolved by replacement)` : impact.new_status, impact.timestamp)
    : step('impact', 'ROUTE IMPACTED', 'pending', 'Route not affected'));

  // Alternative
  if (!impact) {
    steps.push(step('alternative', 'ALTERNATIVE PROPOSED', 'pending', ''));
  } else if (failedOutcome && (!latestRec || latestRec.status !== 'PENDING')) {
    steps.push(step('alternative', 'ALTERNATIVE PROPOSED', 'fail',
      failedOutcome.replacement_status === 'NO_SAFE_AVAILABLE_ROUTE' ? 'No safe route exists' : failedOutcome.replacement_status));
  } else if (latestRec) {
    steps.push(step('alternative', 'ALTERNATIVE PROPOSED', 'done',
      `${km(latestRec.candidate_route?.distance_m)} · ${mins(latestRec.candidate_route?.estimated_time_s)}`, latestRec.created_at));
  } else {
    steps.push(step('alternative', 'ALTERNATIVE PROPOSED', 'active', 'No proposal on record'));
  }

  // Decision
  if (!latestRec) {
    steps.push(step('decision', 'OPERATOR DECISION', 'pending', ''));
  } else if (latestRec.status === 'PENDING') {
    steps.push(step('decision', 'OPERATOR DECISION', 'active', 'Awaiting approve / reject'));
  } else {
    steps.push(step('decision', 'OPERATOR DECISION', latestRec.status === 'APPROVED' ? 'done' : 'warn',
      latestRec.status, latestRec.decided_at));
  }

  // Outcome
  steps.push(replaced
    ? step('replaced', 'ROUTE REPLACED', 'done', 'REPLACED', replaced.timestamp)
    : step('replaced', 'ROUTE REPLACED', 'pending', ''));

  let next;
  if (!impact) next = 'Route is monitored. Next: SIMULATE SENSOR REPORT (labelled simulation) or CHECK ROUTE.';
  else if (replaced) next = 'Operator approved the alternative; the mission now follows the replacement route.';
  else if (latestRec?.status === 'PENDING') next = 'Review the comparison in Active Mission, then APPROVE or REJECT.';
  else if (failedOutcome) next = 'No acceptable alternative was found. The route stays compromised; recompute after conditions change.';
  else if (latestRec?.status === 'REJECTED') next = 'Alternative rejected; the route stays compromised. Recompute or hold.';
  else next = 'Route compromised. Next: COMPUTE ALTERNATIVE ROUTE in Active Mission.';
  return { steps, next };
}

export default function DecisionChain({ mission, copData }) {
  const { steps, next } = deriveChain(mission, copData);
  // The first step that is not complete is where the operator's attention belongs.
  const focusIdx = steps.findIndex((s) => s.state !== 'done');
  return (
    <div className="bg-white border border-[#D9E0E8] rounded-md p-2.5 shadow-sm shrink-0">
      <div className="flex justify-between items-baseline mb-1.5 gap-3">
        <span className="font-extrabold text-[10px] uppercase tracking-wider text-[#0B4F8A]">
          Decision chain — observation to human-reviewed route decision
        </span>
        <span className="text-[11px] text-slate-700 truncate" title={next}>{next}</span>
      </div>
      <ol className="flex gap-1 overflow-hidden" aria-label="Mission decision chain">
        {steps.map((s, i) => (
          <li key={s.key} data-step={s.key} data-state={s.state}
            className={`flex-1 min-w-0 border rounded px-1.5 py-1 text-[10px] leading-tight ${STEP_STYLE[s.state]} ${i === focusIdx && s.state === 'pending' ? 'ring-1 ring-blue-300' : ''}`}>
            <div className="font-extrabold truncate">{STEP_MARK[s.state]} {s.label}</div>
            <div className="truncate" title={s.detail}>{s.detail || ' '}</div>
            <div className="font-mono text-[9px] opacity-70">{time(s.at) || ' '}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const SOURCE_TONE = {
  ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  sim: 'bg-amber-50 text-amber-900 border-amber-200',
  off: 'bg-slate-100 text-slate-600 border-slate-300',
  bad: 'bg-red-50 text-red-800 border-red-200',
};

export function DataSourceStrip({ copData, copError, systemStatus }) {
  const weather = copData?.system?.weather_mode;
  const terrain = systemStatus?.terrain;
  const lastKnown = (v) => (copError ? `${v} (last known)` : v);
  const sources = [
    ['Backend', copError ? 'UNREACHABLE' : copData ? 'CONNECTED' : 'CONNECTING', copError ? 'bad' : copData ? 'ok' : 'off'],
    ['Road graph (OSM)', lastKnown(systemStatus?.osm || 'UNKNOWN'), systemStatus?.osm === 'LOADED' && !copError ? 'ok' : 'off'],
    ['Terrain (CartoDEM)', lastKnown(!terrain ? 'UNKNOWN' : terrain === 'AVAILABLE' ? 'AVAILABLE' : `UNAVAILABLE (${terrain})`), terrain === 'AVAILABLE' && !copError ? 'ok' : 'off'],
    ['Weather', lastKnown(weather === 'CONTROLLED_SCENARIO' ? 'CONTROLLED SCENARIO' : weather || 'UNKNOWN'),
      copError ? 'off' : weather === 'AVAILABLE' ? 'ok' : weather === 'CONTROLLED_SCENARIO' ? 'sim' : 'off'],
    ['Sensor / field feeds', 'NONE CONNECTED — simulated reports only', 'sim'],
    ['Unit positions', 'MANUAL / SEEDED — no live GPS', 'sim'],
  ];
  return (
    <div className="flex flex-wrap gap-1.5 text-[10px] shrink-0" aria-label="Data source availability">
      <span className="font-bold uppercase text-slate-500 self-center">Data sources:</span>
      {sources.map(([name, value, tone]) => (
        <span key={name} className={`border rounded px-1.5 py-0.5 ${SOURCE_TONE[tone]}`}>
          <b>{name}:</b> {value}
        </span>
      ))}
    </div>
  );
}
