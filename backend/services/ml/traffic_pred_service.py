import logging
from pathlib import Path

import joblib
import pandas as pd


logger = logging.getLogger("traffic_prediction_service")

MODEL_PATH = (
    Path(__file__).resolve().parents[2]
    / "model"
    / "lightgbm_model.pkl"
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


def get_rmse():
    return float(load_bundle()["rmse"])


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


def calculate_accuracy(rmse: float, y_mean: float) -> float:
    if y_mean == 0:
        return 0.0

    error_ratio = rmse / y_mean
    accuracy = (1 - error_ratio) * 100

    return float(max(0.0, round(accuracy, 2)))



