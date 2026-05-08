from backend.ml.scenario_simulator.traffic_pollution_simulator import (
    simulate as _sim_traffic,
    build_baseline as _baseline_traffic,
)
from backend.ml.scenario_simulator.pollution_temperature_simulator import (
    simulate as _sim_pollution,
    build_baseline as _baseline_pollution,
)

_baseline_t = None
_baseline_p = None


def _get_baseline_traffic():
    global _baseline_t
    if _baseline_t is None:
        _baseline_t = _baseline_traffic()
    return _baseline_t


def _get_baseline_pollution():
    global _baseline_p
    if _baseline_p is None:
        _baseline_p = _baseline_pollution()
    return _baseline_p


def run_traffic_pollution_simulation(
    traffic_vol_median: float,
    traffic_intensity: float,
    is_rush_hour: bool,
    temp_avg_c: float,
) -> dict:
    return _sim_traffic(
        baseline=_get_baseline_traffic(),
        traffic_vol_median=traffic_vol_median,
        traffic_intensity=traffic_intensity,
        is_rush_hour=is_rush_hour,
        temp_avg_c=temp_avg_c,
    )


def run_pollution_temperature_simulation(
    aqi: float,
    pm25: float,
    pm1: float,
) -> dict:
    return _sim_pollution(
        baseline=_get_baseline_pollution(),
        aqi=aqi,
        pm25=pm25,
        pm1=pm1,
    )