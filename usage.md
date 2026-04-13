# UrbanPulse Usage Notes

This file covers the weather and city-management work we added:
- weather endpoint behavior and response structure
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
```

### Frontend weather env (`frontend/.env`)

```bash
VITE_API_URL=http://127.0.0.1:8080
VITE_DEFAULT_WEATHER_CITY=Bitola
VITE_DEFAULT_WEATHER_COUNTRY_CODE=MK
VITE_WEATHER_REFRESH_MS=60000
VITE_WEATHER_CLIENT_CACHE_MS=300000
```

Notes:
- Keep `VITE_API_URL` without trailing `/`.
- `VITE_WEATHER_CLIENT_CACHE_MS` is the browser-side cache TTL (in ms).

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

### Backend cache (`backend/services/weather_service.py`)

Two in-memory caches are used:
- city-resolution cache (`_city_cache`)
- weather-response cache (`_weather_cache`)

TTL is controlled by `WEATHER_CACHE_TTL_SECONDS`.

Why:
- reduce OpenWeather calls
- lower latency on repeated requests
- avoid burning quota for unchanged data

City CRUD invalidates weather caches after create/update/delete, so dashboard does not keep stale city metadata.

### Frontend cache (`frontend/src/pages/Home.jsx`)

`Home` stores latest weather response in `localStorage` with timestamp.

Controls:
- refresh interval: `VITE_WEATHER_REFRESH_MS` (default 60s)
- client cache TTL: `VITE_WEATHER_CLIENT_CACHE_MS` (default 300000 ms = 5 min)

Why:
- page refresh does not always trigger immediate fresh network call
- users see data instantly from cache while refresh runs
- smoother UX + fewer redundant requests
