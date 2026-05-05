"""
test_analyzer.py - Quick test for Pollution Analyzer Service
"""
from backend.services.analyzer_service import load_analyzer, health_check, analyze, predict


def test_analyzer():
    print("🚀 Testing Pollution Analyzer Service...\n")

    load_analyzer()
    print("✅ Model loaded successfully!\n")

    sample_input = {
        "traffic_intensity": 0.78,
        "is_rush_hour": 1,
        "temp_avg_c": 5.2,
        "wind_speed_kmh": 8.5,
        "pressure_hpa": 1015.0,
        "aqi_lag_1h": 65.0,
        "aqi_lag_3h": 62.0,
        "traffic_temp_interact": 0.12
    }

    print("📊 Health Check:")
    print(health_check())
    print()

    print("🔮 Single Prediction:")
    pred = predict(sample_input)
    print(f"Predicted AQI: {pred}\n")

    print("📈 Full Analysis:")
    result = analyze(sample_input)

    print(f"Predicted AQI : {result['predicted_aqi']}")
    print(f"Category      : {result['aqi_category']['category']}")
    print(f"Dominant Factor: {result['dominant_factor']}\n")

    print("🔝 Top 5 Contributions:")
    for contrib in result["contributions"][:5]:
        print(f"  • {contrib['display']:25} | {contrib['pct']:5.1f}% | {contrib['direction']}")

    print("\n" + "="*60)
    print("✅ Test completed successfully!")


if __name__ == "__main__":
    test_analyzer()