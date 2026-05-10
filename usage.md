# UrbanPulse Usage Notes

**This file covers how to start and use the application**

### _Prerequisites: have .env files set in /frontend and /backend_
## Start backend

Install dependencies:

```bash
pip install -r ./backend/requirements.txt
```

Run API:

```bash
python -m backend.main
```

Useful URLs:
- After you start the application the `admin` will be able to see the available APIs here `http://localhost:5173/status`
## Start frontend

```bash
npm install --prefix frontend
npm run dev --prefix frontend
```

Frontend URL:
- `http://localhost:5173`

## Import dataset
Create directories:
```bash
mkdir -p ./data/processed -Force
mkdir -p ./frontend/src/imputed -Force
```
Import _imputed_dataset.csv_ to those directories

## Load ML Models

```bash
python "./backend/ml/pollution cause analyzer/train.py"
```
=> Model should appear inside the `./backend/ml/pollution cause analyzer/models` directory

```bash
python "./backend/ml/traffic prediction/train.py"
```
=> Model should appear inside the `./backend/ml/traffic prediction/models` directory

