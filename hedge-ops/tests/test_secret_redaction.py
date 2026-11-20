import json
from urllib.parse import quote

from secret_redaction import is_secret, redact_data, redact_text


def test_known_credentials_are_removed_before_truncation_and_in_encoded_errors():
    secret = 'synthetic-test-api-secret-!@/\\'
    values = {"BINANCE_API_SECRET": secret, "GLOBAL_PROXY": "socks5://test-user:test-password@127.0.0.1:8080"}
    message = "x" * 1590 + secret + " " + quote(secret, safe="") + " " + json.dumps(secret)[1:-1] + " " + values["GLOBAL_PROXY"]
    safe = redact_text(message, values, limit=1600)
    assert secret not in safe
    assert "synthetic" not in safe
    safe = redact_text(message, values)
    assert secret not in safe and quote(secret, safe="") not in safe
    assert "test-password" not in safe and "test-user" not in safe


def test_diagnostic_objects_hide_secret_fields_preserve_public_ids_and_do_not_mutate():
    private_key = "ab" * 32
    tx_hash = "0x" + "cd" * 32
    source = {"apiKey": "synthetic-api-key", "privateKey": private_key,
              "nested": [{"message": "Bearer synthetic-session-token"}], "txHash": tx_hash,
              "apiKeyHint": "test***key", "status": "UNKNOWN", "exchangeCode": -1006}
    result = redact_data(source)
    assert result["apiKey"] == result["privateKey"] == "[redacted]"
    assert "synthetic-session-token" not in result["nested"][0]["message"]
    assert result["txHash"] == tx_hash and result["apiKeyHint"] == "test***key"
    assert result["status"] == "UNKNOWN" and result["exchangeCode"] == -1006
    assert source["apiKey"] == "synthetic-api-key"
    assert is_secret("ONDOPERPS_A_API_KEY_ID") and not is_secret("LIGHTER_API_KEY_INDEX")
    assert redact_data({"tx_hash": tx_hash})["tx_hash"] == tx_hash
    assert private_key not in redact_data({"txHash": "0x" + private_key}, {"PRIVATE_KEY": private_key})["txHash"]
