CREATE TABLE IF NOT EXISTS public.city_locations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  country_code CHAR(2),
  state TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  population_rank INTEGER NOT NULL DEFAULT 999999,
  source TEXT NOT NULL DEFAULT 'seed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT city_locations_lat_range CHECK (lat >= -90 AND lat <= 90),
  CONSTRAINT city_locations_lon_range CHECK (lon >= -180 AND lon <= 180)
);

CREATE UNIQUE INDEX IF NOT EXISTS city_locations_name_country_uidx
  ON public.city_locations (name_normalized, country_code);

CREATE INDEX IF NOT EXISTS city_locations_country_rank_idx
  ON public.city_locations (country_code, population_rank);

INSERT INTO public.city_locations (name, name_normalized, country_code, state, lat, lon, population_rank, source)
VALUES
  ('Skopje', 'skopje', 'MK', NULL, 41.9981, 21.4254, 1, 'seed'),
  ('Bitola', 'bitola', 'MK', NULL, 41.0328, 21.3403, 2, 'seed'),
  ('Tetovo', 'tetovo', 'MK', NULL, 42.0106, 20.9716, 3, 'seed'),
  ('London', 'london', 'GB', 'England', 51.5072, -0.1276, 1, 'seed'),
  ('Manchester', 'manchester', 'GB', 'England', 53.4808, -2.2426, 2, 'seed'),
  ('Birmingham', 'birmingham', 'GB', 'England', 52.4862, -1.8904, 3, 'seed'),
  ('New York', 'new york', 'US', 'NY', 40.7128, -74.0060, 1, 'seed'),
  ('Los Angeles', 'los angeles', 'US', 'CA', 34.0522, -118.2437, 2, 'seed'),
  ('Chicago', 'chicago', 'US', 'IL', 41.8781, -87.6298, 3, 'seed'),
  ('Berlin', 'berlin', 'DE', NULL, 52.5200, 13.4050, 1, 'seed'),
  ('Munich', 'munich', 'DE', NULL, 48.1351, 11.5820, 2, 'seed'),
  ('Paris', 'paris', 'FR', NULL, 48.8566, 2.3522, 1, 'seed'),
  ('Lyon', 'lyon', 'FR', NULL, 45.7640, 4.8357, 2, 'seed'),
  ('Rome', 'rome', 'IT', NULL, 41.9028, 12.4964, 1, 'seed'),
  ('Milan', 'milan', 'IT', NULL, 45.4642, 9.1900, 2, 'seed'),
  ('Madrid', 'madrid', 'ES', NULL, 40.4168, -3.7038, 1, 'seed'),
  ('Barcelona', 'barcelona', 'ES', NULL, 41.3874, 2.1686, 2, 'seed'),
  ('Athens', 'athens', 'GR', NULL, 37.9838, 23.7275, 1, 'seed'),
  ('Thessaloniki', 'thessaloniki', 'GR', NULL, 40.6401, 22.9444, 2, 'seed'),
  ('Belgrade', 'belgrade', 'RS', NULL, 44.7866, 20.4489, 1, 'seed'),
  ('Novi Sad', 'novi sad', 'RS', NULL, 45.2671, 19.8335, 2, 'seed'),
  ('Sofia', 'sofia', 'BG', NULL, 42.6977, 23.3219, 1, 'seed'),
  ('Plovdiv', 'plovdiv', 'BG', NULL, 42.1354, 24.7453, 2, 'seed'),
  ('Istanbul', 'istanbul', 'TR', NULL, 41.0082, 28.9784, 1, 'seed'),
  ('Ankara', 'ankara', 'TR', NULL, 39.9334, 32.8597, 2, 'seed'),
  ('Dubai', 'dubai', 'AE', NULL, 25.2048, 55.2708, 1, 'seed'),
  ('Tokyo', 'tokyo', 'JP', NULL, 35.6762, 139.6503, 1, 'seed'),
  ('Osaka', 'osaka', 'JP', NULL, 34.6937, 135.5023, 2, 'seed'),
  ('Sydney', 'sydney', 'AU', 'NSW', -33.8688, 151.2093, 1, 'seed'),
  ('Melbourne', 'melbourne', 'AU', 'VIC', -37.8136, 144.9631, 2, 'seed')
ON CONFLICT (name_normalized, country_code) DO UPDATE SET
  lat = EXCLUDED.lat,
  lon = EXCLUDED.lon,
  state = EXCLUDED.state,
  population_rank = EXCLUDED.population_rank,
  updated_at = NOW();

