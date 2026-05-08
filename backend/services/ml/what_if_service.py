from backend.ml.scenario_simulator.traffic_temp_to_pollution import TrafficTempPollutionSimulator
from backend.ml.scenario_simulator.pollution_to_temp import PollutionTempSimulator
import pandas as pd
from pathlib import Path

_traffic_sim = None
_pollution_sim = None


def _get_traffic_simulator():
    global _traffic_sim
    if _traffic_sim is None:
        _traffic_sim = TrafficTempPollutionSimulator()
    return _traffic_sim


def _get_pollution_simulator():
    global _pollution_sim
    if _pollution_sim is None:
        _pollution_sim = PollutionTempSimulator()
    return _pollution_sim


def _convert_types(df: pd.DataFrame) -> pd.DataFrame:
    numeric_cols = [
        'aqi', 'pm1', 'pm25', 'temp_avg_c', 'temp_min_c', 'temp_max_c',
        'precip_mm', 'wind_speed_kmh', 'pressure_hpa', 'traffic_vol_median',
        'traffic_intensity', 'hour_of_day', 'day_of_week', 'month',
        'hour_sin', 'hour_cos', 'month_sin', 'month_cos',
        'wind_dir_sin', 'wind_dir_cos', 'aqi_lag_1h', 'aqi_lag_2h',
        'aqi_lag_3h', 'aqi_lag_6h', 'aqi_roll6h_mean', 'aqi_roll24h_mean',
        'aqi_roll24h_std', 'pm25_lag1h', 'pm1_lag1h', 'traffic_temp_interact'
    ]

    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

    bool_cols = ['is_rush_hour', 'is_weekday']

    for col in bool_cols:
        if col in df.columns:
            df[col] = df[col].astype(bool)

    return df


def initialize_with_latest_data():
    try:
        project_root = Path(__file__).parent.parent.parent.parent
        csv_path = project_root / "data" / "processed" / "imputed_dataset.csv"

        if not csv_path.exists():
            csv_path = Path("../../../data/processed/imputed_dataset.csv")

        if not csv_path.exists():
            raise FileNotFoundError("Dataset not found. Tried multiple paths.")

        df = pd.read_csv(csv_path)

        if 'timestamp' in df.columns:
            df['timestamp'] = pd.to_datetime(df['timestamp'], errors='coerce')
            df = df.sort_values('timestamp', ascending=False)

        latest_row = df.iloc[0].to_dict()

        df_row = pd.DataFrame([latest_row])
        df_row = _convert_types(df_row)
        series = df_row.iloc[0]

        _get_traffic_simulator().set_base_inputs(series)
        _get_pollution_simulator().set_base_inputs(series)

        return {
            "status": "success",
            "message": "Loaded latest data",
            "timestamp": str(latest_row.get("timestamp")),
            "path_used": str(csv_path)
        }

    except Exception as e:
        print(f"⚠️ Dataset loading failed: {e}")


def simulate_traffic_to_pollution(
    traffic_vol_median: float = None,
    temp_avg_c: float = None,
    temp_min_c: float = None,
    temp_max_c: float = None,
    **overrides
):
    sim = _get_traffic_simulator()

    return sim.simulate(
        traffic_vol_median=traffic_vol_median,
        temp_avg_c=temp_avg_c,
        temp_min_c=temp_min_c,
        temp_max_c=temp_max_c,
        **overrides
    )


def simulate_pollution_to_temp(
    aqi: float = None,
    pm25: float = None,
    pm1: float = None,
    **overrides
):
    sim = _get_pollution_simulator()

    return sim.simulate(
        aqi=aqi,
        pm25=pm25,
        pm1=pm1,
        **overrides
    )