# Pollution Cause Analyzer — ML Module

## Setup
```bash
pip install xgboost shap scikit-learn optuna pandas numpy joblib
```

## Usage

```bash
# Step 1 — merge the 3 source CSVs into a single feature file
run backend/ml/pollution cause analyzer/preprocessor.py

# Step 2 — train the model and save all artefacts to models/
run backend/ml/pollution cause analyzer/train.py
```

## Files

- **preprocessor.py** — merges `pollution.csv`, `weather.csv`, and `traffic.csv` into a single model-ready feature file at `data/processed/merged_features.csv`
- **train.py** — trains XGBoost on the merged features with Optuna hyperparameter tuning and saves the model, SHAP explainer, feature metadata, and training report to `models/`
- **analyzer_service.py** — service layer imported by the app; loads the saved models once at startup and exposes `analyze()`, `predict()`, and `predict_batch()` methods
- **models/xgb_aqi.ubj** — the trained XGBoost model in binary JSON format
- **models/shap_explainer.pkl** — the pre-fitted SHAP TreeExplainer used to generate per-factor percentage breakdowns
- **models/feature_meta.json** — feature names, display labels, and data statistics used by the service layer
- **models/training_report.json** — training metrics, best hyperparameters, and global SHAP feature importances

> `models/` is generated at runtime — only the Python files need to be committed. Run both steps above on a fresh clone to populate it.
