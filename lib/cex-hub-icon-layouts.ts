// Public PNGs were originally padded to 128px without enlargement. Undo only their transparent canvas in CSS.
// Measured alpha bounds; brand artwork and local image bytes remain unchanged.
const layouts: Readonly<Record<string, readonly [number, number, number]>> = {
  "coinbase": [
    2.56,
    0,
    0
  ],
  "kraken": [
    2.56,
    0,
    0
  ],
  "okx": [
    2.56,
    0,
    0
  ],
  "binance": [
    2.56,
    0,
    0
  ],
  "bitget": [
    2.56,
    0,
    0
  ],
  "gate": [
    2.56,
    0,
    0
  ],
  "bitstamp": [
    2.56,
    0,
    0
  ],
  "mexc": [
    2.56,
    0,
    0
  ],
  "crypto-com": [
    2.56,
    0,
    0
  ],
  "bingx": [
    2.56,
    0,
    0
  ],
  "bitunix": [
    2.56,
    0,
    0
  ],
  "lbank": [
    2.56,
    0,
    0
  ],
  "hashkey": [
    2.56,
    0,
    0
  ],
  "bitvavo": [
    2.56,
    0,
    0
  ],
  "toobit": [
    2.56,
    0,
    0
  ],
  "bitkan": [
    2.56,
    0,
    0
  ],
  "gemini": [
    2.976744,
    -0.390625,
    0.390625
  ],
  "bitkub": [
    2.56,
    0,
    1.953125
  ],
  "osl-exchange": [
    2.56,
    0,
    0
  ],
  "weex": [
    2.56,
    0,
    0
  ],
  "kucoin": [
    2.56,
    0,
    0
  ],
  "luno": [
    2.56,
    0,
    0
  ],
  "bit2me": [
    2.56,
    0,
    0
  ],
  "bullish_com": [
    2.56,
    0,
    0
  ],
  "coinw": [
    3.2,
    0,
    0
  ],
  "niza-global": [
    2.56,
    0,
    0
  ],
  "upbit": [
    2.56,
    0,
    0
  ],
  "bitbank": [
    2.56,
    0,
    0
  ],
  "whitebit": [
    2.56,
    0,
    0
  ],
  "bitazza": [
    2.56,
    0,
    0
  ],
  "bitso": [
    3.878788,
    -0.390625,
    -0.390625
  ],
  "byte-exchange": [
    2.56,
    0,
    0
  ],
  "binance_us": [
    2.782609,
    0,
    0
  ],
  "coinstore": [
    2.56,
    0,
    0
  ],
  "bybit": [
    2.56,
    0,
    0
  ],
  "btse": [
    2.56,
    0,
    0
  ],
  "bitrue": [
    2.56,
    0,
    0
  ],
  "valr": [
    2.56,
    0,
    0
  ],
  "p2pb2b": [
    2.56,
    0,
    0
  ],
  "ourbit": [
    3.555556,
    0,
    0
  ],
  "gmo_japan": [
    2.56,
    0,
    0
  ],
  "paribu": [
    2.56,
    0,
    0
  ],
  "coinspro": [
    2.56,
    0,
    0
  ],
  "bithumb": [
    3.555556,
    0,
    0
  ],
  "pionex": [
    2.56,
    0,
    0
  ],
  "levex": [
    2.56,
    0,
    0
  ],
  "deepcoin": [
    2.56,
    0,
    0
  ],
  "cointr": [
    2.56,
    0.390625,
    0
  ],
  "huobi_japan": [
    2.56,
    0,
    0
  ],
  "htx": [
    2.56,
    0,
    0
  ],
  "hotcoin_global": [
    2.56,
    0,
    0
  ],
  "biconomy": [
    2.56,
    0,
    0
  ],
  "hibt": [
    2.56,
    0,
    0
  ],
  "bitfinex": [
    2.56,
    0,
    0
  ],
  "xt": [
    2.56,
    0,
    0
  ],
  "bitopro": [
    2.56,
    0,
    0
  ],
  "backpack": [
    2.56,
    0,
    0
  ],
  "bybit-eu": [
    2.56,
    0,
    0
  ],
  "webot": [
    2.56,
    0,
    0
  ],
  "xbo_com": [
    2.56,
    0,
    0
  ],
  "deribit": [
    2.56,
    0,
    0
  ],
  "phemex": [
    2.56,
    0,
    0
  ],
  "bittime": [
    2.56,
    0,
    0
  ],
  "btcturk": [
    2.56,
    0,
    0
  ],
  "zoomex": [
    2.56,
    0,
    0
  ],
  "cex": [
    2.56,
    0,
    0
  ],
  "bvox": [
    2.56,
    0,
    0
  ],
  "bitlo": [
    2.56,
    0,
    0
  ],
  "kcex": [
    2.56,
    0,
    0
  ],
  "korbit": [
    2.56,
    0,
    0
  ],
  "coinzoom": [
    2.56,
    0,
    0
  ],
  "bydfi": [
    2.56,
    0,
    0
  ],
  "aivora-exchange": [
    2.56,
    0,
    0
  ],
  "gate_us": [
    2.56,
    0,
    0
  ],
  "pointpay": [
    2.56,
    0,
    0
  ],
  "tdax": [
    2.56,
    0,
    0
  ],
  "blofin": [
    2.56,
    0,
    0
  ],
  "tokpie": [
    2.56,
    0,
    0
  ],
  "bitdelta": [
    2.56,
    0,
    0
  ],
  "hata": [
    2.56,
    0,
    0
  ],
  "bitpanda": [
    2.56,
    0,
    0
  ],
  "poloniex": [
    2.56,
    0,
    0
  ],
  "websea": [
    2.782609,
    0,
    0.78125
  ],
  "tapbit": [
    2.56,
    0,
    0
  ],
  "coinjar": [
    2.56,
    0,
    0
  ],
  "max_maicoin": [
    2.56,
    0,
    0
  ],
  "coincheck": [
    2.56,
    0,
    0
  ],
  "toko_crypto": [
    2.56,
    0,
    0
  ],
  "paymium": [
    2.56,
    0,
    0
  ],
  "blockchain_com": [
    2.56,
    0,
    0
  ],
  "bitflyer": [
    3.555556,
    0,
    0
  ],
  "wazirx": [
    2.56,
    0,
    0
  ],
  "azbit": [
    2.56,
    0,
    0
  ],
  "indodax": [
    2.56,
    0,
    0
  ],
  "bigone": [
    2.56,
    0,
    0
  ],
  "cryptology": [
    2.56,
    0,
    0
  ],
  "zaif": [
    2.56,
    0,
    0
  ],
  "earnbit": [
    4,
    -0.78125,
    0
  ],
  "changelly": [
    2.56,
    0,
    -0.390625
  ],
  "bitcoin_com": [
    2.56,
    0,
    0.390625
  ],
  "coinone": [
    2.56,
    0,
    0
  ],
  "btcmarkets": [
    2.56,
    0,
    0
  ],
  "dextrade": [
    2.56,
    0,
    0
  ],
  "kanga": [
    2.56,
    0.390625,
    0
  ],
  "young-platform": [
    2.56,
    0,
    0
  ],
  "bitexlive": [
    2.723404,
    0,
    -0.390625
  ],
  "bitexen": [
    2.612245,
    -0.390625,
    -1.171875
  ],
  "kinesis_money": [
    2.56,
    0,
    0
  ],
  "delta-exchange": [
    2.56,
    0,
    0
  ],
  "bitbaby-exchange": [
    2.56,
    0,
    0
  ],
  "grovex": [
    2.56,
    0,
    0
  ],
  "coindcx": [
    2.909091,
    0,
    0
  ],
  "bit2c": [
    2.56,
    0,
    0
  ],
  "buda": [
    3.555556,
    0,
    0
  ],
  "upbit_indonesia": [
    2.56,
    0,
    0
  ],
  "icrypex": [
    2.56,
    0,
    0
  ],
  "chainex": [
    2.56,
    0,
    0
  ],
  "nonkyc_io": [
    2.56,
    0,
    0
  ],
  "bitcastle": [
    2.666667,
    0,
    0
  ],
  "exmo": [
    2.56,
    0,
    0
  ],
  "inx_one": [
    2.56,
    0,
    0
  ],
  "orangex": [
    2.56,
    0,
    0
  ],
  "hitbtc": [
    2.782609,
    0,
    0
  ],
  "koinbazar": [
    2.56,
    0,
    0
  ],
  "btcc": [
    2.56,
    0,
    0
  ],
  "imbx": [
    2.56,
    0,
    0
  ],
  "bitci": [
    2.56,
    0,
    0
  ],
  "nbx": [
    2.56,
    0,
    0
  ],
  "woo-x": [
    2.56,
    0,
    0
  ],
  "mudrex": [
    2.666667,
    0,
    0
  ],
  "zebpay": [
    2.56,
    0,
    0
  ],
  "btc_alpha": [
    2.56,
    0,
    0
  ],
  "fameex": [
    2.56,
    0,
    0
  ],
  "foxbit": [
    2.56,
    0,
    0
  ],
  "coinup": [
    2.56,
    0,
    0
  ],
  "cryptal": [
    2.56,
    0,
    0
  ],
  "catex": [
    2.56,
    0,
    0
  ],
  "bitbegin": [
    2.612245,
    -1.5625,
    -0.390625
  ],
  "vindax": [
    2.56,
    0,
    0
  ],
  "safe_trade": [
    2.56,
    0,
    0
  ],
  "bilaxy": [
    2.666667,
    0,
    0
  ],
  "secondbtc": [
    3.2,
    0,
    1.5625
  ],
  "globe_exchange": [
    2.56,
    0,
    0
  ],
  "prime-xbt": [
    2.56,
    0,
    0
  ],
  "flipster": [
    2.56,
    0,
    0
  ],
  "bitmex": [
    2.782609,
    0,
    0.390625
  ],
  "bitmart": [
    2.56,
    0,
    0
  ],
  "coinex": [
    2.56,
    0,
    0
  ],
  "hashkey-global": [
    2.56,
    0,
    0
  ],
  "kalshi": [
    2.56,
    0,
    0
  ],
  "coincall": [
    2.56,
    0,
    0
  ]
};

export function cexHubIconLayout(id: string): { transform: string } | undefined {
  if (!Object.hasOwn(layouts, id)) return undefined;
  const [scale, x, y] = layouts[id];
  return { transform: `scale(${scale}) translate(${x}%, ${y}%)` };
}
