## Simulators

**Simulator 1**: Traffic + Temperature → Pollution (AQI/PM)  
**Simulator 2**: Pollution → Temperature effect

### Inputs
- **Sim 1**: `traffic_vol_median`, `temp_avg_c` (auto-updates interaction)
- **Sim 2**: `aqi`, `pm25`, `pm1`

Both automatically use latest row from `imputed_dataset.csv`.