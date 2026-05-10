import {useEffect, useMemo, useRef, useState} from 'react'
import datasetUrl from '../imputed/imputed_dataset.csv?url'

const API = (import.meta.env.VITE_API_URL).replace(/\/+$/, '')

const CORE_FIELDS = [
    {key: 'aqi', label: 'AQI', placeholder: '75'},
    {key: 'pm25', label: 'PM2.5', placeholder: '34.2'},
    {key: 'pm1', label: 'PM1', placeholder: '18.0'},
    {key: 'temp_avg_c', label: 'Temp Avg C', placeholder: '21.5'},
    {key: 'temp_min_c', label: 'Temp Min C', placeholder: '16.2'},
    {key: 'temp_max_c', label: 'Temp Max C', placeholder: '27.4'},
    {key: 'precip_mm', label: 'Precip mm', placeholder: '0.0'},
    {key: 'wind_speed_kmh', label: 'Wind Speed km/h', placeholder: '8.6'},
    {key: 'pressure_hpa', label: 'Pressure hPa', placeholder: '1012.0'},
    {key: 'traffic_vol_median', label: 'Traffic Vol Median', placeholder: '430'},
    {key: 'traffic_intensity', label: 'Traffic Intensity [0-1]', placeholder: '0.62'},
    {key: 'hour_of_day', label: 'Hour (0-23)', placeholder: '9'},
    {key: 'day_of_week', label: 'Day Of Week (0-6)', placeholder: '2'},
    {key: 'month', label: 'Month (1-12)', placeholder: '5'},
    {key: 'is_rush_hour', label: 'Rush Hour (0/1)', placeholder: '1'},
    {key: 'is_weekday', label: 'Weekday (0/1)', placeholder: '1'},
]

const EMPTY_FORM = CORE_FIELDS.reduce((acc, item) => {
    acc[item.key] = ''
    return acc
}, {})

function prettyJson(value) {
    try {
        return JSON.stringify(value, null, 2)
    } catch {
        return String(value)
    }
}

function toNumOrUndefined(value) {
    if (value === '' || value === null || value === undefined) return undefined
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
}

// ─── Pollution Cause Analyzer ────────────────────────────────────────────────

function PollutionAnalyzer() {
    const [tab, setTab] = useState('analyze')
    const [form, setForm] = useState(EMPTY_FORM)
    const [stats, setStats] = useState(null)
    const [health, setHealth] = useState(null)
    const [loadingMeta, setLoadingMeta] = useState(true)
    const [loadingAction, setLoadingAction] = useState(false)
    const [error, setError] = useState(null)
    const [result, setResult] = useState(null)
    const [resultLabel, setResultLabel] = useState('')
    const [batchText, setBatchText] = useState('[\n  {\n    "aqi": 75,\n    "pm25": 34.2,\n    "pm1": 18.0,\n    "temp_avg_c": 21.5,\n    "traffic_vol_median": 430\n  }\n]')
    const [topN, setTopN] = useState(10)

    const payload = useMemo(() => {
        const out = {}
        for (const field of CORE_FIELDS) {
            const value = toNumOrUndefined(form[field.key])
            if (value !== undefined) out[field.key] = value
        }
        return out
    }, [form])

    useEffect(() => {
        let cancelled = false
        const loadMeta = async () => {
            setLoadingMeta(true)
            try {
                const [healthRes, statsRes] = await Promise.all([
                    fetch(`${API}/api/analyzer/cause/health`),
                    fetch(`${API}/api/analyzer/cause/features/stats`),
                ])
                const healthJson = await healthRes.json().catch(() => null)
                const statsJson = await statsRes.json().catch(() => null)
                if (!cancelled) {
                    if (healthRes.ok) setHealth(healthJson)
                    else setHealth({status: 'error', detail: healthJson?.detail || `HTTP ${healthRes.status}`})
                    if (statsRes.ok) setStats(statsJson)
                    else setStats(null)
                }
            } catch (e) {
                if (!cancelled) setHealth({status: 'error', detail: e.message})
            } finally {
                if (!cancelled) setLoadingMeta(false)
            }
        }
        loadMeta()
        return () => { cancelled = true }
    }, [])

    const applyDefaults = async () => {
        try {
            const res = await fetch(datasetUrl)
            if (!res.ok) throw new Error()
            const text = await res.text()
            const lines = text.trim().split('\n').filter(Boolean)
            if (lines.length < 2) throw new Error()
            const headers = lines[0].split(',').map(h => h.trim())
            const lastRow = lines[lines.length - 1].split(',')
            const next = {...form}
            for (const field of CORE_FIELDS) {
                const idx = headers.indexOf(field.key)
                if (idx === -1) continue
                const val = lastRow[idx]?.trim()
                if (val !== undefined && val !== '' && Number.isFinite(Number(val))) {
                    next[field.key] = val
                }
            }
            setForm(next)
        } catch {
            setError("⚠ Can't load defaults — import the processed dataset first!")
        }
    }

    const runRequest = async (url, options, label) => {
        setLoadingAction(true)
        setError(null)
        setResult(null)
        setResultLabel(label)
        try {
            const res = await fetch(url, options)
            const text = await res.text()
            let data = text
            try { data = JSON.parse(text) } catch {}
            if (!res.ok) {
                let msg = `HTTP ${res.status}`
                if (typeof data === 'string') msg = data
                else if (Array.isArray(data)) msg = data.map((x) => x.msg || x.detail || JSON.stringify(x)).join('; ')
                else if (data && typeof data === 'object') msg = data.detail ? prettyJson(data.detail) : prettyJson(data)
                setError(msg)
                return
            }
            setResult(data)
        } catch (e) {
            setError(e.message || String(e))
        } finally {
            setLoadingAction(false)
        }
    }

    const runAnalyze = () => runRequest(`${API}/api/analyzer/cause`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}, 'Full SHAP Analysis')
    const runPredict = () => runRequest(`${API}/api/analyzer/cause/predict`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}, 'Fast AQI Prediction')

    const parseBatchRecords = () => {
        const parsed = JSON.parse(batchText)
        if (Array.isArray(parsed)) return {records: parsed}
        if (parsed && Array.isArray(parsed.records)) return {records: parsed.records}
        throw new Error('Batch input must be a JSON array or {"records": [...]}')
    }

    const runBatchPredict = async () => {
        let body
        try { body = parseBatchRecords() } catch (e) { setError(e.message); return }
        await runRequest(`${API}/api/analyzer/cause/predict/batch`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}, 'Batch Prediction')
    }

    const runTopContributors = async () => {
        let body
        try { body = parseBatchRecords() } catch (e) { setError(e.message); return }
        await runRequest(`${API}/api/analyzer/cause/top-contributors?top_n=${encodeURIComponent(topN)}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}, 'Top Contributors')
    }

    return (
        <div className="section-content">
            <div className="section-header">
                <div className="an-eyebrow">AIR INTELLIGENCE</div>
                <h2 className="section-title">Pollution Cause Analyzer</h2>
                <p className="an-sub">Run fast AQI prediction, full SHAP explanation, batch scoring, and top contributor ranking.</p>
            </div>
            <div className="row">
                <div className="card">
                    <div className="card-title">INPUT</div>
                    <div className="tabs">
                        {['analyze','predict','batch','contributors'].map(t => (
                            <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                                {t === 'contributors' ? 'TOP CONTRIBUTORS' : t.toUpperCase()}
                            </button>
                        ))}
                    </div>
                    {(tab === 'analyze' || tab === 'predict') && (
                        <>
                            <div className="fields-grid">
                                {CORE_FIELDS.map((f) => (
                                    <div key={f.key} className="group">
                                        <label className="label">{f.label}</label>
                                        <input type="number" step="any" value={form[f.key]} placeholder={f.placeholder}
                                            onChange={(e) => setForm((prev) => ({...prev, [f.key]: e.target.value}))}/>
                                    </div>
                                ))}
                            </div>
                            <div className="btn-row">
                                <button className="btn btn-muted" onClick={() => setForm(EMPTY_FORM)} disabled={loadingAction}>CLEAR</button>
                                <button className="btn btn-muted" onClick={applyDefaults} disabled={loadingAction || loadingMeta}>LOAD DEFAULTS</button>
                                {tab === 'analyze'
                                    ? <button className="btn" onClick={runAnalyze} disabled={loadingAction}>RUN SHAP ANALYSIS</button>
                                    : <button className="btn" onClick={runPredict} disabled={loadingAction}>RUN FAST PREDICT</button>}
                            </div>
                        </>
                    )}
                    {(tab === 'batch' || tab === 'contributors') && (
                        <>
                            <div className="group">
                                <label className="label">RECORDS JSON</label>
                                <textarea value={batchText} onChange={(e) => setBatchText(e.target.value)}/>
                            </div>
                            {tab === 'contributors' && (
                                <div className="group" style={{maxWidth:180,marginTop:10}}>
                                    <label className="label">TOP N</label>
                                    <input type="number" min="1" max="50" value={topN}
                                        onChange={(e) => setTopN(Math.max(1, Math.min(50, Number(e.target.value || 10))))}/>
                                </div>
                            )}
                            <div className="btn-row">
                                {tab === 'batch'
                                    ? <button className="btn" onClick={runBatchPredict} disabled={loadingAction}>RUN BATCH PREDICT</button>
                                    : <button className="btn" onClick={runTopContributors} disabled={loadingAction}>RUN TOP CONTRIBUTORS</button>}
                            </div>
                        </>
                    )}
                </div>

                <div className="card">
                    <div className="card-title">RESULTS</div>
                    {loadingMeta ? (
                        <div className="meta-chip">Loading analyzer metadata...</div>
                    ) : (
                        <>
                            <div className="meta-chip">Health: {health?.status || 'unknown'}{health?.model_name ? ` | Model: ${health.model_name}` : ''}</div>
                            <div className="meta-chip">Feature stats: {stats ? 'available' : 'unavailable'}</div>
                        </>
                    )}
                    {error && <div className="error">{error}</div>}
                    {loadingAction && <div className="meta-chip">Running request...</div>}
                    {!loadingAction && result && (
                        <>
                            <div className="result-title">{resultLabel.toUpperCase()}</div>
                            {result?.predicted_aqi !== undefined && (
                                <div className="list">
                                    <div className="item">
                                        Predicted AQI: <strong>{Number(result.predicted_aqi).toFixed(2)}</strong><br/>
                                        <small>Category: {result?.aqi_category?.category || prettyJson(result?.aqi_category)}</small>
                                    </div>
                                </div>
                            )}
                            {Array.isArray(result?.contributions) && (
                                <div className="list">
                                    {result.contributions.slice(0, 12).map((c, idx) => (
                                        <div className="item" key={`${c.factor}-${idx}`}>
                                            #{idx + 1} {c.display || c.factor}<br/>
                                            <small>pct={c.pct} | shap={c.shap_value} | dir={c.direction}</small>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {Array.isArray(result?.predictions) && (
                                <div className="list">
                                    {result.predictions.map((p, idx) => (
                                        <div className="item" key={`p-${idx}`}>
                                            Record {idx + 1}: AQI {Number(p.predicted_aqi).toFixed(2)}<br/>
                                            <small>{p?.aqi_category?.category || prettyJson(p?.aqi_category)}</small>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {Array.isArray(result) && (
                                <div className="list">
                                    {result.map((r, idx) => (
                                        <div className="item" key={`r-${idx}`}>
                                            #{r.rank || idx + 1} {r.display || r.factor}<br/>
                                            <small>avg_pct={r.avg_pct} | avg_shap={r.avg_shap} | dir={r.dominant_direction}</small>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

// ─── Traffic Prediction ───────────────────────────────────────────────────────

const TRAFFIC_LEVEL_META = {
    low:       {color: '#6ee7b7', label: 'LOW'},
    medium:    {color: '#fcd34d', label: 'MEDIUM'},
    high:      {color: '#fb923c', label: 'HIGH'},
    very_high: {color: '#f87171', label: 'VERY HIGH'},
}

function TrafficGauge({value}) {
    // value is 0-10
    const pct = Math.min(Math.max(value / 10, 0), 1)
    const r = 54
    const circ = 2 * Math.PI * r
    const dashOffset = circ * (1 - pct * 0.75) // 270deg arc
    const color = value < 2.5 ? '#6ee7b7' : value < 5 ? '#fcd34d' : value < 7.5 ? '#fb923c' : '#f87171'
    return (
        <svg viewBox="0 0 140 100" style={{width:'100%',maxWidth:200,display:'block',margin:'0 auto'}}>
            {/* track */}
            <circle cx="70" cy="75" r={r} fill="none" stroke="rgba(59,130,246,0.1)"
                strokeWidth="10" strokeDasharray={`${circ * 0.75} ${circ}`}
                strokeDashoffset={circ * 0.125} strokeLinecap="round"
                transform="rotate(-135 70 75)"/>
            {/* fill */}
            <circle cx="70" cy="75" r={r} fill="none" stroke={color}
                strokeWidth="10" strokeDasharray={`${circ * 0.75} ${circ}`}
                strokeDashoffset={dashOffset} strokeLinecap="round"
                transform="rotate(-135 70 75)"
                style={{transition:'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1), stroke 0.4s'}}/>
            <text x="70" y="70" textAnchor="middle" fill={color}
                style={{fontFamily:"'Space Mono',monospace",fontSize:20,fontWeight:700}}>
                {value.toFixed(1)}
            </text>
            <text x="70" y="84" textAnchor="middle" fill="rgba(148,163,184,0.6)"
                style={{fontFamily:"'Space Mono',monospace",fontSize:7,letterSpacing:'0.1em'}}>
                OUT OF 10
            </text>
        </svg>
    )
}

function WeatherGrid({weather}) {
    const items = [
        {label:'CONDITION',  value: weather.condition},
        {label:'TEMP',       value: `${weather.temp_c}°C`},
        {label:'HUMIDITY',   value: `${weather.humidity}%`},
        {label:'WIND',       value: `${weather.wind_speed_kmh} km/h`},
        {label:'PRESSURE',   value: `${weather.pressure_hpa} hPa`},
        {label:'SOURCE',     value: weather.source},
    ]
    return (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:10}}>
            {items.map(({label,value}) => (
                <div key={label} className="item" style={{padding:'8px 10px'}}>
                    <div className="label" style={{marginBottom:2}}>{label}</div>
                    <div style={{color:'#e2e8f0',fontSize:12,fontFamily:"'Space Mono',monospace"}}>{value}</div>
                </div>
            ))}
        </div>
    )
}

function TrafficPrediction() {
    const [city, setCity]               = useState('Skopje')
    const [countryCode, setCountryCode] = useState('MK')
    const [lat, setLat]                 = useState('')
    const [lon, setLon]                 = useState('')
    const [loading, setLoading]         = useState(false)
    const [error, setError]             = useState(null)
    const [result, setResult]           = useState(null)

    const run = async () => {
        setLoading(true)
        setError(null)
        setResult(null)
        try {
            const params = new URLSearchParams()
            if (city)        params.set('city', city)
            if (countryCode) params.set('country_code', countryCode)
            if (lat !== '')  params.set('lat', lat)
            if (lon !== '')  params.set('lon', lon)

            const res = await fetch(`${API}/api/traffic-prediction/predict-next-hour?${params}`)
            const text = await res.text()
            let data
            try { data = JSON.parse(text) } catch { data = text }
            if (!res.ok) {
                const msg = (data && typeof data === 'object')
                    ? (data.detail ? prettyJson(data.detail) : prettyJson(data))
                    : String(data)
                setError(msg)
                return
            }
            setResult(data)
        } catch (e) {
            setError(e.message || String(e))
        } finally {
            setLoading(false)
        }
    }

    const level = result ? TRAFFIC_LEVEL_META[result.traffic_level] || {color:'#94a3b8',label: result.traffic_level?.toUpperCase()} : null

    return (
        <div className="section-content">
            <div className="section-header">
                <div className="an-eyebrow" style={{color:'#38bdf8'}}><span style={{background:'#38bdf8',opacity:0.6,width:24,height:1,display:'inline-block',verticalAlign:'middle',marginRight:8}}/>TRAFFIC INTELLIGENCE</div>
                <h2 className="section-title">Next-Hour Traffic Forecast</h2>
                <p className="an-sub">Predict traffic volume for the next hour using real-time weather and historical patterns.</p>
            </div>
            <div className="row">
                {/* Input */}
                <div className="card">
                    <div className="card-title">LOCATION</div>
                    <div className="fields-grid" style={{gridTemplateColumns:'1fr 1fr'}}>
                        <div className="group">
                            <label className="label">CITY</label>
                            <input value={city} onChange={e => setCity(e.target.value)} placeholder="Skopje"/>
                        </div>
                        <div className="group">
                            <label className="label">COUNTRY CODE</label>
                            <input value={countryCode} onChange={e => setCountryCode(e.target.value)} placeholder="MK" style={{textTransform:'uppercase'}}/>
                        </div>
                        <div className="group">
                            <label className="label">LAT (OPTIONAL)</label>
                            <input type="number" step="any" value={lat} onChange={e => setLat(e.target.value)} placeholder="41.9981"/>
                        </div>
                        <div className="group">
                            <label className="label">LON (OPTIONAL)</label>
                            <input type="number" step="any" value={lon} onChange={e => setLon(e.target.value)} placeholder="21.4254"/>
                        </div>
                    </div>

                    <div className="card-title" style={{marginTop:20}}>MODEL INFO</div>
                    <div style={{color:'rgba(148,163,184,0.7)',fontSize:11,lineHeight:1.6,fontFamily:"'Space Mono',monospace"}}>
                        Prediction uses the latest historical row as a base, merged with current weather from OpenWeather and the dataset's median traffic volume. The result is normalized to a 0–10 scale.
                    </div>

                    <div className="btn-row">
                        <button className="btn" style={{borderColor:'#38bdf8',color:'#38bdf8'}}
                            onClick={run} disabled={loading}>
                            {loading ? 'PREDICTING...' : 'PREDICT NEXT HOUR'}
                        </button>
                    </div>
                </div>

                {/* Results */}
                <div className="card">
                    <div className="card-title">FORECAST</div>

                    {error && <div className="error">{error}</div>}
                    {loading && <div className="meta-chip">Fetching weather + running model...</div>}

                    {!loading && !result && !error && (
                        <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                            height:200,gap:12,opacity:0.35}}>
                            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                                <circle cx="20" cy="20" r="18" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="4 3"/>
                                <path d="M12 28 L20 12 L28 28" stroke="#38bdf8" strokeWidth="1.5" strokeLinejoin="round"/>
                                <line x1="14" y1="24" x2="26" y2="24" stroke="#38bdf8" strokeWidth="1.5"/>
                            </svg>
                            <span style={{fontFamily:"'Space Mono',monospace",fontSize:9,letterSpacing:'0.15em',color:'#38bdf8'}}>
                                AWAITING PREDICTION
                            </span>
                        </div>
                    )}

                    {!loading && result && (
                        <>
                            {/* Main score */}
                            <div style={{display:'flex',alignItems:'center',gap:20,marginBottom:16}}>
                                <div style={{flex:'0 0 160px'}}>
                                    <TrafficGauge value={result.predicted_traffic_volume}/>
                                </div>
                                <div style={{flex:1}}>
                                    <div className="label" style={{marginBottom:6}}>TRAFFIC LEVEL</div>
                                    <div style={{
                                        fontFamily:"'Space Mono',monospace",fontSize:18,fontWeight:700,
                                        color: level?.color || '#94a3b8',
                                        letterSpacing:'0.05em',marginBottom:10,
                                    }}>
                                        {level?.label || result.traffic_level}
                                    </div>
                                    <div style={{display:'grid',gap:6}}>
                                        <div className="item" style={{padding:'6px 10px'}}>
                                            <span className="label">TRAFFIC MEDIAN</span>
                                            <span style={{float:'right',fontFamily:"'Space Mono',monospace",fontSize:11,color:'#e2e8f0'}}>
                                                {result.traffic_vol_median}
                                            </span>
                                        </div>
                                        <div className="item" style={{padding:'6px 10px'}}>
                                            <span className="label">MODEL RMSE</span>
                                            <span style={{float:'right',fontFamily:"'Space Mono',monospace",fontSize:11,color:'#e2e8f0'}}>
                                                {result.rmse}
                                            </span>
                                        </div>
                                        <div className="item" style={{padding:'6px 10px'}}>
                                            <span className="label">R²</span>
                                            <span style={{float:'right',fontFamily:"'Space Mono',monospace",fontSize:11,color:'#e2e8f0'}}>
                                                {result.r2}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Weather block */}
                            {result.weather && (
                                <>
                                    <div className="card-title" style={{marginTop:8}}>CURRENT WEATHER — {result.weather.location?.split("city='")[1]?.split("'")[0] || city}</div>
                                    <WeatherGrid weather={result.weather}/>
                                </>
                            )}

                            {result.message && (
                                <div style={{
                                    marginTop:12,padding:'8px 10px',
                                    border:'1px solid rgba(56,189,248,0.15)',
                                    borderRadius:3,fontFamily:"'Space Mono',monospace",
                                    fontSize:9,letterSpacing:'0.1em',
                                    color:'rgba(148,163,184,0.6)',
                                }}>
                                    {result.message.toUpperCase()}
                                </div>
                            )}

                            {/*<div className="json" style={{marginTop:12}}>{prettyJson(result)}</div>*/}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

// ─── Shell with sliding tabs ──────────────────────────────────────────────────

const PAGES = [
    {id: 'pollution', label: 'POLLUTION ANALYZER', accent: '#3b82f6'},
    {id: 'traffic',   label: 'TRAFFIC FORECAST',   accent: '#38bdf8'},
]

export default function Analyzer() {
    const [activePage, setActivePage] = useState('pollution')
    const [sliding, setSliding] = useState(false)
    const [direction, setDirection] = useState(1) // 1 = left, -1 = right
    const [displayed, setDisplayed] = useState('pollution')
    const timerRef = useRef(null)

    const switchTo = (id) => {
        if (id === activePage || sliding) return
        const fromIdx = PAGES.findIndex(p => p.id === activePage)
        const toIdx   = PAGES.findIndex(p => p.id === id)
        setDirection(toIdx > fromIdx ? 1 : -1)
        setSliding(true)
        timerRef.current = setTimeout(() => {
            setDisplayed(id)
            setActivePage(id)
            setSliding(false)
        }, 320)
    }

    useEffect(() => () => clearTimeout(timerRef.current), [])

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; overflow-x: hidden !important; }

        .an-page {
          min-height: 100vh; background: #080c14; padding: 0 0 60px;
          font-family: 'DM Sans', sans-serif; position: relative;
        }
        .an-grid {
          position: absolute; inset: 0; pointer-events: none; opacity: 0.04;
          background-image:
            linear-gradient(rgba(59,130,246,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,130,246,0.5) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .an-content { position: relative; z-index: 1; max-width: 1100px; margin: 0 auto; padding: 0 32px; }

        /* ── Page switcher bar ── */
        .page-switcher {
          display: flex; align-items: stretch; border-bottom: 1px solid rgba(59,130,246,0.12);
          background: rgba(4,8,16,0.85); backdrop-filter: blur(12px);
          z-index: 100; padding: 0 32px;
          max-width: 100%;
          padding-top: 50px
        }
        .page-tab {
          flex: 1; padding: 22px 0 18px;
          font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.2em;
          background: transparent; border: none; cursor: pointer;
          color: rgba(148,163,184,0.45); position: relative; transition: color 0.2s;
          display: flex; flex-direction: column; align-items: center; gap: 6px;
        }
        .page-tab.active { color: var(--tab-accent, #3b82f6); }
        .page-tab::after {
          content: ''; position: absolute; bottom: 0; left: 10%; right: 10%; height: 2px;
          background: var(--tab-accent, #3b82f6); transform: scaleX(0);
          transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
          border-radius: 2px 2px 0 0;
        }
        .page-tab.active::after { transform: scaleX(1); }
        .page-tab-dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: var(--tab-accent); opacity: 0;
          transition: opacity 0.2s;
        }
        .page-tab.active .page-tab-dot { opacity: 1; }

        /* ── Slide viewport ── */
        .slide-viewport { overflow: hidden; }
        .slide-track {
          display: flex; transition: transform 0.32s cubic-bezier(0.4,0,0.2,1);
        }
        .slide-track.sliding-left  { transform: translateX(-4%); opacity: 0; }
        .slide-track.sliding-right { transform: translateX(4%);  opacity: 0; }
        .slide-track { transition: transform 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.32s; }

        /* ── Section ── */
        .section-content { padding-top: 52px; }
        .section-header { margin-bottom: 28px; }
        .an-eyebrow {
          font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.25em;
          color: #3b82f6; margin: 0 0 12px; display: flex; align-items: center; gap: 8px;
        }
        .an-eyebrow::before { content: ''; width: 24px; height: 1px; background: currentColor; opacity: 0.6; }
        .section-title {
          font-family: 'Space Mono', monospace; font-size: 28px; font-weight: 700;
          color: #f0f4ff; letter-spacing: -0.03em; margin: 0 0 8px;
        }
        .an-sub { color: rgba(148,163,184,0.7); margin: 0 0 24px; }

        /* ── Shared components ── */
        .row { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
        .card {
          background: rgba(10,16,28,0.7); border: 1px solid rgba(59,130,246,0.12);
          border-radius: 4px; padding: 22px;
        }
        .card-title {
          font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.2em;
          color: rgba(148,163,184,0.75); margin-bottom: 14px;
        }
        .tabs { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
        .tab {
          border: 1px solid rgba(59,130,246,0.2); color: rgba(148,163,184,0.9);
          background: transparent; border-radius: 3px; padding: 8px 12px;
          font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.1em; cursor: pointer;
          transition: all 0.15s;
        }
        .tab.active { border-color: #3b82f6; color: #3b82f6; background: rgba(59,130,246,0.1); }
        .fields-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
        .group { display: flex; flex-direction: column; gap: 6px; }
        .label {
          font-family: 'Space Mono', monospace; font-size: 9px; letter-spacing: 0.12em;
          color: rgba(148,163,184,0.7);
        }
        input, textarea {
          width: 100%; border: 1px solid rgba(59,130,246,0.18); border-radius: 3px;
          background: rgba(2,6,23,0.7); color: #e2e8f0; padding: 9px 10px;
          font-size: 12px; outline: none; transition: border-color 0.15s;
          font-family: inherit;
        }
        input:focus, textarea:focus { border-color: rgba(59,130,246,0.5); }
        textarea { min-height: 180px; resize: vertical; font-family: 'Space Mono', monospace; }
        .btn-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
        .btn {
          border: 1px solid #3b82f6; border-radius: 3px; padding: 9px 14px;
          background: transparent; color: #3b82f6; cursor: pointer;
          font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.12em;
          transition: all 0.15s;
        }
        .btn:hover:not(:disabled) { background: #3b82f6; color: #080c14; }
        .btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .btn-muted { border-color: rgba(148,163,184,0.35); color: rgba(148,163,184,0.9); }
        .btn-muted:hover:not(:disabled) { background: rgba(148,163,184,0.15); color: #e2e8f0; }
        .meta-chip {
          border: 1px solid rgba(59,130,246,0.18); border-radius: 3px; padding: 10px 12px;
          font-family: 'Space Mono', monospace; font-size: 10px; color: rgba(148,163,184,0.9);
          margin-bottom: 10px;
        }
        .error {
          border: 1px solid rgba(239,68,68,0.3); background: rgba(239,68,68,0.08);
          color: #fca5a5; border-radius: 3px; padding: 10px 12px;
          font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.05em;
          margin-bottom: 12px;
        }
        .result-title {
          font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.16em;
          color: #6ee7b7; margin-bottom: 10px;
        }
        .json {
          margin-top: 10px; border: 1px solid rgba(59,130,246,0.12); border-radius: 3px;
          background: rgba(2,6,23,0.75); padding: 10px; color: #cbd5e1;
          font-family: 'Space Mono', monospace; font-size: 10px; line-height: 1.5;
          white-space: pre-wrap; max-height: 360px; overflow: auto;
        }
        .list { display: grid; gap: 8px; margin-top: 10px; }
        .item {
          border: 1px solid rgba(59,130,246,0.12); border-radius: 3px; padding: 9px 10px;
          color: rgba(226,232,240,0.92); font-size: 12px; background: rgba(2,6,23,0.45);
        }
        .item small { color: rgba(148,163,184,0.75); font-family: 'Space Mono', monospace; font-size: 10px; }
        @media (max-width: 980px) {
          .row { grid-template-columns: 1fr; }
          .fields-grid { grid-template-columns: 1fr; }
          .page-switcher { padding: 0 16px; }
          .an-content { padding: 0 16px; }
        }
      `}</style>

            <div className="an-page">
                <div className="an-grid"/>

                {/* Sticky tab switcher */}
                <div className="page-switcher">
                    {PAGES.map(p => (
                        <button
                            key={p.id}
                            className={`page-tab ${activePage === p.id ? 'active' : ''}`}
                            style={{'--tab-accent': p.accent}}
                            onClick={() => switchTo(p.id)}
                        >
                            <span className="page-tab-dot" style={{background: p.accent}}/>
                            {p.label}
                        </button>
                    ))}
                </div>

                {/* Sliding content */}
                <div className="slide-viewport">
                    <div className={`slide-track ${sliding ? (direction > 0 ? 'sliding-left' : 'sliding-right') : ''}`}>
                        <div className="an-content" style={{width:'100%',flex:'0 0 100%'}}>
                            {displayed === 'pollution' ? <PollutionAnalyzer/> : <TrafficPrediction/>}
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}