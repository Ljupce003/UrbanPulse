"""
ml/pollution_cause_analyzer/train.py
=====================================
Trains XGBoost on the merged feature dataset to predict AQI composite.
Hyperparameters are optimised with Optuna (50 trials, TPE sampler).
All artefacts are saved to ml/pollution_cause_analyzer/models/.

Run:
    python train.py                    # uses default data path
    python train.py --data /path/to/merged_features.csv
"""

from __future__ import annotations

import argparse
import json
import warnings
from pathlib import Path

import joblib
import numpy as np
import optuna
import pandas as pd
import shap
import xgboost as xgb
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

warnings.filterwarnings("ignore")
optuna.logging.set_verbosity(optuna.logging.WARNING)

ROOT      = Path(__file__).resolve().parent.parent.parent
DATA_PATH = ROOT / "data" / "processed" / "merged_features.csv"
MODEL_DIR = Path(__file__).resolve().parent / "models"

TARGET    = "aqi"
DROP_COLS = {
    "timestamp", "aqi",
    # raw pollutant values — they're inputs to AQI, not causal features
    "pm25", "pm1", "o3", "no2", "so2", "co",
    # redundant raw columns replaced by cyclic encodings
    "wind_dir_deg",
    # keep lag versions of pollutants as features
}

DISPLAY_NAMES: dict[str, str] = {
    "traffic_intensity":      "Traffic Intensity",
    "traffic_vol_median":     "Traffic Volume",
    "is_rush_hour":           "Rush Hour",
    "is_weekday":             "Weekday",
    "hour_of_day":            "Hour of Day",
    "hour_sin":               "Hour (cyclic)",
    "hour_cos":               "Hour (cyclic)",
    "day_of_week":            "Day of Week",
    "month":                  "Month",
    "month_sin":              "Season (cyclic)",
    "month_cos":              "Season (cyclic)",
    "temp_avg_c":             "Temperature",
    "temp_min_c":             "Min Temperature",
    "temp_max_c":             "Max Temperature",
    "precip_mm":              "Precipitation",
    "wind_speed_kmh":         "Wind Speed",
    "wind_dir_sin":           "Wind Direction",
    "wind_dir_cos":           "Wind Direction",
    "pressure_hpa":           "Atmospheric Pressure",
    "aqi_lag_1h":             "AQI (1h ago)",
    "aqi_lag_2h":             "AQI (2h ago)",
    "aqi_lag_3h":             "AQI (3h ago)",
    "aqi_lag_6h":             "AQI (6h ago)",
    "aqi_lag_12h":            "AQI (12h ago)",
    "aqi_lag_24h":            "AQI (24h ago)",
    "aqi_roll6h_mean":        "AQI 6h Avg",
    "aqi_roll24h_mean":       "AQI 24h Avg",
    "aqi_roll24h_std":        "AQI 24h Volatility",
    "pm25_lag1h":             "PM2.5 (1h ago)",
    "pm1_lag1h":              "PM1 (1h ago)",
    "o3_lag1h":               "Ozone (1h ago)",
    "no2_lag1h":              "NO₂ (1h ago)",
    "traffic_temp_interact":  "Traffic × Temperature",
}



def temporal_split(df: pd.DataFrame):
    """Chronological 70/15/15 split — no data leakage."""
    n = len(df)
    return (
        df.iloc[:int(n * 0.70)],
        df.iloc[int(n * 0.70):int(n * 0.85)],
        df.iloc[int(n * 0.85):],
    )


def split_xy(df: pd.DataFrame, features: list[str]):
    X = df[features].values.astype(np.float32)
    y = df[TARGET].values.astype(np.float32)
    return X, y


def evaluate(model: xgb.Booster, X, y, features, label=""):
    dmat  = xgb.DMatrix(X, label=y, feature_names=features)
    preds = model.predict(dmat)
    mae   = mean_absolute_error(y, preds)
    rmse  = mean_squared_error(y, preds) ** 0.5
    r2    = r2_score(y, preds)
    print(f"  [{label}] MAE={mae:.3f}  RMSE={rmse:.3f}  R²={r2:.4f}")
    return {"mae": round(mae, 4), "rmse": round(rmse, 4), "r2": round(float(r2), 4)}



def make_objective(X_tr, y_tr, X_val, y_val, features):
    dtrain = xgb.DMatrix(X_tr,  label=y_tr,  feature_names=features)
    dval   = xgb.DMatrix(X_val, label=y_val, feature_names=features)

    def objective(trial):
        params = {
            "objective":        "reg:squarederror",
            "tree_method":      "hist",
            "eval_metric":      "rmse",
            "verbosity":        0,
            "seed":             42,
            "max_depth":        trial.suggest_int("max_depth", 3, 8),
            "learning_rate":    trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
            "subsample":        trial.suggest_float("subsample", 0.5, 1.0),
            "colsample_bytree": trial.suggest_float("colsample_bytree", 0.4, 1.0),
            "min_child_weight": trial.suggest_int("min_child_weight", 1, 10),
            "gamma":            trial.suggest_float("gamma", 0.0, 5.0),
            "reg_alpha":        trial.suggest_float("reg_alpha", 1e-4, 10.0, log=True),
            "reg_lambda":       trial.suggest_float("reg_lambda", 1e-4, 10.0, log=True),
        }
        n_rounds = trial.suggest_int("n_estimators", 100, 800, step=50)
        model = xgb.train(
            params, dtrain,
            num_boost_round=n_rounds,
            evals=[(dval, "val")],
            early_stopping_rounds=25,
            verbose_eval=False,
        )
        return mean_squared_error(y_val, model.predict(dval)) ** 0.5

    return objective



def train(data_path: Path = DATA_PATH):
    print("=" * 58)
    print("  Pollution Cause Analyzer — Training Pipeline")
    print("=" * 58)

    df = pd.read_csv(data_path)
    print(f"\nLoaded {len(df):,} rows × {len(df.columns)} columns")

    features = [
        c for c in df.columns
        if c not in DROP_COLS and pd.api.types.is_numeric_dtype(df[c])
    ]
    print(f"Features ({len(features)}): {features}")

    # 3. Drop rows with NaN in any feature or target
    df = df[features + [TARGET]].dropna().reset_index(drop=True)
    print(f"After dropna: {len(df):,} rows")

    if len(df) < 50:
        raise ValueError(
            f"Only {len(df)} clean rows found after merging — "
            "make sure your CSVs have an overlapping date range."
        )

    train_df, val_df, test_df = temporal_split(df)
    X_tr,  y_tr  = split_xy(train_df, features)
    X_val, y_val = split_xy(val_df,   features)
    X_te,  y_te  = split_xy(test_df,  features)
    print(f"Split → train:{len(X_tr):,}  val:{len(X_val):,}  test:{len(X_te):,}")

    print(f"\nRunning Optuna (50 trials)…")
    study = optuna.create_study(
        direction="minimize",
        sampler=optuna.samplers.TPESampler(seed=42),
        pruner=optuna.pruners.MedianPruner(n_startup_trials=8),
    )
    study.optimize(
        make_objective(X_tr, y_tr, X_val, y_val, features),
        n_trials=50,
    )
    best = study.best_params
    print(f"  Best val RMSE : {study.best_value:.4f}")
    print(f"  Best params   : {best}")

    n_rounds = best.pop("n_estimators")
    final_params = {
        **best,
        "objective":   "reg:squarederror",
        "tree_method": "hist",
        "verbosity":   0,
        "seed":        42,
    }
    X_full = np.vstack([X_tr, X_val])
    y_full = np.concatenate([y_tr, y_val])
    dfull  = xgb.DMatrix(X_full, label=y_full, feature_names=features)
    model  = xgb.train(final_params, dfull, num_boost_round=n_rounds)

    print("\nEvaluation:")
    train_m = evaluate(model, X_tr,  y_tr,  features, "train")
    val_m   = evaluate(model, X_val, y_val, features, "val")
    test_m  = evaluate(model, X_te,  y_te,  features, "test")

    print("\nBuilding SHAP TreeExplainer…")
    rng  = np.random.default_rng(42)
    bg   = X_tr[rng.choice(len(X_tr), min(500, len(X_tr)), replace=False)]
    explainer = shap.TreeExplainer(model)

    sv   = explainer.shap_values(xgb.DMatrix(bg, feature_names=features))
    mean_abs = np.abs(sv).mean(axis=0)
    total    = mean_abs.sum()
    shap_imp = {
        f: round(float(v / total * 100), 2)
        for f, v in zip(features, mean_abs)
    }
    shap_imp = dict(sorted(shap_imp.items(), key=lambda x: x[1], reverse=True))

    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    model_path = MODEL_DIR / "xgb_aqi.ubj"
    model.save_model(str(model_path))

    explainer_path = MODEL_DIR / "shap_explainer.pkl"
    joblib.dump(explainer, explainer_path, compress=3)

    data_stats = {
        f: {
            "mean": round(float(df[f].mean()), 4),
            "std":  round(float(df[f].std()),  4),
            "min":  round(float(df[f].min()),  4),
            "max":  round(float(df[f].max()),  4),
        }
        for f in features
    }
    meta = {
        "features":      features,
        "target":        TARGET,
        "display_names": DISPLAY_NAMES,
        "data_stats":    data_stats,
        "target_stats": {
            "mean": round(float(df[TARGET].mean()), 4),
            "std":  round(float(df[TARGET].std()),  4),
            "min":  round(float(df[TARGET].min()),  4),
            "max":  round(float(df[TARGET].max()),  4),
        },
    }
    with open(MODEL_DIR / "feature_meta.json", "w") as f:
        json.dump(meta, f, indent=2)

    # Training report
    report = {
        "model":              "XGBoost",
        "target":             TARGET,
        "n_features":         len(features),
        "n_estimators_final": n_rounds,
        "best_params":        {**best, "n_estimators": n_rounds},
        "optuna_best_rmse":   round(study.best_value, 4),
        "metrics": {
            "train": train_m,
            "val":   val_m,
            "test":  test_m,
        },
        "shap_importance_pct": shap_imp,
    }
    with open(MODEL_DIR / "training_report.json", "w") as f:
        json.dump(report, f, indent=2)

    print(f"\nSaved artefacts to {MODEL_DIR}/")
    print(f"  xgb_aqi.ubj          ({model_path.stat().st_size // 1024} KB)")
    print(f"  shap_explainer.pkl   ({explainer_path.stat().st_size // 1024} KB)")
    print(f"  feature_meta.json")
    print(f"  training_report.json")

    print(f"\n{'='*58}")
    print(f"  Done.  Test R²={test_m['r2']:.4f}  MAE={test_m['mae']:.2f} AQI pts")
    print(f"{'='*58}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=DATA_PATH)
    args = parser.parse_args()
    train(args.data)
