"""Smoke-test script for scripts/prepare_dataset.py.

Creates small synthetic CSVs for traffic/weather/pollution, runs preprocessing,
and asserts payload shapes required by /api/data/upload.
"""

from __future__ import annotations

from pathlib import Path
import tempfile
import pandas as pd

from prepare_dataset import preprocess_traffic, preprocess_weather, preprocess_pollution


def main():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)

        # Traffic notebook-style data (Yr/M/D/HH/MM + Vol)
        traffic_df = pd.DataFrame(
            {
                "Yr": [2025, 2025, 2025],
                "M": [12, 12, 12],
                "D": [16, 16, 16],
                "HH": [4, 4, 5],
                "MM": [0, 15, 0],
                "Vol": [10, 12, 20],
            }
        )
        traffic_path = root / "traffic.csv"
        traffic_df.to_csv(traffic_path, index=False)

        weather_df = pd.DataFrame(
            {
                "date": ["2025-12-16 00:00:00", "2025-12-17 00:00:00"],
                "tavg": [4.5, 6.0],
                "pres": [1010, 1008],
            }
        )
        weather_path = root / "weather.csv"
        weather_df.to_csv(weather_path, index=False)

        pollution_df = pd.DataFrame(
            {
                "datetimeUtc": ["2025-12-16T04:00:00Z", "2025-12-16T05:00:00Z"],
                "parameter": ["pm25", "pm25"],
                "value": [12.0, 25.0],
            }
        )
        pollution_path = root / "pollution.csv"
        pollution_df.to_csv(pollution_path, index=False)

        traffic_payload = preprocess_traffic(traffic_path, city="Skopje", country_code="MK")
        weather_payload = preprocess_weather(weather_path, city="Skopje", country_code="MK")
        pollution_payload = preprocess_pollution(pollution_path, city="Skopje", country_code="MK")

        assert traffic_payload["dataset_type"] == "traffic"
        assert weather_payload["dataset_type"] == "weather"
        assert pollution_payload["dataset_type"] == "pollution"

        assert traffic_payload["rows"] and "vehicle_count" in traffic_payload["rows"][0]
        assert weather_payload["rows"] and "temp" in weather_payload["rows"][0]
        assert pollution_payload["rows"] and "aqi_index" in pollution_payload["rows"][0]

        print("Smoke test passed: payloads are upload-ready.")


if __name__ == "__main__":
    main()

