"""Original EMA-cross baseline. Validate independently before approving live use."""
from freqtrade.strategy import IStrategy, IntParameter
from pandas import DataFrame


class WelinkTrend(IStrategy):
    INTERFACE_VERSION = 3
    can_short = False
    timeframe = '1h'
    startup_candle_count = 100
    minimal_roi = {'0': 0.08}
    stoploss = -0.03
    process_only_new_candles = True
    fast_period = IntParameter(8, 20, default=12, space='buy', optimize=True)
    slow_period = IntParameter(30, 60, default=48, space='buy', optimize=True)

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        for period in self.fast_period.range:
            dataframe[f'fast_{period}'] = dataframe['close'].ewm(span=period, adjust=False).mean()
        for period in self.slow_period.range:
            dataframe[f'slow_{period}'] = dataframe['close'].ewm(span=period, adjust=False).mean()
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        fast, slow = dataframe[f'fast_{self.fast_period.value}'], dataframe[f'slow_{self.slow_period.value}']
        dataframe.loc[(fast > slow) & (fast.shift(1) <= slow.shift(1)) & (dataframe['volume'] > 0), 'enter_long'] = 1
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        fast, slow = dataframe[f'fast_{self.fast_period.value}'], dataframe[f'slow_{self.slow_period.value}']
        dataframe.loc[(fast < slow) & (fast.shift(1) >= slow.shift(1)) & (dataframe['volume'] > 0), 'exit_long'] = 1
        return dataframe
