"""MIT Jesse core research integration. Does not load the commercial live plugin."""
import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
from jesse.research import backtest

request = json.loads(Path(os.environ.get('QUANT_REQUEST_FILE', '/request/request.json')).read_text())
if request['action'] != 'backtest':
    raise ValueError('Only the MIT core research backtest is integrated; no commercial live plugin is included')
config = request['config']
profile = json.loads(Path('/project/backtest.json').read_text())
native = profile['config']
if profile['exchangeId'] != config['exchange']:
    raise ValueError('Exchange mismatch')
if not config.get('startDate') or not config.get('endDate'):
    raise ValueError('Backtest startDate and endDate are required')
start = int(datetime.fromisoformat(config['startDate']).replace(tzinfo=timezone.utc).timestamp() * 1000)
end = int(datetime.fromisoformat(config['endDate']).replace(tzinfo=timezone.utc).timestamp() * 1000)
strategy = request.get('strategyClass') or 'WelinkTrend'
sys.path.insert(0, '/project')
os.chdir('/state')
routes = [{'exchange': native['exchange'], 'symbol': symbol.replace('/', '-'), 'timeframe': config['timeframe'], 'strategy': strategy} for symbol in config['symbols']]
if len(routes) > config['maxOpenTrades']:
    raise ValueError('Baseline Jesse strategy requires number of routes <= maxOpenTrades')
source = json.loads(Path('/project/candles.json').read_text())
candles = {}
for route in routes:
    key = native['exchange'] + '-' + route['symbol']
    data = np.asarray(source[key]['candles'], dtype=np.float64)
    selected = data[(data[:, 0] >= start) & (data[:, 0] < end)]
    if len(selected) < 100 or selected[0, 0] != start or selected[-1, 0] < end - 60000 or not np.all(np.diff(selected[:, 0]) == 60000):
        raise ValueError('Requested interval must contain continuous real 1m exchange candles')
    candles[key] = {'exchange': native['exchange'], 'symbol': route['symbol'], 'candles': selected}
result = backtest(native, routes, [], candles, generate_equity_curve=True)
metrics = {key: value for key, value in result.get('metrics', {}).items() if isinstance(value, (int, float)) and math.isfinite(value)}
Path('/state/result.json').write_text(json.dumps({'engine': 'jesse', 'action': 'backtest', 'metrics': metrics}))
Path('/state/equity.json').write_text(json.dumps(result.get('equity_curve', []), default=lambda value: value.tolist() if hasattr(value, 'tolist') else str(value)))
