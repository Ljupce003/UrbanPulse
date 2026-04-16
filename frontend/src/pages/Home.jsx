import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'

const ROLE_LABEL = {
  admin:        'Administrator',
  analyst:      'Analyst',
  general_user: 'General User',
}

const BASE_STAT_CARDS = [
  {
    id: 'aqi', label: 'AIR QUALITY INDEX', value: '—', unit: 'AQI',
    status: 'LOADING', statusColor: '#3b82f6',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2a7 7 0 017 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 017-7z"/>
        <circle cx="12" cy="9" r="2.5"/>
      </svg>
    ),
    accent: '#10b981',
  },
  {
    id: 'traffic', label: 'TRAFFIC STATUS', value: '—', unit: '',
    status: 'LOADING', statusColor: '#3b82f6',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="9" y="2" width="6" height="20" rx="3"/>
        <circle cx="12" cy="7" r="1.5" fill="currentColor" stroke="none"/>
        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" opacity="0.4"/>
        <circle cx="12" cy="17" r="1.5" fill="currentColor" stroke="none" opacity="0.2"/>
      </svg>
    ),
    accent: '#f59e0b',
  },
  {
    id: 'weather', label: 'TEMPERATURE', value: '—', unit: '°C',
    status: 'LOADING', statusColor: '#3b82f6',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2v10M12 2a3 3 0 013 3v7a5 5 0 11-6 0V5a3 3 0 013-3z"/>
      </svg>
    ),
    accent: '#3b82f6',
  },
]

const API = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '')
const DEFAULT_CITY = import.meta.env.VITE_DEFAULT_WEATHER_CITY || 'Bitola'
const DEFAULT_COUNTRY = import.meta.env.VITE_DEFAULT_WEATHER_COUNTRY_CODE || 'MK'
const SELECTED_CITY_STORAGE_KEY = 'urbanpulse:selected_city'
const WEATHER_REFRESH_MS = Number(import.meta.env.VITE_WEATHER_REFRESH_MS || 60000)
const WEATHER_CLIENT_CACHE_MS = Number(import.meta.env.VITE_WEATHER_CLIENT_CACHE_MS || 300000)
const AQI_REFRESH_MS = Number(import.meta.env.VITE_AQI_REFRESH_MS || 60000)
const AQI_CLIENT_CACHE_MS = Number(import.meta.env.VITE_AQI_CLIENT_CACHE_MS || 300000)
const TRAFFIC_REFRESH_MS = Number(import.meta.env.VITE_TRAFFIC_REFRESH_MS || 60000)
const TRAFFIC_CLIENT_CACHE_MS = Number(import.meta.env.VITE_TRAFFIC_CLIENT_CACHE_MS || 300000)

const QUICK_ACTIONS = [
  { label: 'POLLUTION ANALYZER', desc: 'Break down pollution contribution factors', to: '/analyzer', roles: ['general_user','analyst','admin'] },
  { label: 'SCENARIO SIMULATOR', desc: 'Simulate rainfall, traffic, and pollution impact', to: '/simulate', roles: ['general_user','analyst','admin'] },
  { label: 'DATA MANAGEMENT', desc: 'Upload and normalize datasets', to: '/data', roles: ['analyst','admin'] },
  { label: 'USER MANAGEMENT', desc: 'Manage roles and permissions', to: '/admin/users', roles: ['admin'] },
]

export default function Home() {
  const { profile, role } = useAuth()
  const visibleActions = QUICK_ACTIONS.filter(a => a.roles.includes(role))
  const [cities, setCities] = useState([])
  const [citiesStatus, setCitiesStatus] = useState('LOADING')
  const [selectedCity, setSelectedCity] = useState(DEFAULT_CITY)
  const [selectedCountry, setSelectedCountry] = useState(DEFAULT_COUNTRY)
  const [weatherData, setWeatherData] = useState(null)
  const [weatherStatus, setWeatherStatus] = useState('LOADING')
  const [aaqiData, setAaqiData] = useState(null)
  const [aaqiStatus, setAaqiStatus] = useState('LOADING')
  const [trafficData, setTrafficData] = useState(null)
  const [trafficStatus, setTrafficStatus] = useState('LOADING')

  const weatherCacheKey = useMemo(
    () => `urbanpulse:weather:${selectedCity}:${selectedCountry || ''}`,
    [selectedCity, selectedCountry],
  )
  const aqiCacheKey = useMemo(
    () => `urbanpulse:aqi:${selectedCity}:${selectedCountry || ''}`,
    [selectedCity, selectedCountry],
  )
  const trafficCacheKey = useMemo(
    () => `urbanpulse:traffic:${selectedCity}:${selectedCountry || ''}`,
    [selectedCity, selectedCountry],
  )
  const selectedCityValue = useMemo(
    () => `${selectedCity}::${selectedCountry || ''}`,
    [selectedCity, selectedCountry],
  )

  const weatherLocationLabel = useMemo(() => {
    const city = weatherData?.location?.city || selectedCity
    const country = weatherData?.location?.country_code || selectedCountry
    return country ? `${city}, ${country}` : city
  }, [weatherData, selectedCity, selectedCountry])

  const aqiValue = useMemo(() => {
    return aaqiData?.aqi_index ?? null
  }, [aaqiData])

  const aqiLevel = useMemo(() => {
    return aaqiData?.aqi_level || 'LOADING'
  }, [aaqiData])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SELECTED_CITY_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (!parsed?.city) return
      setSelectedCity(parsed.city)
      setSelectedCountry(parsed.country_code || '')
    } catch {
      // Ignore malformed saved selection.
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(
      SELECTED_CITY_STORAGE_KEY,
      JSON.stringify({ city: selectedCity, country_code: selectedCountry || null }),
    )
  }, [selectedCity, selectedCountry])

  useEffect(() => {
    let cancelled = false

    const fetchCities = async () => {
      try {
        const res = await fetch(`${API}/api/weather/cities?limit=200`)
        const json = await res.json().catch(() => null)
        if (!res.ok || !Array.isArray(json)) {
          if (!cancelled) setCitiesStatus('UNAVAILABLE')
          return
        }

        if (cancelled) return
        setCities(json)
        setCitiesStatus('READY')

        const hasSelected = json.some(
          (item) => item.city === selectedCity && (item.country_code || '') === (selectedCountry || ''),
        )
        if (!hasSelected && json.length > 0) {
          setSelectedCity(json[0].city)
          setSelectedCountry(json[0].country_code || '')
        }
      } catch {
        if (!cancelled) setCitiesStatus('UNAVAILABLE')
      }
    }

    fetchCities()
    return () => {
      cancelled = true
    }
  }, [selectedCity, selectedCountry])

  useEffect(() => {
    let cancelled = false
    let inFlight = false

    const readCached = () => {
      try {
        const raw = localStorage.getItem(weatherCacheKey)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed?.data || !parsed?.ts) return null
        if (Date.now() - parsed.ts > WEATHER_CLIENT_CACHE_MS) return null
        return parsed.data
      } catch {
        return null
      }
    }

    const writeCached = (data) => {
      localStorage.setItem(weatherCacheKey, JSON.stringify({ ts: Date.now(), data }))
    }

    const cached = readCached()
    if (cached) {
      setWeatherData(cached)
      setWeatherStatus('CACHED')
    }

    const fetchWeather = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const params = new URLSearchParams({
          city: selectedCity,
          units: 'metric',
        })
        if (selectedCountry) params.set('country_code', selectedCountry)

        const res = await fetch(`${API}/api/weather/current?${params.toString()}`)
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          if (!cancelled) {
            setWeatherStatus(cached ? 'CACHED' : 'UNAVAILABLE')
            console.warn('[Home] weather fetch failed:', json?.detail || `Weather error ${res.status}`)
          }
          return
        }

        if (!cancelled) {
          setWeatherData(json)
          setWeatherStatus('LIVE')
          writeCached(json)
        }
      } catch (err) {
        if (!cancelled) {
          setWeatherStatus(cached ? 'CACHED' : 'UNAVAILABLE')
          console.warn('[Home] weather fetch failed:', err.message)
        }
      } finally {
        inFlight = false
      }
    }

    fetchWeather()
    const timer = setInterval(fetchWeather, WEATHER_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [selectedCity, selectedCountry, weatherCacheKey])

  useEffect(() => {
    let cancelled = false
    let inFlight = false

    const readTrafficCached = () => {
      try {
        const raw = localStorage.getItem(trafficCacheKey)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed?.data || !parsed?.ts) return null
        if (Date.now() - parsed.ts > TRAFFIC_CLIENT_CACHE_MS) return null
        return parsed.data
      } catch {
        return null
      }
    }

    const writeTrafficCached = (data) => {
      localStorage.setItem(trafficCacheKey, JSON.stringify({ ts: Date.now(), data }))
    }

    const cached = readTrafficCached()
    if (cached) {
      setTrafficData(cached)
      setTrafficStatus('CACHED')
    }

    const fetchTraffic = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const params = new URLSearchParams({
          city: selectedCity,
          distance_m: '500',
          bearing_deg: '90',
        })
        if (selectedCountry) params.set('country_code', selectedCountry)

        const res = await fetch(`${API}/api/traffic/score/auto?${params.toString()}`)
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          if (!cancelled) {
            setTrafficStatus(cached ? 'CACHED' : 'UNAVAILABLE')
            console.warn('[Home] traffic fetch failed:', json?.detail || `Error ${res.status}`)
          }
          return
        }

        if (!cancelled) {
          setTrafficData(json)
          setTrafficStatus('LIVE')
          writeTrafficCached(json)
        }
      } catch (err) {
        if (!cancelled) {
          setTrafficStatus(cached ? 'CACHED' : 'UNAVAILABLE')
          console.warn('[Home] traffic fetch failed:', err.message)
        }
      } finally {
        inFlight = false
      }
    }

    fetchTraffic()
    const timer = setInterval(fetchTraffic, TRAFFIC_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [selectedCity, selectedCountry, trafficCacheKey])

  useEffect(() => {
    let cancelled = false
    let inFlight = false

    const readAaqiCached = () => {
      try {
        const raw = localStorage.getItem(aqiCacheKey)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed?.data || !parsed?.ts) return null
        if (Date.now() - parsed.ts > AQI_CLIENT_CACHE_MS) return null
        return parsed.data
      } catch {
        return null
      }
    }

    const writeAaqiCached = (data) => {
      localStorage.setItem(aqiCacheKey, JSON.stringify({ ts: Date.now(), data }))
    }

    const cached = readAaqiCached()
    if (cached) {
      setAaqiData(cached)
      setAaqiStatus('CACHED')
    }

    const fetchAaqi = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const params = new URLSearchParams({
          city: selectedCity,
        })
        if (selectedCountry) params.set('country_code', selectedCountry)

        const res = await fetch(`${API}/api/pollution/current?${params.toString()}`)
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          if (!cancelled) {
            setAaqiStatus(cached ? 'CACHED' : 'UNAVAILABLE')
            console.warn('[Home] AQI fetch failed:', json?.detail || `Error ${res.status}`)
          }
          return
        }

        if (!cancelled) {
          setAaqiData(json)
          setAaqiStatus('LIVE')
          writeAaqiCached(json)
        }
      } catch (err) {
        if (!cancelled) {
          setAaqiStatus(cached ? 'CACHED' : 'UNAVAILABLE')
          console.warn('[Home] AQI fetch failed:', err.message)
        }
      } finally {
        inFlight = false
      }
    }

    fetchAaqi()
    const timer = setInterval(fetchAaqi, AQI_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [selectedCity, selectedCountry, aqiCacheKey])

  const statCards = useMemo(() => {
    return BASE_STAT_CARDS.map((card) => {
      if (card.id === 'aqi') {
        if (!aaqiData) {
          return {
            ...card,
            status: aaqiStatus,
            statusColor: aaqiStatus === 'UNAVAILABLE' ? '#ef4444' : '#3b82f6',
          }
        }

        return {
          ...card,
          value: aqiValue !== null ? aqiValue.toString() : '—',
          unit: 'AQI',
          status: `${aqiLevel} | ${aaqiStatus}`,
          statusColor: aaqiStatus === 'LIVE' ? '#10b981' : '#3b82f6',
        }
      }

      if (card.id === 'weather') {
        if (!weatherData) {
          return {
            ...card,
            status: weatherStatus,
            statusColor: weatherStatus === 'UNAVAILABLE' ? '#ef4444' : '#3b82f6',
          }
        }

        return {
          ...card,
          value: Number(weatherData.main?.temp ?? 0).toFixed(1),
          unit: 'degC',
          status: `${weatherData.weather?.main || 'WEATHER'} | ${weatherLocationLabel} | ${weatherStatus}`,
          statusColor: weatherStatus === 'LIVE' ? '#10b981' : '#3b82f6',
        }
      }

      if (card.id === 'traffic') {
        if (!trafficData) {
          return {
            ...card,
            status: trafficStatus,
            statusColor: trafficStatus === 'UNAVAILABLE' ? '#ef4444' : '#3b82f6',
          }
        }

        const colorMap = {
          red: '#ef4444',
          yellow: '#f59e0b',
          green: '#10b981',
        }
        const trafficColor = colorMap[trafficData.traffic_color] || '#3b82f6'

        return {
          ...card,
          value: Number(trafficData.traffic_score ?? 0).toFixed(1),
          unit: '/10',
          status: `${trafficData.traffic_level || 'TRAFFIC'} | ${trafficStatus}`,
          statusColor: trafficStatus === 'UNAVAILABLE' ? '#ef4444' : trafficColor,
        }
      }

      return card
    })
  }, [weatherData, weatherStatus, weatherLocationLabel, aaqiData, aaqiStatus, aqiValue, aqiLevel, trafficData, trafficStatus])

  return (
    <div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&display=swap');
        body {
          margin: 0;
          overflow-x: hidden !important;

        }
        .home-page {
          min-height: 100vh; background: #080c14;
          padding: 80px 0 60px;
          font-family: 'DM Sans', sans-serif;
          position: relative; overflow: hidden;
          width: 100vw;
        }

        .home-bg-grid {
          position: absolute; inset: 0; pointer-events: none; opacity: 0.1;
          background-image:
            linear-gradient(rgba(59,130,246,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,130,246,0.5) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .home-bg-blob {
          position: absolute; border-radius: 50%; pointer-events: none;
        }

        .home-content {
          position: relative; z-index: 1;
          max-width: 1100px; margin: 0 auto; padding: 0 32px;
        }

        /* ── Hero ── */
        .home-hero { padding: 48px 0 40px; }
        .hero-eyebrow {
          font-family: 'Space Mono', monospace;
          font-size: 15px; letter-spacing: 0.25em;
          color: #3b82f6; margin-bottom: 14px;
          display: flex; align-items: center; gap: 8px;
        }
        .hero-eyebrow::before {
          content: ''; width: 24px; height: 1px; background: #3b82f6; opacity: 0.6;
        }
        .hero-title {
          font-family: 'Space Mono', monospace;
          font-size: clamp(28px, 4vw, 44px); font-weight: 700;
          color: #f0f4ff; letter-spacing: -0.03em; line-height: 1.1;
          margin-bottom: 10px;
        }
        .hero-title span { color: #3b82f6; }
        .hero-sub {
          font-size: 15px; color: rgba(148,163,184);
          font-weight: 300; line-height: 1.6;
          max-width: 520px;
        }
        .hero-weather-chip {
          margin-top: 16px;
          display: inline-flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 8px;
          border: 1px solid rgba(59,130,246,0.3);
          background: linear-gradient(135deg, rgba(59,130,246,0.18), rgba(59,130,246,0.05));
          box-shadow: 0 8px 20px rgba(0,0,0,0.22);
        }
        .hero-controls {
          margin-top: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }
        .hero-weather-label {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.16em;
          color: rgba(148,163,184,0.75);
        }
        .hero-weather-value {
          font-family: 'Space Mono', monospace;
          font-size: 18px;
          font-weight: 700;
          letter-spacing: 0.03em;
          color: #e2e8f0;
        }
        .hero-weather-status {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.12em;
          color: #3b82f6;
          border: 1px solid rgba(59,130,246,0.35);
          border-radius: 999px;
          padding: 4px 8px;
          background: rgba(59,130,246,0.1);
        }
        .hero-city-picker {
          margin-top: 16px;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid rgba(148,163,184,0.25);
          background: rgba(10,16,28,0.75);
        }
        .hero-city-picker-label {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.12em;
          color: rgba(148,163,184,0.85);
        }
        .hero-city-picker-select {
          background: rgba(15,23,42,0.95);
          color: #e2e8f0;
          border: 1px solid rgba(59,130,246,0.35);
          border-radius: 6px;
          padding: 7px 10px;
          min-width: 220px;
          font-size: 12px;
          outline: none;
        }

        /* ── Stat cards ── */
        .section-label {
          font-family: 'Space Mono', monospace;
          font-size: 14px; letter-spacing: 0.25em;
          color: rgba(100,116,139); margin-bottom: 16px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px; margin-bottom: 48px;
        }

        .stat-card {
          background: rgba(10,16,28,0.7);
          border: 1px solid rgba(59,130,246,0.1);
          border-radius: 4px; padding: 24px;
          position: relative; overflow: hidden;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .stat-card:hover {
          border-color: rgba(59,130,246,0.25);
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        .stat-card-top {
          display: flex; justify-content: space-between;
          align-items: flex-start; margin-bottom: 20px;
        }
        .stat-label-text {
          font-family: 'Space Mono', monospace;
          font-size: 9px; letter-spacing: 0.2em;
          color: whitesmoke;
        }
        .stat-value-row { display: flex; align-items: baseline; gap: 6px; }
        .stat-value {
          font-family: 'Space Mono', monospace;
          font-size: 36px; font-weight: 700;
          color: #f0f4ff; letter-spacing: -0.03em; line-height: 1;
        }
        .stat-unit {
          font-family: 'Space Mono', monospace;
          font-size: 13px; color: rgba(148,163,184,0.4);
        }
        .stat-status {
          margin-top: 12px;
          font-family: 'Space Mono', monospace;
          font-size: 9px; letter-spacing: 0.15em;
          display: flex; align-items: center; gap: 6px;
        }
        .stat-status-dot { width: 5px; height: 5px; border-radius: 50%; }
        .stat-accent-line {
          position: absolute; bottom: 0; left: 0; right: 0; height: 2px;
          opacity: 0.3;
        }

        /* ── Quick actions ── */
        .actions-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
        }

        .action-card {
          background: rgba(10,16,28,0.5);
          border: 1px solid rgba(59,130,246,0.08);
          border-radius: 4px; padding: 20px;
          cursor: pointer; text-decoration: none;
          transition: all 0.2s ease; display: block;
          position: relative;
        }
        .action-card:hover {
          border-color: rgba(59,130,246,0.25);
          background: rgba(59,130,246,0.04);
          transform: translateY(-2px);
        }
        .action-label {
          font-family: 'Space Mono', monospace;
          font-size: 10px; font-weight: 700; letter-spacing: 0.15em;
          color: #e2e8f0; margin-bottom: 8px;
        }
        .action-desc {
          font-size: 12px; color: rgba(148,163,184,0.45);
          font-weight: 300; line-height: 1.5;
        }
        .action-arrow {
          position: absolute; top: 20px; right: 20px;
          font-family: 'Space Mono', monospace;
          font-size: 14px; color: rgba(59,130,246,0.3);
          transition: all 0.2s ease;
        }
        .action-card:hover .action-arrow {
          color: #3b82f6; transform: translate(2px, -2px);
        }
      `}
      </style>

      <div className="home-page">
        <div className="home-bg-grid" />
        <div className="home-bg-blob" style={{
          top: '-10%', right: '-5%', width: 500, height: 500,
          background: 'radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 70%)',
        }} />
        <div className="home-bg-blob" style={{
          bottom: '-5%', left: '-8%', width: 400, height: 400,
          background: 'radial-gradient(circle, rgba(16,185,129,0.05) 0%, transparent 70%)',
        }} />

        <div className="home-content">

          {/* Hero */}
          <div className="home-hero">
            <div className="hero-eyebrow">
              WELCOME BACK, {profile?.full_name?.split(' ')[0]?.toUpperCase() || 'USER'}
              &nbsp;·&nbsp;
              {ROLE_LABEL[role] || 'General User'}
            </div>
            <h1 className="hero-title">
              Urban<span>Pulse</span><br />Dashboard
            </h1>
            <p className="hero-sub">
              Real-time traffic, air quality, and weather intelligence for your city.
            </p>
            <div className="hero-controls">
              <div className="hero-weather-chip" aria-label="Current weather location">
                <div className="hero-weather-label">ACTIVE WEATHER LOCATION</div>
                <div className="hero-weather-value">{weatherLocationLabel}</div>
                <div className="hero-weather-status">{weatherStatus}</div>
              </div>
              <div className="hero-city-picker" aria-label="Select city from database">
                <div className="hero-city-picker-label">CITY</div>
                <select
                  className="hero-city-picker-select"
                  value={selectedCityValue}
                  onChange={(e) => {
                    const [city, country] = e.target.value.split('::')
                    setSelectedCity(city)
                    setSelectedCountry(country || '')
                  }}
                  disabled={citiesStatus !== 'READY' || cities.length === 0}
                >
                  {cities.length === 0 ? (
                    <option value={selectedCityValue}>{`${selectedCity}, ${selectedCountry || '--'}`}</option>
                  ) : (
                    cities.map((item) => {
                      const optionValue = `${item.city}::${item.country_code || ''}`
                      const optionLabel = item.country_code ? `${item.city}, ${item.country_code}` : item.city
                      return (
                        <option key={`${optionValue}:${item.lat}:${item.lon}`} value={optionValue}>
                          {optionLabel}
                        </option>
                      )
                    })
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Live Stats */}
          <div className="section-label">LIVE CONDITIONS</div>
          <div className="stats-grid">
            {statCards.map(card => (
              <div key={card.id} className="stat-card">
                <div className="stat-card-top">
                  <div className="stat-label-text">{card.label}</div>
                  <div className="stat-icon" style={{ color: card.accent }}>
                    {card.icon}
                  </div>
                </div>
                <div className="stat-value-row">
                  <div className="stat-value">{card.value}</div>
                  <div className="stat-unit">{card.unit}</div>
                </div>
                <div className="stat-status">
                  <div
                    className="stat-status-dot"
                    style={{ background: card.statusColor, animation: 'nbpulse 2s infinite' }}
                  />
                  <span style={{ color: 'rgba(100,116,139,0.5)' }}>{card.status}</span>
                </div>
                <div className="stat-accent-line" style={{ background: card.accent }} />
              </div>
            ))}
          </div>

          {/* Quick actions filtered by role */}
          {visibleActions.length > 0 && (
            <>
              <div className="section-label">QUICK ACCESS</div>
              <div className="actions-grid">
                {visibleActions.map(action => (
                  <a key={action.to} href={action.to} className="action-card">
                    <div className="action-label">{action.label}</div>
                    <div className="action-desc">{action.desc}</div>
                    <div className="action-arrow">↗</div>
                  </a>
                ))}
              </div>
            </>
          )}

        </div>
      </div>
      <style>{`@keyframes nbpulse { 0%,100%{opacity:1} 50%{opacity:0.8} }`}</style>
    </div>
  )
}