import logging
from pathlib import Path

import joblib
import pandas as pd

logger = logging.getLogger("traffic_prediction_service")

MODEL_PATH = (
    Path(__file__).resolve().parents[2]
    / "ml" / "traffic prediction" / "model" / "lightgbm_model.pkl"
)

_bundle = None


def load_bundle():
    global _bundle

    if _bundle is None:
        _bundle = joblib.load(MODEL_PATH)
        logger.info(f"Loaded model bundle from {MODEL_PATH}")

    return _bundle


def get_model():
    return load_bundle()["model"]


def get_rmse() -> float:
    return float(load_bundle()["rmse"])


def get_r2() -> float:
    return float(load_bundle()["r2"])


def predict(input_data: dict) -> float:
    model = get_model()

    df = pd.DataFrame([input_data])
    prediction = model.predict(df)[0]

    return float(prediction)


def predict_batch(data: list[dict]) -> list[float]:
    model = get_model()

    df = pd.DataFrame(data)
    preds = model.predict(df)

    return preds.tolist()

