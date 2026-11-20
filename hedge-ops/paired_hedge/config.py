from pathlib import Path
from dotenv import dotenv_values
from binance_lighter.config import Settings as BaseSettings
from secret_redaction import redact_text

PAIRS = {
    'binance_okx': ('binance', 'okx'),
    'binance_hyperliquid': ('binance', 'hyperliquid'),
    'hyperliquid_lighter': ('hyperliquid', 'lighter'),
    'ondoperps_entropy': ('ondoperps', 'entropy'),
    'ondoperps_ondoperps': ('ondoperps_a', 'ondoperps_b'),
}
NAMES = {'binance':'Binance', 'okx':'OKX', 'hyperliquid':'Hyperliquid', 'lighter':'Lighter',
         'ondoperps':'Ondoperps', 'ondoperps_a':'Ondoperps A', 'ondoperps_b':'Ondoperps B', 'entropy':'Entropy'}
KEYS = {
    'binance': ('BINANCE_API_KEY','BINANCE_API_SECRET'),
    'okx': ('OKX_API_KEY','OKX_API_SECRET','OKX_API_PASSPHRASE'),
    'hyperliquid': ('HYPERLIQUID_ACCOUNT_ADDRESS','HYPERLIQUID_PRIVATE_KEY'),
    'lighter': ('LIGHTER_ACCOUNT_INDEX','LIGHTER_API_KEY_INDEX','LIGHTER_API_PRIVATE_KEY'),
    'entropy': ('HYPERLIQUID_ACCOUNT_ADDRESS','HYPERLIQUID_PRIVATE_KEY'),
    'ondoperps': ('ONDOPERPS_API_KEY_ID','ONDOPERPS_API_SECRET'),
    'ondoperps_a': ('ONDOPERPS_A_API_KEY_ID','ONDOPERPS_A_API_SECRET'),
    'ondoperps_b': ('ONDOPERPS_B_API_KEY_ID','ONDOPERPS_B_API_SECRET'),
}
COMMON = {k:v for k,v in dotenv_values(Path(__file__).parents[1]/'binance_lighter/env.example',interpolate=False).items()
          if not k.startswith(('BINANCE_','LIGHTER_'))}

def defaults(pair):
    values = dict(COMMON)
    for venue in PAIRS[pair]:
        values.update({k:'' for k in KEYS[venue]})
        values[venue.upper()+'_PROXY']=''
    if 'okx' in PAIRS[pair]: values['OKX_REGION']='global'
    if {'hyperliquid','entropy'} & set(PAIRS[pair]): values['HYPERLIQUID_VAULT_ADDRESS']=''
    # Identical markets on one venue have no funding-rate differential. This
    # pair is explicit dual-account rotation, retaining the normal cost checks.
    if pair == 'ondoperps_ondoperps': values['MIN_NET_FUNDING_BPS_H']='0'
    return values

class Settings(BaseSettings):
    @classmethod
    def load_pair(cls, pair, env, data_dir):
        values=defaults(pair)
        values.update({k:str(v or '') for k,v in dotenv_values(env,interpolate=False).items() if k in values})
        result=cls(values,Path(data_dir))
        result.pair=pair
        return result

def redact(message, values):
    return redact_text(message, values)
