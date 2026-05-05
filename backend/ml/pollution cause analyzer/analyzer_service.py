"""
ml/pollution_cause_analyzer/analyzer_service.py
================================================
Production service layer for the Pollution Cause Analyzer.
Loads the trained XGBoost model and SHAP explainer once at startup,
then exposes fast prediction and explanation methods for the app.

Usage:
    from ml.pollution_cause_analyzer.analyzer_service import PollutionAnalyzerService

    service = PollutionAnalyzerService()   # call once (e.g. on app startup)

    result = service.analyze({
        "traffic_intensity": 0.85,
        "is_rush_hour": 1,
        "temp_avg_c": 3.5,
        "wind_speed_kmh": 10.2,
        "pressure_hpa": 1012.0,
        "aqi_lag_1h": 72.0,
        "aqi_roll6h_mean": 68.0,
        # … all features from feature_meta.json
    })

    # result["contributions"] → list of factors with pct and direction
    # result["predicted_aqi"] → float
    # result["aqi_category"]  → "Good" | "Moderate" | "Unhealthy" …
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

MODEL_DIR = Path(__file__).resolve().parent / "models"

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


class PollutionAnalyzerService:
    """
    Singleton-safe service. Instantiate once per process.

    Public methods
    --------------
    analyze(feature_dict)        Full prediction + SHAP percentage breakdown
    predict(feature_dict)        Fast prediction only (no SHAP overhead)
    predict_batch(rows)          Vectorised batch prediction
    health_check()               Readiness probe dict
    feature_stats()              Data stats for UI input validation
    """

    def __init__(self, model_dir: Path = MODEL_DIR):
        self._dir = Path(model_dir)
        self._model: xgb.Booster | None = None
        self._explainer = None
        self._meta: dict = {}
        self._load()


    def _load(self) -> None:
        logger.info("PollutionAnalyzerService: loading models from %s", self._dir)

        self._model = xgb.Booster()
        self._model.load_model(str(self._dir / "xgb_aqi.ubj"))

        self._explainer = joblib.load(self._dir / "shap_explainer.pkl")

        with open(self._dir / "feature_meta.json") as f:
            self._meta = json.load(f)

        logger.info(
            "PollutionAnalyzerService ready — %d features, target: %s",
            len(self.features), self._meta["target"],
        )

    def _row_to_array(self, feature_dict: dict[str, Any]) -> np.ndarray:
        """
        Build a (1, n_features) float32 array in the exact feature order
        the model was trained on. Missing keys are filled with the training mean.
        """
        stats = self._meta.get("data_stats", {})
        row = np.array(
            [
                float(feature_dict.get(f, stats.get(f, {}).get("mean", 0.0)))
                for f in self.features
            ],
            dtype=np.float32,
        ).reshape(1, -1)
        return row

    # ── Public API ─────────────────────────────────────────────────────────────

    @property
    def features(self) -> list[str]:
        return self._meta["features"]

    @property
    def display_names(self) -> dict[str, str]:
        return self._meta.get("display_names", {})

    def predict(self, feature_dict: dict[str, Any]) -> float:
        """Return predicted AQI (float). No SHAP — fastest path."""
        X    = self._row_to_array(feature_dict)
        dmat = xgb.DMatrix(X, feature_names=self.features)
        return round(max(0.0, float(self._model.predict(dmat)[0])), 2)

    def predict_batch(self, rows: list[dict[str, Any]]) -> list[float]:
        """Vectorised batch prediction without SHAP."""
        stats = self._meta.get("data_stats", {})
        X = np.array(
            [
                [float(r.get(f, stats.get(f, {}).get("mean", 0.0))) for f in self.features]
                for r in rows
            ],
            dtype=np.float32,
        )
        dmat  = xgb.DMatrix(X, feature_names=self.features)
        preds = self._model.predict(dmat)
        return [round(max(0.0, float(p)), 2) for p in preds]

    def analyze(self, feature_dict: dict[str, Any]) -> dict:
        """
        Full analysis: prediction + SHAP-based percentage breakdown.

        Returns
        -------
        {
            "predicted_aqi": float,
            "aqi_category": {"category": str, "color": str},
            "base_value": float,          # SHAP expected value
            "dominant_factor": str,       # display name of top contributor
            "contributions": [
                {
                    "factor":     str,    # raw feature name
                    "display":    str,    # human label for the UI
                    "shap_value": float,  # signed contribution in AQI points
                    "pct":        float,  # |contribution| / Σ|contributions| × 100
                    "direction":  str,    # "increase" | "decrease" | "neutral"
                },
                ...                       # sorted by pct descending
            ],
        }
        """
        X    = self._row_to_array(feature_dict)
        dmat = xgb.DMatrix(X, feature_names=self.features)

        predicted_aqi = max(0.0, round(float(self._model.predict(dmat)[0]), 2))

        shap_vals  = self._explainer.shap_values(dmat)   # (1, n_features)
        shap_row   = shap_vals[0]
        base_value = float(self._explainer.expected_value)
        total_abs  = float(np.abs(shap_row).sum())

        contributions = []
        for feat, sv in zip(self.features, shap_row):
            pct = abs(float(sv)) / total_abs * 100 if total_abs > 0 else 0.0
            direction = (
                "increase" if sv >  0.5 else
                "decrease" if sv < -0.5 else
                "neutral"
            )
            contributions.append({
                "factor":     feat,
                "display":    self.display_names.get(feat, feat),
                "shap_value": round(float(sv), 4),
                "pct":        round(pct, 2),
                "direction":  direction,
            })

        contributions.sort(key=lambda x: x["pct"], reverse=True)
        dominant = contributions[0]["display"] if contributions else "Unknown"

        return {
            "predicted_aqi":  predicted_aqi,
            "aqi_category":   get_aqi_category(predicted_aqi),
            "base_value":     round(base_value, 2),
            "dominant_factor": dominant,
            "contributions":  contributions,
        }

    def feature_stats(self) -> dict[str, dict]:
        """Per-feature min/max/mean/std — useful for UI input validation."""
        return self._meta.get("data_stats", {})

    def health_check(self) -> dict:
        return {
            "status":     "ok",
            "model":      "XGBoost",
            "target":     self._meta.get("target"),
            "n_features": len(self.features),
        }
