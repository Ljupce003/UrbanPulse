
## Starting the Backend API server

Make sure dependencies are installed:

```bash
pip install -r ./backend/requirements.txt
````

Start the development server:

```bash
python -m backend.main
```

The API will be available at:

* [http://127.0.0.1:8080](http://127.0.0.1:8000)
* [http://127.0.0.1:8080/api/status/](http://127.0.0.1:8000/api/status/)
* [http://127.0.0.1:8080/api/weather/current?city=Skopje](http://127.0.0.1:8080/api/weather/current?city=Skopje)
* [http://127.0.0.1:8080/api/weather/cities?country_code=MK&limit=30](http://127.0.0.1:8080/api/weather/cities?country_code=MK&limit=30)
* [http://localhost:8080/health](http://localhost:8080/health) => will return all available endpoints

## Weather setup

Required environment variables for weather endpoints:

```bash
WEATHER_API_KEY=your_openweather_api_key
WEATHER_BASE_URL=https://api.openweathermap.org
WEATHER_UNITS=metric
WEATHER_CACHE_TTL_SECONDS=600
WEATHER_GEOCODE_LIMIT=1
WEATHER_HTTP_TIMEOUT_SECONDS=10
```

Frontend API base URL should **not** end with a trailing slash. Use `http://localhost:8080`, not `http://localhost:8080/`, so browser requests don't become `//api/...`.

Apply the city cache migration in Supabase SQL editor:

```sql
-- run backend/migrations/002_city_locations.sql
```

## Weather API documentation

Base prefix: `/api/weather`

### 1) Get current weather

`GET /api/weather/current`

Query modes (exactly one mode is allowed):

- City mode: `city` (required), `country_code` (optional)
- Coordinate mode: `lat` and `lon` (both required together)

Other query params:

- `units` optional, defaults to `metric`, allowed: `metric`, `imperial`, `standard`

Examples:

```bash
curl "http://127.0.0.1:8080/api/weather/current?city=Skopje&country_code=MK"
curl "http://127.0.0.1:8080/api/weather/current?lat=41.9981&lon=21.4254"
curl "http://127.0.0.1:8080/api/weather/current?city=London&country_code=GB&units=imperial"
```

### 2) List cached cities

`GET /api/weather/cities`

Query params:

- `country_code` optional (2-letter ISO code)
- `limit` optional, default `30`, max `200`

Examples:

```bash
curl "http://127.0.0.1:8080/api/weather/cities"
curl "http://127.0.0.1:8080/api/weather/cities?country_code=MK&limit=30"
```

### 3) Add city manually (admin)

`POST /api/weather/cities`

Auth: `Authorization: Bearer <admin_access_token>`

Body fields:

- `city` required
- `lat`, `lon` required
- `country_code`, `state` optional
- `population_rank` optional (default `999999`)

Example:

```bash
curl -X POST "http://127.0.0.1:8080/api/weather/cities" \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"city":"Ohrid","country_code":"MK","lat":41.1172,"lon":20.8016,"population_rank":10}'
```

### 4) Edit city partially (admin)

`PATCH /api/weather/cities/{city_id}`

Auth: `Authorization: Bearer <admin_access_token>`

Body fields are optional (send only what you want to change):

- `city`, `country_code`, `state`, `lat`, `lon`, `population_rank`

Example:

```bash
curl -X PATCH "http://127.0.0.1:8080/api/weather/cities/1" \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"state":"Skopje Region","population_rank":1}'
```

### 5) Delete city manually (admin)

`DELETE /api/weather/cities/{city_id}`

Auth: `Authorization: Bearer <admin_access_token>`

Example:

```bash
curl -X DELETE "http://127.0.0.1:8080/api/weather/cities/31" \
  -H "Authorization: Bearer <admin_token>"
```

## Starting the Frontend


Install the dependencies
```bash
npm install ./frontend/
```
Run the server
```bash
npm run dev --prefix frontend
```

The Frontend will be available on [http://localhost:5173](http://localhost:5173)

