"""Original LEAN spot baseline: actual subscriptions, fills and native stop orders."""
from AlgorithmImports import *
import json
import os
from pathlib import Path
from datetime import datetime, timedelta


class WelinkTrend(QCAlgorithm):
    def initialize(self):
        request = json.loads(Path(os.environ.get('QUANT_REQUEST_FILE', '/request/request.json')).read_text())
        self.quant_config = request['config']
        if self.quant_config['exchange'] != 'binance' or any(':' in pair or not pair.endswith('/USDT') for pair in self.quant_config['symbols']):
            raise ValueError('Bundled LEAN baseline supports Binance spot USDT pairs; deploy a reviewed custom algorithm for other assets')
        if request['action'] == 'backtest':
            start = datetime.fromisoformat(self.quant_config['startDate'])
            end = datetime.fromisoformat(self.quant_config['endDate']) - timedelta(days=1)
            self.set_start_date(start.year, start.month, start.day)
            self.set_end_date(end.year, end.month, end.day)
            self.set_account_currency('USDT')
            self.set_cash(10000)
        self.set_brokerage_model(BrokerageName.BINANCE, AccountType.CASH)
        units = {'m': 1, 'h': 60, 'd': 1440}
        timeframe = self.quant_config['timeframe']
        duration = timedelta(minutes=int(timeframe[:-1]) * units[timeframe[-1]])
        self.indicators = {}
        self.stops = {}
        self.observed_bars = 0
        for pair in self.quant_config['symbols']:
            symbol = self.add_crypto(pair.replace('/', ''), Resolution.MINUTE, Market.BINANCE).symbol
            self.indicators[symbol] = (ExponentialMovingAverage(12), ExponentialMovingAverage(48))
            self.consolidate(symbol, duration, self.on_bar)

    def on_bar(self, bar):
        self.observed_bars += 1
        fast, slow = self.indicators[bar.symbol]
        fast.update(bar.end_time, bar.close)
        slow.update(bar.end_time, bar.close)
        if not slow.is_ready or self.is_warming_up:
            return
        holding = self.portfolio[bar.symbol]
        if holding.invested and fast.current.value < slow.current.value:
            self.transactions.cancel_open_orders(bar.symbol)
            self.liquidate(bar.symbol, 'EMA trend exit')
        elif not holding.invested and fast.current.value > slow.current.value:
            open_count = sum(1 for s in self.indicators if self.portfolio[s].invested or self.transactions.get_open_orders(s))
            if open_count >= self.quant_config['maxOpenTrades'] or self.transactions.get_open_orders(bar.symbol):
                return
            security = self.securities[bar.symbol]
            lot = float(security.symbol_properties.lot_size)
            quantity = int((self.quant_config['stakeAmount'] / float(bar.close)) / lot) * lot
            if quantity > 0:
                self.market_order(bar.symbol, quantity, tag='Welink EMA entry')

    def on_order_event(self, event):
        if event.status not in (OrderStatus.FILLED, OrderStatus.PARTIALLY_FILLED) or event.fill_quantity <= 0:
            return
        holding = self.portfolio[event.symbol]
        previous = self.stops.get(event.symbol)
        if previous:
            previous.cancel('Refresh filled position protection')
        stop = float(holding.average_price) * (1 - self.quant_config['stopLossPct'] / 100)
        self.stops[event.symbol] = self.stop_market_order(event.symbol, -holding.quantity, stop, 'Welink risk stop')

    def on_end_of_algorithm(self):
        if self.observed_bars == 0:
            raise ValueError('No real market bars were received; check the native data provider/catalog')
        metrics = {'portfolio_value': float(self.portfolio.total_portfolio_value), 'observed_bars': self.observed_bars}
        Path('/state/result.json').write_text(json.dumps({'engine': 'lean', 'metrics': metrics}))
