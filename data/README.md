# Data Layout

This folder organizes datasets used by preprocessing and upload scripts.

- `raw/` - source datasets as collected/exported (`traffic.csv`, `weather.csv`, `pollution.csv`)
- `interim/` - transformed but not final datasets (for example `traffic_imputed.csv`)
- `processed/payloads/` - generated payload files for backend upload endpoints

Use `scripts/prepare_dataset.py` to generate upload-ready payloads from `raw/` or `interim/` files.

