import pandas as pd
import xgboost as xgb
from pathlib import Path


class PollutionTempSimulator:
    """Simulator 2: Pollution → Temperature impact"""

    def __init__(self):
        self.base_df = None

        ml_dir = Path(__file__).resolve().parents[1]
        pollution_model_path = ml_dir / "pollution cause analyzer" / "models" / "xgb_aqi.ubj"

        self.pollution_model = xgb.Booster()
        self.pollution_model.load_model(str(pollution_model_path))

        self.features = [
            'temp_avg_c', 'temp_min_c', 'temp_max_c', 'precip_mm', 'wind_speed_kmh',
            'pressure_hpa', 'hour_of_day', 'day_of_week', 'traffic_vol_median',
            'traffic_intensity', 'is_rush_hour', 'month', 'is_weekday',
            'hour_sin', 'hour_cos', 'month_sin', 'month_cos',
            'wind_dir_sin', 'wind_dir_cos', 'aqi_lag_1h', 'aqi_lag_2h',
            'aqi_lag_3h', 'aqi_lag_6h', 'aqi_roll6h_mean', 'aqi_roll24h_mean',
            'aqi_roll24h_std', 'pm25_lag1h', 'pm1_lag1h', 'traffic_temp_interact'
        ]

    def set_base_inputs(self, base_row: pd.Series):
        self.base_df = base_row.to_frame().T
        self._ensure_dtypes(self.base_df)

    def _ensure_dtypes(self, df: pd.DataFrame):
        """Force correct dtypes"""
        numeric_cols = self.features + ['aqi', 'pm1', 'pm25']

        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

        bool_cols = ['is_rush_hour', 'is_weekday']
        for col in bool_cols:
            if col in df.columns:
                df[col] = df[col].astype(bool)
        return df

    def simulate(self, aqi: float = None, pm25: float = None, pm1: float = None, **overrides):
        if self.base_df is None:
            raise ValueError("Call set_base_inputs first")

        sim_df = self.base_df.copy()

        if aqi is not None:
            sim_df['aqi'] = aqi
            sim_df['aqi_lag_1h'] = aqi  # simplified

        if pm25 is not None:
            sim_df['pm25'] = pm25
            sim_df['pm25_lag1h'] = pm25

        if pm1 is not None:
            sim_df['pm1'] = pm1
            sim_df['pm1_lag1h'] = pm1

        # Apply any extra overrides
        for col, val in overrides.items():
            if col in sim_df.columns:
                sim_df[col] = val

        sim_df = self._ensure_dtypes(sim_df)

        X = sim_df[self.features]

        try:
            dmatrix = xgb.DMatrix(X)
            predicted_aqi = float(self.pollution_model.predict(dmatrix)[0])
        except:
            predicted_aqi = float(sim_df['aqi'].iloc[0])

        base_temp = float(sim_df['temp_avg_c'].iloc[0])
        pollution_factor = (predicted_aqi / 100.0) * 0.18
        predicted_temp = base_temp + pollution_factor

        return {
            'predicted_temp_avg_c': round(float(predicted_temp), 2),
            'base_temp_avg_c': round(base_temp, 2),
            'delta_temp': round(float(predicted_temp - base_temp), 2),
            'new_aqi': round(predicted_aqi, 1),
            'inputs': {
                'aqi': float(sim_df['aqi'].iloc[0]),
                'pm25': float(sim_df['pm25'].iloc[0]),
                'pm1': float(sim_df['pm1'].iloc[0])
            }
        }