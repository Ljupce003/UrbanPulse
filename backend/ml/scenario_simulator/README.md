## Simulators role

Simulator 1: traffic + temperature → pollution (AQI/PM2.5)
Simulator 2: pollution → temperature effect

### Inputs per simulator
- Inputs for sim 1: ```traffic_vol_median, traffic_intensity, is_rush_hour, temp_avg_c, traffic_temp_interact```
- Input for sim 2: ```aqi, pm25, pm1 → predict temp_avg_c```