"""Original Jesse baseline; request risk parameters are consumed by the strategy."""
import json
import os
from pathlib import Path
from jesse.strategies import Strategy
import jesse.indicators as ta


class WelinkTrend(Strategy):
    @property
    def settings(self):
        if 'welink_settings' not in self.vars:
            self.vars['welink_settings'] = json.loads(Path(os.environ.get('QUANT_REQUEST_FILE', '/request/request.json')).read_text())['config']
        return self.vars['welink_settings']

    def should_long(self) -> bool:
        return len(self.candles) >= 60 and ta.ema(self.candles, 12) > ta.ema(self.candles, 48)

    def should_short(self) -> bool:
        return False

    def go_long(self):
        amount = min(self.settings['stakeAmount'], self.available_margin * 0.95)
        self.buy = amount / self.price, self.price
        self.stop_loss = amount / self.price, self.price * (1 - self.settings['stopLossPct'] / 100)

    def go_short(self):
        pass

    def should_cancel_entry(self) -> bool:
        return True

    def update_position(self):
        if ta.ema(self.candles, 12) < ta.ema(self.candles, 48):
            self.liquidate()
