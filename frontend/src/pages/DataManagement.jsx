import {useState, useRef, useCallback} from 'react'
import {useAuth} from '../context/AuthContext'

const DATASET_TYPES = [
    {value: 'traffic', label: 'Traffic', desc: 'vehicle_count, speed_kmh, timestamp'},
    {value: 'weather', label: 'Weather', desc: 'temp, humidity, pressure, timestamp'},
    {value: 'pollution', label: 'Pollution', desc: 'aqi_index, pm2_5, pm10, timestamp'},
]

const REQUIRED_FIELDS = {
    traffic: ['timestamp', 'vehicle_count'],
    weather: ['timestamp', 'temp'],
    pollution: ['timestamp', 'aqi_index'],
}

const ALL_FIELDS = {
    traffic: ['timestamp', 'vehicle_count', 'speed_kmh', 'city', 'country_code', 'source'],
    weather: ['timestamp', 'temp', 'humidity', 'pressure', 'wind_speed', 'description', 'city', 'country_code', 'source'],
    pollution: ['timestamp', 'aqi_index', 'pm2_5', 'pm10', 'o3', 'no2', 'so2', 'co', 'city', 'country_code', 'source'],
}

function parseCSV(text) {
    const lines = text.trim().split('\n').filter(Boolean)
    if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row')
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
    const rows = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
        const obj = {}
        headers.forEach((h, i) => {
            obj[h] = vals[i] ?? ''
        })
        return obj
    })
    return {headers, rows}
}

function Steps({current}) {
    const steps = ['TYPE', 'UPLOAD', 'MAP', 'VALIDATE', 'CONFIRM']
    return (
        <div style={{display: 'flex', alignItems: 'center', marginBottom: 40}}>
            {steps.map((s, i) => {
                const done = i < current
                const active = i === current
                const color = done ? '#10b981' : active ? '#3b82f6' : 'rgba(100,116,139,0.3)'
                return (
                    <div key={s}
                         style={{display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none'}}>
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 6,
                            flexShrink: 0
                        }}>
                            <div style={{
                                width: 28, height: 28, borderRadius: '50%',
                                border: `2px solid ${color}`,
                                background: done ? '#10b981' : active ? 'rgba(59,130,246,0.15)' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontFamily: "'Space Mono', monospace", fontSize: 10,
                                color: done ? '#080c14' : color, fontWeight: 700,
                            }}>
                                {done ? '✓' : i + 1}
                            </div>
                            <span style={{
                                fontFamily: "'Space Mono', monospace",
                                fontSize: 8,
                                letterSpacing: '0.15em',
                                color,
                                whiteSpace: 'nowrap'
                            }}>
                {s}
              </span>
                        </div>
                        {i < steps.length - 1 && (
                            <div style={{
                                flex: 1, height: 1, margin: '0 8px', marginBottom: 22,
                                background: done ? '#10b981' : 'rgba(59,130,246,0.1)',
                            }}/>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

function StorageBadge({info}) {
    if (!info) return null
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 3,
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.2)',
            fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: '0.08em',
            marginTop: 12,
        }}>
            <span style={{color: '#6ee7b7'}}>✓ STORED IN SUPABASE</span>
            <span style={{color: 'rgba(100,116,139,0.5)', marginLeft: 4}}>
        datasets/{info.path}
      </span>
            <span style={{color: 'rgba(100,116,139,0.4)', marginLeft: 'auto'}}>
        {(info.size / 1024).toFixed(1)} KB
      </span>
        </div>
    )
}

export default function DataManagement() {
    const {authFetch} = useAuth()

    const [step, setStep] = useState(0)
    const [datasetType, setDatasetType] = useState('traffic')
    const [fileHeaders, setFileHeaders] = useState([])
    const [allRows, setAllRows] = useState([])
    const [fileName, setFileName] = useState('')
    const [mappings, setMappings] = useState({})
    const [storageInfo, setStorageInfo] = useState(null)
    const [validation, setValidation] = useState(null)
    const [uploadResult, setUploadResult] = useState(null)
    const [loading, setLoading] = useState(false)
    const [storeLoading, setStoreLoading] = useState(false)
    const [error, setError] = useState(null)
    const [dragOver, setDragOver] = useState(false)
    const fileRef = useRef(null)

    function reset() {
        setStep(0);
        setFileHeaders([]);
        setAllRows([])
        setFileName('');
        setMappings({});
        setStorageInfo(null)
        setValidation(null);
        setUploadResult(null);
        setError(null)
    }

    const handleFile = useCallback(async (file) => {
        if (!file) return
        const ext = file.name.split('.').pop().toLowerCase()
        if (!['csv', 'json'].includes(ext)) {
            setError('Only CSV and JSON files are supported');
            return
        }
        setError(null)
        setFileName(file.name)
        setStorageInfo(null)
        setStoreLoading(true)

        try {
            const form = new FormData()
            form.append('file', file)
            form.append('dataset_type', datasetType)

            const sessionRes = await (async () => {
                const {supabase} = await import('../lib/supabaseClient')
                return supabase.auth.getSession()
            })()
            const token = sessionRes.data.session?.access_token

            const storeRes = await fetch(
                `${import.meta.env.VITE_API_URL || 'http://localhost:8000/'}api/data/store`,
                {
                    method: 'POST',
                    headers: {Authorization: `Bearer ${token}`},
                    body: form,
                }
            )

            if (!storeRes.ok) {
                const err = await storeRes.json().catch(() => ({detail: storeRes.statusText}))
                throw new Error(err.detail || 'Storage upload failed')
            }

            const storeData = await storeRes.json()
            setStorageInfo(storeData)
        } catch (e) {
            console.warn('[DataManagement] Storage upload failed:', e.message)
            setError(`Warning: could not store file in Supabase Storage (${e.message}). You can still validate and insert the data.`)
        } finally {
            setStoreLoading(false)
        }

        try {
            const text = await file.text()
            let headers, rows

            if (ext === 'csv') {
                ({headers, rows} = parseCSV(text))
            } else {
                const parsed = JSON.parse(text)
                const arr = Array.isArray(parsed) ? parsed : parsed.data ?? []
                if (!arr.length) throw new Error('JSON file is empty')
                headers = Object.keys(arr[0])
                rows = arr
            }

            setFileHeaders(headers)
            setAllRows(rows)

            const auto = {}
            ALL_FIELDS[datasetType].forEach(field => {
                if (headers.includes(field)) auto[field] = field
            })
            setMappings(auto)
            setStep(2)
        } catch (e) {
            setError(`Parse error: ${e.message}`)
        }
    }, [datasetType])

    function onFileInput(e) {
        handleFile(e.target.files[0])
    }

    function onDrop(e) {
        e.preventDefault();
        setDragOver(false)
        handleFile(e.dataTransfer.files[0])
    }

    async function runValidation() {
        setLoading(true);
        setError(null)
        try {
            const mappingList = Object.entries(mappings)
                .filter(([, fc]) => fc)
                .map(([sf, fc]) => ({schema_field: sf, file_column: fc}))

            const result = await authFetch('/api/data/validate', {
                method: 'POST',
                body: JSON.stringify({
                    dataset_type: datasetType,
                    mappings: mappingList,
                    rows: allRows.slice(0, 200),
                }),
            })
            setValidation({...result, fullRowCount: allRows.length})
            setStep(4)
        } catch (e) {
            setError(e.message)
            setStep(2)
        } finally {
            setLoading(false)
        }
    }

    async function confirmUpload() {
        setLoading(true);
        setError(null)
        try {
            const mappingList = Object.entries(mappings)
                .filter(([, fc]) => fc)
                .map(([sf, fc]) => ({schema_field: sf, file_column: fc}))

            const result = await authFetch('/api/data/upload', {
                method: 'POST',
                body: JSON.stringify({
                    dataset_type: datasetType,
                    mappings: mappingList,
                    rows: allRows,
                }),
            })
            setUploadResult(result)
            setStep(5)
        } catch (e) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    const requiredFields = REQUIRED_FIELDS[datasetType] || []
    const allFields = ALL_FIELDS[datasetType] || []
    const mappingsDone = requiredFields.every(f => mappings[f])

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        body {
          margin: 0;
          overflow-x: hidden !important;
        }
        .dm-page {
          min-height: 100vh; background: #080c14;
          padding: 80px 0 80px; font-family: 'DM Sans', sans-serif; position: relative;
        }
        .dm-grid {
          position: absolute; inset: 0; pointer-events: none; opacity: 0.04;
          background-image:
            linear-gradient(rgba(59,130,246,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,130,246,0.5) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .dm-content { position: relative; z-index: 1; max-width: 860px; margin: 0 auto; padding: 0 32px; }
        .dm-eyebrow {
          font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.25em;
          color: #3b82f6; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;
        }
        .dm-eyebrow::before { content: ''; width: 24px; height: 1px; background: #3b82f6; opacity: 0.6; }
        .dm-title { font-family: 'Space Mono', monospace; font-size: 30px; font-weight: 700; color: #f0f4ff; letter-spacing: -0.03em; margin-bottom: 8px; }
        .dm-sub   { font-size: 14px; color: rgba(148,163,184,0.45); margin-bottom: 48px; line-height: 1.6; }

        .card { background: rgba(10,16,28,0.7); border: 1px solid rgba(59,130,246,0.12); border-radius: 4px; padding: 32px; margin-bottom: 20px; }
        .card-title { font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.2em; color: rgba(100,116,139,0.5); margin-bottom: 20px; }

        .type-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .type-card { padding: 20px; border-radius: 3px; border: 1px solid rgba(59,130,246,0.1); cursor: pointer; transition: all 0.15s; background: transparent; text-align: left; font-family: inherit; }
        .type-card:hover    { border-color: rgba(59,130,246,0.3); background: rgba(59,130,246,0.04); }
        .type-card.selected { border-color: #3b82f6; background: rgba(59,130,246,0.08); }
        .type-label { font-family: 'Space Mono', monospace; font-size: 12px; font-weight: 700; color: #e2e8f0; margin-bottom: 6px; }
        .type-desc  { font-size: 11px; color: rgba(148,163,184,0.4); line-height: 1.5; }

        .dropzone {
          border: 2px dashed rgba(59,130,246,0.2); border-radius: 4px;
          padding: 52px 48px; text-align: center; cursor: pointer; transition: all 0.2s;
        }
        .dropzone:hover, .dropzone.over { border-color: #3b82f6; background: rgba(59,130,246,0.04); }
        .dropzone-icon { font-size: 36px; margin-bottom: 14px; opacity: 0.35; }
        .dropzone-text { font-family: 'Space Mono', monospace; font-size: 11px; letter-spacing: 0.15em; color: rgba(148,163,184,0.45); }
        .dropzone-sub  { font-size: 12px; color: rgba(100,116,139,0.35); margin-top: 6px; }

        .storing-bar {
          display: flex; align-items: center; gap: 10; padding: 10px 14px; margin-top: 12px;
          background: rgba(59,130,246,0.06); border: 1px solid rgba(59,130,246,0.15); border-radius: 3px;
          font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.1em; color: rgba(59,130,246,0.7);
        }

        .map-table { width: 100%; border-collapse: collapse; }
        .map-table th { font-family: 'Space Mono', monospace; font-size: 9px; letter-spacing: 0.2em; color: rgba(100,116,139,0.45); text-align: left; padding: 0 0 12px; }
        .map-table td { padding: 5px 0; vertical-align: middle; }
        .map-table tr { border-bottom: 1px solid rgba(59,130,246,0.05); }
        .field-name { font-family: 'Space Mono', monospace; font-size: 11px; color: #e2e8f0; display: flex; align-items: center; gap: 8px; }
        .req-dot { width: 5px; height: 5px; border-radius: 50%; background: #3b82f6; flex-shrink: 0; }
        .opt-dot { width: 5px; height: 5px; border-radius: 50%; background: rgba(100,116,139,0.25); flex-shrink: 0; }

        select.map-select {
          width: 100%; padding: 7px 10px; background: rgba(10,16,28,0.8);
          border: 1px solid rgba(59,130,246,0.15); border-radius: 3px;
          color: #e2e8f0; font-family: 'Space Mono', monospace; font-size: 10px; cursor: pointer; outline: none;
        }
        select.map-select:focus { border-color: rgba(59,130,246,0.4); }

        .val-stat { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
        .val-chip { padding: 7px 14px; border-radius: 3px; border: 1px solid; font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.1em; }

        .msg-list { max-height: 160px; overflow-y: auto; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 3px; border: 1px solid rgba(59,130,246,0.06); }
        .msg-item { font-family: 'Space Mono', monospace; font-size: 10px; color: rgba(148,163,184,0.55); padding: 2px 0; line-height: 1.6; }
        .msg-item.err { color: #fca5a5; }
        .msg-item.ok  { color: #6ee7b7; }

        .preview-wrap { overflow-x: auto; margin-top: 16px; }
        .preview-table { width: 100%; border-collapse: collapse; }
        .preview-table th { font-family: 'Space Mono', monospace; font-size: 9px; letter-spacing: 0.12em; color: rgba(100,116,139,0.45); padding: 6px 12px; text-align: left; border-bottom: 1px solid rgba(59,130,246,0.08); }
        .preview-table td { padding: 6px 12px; color: rgba(148,163,184,0.75); border-bottom: 1px solid rgba(59,130,246,0.04); font-size: 12px; white-space: nowrap; max-width: 160px; overflow: hidden; text-overflow: ellipsis; }

        .btn { padding: 10px 22px; border-radius: 3px; border: 1px solid; font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.15em; cursor: pointer; transition: all 0.15s; background: transparent; }
        .btn-primary { border-color: #3b82f6; color: #3b82f6; }
        .btn-primary:hover:not(:disabled) { background: #3b82f6; color: #080c14; }
        .btn-primary:disabled { opacity: 0.3; cursor: not-allowed; }
        .btn-success { border-color: #10b981; color: #10b981; }
        .btn-success:hover:not(:disabled) { background: #10b981; color: #080c14; }
        .btn-success:disabled { opacity: 0.3; cursor: not-allowed; }
        .btn-ghost { border-color: rgba(100,116,139,0.25); color: rgba(148,163,184,0.45); }
        .btn-ghost:hover { border-color: rgba(148,163,184,0.35); color: #e2e8f0; }
        .btn-row { display: flex; gap: 10px; margin-top: 24px; }

        .err-box { padding: 10px 14px; background: rgba(239,68,68,0.07); border: 1px solid rgba(239,68,68,0.18); border-radius: 3px; font-family: 'Space Mono', monospace; font-size: 10px; color: #fca5a5; margin-top: 14px; letter-spacing: 0.04em; line-height: 1.6; }
        .warn-box { padding: 10px 14px; background: rgba(245,158,11,0.07); border: 1px solid rgba(245,158,11,0.18); border-radius: 3px; font-family: 'Space Mono', monospace; font-size: 10px; color: #fcd34d; margin-top: 14px; letter-spacing: 0.04em; }

        .success-block { text-align: center; padding: 32px 0; }
        .success-icon  { font-size: 44px; margin-bottom: 14px; }
        .success-title { font-family: 'Space Mono', monospace; font-size: 18px; font-weight: 700; color: #10b981; margin-bottom: 6px; }
        .success-sub   { font-size: 13px; color: rgba(148,163,184,0.45); }
      `}</style>

            <div className="dm-page">
                <div className="dm-grid"/>
                <div className="dm-content">

                    <div className="dm-eyebrow">ANALYST TOOLS</div>
                    <h1 className="dm-title">DATA MANAGEMENT</h1>
                    <p className="dm-sub">
                        Upload historical traffic, weather, or pollution datasets.<br/>
                        Files are saved to Supabase Storage and validated before insertion into the database.
                    </p>

                    <Steps current={Math.min(step, 4)}/>

                    {step === 0 && (
                        <div className="card">
                            <div className="card-title">STEP 1 — DATASET TYPE</div>
                            <div className="type-grid">
                                {DATASET_TYPES.map(t => (
                                    <button
                                        key={t.value}
                                        className={`type-card${datasetType === t.value ? ' selected' : ''}`}
                                        onClick={() => setDatasetType(t.value)}
                                    >
                                        <div className="type-label">{t.label.toUpperCase()}</div>
                                        <div className="type-desc">{t.desc}</div>
                                    </button>
                                ))}
                            </div>
                            <div className="btn-row">
                                <button className="btn btn-primary" onClick={() => setStep(1)}>NEXT →</button>
                            </div>
                        </div>
                    )}

                    {step === 1 && (
                        <div className="card">
                            <div className="card-title">STEP 2 — UPLOAD FILE</div>
                            <div
                                className={`dropzone${dragOver ? ' over' : ''}`}
                                onClick={() => !storeLoading && fileRef.current?.click()}
                                onDragOver={e => {
                                    e.preventDefault();
                                    setDragOver(true)
                                }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={onDrop}
                            >
                                <div className="dropzone-icon">
                                    {storeLoading ? (
                                        <div style={{
                                            width: 36,
                                            height: 36,
                                            borderRadius: '50%',
                                            border: '2px solid rgba(59,130,246,0.2)',
                                            borderTop: '2px solid #3b82f6',
                                            animation: 'spin 0.7s linear infinite',
                                            margin: '0 auto'
                                        }}/>
                                    ) : '⬆'}
                                </div>
                                <div className="dropzone-text">
                                    {storeLoading ? 'UPLOADING TO SUPABASE STORAGE...' : 'DROP FILE HERE OR CLICK TO BROWSE'}
                                </div>
                                <div className="dropzone-sub">CSV or JSON · max 50,000 rows</div>
                                <input ref={fileRef} type="file" accept=".csv,.json" style={{display: 'none'}}
                                       onChange={onFileInput}/>
                            </div>

                            {storeLoading && (
                                <div className="storing-bar" style={{gap: 10}}>
                                    <div style={{
                                        width: 12,
                                        height: 12,
                                        borderRadius: '50%',
                                        border: '1.5px solid rgba(59,130,246,0.3)',
                                        borderTop: '1.5px solid #3b82f6',
                                        animation: 'spin 0.7s linear infinite',
                                        flexShrink: 0
                                    }}/>
                                    Saving to Supabase Storage...
                                </div>
                            )}

                            {error && !storageInfo && (
                                <div className="warn-box">⚠ {error}</div>
                            )}

                            <div className="btn-row">
                                <button className="btn btn-ghost" onClick={() => setStep(0)}>← BACK</button>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="card">
                            <div className="card-title">
                                STEP 3 — MAP COLUMNS &nbsp;·&nbsp;
                                <span style={{color: 'rgba(148,163,184,0.4)', fontWeight: 400}}>
                  {fileName} &nbsp;·&nbsp; {allRows.length.toLocaleString()} rows
                </span>
                            </div>

                            {storageInfo && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '9px 14px', borderRadius: 3, marginBottom: 20,
                                    background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.18)',
                                    fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: '0.08em',
                                }}>
                                    <span style={{color: '#6ee7b7'}}>✓ STORED</span>
                                    <span style={{color: 'rgba(100,116,139,0.5)'}}>datasets/{storageInfo.path}</span>
                                    <span style={{
                                        marginLeft: 'auto',
                                        color: 'rgba(100,116,139,0.35)'
                                    }}>{(storageInfo.size / 1024).toFixed(1)} KB</span>
                                </div>
                            )}

                            <p style={{
                                fontSize: 13,
                                color: 'rgba(148,163,184,0.4)',
                                marginBottom: 20,
                                lineHeight: 1.6
                            }}>
                                Match internal fields to your file's column names.&nbsp;
                                <span style={{color: '#3b82f6'}}>●</span> Required &nbsp;
                                <span style={{color: 'rgba(100,116,139,0.4)'}}>●</span> Optional
                            </p>

                            <table className="map-table">
                                <thead>
                                <tr>
                                    <th style={{width: '40%'}}>INTERNAL FIELD</th>
                                    <th>YOUR COLUMN</th>
                                </tr>
                                </thead>
                                <tbody>
                                {allFields.map(field => (
                                    <tr key={field}>
                                        <td>
                        <span className="field-name">
                          <span className={requiredFields.includes(field) ? 'req-dot' : 'opt-dot'}/>
                            {field}
                        </span>
                                        </td>
                                        <td style={{paddingLeft: 16}}>
                                            <select
                                                className="map-select"
                                                value={mappings[field] || ''}
                                                onChange={e => setMappings(m => ({...m, [field]: e.target.value}))}
                                            >
                                                <option value="">— not mapped —</option>
                                                {fileHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>

                            {!mappingsDone && (
                                <div className="warn-box" style={{marginTop: 14}}>
                                    ⚠ Map required fields first: {requiredFields.filter(f => !mappings[f]).join(', ')}
                                </div>
                            )}

                            <div className="btn-row">
                                <button className="btn btn-ghost" onClick={() => setStep(1)}>← BACK</button>
                                <button
                                    className="btn btn-primary"
                                    disabled={!mappingsDone || loading}
                                    onClick={() => {
                                        setStep(3);
                                        runValidation()
                                    }}
                                >
                                    VALIDATE →
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="card" style={{textAlign: 'center', padding: '60px 32px'}}>
                            <div style={{
                                width: 40,
                                height: 40,
                                borderRadius: '50%',
                                margin: '0 auto 20px',
                                border: '2px solid rgba(59,130,246,0.15)',
                                borderTop: '2px solid #3b82f6',
                                animation: 'spin 0.7s linear infinite'
                            }}/>
                            <div style={{
                                fontFamily: "'Space Mono', monospace",
                                fontSize: 11,
                                letterSpacing: '0.2em',
                                color: 'rgba(148,163,184,0.35)'
                            }}>
                                VALIDATING {allRows.length.toLocaleString()} ROWS...
                            </div>
                        </div>
                    )}

                    {step === 4 && validation && (
                        <div className="card">
                            <div className="card-title">STEP 4 — VALIDATION RESULTS</div>

                            <div className="val-stat">
                                <div className="val-chip" style={{
                                    borderColor: validation.valid ? '#10b981' : '#ef4444',
                                    color: validation.valid ? '#6ee7b7' : '#fca5a5',
                                    background: validation.valid ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)'
                                }}>
                                    {validation.valid ? '✓ VALID' : '✗ ERRORS FOUND'}
                                </div>
                                <div className="val-chip"
                                     style={{borderColor: 'rgba(59,130,246,0.2)', color: '#93c5fd'}}>
                                    {(validation.fullRowCount || validation.total_rows).toLocaleString()} ROWS
                                </div>
                                {validation.null_errors > 0 && <div className="val-chip" style={{
                                    borderColor: 'rgba(239,68,68,0.2)',
                                    color: '#fca5a5'
                                }}>{validation.null_errors} NULLS</div>}
                                {validation.format_errors > 0 && <div className="val-chip" style={{
                                    borderColor: 'rgba(245,158,11,0.2)',
                                    color: '#fcd34d'
                                }}>{validation.format_errors} FORMAT ERR</div>}
                                {validation.duplicate_ts > 0 && <div className="val-chip" style={{
                                    borderColor: 'rgba(139,92,246,0.2)',
                                    color: '#c4b5fd'
                                }}>{validation.duplicate_ts} DUPLICATES</div>}
                            </div>

                            <div className="msg-list">
                                {validation.messages.map((m, i) => (
                                    <div key={i}
                                         className={`msg-item ${m.startsWith('✓') ? 'ok' : m.startsWith('✗') ? 'err' : ''}`}>{m}</div>
                                ))}
                            </div>

                            {validation.preview?.length > 0 && (
                                <>
                                    <div style={{
                                        fontFamily: "'Space Mono', monospace",
                                        fontSize: 9,
                                        letterSpacing: '0.2em',
                                        color: 'rgba(100,116,139,0.4)',
                                        marginTop: 20,
                                        marginBottom: 8
                                    }}>
                                        PREVIEW — FIRST {validation.preview.length} CLEAN ROWS
                                    </div>
                                    <div className="preview-wrap">
                                        <table className="preview-table">
                                            <thead>
                                            <tr>{Object.keys(validation.preview[0]).map(k => <th
                                                key={k}>{k.toUpperCase()}</th>)}</tr>
                                            </thead>
                                            <tbody>
                                            {validation.preview.map((row, i) => (
                                                <tr key={i}>{Object.values(row).map((v, j) => <td key={j}
                                                                                                  title={String(v ?? '')}>{String(v ?? '—')}</td>)}</tr>
                                            ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}

                            {error && <div className="err-box">⚠ {error}</div>}

                            <div className="btn-row">
                                <button className="btn btn-ghost" onClick={() => setStep(2)}>← FIX MAPPINGS</button>
                                <button
                                    className="btn btn-success"
                                    disabled={!validation.valid || loading}
                                    onClick={confirmUpload}
                                >
                                    {loading ? 'INSERTING...' : `CONFIRM INSERT (${(validation.fullRowCount || validation.total_rows).toLocaleString()} ROWS) →`}
                                </button>
                            </div>

                            {!validation.valid && (
                                <p style={{
                                    marginTop: 10,
                                    fontSize: 11,
                                    color: 'rgba(239,68,68,0.6)',
                                    fontFamily: "'Space Mono', monospace",
                                    letterSpacing: '0.05em'
                                }}>
                                    Fix errors in your file and re-upload before inserting.
                                </p>
                            )}
                        </div>
                    )}

                    {step === 5 && uploadResult && (
                        <div className="card">
                            <div className="success-block">
                                <div className="success-icon">✓</div>
                                <div className="success-title">UPLOAD COMPLETE</div>
                                <div className="success-sub">{uploadResult.messages[0]}</div>
                                <div className="val-stat" style={{justifyContent: 'center', marginTop: 20}}>
                                    <div className="val-chip" style={{
                                        borderColor: 'rgba(16,185,129,0.3)',
                                        color: '#6ee7b7'
                                    }}>{uploadResult.inserted.toLocaleString()} INSERTED
                                    </div>
                                    {uploadResult.skipped > 0 && <div className="val-chip" style={{
                                        borderColor: 'rgba(245,158,11,0.2)',
                                        color: '#fcd34d'
                                    }}>{uploadResult.skipped} SKIPPED</div>}
                                    {uploadResult.errors > 0 && <div className="val-chip" style={{
                                        borderColor: 'rgba(239,68,68,0.2)',
                                        color: '#fca5a5'
                                    }}>{uploadResult.errors} ERRORS</div>}
                                </div>
                                <div style={{
                                    fontFamily: "'Space Mono', monospace",
                                    fontSize: 10,
                                    letterSpacing: '0.1em',
                                    color: 'rgba(100,116,139,0.35)',
                                    marginTop: 8
                                }}>
                                    TABLE: {uploadResult.table}
                                </div>
                                {storageInfo && (
                                    <div style={{
                                        fontFamily: "'Space Mono', monospace",
                                        fontSize: 10,
                                        letterSpacing: '0.08em',
                                        color: 'rgba(16,185,129,0.5)',
                                        marginTop: 6
                                    }}>
                                        STORAGE: datasets/{storageInfo.path}
                                    </div>
                                )}
                            </div>
                            <div className="btn-row" style={{justifyContent: 'center'}}>
                                <button className="btn btn-primary" onClick={reset}>UPLOAD ANOTHER</button>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </>
    )
}