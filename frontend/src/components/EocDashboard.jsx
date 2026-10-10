import { useState, useEffect } from 'react';
import MapComponent from './Map';
import NationalView from './NationalView';
import ResourceCenter from './ResourceCenter';
import IncidentCenter from './IncidentCenter';
import AlertCenter from './AlertCenter';
import WeatherDashboard from './WeatherDashboard';
import ThreatPanel from './ThreatPanel';
import MissionPanel from './MissionPanel';
import DecisionChain, { DataSourceStrip } from './DecisionChain';
import { useCOP } from '../hooks/useCOP';
import { API_BASE_URL } from '../config';

export default function EocDashboard({
  viewMode,
  setViewMode,
  weatherStatus,
  systemStatus,
  scenarioStatus,
  toggleScenario,
  onRunFloodDemo,
  refreshScenario,
  onOpenCitizenApp
}) {
  // Common Operating Picture (COP) Data Hook (10s polling refresh)
  const { data: copData, loading: copLoading, error: copError, refresh: refreshCop } = useCOP(10000);

  // Navigation active tab: 'overview' | 'incidents' | 'field' | 'weather' | 'satellite' | 'national'
  const [activeTab, setActiveTab] = useState('overview');
  const [weatherForecast, setWeatherForecast] = useState(null);

  // Shared Global Selected Incident State
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [selectedIncidentDetail, setSelectedIncidentDetail] = useState(null);
  const [activePlan, setActivePlan] = useState(null);

  // Backend Data States
  const [incidents, setIncidents] = useState([]);
  const [riskData, setRiskData] = useState(null);
  const [resources, setResources] = useState([]);
  const [fieldUnits, setFieldUnits] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [eocStatus, setEocStatus] = useState(null);
  const [satLayers, setSatLayers] = useState([]);

  // Mission (route monitoring) state lives in the backend; MissionPanel reads it from the COP.
  const [proposedRoute, setProposedRoute] = useState(null);
  const [missionRoute, setMissionRoute] = useState(null);
  const [missionState, setMissionState] = useState(null);

  // Field Operations State Machine
  // Overrides only after the backend confirmed a status change.
  const [fieldUnitStates, setFieldUnitStates] = useState({});

  // Drawer & Toast State
  const [toastMessage, setToastMessage] = useState(null);

  // Satellite view controls
  const [satProduct, setSatProduct] = useState('TRUE_COLOR');

  // Map layer controls
  const [layers, setLayers] = useState({
    incidents: true,
    risk: true,
    resources: true,
    fieldUnits: true,
    satellite: false,
    routing: true,
    floodRisk: true,
    waterlogging: true,
    drainage: true,
  });

  const [demoStep, setDemoStep] = useState(null);
  const [planActionStatus, setPlanActionStatus] = useState(null);
  const [dispatchStatus, setDispatchStatus] = useState(null);
  const [lastUpdatedTime, setLastUpdatedTime] = useState(new Date().toLocaleTimeString() + ' IST');

  const [routeInfo, setRouteInfo] = useState(null);
  const [floodOverlay, setFloodOverlay] = useState(null);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(() => {
      fetchAllData();
      setLastUpdatedTime(new Date().toLocaleTimeString() + ' IST');
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedIncident?.incident_id) {
      fetchIncidentResponsePlan(selectedIncident.incident_id);
    } else {
      setActivePlan(null);
    }
  }, [selectedIncident]);

  async function fetchIncidentResponsePlan(incId) {
    try {
      const res = await fetch(`${API_BASE_URL}/national/incidents/${incId}/response-plan`);
      if (res.ok) {
        const data = await res.json();
        if (data.records && data.records.length > 0) {
          setActivePlan(data.records[data.records.length - 1]);
        } else {
          setActivePlan(null);
        }
      } else {
        setActivePlan(null);
      }
    } catch (e) {
      setActivePlan(null);
    }
  }

  function showToast(msg, type = "info") {
    setToastMessage({ text: msg, type });
    setTimeout(() => setToastMessage(null), 4000);
  }

  async function fetchAllData() {
    try {
      const [eocRes, incRes, riskRes, resRes, fuRes, altRes, satRes, wfRes] = await Promise.all([
        fetch(`${API_BASE_URL}/national/eoc/status`).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE_URL}/national/incidents`).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE_URL}/national/risk`).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE_URL}/national/resources`).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE_URL}/national/field-units`).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE_URL}/national/alerts`).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE_URL}/national/satellite/layers`).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE_URL}/weather/forecast`).then(r => r.json()).catch(() => null),
      ]);

      if (eocRes) setEocStatus(eocRes);
      if (incRes?.records) {
        setIncidents(incRes.records);
        if (!selectedIncident && incRes.records.length > 0) {
          setSelectedIncident(incRes.records[0]);
          fetchIncidentDetail(incRes.records[0].incident_id);
        }
      }
      if (riskRes) setRiskData(riskRes);
      if (resRes?.records) setResources(resRes.records);
      if (fuRes?.records) setFieldUnits(fuRes.records);
      if (altRes?.records) setAlerts(altRes.records);
      if (satRes?.records) setSatLayers(satRes.records);
      if (wfRes) setWeatherForecast(wfRes);

    } catch (err) {
      console.error("Failed to fetch EOC data:", err);
    }
  }

  async function fetchIncidentDetail(incidentId) {
    try {
      const res = await fetch(`${API_BASE_URL}/national/incidents/${incidentId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedIncidentDetail(data.record);
      }
    } catch (e) {
      console.error(e);
    }
  }

  function handleSelectIncident(inc) {
    setSelectedIncident(inc);
    fetchIncidentDetail(inc.incident_id);
  }

  // ============================================================
  // REALISTIC CONTROLLED FLOOD DEMO SCENARIO ENGINE
  // ============================================================
  const handleRunFloodResponseDemo = async () => {
    try {
      setDemoStep('ACTIVATING_SCENARIO');
      if (scenarioStatus?.active) {
        const off = await fetch(`${API_BASE_URL}/scenario/deactivate`, { method: 'POST' });
        if (!off.ok) throw new Error(`scenario deactivation failed (HTTP ${off.status})`);
        await fetchAllData();
        refreshScenario?.();
        setDemoStep(null);
        showToast("Controlled rain scenario deactivated — weather inputs back to live/unavailable", "success");
        return;
      }
      showToast("Activating controlled (SIMULATED) heavy-rain scenario...", "info");
      const act = await fetch(`${API_BASE_URL}/scenario/activate`, { method: 'POST' });
      if (!act.ok) throw new Error(`scenario activation failed (HTTP ${act.status})`);

      setDemoStep('REFRESHING_RISK');
      showToast("Updating regional flood risk scores...", "info");
      await fetch(`${API_BASE_URL}/national/risk`);

      setDemoStep('ASSESSING_INCIDENTS');
      showToast("Scanning feeds & generating incident candidates...", "info");
      await fetch(`${API_BASE_URL}/national/incidents/recommend`, { method: 'POST' }).catch(() => {});

      setDemoStep('PREPARING_RESPONSE');
      showToast("Running heuristic 3-hour flood nowcast (simulated inputs)...", "info");
      await fetch(`${API_BASE_URL}/flood/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rainfall_mm_hr: 80, blockage_percent: 50, forecast_minutes: 180 })
      }).catch(() => {});

      setDemoStep('DEMO_READY');
      await fetchAllData();
      refreshScenario?.();
      showToast("✓ Controlled SIMULATED rain scenario active — weather inputs are scenario values, not observations", "success");

      setTimeout(() => setDemoStep(null), 3000);
    } catch (e) {
      showToast("Demo initiation failed: " + e.message, "error");
      setDemoStep(null);
    }
  };

  // ============================================================
  // MISSION ACTIONS (see MissionPanel for the main workflow)
  // ============================================================
  const submitFieldTeamReport = async () => {
    if (!missionRoute?.id) {
      showToast("Start a mission on the Overview tab first (Active Mission panel).", "error");
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/simulation/field-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route_id: missionRoute.id, profile: 'FIELD_TEAM_BLOCKAGE' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
      showToast(`SIMULATED field-team report → threat ${data.threat.incident_id}; mission route ${data.route_assessment?.current_status}. Review it on the Overview tab.`, "info");
      refreshCop();
    } catch (e) {
      showToast("Simulated field report failed: " + e.message, "error");
    }
  };

  // ============================================================
  // RESPONSE PLAN & DISPATCH ENGINE
  // ============================================================
  async function handleGenerateResponsePlan() {
    setPlanActionStatus({ type: 'loading', message: 'GENERATING RESPONSE PLAN...' });
    const incId = selectedIncident?.incident_id;
    if (!incId) {
      showToast("Select an incident first", "error");
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/national/incidents/${incId}/response-plan`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.plan) {
        setActivePlan(data.plan);
        setPlanActionStatus({ type: 'success', message: '✓ RESPONSE PLAN GENERATED (PENDING_APPROVAL)' });
        showToast(`✓ Response plan generated for ${selectedIncident.title}`, "success");
      } else {
        throw new Error(data.detail || "Failed to generate plan");
      }
    } catch (e) {
      setPlanActionStatus({ type: 'error', message: 'Generate error: ' + e.message });
    }
  }

  async function handleApproveResponsePlan() {
    setPlanActionStatus({ type: 'loading', message: 'APPROVING RESPONSE PLAN...' });
    const incId = selectedIncident?.incident_id || (incidents[0]?.incident_id);

    if (!incId) {
      setPlanActionStatus({ type: 'error', message: 'NO INCIDENT SELECTED' });
      showToast("Select an incident first", "error");
      return;
    }

    try {
      let currentPlan = activePlan;
      if (!currentPlan) {
        let planRes = await fetch(`${API_BASE_URL}/national/incidents/${incId}/response-plan`);
        let pData = await planRes.json();

        if (!pData.records || pData.records.length === 0) {
          const genRes = await fetch(`${API_BASE_URL}/national/incidents/${incId}/response-plan`, { method: 'POST' });
          const genData = await genRes.json();
          currentPlan = genData.plan;
        } else {
          currentPlan = pData.records[pData.records.length - 1];
        }
      }

      const pId = currentPlan?.response_plan_id || currentPlan?.plan_id;
      if (pId) {
        const approveRes = await fetch(`${API_BASE_URL}/national/response-plans/${pId}/approve`, { method: 'POST' });
        const aData = await approveRes.json();
        if (approveRes.ok && aData.plan) {
          setActivePlan(aData.plan);
          setPlanActionStatus({ type: 'success', message: '✓ RESPONSE PLAN APPROVED — Resources Reserved' });
          showToast("✓ Response plan approved and resources reserved", "success");
          fetchIncidentDetail(incId);
          fetchAllData();
        } else {
          setPlanActionStatus({ type: 'error', message: 'APPROVAL FAILED: ' + (aData.detail || 'Error') });
        }
      }
    } catch (e) {
      setPlanActionStatus({ type: 'error', message: 'Approval error: ' + e.message });
    }
  }

  async function handleSimulateDispatchUnit() {
    setDispatchStatus({ type: 'loading', message: 'SIMULATING DISPATCH...' });
    const incId = selectedIncident?.incident_id || (incidents[0]?.incident_id);

    if (!incId) {
      setDispatchStatus({ type: 'error', message: 'NO INCIDENT SELECTED' });
      return;
    }

    try {
      const planRes = await fetch(`${API_BASE_URL}/national/incidents/${incId}/response-plan`);
      const pData = await planRes.json();

      if (pData.records && pData.records.length > 0) {
        const plan = pData.records[pData.records.length - 1];
        const action = plan.actions ? plan.actions[0] : null;

        if (action && action.action_id) {
          const dispatchRes = await fetch(`${API_BASE_URL}/national/response-actions/${action.action_id}/dispatch`, { method: 'POST' });
          if (dispatchRes.ok) {
            setDispatchStatus({ type: 'success', message: '✓ DISPATCH RECORDED' });
            showToast("✓ Dispatch recorded. Unit set to EN_ROUTE", "success");
            
            // Advance Field Unit State Machine
            setFieldUnitStates(prev => ({ ...prev, 'FU-001': 'EN_ROUTE' }));
            if (activePlan) {
              setActivePlan(prev => ({ ...prev, status: 'DISPATCHED' }));
            }
            fetchIncidentDetail(incId);
            fetchAllData();
          } else {
            setDispatchStatus({ type: 'error', message: 'DISPATCH FAILED: Plan must be APPROVED first' });
            showToast("Action must be APPROVED first", "error");
          }
        } else {
          setDispatchStatus({ type: 'error', message: 'NO RESPONSE ACTION AVAILABLE' });
        }
      } else {
        setDispatchStatus({ type: 'error', message: 'NO RESPONSE PLAN AVAILABLE' });
      }
    } catch (e) {
      setDispatchStatus({ type: 'error', message: e.message });
    }
  }

  const handleUpdateUnitState = async (unitId, nextState) => {
    try {
      const res = await fetch(`${API_BASE_URL}/national/field-units/${unitId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_status: nextState, actor: 'EOC Operator', role: 'EOC_OPERATOR' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.detail || data.error || `HTTP ${res.status}`);
      setFieldUnitStates(prev => ({ ...prev, [unitId]: nextState }));
      setFieldUnits(prev => prev.map(u => u.field_unit_id === unitId ? { ...u, status: nextState } : u));
      showToast(`✓ Field unit status recorded by backend: ${nextState}`, "success");
      return true;
    } catch (e) {
      showToast(`Status change rejected: ${e.message}`, "error");
      return false;
    }
  };

  const activeIncidents = incidents.filter(i => !['RESOLVED', 'CLOSED'].includes(i.status));
  const availableResourcesCount = resources.filter(r => r.status === 'AVAILABLE' || r.status === 'PARTIALLY_AVAILABLE').length;

  // State for Start Operation Modal
  const [activeOperationModal, setActiveOperationModal] = useState(null);

  return (
    <div className="flex h-screen bg-[#F5F7FA] text-slate-900 font-sans overflow-hidden">
      
      {/* Toast Notification Banner (Zero Native Browser Alerts) */}
      {toastMessage && (
        <div className={`fixed top-3 right-3 z-[2000] px-4 py-2.5 rounded-md font-bold text-xs shadow-lg flex items-center gap-2 border transition ${
          toastMessage.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' :
          toastMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-900 text-white border-slate-700'
        }`}>
          <span>ℹ {toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 font-black hover:opacity-75">&times;</button>
        </div>
      )}

      {/* Start Operation Modal */}
      {activeOperationModal && (
        <div className="fixed inset-0 z-[3000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-300 shadow-2xl max-w-lg w-full p-5 space-y-4 text-xs">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <h3 className="font-black text-sm uppercase text-[#0B4F8A] flex items-center gap-2">
                <span>📡</span> FIELD OPERATION IN PROGRESS: {activeOperationModal.name}
              </h3>
              <button onClick={() => setActiveOperationModal(null)} className="text-slate-400 hover:text-slate-700 font-bold text-sm">✕</button>
            </div>

            <div className="bg-blue-50/70 border border-blue-200 p-3 rounded space-y-1.5 text-slate-800">
              <div><b>SELECTED INCIDENT:</b> <span className="font-bold text-[#0B4F8A]">{selectedIncident?.title || 'none selected'}</span></div>
              <div><b>STATUS:</b> <span className="font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded border border-purple-200">OPERATING</span></div>
              <div><b>ASSIGNED TEAM:</b> {activeOperationModal.name} ({activeOperationModal.unit_type})</div>
            </div>

            <div className="space-y-1.5">
              <div className="font-bold uppercase text-[10px] text-slate-500">CURRENT OPERATIONAL TASK</div>
              <p className="bg-slate-50 p-2.5 rounded border border-slate-200 text-slate-700 font-medium">
                Status OPERATING recorded by the backend. Task details are not tracked in this prototype.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="font-bold uppercase text-[10px] text-slate-500">FIELD REPORTS & EVIDENCE</div>
              <div className="bg-slate-50 text-slate-700 p-2 rounded border border-slate-200 text-[11px]">
                No field telemetry or evidence uploads are connected; evidence appears in the COP only when recorded through the evidence API.
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-200">
              <button
                onClick={() => {
                  handleUpdateUnitState(activeOperationModal.field_unit_id, 'COMPLETED');
                  setActiveOperationModal(null);
                }}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded text-xs shadow-sm"
              >
                COMPLETE OPERATION
              </button>
              <button
                onClick={() => setActiveOperationModal(null)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-3 py-2 rounded text-xs"
              >
                Close Modal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 1. LEFT SIDEBAR NAVIGATION APP SHELL                        */}
      {/* ============================================================ */}
      <aside className="w-64 bg-white border-r border-[#D9E0E8] flex flex-col justify-between shrink-0 z-30 shadow-sm">
        <div>
          {/* Header Branding */}
          <div className="p-4 border-b border-[#D9E0E8]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0B4F8A]"></span>
              <div>
                <h1 className="font-extrabold text-sm tracking-tight text-[#0B4F8A] leading-none uppercase">
                  AEGIS-COP
                </h1>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">
                  Tactical Edge Common Operating Picture
                </p>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1 text-xs font-semibold">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              COMMAND PANELS
            </div>

            <button
              onClick={() => setActiveTab('overview')}
              className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-2.5 transition ${
                activeTab === 'overview' ? 'bg-[#0B4F8A] text-white font-bold shadow-sm' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>▣</span> OVERVIEW
            </button>

            <button
              onClick={() => setActiveTab('incidents')}
              className={`w-full text-left px-3 py-2 rounded-md flex items-center justify-between transition ${
                activeTab === 'incidents' ? 'bg-[#0B4F8A] text-white font-bold shadow-sm' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span>🚨</span> INCIDENTS
              </div>
              {activeIncidents.length > 0 && (
                <span className="text-[9px] bg-red-600 text-white font-black px-1.5 py-0.5 rounded-full">
                  {activeIncidents.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('field')}
              className={`w-full text-left px-3 py-2 rounded-md flex items-center justify-between transition ${
                activeTab === 'field' ? 'bg-[#0B4F8A] text-white font-bold shadow-sm' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span>📡</span> FIELD OPERATIONS
              </div>
              <span className="text-[9px] text-blue-800 font-bold">
                {fieldUnits.length} Teams
              </span>
            </button>

            <button
              onClick={() => setActiveTab('weather')}
              className={`w-full text-left px-3 py-2 rounded-md flex items-center justify-between transition ${
                activeTab === 'weather' ? 'bg-[#0B4F8A] text-white font-bold shadow-sm' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span>🌦️</span> WEATHER & PREPAREDNESS
              </div>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                weatherForecast?.status === 'success' ? 'bg-blue-100 text-blue-900' : 'bg-amber-100 text-amber-800'
              }`}>
                {weatherForecast?.is_controlled_scenario ? 'SCENARIO' : weatherForecast?.status === 'success' ? 'LIVE' : 'UNAVAILABLE'}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('satellite')}
              className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-2.5 transition ${
                activeTab === 'satellite' ? 'bg-[#0B4F8A] text-white font-bold shadow-sm' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>🛰</span> SATELLITE
            </button>

            <button
              onClick={() => setActiveTab('national')}
              className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-2.5 transition ${
                activeTab === 'national' ? 'bg-[#0B4F8A] text-white font-bold shadow-sm' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>🌐</span> NATIONAL FLOOD RISK
            </button>
          </nav>
        </div>

        {/* Bottom System Provenance */}
        <div className="p-3 border-t border-[#D9E0E8] bg-slate-50 text-[10px] text-slate-600 space-y-1">
          <div className="font-bold text-slate-800">HUBBALLI–DHARWAD EOC</div>
          <div className={`font-bold ${copError ? 'text-red-700' : copData ? 'text-emerald-700' : 'text-slate-500'}`}>
            BACKEND: ● {copError ? 'UNREACHABLE' : copData ? 'CONNECTED' : 'CONNECTING'}
          </div>
          <div className="text-slate-500 font-mono">TIME: {lastUpdatedTime}</div>
        </div>
      </aside>

      {/* ============================================================ */}
      {/* MAIN CONTENT AREA                                            */}
      {/* ============================================================ */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* Top Header Bar */}
        <header className="bg-white border-b border-[#D9E0E8] px-5 py-3 flex justify-between items-center z-20 shrink-0 shadow-sm">
          <div>
            <h2 className="text-sm font-extrabold uppercase tracking-tight text-[#0B4F8A]">
              AEGIS-COP — TACTICAL EDGE COMMON OPERATING PICTURE
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">
              Observation → evidence → threat → route impact → explainable recommendation → human decision · Hubballi-Dharwad prototype
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('weather')}
              className="text-slate-700 hover:bg-slate-200 bg-slate-100 px-3 py-1.5 rounded border border-slate-200 flex items-center gap-2 cursor-pointer transition font-mono text-xs"
              title="Click to open Weather & Preparedness Dashboard"
            >
              <span>🌦️</span>
              {weatherForecast?.status === 'success' ? (
                <>
                  {weatherForecast.is_controlled_scenario && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-purple-100 text-purple-800" title="Controlled demonstration scenario — not live observation">
                      CONTROLLED SCENARIO
                    </span>
                  )}
                  <span>{weatherForecast.current?.temperature_c ?? '--'}°C</span>
                  <span className="text-slate-400">|</span>
                  <span>Rain Prob 6h: <strong>{weatherForecast.summary?.max_prob_6h ?? '--'}%</strong></span>
                  <span className="text-slate-400">|</span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black text-white ${
                    weatherForecast.summary?.preparedness_badge === 'CRITICAL' ? 'bg-red-700' :
                    weatherForecast.summary?.preparedness_badge === 'HIGH' ? 'bg-amber-600' : 'bg-emerald-600'
                  }`}>
                    {weatherForecast.summary?.preparedness_badge ?? 'UNKNOWN'}
                  </span>
                </>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-100 text-amber-800" title={weatherForecast?.error || 'No weather response'}>
                  WEATHER UNAVAILABLE
                </span>
              )}
            </button>

            <div className={`font-bold px-2.5 py-1.5 rounded border ${copError ? 'text-red-700 bg-red-50 border-red-200' : copData ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-600 bg-slate-50 border-slate-200'}`}
              title="Based on the last COP refresh (every 10 s)">
              ● {copError ? 'BACKEND UNREACHABLE' : copData ? 'BACKEND CONNECTED' : 'CONNECTING'}
            </div>

            {/* Run Flood Response Demo Button */}
            <button
              onClick={handleRunFloodResponseDemo}
              disabled={!!demoStep}
              className="bg-[#0B4F8A] hover:bg-[#083B68] text-white font-bold text-xs px-4 py-2 rounded shadow-sm transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <span>🌊</span>
              <span>
                {demoStep === 'ACTIVATING_SCENARIO' && 'ACTIVATING SCENARIO...'}
                {demoStep === 'REFRESHING_RISK' && 'REFRESHING RISK...'}
                {demoStep === 'ASSESSING_INCIDENTS' && 'ASSESSING INCIDENTS...'}
                {demoStep === 'PREPARING_RESPONSE' && 'PREPARING RESPONSE...'}
                {demoStep === 'DEMO_READY' && '✓ DEMO READY'}
                {!demoStep && (scenarioStatus?.active ? 'END RAIN SCENARIO' : 'RAIN SCENARIO (SIMULATED)')}
              </span>
            </button>
          </div>
        </header>

        {/* Controlled Scenario Banner */}
        {scenarioStatus?.active && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-1.5 flex justify-between items-center text-xs font-bold shrink-0 z-10">
            <div className="flex items-center gap-2">
              <span className="text-amber-700">⚠</span>
              <span>CONTROLLED DEMONSTRATION SCENARIO — NOT LIVE OBSERVATION</span>
            </div>
            <div className="text-[11px] font-mono text-amber-800">
              CONTROLLED PRECIPITATION: {scenarioStatus.config?.precipitation_mm || 80} mm — CONTROLLED SCENARIO | DRAINAGE BLOCKAGE: {scenarioStatus.config?.blockage_percent || 50}%
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 1: EOC OVERVIEW DASHBOARD                               */}
        {/* ============================================================ */}
        {activeTab === 'overview' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-[#F5F7FA] p-4 gap-3">
            
            {/* Data-source availability and the mission decision chain (backend state only) */}
            <DataSourceStrip copData={copData} copError={copError} systemStatus={systemStatus} />
            <DecisionChain mission={missionState} copData={copData} />

            {/* Main Area: Priority Queue (left) | Map (center) | Active Response Teams & Route Monitoring (right) */}
            <div className="flex-1 flex gap-3 overflow-hidden">
              
              {/* Left COP Threat Intelligence Panel */}
              <div className="w-64 shrink-0 overflow-hidden flex flex-col gap-2">
                {copLoading ? (
                  <div className="p-4 bg-white border border-[#D9E0E8] rounded-md text-xs font-bold text-slate-500 italic">
                    Loading COP...
                  </div>
                ) : copError && !copData ? (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs font-bold text-red-700">
                    Unable to load COP data: {copError}
                  </div>
                ) : (
                  <>
                  {copError && (
                    <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded-md text-[11px] font-bold text-red-700">
                      STALE — last refresh failed ({copError}). Showing snapshot from {new Date(copData.generated_at).toLocaleTimeString()}.
                    </div>
                  )}
                  <div className="flex-1 min-h-0">
                  <ThreatPanel 
                    threats={copData?.threats || []} 
                    onSelectThreat={(t) => handleSelectIncident({
                      incident_id: t.id,
                      title: t.title,
                      severity: t.severity,
                      status: t.status,
                      latitude: t.latitude,
                      longitude: t.longitude,
                      hazard_type: t.category,
                      description: t.description
                    })} 
                    selectedThreatId={selectedIncident?.incident_id} 
                  />
                  </div>
                  <SelectedThreatEvidence copData={copData} threatId={selectedIncident?.incident_id} />
                  </>
                )}
              </div>

              {/* Center City-Wide Situation Map */}
              <div className="flex-1 bg-white border border-[#D9E0E8] rounded-md overflow-hidden relative shadow-sm">
                <MapComponent
                  onRouteCalculated={setRouteInfo}
                  floodOverlay={floodOverlay}
                  showIncidents={layers.incidents}
                  showRisk={layers.risk}
                  showResources={layers.resources}
                  showFieldUnits={layers.fieldUnits}
                  showSatellite={layers.satellite}
                  incidents={incidents}
                  resources={resources}
                  fieldUnits={fieldUnits}
                  copData={copData}
                  copError={copError}
                  copEnabled={true}
                  replacementRoute={proposedRoute}
                />
              </div>

              {/* Right Sidebar: active mission (primary) and field units */}
              <div className="w-96 bg-white border border-[#D9E0E8] rounded-md p-3 flex flex-col gap-3 shrink-0 overflow-y-auto shadow-sm text-xs">

                {/* Active mission: threat report -> route compromise -> alternative -> operator decision */}
                <MissionPanel
                  copData={copData}
                  refreshCop={refreshCop}
                  showToast={showToast}
                  onProposedRoute={setProposedRoute}
                  onMissionChange={setMissionRoute}
                  onStateChange={setMissionState}
                />

                {/* Live Dispatched Response Teams Panel */}
                <div className="bg-slate-50 border border-slate-200 rounded p-3 space-y-2">
                  <div className="font-extrabold text-[10px] text-[#0B4F8A] uppercase tracking-wider border-b border-slate-200 pb-1 flex justify-between items-center">
                    <span>FIELD UNITS{fieldUnits.some(u => u.demo) ? ' (DEMO ROSTER)' : ''}</span>
                    <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold">
                      {fieldUnits.filter(u => ['EN_ROUTE', 'AT_SCENE', 'OPERATING'].includes(fieldUnitStates[u.field_unit_id] || u.status)).length} EN ROUTE / ON SCENE
                    </span>
                  </div>

                  {fieldUnits.length === 0 ? (
                    <div className="text-slate-400 italic text-[11px]">No field units registered.</div>
                  ) : (
                    <div className="space-y-2">
                      {fieldUnits.map(fu => {
                        const st = fieldUnitStates[fu.field_unit_id] || fu.status || 'UNKNOWN';
                        return (
                          <div key={fu.field_unit_id} className="bg-white p-2.5 rounded border border-slate-200 space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-900 flex items-center gap-1">
                                <span>{fu.unit_type?.includes('BOAT') ? '🛥️' : fu.unit_type?.includes('AMBULANCE') ? '🚑' : '🚒'}</span>
                                {fu.name}
                              </span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                st === 'EN_ROUTE' ? 'bg-blue-100 text-blue-800' :
                                st === 'AT_SCENE' ? 'bg-amber-100 text-amber-800' :
                                st === 'OPERATING' ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {st}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-600">
                              <b>Linked incident:</b> {incidents.find(i => i.incident_id === fu.incident_id)?.title || 'none'} · {fu.city || fu.district || 'location unknown'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>


              </div>
            </div>

            {/* Bottom Operational Timeline */}
            <div className="bg-white border border-[#D9E0E8] rounded-md p-3 shrink-0 text-xs shadow-sm">
              <div className="font-extrabold text-[10px] uppercase text-slate-500 mb-1">OPERATIONAL TIMELINE & EVENT FEED</div>
              <div className="flex gap-2 overflow-x-auto text-[10px]">
                {selectedIncidentDetail?.timeline ? selectedIncidentDetail.timeline.map((evt, idx) => (
                  <div key={idx} className="bg-slate-50 border border-slate-200 px-2.5 py-1 rounded shrink-0">
                    <span className="font-mono text-slate-500">{new Date(evt.timestamp).toLocaleTimeString()}</span> - <span className="font-bold text-[#0B4F8A]">{evt.event_type}</span>: <span className="text-slate-800">{evt.description}</span>
                  </div>
                )) : <div className="text-slate-400 italic">Select an incident to view timeline events.</div>}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: INCIDENT COMMAND DASHBOARD                            */}
        {/* ============================================================ */}
        {activeTab === 'incidents' && (
          <div className="flex-1 p-4 overflow-hidden bg-[#F5F7FA]">
            <IncidentCenter
              onClose={() => setActiveTab('overview')}
              sharedSelectedIncident={selectedIncident}
              onSelectIncident={inc => {
                setSelectedIncident(inc);
                fetchIncidentDetail(inc.incident_id);
              }}
            />
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: FIELD OPERATIONS DASHBOARD WITH COMPLETE AUDIT TRAIL  */}
        {/* ============================================================ */}
        {activeTab === 'field' && (
          <div className="flex-1 p-4 overflow-y-auto bg-[#F5F7FA] text-xs space-y-4">
            <div className="bg-white border border-[#D9E0E8] p-4 rounded-md flex justify-between items-center shadow-sm">
              <div>
                <h2 className="text-base font-extrabold text-[#0B4F8A] uppercase">FIELD OPERATIONS COMMAND & AUDIT DESK</h2>
                <div className="text-slate-600 font-bold text-xs mt-0.5">FIELD UNIT STATUS (BACKEND-VALIDATED TRANSITIONS) & INCIDENT TIMELINE</div>
              </div>
              <button
                onClick={submitFieldTeamReport}
                title="Creates a SIMULATED field-team report on the active mission route"
                className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-3.5 py-2 rounded shadow-sm"
              >
                SIMULATE FIELD REPORT: ROAD BLOCKED
              </button>
            </div>

            {/* Active Response Units Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {fieldUnits.map(fu => {
                const st = fieldUnitStates[fu.field_unit_id] || fu.status || 'UNKNOWN';
                return (
                  <div key={fu.field_unit_id} className="bg-white border border-[#D9E0E8] p-4 rounded-md space-y-2.5 shadow-sm">
                    <div className="flex justify-between items-center border-b border-[#D9E0E8] pb-2">
                      <span className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                        <span>{fu.unit_type?.includes('BOAT') ? '🛥️' : fu.unit_type?.includes('AMBULANCE') ? '🚑' : '🚒'}</span>
                        {fu.name}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 font-bold rounded border ${
                        st === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-blue-50 text-[#0B4F8A] border-blue-200'
                      }`}>
                        {st}
                      </span>
                    </div>
                    <div className="text-slate-700"><b>Type:</b> {fu.unit_type}</div>
                    <div className="text-slate-700"><b>Linked incident:</b> {incidents.find(i => i.incident_id === fu.incident_id)?.title || 'none'}</div>
                    <div className="text-slate-700"><b>Current Location:</b> {fu.city || fu.district}</div>

                    {/* Unit State Machine Action Buttons */}
                    <div className="pt-2 border-t border-[#D9E0E8] grid grid-cols-2 gap-1.5">
                      <button onClick={() => handleUpdateUnitState(fu.field_unit_id, 'EN_ROUTE')} className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold p-1.5 rounded text-[10px] border border-slate-300">
                        START TRIP
                      </button>
                      <button onClick={() => handleUpdateUnitState(fu.field_unit_id, 'AT_SCENE')} className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold p-1.5 rounded text-[10px] border border-slate-300">
                        ARRIVED SCENE
                      </button>
                      <button
                        onClick={() => {
                          handleUpdateUnitState(fu.field_unit_id, 'OPERATING');
                          setActiveOperationModal(fu);
                        }}
                        className="bg-purple-100 hover:bg-purple-200 text-purple-900 font-bold p-1.5 rounded text-[10px] border border-purple-300"
                      >
                        START OPERATION
                      </button>
                      <button onClick={() => handleUpdateUnitState(fu.field_unit_id, 'COMPLETED')} className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold p-1.5 rounded text-[10px]">
                        COMPLETE
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Field Incident Audit Table (Detected, Acknowledged, Assessing, Escalated, Resolved) */}
            <div className="bg-white border border-[#D9E0E8] rounded-md p-4 space-y-3 shadow-sm">
              <div className="font-extrabold text-xs text-[#0B4F8A] uppercase tracking-wider border-b border-[#D9E0E8] pb-2 flex justify-between items-center">
                <span>FIELD INCIDENT AUDIT & STATUS TRACKING</span>
                <span className="text-[10px] text-slate-500 font-mono">TOTAL INCIDENTS: {incidents.length}</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-600">
                      <th className="p-2">INCIDENT TITLE</th>
                      <th className="p-2">LOCATION</th>
                      <th className="p-2">HAZARD TYPE</th>
                      <th className="p-2">SEVERITY</th>
                      <th className="p-2">STATUS</th>
                      <th className="p-2">ASSIGNED TEAM</th>
                      <th className="p-2">EVIDENCE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.map((inc, idx) => (
                      <tr key={inc.incident_id} className={`border-b border-slate-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                        <td className="p-2 font-bold text-slate-900">{inc.title}</td>
                        <td className="p-2 text-slate-700">{inc.district}, {inc.state}</td>
                        <td className="p-2 text-[#0B4F8A] font-medium">{inc.hazard_type}</td>
                        <td className="p-2">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black text-white ${
                            inc.severity === 'CRITICAL' ? 'bg-red-700' : 'bg-amber-600'
                          }`}>
                            {inc.severity}
                          </span>
                        </td>
                        <td className="p-2 font-bold text-slate-800">{inc.status}</td>
                        <td className="p-2 text-slate-700">{fieldUnits.filter(u => u.incident_id === inc.incident_id).map(u => u.name).join(', ') || '—'}</td>
                        <td className="p-2 font-mono text-[10px] text-slate-700">{(() => { const n = (copData?.evidence || []).filter(e => e.threat_id === inc.incident_id).length; return n ? `${n} evidence record${n > 1 ? 's' : ''}` : 'none'; })()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Real timeline of the selected incident (backend record) */}
            <div className="bg-white border border-[#D9E0E8] rounded-md p-4 space-y-3 shadow-sm">
              <div className="font-extrabold text-xs text-[#0B4F8A] uppercase tracking-wider border-b border-[#D9E0E8] pb-2">
                INCIDENT TIMELINE {selectedIncidentDetail?.title ? `— ${selectedIncidentDetail.title}` : ''}
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto font-mono text-[11px] pr-1">
                {selectedIncidentDetail?.timeline?.length ? selectedIncidentDetail.timeline.map((evt, idx) => (
                  <div key={idx} className="bg-slate-50 p-2 rounded border border-slate-200 text-slate-800">
                    <span className="text-slate-500 font-bold">{new Date(evt.timestamp).toLocaleTimeString()}</span> — <span className="font-bold text-[#0B4F8A]">{evt.event_type}</span>: {evt.description}
                  </div>
                )) : <div className="text-slate-400 italic">Select an incident (Overview threat list or Incidents tab) to see its recorded timeline.</div>}
              </div>
            </div>

          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 4: WEATHER & PREPAREDNESS DASHBOARD                     */}
        {/* ============================================================ */}
        {activeTab === 'weather' && (
          <div className="flex-1 flex flex-col p-4 bg-[#F5F7FA] overflow-y-auto">
            <WeatherDashboard onSelectTab={setActiveTab} isScenarioActive={scenarioStatus?.active} />
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 5: SATELLITE INTELLIGENCE DASHBOARD                      */}
        {/* ============================================================ */}
        {activeTab === 'satellite' && (
          <div className="flex-1 flex flex-col p-4 bg-[#F5F7FA] gap-3 overflow-hidden">
            <div className="bg-white border border-[#D9E0E8] p-3 rounded-md flex justify-between items-center shrink-0 shadow-sm">
              <div>
                <h2 className="text-base font-extrabold uppercase text-[#0B4F8A] flex items-center gap-2">
                  <span>🛰</span> SATELLITE INTELLIGENCE & EARTH OBSERVATION
                </h2>
                <p className="text-xs text-slate-600">NASA GIBS VIIRS SNPP Corrected Reflectance True Color Imagery — Centered on Hubballi-Dharwad Urban Sector</p>
              </div>
              <div className="flex items-center gap-3 text-xs font-bold">
                <span className="bg-blue-50 text-[#0B4F8A] border border-blue-200 px-3 py-1 rounded">
                  FRESHNESS: UNKNOWN (Latest Available GIBS Imagery)
                </span>
              </div>
            </div>

            <div className="flex-1 bg-white border border-[#D9E0E8] rounded-md overflow-hidden relative shadow-sm">
              <MapComponent
                showSatellite={true}
                satLayers={satLayers}
                incidents={incidents}
                fieldUnits={fieldUnits}
              />
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 5: NATIONAL RISK DASHBOARD                              */}
        {/* ============================================================ */}
        {activeTab === 'national' && (
          <div className="flex-1 relative overflow-hidden bg-[#F5F7FA]">
            <NationalView />
          </div>
        )}

      </div>

    </div>
  );
}

// Evidence linked to the threat selected in the left panel (COP canonical evidence).
function SelectedThreatEvidence({ copData, threatId }) {
  const threat = (copData?.threats || []).find((t) => t.id === threatId);
  if (!threat) {
    return (
      <div className="bg-white border border-[#D9E0E8] rounded-md p-2 text-[10px] text-slate-500 italic shrink-0">
        Select a threat to inspect its linked evidence.
      </div>
    );
  }
  const evidence = (copData?.evidence || []).filter((e) => e.threat_id === threat.id);
  return (
    <div className="bg-white border border-[#D9E0E8] rounded-md p-2 text-[10px] space-y-1 shrink-0 max-h-56 overflow-y-auto">
      <div className="font-extrabold uppercase text-[#0B4F8A]">Evidence for {threat.id}</div>
      <div className="text-slate-600">Status {threat.status} · source {threat.source || 'unknown'}{threat.is_demo ? ' · DEMO/SIMULATED' : ''} · confidence {threat.confidence}</div>
      {evidence.length === 0 ? (
        <div className="text-slate-500 italic">No evidence records linked to this threat.</div>
      ) : evidence.map((e) => (
        <div key={e.id} className="border border-slate-200 rounded p-1.5 bg-slate-50">
          <div className="flex justify-between gap-1">
            <b className="truncate">{e.id}</b>
            {e.is_simulation && <span className="text-amber-800 font-bold">SIMULATED</span>}
          </div>
          <div>{e.source_type} {e.source_id || ''} · {e.observation_type}</div>
          {e.description && <div className="text-slate-600">{e.description}</div>}
          <div className="text-slate-500">Source-declared confidence {Math.round(e.confidence * 100)}% · {new Date(e.timestamp).toLocaleTimeString()}</div>
        </div>
      ))}
    </div>
  );
}
