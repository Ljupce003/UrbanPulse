from __future__ import annotations

import logging
from fastapi import APIRouter, HTTPException, Query

from backend.models.pollution_analyzer import (
    AnalyzeResponse,
    PollutionFeatures,
    PredictResponse,
    BatchPredictResponse,
    BatchPredictRequest,
    ContributionSummaryItem,
)
from backend.services.ml.analyzer_service import (
    analyze,
    predict,
    get_aqi_category,
    predict_batch,
    feature_stats,
    health_check,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Pollution Cause Analyzer"])


@router.post(
    "/analyzer/cause",
    response_model=AnalyzeResponse,
    summary="Pollution factor breakdown — full SHAP analysis",
)
async def get_cause_analysis(body: PollutionFeatures):
    """
    Returns a predicted AQI and a ranked list of factors showing how much
    each environmental / traffic variable contributed to the prediction.

    - **direction** `increase` → the factor pushed AQI up (worse air)
    - **direction** `decrease` → the factor reduced AQI (cleaner air)
    - **direction** `neutral`  → negligible contribution (|SHAP| ≤ 0.5)

    Lag and rolling-window features are excluded from the contribution list
    to keep results interpretable for end users.
    """
    try:
        result = analyze(body.to_feature_dict())
        return result
    except Exception as exc:
        logger.exception("analyze() failed")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post(
    "/analyzer/cause/predict",
    response_model=PredictResponse,
    summary="Fast AQI prediction (no SHAP)",
)
async def predict_aqi(body: PollutionFeatures):
    """
    Lightweight endpoint — returns only the predicted AQI and its category.
    Use when SHAP explanations are not needed (e.g. real-time dashboards).
    """
    try:
        predicted_aqi = predict(body.to_feature_dict())
        return {
            "predicted_aqi": predicted_aqi,
            "aqi_category": get_aqi_category(predicted_aqi),
        }
    except Exception as exc:
        logger.exception("predict() failed")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post(
    "/analyzer/cause/predict/batch",
    response_model=BatchPredictResponse,
    summary="Batch AQI predictions (up to 500 records)",
)
async def predict_aqi_batch(body: BatchPredictRequest):
    """
    Accepts a list of feature records and returns a prediction for each.
    Records are processed in a single model call for efficiency.
    """
    try:
        feature_dicts = [r.to_feature_dict() for r in body.records]
        preds = predict_batch(feature_dicts)
        predictions = [
            {"predicted_aqi": p, "aqi_category": get_aqi_category(p)}
            for p in preds
        ]
        return {"predictions": predictions, "count": len(predictions)}
    except Exception as exc:
        logger.exception("predict_batch() failed")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post(
    "/analyzer/cause/top-contributors",
    response_model=list[ContributionSummaryItem],
    summary="Top N factors driving air pollution across multiple records",
)
async def get_top_contributors(
        body: BatchPredictRequest,
        top_n: int = Query(default=10, ge=1, le=50, description="How many top factors to return"),
):
    """
    Runs a full SHAP analysis on each record, then aggregates results to
    surface the **most impactful factors across the batch**.

    Useful for answering: *"Over the last 24 h, what drove pollution the most?"*

    Returns factors ranked by average SHAP contribution percentage,
    with the most common direction (increase / decrease / neutral) per factor.
    """
    try:
        feature_dicts = [r.to_feature_dict() for r in body.records]

        factor_data: dict[str, dict] = {}

        for fd in feature_dicts:
            result = analyze(fd)
            for c in result["contributions"]:
                key = c["factor"]
                if key not in factor_data:
                    factor_data[key] = {
                        "display": c["display"],
                        "pct_sum": 0.0,
                        "shap_sum": 0.0,
                        "count": 0,
                        "directions": [],
                    }
                factor_data[key]["pct_sum"] += c["pct"]
                factor_data[key]["shap_sum"] += c["shap_value"]
                factor_data[key]["count"] += 1
                factor_data[key]["directions"].append(c["direction"])

        summaries = []
        for factor, data in factor_data.items():
            n = data["count"]
            dirs = data["directions"]
            dominant_dir = max(set(dirs), key=dirs.count)
            summaries.append({
                "factor": factor,
                "display": data["display"],
                "avg_pct": round(data["pct_sum"] / n, 2),
                "avg_shap": round(data["shap_sum"] / n, 4),
                "dominant_direction": dominant_dir,
            })

        summaries.sort(key=lambda x: x["avg_pct"], reverse=True)
        ranked = [{"rank": i + 1, **s} for i, s in enumerate(summaries[:top_n])]
        return ranked

    except Exception as exc:
        logger.exception("top_contributors() failed")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get(
    "/analyzer/cause/features/stats",
    summary="Training-set statistics for all features",
)
async def get_feature_stats():
    """
    Returns mean, std, min, and max for every feature computed during
    training. Useful for input validation or building UI sliders.
    """
    try:
        return feature_stats()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get(
    "/analyzer/cause/health",
    summary="Readiness / health check",
)
async def get_health():
    """Returns model load status and basic metadata."""
    return health_check()