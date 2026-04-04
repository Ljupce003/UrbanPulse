# UrbanPulse

## Overview

This project is a web-based application designed to analyze the relationship between traffic conditions, weather factors, and air pollution using real-world data.

The system goes beyond simple data visualization by identifying patterns, generating predictions, and providing practical recommendations. Its main purpose is to help users better understand how everyday factors influence urban conditions such as congestion and air quality.

---

## Key Features

### Dashboard

* Displays current air quality index (AQI), weather conditions, and traffic status
* Provides a summarized view of key indicators
* Uses color-coded indicators for pollution levels
* Shows last update timestamp and system status

### Data Visualization

* Time-series charts for traffic, AQI, and temperature
* Selectable time ranges (24 hours, 7 days, 30 days)
* Comparison between predicted and actual values
* Custom date range filtering

### Pollution Cause Analyzer

* Breaks down the contribution of different factors (traffic, weather, etc.)
* Helps explain why pollution levels change at a specific moment

### Scenario Simulator

* Allows users to adjust parameters such as rainfall and traffic volume
* Displays real-time impact on pollution and traffic
* Supports comparison with baseline values

### Predictions & Recommendations

* Traffic prediction using machine learning models
* Displays model accuracy
* Generates daily travel recommendations
* Integrates AI-based recommendations via external LLM APIs

### User and Role Management

* **General User** – view-only access
* **Analyst** – dataset upload and model-related actions
* **Admin** – user and role management
* Secure authentication using JWT

---

## System Architecture

* **Frontend:** React (hosted on Vercel or Cloudflare Pages)
* **Backend:** API and processing logic deployed on AWS (EC2)
* **Database:** Supabase (PostgreSQL)
* **Authentication:** Supabase Auth with JWT
* **Background Processing:** Scheduled tasks for data normalization

---

## API Overview

### Dashboard & Visualization

* `GET /api/dashboard/summary` – current AQI, weather, traffic
* `GET /api/historical-data` – time-series data
* `GET /api/predictions/compare` – predicted vs actual

### Analytics & Simulation

* `GET /api/analyzer/cause` – pollution factor breakdown
* `POST /api/simulator/calculate` – scenario simulation

### Predictions & AI

* `GET /api/recommendations/daily` – travel recommendations
* `GET /api/predictions/accuracy` – model performance

### Data & User Management

* `POST /api/data/upload` – dataset upload
* `POST /api/data/normalize` – trigger data processing
* `PATCH /api/admin/users/{id}/role` – role updates

### Authentication

* `POST /api/v1/auth/signup`
* `POST /api/v1/auth/login`
* `POST /api/v1/auth/logout`
* `GET /api/v1/auth/user`

---

## Non-Functional Requirements

* Accessible via browser (no installation required)
* Responsive design for desktop and mobile
* Dashboard load time under 3 seconds
* Secure communication via HTTPS
* JWT-based authentication and role-based access control
* Input validation and data quality checks
* No personally identifiable information shared with external AI services

---

## Project Goal

The main objective of this project is to combine data analysis, machine learning, and user-centered design into a single system that provides both insights and practical value.

Instead of only presenting raw data, the application focuses on helping users understand cause-and-effect relationships and make better decisions based on predictions and recommendations.

---

## Team

EN 06
