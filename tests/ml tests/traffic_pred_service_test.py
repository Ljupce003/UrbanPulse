import pytest
import numpy as np
import pandas as pd
from unittest.mock import patch, MagicMock, mock_open
from pathlib import Path



def _make_mock_model(return_value=42.0):
    """Return a mock LGBMRegressor whose predict() always returns return_value."""
    model = MagicMock()
    model.predict.return_value = np.array([return_value])
    return model


def _make_bundle(rmse=10.0, prediction=42.0):
    return {
        "model": _make_mock_model(prediction),
        "rmse": rmse,
    }


SERVICE = "backend.services.traffic_pred_service"

class TestLoadBundle:
    def test_loads_from_disk_on_first_call(self):
        bundle = _make_bundle()
        with patch(f"{SERVICE}._bundle", None), \
             patch(f"{SERVICE}.joblib.load", return_value=bundle) as mock_load:
            import importlib
            import backend.services.traffic_pred_service as svc  # noqa: F401
            # Reset cached bundle
            import backend.services.traffic_pred_service as svc
            svc._bundle = None

            result = svc.load_bundle()

            mock_load.assert_called_once()
            assert result is bundle

    def test_caches_bundle_after_first_load(self):
        bundle = _make_bundle()
        with patch(f"{SERVICE}.joblib.load", return_value=bundle) as mock_load:
            import backend.services.traffic_pred_service as svc
            svc._bundle = None

            svc.load_bundle()
            svc.load_bundle()  # second call — should NOT re-load

            mock_load.assert_called_once()

    def test_returns_cached_bundle_when_already_loaded(self):
        existing_bundle = _make_bundle(rmse=99.0)
        with patch(f"{SERVICE}._bundle", existing_bundle), \
             patch(f"{SERVICE}.joblib.load") as mock_load:
            import backend.services.traffic_pred_service as svc
            svc._bundle = existing_bundle

            result = svc.load_bundle()

            mock_load.assert_not_called()
            assert result is existing_bundle



class TestGetModelAndRmse:
    def test_get_model_returns_model_from_bundle(self):
        bundle = _make_bundle()
        with patch(f"{SERVICE}.load_bundle", return_value=bundle):
            import backend.services.traffic_pred_service as svc
            assert svc.get_model() is bundle["model"]

    def test_get_rmse_returns_float(self):
        bundle = _make_bundle(rmse=7.5)
        with patch(f"{SERVICE}.load_bundle", return_value=bundle):
            import backend.services.traffic_pred_service as svc
            result = svc.get_rmse()

        assert isinstance(result, float)
        assert result == pytest.approx(7.5)

    def test_get_rmse_converts_non_float(self):
        """Ensures int rmse stored in bundle is cast to float."""
        bundle = {"model": _make_mock_model(), "rmse": 5}  # int, not float
        with patch(f"{SERVICE}.load_bundle", return_value=bundle):
            import backend.services.traffic_pred_service as svc
            result = svc.get_rmse()

        assert isinstance(result, float)



class TestPredict:
    def test_returns_float(self):
        model = _make_mock_model(return_value=123.45)
        with patch(f"{SERVICE}.get_model", return_value=model):
            import backend.services.traffic_pred_service as svc
            result = svc.predict({"feature_a": 1, "feature_b": 2})

        assert isinstance(result, float)
        assert result == pytest.approx(123.45)

    def test_passes_input_as_single_row_dataframe(self):
        model = _make_mock_model()
        with patch(f"{SERVICE}.get_model", return_value=model):
            import backend.services.traffic_pred_service as svc
            svc.predict({"speed": 60, "volume": 500})

        called_df = model.predict.call_args[0][0]
        assert isinstance(called_df, pd.DataFrame)
        assert len(called_df) == 1
        assert set(called_df.columns) == {"speed", "volume"}

    def test_empty_input_dict_still_calls_predict(self):
        model = _make_mock_model(return_value=0.0)
        with patch(f"{SERVICE}.get_model", return_value=model):
            import backend.services.traffic_pred_service as svc
            result = svc.predict({})

        model.predict.assert_called_once()
        assert result == pytest.approx(0.0)



class TestPredictBatch:
    def test_returns_list_of_floats(self):
        model = MagicMock()
        model.predict.return_value = np.array([10.0, 20.0, 30.0])
        with patch(f"{SERVICE}.get_model", return_value=model):
            import backend.services.traffic_pred_service as svc
            result = svc.predict_batch([
                {"feature": 1},
                {"feature": 2},
                {"feature": 3},
            ])

        assert isinstance(result, list)
        assert result == pytest.approx([10.0, 20.0, 30.0])

    def test_batch_dataframe_has_correct_row_count(self):
        model = MagicMock()
        model.predict.return_value = np.array([1.0, 2.0])
        records = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        with patch(f"{SERVICE}.get_model", return_value=model):
            import backend.services.traffic_pred_service as svc
            svc.predict_batch(records)

        called_df = model.predict.call_args[0][0]
        assert len(called_df) == 2

    def test_single_item_batch(self):
        model = MagicMock()
        model.predict.return_value = np.array([55.5])
        with patch(f"{SERVICE}.get_model", return_value=model):
            import backend.services.traffic_pred_service as svc
            result = svc.predict_batch([{"x": 1}])

        assert result == pytest.approx([55.5])

    def test_empty_batch_returns_empty_list(self):
        model = MagicMock()
        model.predict.return_value = np.array([])
        with patch(f"{SERVICE}.get_model", return_value=model):
            import backend.services.traffic_pred_service as svc
            result = svc.predict_batch([])

        assert result == []




class TestCalculateAccuracy:
    """Pure function — no mocking needed."""

    def _accuracy(self, rmse, y_mean):
        import backend.services.traffic_pred_service as svc
        return svc.calculate_accuracy(rmse, y_mean)

    def test_perfect_model_gives_100_percent(self):
        assert self._accuracy(rmse=0.0, y_mean=100.0) == pytest.approx(100.0)

    def test_typical_values(self):
        assert self._accuracy(rmse=10.0, y_mean=100.0) == pytest.approx(90.0)

    def test_zero_mean_returns_zero(self):
        assert self._accuracy(rmse=5.0, y_mean=0.0) == pytest.approx(0.0)

    def test_accuracy_floored_at_zero_when_rmse_exceeds_mean(self):
        result = self._accuracy(rmse=200.0, y_mean=100.0)
        assert result == pytest.approx(0.0)

    def test_return_type_is_float(self):
        result = self._accuracy(rmse=5, y_mean=50)
        assert isinstance(result, float)

    def test_result_is_rounded_to_two_decimal_places(self):
        result = self._accuracy(rmse=1.0, y_mean=3.0)
        assert result == pytest.approx(66.67, abs=0.01)

    def test_small_rmse_relative_to_mean(self):
        result = self._accuracy(rmse=0.5, y_mean=1000.0)
        assert result == pytest.approx(99.95)

    @pytest.mark.parametrize("rmse,mean,expected", [
        (0,   50,  100.0),
        (25,  50,   50.0),
        (50,  50,    0.0),
        (100, 50,    0.0),   # clamped
    ])
    def test_parametrized_accuracy(self, rmse, mean, expected):
        assert self._accuracy(rmse=rmse, y_mean=mean) == pytest.approx(expected)