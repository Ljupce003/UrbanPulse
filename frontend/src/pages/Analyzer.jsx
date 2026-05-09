import {useEffect, useMemo, useState} from 'react'
import datasetUrl from '../imputed/imputed_dataset.csv?url'

const API = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '')

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

export default function Analyzer() {
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
        return () => {
            cancelled = true
        }
    }, [])

const applyDefaults = async () => {
    try {
        const res = await fetch(datasetUrl)
        if (!res.ok) throw new Error()
        const text = await res.text()
        console.log(text)
        const lines = text.trim().split('\n').filter(Boolean)
        if (lines.length < 2) throw new Error()
        const headers = lines[0].split(',').map(h => h.trim())
        const lastRow = lines[lines.length - 1].split(',')
        const next = { ...form }
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
        setError("⚠ Can't load defaults — import the processed dataset first! (data/processed/imputed_dataset.csv not found)")
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
            try {
                data = JSON.parse(text)
            } catch {
                // keep raw text
            }

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

    const runAnalyze = async () => {
        await runRequest(
            `${API}/api/analyzer/cause`,
            {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload),
            },
            'Full SHAP Analysis',
        )
    }

    const runPredict = async () => {
        await runRequest(
            `${API}/api/analyzer/cause/predict`,
            {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload),
            },
            'Fast AQI Prediction',
        )
    }

    const parseBatchRecords = () => {
        const parsed = JSON.parse(batchText)
        if (Array.isArray(parsed)) return {records: parsed}
        if (parsed && Array.isArray(parsed.records)) return {records: parsed.records}
        throw new Error('Batch input must be a JSON array of records or {"records": [...]}')
    }

    const runBatchPredict = async () => {
        let body
        try {
            body = parseBatchRecords()
        } catch (e) {
            setError(e.message)
            return
        }
        await runRequest(
            `${API}/api/analyzer/cause/predict/batch`,
            {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body),
            },
            'Batch Prediction',
        )
    }

    const runTopContributors = async () => {
        let body
        try {
            body = parseBatchRecords()
        } catch (e) {
            setError(e.message)
            return
        }
        await runRequest(
            `${API}/api/analyzer/cause/top-contributors?top_n=${encodeURIComponent(topN)}`,
            {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body),
            },
            'Top Contributors',
        )
    }

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; overflow-x: hidden !important; }
        .an-page {
          min-height: 100vh; background: #080c14; padding: 80px 0 60px;
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
        .an-eyebrow {
          font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.25em;
          color: #3b82f6; margin: 8px 0 12px; display: flex; align-items: center; gap: 8px;
        }
        .an-eyebrow::before { content: ''; width: 24px; height: 1px; background: #3b82f6; opacity: 0.6; }
        .an-title {
          font-family: 'Space Mono', monospace; font-size: 32px; font-weight: 700;
          color: #f0f4ff; letter-spacing: -0.03em; margin-bottom: 8px;
        }
        .an-sub { color: rgba(148,163,184,0.7); margin-bottom: 24px; }
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
          font-size: 12px; outline: none;
        }
        textarea { min-height: 180px; resize: vertical; font-family: 'Space Mono', monospace; }
        .btn-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
        .btn {
          border: 1px solid #3b82f6; border-radius: 3px; padding: 9px 14px;
          background: transparent; color: #3b82f6; cursor: pointer;
          font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.12em;
        }
        .btn:hover:not(:disabled) { background: #3b82f6; color: #080c14; }
        .btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .btn-muted { border-color: rgba(148,163,184,0.35); color: rgba(148,163,184,0.9); }
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
        }
      `}</style>

            <div className="an-page">
                <div className="an-grid"/>
                <div className="an-content">
                    <div className="an-eyebrow">AIR INTELLIGENCE</div>
                    <h1 className="an-title">Pollution Cause Analyzer</h1>
                    <p className="an-sub">Run fast AQI prediction, full SHAP explanation, batch scoring, and top contributor ranking.</p>

                    <div className="row">
                        <div className="card">
                            <div className="card-title">INPUT</div>

                            <div className="tabs">
                                <button className={`tab ${tab === 'analyze' ? 'active' : ''}`} onClick={() => setTab('analyze')}>ANALYZE</button>
                                <button className={`tab ${tab === 'predict' ? 'active' : ''}`} onClick={() => setTab('predict')}>PREDICT</button>
                                <button className={`tab ${tab === 'batch' ? 'active' : ''}`} onClick={() => setTab('batch')}>BATCH</button>
                                <button className={`tab ${tab === 'contributors' ? 'active' : ''}`} onClick={() => setTab('contributors')}>TOP CONTRIBUTORS</button>
                            </div>

                            {(tab === 'analyze' || tab === 'predict') && (
                                <>
                                    <div className="fields-grid">
                                        {CORE_FIELDS.map((f) => (
                                            <div key={f.key} className="group">
                                                <label className="label">{f.label}</label>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    value={form[f.key]}
                                                    placeholder={f.placeholder}
                                                    onChange={(e) => setForm((prev) => ({...prev, [f.key]: e.target.value}))}
                                                />
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
                                        <label className="label">RECORDS JSON (ARRAY OR {`{"records": [...]}`})</label>
                                        <textarea value={batchText} onChange={(e) => setBatchText(e.target.value)}/>
                                    </div>
                                    {tab === 'contributors' && (
                                        <div className="group" style={{maxWidth: 180, marginTop: 10}}>
                                            <label className="label">TOP N</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="50"
                                                value={topN}
                                                onChange={(e) => setTopN(Math.max(1, Math.min(50, Number(e.target.value || 10))))}
                                            />
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
                                                    Record {idx + 1}: AQI {Number(p.predicted_aqi).toFixed(2)}
                                                    <br/>
                                                    <small>{p?.aqi_category?.category || prettyJson(p?.aqi_category)}</small>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {Array.isArray(result) && (
                                        <div className="list">
                                            {result.map((r, idx) => (
                                                <div className="item" key={`r-${idx}`}>
                                                    #{r.rank || idx + 1} {r.display || r.factor}
                                                    <br/>
                                                    <small>avg_pct={r.avg_pct} | avg_shap={r.avg_shap} | dir={r.dominant_direction}</small>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="json">{prettyJson(result)}</div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}