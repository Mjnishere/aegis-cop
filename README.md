# 🌊 ResilienceRoute

### AI-Powered Urban Flood Nowcasting & Emergency Route Intelligence Platform

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React_19-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind_CSS-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/Build-Vite-646CFF?style=flat-square&logo=vite)](https://vitejs.dev/)
[![Open-Meteo](https://img.shields.io/badge/Weather-Open--Meteo-0075FF?style=flat-square)](https://open-meteo.com/)
[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=flat-square&logo=python)](https://python.org)

> **Project status (Oct 2026):** this codebase is now **AEGIS-COP**, a research prototype. Capabilities, verification evidence and limitations are tracked in [`docs/project/IMPLEMENTATION_STATUS.md`](docs/project/IMPLEMENTATION_STATUS.md); scores are uncalibrated heuristics, drainage data is synthetic, and evidence "AI" analysis is a mock. Terrain data is not distributed with the repository — see [`data/terrain/README.md`](data/terrain/README.md). Developer setup: [`CLAUDE.md`](CLAUDE.md).

**SIH Problem Statement**: `SIH26085` — Urban Flood Nowcasting System (Drainage and Rainfall Coupling)

**ResilienceRoute** couples short-term rainfall forecasts with terrain elevation (ISRO CartoDEM V3) and urban drainage constraints to estimate evolving flood risks over a **0–3 hour horizon**. It converts real-time inundation predictions into actionable **hazard-aware emergency routing**, automated **incident management**, and **resource dispatch intelligence** for municipal Emergency Operations Centers (EOC).

---

## 🌟 Key Features

### 🌦️ 1. Weather & Preparedness Intelligence
- **Live Open-Meteo Integration**: Real-time hourly precipitation, temperature, humidity, wind, and weather condition forecasts centered on the Hubballi-Dharwad region.
- **Chronological Time Alignment**: Automatically aligns 6H, 12H, 24H, and 48H forecast windows starting from the **current forecast hour**.
- **Municipal Preparedness Engine**: Automatically calculates early warning levels (`NORMAL`, `WATCH`, `PREPARE`, `HIGH PREPAREDNESS`, `CRITICAL PREPAREDNESS`) based on rainfall volume, probability, and active municipal drainage issues.
- **Dual-Series Chart**: Distinguishes Rain Probability (%) from Rainfall Volume (mm) and Temperature (°C).

### 🚑 2. Hazard-Aware Dynamic Routing
- **Dynamic Risk Weighting**: Automatically server-sever roads with critical flood risk (>80 risk score) and recalculates alternative safe detours via Dijkstra edge weighting.
- **Route Monitoring & Obstruction Invalidation**: Continuously monitors active emergency routes and automatically proposes lower-risk replacement routes when road blockages occur.

### 🚨 3. Incident Management & Response Planning
- **Automated Risk Scanning**: Converts high-risk regional signals into action items (e.g. Gokul Road Waterlogging, Dharwad Central Drainage Overflow, Culvert Blockages).
- **Automated Response Plan Generation**: Proposes matching field resources (NDRF teams, PWD drainage clearance units, municipal pumps) with resource reservation status tracking.

### 📡 4. Field Operations Lifecycle
- **Real-Time State Machine**: Tracks field units through `EN_ROUTE` → `AT_SCENE` → `OPERATING` → `COMPLETED`.
- **Live Vehicle Animation**: Smooth map animation of dispatched units navigating toward target incident locations.

### 🛰️ 5. Satellite Earth Observation
- **NASA GIBS & MOSDAC Integration**: Visualizes VIIRS SNPP Corrected Reflectance True Color Satellite Imagery over urban sectors.

---

## 🏗️ System Architecture

```
Rainfall Forecast (Open-Meteo) ──┐
                                 ├──> Runoff & Inundation Model ──> Road Hazard Weighting ──> Dynamic Dijkstra Routing
Terrain Elevation (CartoDEM)  ──┤
Drainage Capacity & Blockage  ──┘
```

```
[ Frontend: React 19 + Leaflet + Tailwind CSS ]
                       │
                       │ REST API (JSON)
                       ▼
[ Backend: FastAPI / Python 3.12 ]
   ├── Weather Adapter & Open-Meteo Client
   ├── Flood Routing & Hazard Service (OSMnx / NetworkX)
   ├── Incident & Response Plan Service
   └── Route Monitoring & Replacement Service
```

---

## 📁 Repository Structure

```
ResilienceRoute/
├── backend/
│   ├── app/
│   │   ├── config/             # Risk thresholds & operational config
│   │   ├── routes/             # FastAPI REST endpoints
│   │   ├── services/           # Core domain logic
│   │   │   ├── flood/          # Hydrological runoff & inundation engine
│   │   │   ├── incidents/      # Incident management & audit logs
│   │   │   ├── resources/      # Resource matching engine
│   │   │   ├── field_operations/# Field unit state machine
│   │   │   ├── routing_service.py # NetworkX OSM graph routing
│   │   │   └── weather_service.py # Open-Meteo live integration
│   │   └── main.py             # FastAPI main application entrypoint
│   ├── test_weather_forecast.py # Weather & scenario test suite
│   ├── test_operational_fixes.py # Operational & routing test suite
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── EocDashboard.jsx    # Main EOC Command Panel
│   │   │   ├── WeatherDashboard.jsx# Weather & Preparedness Dashboard
│   │   │   ├── Map.jsx             # React-Leaflet Map component
│   │   │   ├── IncidentCenter.jsx  # Incident Response Center
│   │   │   ├── ResourceCenter.jsx  # Resource Matching & Dispatch
│   │   │   └── AlertCenter.jsx     # Citizen Safety Alerts
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── data/
│   ├── osm/                    # Hubballi-Dharwad OSM GraphML data
│   └── terrain/                # CartoDEM elevation data
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- **Python 3.10+** (Python 3.12 recommended)
- **Node.js 18+** and `npm`

---

### 1️⃣ Setup & Run Backend

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# macOS / Linux:
# source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start FastAPI backend server
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

The backend server will run at:
- **API Base URL**: `http://127.0.0.1:8000`
- **Interactive Swagger Docs**: `http://127.0.0.1:8000/docs`

---

### 2️⃣ Setup & Run Frontend

```bash
# Navigate to frontend directory
cd frontend

# Install Node dependencies
npm install

# Start Vite dev server
npm run dev
```

The frontend application will be available at:
- **App URL**: `http://127.0.0.1:5173`

---

## 🧪 Running Tests

### Backend Unit & Integration Tests

```bash
cd backend

# Run weather forecast test suite
.\venv\Scripts\python.exe -m unittest test_weather_forecast.py

# Run operational fixes regression test suite
.\venv\Scripts\python.exe test_operational_fixes.py

# Run targeted response plan bugfix test suite
.\venv\Scripts\python.exe test_response_plan_bugfix.py

# Discover & run all tests
.\venv\Scripts\python.exe -m unittest discover -s . -p "test_*.py"
```

### Frontend Build Verification

```bash
cd frontend
npm run build
```

---

## 🔌 API Reference Highlights

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/health` | `GET` | System health check |
| `/api/weather` | `GET` | Live meteorological observations |
| `/api/weather/forecast` | `GET` | 48-hour chronological forecast aligned to current hour |
| `/api/route/flood-safe` | `GET` | Dynamic flood-safe route calculation |
| `/api/national/incidents` | `GET` | Active incident queue |
| `/api/scenario/activate` | `POST` | Activate controlled flood demonstration scenario |
| `/api/scenario/deactivate` | `POST` | Deactivate scenario & restore live Open-Meteo forecast |

---

## 📄 License & Disclaimer

This project is built for **SIH26085** decision support and demonstration purposes. Weather data is powered by [Open-Meteo](https://open-meteo.com/). Drainage network overlays utilize modeled sector corridors.
