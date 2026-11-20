"""Order intent and task ownership commit together; recovery never resends intent."""
import json
import sqlite3
import time
import uuid


class Store:
    def __init__(self, path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(path)
        self.conn.execute('CREATE TABLE IF NOT EXISTS tasks(asset TEXT PRIMARY KEY, data TEXT NOT NULL)')
        self.conn.execute('CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, asset TEXT, data TEXT NOT NULL)')
        self.conn.execute('CREATE TABLE IF NOT EXISTS events(at REAL, asset TEXT, message TEXT)')
        self.conn.execute('CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT)')
        self.conn.commit()

    def tasks(self): return [json.loads(r[0]) for r in self.conn.execute('SELECT data FROM tasks ORDER BY asset')]
    def get(self, asset):
        row = self.conn.execute('SELECT data FROM tasks WHERE asset=?', (asset,)).fetchone()
        return json.loads(row[0]) if row else None
    def put(self, task, *, commit=True):
        self.conn.execute('INSERT OR REPLACE INTO tasks VALUES(?,?)', (task['asset'], json.dumps(task)))
        if commit: self.conn.commit()
    def orders(self, asset=None):
        rows = self.conn.execute('SELECT data FROM orders' + (' WHERE asset=?' if asset else '') + ' ORDER BY rowid DESC LIMIT 10000', (asset,) if asset else ())
        return [json.loads(r[0]) for r in rows]
    def save_order(self, order, *, commit=True):
        self.conn.execute('INSERT OR REPLACE INTO orders VALUES(?,?,?)', (order['id'], order['asset'], json.dumps(order)))
        if commit: self.conn.commit()
    def intent(self, asset, venue, side, quantity, reduce_only):
        order = dict(id=uuid.uuid4().hex, asset=asset, venue=venue, side=side, quantity=format(quantity, 'f'),
                     reduce_only=reduce_only, state='INTENT', at=time.time(), filled='0', quote='0', fee=None)
        order['client_id'] = 'wh' + order['id'][:28] if venue == 'binance' else str(int(order['id'], 16) % (2**48 - 1) + 1)
        self.save_order(order)  # Durable before any network write.
        return order
    def confirm(self, order, result):
        from decimal import Decimal
        filled, quote = Decimal(result['filled']), Decimal(result['quote'])
        if not filled.is_finite() or not quote.is_finite() or filled < 0 or quote < 0 or filled > Decimal(order['quantity']) or (filled > 0 and quote <= 0):
            raise ValueError('交易所成交数量或金额异常，拒绝更新自有仓位')
        order.update(result, state='CONFIRMED')
        task = self.get(order['asset'])
        managed = task.setdefault('managed', {'binance': '0', 'lighter': '0'})
        venue = order['venue']
        if order['reduce_only'] and (filled > abs(Decimal(managed[venue])) or filled and (Decimal(managed[venue]) > 0) == (order['side'] == 'BUY')):
            raise ValueError('减仓成交与任务自有仓位不符')
        managed[venue] = str(Decimal(managed[venue]) + Decimal(order['filled']) * (1 if order['side'] == 'BUY' else -1))
        self.put(task, commit=False)
        self.save_order(order, commit=False)
        self.conn.commit()
    def log(self, asset, message):
        self.conn.execute('INSERT INTO events VALUES(?,?,?)', (time.time(), asset, message[:500]))
        self.conn.commit()
    def events(self): return [dict(at=r[0], asset=r[1], reason=r[2]) for r in self.conn.execute('SELECT * FROM events ORDER BY at DESC LIMIT 100')]
    def meta(self, key, value=None):
        if value is not None:
            self.conn.execute('INSERT OR REPLACE INTO meta VALUES(?,?)', (key, str(value))); self.conn.commit()
        row = self.conn.execute('SELECT value FROM meta WHERE key=?', (key,)).fetchone()
        return row[0] if row else None
    def close(self): self.conn.close()
