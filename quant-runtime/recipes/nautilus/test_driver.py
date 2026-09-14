"""Permission-boundary tests; no exchange connection or engine installation required."""

import copy
import json
from pathlib import Path
import tempfile
import unittest

import driver


HERE = Path(__file__).parent


class NativeConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.paper = json.loads((HERE / "paper.example.json").read_text())
        self.request = {"action": "start", "config": {"name": "Research", **self.paper["requestConfig"]}}

    def test_approved_binding_accepts_name_change_but_rejects_risk_change(self):
        driver.validate_binding(self.request, self.paper)
        self.request["config"]["stakeAmount"] = 1000
        with self.assertRaisesRegex(driver.ConfigurationError, "stakeAmount"):
            driver.validate_binding(self.request, self.paper)

    def test_boolean_does_not_match_approved_numeric_limit(self):
        self.request["config"]["maxOpenTrades"] = True
        with self.assertRaisesRegex(driver.ConfigurationError, "maxOpenTrades"):
            driver.validate_binding(self.request, self.paper)

    def test_paper_cannot_load_exchange_execution_client(self):
        native = self.paper["node"]
        driver.validate_live_node(native, "paper")
        native["exec_clients"]["BINANCE"]["path"] = driver.EXEC_PATH
        with self.assertRaisesRegex(driver.ConfigurationError, "connector type"):
            driver.validate_live_node(native, "paper")

    def test_client_secrets_cannot_be_embedded_in_native_config(self):
        self.paper["node"]["data_clients"]["BINANCE"]["config"]["api_secret"] = "secret"
        with self.assertRaisesRegex(driver.ConfigurationError, "credentials"):
            driver.validate_live_node(self.paper["node"], "paper")

    def test_live_requires_review_reconciliation_and_non_example_strategy(self):
        native = self.paper["node"]
        self.request["config"]["mode"] = "live"
        self.paper["requestConfig"]["mode"] = "live"
        with self.assertRaisesRegex(driver.ConfigurationError, "reviewed"):
            driver.validate_binding(self.request, self.paper)
        self.paper["liveReviewed"] = True
        driver.validate_binding(self.request, self.paper)
        native["exec_clients"]["BINANCE"] = {"path": driver.EXEC_PATH, "config": {"environment": "LIVE"}}
        with self.assertRaisesRegex(driver.ConfigurationError, "demonstration"):
            driver.validate_live_node(native, "live")
        native["strategies"][0]["strategy_path"] = "reviewed_strategy:ReviewedStrategy"
        native["exec_engine"]["reconciliation"] = False
        with self.assertRaisesRegex(driver.ConfigurationError, "reconciliation"):
            driver.validate_live_node(native, "live")

    def test_backtest_date_range_is_applied_without_mutating_approved_file(self):
        native = json.loads((HERE / "backtest.example.json").read_text())["node"]
        original = copy.deepcopy(native)
        changed = driver.apply_backtest_dates(native, {"startDate": "2026-08-01", "endDate": "2026-09-01"})
        self.assertEqual(changed["start"], "2026-08-01")
        self.assertEqual(changed["data"][0]["end_time"], "2026-09-01")
        self.assertEqual(native, original)
        native["data"][0]["catalog_path"] = "/project/../secret"
        with self.assertRaisesRegex(driver.ConfigurationError, "read-only"):
            driver.apply_backtest_dates(native, {})

    def test_metrics_have_valid_json_and_atomic_result_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            driver.write_result(Path(temporary), {"status": "completed", "value": float("nan")})
            result = json.loads((Path(temporary) / "result.json").read_text())
            self.assertIsNone(result["value"])
            self.assertEqual(result["engineVersion"], "1.231.0")
            self.assertFalse((Path(temporary) / "result.json.tmp").exists())


if __name__ == "__main__":
    unittest.main()
