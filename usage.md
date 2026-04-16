# UrbanPulse Usage Notes

This file covers the weather and city-management work we added:
- weather endpoint behavior and response structure
- traffic score endpoint behavior and scoring logic
- city CRUD endpoints
- auth requirements for admin actions
- caching strategy (backend + frontend) and why it exists

## Start backend

Install dependencies:

```bash
pip install -r ./backend/requirements.txt
```

Run API:

```bash
python -m backend.main
```

Useful URLs:
- `http://127.0.0.1:8080/docs`
- `http://127.0.0.1:8080/health`
- `http://127.0.0.1:8080/api/weather/current?city=Skopje&country_code=MK`

## Start frontend

```bash
npm install --prefix frontend
npm run dev --prefix frontend
```

Frontend URL:
- `http://localhost:5173`

## Env setup

### Backend weather env (`.env` for backend)

```bash
WEATHER_API_KEY=your_openweather_api_key
WEATHER_BASE_URL=https://api.openweathermap.org
WEATHER_UNITS=metric
WEATHER_CACHE_TTL_SECONDS=600
WEATHER_GEOCODE_LIMIT=1
WEATHER_HTTP_TIMEOUT_SECONDS=10
LOCATIONIQ_DIRECTIONS_BASE_URL=https://eu1.locationiq.com/v1/directions/driving
LOCATIONIQ_API_KEY=your_locationiq_key
TRAFFIC_FREE_FLOW_KMH=50
TRAFFIC_CACHE_TTL_SECONDS=300
TRAFFIC_HTTP_TIMEOUT_SECONDS=10
TRAFFIC_DEFAULT_START_LAT=41.9995
TRAFFIC_DEFAULT_START_LON=21.4170
TRAFFIC_DEFAULT_END_LAT=41.9948
TRAFFIC_DEFAULT_END_LON=21.4332
```

### Frontend weather env (`frontend/.env`)

```bash
VITE_API_URL=http://127.0.0.1:8080
VITE_DEFAULT_WEATHER_CITY=Bitola
VITE_DEFAULT_WEATHER_COUNTRY_CODE=MK
VITE_WEATHER_REFRESH_MS=60000
VITE_WEATHER_CLIENT_CACHE_MS=300000
VITE_AQI_REFRESH_MS=60000
VITE_AQI_CLIENT_CACHE_MS=300000
VITE_TRAFFIC_REFRESH_MS=60000
VITE_TRAFFIC_CLIENT_CACHE_MS=300000
```

Notes:
- Keep `VITE_API_URL` without trailing `/`.
- `VITE_WEATHER_CLIENT_CACHE_MS` and `VITE_AQI_CLIENT_CACHE_MS` are browser-side cache TTLs (in ms).
- `VITE_TRAFFIC_CLIENT_CACHE_MS` is traffic browser-side cache TTL (ms).

## Supabase migration needed for city table

Run in Supabase SQL editor:
- `backend/migrations/002_city_locations.sql`


## Weather API

Base prefix: `/api/weather`

### `GET /api/weather/current`

Input mode rules:
- city mode: `city` required, `country_code` optional
- coordinate mode: `lat` and `lon` together
- do not send city and coordinates in same request
- `units` defaults to `metric` (allowed: `metric`, `imperial`, `standard`)

Examples:

```bash
curl "http://127.0.0.1:8080/api/weather/current?city=Bitola&country_code=MK"
curl "http://127.0.0.1:8080/api/weather/current?lat=41.0328&lon=21.3403"
```

Response shape:

```json
{
  "source": "openweather",
  "location": {
    "city": "Bitola",
    "country_code": "MK",
    "state": null,
    "lat": 41.0328,
    "lon": 21.3403
  },
  "weather": {
    "main": "Clouds",
    "description": "overcast clouds",
    "icon": "04n"
  },
  "main": {
    "temp": 8.06,
    "feels_like": 7.3,
    "temp_min": 8.06,
    "temp_max": 8.06,
    "pressure": 1018,
    "humidity": 93
  },
  "wind": {
    "speed": 1.62,
    "deg": 159
  },
  "visibility": 10000,
  "observed_at": 1776046191,
  "timezone_offset": 7200
}
```

Common errors:
- `400` invalid query combination
- `404` city not found
- `429` provider rate limit
- `502` upstream/provider issue
- `503` temporary network/service issue

## Traffic API

Base prefix: `/api/traffic`

### `GET /api/traffic/score`

Calculates traffic score using LocationIQ directions route distance/duration.

Input modes:
- city mode: `city` required, `country_code` optional (resolved from `city_locations` table)
- route mode: `start_lat`, `start_lon`, `end_lat`, `end_lon` together
- default mode: no params -> uses default Skopje route from env

Important for city mode:
- traffic endpoints use DB-backed city resolution only
- if city is missing in `city_locations`, API returns `404`
- add missing cities using `POST /api/weather/cities`

Examples:

```bash
curl "http://127.0.0.1:8080/api/traffic/score"
curl "http://127.0.0.1:8080/api/traffic/score?city=Skopje&country_code=MK"
curl "http://127.0.0.1:8080/api/traffic/score?start_lat=41.9995&start_lon=21.4170&end_lat=41.9948&end_lon=21.4332"
```

Formula used:
- `speed_kmh = (distance_m / duration_s) * 3.6`
- `traffic_score = clamp((speed_kmh / 50) * 10, 0, 10)`

Score mapping:
- `0.0 - 4.0`: Heavy Traffic (`red`)
- `4.1 - 7.0`: Moderate Traffic (`yellow`)
- `7.1 - 10.0`: Free Flow (`green`)

Response shape:

```json
{
  "source": "locationiq",
  "location_city": "Skopje",
  "location_country_code": "MK",
  "route": {
    "origin": {"lat": 41.9995, "lon": 21.417},
    "destination": {"lat": 41.9948, "lon": 21.4332}
  },
  "distance_m": 2353.4,
  "duration_s": 280.4,
  "speed_kmh": 30.2,
  "free_flow_kmh": 50.0,
  "traffic_score": 6.0,
  "traffic_level": "Moderate Traffic",
  "traffic_color": "yellow",
  "observed_at": 1776046191
}
```

Common errors:
- `400` invalid query combination
- `404` route/location not found
- `429` provider rate limit
- `502` upstream/provider issue
- `503` temporary network/service issue

### `GET /api/traffic/score/auto`

Generates destination coordinates automatically from a start point, then calculates score.

Input modes:
- city mode: `city` required, `country_code` optional (resolved from `city_locations` table)
- coordinate mode: `start_lat` + `start_lon`
- default mode: no params -> starts from default Skopje start point from env

Configurable controls:
- `distance_m` (default `500`, min `100`, max `5000`)
- `bearing_deg` (default `90`) where `0=north`, `90=east`, `180=south`, `270=west`

Examples:

```bash
curl "http://127.0.0.1:8080/api/traffic/score/auto?city=Skopje&country_code=MK"
curl "http://127.0.0.1:8080/api/traffic/score/auto?start_lat=41.9995&start_lon=21.4170&distance_m=500&bearing_deg=90"
```

Response is same schema as `/api/traffic/score`.

## Air Quality / Pollution API

Base prefix: `/api/pollution`

### `GET /api/pollution/current`

Returns air quality (AQI) and pollutant levels by city or coordinates.

Input mode rules (same as weather):
- city mode: `city` required, `country_code` optional
- coordinate mode: `lat` and `lon` together
- do not send city and coordinates in same request

Examples:

```bash
curl "http://127.0.0.1:8080/api/pollution/current?city=Bitola&country_code=MK"
curl "http://127.0.0.1:8080/api/pollution/current?lat=41.0328&lon=21.3403"
```

Response shape:

```json
{
  "source": "openweather",
  "location": {
    "city": "Bitola",
    "country_code": "MK",
    "state": null,
    "lat": 41.0328,
    "lon": 21.3403
  },
  "aqi_index": 62,
  "aqi_level": "Fair",
  "components": {
    "pm2_5": 18.5,
    "pm10": 28.3,
    "o3": 45.2,
    "no2": 12.1,
    "so2": 5.0,
    "co": 350.5
  },
  "observed_at": 1776046191
}
```

**AQI Levels:**
- `0–50`: Good
- `51–100`: Fair
- `101–150`: Moderate
- `151–200`: Poor
- `201–300`: Very Poor
- `300+`: Hazardous

Common errors:
- `400` invalid query combination
- `404` location not found
- `429` provider rate limit
- `502` upstream/provider issue
- `503` temporary network/service issue

### `GET /api/weather/cities`

Lists city rows from `city_locations`.

Query params:
- `country_code` optional
- `limit` optional (default `30`, max `200`)

```bash
curl "http://127.0.0.1:8080/api/weather/cities?country_code=MK&limit=30"
```

## City CRUD API

### `POST /api/weather/cities` (admin)

Creates manual city entry.

Body:
- `city` required
- `lat`, `lon` required
- `country_code`, `state` optional
- `population_rank` optional (default `999999`)

```bash
curl -X POST "http://127.0.0.1:8080/api/weather/cities" \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"city":"Ohrid","country_code":"MK","state":"Southwest","lat":41.1172,"lon":20.8016,"population_rank":10}'
```

Returns `CityRecord`:

```json
{
  "id": 31,
  "city": "Ohrid",
  "country_code": "MK",
  "state": "Southwest",
  "lat": 41.1172,
  "lon": 20.8016,
  "population_rank": 10,
  "source": "manual"
}
```

### `PATCH /api/weather/cities/{city_id}` (admin)

Partial update: send only changed fields.

```bash
curl -X PATCH "http://127.0.0.1:8080/api/weather/cities/31" \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"state":"Pelagonia","population_rank":4}'
```

Possible errors:
- `400` empty payload
- `404` city not found
- `409` duplicate name/country conflict

### `DELETE /api/weather/cities/{city_id}` (admin)

```bash
curl -X DELETE "http://127.0.0.1:8080/api/weather/cities/31" \
  -H "Authorization: Bearer <admin_token>"
```

Response:

```json
{
  "message": "City deleted",
  "city_id": 31
}
```

## Caching strategy (what and why)

### Backend cache (weather & pollution)

Two in-memory caches are used:
- city-resolution cache (`_city_cache`)
- weather-response cache (`_weather_cache`)
- pollution/AQI cache (`_aqi_cache`)
- traffic-score cache (`_traffic_cache`)

TTL is controlled by `WEATHER_CACHE_TTL_SECONDS`.

Why:
- reduce OpenWeatherMap API calls (both weather and pollution use same service)
- lower latency on repeated requests
- avoid burning quota for unchanged data

City CRUD invalidates weather caches after create/update/delete, so dashboard does not keep stale city metadata.

### Frontend cache (`frontend/src/pages/Home.jsx`)

`Home` stores latest weather and AQI responses in `localStorage` with timestamp.
`Home` also stores latest traffic response in `localStorage`.

Controls (weather):
- refresh interval: `VITE_WEATHER_REFRESH_MS` (default 60s)
- client cache TTL: `VITE_WEATHER_CLIENT_CACHE_MS` (default 300000 ms = 5 min)

Controls (AQI):
- refresh interval: `VITE_AQI_REFRESH_MS` (default 60s)
- client cache TTL: `VITE_AQI_CLIENT_CACHE_MS` (default 300000 ms = 5 min)

Controls (Traffic):
- refresh interval: `VITE_TRAFFIC_REFRESH_MS` (default 60s)
- client cache TTL: `VITE_TRAFFIC_CLIENT_CACHE_MS` (default 300000 ms = 5 min)

Why:
- page refresh does not always trigger immediate fresh network call
- users see data instantly from cache while refresh runs
- smoother UX + fewer redundant requests
