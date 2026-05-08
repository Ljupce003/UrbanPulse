# ml/scenario_simulator/traffic_temp_to_pollution.py
import pandas as pd
import xgboost as xgb
import pickle
from pathlib import Path


class TrafficTempPollutionSimulator:
    def __init__(self):
        self.base_df = None

        traffic_model_path = Path("ml/traffic prediction/model/lightgbm_model.pkl")
        pollution_model_path = Path("ml/pollution cause analyzer/models/xgb_aqi.ubj")

        with open(traffic_model_path, "rb") as f:
            self.traffic_model = pickle.load(f)

        self.pollution_model = xgb.Booster()
        self.pollution_model.load_model(str(pollution_model_path))

        # IMPORTANT: Define exact features the pollution model expects
        self.pollution_features = [
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
        numeric_cols = self.pollution_features + ['aqi', 'pm1', 'pm25']
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

        bool_cols = ['is_rush_hour', 'is_weekday']
        for col in bool_cols:
            if col in df.columns:
                df[col] = df[col].astype(bool)
        return df

    def simulate(self, traffic_vol_median: float = None,
                 temp_avg_c: float = None,
                 temp_min_c: float = None,
                 temp_max_c: float = None,
                 **other_overrides):

        if self.base_df is None:
            raise ValueError("Call set_base_inputs first")

        sim_df = self.base_df.copy()

        if traffic_vol_median is not None:
            sim_df['traffic_vol_median'] = traffic_vol_median
        if temp_avg_c is not None:
            sim_df['temp_avg_c'] = temp_avg_c
        if temp_min_c is not None:
            sim_df['temp_min_c'] = temp_min_c
        if temp_max_c is not None:
            sim_df['temp_max_c'] = temp_max_c

        for col, val in other_overrides.items():
            if col in sim_df.columns:
                sim_df[col] = val

        if 'traffic_temp_interact' in sim_df.columns:
            sim_df['traffic_temp_interact'] = sim_df['traffic_vol_median'] * sim_df['temp_avg_c']

        sim_df = self._ensure_dtypes(sim_df)

        try:
            traffic_features = ['traffic_vol_median', 'hour_of_day', 'is_rush_hour', 'day_of_week']
            traffic_pred = self.traffic_model.predict(sim_df[traffic_features])
            sim_df['traffic_intensity'] = float(traffic_pred[0])
        except:
            pass

        X = sim_df[self.pollution_features]

        dmatrix = xgb.DMatrix(X)
        pred = self.pollution_model.predict(dmatrix)

        return {
            'predicted_aqi': round(float(pred[0]), 1),
            'base_aqi': round(float(self.base_df['aqi'].iloc[0]), 1),
            'delta_aqi': round(float(pred[0] - self.base_df['aqi'].iloc[0]), 1),
            'inputs': {
                'traffic_vol_median': float(sim_df['traffic_vol_median'].iloc[0]),
                'temp_avg_c': float(sim_df['temp_avg_c'].iloc[0])
            }
        }