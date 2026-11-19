import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../services/api';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

function parseInputNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Fix leaflet marker icon issue in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

/**
 * Derives user-facing risk presentation details (explanation, factors, recommendations)
 * based strictly on verified inputs and the backend consensus risk class.
 */
function getUnifiedRiskDetails(consensusClass, { depth, radius, utilities, sensors }) {
  const normClass = typeof consensusClass === 'string' ? consensusClass.toUpperCase() : 'UNKNOWN';
  const numDepth = parseInputNumber(depth) ?? 0;
  const numRadius = parseInputNumber(radius) ?? 0;
  const safeUtilities = Array.isArray(utilities) ? utilities : [];
  const utilityCount = safeUtilities.length;
  
  // Calculate nearest utility distance from actual matched records
  const distances = safeUtilities
    .map(u => (Number.isFinite(u.distance) ? u.distance : null))
    .filter(d => d !== null);
  const minDistance = distances.length > 0 ? Math.min(...distances) : null;
  const utilityTypes = [...new Set(safeUtilities.map(u => u.utilityType).filter(Boolean))];

  // 1. Clear explanation of why the location received this category
  let explanation = '';
  if (normClass === 'HIGH') {
    if (minDistance !== null && minDistance <= 5) {
      explanation = `High risk assessed: Underground utility infrastructure (${utilityTypes.join(', ') || 'records'}) is directly adjacent or intersecting within ${minDistance.toFixed(1)}m of the proposed excavation footprint at depth ${numDepth}m.`;
    } else {
      explanation = `High risk assessed: Multi-feature risk evaluation indicates critical conflict probability between the planned excavation depth (${numDepth}m) and underground utility network corridors in this area.`;
    }
  } else if (normClass === 'MEDIUM') {
    explanation = `Medium risk assessed: Underground utility infrastructure is present within the ${numRadius}m search zone (nearest mapped line: ${minDistance !== null ? `${minDistance.toFixed(1)}m` : 'within zone'}). Caution is advised during ground disturbance.`;
  } else if (normClass === 'LOW') {
    explanation = `Low risk assessed: Based on confirmed mapped dataset records and site parameters, no immediate high-probability utility conflict was indicated for this depth (${numDepth}m). Subsurface vigilance remains necessary.`;
  } else {
    explanation = 'Excavation risk evaluation complete. Review site factors and maintain standard utility protection protocols.';
  }

  // 2. Verified contributing factors based strictly on actual available data
  const contributingFactors = [];
  if (minDistance !== null) {
    contributingFactors.push(`Proximity: Closest confirmed utility line is ${minDistance.toFixed(1)} meters from the excavation point.`);
  }
  if (utilityCount > 0) {
    contributingFactors.push(`Utility Density: ${utilityCount} mapped asset segment${utilityCount > 1 ? 's' : ''} detected (${utilityTypes.join(', ') || 'utility lines'}).`);
  }
  if (numDepth > 0) {
    contributingFactors.push(`Excavation Depth: Planned excavation depth is ${numDepth} meters.`);
  }
  if (sensors && typeof sensors === 'object') {
    if (Number.isFinite(sensors.vibration)) {
      contributingFactors.push(`Sensor Vibration: Surface vibration level recorded at ${sensors.vibration} (software simulated).`);
    }
    if (Number.isFinite(sensors.soilMoisture) || Number.isFinite(sensors.soilCondition)) {
      contributingFactors.push(`Soil Moisture: Recorded at ${sensors.soilMoisture ?? sensors.soilCondition} (software simulated).`);
    }
    if (Number.isFinite(sensors.groundMovement)) {
      contributingFactors.push(`Ground Movement: Recorded at ${sensors.groundMovement} mm (software simulated).`);
    }
  }

  // 3. Relevant excavation safety recommendations appropriate to category
  const recommendations = [];
  if (normClass === 'HIGH') {
    recommendations.push('Decision Support: High risk flag indicates that mechanical excavation without physical verification poses significant risk of utility strike.');
    recommendations.push('Precautionary Protocol: Conduct non-destructive physical exposure (hand digging or potholing) to verify exact pipe depth and alignment before deploying heavy machinery.');
    recommendations.push('Agency Coordination: Verify alignments with local utility authorities (e.g., BWSSB / BESCOM) prior to commencing excavation.');
  } else if (normClass === 'MEDIUM') {
    recommendations.push('Decision Support: Exercise controlled excavation procedures when operating within the designated search radius.');
    recommendations.push('Precautionary Protocol: Mark verified utility corridors on ground surface and monitor trench walls continuously for unmapped conduits.');
    recommendations.push('Agency Coordination: Have utility emergency contact numbers on-site before breaking ground.');
  } else {
    recommendations.push('Decision Support: Maintain standard excavation vigilance; dataset completeness is not guaranteed to represent all buried assets.');
    recommendations.push('Precautionary Protocol: Stop work immediately if unexpected tiles, marker tape, pea gravel bedding, or pipe encasements are encountered.');
  }

  return {
    categoryLabel: normClass === 'HIGH' ? 'HIGH RISK' : normClass === 'MEDIUM' ? 'MEDIUM RISK' : normClass === 'LOW' ? 'LOW RISK' : `${normClass} RISK`,
    riskClass: normClass.toLowerCase(),
    explanation,
    contributingFactors,
    recommendations,
    minDistance,
    utilityCount,
    utilityTypes,
  };
}

// Map Event Handler to place marker on click
function LocationMarker({ position, setPosition, setLocationName }) {
  useMapEvents({
    click(e) {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        setPosition({ lat, lng });
        setLocationName(`Custom Site (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
      }
    },
  });

  return position === null ? null : (
    <Marker position={position}>
      <Popup>
        <strong>Selected Excavation Point</strong><br />
        Lat: {position.lat.toFixed(5)}<br />
        Lng: {position.lng.toFixed(5)}
      </Popup>
    </Marker>
  );
}

// Controller to smoothly pan/zoom map when coordinates change
function MapCenterController({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center && Array.isArray(center) && center.length === 2) {
      map.setView(center, zoom || 15);
    }
  }, [center, zoom, map]);
  return null;
}

// Verified Bengaluru Demonstration Locations with high-density utility networks
const BENGALURU_PRESETS = [
  { name: 'Cubbon Park (Water & Sewer Main)', lat: 12.9763, lng: 77.5929, depth: 2.5, radius: 500 },
  { name: 'MG Road Metro Corridor', lat: 12.9756, lng: 77.6066, depth: 3.0, radius: 400 },
  { name: 'Koramangala 80ft Road', lat: 12.9352, lng: 77.6245, depth: 2.0, radius: 350 },
  { name: 'Indiranagar 100ft Road', lat: 12.9784, lng: 77.6408, depth: 2.2, radius: 450 },
  { name: 'Whitefield Main Road', lat: 12.9698, lng: 77.7499, depth: 1.8, radius: 500 },
];

function MapAnalysis() {
  const navigate = useNavigate();

  // Workflow Step: 1 = Location, 2 = Utilities, 3 = Site Image, 4 = Sensor Monitoring, 5 = Risk Assessment
  const [step, setStep] = useState(1);

  // Form Inputs
  const [locationName, setLocationName] = useState('Cubbon Park Site');
  const [depth, setDepth] = useState('2.5');
  const [radius, setRadius] = useState('500');

  // Search & Map State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchDebounceRef = React.useRef(null);
  const searchInputRef = React.useRef(null);
  const [manualLat, setManualLat] = useState('12.97630');
  const [manualLng, setManualLng] = useState('77.59290');

  // Map Position: Default to Cubbon Park, Bengaluru
  const [position, setPosition] = useState({ lat: 12.9763, lng: 77.5929 });
  const [mapCenter, setMapCenter] = useState([12.9763, 77.5929]);
  const [mapZoom, setMapZoom] = useState(15);

  // Site Image
  const [imagePreview, setImagePreview] = useState(null);
  const [imageError, setImageError] = useState('');
  const [imageLoading, setImageLoading] = useState(false);
  const [imageInference, setImageInference] = useState(null);
  const [modelStatus, setModelStatus] = useState(null);
  const [modelStatusError, setModelStatusError] = useState('');
  
  // Sensor Telemetry
  const [sensors, setSensors] = useState(null);
  const [sensorLoading, setSensorLoading] = useState(false);
  const [sensorError, setSensorError] = useState('');

  // Analysis & Results
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [analysisInfo, setAnalysisInfo] = useState('');
  const [riskPrediction, setRiskPrediction] = useState(null);

  // Utilities layer toggles and records
  const [layers, setLayers] = useState({
    bescom: true,
    water: true,
    sewerage: true,
    manhole: true
  });
  
  const [nearbyUtilities, setNearbyUtilities] = useState([]);
  const [utilitiesLoading, setUtilitiesLoading] = useState(false);
  const [utilitiesError, setUtilitiesError] = useState('');
  const [utilityLookupStatus, setUtilityLookupStatus] = useState('');
  const [utilityLookupMessage, setUtilityLookupMessage] = useState('');
  const [utilityLookupLimitation, setUtilityLookupLimitation] = useState('');
  const [utilityResultsTruncated, setUtilityResultsTruncated] = useState(false);

  // Pagination for utility records
  const [waterPageLimit, setWaterPageLimit] = useState(6);
  const [sewerPageLimit, setSewerPageLimit] = useState(6);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  useEffect(() => {
    API.get('/models/status')
      .then((res) => setModelStatus(res.data))
      .catch(() => setModelStatusError('System diagnostics could not be retrieved.'));
  }, []);

  // Fetch utilities when the selected point or search radius changes
  useEffect(() => {
    const controller = new AbortController();
    const parsedRadius = parseInputNumber(radius);
    const validPosition = position
      && Number.isFinite(position.lat) && position.lat >= -90 && position.lat <= 90
      && Number.isFinite(position.lng) && position.lng >= -180 && position.lng <= 180;

    const fetchUtilities = async () => {
      setNearbyUtilities([]);
      setUtilityLookupStatus('');
      setUtilityLookupMessage('');
      setUtilityLookupLimitation('');
      setUtilityResultsTruncated(false);
      setUtilitiesError('');

      if (!position) return;
      if (!validPosition) {
        setUtilitiesError('Selected map coordinates are invalid. Choose a valid point on the map.');
        setUtilitiesLoading(false);
        return;
      }
      if (parsedRadius === null || parsedRadius <= 0 || parsedRadius > 50000) {
        setUtilitiesError('Enter a search radius greater than 0 and no more than 50000 meters.');
        setUtilitiesLoading(false);
        return;
      }

      setUtilitiesLoading(true);
      try {
        const res = await API.get('/utilities/proximity', {
          params: { lat: position.lat, lng: position.lng, radius: parsedRadius },
          signal: controller.signal,
        });
        setNearbyUtilities(Array.isArray(res.data.utilities) ? res.data.utilities : []);
        setUtilityLookupStatus(res.data.status || 'LOOKUP_UNAVAILABLE');
        setUtilityLookupMessage(res.data.message || 'Utility lookup returned no status message.');
        setUtilityLookupLimitation(res.data.limitation || '');
        setUtilityResultsTruncated(Boolean(res.data.truncated));
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Error fetching utilities', error);
        setUtilitiesError(
          error.response?.data?.message || 'Utility information could not be loaded for this location.',
        );
      } finally {
        if (!controller.signal.aborted) setUtilitiesLoading(false);
      }
    };

    fetchUtilities();
    return () => controller.abort();
  }, [position, radius]);

  // Synchronize manual coordinate inputs when position updates
  useEffect(() => {
    if (position && Number.isFinite(position.lat) && Number.isFinite(position.lng)) {
      setManualLat(position.lat.toFixed(5));
      setManualLng(position.lng.toFixed(5));
    }
  }, [position]);

  // Fuzzy search helper that handles spelling mistakes and typeahead suggestions
  const fetchLocationSuggestions = async (rawQuery) => {
    const trimmed = (rawQuery || '').trim();
    if (!trimmed || trimmed.length < 2) {
      setSearchResults([]);
      setIsDropdownOpen(false);
      setSearchError('');
      return;
    }

    setSearchLoading(true);
    setSearchError('');
    try {
      // 1. First query Photon (Komoot/OSM) with Bengaluru coordinate bias for typo tolerance & autocomplete
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&lat=12.9716&lon=77.5946&limit=6`;
      const photonResp = await fetch(photonUrl);
      const photonData = await photonResp.json();

      let formattedResults = [];

      if (photonData?.features && photonData.features.length > 0) {
        formattedResults = photonData.features.map((feat) => {
          const p = feat.properties;
          const coords = feat.geometry?.coordinates || [];
          const lon = coords[0];
          const lat = coords[1];
          const mainTitle = p.name || p.street || p.district || 'Location';
          const subtitleParts = [p.district, p.city, p.state, p.country].filter(Boolean);
          const fullLabel = [mainTitle, ...subtitleParts].join(', ');

          return {
            lat,
            lon,
            title: mainTitle,
            display_name: fullLabel,
            type: p.type || 'place'
          };
        }).filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lon));
      }

      // 2. Fallback to Nominatim if Photon returns nothing
      if (formattedResults.length === 0) {
        const nomQuery = encodeURIComponent(
          trimmed.toLowerCase().includes('bengaluru') || trimmed.toLowerCase().includes('bangalore')
            ? trimmed
            : `${trimmed}, Bengaluru, Karnataka, India`
        );
        const nomResp = await fetch(`https://nominatim.openstreetmap.org/search?q=${nomQuery}&format=json&limit=5`, {
          headers: { 'Accept-Language': 'en' }
        });
        const nomData = await nomResp.json();
        if (Array.isArray(nomData) && nomData.length > 0) {
          formattedResults = nomData.map((res) => ({
            lat: parseFloat(res.lat),
            lon: parseFloat(res.lon),
            title: res.display_name.split(',')[0],
            display_name: res.display_name
          }));
        }
      }

      if (formattedResults.length > 0) {
        setSearchResults(formattedResults);
        setIsDropdownOpen(true);
      } else {
        setSearchResults([]);
        setIsDropdownOpen(false);
        setSearchError('No matching locations found. You can adjust the spelling or click directly anywhere on the map.');
      }
    } catch (err) {
      console.warn('Geocoding suggestion error:', err);
      // Graceful fallback: do not crash or block typing
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearchInputChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (!val || val.trim().length < 2) {
      setSearchResults([]);
      setIsDropdownOpen(false);
      setSearchError('');
      return;
    }

    // Debounce 280ms while user is typing
    searchDebounceRef.current = setTimeout(() => {
      fetchLocationSuggestions(val);
    }, 280);
  };

  const handleSearchLocation = async (e) => {
    if (e) e.preventDefault();
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    await fetchLocationSuggestions(searchQuery);
  };

  const handleSelectSearchResult = (result) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const newPos = { lat, lng };
      setPosition(newPos);
      setMapCenter([lat, lng]);
      setMapZoom(15);
      setLocationName(result.title || result.display_name.split(',')[0]);
      setSearchResults([]);
      setIsDropdownOpen(false);
      setSearchQuery(result.title || result.display_name.split(',')[0]);
      setSearchError('');
    }
  };

  const handleSelectPreset = (preset) => {
    setPosition({ lat: preset.lat, lng: preset.lng });
    setMapCenter([preset.lat, preset.lng]);
    setMapZoom(15);
    setLocationName(preset.name);
    setDepth(preset.depth);
    setRadius(preset.radius);
    setSearchResults([]);
  };

  const handleApplyManualCoords = (e) => {
    if (e) e.preventDefault();
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setAnalysisError('Latitude must be a valid number between -90 and 90.');
      return;
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      setAnalysisError('Longitude must be a valid number between -180 and 180.');
      return;
    }
    setAnalysisError('');
    setPosition({ lat, lng });
    setMapCenter([lat, lng]);
    setMapZoom(15);
    setLocationName(`Coordinates (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    setImageError('');
    setImageInference(null);
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setImageError('Choose a JPEG, PNG, or WebP image.');
      setImagePreview(null);
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError('Image must be 5 MB or smaller.');
      setImagePreview(null);
      e.target.value = '';
      return;
    }
    setImagePreview(URL.createObjectURL(file));
    setImageLoading(true);
    const formData = new FormData();
    formData.append('image', file);
    try {
      const response = await API.post('/models/image-inference', formData);
      setImageInference(response.data);
    } catch (error) {
      setImageInference(error.response?.data || {
        status: 'INFERENCE_UNAVAILABLE',
        detections: null,
        message: 'Image inspection is currently unavailable in this environment.',
      });
    } finally {
      setImageLoading(false);
    }
  };

  const handleGenerateSensor = async () => {
    setSensorLoading(true);
    setSensorError('');
    try {
      const res = await API.post('/simulation/simulate');
      setSensors(res.data.data);
    } catch (error) {
      console.error("Error generating sensors", error);
      setSensorError('Sensor simulation failed. Please try again.');
    } finally {
      setSensorLoading(false);
    }
  };

  const validateInputs = () => {
    if (!position) return 'Select an excavation location on the map.';
    if (
      !Number.isFinite(position.lat) || position.lat < -90 || position.lat > 90
      || !Number.isFinite(position.lng) || position.lng < -180 || position.lng > 180
    ) {
      return 'Selected map coordinates are invalid. Choose a valid point on the map.';
    }
    if (typeof locationName !== 'string' || locationName.trim().length < 2) {
      return 'Enter a location name with at least 2 characters.';
    }

    const parsedDepth = parseInputNumber(depth);
    const parsedRadius = parseInputNumber(radius);
    if (parsedDepth === null || parsedDepth <= 0) {
      return 'Enter an excavation depth that is a valid number greater than 0 meters.';
    }
    if (parsedRadius === null || parsedRadius <= 0 || parsedRadius > 50000) {
      return 'Enter an excavation radius greater than 0 and no more than 50000 meters.';
    }

    return '';
  };

  const continueToUtilities = () => {
    const validationError = validateInputs();
    if (validationError) {
      setAnalysisError(validationError);
      return;
    }
    setAnalysisError('');
    setStep(2);
  };

  const runRiskAnalysis = async () => {
    const validationError = validateInputs();
    if (validationError) {
      setAnalysisError(validationError);
      return;
    }
    setAnalyzing(true);
    setAnalysisError('');
    setAnalysisInfo('');
    setRiskPrediction(null);
    try {
      const payload = {
        location: locationName.trim(),
        latitude: position.lat,
        longitude: position.lng,
        depth: parseInputNumber(depth),
        radius: parseInputNumber(radius),
        utilities: nearbyUtilities,
        utilityDataStatus: utilityLookupStatus,
        sensors: sensors,
        imageInspection: imageInference || null,
      };
      
      const res = await API.post('/risk/analyze', payload);
      const returnedReportId = res.data?.reportId || res.data?._id || res.data?.report?._id;
      if (returnedReportId) {
        navigate(`/risk-result/${returnedReportId}`);
        return;
      } else if (res.data?.status === 'PREDICTION_AVAILABLE' && res.data.riskPrediction) {
        setRiskPrediction(res.data.riskPrediction);
        setAnalysisInfo('Analysis successfully completed.');
      } else {
        setAnalysisInfo(res.data?.message || 'Analysis complete.');
      }
    } catch (error) {
      console.error("Error analyzing risk", error);
      const status = error.response?.data?.status;
      const message = error.response?.data?.message;
      if (status === 'MODEL_NOT_CONFIGURED' || status === 'INFERENCE_UNAVAILABLE') {
        setAnalysisError(message || 'Excavation-risk evaluation is temporarily unavailable.');
      } else {
        setAnalysisError(message || 'Analysis failed. Please try again.');
      }
    } finally {
      setAnalyzing(false);
    }
  };

  // Helper to format clean readable utility name
  const formatUtilityTitle = (utility) => {
    const type = (utility.utilityType || '').toLowerCase();
    if (type.includes('water')) return 'BWSSB Water Main Corridor';
    if (type.includes('sewer')) return 'BWSSB Sewerage Trunk Line';
    if (type.includes('elect')) return 'BESCOM Electrical Cable';
    return utility.name || utility.source || 'Underground Utility Pipeline';
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '40px' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.6rem', color: 'var(--primary-dark)', fontWeight: 700, margin: '0 0 6px 0' }}>
          Excavation Safety & Utility Risk Assessment
        </h2>
        <p className="text-muted" style={{ margin: 0, fontSize: '0.9rem' }}>
          Evaluate underground utility proximity, environmental sensor parameters, and subsurface excavation risk for Bengaluru civil works.
        </p>
      </div>

      {/* 5-Step Workflow Stepper */}
      <nav className="stepper-nav" aria-label="Assessment Progress Steps">
        <button className={`step-tab ${step === 1 ? 'active' : ''}`} onClick={() => setStep(1)}>
          <span className="step-number">1</span> Location
        </button>
        <button className={`step-tab ${step === 2 ? 'active' : ''}`} onClick={() => setStep(2)} disabled={!position}>
          <span className="step-number">2</span> Underground Utilities
        </button>
        <button className={`step-tab ${step === 3 ? 'active' : ''}`} onClick={() => setStep(3)} disabled={!position}>
          <span className="step-number">3</span> Site Image
        </button>
        <button className={`step-tab ${step === 4 ? 'active' : ''}`} onClick={() => setStep(4)} disabled={!position}>
          <span className="step-number">4</span> Sensor Monitoring
        </button>
        <button className={`step-tab ${step === 5 ? 'active' : ''}`} onClick={() => setStep(5)} disabled={!position || !sensors}>
          <span className="step-number">5</span> Risk Assessment
        </button>
      </nav>

      {/* Global Alerts */}
      {analysisError && (
        <div className="workflow-message error-message" role="alert" style={{ marginBottom: '16px' }}>
          {analysisError}
        </div>
      )}

      {analysisInfo && (
        <div className="workflow-message" role="status" style={{ marginBottom: '16px' }}>
          {analysisInfo}
        </div>
      )}

      {/* STEP 1: EXCAVATION LOCATION */}
      {step === 1 && (
        <div className="panel" style={{ background: '#ffffff', borderRadius: '10px', padding: '24px' }}>
          <h3 style={{ fontSize: '1.15rem', color: 'var(--primary-dark)', marginBottom: '8px' }}>
            Step 1: Select Excavation Location & Parameters
          </h3>
          <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '18px' }}>
            Click anywhere on the map, search a Bengaluru landmark, or choose a verified demonstration location below.
          </p>

          {/* Search bar and Presets */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '6px', display: 'block' }}>
              Search Area or Address
            </label>
            <form onSubmit={handleSearchLocation} className="map-search-bar" style={{ display: 'flex', gap: '8px', position: 'relative' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input
                  ref={searchInputRef}
                  type="text"
                  className="form-control"
                  placeholder="Type any location or landmark (e.g. Alliance University, Koramangala, Whitefield...)"
                  value={searchQuery}
                  onChange={handleSearchInputChange}
                  onFocus={() => { if (searchResults.length > 0) setIsDropdownOpen(true); }}
                  style={{ width: '100%' }}
                />
                {searchLoading && (
                  <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#10B981', fontWeight: 600 }}>
                    Searching...
                  </span>
                )}
              </div>
              <button type="submit" className="btn-primary" disabled={searchLoading} style={{ marginTop: 0, padding: '0.6rem 1.2rem' }}>
                Search
              </button>
              {isDropdownOpen && searchResults.length > 0 && (
                <div className="search-results-dropdown" style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
                  background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px',
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)', marginTop: '4px',
                  maxHeight: '260px', overflowY: 'auto'
                }}>
                  {searchResults.map((res, idx) => (
                    <div
                      key={`sr-${idx}`}
                      className="search-result-item"
                      style={{
                        padding: '10px 14px',
                        borderBottom: idx < searchResults.length - 1 ? '1px solid #f1f5f9' : 'none',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                      onClick={() => handleSelectSearchResult(res)}
                    >
                      <span style={{ fontSize: '1rem', marginTop: '1px' }}>📍</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>{res.title}</div>
                        <div className="text-muted" style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '2px', lineHeight: 1.3 }}>{res.display_name}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </form>
            {searchError && <div className="text-muted" style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '6px' }}>{searchError}</div>}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginRight: '8px' }}>
              Quick-Select Infrastructure Corridors:
            </span>
            <div className="preset-chip-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
              {BENGALURU_PRESETS.map((preset, idx) => (
                <button
                  key={`preset-${idx}`}
                  type="button"
                  className={`preset-chip ${locationName === preset.name ? 'active' : ''}`}
                  onClick={() => handleSelectPreset(preset)}
                  style={{
                    background: locationName === preset.name ? 'var(--accent-soft)' : '#f1f5f9',
                    color: locationName === preset.name ? 'var(--primary-dark)' : '#334155',
                    border: locationName === preset.name ? '1px solid var(--accent-light)' : '1px solid #e2e8f0',
                    padding: '6px 12px',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    fontWeight: locationName === preset.name ? 600 : 500,
                    cursor: 'pointer'
                  }}
                >
                  📍 {preset.name}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group-row" style={{ display: 'flex', gap: '15px', marginBottom: '15px', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 2, minWidth: '220px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Excavation Site Label</label>
              <input type="text" className="form-control" value={locationName} onChange={e => setLocationName(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: '130px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Planned Depth (m)</label>
              <input type="number" min="0.01" step="any" className="form-control" value={depth} onChange={e => setDepth(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: '130px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Search Radius (m)</label>
              <input type="number" min="0.01" max="50000" step="any" className="form-control" value={radius} onChange={e => setRadius(e.target.value)} />
            </div>
          </div>

          {/* Coordinate Bar */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px' }}>
            <form onSubmit={handleApplyManualCoords} style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>Manual Coordinates:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Lat:</span>
                <input
                  type="text"
                  className="form-control"
                  style={{ width: '110px', padding: '4px 8px', fontSize: '0.85rem' }}
                  value={manualLat}
                  onChange={e => setManualLat(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Lng:</span>
                <input
                  type="text"
                  className="form-control"
                  style={{ width: '110px', padding: '4px 8px', fontSize: '0.85rem' }}
                  value={manualLng}
                  onChange={e => setManualLng(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-secondary" style={{ marginTop: 0, padding: '4px 12px', fontSize: '0.8rem' }}>
                Go to Coords
              </button>
            </form>
          </div>

          {/* Interactive Map */}
          <div className="map-container" style={{ position: 'relative', height: '420px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
            <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
              <MapCenterController center={mapCenter} zoom={mapZoom} />
              <LocationMarker position={position} setPosition={setPosition} setLocationName={setLocationName} />
              
              {nearbyUtilities.flatMap((u, i) => {
                let show = false;
                let color = '#0284c7'; // Blue for Water
                if (u.utilityType === 'water' && layers.water) { show = true; color = '#0284c7'; } // Distinct Blue
                if (u.utilityType === 'sewerage' && layers.sewerage) { show = true; color = '#EAB308'; } // Distinct Yellow / Amber
                if ((u.utilityType === 'power' || u.utilityType === 'electrical') && layers.bescom) { show = true; color = '#10B981'; } // Distinct Green

                if (!show) return [];

                if (u.geometry?.type === 'LineString' || u.geometry?.type === 'MultiLineString') {
                  const lines = u.geometry.type === 'LineString'
                    ? [u.geometry.coordinates]
                    : u.geometry.coordinates;
                  return lines.map((line, lineIndex) => (
                    <Polyline
                      key={`${u._id || i}-line-${lineIndex}`}
                      positions={line.map(([longitude, latitude]) => [latitude, longitude])}
                      pathOptions={{ color, weight: 3 }}
                    >
                      <Popup>
                        <strong>{u.source || 'BWSSB'} {u.utilityType}</strong><br />
                        Distance: {u.distance}m away
                      </Popup>
                    </Polyline>
                  ));
                }
                const coordinates = u.geometry?.type === 'Point'
                  ? [u.geometry.coordinates[1], u.geometry.coordinates[0]]
                  : [u.latitude, u.longitude];
                if (!coordinates.every(Number.isFinite)) return [];
                return [(
                  <Circle key={u._id || i} center={coordinates} radius={5} pathOptions={{ color, fillColor: color, fillOpacity: 1 }}>
                    <Popup>{u.source} - {u.utilityType} ({u.distance}m away)</Popup>
                  </Circle>
                )];
              })}

              {position && <Circle center={position} radius={parseInputNumber(radius) || 0} pathOptions={{ color: '#d97706', fillOpacity: 0.15, weight: 2 }} />}
            </MapContainer>
          </div>

          <div aria-label="Map legend" style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginTop: '12px', fontSize: '0.85rem' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <i aria-hidden="true" style={{ width: '20px', borderTop: '3px solid #0284c7' }} /> Blue: Water Pipeline (BWSSB)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <i aria-hidden="true" style={{ width: '20px', borderTop: '3px solid #EAB308' }} /> Yellow: Sewer Trunk Line (BWSSB)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <i aria-hidden="true" style={{ width: '20px', borderTop: '3px solid #10B981' }} /> Green: Power & Utility Conduits
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <i aria-hidden="true" style={{ width: '20px', borderTop: '2px dashed #d97706' }} /> Search Zone ({radius}m)
            </span>
          </div>

          {position && (
            <div className="selection-summary" style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '6px', marginTop: '12px', display: 'flex', gap: '20px', fontSize: '0.85rem' }}>
              <div><strong>Selected Coordinates:</strong> {position.lat.toFixed(5)}, {position.lng.toFixed(5)}</div>
              <div><strong>Status:</strong> {utilitiesLoading ? 'Scanning GIS database...' : `${nearbyUtilities.length} utility assets detected within ${radius}m`}</div>
            </div>
          )}
          
          <div style={{ marginTop: '20px' }}>
            <button className="btn-primary" onClick={continueToUtilities} disabled={!position}>
              CONTINUE TO UNDERGROUND UTILITIES →
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: UNDERGROUND UTILITIES */}
      {step === 2 && (
        <div className="panel" style={{ background: '#ffffff', borderRadius: '10px', padding: '24px' }}>
          <h3 style={{ fontSize: '1.15rem', color: 'var(--primary-dark)', marginBottom: '8px' }}>
            Step 2: Mapped Underground Utility Analysis
          </h3>

          {/* Dataset Coverage Notice Card */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px 18px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>
              ℹ️ Municipal GIS Dataset Notice
            </div>
            <p className="text-muted" style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.5 }}>
              Records are retrieved from official Bangalore Water Supply and Sewerage Board (BWSSB) spatial asset datasets. 
              Distance is measured to the closest segment boundary. Mapped assets are advisory; lack of recorded data does not certify absence of buried utilities.
            </p>
          </div>

          {/* Utility Status Feedback */}
          {utilitiesLoading && (
            <p className="text-muted" role="status">Searching mapped utility assets within {radius}m radius...</p>
          )}

          {!utilitiesLoading && utilityLookupStatus === 'NO_MATCHES_IN_AVAILABLE_DATA' && (
            <div className="workflow-message" role="status" style={{ background: '#fffbeb', borderLeft: '4px solid #f59e0b', color: '#92400e', marginBottom: '16px' }}>
              <strong>Caution: No matching utility records in the available mapped dataset.</strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem' }}>
                This indicates the absence of registered lines in this GIS file, not that the site is free of underground hazards. Cautious excavation protocols apply.
              </p>
            </div>
          )}

          {!utilitiesLoading && utilityLookupStatus === 'MATCHES_FOUND' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b' }}>
                Detected {nearbyUtilities.length} Utility Segments in Search Radius
              </span>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                Nearest pipeline: {nearbyUtilities.length > 0 ? `${nearbyUtilities[0].distance}m away` : 'N/A'}
              </span>
            </div>
          )}

          {/* Utility Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {/* Water Lines Section */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span className="utility-type-badge utility-water">
                  💧 BWSSB Water Pipelines ({nearbyUtilities.filter(u => u.utilityType === 'water').length})
                </span>
                <label style={{ fontSize: '0.8rem', color: '#64748b', cursor: 'pointer' }}>
                  <input type="checkbox" checked={layers.water} onChange={e => setLayers({ ...layers, water: e.target.checked })} /> Show on map
                </label>
              </div>

              {nearbyUtilities.filter(u => u.utilityType === 'water').length === 0 ? (
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.85rem' }}>
                  No mapped water pipelines within {radius}m.
                </div>
              ) : (
                nearbyUtilities
                  .filter(u => u.utilityType === 'water')
                  .slice(0, waterPageLimit)
                  .map((utility, idx) => (
                    <div key={`water-${idx}`} className="utility-item-card" style={{ height: '115px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <strong style={{ fontSize: '0.9rem', color: '#0f172a', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatUtilityTitle(utility)}</strong>
                          <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: '2px' }}>
                            Source: BWSSB Utility Records
                          </div>
                        </div>
                        <span className="badge" style={{ background: '#e0f2fe', color: '#0369a1', fontWeight: 700, flexShrink: 0, padding: '3px 8px', fontSize: '0.72rem' }}>
                          {utility.distance}m away
                        </span>
                      </div>

                      {/* Clean Technical Attributes */}
                      <div style={{ marginTop: 'auto', paddingTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '0.78rem', alignItems: 'center' }}>
                        {utility.recordedDiameter ? (
                          <span style={{ color: '#047857', fontWeight: 600, background: '#f0fdf4', padding: '2px 8px', borderRadius: '4px' }}>
                            📏 Diameter: {utility.recordedDiameter} mm
                          </span>
                        ) : utility.estimatedDiameter ? (
                          <span style={{ color: '#0369a1', background: '#f0f9ff', padding: '2px 8px', borderRadius: '4px', border: '1px solid #bae6fd' }}>
                            ⚡ Estimated Diameter: <strong>{utility.estimatedDiameter} mm</strong>
                          </span>
                        ) : null}

                        {utility.depthMeters && (
                          <span style={{ color: '#475569', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>
                            Depth: {utility.depthMeters}m
                          </span>
                        )}
                      </div>
                    </div>
                  ))
              )}

              {nearbyUtilities.filter(u => u.utilityType === 'water').length > waterPageLimit && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setWaterPageLimit(prev => prev + 10)}
                  style={{ width: '100%', marginTop: '6px', fontSize: '0.8rem', padding: '6px 12px' }}
                >
                  Show More Water Records ({nearbyUtilities.filter(u => u.utilityType === 'water').length - waterPageLimit} remaining)
                </button>
              )}
            </div>

            {/* Sewer Lines Section */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span className="utility-type-badge utility-sewer">
                  🪨 BWSSB Sewer Lines ({nearbyUtilities.filter(u => u.utilityType === 'sewerage').length})
                </span>
                <label style={{ fontSize: '0.8rem', color: '#64748b', cursor: 'pointer' }}>
                  <input type="checkbox" checked={layers.sewerage} onChange={e => setLayers({ ...layers, sewerage: e.target.checked })} /> Show on map
                </label>
              </div>

              {nearbyUtilities.filter(u => u.utilityType === 'sewerage').length === 0 ? (
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.85rem' }}>
                  No mapped sewer lines within {radius}m.
                </div>
              ) : (
                nearbyUtilities
                  .filter(u => u.utilityType === 'sewerage')
                  .slice(0, sewerPageLimit)
                  .map((utility, idx) => (
                    <div key={`sewer-${idx}`} className="utility-item-card" style={{ height: '115px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <strong style={{ fontSize: '0.9rem', color: '#0f172a', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatUtilityTitle(utility)}</strong>
                          <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: '2px' }}>
                            Source: BWSSB Utility Records
                          </div>
                        </div>
                        <span className="badge" style={{ background: '#fef3c7', color: '#92400e', fontWeight: 700, flexShrink: 0, padding: '3px 8px', fontSize: '0.72rem' }}>
                          {utility.distance}m away
                        </span>
                      </div>

                      {/* Clean Technical Attributes */}
                      <div style={{ marginTop: 'auto', paddingTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '0.78rem', alignItems: 'center' }}>
                        {utility.recordedDiameter ? (
                          <span style={{ color: '#047857', fontWeight: 600, background: '#f0fdf4', padding: '2px 8px', borderRadius: '4px' }}>
                            📏 Diameter: {utility.recordedDiameter} mm
                          </span>
                        ) : utility.estimatedDiameter ? (
                          <span style={{ color: '#0369a1', background: '#f0f9ff', padding: '2px 8px', borderRadius: '4px', border: '1px solid #bae6fd' }}>
                            ⚡ Estimated Diameter: <strong>{utility.estimatedDiameter} mm</strong>
                          </span>
                        ) : null}

                        {utility.depthMeters && (
                          <span style={{ color: '#475569', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>
                            Depth: {utility.depthMeters}m
                          </span>
                        )}
                      </div>
                    </div>
                  ))
              )}

              {nearbyUtilities.filter(u => u.utilityType === 'sewerage').length > sewerPageLimit && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setSewerPageLimit(prev => prev + 10)}
                  style={{ width: '100%', marginTop: '6px', fontSize: '0.8rem', padding: '6px 12px' }}
                >
                  Show More Sewer Records ({nearbyUtilities.filter(u => u.utilityType === 'sewerage').length - sewerPageLimit} remaining)
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
            <button className="btn-secondary" onClick={() => setStep(1)}>← BACK TO LOCATION</button>
            <button className="btn-primary" onClick={() => setStep(3)}>CONTINUE TO SITE IMAGE →</button>
          </div>
        </div>
      )}

      {/* STEP 3: SITE IMAGE INSPECTION */}
      {step === 3 && (
        <div className="panel" style={{ background: '#ffffff', borderRadius: '10px', padding: '24px' }}>
          <h3 style={{ fontSize: '1.15rem', color: 'var(--primary-dark)', marginBottom: '8px' }}>
            Step 3: Optional Site Image Inspection
          </h3>
          <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '18px' }}>
            Upload a surface photo of the excavation trench, pothole, or pavement. This visual inspection helps identify exposed pipes or surface markers.
          </p>

          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                Upload Excavation Site Image (JPEG, PNG, WebP; max 5 MB)
              </label>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageUpload} className="form-control" />
            </div>
          </div>

          {imageError && <div className="workflow-message error-message" role="alert">{imageError}</div>}

          {imagePreview && (
            <div className="detection-visualizer-card" style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', background: '#ffffff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <strong style={{ fontSize: '0.95rem', color: 'var(--primary-dark)' }}>Visual Inspection Analysis</strong>
                <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                  {imageLoading ? 'Scanning image features...' : (imageInference ? 'Visual analysis ready' : 'Image uploaded')}
                </span>
              </div>

              <div className="detection-image-wrapper" style={{ position: 'relative', borderRadius: '6px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                <img src={imagePreview} alt="Excavation site inspection preview" style={{ display: 'block', width: '100%', maxHeight: '420px', objectFit: 'contain' }} />

                {/* SVG Bounding Box Overlay */}
                {imageInference?.imageSize?.width > 0 && imageInference?.imageSize?.height > 0 && Array.isArray(imageInference?.detections) && (
                  <svg
                    className="detection-svg-overlay"
                    viewBox={`0 0 ${imageInference.imageSize.width} ${imageInference.imageSize.height}`}
                    preserveAspectRatio="xMidYMid meet"
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                  >
                    {imageInference.detections.map((detection, index) => {
                      const box = detection.boundingBox;
                      if (!box || !Number.isFinite(box.x) || !Number.isFinite(box.y) || !Number.isFinite(box.width) || !Number.isFinite(box.height)) {
                        return null;
                      }

                      const imgW = imageInference.imageSize.width;
                      const imgH = imageInference.imageSize.height;
                      const x = Math.max(0, Math.min(imgW, box.x));
                      const y = Math.max(0, Math.min(imgH, box.y));
                      const width = Math.max(0, Math.min(imgW - x, box.width));
                      const height = Math.max(0, Math.min(imgH - y, box.height));
                      if (width <= 0 || height <= 0) return null;

                      const detClass = (detection.class || detection.label || 'pipe').toLowerCase();
                      const isPipe = detClass.includes('pipe') || detClass.includes('water') || detClass.includes('conduit');
                      const boxClass = isPipe ? 'detection-box-pipe' : 'detection-box-object';
                      const labelBgClass = isPipe ? 'detection-label-bg-pipe' : 'detection-label-bg-object';
                      const labelText = `${detClass.toUpperCase()} ${(detection.confidence * 100).toFixed(0)}%`;
                      const fontScale = Math.max(14, Math.round(imgW * 0.016));
                      const charWidth = fontScale * 0.62;
                      const badgeWidth = Math.round(labelText.length * charWidth + 16);
                      const badgeHeight = Math.round(fontScale * 1.6);
                      const badgeY = y >= badgeHeight ? y - badgeHeight : y;
                      const badgeX = x + badgeWidth > imgW ? Math.max(0, imgW - badgeWidth) : x;

                      return (
                        <g key={`det-${index}`}>
                          <rect x={x} y={y} width={width} height={height} className={boxClass} />
                          <rect x={badgeX} y={badgeY} width={badgeWidth} height={badgeHeight} rx={badgeHeight * 0.25} className={labelBgClass} />
                          <text x={badgeX + 8} y={badgeY + badgeHeight * 0.72} fontSize={fontScale} className="detection-label-text">
                            {labelText}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                )}
              </div>

              {/* Status and Summary Badges */}
              <div className="detection-summary-bar" style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="detection-badge-group" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {imageInference?.status === 'DETECTIONS_AVAILABLE' && imageInference.detectionCount > 0 ? (
                    imageInference.detections.map((d, i) => {
                      const dClass = (d.class || d.label || 'pipe').toLowerCase();
                      const isPipePill = dClass.includes('pipe') || dClass.includes('water');
                      return (
                        <span key={`pill-${i}`} className={`detection-pill ${isPipePill ? 'detection-pill-pipe' : 'detection-pill-object'}`}>
                          ● Detected {dClass.toUpperCase()} ({(d.confidence * 100).toFixed(1)}% match)
                        </span>
                      );
                    })
                  ) : (
                    <span className="detection-pill detection-pill-none">
                      No utility objects detected in surface image
                    </span>
                  )}
                </div>

                <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                  Visual Aid (Experimental)
                </span>
              </div>

              <div style={{ marginTop: '10px', padding: '10px 14px', background: '#f8fafc', borderRadius: '6px', fontSize: '0.8rem', color: '#64748b', border: '1px solid #e2e8f0' }}>
                <strong>Safety Disclaimer:</strong> Visual image recognition is an experimental inspection aid and cannot detect deeply buried utilities.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
            <button className="btn-secondary" onClick={() => setStep(2)}>← BACK TO UTILITIES</button>
            <button className="btn-primary" onClick={() => setStep(4)}>CONTINUE TO SENSOR MONITORING →</button>
          </div>
        </div>
      )}

      {/* STEP 4: SENSOR MONITORING (SIMULATED TELEMETRY) */}
      {step === 4 && (
        <div className="panel" style={{ background: '#ffffff', borderRadius: '10px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '8px' }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', color: 'var(--primary-dark)', margin: 0 }}>
                Step 4: Subsurface Environmental Sensor Monitoring
              </h3>
              <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                Environmental telemetry simulates soil stability, surface vibration, and ground conditions for excavation safety analysis.
              </p>
            </div>
            <span className="badge-simulated">
              ⚡ SOFTWARE SIMULATED DATA
            </span>
          </div>

          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginTop: '14px', marginBottom: '20px' }}>
            <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0 0 14px 0' }}>
              Click below to generate synchronized simulated telemetry for this location. The values will be used consistently by the hazard formula and multi-model consensus.
            </p>
            <button
              className="btn-primary"
              onClick={handleGenerateSensor}
              disabled={sensorLoading}
              style={{ width: 'auto', padding: '10px 20px' }}
            >
              {sensorLoading ? 'Simulating Telemetry...' : (sensors ? '↻ REGENERATE SENSOR TELEMETRY' : '⚡ GENERATE SENSOR TELEMETRY')}
            </button>
          </div>

          {sensorError && <div className="workflow-message error-message" role="alert">{sensorError}</div>}

          {/* 6-Card Sensor Grid */}
          {sensors && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b' }}>
                  Simulated Sensor Readings
                </span>
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                  Timestamp: {sensors.timestamp ? new Date(sensors.timestamp).toLocaleTimeString() : 'Current Session'}
                </span>
              </div>

              <div className="sensor-card-grid">
                <div className="sensor-card">
                  <div className="sensor-card-label">Surface Vibration</div>
                  <div className="sensor-card-value">
                    {Number(sensors.vibration).toFixed(2)}
                    <span className="sensor-card-unit">Index</span>
                  </div>
                  <div className="sensor-card-desc">Ground vibration intensity</div>
                </div>

                <div className="sensor-card">
                  <div className="sensor-card-label">Acoustic Noise</div>
                  <div className="sensor-card-value">
                    {Number(sensors.acousticLevel ?? 0.15).toFixed(2)}
                    <span className="sensor-card-unit">Index</span>
                  </div>
                  <div className="sensor-card-desc">Subsurface sound telemetry</div>
                </div>

                <div className="sensor-card">
                  <div className="sensor-card-label">Soil Moisture</div>
                  <div className="sensor-card-value">
                    {(Number(sensors.soilMoisture ?? sensors.soilCondition ?? 0.3) * 100).toFixed(0)}
                    <span className="sensor-card-unit">%</span>
                  </div>
                  <div className="sensor-card-desc">Volumetric moisture content</div>
                </div>

                <div className="sensor-card">
                  <div className="sensor-card-label">Soil Temperature</div>
                  <div className="sensor-card-value">
                    {Number(sensors.soilTemperature ?? 24.5).toFixed(1)}
                    <span className="sensor-card-unit">°C</span>
                  </div>
                  <div className="sensor-card-desc">Subsurface soil temp</div>
                </div>

                <div className="sensor-card">
                  <div className="sensor-card-label">Gas Detection</div>
                  <div className="sensor-card-value">
                    {Number(sensors.gasReading ?? 0.05).toFixed(2)}
                    <span className="sensor-card-unit">Index</span>
                  </div>
                  <div className="sensor-card-desc">Volatile compound sensor</div>
                </div>

                <div className="sensor-card">
                  <div className="sensor-card-label">Ground Movement</div>
                  <div className="sensor-card-value">
                    {Number(sensors.groundMovement ?? 0.4).toFixed(1)}
                    <span className="sensor-card-unit">mm</span>
                  </div>
                  <div className="sensor-card-desc">Horizontal displacement</div>
                </div>
              </div>

              <div style={{ marginTop: '16px', padding: '10px 14px', background: '#eff6ff', borderRadius: '6px', fontSize: '0.8rem', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                ℹ️ <strong>Subsurface Sensor Simulation:</strong> Telemetry values are computer-simulated to model real-world soil stability, vibration levels, and subsurface environmental factors for excavation hazard scoring.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
            <button className="btn-secondary" onClick={() => setStep(3)}>← BACK TO SITE IMAGE</button>
            <button className="btn-primary" onClick={() => setStep(5)} disabled={!sensors}>
              CONTINUE TO RISK ASSESSMENT →
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: RISK ASSESSMENT CONFIRMATION & EXECUTION */}
      {step === 5 && (
        <div className="panel" style={{ background: '#ffffff', borderRadius: '10px', padding: '24px' }}>
          <h3 style={{ fontSize: '1.15rem', color: 'var(--primary-dark)', marginBottom: '8px' }}>
            Step 5: Review Parameters & Run Safety Assessment
          </h3>
          <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '20px' }}>
            Review the compiled spatial, environmental, and site parameters before running the multi-layer excavation hazard evaluation.
          </p>

          {/* Review Parameter Cards with Thematic Colors */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '18px', marginBottom: '24px' }}>
            {/* Site Parameters: Deep Forest Accent */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderTop: '4px solid #1B5E20',
              borderRadius: '10px',
              padding: '18px 20px',
              boxShadow: '0 2px 8px rgba(10, 17, 40, 0.05)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1B5E20', fontSize: '0.82rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                📍 SITE PARAMETERS
              </div>
              <div style={{ marginTop: '10px', fontSize: '0.88rem', lineHeight: 1.6, color: '#1E293B' }}>
                <span style={{ color: '#64748B' }}>Location:</span> <strong>{locationName}</strong><br />
                <span style={{ color: '#64748B' }}>Coordinates:</span> <code style={{ color: '#0F172A', fontWeight: 600 }}>{position.lat.toFixed(5)}, {position.lng.toFixed(5)}</code><br />
                <span style={{ color: '#64748B' }}>Excavation Depth:</span> <strong style={{ color: '#1B5E20' }}>{depth} meters</strong><br />
                <span style={{ color: '#64748B' }}>Search Radius:</span> <strong>{radius} meters</strong>
              </div>
            </div>

            {/* Underground Utility Context: Blue Cartographic Accent */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderTop: '4px solid #0284C7',
              borderRadius: '10px',
              padding: '18px 20px',
              boxShadow: '0 2px 8px rgba(10, 17, 40, 0.05)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0284C7', fontSize: '0.82rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                💧 UNDERGROUND UTILITY CONTEXT
              </div>
              <div style={{ marginTop: '10px', fontSize: '0.88rem', lineHeight: 1.6, color: '#1E293B' }}>
                <span style={{ color: '#64748B' }}>Mapped Records:</span> <span className="badge" style={{ background: '#E0F2FE', color: '#0369A1', fontWeight: 700 }}>{nearbyUtilities.length} segments</span><br />
                <span style={{ color: '#64748B' }}>Nearest Asset:</span> <strong style={{ color: '#0284C7' }}>{nearbyUtilities.length > 0 ? `${nearbyUtilities[0].distance}m away` : 'None in radius'}</strong><br />
                <span style={{ color: '#64748B' }}>Target Pipeline:</span> <strong>{nearbyUtilities.length > 0 ? formatUtilityTitle(nearbyUtilities[0]) : 'N/A'}</strong><br />
                <span style={{ color: '#64748B' }}>Data Source:</span> <strong>BWSSB Spatial GIS Networks</strong>
              </div>
            </div>

            {/* Sensor & Inspection Context: Emerald Telemetry Accent */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderTop: '4px solid #10B981',
              borderRadius: '10px',
              padding: '18px 20px',
              boxShadow: '0 2px 8px rgba(10, 17, 40, 0.05)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10B981', fontSize: '0.82rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                ⚡ SENSOR & INSPECTION CONTEXT
              </div>
              <div style={{ marginTop: '10px', fontSize: '0.88rem', lineHeight: 1.6, color: '#1E293B' }}>
                <span style={{ color: '#64748B' }}>Sensor Telemetry:</span> <span className="badge-simulated" style={{ padding: '2px 8px', fontSize: '0.72rem' }}>6 channels active</span><br />
                <span style={{ color: '#64748B' }}>Vibration Index:</span> <strong>{sensors?.vibration ? Number(sensors.vibration).toFixed(2) : '0.12'}</strong><br />
                <span style={{ color: '#64748B' }}>Site Image:</span> {imagePreview ? <strong style={{ color: '#10B981' }}>Provided (analyzed)</strong> : <span style={{ color: '#64748B' }}>Not provided</span>}<br />
                <span style={{ color: '#64748B' }}>Primary Evaluation:</span> <strong>Multi-Factor Hazard Consensus</strong>
              </div>
            </div>
          </div>

          <div style={{
            padding: '14px 18px',
            background: 'linear-gradient(135deg, #F0FDF4 0%, #E8F5E9 100%)',
            border: '1px solid #BBF7D0',
            borderRadius: '8px',
            fontSize: '0.85rem',
            color: '#166534',
            marginBottom: '24px'
          }}>
            <strong>Safety Consensus Policy:</strong> The assessment evaluates geospatial proximity, excavation depth, vibration, moisture, and ground displacement with safety consensus. High risk predictions require physical potholing exposure before machinery deployment.
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn-secondary" onClick={() => setStep(4)}>← BACK TO SENSORS</button>
            <button className="btn-primary" onClick={runRiskAnalysis} disabled={analyzing} style={{ padding: '10px 24px' }}>
              {analyzing ? 'RUNNING HAZARD EVALUATION...' : 'START EXCAVATION SAFETY ANALYSIS'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default MapAnalysis;
