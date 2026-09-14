"""Invoke real Freqtrade 2026.8 commands; only the gateway mounts request.json."""
import json
import math
import os
import re
import subprocess
import zipfile
from pathlib import Path

request = json.loads(Path(os.environ.get('QUANT_REQUEST_FILE', '/request/request.json')).read_text())
config = request['config']
action = request['action']
native = json.loads(Path('/project/config.json').read_text())
strategy = request.get('strategyClass') or 'WelinkTrend'
if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,79}', strategy):
    raise ValueError('Invalid reviewed strategy class')
if native['exchange']['name'].lower() != config['exchange'].lower():
    raise ValueError('Reviewed native exchange does not match request')
native.update({
    'dry_run': action != 'start' or config['mode'] == 'paper',
    'stake_amount': config['stakeAmount'],
    'max_open_trades': config['maxOpenTrades'],
    'stoploss': -config['stopLossPct'] / 100,
    'timeframe': config['timeframe'],
    'user_data_dir': '/state',
    'db_url': 'sqlite:////state/trades.sqlite',
    'initial_state': 'running',
    'force_entry_enable': False,
})
native['exchange']['pair_whitelist'] = config['symbols']
native['pairlists'] = [{'method': 'StaticPairList'}]
if not native['dry_run'] and (not native['exchange'].get('key') or not native['exchange'].get('secret')):
    raise ValueError('Live exchange credentials are missing')
# Telegram/webhook notification permissions and native API are operator owned.
config_path = Path('/state/runtime-config.json')
config_path.write_text(json.dumps(native))
config_path.chmod(0o600)
base = ['--config', str(config_path), '--userdir', '/state']
strategy_args = ['--strategy', strategy, '--strategy-path', '/project/strategies']
if action == 'start':
    os.execvp('freqtrade', ['freqtrade', 'trade', *base, *strategy_args])
if action not in ('backtest', 'optimize'):
    raise ValueError('Unsupported Freqtrade operation')
if not config.get('startDate') or not config.get('endDate'):
    raise ValueError('Historical tasks require startDate and endDate')
timerange = config['startDate'].replace('-', '') + '-' + config['endDate'].replace('-', '')
subprocess.run(['freqtrade', 'download-data', *base, '--timerange', timerange, '--timeframes', config['timeframe']], check=True)
if action == 'backtest':
    subprocess.run(['freqtrade', 'backtesting', *base, *strategy_args, '--timerange', timerange,
                    '--export', 'trades', '--export-directory', '/state/backtest_results'], check=True)
    archives = sorted(Path('/state/backtest_results').glob('*.zip'), key=lambda p: p.stat().st_mtime)
    metrics = {}
    if archives:
        with zipfile.ZipFile(archives[-1]) as archive:
            candidates = [n for n in archive.namelist() if n.endswith('.json') and not n.endswith('.meta.json') and '_config' not in n]
            for name in candidates:
                report = json.loads(archive.read(name))
                stats = report.get('strategy', {}).get(strategy, {})
                for key in ['profit_total_abs', 'profit_total', 'max_drawdown_account', 'total_trades', 'winrate', 'sharpe']:
                    value = stats.get(key)
                    if isinstance(value, (int, float)) and math.isfinite(value):
                        metrics[key] = value
    Path('/state/result.json').write_text(json.dumps({'engine': 'freqtrade', 'action': action, 'metrics': metrics}))
else:
    subprocess.run(['freqtrade', 'hyperopt', *base, *strategy_args, '--timerange', timerange,
                    '--hyperopt-loss', 'SharpeHyperOptLossDaily', '--spaces', 'buy', '--epochs', '100',
                    '--job-workers', '2', '--random-state', '42', '--disable-param-export'], check=True)
    Path('/state/result.json').write_text(json.dumps({'engine': 'freqtrade', 'action': action, 'metrics': {}}))
