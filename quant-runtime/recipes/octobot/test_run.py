"""Offline entry-point contract tests: no native packages, network or trading."""
import json
import os
import runpy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

RUNNER = str(Path(__file__).with_name('run.py'))


class Executed(Exception):
    pass


class OctobotConsoleContract(unittest.TestCase):
    def exercise(self, action='start', mode='paper'):
        with tempfile.TemporaryDirectory(prefix='welink-octobot-run-test-') as directory:
            root = Path(directory)
            for name in ['project/user', 'project/tentacles', 'project/backtesting', 'state', 'request']:
                (root / name).mkdir(parents=True, exist_ok=True)
            (root / 'project/user/config.json').write_text(json.dumps({'trader': {'enabled': True}, 'trader-simulator': {'enabled': False}}))
            config = {'mode': mode, 'startDate': '2025-01-01', 'endDate': '2025-02-01'}
            (root / 'request/request.json').write_text(json.dumps({'action': action, 'config': config, 'strategyClass': 'TechnicalAnalysisStrategyEvaluator'}))
            (root / 'project/backtest-window.json').write_text(json.dumps({k: config[k] for k in ['startDate', 'endDate']}))
            (root / 'project/backtesting/data.data').write_text('offline placeholder; never consumed')

            def mapped(value):
                value = str(value)
                return root / value.lstrip('/') if value.startswith(('/state', '/project', '/request')) else Path(value)

            with patch.dict(os.environ, {'QUANT_REQUEST_FILE': '/request/request.json'}), patch('pathlib.Path', side_effect=mapped), patch('os.chdir'), patch('os.execvp', side_effect=Executed) as execute:
                with self.assertRaises(Executed):
                    runpy.run_path(RUNNER, run_name='__main__')
            executable, args = execute.call_args.args
            self.assertEqual(executable, 'OctoBot')
            self.assertEqual(args[:3], ['OctoBot', '--no_web', '--no-telegram'])
            self.assertNotIn('/octobot/start.py', args)
            native = json.loads((root / 'state/user/config.json').read_text())
            return args, native

    def test_paper_start_forces_simulator(self):
        args, native = self.exercise()
        self.assertIn('--simulate', args)
        self.assertFalse(native['trader']['enabled'])

    def test_backtest_uses_verified_interval_files_and_simulator(self):
        args, _ = self.exercise('backtest', 'live')
        self.assertIn('--backtesting', args)
        self.assertIn('--backtesting-files', args)
        self.assertIn('--simulate', args)

    def test_optimizer_passes_reviewed_class(self):
        args, _ = self.exercise('optimize')
        self.assertEqual(args[-2:], ['--strategy_optimizer', 'TechnicalAnalysisStrategyEvaluator'])

    def test_live_keeps_explicit_native_mode_without_simulate(self):
        args, native = self.exercise(mode='live')
        self.assertNotIn('--simulate', args)
        self.assertTrue(native['trader']['enabled'])


if __name__ == '__main__':
    unittest.main()
