"""Diagnostics-only redaction. Never pass redacted values to an exchange."""
import json
import re
from urllib.parse import quote

HIDDEN = "[redacted]"


def is_secret(key):
    normalized = re.sub(r"[^a-z0-9]", "", str(key).lower())
    if normalized.endswith(("hint", "masked", "configured", "address", "index")):
        return False
    return normalized.endswith(("privatekey", "apikey", "apisecret", "apikeyid", "apipassphrase", "password", "passphrase", "token", "secret", "authorization", "cookie", "proxy", "mnemonic", "keypair", "keypairjson"))


def redact_text(message, values=None, *, limit=32768):
    text = str(message)
    secrets = [str(value) for key, value in (values or {}).items() if value and is_secret(key) and len(str(value)) >= 4]
    # Replace before truncating, including encoded proxy credentials and JSON.
    for secret in sorted(secrets, key=len, reverse=True):
        for variant in {secret, quote(secret, safe=""), json.dumps(secret, ensure_ascii=True)[1:-1], json.dumps(secret, ensure_ascii=False)[1:-1]}:
            text = text.replace(variant, HIDDEN)
    text = re.sub(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)", HIDDEN, text)
    text = re.sub(r"(?i)(\b(?:Bearer|Basic)\s+)[A-Za-z0-9+/_=.:-]+", r"\1" + HIDDEN, text)
    text = re.sub(r"(?i)([a-z][a-z0-9+.-]*://)[^\s/@?#]+(?::[^\s/@?#]*)?@", r"\1" + HIDDEN + "@", text)
    text = re.sub(r"\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b", HIDDEN, text)
    text = re.sub(r"(?i)\b(?:0x)?[a-f0-9]{64}\b", HIDDEN, text)
    text = re.sub(r"\b(?:v1|b1):[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+", HIDDEN, text)
    return text[:max(0, limit)]


def redact_data(value, values=None, *, _depth=0):
    if _depth >= 12:
        return "[truncated]"
    if isinstance(value, str):
        return redact_text(value, values)
    if isinstance(value, dict):
        result = {}
        known = [str(item).removeprefix("0x") for name, item in (values or {}).items() if item and is_secret(name)]
        for key, item in value.items():
            if is_secret(key) and item:
                result[key] = HIDDEN
            elif str(key).lower().replace("_", "") in {"txhash", "transactionhash", "blockhash"} and isinstance(item, str) and re.fullmatch(r"(?:0x)?[a-fA-F0-9]{64}", item) and item.removeprefix("0x") not in known:
                result[key] = item
            else:
                result[key] = redact_data(item, values, _depth=_depth + 1)
        return result
    if isinstance(value, (list, tuple)):
        return [redact_data(item, values, _depth=_depth + 1) for item in value]
    return value
