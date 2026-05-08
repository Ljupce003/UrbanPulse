import {useState, useMemo, useEffect, useRef, useCallback} from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
})

const API = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '')
const DEFAULT_CITY = import.meta.env.VITE_DEFAULT_WEATHER_CITY || 'Bitola'
const DEFAULT_COUNTRY = import.meta.env.VITE_DEFAULT_WEATHER_COUNTRY_CODE || 'MK'

export default function Recommendations() {
    // Location selection
    const [useCity, setUseCity] = useState(true)
    const [city, setCity] = useState(DEFAULT_CITY)
    const [country, setCountry] = useState(DEFAULT_COUNTRY)
    const [lat, setLat] = useState('')
    const [lon, setLon] = useState('')
    const [cities, setCities] = useState([])
    const [citiesLoading, setCitiesLoading] = useState(true)

    // Traffic route (optional)
    const [includeTraffic, setIncludeTraffic] = useState(false)
    const [startLat, setStartLat] = useState('')
    const [startLon, setStartLon] = useState('')
    const [endLat, setEndLat] = useState('')
    const [endLon, setEndLon] = useState('')
    const [routeInputMode, setRouteInputMode] = useState('city')
    const [startCityIdx, setStartCityIdx] = useState('')
    const [endCityIdx, setEndCityIdx] = useState('')
    const [geoLoading, setGeoLoading] = useState(false)
    const [mapSelectTarget, setMapSelectTarget] = useState('start')

    // Units
    const [units, setUnits] = useState('metric')

    // State
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [recommendation, setRecommendation] = useState(null)

    const mapContainerRef = useRef(null)
    const mapRef = useRef(null)
    const startMarkerRef = useRef(null)
    const endMarkerRef = useRef(null)
    const routeLineRef = useRef(null)
    const mapSelectTargetRef = useRef('start')

    useEffect(() => {
        mapSelectTargetRef.current = mapSelectTarget
    }, [mapSelectTarget])

    // Fetch cities on mount
    useEffect(() => {
        let cancelled = false

        const fetchCities = async () => {
            try {
                const res = await fetch(`${API}/api/weather/cities?limit=200`)
                const data = await res.json().catch(() => null)
                if (!cancelled && Array.isArray(data)) {
                    setCities(data)
                }
            } catch (e) {
                if (!cancelled) {
                    console.warn('Failed to fetch cities:', e.message)
                }
            } finally {
                if (!cancelled) setCitiesLoading(false)
            }
        }

        fetchCities()
        return () => {
            cancelled = true
        }
    }, [])

    const cityOptions = useMemo(() => {
        return cities.map(c => ({
            value: `${c.city}::${c.country_code || ''}`,
            label: c.country_code ? `${c.city}, ${c.country_code}` : c.city,
            city: c.city,
            country_code: c.country_code || '',
            lat: c.lat,
            lon: c.lon,
        }))
    }, [cities])

    const selectedCityLocation = useMemo(() => {
        const found = cityOptions.find(o => `${o.city}::${o.country_code || ''}` === `${city}::${country || ''}`)
        if (!found) return null
        const latNum = Number(found.lat)
        const lonNum = Number(found.lon)
        if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) return null
        return {lat: latNum, lon: lonNum}
    }, [cityOptions, city, country])

    const routeMapCenter = useMemo(() => {
        if (routeInputMode === 'city' && selectedCityLocation) {
            return [selectedCityLocation.lat, selectedCityLocation.lon]
        }
        if (startLat && startLon) return [Number(startLat), Number(startLon)]
        if (endLat && endLon) return [Number(endLat), Number(endLon)]
        if (cities[0]?.lat && cities[0]?.lon) return [Number(cities[0].lat), Number(cities[0].lon)]
        return [20, 0]
    }, [routeInputMode, selectedCityLocation, startLat, startLon, endLat, endLon, cities])

    const clearMapOverlays = useCallback(() => {
        if (startMarkerRef.current) {
            startMarkerRef.current.remove()
            startMarkerRef.current = null
        }
        if (endMarkerRef.current) {
            endMarkerRef.current.remove()
            endMarkerRef.current = null
        }
        if (routeLineRef.current) {
            routeLineRef.current.remove()
            routeLineRef.current = null
        }
    }, [])

    const syncMapOverlays = useCallback(() => {
        if (!mapRef.current) return
        const map = mapRef.current
        clearMapOverlays()

        const points = []
        const addMarker = (latVal, lonVal, kind) => {
            const latNum = Number(latVal)
            const lonNum = Number(lonVal)
            if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) return null
            const icon = L.divIcon({
                className: `urbanpulse-pin urbanpulse-pin-${kind}`,
                html: `<span>${kind === 'start' ? 'S' : 'E'}</span>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14],
            })
            const marker = L.marker([latNum, lonNum], {icon}).addTo(map)
            points.push([latNum, lonNum])
            return marker
        }

        if (startLat && startLon) {
            startMarkerRef.current = addMarker(startLat, startLon, 'start')
        }
        if (endLat && endLon) {
            endMarkerRef.current = addMarker(endLat, endLon, 'end')
        }
        if (points.length === 2) {
            routeLineRef.current = L.polyline(points, {color: '#3b82f6', weight: 3, opacity: 0.9, dashArray: '6,6'}).addTo(map)
            map.fitBounds(points, {padding: [40, 40]})
        } else if (points.length === 1) {
            map.setView(points[0], Math.max(map.getZoom(), 11), {animate: true})
        } else {
            map.setView(routeMapCenter, 6, {animate: false})
        }
    }, [clearMapOverlays, routeMapCenter, startLat, startLon, endLat, endLon])

    useEffect(() => {
        if (!includeTraffic || routeInputMode !== 'coords' || !mapContainerRef.current) return

        if (!mapRef.current) {
            mapRef.current = L.map(mapContainerRef.current, {
                zoomControl: true,
                scrollWheelZoom: true,
            }).setView(routeMapCenter, 6)

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors',
                maxZoom: 19,
            }).addTo(mapRef.current)

            mapRef.current.on('click', (e) => {
                const {lat, lng} = e.latlng
                const target = mapSelectTargetRef.current
                if (target === 'start') {
                    setStartLat(lat.toFixed(6))
                    setStartLon(lng.toFixed(6))
                    setMapSelectTarget('end')
                } else {
                    setEndLat(lat.toFixed(6))
                    setEndLon(lng.toFixed(6))
                    setMapSelectTarget('start')
                }
            })
        } else {
            mapRef.current.setView(routeMapCenter, mapRef.current.getZoom(), {animate: false})
            setTimeout(() => mapRef.current?.invalidateSize(), 0)
        }

        syncMapOverlays()
    }, [includeTraffic, routeInputMode, routeMapCenter, startLat, startLon, endLat, endLon, syncMapOverlays])

    useEffect(() => {
        return () => {
            if (mapRef.current) {
                mapRef.current.remove()
                mapRef.current = null
            }
        }
    }, [])

    const routeCityOptions = useMemo(() => {
        return cities.map((c, idx) => ({
            value: String(idx),
            label: c.country_code ? `${c.city}, ${c.country_code}` : c.city,
            lat: c.lat,
            lon: c.lon,
            city: c.city,
            country_code: c.country_code || '',
        }))
    }, [cities])

    const useCurrentLocationAsStart = () => {
        if (!navigator.geolocation) {
            setError('Geolocation is not supported by your browser.')
            return
        }
        setGeoLoading(true)
        setError(null)
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setStartLat(String(position.coords.latitude.toFixed(6)))
                setStartLon(String(position.coords.longitude.toFixed(6)))
                setRouteInputMode('coords')
                setMapSelectTarget('end')
                setGeoLoading(false)
            },
            (err) => {
                setError(`Could not get current location: ${err.message}`)
                setGeoLoading(false)
            },
            {enableHighAccuracy: true, timeout: 10000, maximumAge: 30000},
        )
    }

    const resetRouteSelection = () => {
        setStartLat('')
        setStartLon('')
        setEndLat('')
        setEndLon('')
        setStartCityIdx('')
        setEndCityIdx('')
        setMapSelectTarget('start')
        clearMapOverlays()
        if (mapRef.current) {
            mapRef.current.setView(routeMapCenter, 6, {animate: false})
        }
    }

    const handleGetRecommendations = async () => {
        try {
            setLoading(true)
            setError(null)
            setRecommendation(null)

            // Build query params (only include values that are present)
            const params = new URLSearchParams()

            if (useCity) {
                if (!city.trim()) {
                    setError('Please enter a city name')
                    setLoading(false)
                    return
                }
                params.append('city', city)
                if (country) params.append('country_code', country)
            } else {
                if (lat === '' || lon === '') {
                    setError('Please enter both latitude and longitude')
                    setLoading(false)
                    return
                }
                params.append('lat', String(parseFloat(lat)))
                params.append('lon', String(parseFloat(lon)))
            }

            // Optional traffic route — only append when values provided
            if (includeTraffic) {
                let effectiveStartLat = startLat
                let effectiveStartLon = startLon
                let effectiveEndLat = endLat
                let effectiveEndLon = endLon

                if (routeInputMode === 'city') {
                    if (startCityIdx !== '') {
                        const selectedStart = routeCityOptions[Number(startCityIdx)]
                        if (!selectedStart) {
                            setError('Selected start city is invalid.')
                            setLoading(false)
                            return
                        }
                        effectiveStartLat = String(selectedStart.lat)
                        effectiveStartLon = String(selectedStart.lon)
                    }
                    if (endCityIdx !== '') {
                        const selectedEnd = routeCityOptions[Number(endCityIdx)]
                        if (!selectedEnd) {
                            setError('Selected end city is invalid.')
                            setLoading(false)
                            return
                        }
                        effectiveEndLat = String(selectedEnd.lat)
                        effectiveEndLon = String(selectedEnd.lon)
                    }
                }

                if (routeInputMode === 'coords' && !effectiveStartLat && !effectiveStartLon && !effectiveEndLat && !effectiveEndLon) {
                    setError('Choose at least a start point on the map or in coordinates mode.')
                    setLoading(false)
                    return
                }

                if (effectiveStartLat && effectiveStartLon) {
                    params.append('start_lat', String(parseFloat(effectiveStartLat)))
                    params.append('start_lon', String(parseFloat(effectiveStartLon)))
                } else if (effectiveStartLat || effectiveStartLon) {
                    setError('Provide both start latitude and longitude for the traffic route')
                    setLoading(false)
                    return
                }

                if (effectiveEndLat && effectiveEndLon) {
                    params.append('end_lat', String(parseFloat(effectiveEndLat)))
                    params.append('end_lon', String(parseFloat(effectiveEndLon)))
                } else if (effectiveEndLat || effectiveEndLon) {
                    setError('Provide both end latitude and longitude or leave both empty')
                    setLoading(false)
                    return
                }
            }

            params.append('units', units)

            const url = `${API}/api/recommendations/daily?${params.toString()}`
            const res = await fetch(url)

            const text = await res.text()
            let data = text
            try {
                data = JSON.parse(text)
            } catch {
                // not JSON, keep text
            }

            if (!res.ok) {
                // Handle FastAPI validation errors (array of detail objects), or structured errors
                let errMsg = `Error ${res.status}`
                if (data) {
                    if (Array.isArray(data)) {
                        errMsg = data.map((d) => d.msg || d.detail || JSON.stringify(d)).join('; ')
                    } else if (typeof data === 'object') {
                        if (data.detail) {
                            if (Array.isArray(data.detail)) errMsg = data.detail.map(d => d.msg || JSON.stringify(d)).join('; ')
                            else errMsg = String(data.detail)
                        } else {
                            errMsg = JSON.stringify(data)
                        }
                    } else {
                        errMsg = String(data)
                    }
                }
                setError(errMsg)
                return
            }

            // Success: backend returns a plain string (markdown) or structured object
            if (typeof data === 'string') setRecommendation(data)
            else setRecommendation(JSON.stringify(data, null, 2))
        } catch (err) {
            setError(err && err.message ? err.message : String(err))
        } finally {
            setLoading(false)
        }
    }

    const handleCityChange = (e) => {
        const selected = cityOptions.find(o => o.value === e.target.value)
        if (selected) {
            setCity(selected.city)
            setCountry(selected.country_code)
        }
    }

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; overflow-x: hidden !important; }

        .rec-page {
          min-height: 100vh; background: #080c14;
          padding: 80px 0 60px; font-family: 'DM Sans', sans-serif;
          position: relative;
        }
        .rec-bg-grid {
          position: absolute; inset: 0; pointer-events: none; opacity: 0.04;
          background-image:
            linear-gradient(rgba(59,130,246,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,130,246,0.5) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .rec-content {
          position: relative; z-index: 1;
          max-width: 900px; margin: 0 auto; padding: 0 32px;
        }

        .rec-header {
          padding: 48px 0 32px;
          border-bottom: 1px solid rgba(59,130,246,0.08); margin-bottom: 40px;
        }
        .rec-eyebrow {
          font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.25em;
          color: #3b82f6; margin-bottom: 10px;
          display: flex; align-items: center; gap: 8px;
        }
        .rec-eyebrow::before { content: ''; width: 24px; height: 1px; background: #3b82f6; opacity: 0.6; }
        .rec-title {
          font-family: 'Space Mono', monospace; font-size: 32px; font-weight: 700;
          color: #f0f4ff; letter-spacing: -0.03em; line-height: 1.1;
        }
        .rec-sub {
          font-size: 13px; color: rgba(148,163,184,0.5); margin-top: 6px; line-height: 1.5;
        }

        .card {
          background: rgba(10,16,28,0.7); border: 1px solid rgba(59,130,246,0.12);
          border-radius: 4px; padding: 32px; margin-bottom: 20px;
        }
        .card-title {
          font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.2em;
          color: rgba(100,116,139,0.5); margin-bottom: 20px; font-weight: 700;
        }

        .form-section {
          margin-bottom: 28px;
        }
        .section-title {
          font-size: 12px; font-weight: 600; color: #e2e8f0; margin-bottom: 14px;
          text-transform: uppercase; letter-spacing: 0.05em;
        }

        .tab-buttons {
          display: flex; gap: 10px; margin-bottom: 16px;
        }
        .tab-btn {
          padding: 8px 16px; border-radius: 3px; border: 1px solid;
          background: transparent; cursor: pointer;
          font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.1em;
          transition: all 0.2s;
        }
        .tab-btn.active {
          border-color: #3b82f6; background: rgba(59,130,246,0.1); color: #3b82f6;
        }
        .tab-btn:not(.active) {
          border-color: rgba(100,116,139,0.25); color: rgba(148,163,184,0.6);
        }
        .tab-btn:hover:not(.active) {
          border-color: rgba(148,163,184,0.4); color: #e2e8f0;
        }

        .form-group {
          margin-bottom: 16px;
        }
        .form-label {
          display: block; font-family: 'Space Mono', monospace; font-size: 10px;
          letter-spacing: 0.15em; color: rgba(100,116,139,0.6); margin-bottom: 8px;
        }
        input, select {
          width: 100%; padding: 10px 12px; background: rgba(10,16,28,0.8);
          border: 1px solid rgba(59,130,246,0.15); border-radius: 3px;
          color: #e2e8f0; font-family: 'Space Mono', monospace; font-size: 12px;
          outline: none; transition: border-color 0.2s;
        }
        input:focus, select:focus {
          border-color: rgba(59,130,246,0.4);
        }

        .input-row {
          display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
        }
        .route-mode-note {
          font-size: 11px; color: rgba(148,163,184,0.6); margin-top: 8px;
        }

        .checkbox-group {
          display: flex; align-items: center; gap: 10px;
          padding: 12px; background: rgba(59,130,246,0.05); border-radius: 3px;
          border: 1px solid rgba(59,130,246,0.1);
        }
        .checkbox-group input[type="checkbox"] {
          width: auto; cursor: pointer;
        }
        .checkbox-label {
          font-size: 12px; color: rgba(148,163,184,0.8); cursor: pointer;
        }

        .btn {
          padding: 12px 24px; border-radius: 3px; border: 1px solid;
          font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.15em;
          cursor: pointer; transition: all 0.2s; background: transparent;
        }
        .btn-primary {
          border-color: #3b82f6; color: #3b82f6;
        }
        .btn-primary:hover:not(:disabled) {
          background: #3b82f6; color: #080c14;
        }
        .btn-primary:disabled {
          opacity: 0.4; cursor: not-allowed;
        }

        .button-row {
          display: flex; gap: 12px; margin-top: 20px;
        }

        .loading-spinner {
          width: 28px; height: 28px; border-radius: 50%;
          border: 2px solid rgba(59,130,246,0.2);
          border-top: 2px solid #3b82f6;
          animation: spin 0.8s linear infinite;
          margin-right: 10px;
        }
        @keyframes spin { to { transform: rotate(360deg) } }

        .btn-content {
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }

        .error-box {
          padding: 12px 14px; background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.2); border-radius: 3px;
          color: #fca5a5; font-family: 'Space Mono', monospace; font-size: 11px;
          margin-bottom: 16px; letter-spacing: 0.04em;
        }

        .rec-result {
          background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(59,130,246,0.05));
          border: 1px solid rgba(16,185,129,0.2); border-radius: 4px; padding: 24px;
          margin-top: 20px;
        }
        .rec-result-title {
          font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.2em;
          color: #6ee7b7; margin-bottom: 16px; font-weight: 700;
        }
        .rec-result-content {
          color: rgba(226,232,240,0.9); line-height: 1.7; font-size: 13px;
          word-wrap: break-word; white-space: pre-wrap;
        }
        .rec-result-content a {
          color: #3b82f6; text-decoration: none; border-bottom: 1px solid rgba(59,130,246,0.3);
        }
        .rec-result-content a:hover {
          border-bottom-color: #3b82f6;
        }
        .rec-result-content strong {
          color: #f0f4ff; font-weight: 600;
        }
        .rec-result-content em {
          color: rgba(148,163,184,0.8);
        }

        .info-note {
          padding: 10px 12px; background: rgba(59,130,246,0.05); border-left: 2px solid rgba(59,130,246,0.3);
          border-radius: 2px; font-size: 11px; color: rgba(148,163,184,0.6);
          margin-bottom: 16px; line-height: 1.5;
        }
      `}</style>

            <div className="rec-page">
                <div className="rec-bg-grid"/>
                <div className="rec-content">

                    <div className="rec-header">
                        <div className="rec-eyebrow">INSIGHTS & PLANNING</div>
                        <h1 className="rec-title">Daily Recommendations</h1>
                        <p className="rec-sub">
                            Get personalized travel and activity recommendations based on real-time air quality,<br/>
                            traffic conditions, and weather forecasts.
                        </p>
                    </div>

                    <div className="card">
                        <div className="card-title">STEP 1 — SELECT LOCATION</div>

                        {error && <div className="error-box">⚠ {error}</div>}

                        <div className="form-section">
                            <div className="section-title">Location Mode</div>
                            <div className="tab-buttons">
                                <button
                                    className={`tab-btn ${useCity ? 'active' : ''}`}
                                    onClick={() => setUseCity(true)}
                                >
                                    CITY
                                </button>
                                <button
                                    className={`tab-btn ${!useCity ? 'active' : ''}`}
                                    onClick={() => setUseCity(false)}
                                >
                                    COORDINATES
                                </button>
                            </div>
                        </div>

                        {useCity ? (
                            <div className="form-section">
                                <div className="form-group">
                                    <label className="form-label">CITY</label>
                                    <select
                                        value={`${city}::${country}`}
                                        onChange={handleCityChange}
                                        disabled={citiesLoading}
                                    >
                                        {cities.length === 0 ? (
                                            <option value={`${city}::${country}`}>{city}, {country}</option>
                                        ) : (
                                            cities.map(c => {
                                                const val = `${c.city}::${c.country_code || ''}`
                                                const label = c.country_code ? `${c.city}, ${c.country_code}` : c.city
                                                return <option key={val} value={val}>{label}</option>
                                            })
                                        )}
                                    </select>
                                </div>
                            </div>
                        ) : (
                            <div className="form-section">
                                <div className="input-row">
                                    <div className="form-group">
                                        <label className="form-label">LATITUDE</label>
                                        <input
                                            type="number"
                                            step="0.0001"
                                            min="-90"
                                            max="90"
                                            placeholder="-90 to 90"
                                            value={lat}
                                            onChange={(e) => setLat(e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">LONGITUDE</label>
                                        <input
                                            type="number"
                                            step="0.0001"
                                            min="-180"
                                            max="180"
                                            placeholder="-180 to 180"
                                            value={lon}
                                            onChange={(e) => setLon(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="form-section">
                            <div className="section-title">Temperature Units</div>
                            <div className="form-group">
                                <label className="form-label">UNITS</label>
                                <select value={units} onChange={(e) => setUnits(e.target.value)}>
                                    <option value="metric">Celsius (°C)</option>
                                    <option value="imperial">Fahrenheit (°F)</option>
                                    <option value="standard">Kelvin (K)</option>
                                </select>
                            </div>
                        </div>

                        <div className="form-section">
                            <div className="info-note">
                                💡 Include traffic route to factor in commute conditions and congestion levels
                            </div>
                            <div className="checkbox-group">
                                <input
                                    type="checkbox"
                                    id="include-traffic"
                                    checked={includeTraffic}
                                    onChange={(e) => setIncludeTraffic(e.target.checked)}
                                />
                                <label htmlFor="include-traffic" className="checkbox-label">
                                    Include traffic route analysis (optional)
                                </label>
                            </div>
                        </div>

                        {includeTraffic && (
                            <div className="form-section">
                                <div className="section-title">Traffic Route (Optional)</div>

                                <div className="tab-buttons" style={{marginBottom: 10}}>
                                    <button
                                        className={`tab-btn ${routeInputMode === 'city' ? 'active' : ''}`}
                                        onClick={() => setRouteInputMode('city')}
                                        type="button"
                                    >
                                        CITY PICKER
                                    </button>
                                    <button
                                        className={`tab-btn ${routeInputMode === 'coords' ? 'active' : ''}`}
                                        onClick={() => setRouteInputMode('coords')}
                                        type="button"
                                    >
                                        COORDINATES
                                    </button>
                                </div>

                                {routeInputMode === 'city' ? (
                                    <>
                                        <div className="input-row">
                                            <div className="form-group">
                                                <label className="form-label">START CITY (OPTIONAL)</label>
                                                <select value={startCityIdx} onChange={(e) => setStartCityIdx(e.target.value)}>
                                                    <option value="">Use default/backend start</option>
                                                    {routeCityOptions.map((c) => (
                                                        <option key={`s-${c.value}-${c.label}`} value={c.value}>{c.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">END CITY (OPTIONAL)</label>
                                                <select value={endCityIdx} onChange={(e) => setEndCityIdx(e.target.value)}>
                                                    <option value="">Use default/backend end</option>
                                                    {routeCityOptions.map((c) => (
                                                        <option key={`e-${c.value}-${c.label}`} value={c.value}>{c.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="button-row" style={{marginTop: 0}}>
                                            <button className="btn btn-primary" type="button" onClick={useCurrentLocationAsStart} disabled={geoLoading}>
                                                {geoLoading ? 'LOCATING...' : 'USE MY LOCATION AS START'}
                                            </button>
                                        </div>
                                        <div className="route-mode-note">
                                            Tip: choose one or both cities. If left empty, backend default route logic is used.
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="route-mode-note" style={{marginBottom: 10}}>
                                            Click the map to set <strong>start</strong> and then <strong>end</strong> points. You can still edit the fields below manually.
                                        </div>

                                        <div style={{
                                            border: '1px solid rgba(59,130,246,0.2)',
                                            borderRadius: 4,
                                            overflow: 'hidden',
                                            marginBottom: 14,
                                            background: 'rgba(2,6,23,0.6)'
                                        }}>
                                            <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', padding: 10, borderBottom: '1px solid rgba(59,130,246,0.12)'}}>
                                                <button className={`tab-btn ${mapSelectTarget === 'start' ? 'active' : ''}`} type="button" onClick={() => setMapSelectTarget('start')}>PLACE START</button>
                                                <button className={`tab-btn ${mapSelectTarget === 'end' ? 'active' : ''}`} type="button" onClick={() => setMapSelectTarget('end')}>PLACE END</button>
                                                <button className="tab-btn" type="button" onClick={resetRouteSelection}>RESET ROUTE</button>
                                            </div>
                                            <div ref={mapContainerRef} style={{height: 360, width: '100%'}} />
                                        </div>

                                        <div className="route-mode-note" style={{marginBottom: 10}}>
                                            Active point: <strong>{mapSelectTarget === 'start' ? 'start' : 'end'}</strong>
                                        </div>

                                        <div className="input-row">
                                            <div className="form-group">
                                                <label className="form-label">START LATITUDE</label>
                                                <input
                                                    type="number"
                                                    step="0.0001"
                                                    min="-90"
                                                    max="90"
                                                    placeholder="Origin latitude"
                                                    value={startLat}
                                                    onChange={(e) => setStartLat(e.target.value)}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">START LONGITUDE</label>
                                                <input
                                                    type="number"
                                                    step="0.0001"
                                                    min="-180"
                                                    max="180"
                                                    placeholder="Origin longitude"
                                                    value={startLon}
                                                    onChange={(e) => setStartLon(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="input-row">
                                            <div className="form-group">
                                                <label className="form-label">END LATITUDE (Optional)</label>
                                                <input
                                                    type="number"
                                                    step="0.0001"
                                                    min="-90"
                                                    max="90"
                                                    placeholder="Destination latitude"
                                                    value={endLat}
                                                    onChange={(e) => setEndLat(e.target.value)}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">END LONGITUDE (Optional)</label>
                                                <input
                                                    type="number"
                                                    step="0.0001"
                                                    min="-180"
                                                    max="180"
                                                    placeholder="Destination longitude"
                                                    value={endLon}
                                                    onChange={(e) => setEndLon(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="button-row" style={{marginTop: 0}}>
                                            <button className="btn btn-primary" type="button" onClick={useCurrentLocationAsStart} disabled={geoLoading}>
                                                {geoLoading ? 'LOCATING...' : 'USE MY LOCATION AS START'}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        <div className="button-row">
                            <button
                                className="btn btn-primary"
                                onClick={handleGetRecommendations}
                                disabled={loading}
                            >
                                <div className="btn-content">
                                    {loading && <div className="loading-spinner"/>}
                                    {loading ? 'GENERATING...' : 'GET RECOMMENDATIONS →'}
                                </div>
                            </button>
                        </div>
                    </div>

                    {recommendation && (
                        <div className="card">
                            <div className="rec-result">
                                <div className="rec-result-title">✓ PERSONALIZED RECOMMENDATIONS</div>
                                <div className="rec-result-content">
                                    {recommendation}
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </>
    )
}

