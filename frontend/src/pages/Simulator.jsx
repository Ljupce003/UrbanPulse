import {useMemo, useState} from 'react'

const API = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '')

const TRAFFIC_FIELDS = [
    {key: 'traffic_vol_median', label: 'TRAFFIC VOL MEDIAN', placeholder: '430'},
    {key: 'temp_avg_c', label: 'TEMP AVG °C', placeholder: '21.5'},
    {key: 'temp_min_c', label: 'TEMP MIN °C', placeholder: '16.2'},
    {key: 'temp_max_c', label: 'TEMP MAX °C', placeholder: '27.4'},
]

const POLLUTION_FIELDS = [
    {key: 'aqi', label: 'AQI', placeholder: '75'},
    {key: 'pm25', label: 'PM2.5', placeholder: '34.2'},
    {key: 'pm1', label: 'PM1', placeholder: '18.0'},
]

const ALL_FIELDS = [...TRAFFIC_FIELDS, ...POLLUTION_FIELDS]

const EMPTY_FORM = ALL_FIELDS.reduce((acc, item) => {
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

function formatNumber(value, digits = 2) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
    return Number(value).toFixed(digits)
}

function formatDelta(value, digits = 2) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
    const n = Number(value)
    const sign = n > 0 ? '+' : ''
    return `${sign}${n.toFixed(digits)}`
}

export default function Simulator() {
    const [mode, setMode] = useState('traffic2pollution')
    const [form, setForm] = useState(EMPTY_FORM)
    const [result, setResult] = useState(null)
    const [error, setError] = useState(null)
    const [loadingAction, setLoadingAction] = useState(false)
    const [loadingInit, setLoadingInit] = useState(false)
    const [initMessage, setInitMessage] = useState(null)

    const activeFields = mode === 'traffic2pollution' ? TRAFFIC_FIELDS : POLLUTION_FIELDS

    const payload = useMemo(() => {
        const out = {}
        for (const field of activeFields) {
            const value = toNumOrUndefined(form[field.key])
            if (value !== undefined) out[field.key] = value
        }
        return out
    }, [form, activeFields])

    const switchMode = (next) => {
        if (next === mode) return
        setMode(next)
        setResult(null)
        setError(null)
        setInitMessage(null)
    }

    const clearForm = () => {
        const next = {...form}
        for (const f of activeFields) next[f.key] = ''
        setForm(next)
    }

    const runSimulation = async () => {
        setLoadingAction(true)
        setError(null)
        setResult(null)
        setInitMessage(null)
        const path = mode === 'traffic2pollution'
            ? '/api/scenario-simulator/traffic-to-pollution'
            : '/api/scenario-simulator/pollution-to-temp'
        try {
            const res = await fetch(`${API}${path}`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload),
            })
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

    const reloadBaseline = async () => {
        setLoadingInit(true)
        setError(null)
        setInitMessage(null)
        try {
            const res = await fetch(`${API}/api/scenario-simulator/initialize-latest`, {method: 'POST'})
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
                else if (data && typeof data === 'object') msg = data.detail ? prettyJson(data.detail) : prettyJson(data)
                setError(msg)
                return
            }
            setInitMessage('Baseline reloaded from latest dataset row.')
        } catch (e) {
            setError(e.message || String(e))
        } finally {
            setLoadingInit(false)
        }
    }

    const renderTrafficResult = () => {
        const delta = Number(result?.delta_aqi)
        const deltaClass = !Number.isFinite(delta) || delta === 0
            ? '' : delta > 0 ? 'delta-up' : 'delta-down'
        return (
            <>
                <div className="stat-row">
                    <div className="stat-tile">
                        <div className="k">BASELINE AQI</div>
                        <div className="v">{formatNumber(result?.base_aqi, 1)}</div>
                    </div>
                    <div className="stat-tile">
                        <div className="k">PREDICTED AQI</div>
                        <div className="v">{formatNumber(result?.predicted_aqi, 1)}</div>
                    </div>
                    <div className={`stat-tile ${deltaClass}`}>
                        <div className="k">Δ AQI</div>
                        <div className="v">{formatDelta(result?.delta_aqi, 1)}</div>
                    </div>
                </div>
                <div className="inputs-used">
                    <div className="inputs-title">INPUTS USED</div>
                    <div className="chips">
                        <span className="chip">traffic_vol_median: {formatNumber(result?.inputs?.traffic_vol_median, 2)}</span>
                        <span className="chip">temp_avg_c: {formatNumber(result?.inputs?.temp_avg_c, 2)}</span>
                    </div>
                </div>
            </>
        )
    }

    const renderPollutionResult = () => {
        const delta = Number(result?.delta_temp)
        const deltaClass = !Number.isFinite(delta) || delta === 0
            ? '' : delta > 0 ? 'delta-up' : 'delta-down'
        return (
            <>
                <div className="stat-row">
                    <div className="stat-tile">
                        <div className="k">BASELINE TEMP °C</div>
                        <div className="v">{formatNumber(result?.base_temp_avg_c, 2)}</div>
                    </div>
                    <div className="stat-tile">
                        <div className="k">PREDICTED TEMP °C</div>
                        <div className="v">{formatNumber(result?.predicted_temp_avg_c, 2)}</div>
                    </div>
                    <div className={`stat-tile ${deltaClass}`}>
                        <div className="k">Δ TEMP</div>
                        <div className="v">{formatDelta(result?.delta_temp, 2)}</div>
                    </div>
                </div>
                <div className="inputs-used">
                    <div className="inputs-title">NEW AQI</div>
                    <div className="chips">
                        <span className="chip">aqi: {formatNumber(result?.new_aqi, 1)}</span>
                    </div>
                </div>
                <div className="inputs-used">
                    <div className="inputs-title">INPUTS USED</div>
                    <div className="chips">
                        <span className="chip">aqi: {formatNumber(result?.inputs?.aqi, 1)}</span>
                        <span className="chip">pm25: {formatNumber(result?.inputs?.pm25, 2)}</span>
                        <span className="chip">pm1: {formatNumber(result?.inputs?.pm1, 2)}</span>
                    </div>
                </div>
            </>
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
        input {
          width: 100%; border: 1px solid rgba(59,130,246,0.18); border-radius: 3px;
          background: rgba(2,6,23,0.7); color: #e2e8f0; padding: 9px 10px;
          font-size: 12px; outline: none;
        }
        .btn-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
        .btn {
          border: 1px solid #3b82f6; border-radius: 3px; padding: 9px 14px;
          background: transparent; color: #3b82f6; cursor: pointer;
          font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.12em;
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
        .info-chip {
          border: 1px solid rgba(110,231,183,0.3); background: rgba(110,231,183,0.08);
          color: #6ee7b7; border-radius: 3px; padding: 10px 12px;
          font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.05em;
          margin-bottom: 12px;
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
          margin-top: 14px; border: 1px solid rgba(59,130,246,0.12); border-radius: 3px;
          background: rgba(2,6,23,0.75); padding: 10px; color: #cbd5e1;
          font-family: 'Space Mono', monospace; font-size: 10px; line-height: 1.5;
          white-space: pre-wrap; max-height: 320px; overflow: auto;
        }
        .stat-row {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 4px;
        }
        .stat-tile {
          border: 1px solid rgba(59,130,246,0.18);
          background: rgba(2,6,23,0.55);
          border-radius: 3px; padding: 14px 12px;
          display: flex; flex-direction: column; gap: 6px;
          color: #e2e8f0;
        }
        .stat-tile .k {
          font-family: 'Space Mono', monospace; font-size: 9px; letter-spacing: 0.16em;
          color: rgba(148,163,184,0.7);
        }
        .stat-tile .v {
          font-family: 'Space Mono', monospace; font-size: 22px; font-weight: 700;
          letter-spacing: -0.01em;
        }
        .stat-tile.delta-up { border-color: rgba(239,68,68,0.4); }
        .stat-tile.delta-up .v { color: #fca5a5; }
        .stat-tile.delta-down { border-color: rgba(110,231,183,0.4); }
        .stat-tile.delta-down .v { color: #6ee7b7; }
        .inputs-used { margin-top: 14px; }
        .inputs-title {
          font-family: 'Space Mono', monospace; font-size: 9px; letter-spacing: 0.18em;
          color: rgba(148,163,184,0.7); margin-bottom: 8px;
        }
        .chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .chip {
          border: 1px solid rgba(59,130,246,0.18); border-radius: 3px; padding: 6px 10px;
          font-family: 'Space Mono', monospace; font-size: 10px;
          color: rgba(226,232,240,0.85); background: rgba(2,6,23,0.45);
        }
        @media (max-width: 980px) {
          .row { grid-template-columns: 1fr; }
          .fields-grid { grid-template-columns: 1fr; }
          .stat-row { grid-template-columns: 1fr; }
        }
      `}</style>

            <div className="an-page">
                <div className="an-grid"/>
                <div className="an-content">
                    <div className="an-eyebrow">SCENARIO SIMULATOR</div>
                    <h1 className="an-title">What-If Simulator</h1>
                    <p className="an-sub">Adjust drivers and see the projected impact on AQI or temperature versus the current baseline. Leave a field blank to use the latest measured value.</p>

                    <div className="row">
                        <div className="card">
                            <div className="card-title">INPUT</div>

                            <div className="tabs">
                                <button
                                    className={`tab ${mode === 'traffic2pollution' ? 'active' : ''}`}
                                    onClick={() => switchMode('traffic2pollution')}
                                >TRAFFIC → POLLUTION</button>
                                <button
                                    className={`tab ${mode === 'pollution2temp' ? 'active' : ''}`}
                                    onClick={() => switchMode('pollution2temp')}
                                >POLLUTION → TEMP</button>
                            </div>

                            <div className="fields-grid">
                                {activeFields.map((f) => (
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
                                <button className="btn btn-muted" onClick={clearForm} disabled={loadingAction}>CLEAR</button>
                                <button className="btn btn-muted" onClick={reloadBaseline} disabled={loadingAction || loadingInit}>
                                    {loadingInit ? 'RELOADING…' : 'RELOAD BASELINE'}
                                </button>
                                <button className="btn" onClick={runSimulation} disabled={loadingAction}>
                                    {loadingAction ? 'SIMULATING…' : 'RUN SIMULATION'}
                                </button>
                            </div>
                        </div>

                        <div className="card">
                            <div className="card-title">RESULTS</div>

                            {initMessage && <div className="info-chip">{initMessage}</div>}
                            {error && <div className="error">{error}</div>}
                            {loadingAction && <div className="meta-chip">Running simulation…</div>}

                            {!loadingAction && result && (
                                <>
                                    <div className="result-title">
                                        {mode === 'traffic2pollution'
                                            ? 'TRAFFIC + TEMPERATURE → AQI'
                                            : 'POLLUTION → TEMPERATURE'}
                                    </div>

                                    {mode === 'traffic2pollution' ? renderTrafficResult() : renderPollutionResult()}

                                    <div className="json">{prettyJson(result)}</div>
                                </>
                            )}

                            {!loadingAction && !result && !error && !initMessage && (
                                <div className="meta-chip">Run a simulation to see baseline vs predicted values.</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
