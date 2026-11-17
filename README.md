# DigSafe AI

> **Experimental construction-safety decision support system for utility-proximity risk assessment in excavation operations (Bengaluru, India).**
>
> ⚠️ All ML predictions use **synthetic, rule-based training labels**. They are not validated for real-world excavation safety. Do not rely on any prediction output to make actual excavation decisions. Consult official utility records and qualified engineering personnel before any excavation work.

---

## Table of Contents

- [Project Structure](#project-structure)
- [Requirements](#requirements)
- [Setup](#setup)
- [Running the Application](#running-the-application)
- [Running Tests](#running-tests)
- [Importing Utility Datasets (KML)](#importing-utility-datasets-kml)
- [API Endpoints](#api-endpoints)
- [Model Status](#model-status)
- [Known Issues & Limitations](#known-issues--limitations)

---

## Project Structure

```
DigSafeAI_Project/
├── backend/
│   ├── .venv/                    Python virtual environment
│   ├── .env                      Local configuration (never commit)
│   ├── server.js                 Express server entry point
│   ├── lib/                      Shared utilities (config, geospatial, modelRegistry, etc.)
│   ├── middleware/               authMiddleware
│   ├── ml/
│   │   ├── inference_service.py  Risk prediction subprocess (RF + XGBoost)
│   │   ├── detr_inference.py     DETR object detection subprocess
│   │   ├── retrain_xgboost.py    XGBoost retraining script (safe, non-destructive)
│   │   ├── test_inference_service.py  Python unit tests
│   │   ├── models/               Trained model artifacts
│   │   │   ├── random_forest.joblib
│   │   │   ├── xgboost.joblib     (replaced from xgboost_new.joblib)
│   │   │   ├── feature_columns.joblib
│   │   │   └── risk_label_encoder.joblib
│   │   └── vision/
│   │       └── detr/
│   │           └── dataset2_detr_model/   DETR model directory (config.json, model.safetensors, preprocessor_config.json)
│   ├── models/                   Mongoose models (User, Utility, RiskResult, SensorReading)
│   ├── routes/                   Express routes
│   ├── scripts/
│   │   └── importDatasets.js     KML + CSV utility data importer
│   └── tests/                    Node.js test suite (42 tests)
├── frontend/                     Vite + React 19 SPA
└── Datasets/                     KML and CSV utility data files (BWSSB, BESCOM)
```

---

## Requirements

### Runtime
| Dependency | Version | Notes |
|-----------|---------|-------|
| Node.js | 18+ (tested: v25.6.0) | |
| npm | 10+ (tested: 11.8.0) | |
| Python | 3.10+ (tested: 3.12.10) | Must be the venv Python |
| MongoDB | 5+ (tested: local) | Required for utility search, auth, reports |

### Python packages (in `backend/.venv`)
```
joblib==1.4.2      scikit-learn==1.6.1   xgboost==3.4.1
numpy==1.26.4      pandas==2.3.3
torch==2.14.1+cpu  transformers==5.20.2  safetensors==0.8.0
timm==1.0.30       torchvision==0.29.1
```

---

## Setup

### 1. Clone and install Node dependencies
```powershell
# Install backend
cd backend
npm install

# Install frontend
cd ../frontend
npm install
```

### 2. Python virtual environment
The virtual environment is already created at `backend/.venv`.
To re-create it:
```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install joblib scikit-learn xgboost numpy pandas torch transformers safetensors timm torchvision
```

### 3. Backend configuration (`.env`)
The file `backend/.env` is already created with development defaults:
```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/digsafe
JWT_SECRET=digsafe-local-development-secret-change-in-production-32chars
CORS_ORIGINS=http://localhost:5173,http://localhost:5174
MAX_REQUEST_SIZE=10mb
PYTHON_EXECUTABLE=C:\Users\Pragathi BR\OneDrive\Desktop\DigSafeAI_Project\backend\.venv\Scripts\python.exe
```
> ⚠️ Change `JWT_SECRET` to a strong random value (32+ characters) in any non-development environment.

### 4. MongoDB
Ensure MongoDB is running at `localhost:27017`. The backend connects automatically and starts in degraded mode if MongoDB is unreachable (sensor simulation still works; utility search and auth require the database).

To install MongoDB Community: https://www.mongodb.com/try/download/community

### Resetting a forgotten password

If a user cannot log in due to a forgotten password, use the secure reset script:

```powershell
cd backend
node scripts/reset_password.js "email@example.com" "NewPassword123!"
```

The script:
- Hashes the new password with bcrypt (cost 12) before writing — no plaintext is stored
- Verifies the new hash round-trips correctly before and after writing
- Only updates the `password` field — no other data is changed
- Prints `SUCCESS` with bcrypt verification result; never prints the hash


---

## Running the Application

### Backend
```powershell
cd backend
node server.js
# Server starts on http://localhost:5000
```

### Frontend
```powershell
cd frontend
npm run dev
# Dev server starts on http://localhost:5173
```

---

## Running Tests

### Node.js backend tests (42 tests)
```powershell
cd backend
$env:PYTHON_EXECUTABLE='C:\Users\Pragathi BR\OneDrive\Desktop\DigSafeAI_Project\backend\.venv\Scripts\python.exe'
node --test tests/*.test.js
# Expected: 42 pass, 0 fail
```

### Python ML tests (8 tests)
```powershell
cd backend\ml
$env:PYTHONUTF8=1
& '..\..venv\Scripts\python.exe' -X utf8 -m unittest test_inference_service -v
# Expected: 8 pass, 0 fail
```

---

## Importing Utility Datasets (KML)

Utility proximity search requires KML data to be imported into MongoDB.
The datasets are in `Datasets/` (BWSSB water lines, sewer lines, BESCOM substations).

```powershell
cd backend

# Dry run first — validates files, shows record counts, does NOT write to DB
node scripts/importDatasets.js -- --dry-run

# Full import (safe to re-run — uses upsert, does not duplicate records)
node scripts/importDatasets.js
```

> This may take 10–30 minutes depending on machine speed (total KML files: ~170 MB).

After import, the utility proximity search at `GET /api/utilities/search?lat=12.97&lng=77.59&radius=500` will return real utility records.

---

## API Endpoints

All endpoints under `/api/*` require a `Bearer` JWT token in the `Authorization` header (except `/api/auth/signup` and `/api/auth/login`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Application + database health |
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/login` | Login, get JWT |
| GET | `/api/auth/session` | Verify current token |
| GET | `/api/models/status` | ML model status (RF, XGBoost, DETR, YOLO, Faster R-CNN) |
| POST | `/api/models/image-inference` | Upload JPEG/PNG/WebP → DETR object detection |
| GET | `/api/utilities/search` | Utility proximity search (`lat`, `lng`, `radius` params) |
| POST | `/api/risk/analyze` | Excavation risk prediction (RF + XGBoost) |
| POST | `/api/simulation/simulate` | Generate simulated sensor readings |
| GET | `/api/reports` | List saved risk reports |
| POST | `/api/reports` | Save a risk report |

---

## Model Status

| Model | Status | Notes |
|-------|--------|-------|
| Random Forest | ✅ READY | Loads from `random_forest.joblib`, 9-feature synthetic pipeline |
| XGBoost | ✅ READY | Retrained from `xgboost_new.joblib` (original corrupted); see retrain_xgboost.py |
| DETR (object detection) | ✅ READY | Loads from `dataset2_detr_model/`; labels: `pipe`, `object` |
| YOLO | ❌ ZIP ONLY | Artifact is a `.zip` archive; not extracted; no class map verified |
| Faster R-CNN | ❌ ZIP ONLY | Artifact is a `.zip` archive; not extracted; architecture not verified |

### Risk model limitation
Both RF and XGBoost use **synthetic, rule-based training labels** generated from simulated data.
The `limitation` field in every `/api/risk/analyze` response states this explicitly.

The application supports **partial results** — if one model fails to load or predict, the other model's result is returned with `partialResult: true` in the response.

---

## Known Issues & Limitations

| # | Issue | Status |
|---|-------|--------|
| L1 | XGBoost original artifact corrupted | **Fixed** — retrained, replaced with `xgboost_new.joblib` |
| L2 | DETR required `timm` dependency missing from registry check | **Fixed** — added to `PYTHON_MODULES` and `detrRequirements` |
| L3 | Sensor simulation required MongoDB write success | **Fixed** — fire-and-forget; works without DB |
| L4 | DETR artifact path pointed to zip file | **Fixed** — now points to extracted `dataset2_detr_model/` directory |
| L5 | `isModelPrediction()` required both RF and XGBoost | **Fixed** — accepts partial results |
| L6 | No `backend/.env` file | **Fixed** — created with PYTHON_EXECUTABLE set |
| L7 | YOLO / Faster R-CNN zip archives — not usable for inference | **Known** — needs extraction + architecture verification |
| L8 | Utility KML data requires import step | **Known** — run `node scripts/importDatasets.js` (see above) |
| L9 | ML labels are synthetic and not real-world validated | **By design** — disclosed in all API responses and this README |
| L10 | DETR model requires first-call warm-up (loads ~166 MB) | **Known** — ~30–60s first call; subsequent calls are faster |
