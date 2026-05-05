import logging
from pathlib import Path

import numpy as np
import pandas as pd
import lightgbm as lgb
import optuna
import joblib

from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error


ROOT = Path(__file__).resolve().parents[3]
DATA_PATH = ROOT / "data" / "processed" / "imputed_dataset.csv"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)

logger = logging.getLogger("traffic_prediction")

df = pd.read_csv(DATA_PATH)

TARGET = "traffic_vol_median"

X = df.drop(columns=[TARGET, "timestamp"])
y = df[TARGET]

X_train, X_valid, y_train, y_valid = train_test_split(
    X, y, test_size=0.2, random_state=42
)


def objective(trial):

    params = {
        "objective": "regression",
        "metric": "rmse",
        "verbosity": -1,
        "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.2, log=True),
        "num_leaves": trial.suggest_int("num_leaves", 20, 200),
        "max_depth": trial.suggest_int("max_depth", 3, 12),
        "min_child_samples": trial.suggest_int("min_child_samples", 5, 100),
        "subsample": trial.suggest_float("subsample", 0.6, 1.0),
        "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
        "reg_alpha": trial.suggest_float("reg_alpha", 0.0, 10.0),
        "reg_lambda": trial.suggest_float("reg_lambda", 0.0, 10.0)
    }

    model = lgb.LGBMRegressor(**params, n_estimators=1000)

    model.fit(
        X_train,
        y_train,
        eval_set=[(X_valid, y_valid)],
        eval_metric="rmse",
        callbacks=[lgb.early_stopping(50, verbose=False)]
    )

    preds = model.predict(X_valid)
    rmse = np.sqrt(mean_squared_error(y_valid, preds))

    return rmse


study = optuna.create_study(direction="minimize")
study.optimize(objective, n_trials=30)

best_params = study.best_params

model = lgb.LGBMRegressor(
    **best_params,
    n_estimators=1000
)

model.fit(X_train, y_train)

preds = model.predict(X_valid)
rmse = np.sqrt(mean_squared_error(y_valid, preds))

MODEL_DIR = Path(__file__).resolve().parent / "model"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

MODEL_PATH = MODEL_DIR / "lightgbm_model.pkl"

joblib.dump({
    "model": model,
    "rmse": rmse
}, MODEL_PATH)
logger.info(f"Saved model to {MODEL_PATH}")

logger.info(study.best_value)
logger.info(study.best_params)
logger.info(rmse)
logger.info(MODEL_PATH)