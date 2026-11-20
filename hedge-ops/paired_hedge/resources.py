"""Conservative account/signer exclusion between independently journaled pairs."""
import hashlib
from .config import PAIRS

def resources(engine,values):
    venues=PAIRS.get(engine,('binance','lighter') if engine=='binance' else ('arcus','hyperliquid') if engine=='entropy' else ('arcus','rhc_lighter'))
    result=set()
    for venue in venues:
        keys={'binance':['BINANCE_API_KEY'],'okx':['OKX_API_KEY'],'hyperliquid':['HYPERLIQUID_ACCOUNT_ADDRESS','HYPERLIQUID_PRIVATE_KEY'],'entropy':['HYPERLIQUID_ACCOUNT_ADDRESS','HYPERLIQUID_PRIVATE_KEY'],'lighter':['LIGHTER_ACCOUNT_INDEX'],'rhc_lighter':['LIGHTER_ACCOUNT_INDEX'],'arcus':['ARCUS_ADDRESS'],'ondoperps':['ONDOPERPS_API_KEY_ID'],'ondoperps_a':['ONDOPERPS_A_API_KEY_ID'],'ondoperps_b':['ONDOPERPS_B_API_KEY_ID']}[venue]
        for key in keys:
            value=values.get(key,'').strip()
            if not value:continue
            if venue=='arcus':value+=':'+values.get('ARCUS_ACCOUNT_INDEX','0')
            # Keys and IDs never leave the process in status, logs or errors.
            namespace='hyperliquid' if venue=='entropy' else 'ondoperps' if venue.startswith('ondoperps') else venue
            identity='API_KEY_ID' if venue.startswith('ondoperps') else key
            normalized=value if venue.startswith('ondoperps') else value.lower().removeprefix('0x')
            result.add(namespace+':'+identity+':'+hashlib.sha256(normalized.encode()).hexdigest())
    return result
