"""
ml/pollution_cause_analyzer/analyzer_service.py
================================================
Production service layer for the Pollution Cause Analyzer.
Uses plain functions instead of a class.

Usage:
    from ml.pollution_cause_analyzer.analyzer_service import (
        load_analyzer, analyze, predict, predict_batch,
        feature_stats, health_check
    )

    # Call once at startup
    load_analyzer()

    result = analyze({
        "traffic_intensity": 0.85,
        "temp_avg_c": 3.5,
        # ... other features
    })
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import xgboost as xgb

logger = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).resolve().parent.parent / "ml" / "pollution cause analyzer" / "models"

_model: xgb.Booster | None = None
_explainer = None
_meta: dict = {}

AQI_CATEGORIES = [
    (0,   50,   "Good",                            "#00e400"),
    (51,  100,  "Moderate",                        "#ffff00"),
    (101, 150,  "Unhealthy for Sensitive Groups",  "#ff7e00"),
    (151, 200,  "Unhealthy",                       "#ff0000"),
    (201, 300,  "Very Unhealthy",                  "#8f3f97"),
    (301, 9999, "Hazardous",                       "#7e0023"),
]


def get_aqi_category(aqi: float) -> dict[str, str]:
    for lo, hi, label, color in AQI_CATEGORIES:
        if lo <= aqi <= hi:
            return {"category": label, "color": color}
    return {"category": "Hazardous", "color": "#7e0023"}


def load_analyzer(model_dir: Path | None = None) -> None:
    """Load model, explainer and metadata. Call this once at app startup."""
    global _model, _explainer, _meta

    if model_dir is None:
        model_dir = MODEL_DIR

    logger.info("Loading Pollution Analyzer models from %s", model_dir)

    _model = xgb.Booster()
    _model.load_model(str(model_dir / "xgb_aqi.ubj"))

    _explainer = joblib.load(model_dir / "shap_explainer.pkl")

    with open(model_dir / "feature_meta.json") as f:
        _meta = json.load(f)

    logger.info(
        "PollutionAnalyzer loaded successfully — %d features, target: %s",
        len(get_features()), _meta.get("target")
    )


def _get_row_array(feature_dict: dict[str, Any]) -> np.ndarray:
    """Convert feature dict to array in correct order."""
    stats = _meta.get("data_stats", {})
    features = get_features()

    row = np.array(
        [
            float(feature_dict.get(f, stats.get(f, {}).get("mean", 0.0)))
            for f in features
        ],
        dtype=np.float32,
    ).reshape(1, -1)
    return row


def get_features() -> list[str]:
    return _meta.get("features", [])


def get_display_names() -> dict[str, str]:
    return _meta.get("display_names", {})


def predict(feature_dict: dict[str, Any]) -> float:
    """Fast prediction only."""
    if _model is None:
        load_analyzer()

    X = _get_row_array(feature_dict)
    dmat = xgb.DMatrix(X, feature_names=get_features())
    pred = float(_model.predict(dmat)[0])
    return round(max(0.0, pred), 2)


def predict_batch(rows: list[dict[str, Any]]) -> list[float]:
    """Batch prediction."""
    if _model is None:
        load_analyzer()

    stats = _meta.get("data_stats", {})
    features = get_features()

    X = np.array(
        [
            [float(r.get(f, stats.get(f, {}).get("mean", 0.0))) for f in features]
            for r in rows
        ],
        dtype=np.float32,
    )
    dmat = xgb.DMatrix(X, feature_names=features)
    preds = _model.predict(dmat)
    return [round(max(0.0, float(p)), 2) for p in preds]


def analyze(feature_dict: dict[str, Any]) -> dict:
    """Full analysis with prediction + SHAP contributions."""
    if _model is None or _explainer is None:
        load_analyzer()

    X = _get_row_array(feature_dict)
    dmat = xgb.DMatrix(X, feature_names=get_features())

    predicted_aqi = round(max(0.0, float(_model.predict(dmat)[0])), 2)

    shap_vals = _explainer.shap_values(dmat)   # (1, n_features)
    shap_row = shap_vals[0]
    base_value = float(_explainer.expected_value)
    total_abs = float(np.abs(shap_row).sum())

    contributions = []
    for feat, sv in zip(get_features(), shap_row):
        pct = abs(float(sv)) / total_abs * 100 if total_abs > 0 else 0.0
        direction = (
            "increase" if sv > 0.5 else
            "decrease" if sv < -0.5 else
            "neutral"
        )
        contributions.append({
            "factor": feat,
            "display": get_display_names().get(feat, feat),
            "shap_value": round(float(sv), 4),
            "pct": round(pct, 2),
            "direction": direction,
        })

    contributions.sort(key=lambda x: x["pct"], reverse=True)
    dominant = contributions[0]["display"] if contributions else "Unknown"

    return {
        "predicted_aqi": predicted_aqi,
        "aqi_category": get_aqi_category(predicted_aqi),
        "base_value": round(base_value, 2),
        "dominant_factor": dominant,
        "contributions": contributions,
    }


def feature_stats() -> dict[str, dict]:
    """Return training statistics for each feature."""
    return _meta.get("data_stats", {})


def health_check() -> dict:
    """Health check for monitoring / readiness probes."""
    return {
        "status": "ok",
        "model": "XGBoost",
        "target": _meta.get("target"),
        "n_features": len(get_features()),
        "loaded": _model is not None,
    }

