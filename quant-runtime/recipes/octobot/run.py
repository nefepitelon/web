"""Run official OctoBot 2.1.1 with persisted user/tentacle state."""
import json
import os
import shutil
from pathlib import Path

request = json.loads(Path(os.environ.get('QUANT_REQUEST_FILE', '/request/request.json')).read_text())
action, config = request['action'], request['config']
if action not in ('start', 'backtest', 'optimize'):
    raise ValueError('Unsupported OctoBot operation')
# Copy only server-reviewed native files to this operation's writable state.
for name in ['user', 'tentacles']:
    target = Path('/state') / name
    if not target.exists():
        shutil.copytree(Path('/project') / name, target)
Path('/state/logs').mkdir(exist_ok=True)
os.environ['LOGS_FOLDER'] = '/state/logs'
native = json.loads(Path('/state/user/config.json').read_text())
if config['mode'] == 'paper' or action != 'start':
    native.setdefault('trader', {})['enabled'] = False
    native.setdefault('trader-simulator', {})['enabled'] = True
else:
    if native.get('trader', {}).get('enabled') is not True or native.get('trader-simulator', {}).get('enabled') is not False:
        raise ValueError('Reviewed OctoBot live trader is not enabled explicitly')
Path('/state/user/config.json').write_text(json.dumps(native))
# Risk, symbols, timeframes and mode-specific TradingView/grid/DCA tentacle settings
# must match deployment.approvedConfigHash and be validated before verifiedActions is granted.
# The official 2.1.1 wheel image exposes the installed console script, not start.py.
args = ['OctoBot', '--no_web', '--no-telegram']
if action != 'start' or config['mode'] == 'paper':
    args += ['--simulate']
if action == 'backtest':
    if not config.get('startDate'):
        raise ValueError('Requested backtest interval is required')
    window = json.loads(Path('/project/backtest-window.json').read_text())
    if window.get('startDate') != config['startDate'] or window.get('endDate') != config['endDate']:
        raise ValueError('OctoBot input data window does not match requested interval')
    files = list(Path('/project/backtesting').glob('*.data'))
    if not files:
        raise ValueError('OctoBot historical data files have not been installed')
    args += ['--backtesting', '--backtesting-files', *[str(file) for file in files]]
elif action == 'optimize':
    strategy = request.get('strategyClass')
    if not strategy or not strategy.isidentifier():
        raise ValueError('Reviewed strategy evaluator class is required for optimization')
    args += ['--strategy_optimizer', strategy]
os.chdir('/state')
os.execvp('OctoBot', args)
