CREATE TABLE IF NOT EXISTS public.uploaded_traffic (
  id            BIGSERIAL   PRIMARY KEY,
  timestamp     TIMESTAMPTZ NOT NULL,
  vehicle_count NUMERIC     NOT NULL,
  speed_kmh     NUMERIC,
  city          TEXT,
  country_code  TEXT,
  source        TEXT        DEFAULT 'manual_upload',
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (timestamp, city)
);

CREATE TABLE IF NOT EXISTS public.uploaded_weather (
  id            BIGSERIAL   PRIMARY KEY,
  timestamp     TIMESTAMPTZ NOT NULL,
  temp          NUMERIC     NOT NULL,
  humidity      NUMERIC,
  pressure      NUMERIC,
  wind_speed    NUMERIC,
  description   TEXT,
  city          TEXT,
  country_code  TEXT,
  source        TEXT        DEFAULT 'manual_upload',
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (timestamp, city)
);

CREATE TABLE IF NOT EXISTS public.uploaded_pollution (
  id            BIGSERIAL   PRIMARY KEY,
  timestamp     TIMESTAMPTZ NOT NULL,
  aqi_index     NUMERIC     NOT NULL,
  pm2_5         NUMERIC,
  pm10          NUMERIC,
  o3            NUMERIC,
  no2           NUMERIC,
  so2           NUMERIC,
  co            NUMERIC,
  city          TEXT,
  country_code  TEXT,
  source        TEXT        DEFAULT 'manual_upload',
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (timestamp, city)
);

ALTER TABLE public.uploaded_traffic  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploaded_weather  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploaded_pollution ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.uploaded_traffic   TO service_role;
GRANT ALL ON public.uploaded_weather   TO service_role;
GRANT ALL ON public.uploaded_pollution TO service_role;
