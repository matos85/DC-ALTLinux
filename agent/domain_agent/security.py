from __future__ import annotations

import hashlib
import hmac
import time

from fastapi import Header, HTTPException

from .config import settings


def verify_request(
    body: bytes,
    x_agent_timestamp: str = Header(...),
    x_agent_signature: str = Header(...),
):
    try:
        timestamp = int(x_agent_timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid timestamp.") from exc

    if abs(int(time.time()) - timestamp) > settings.max_skew_seconds:
        raise HTTPException(status_code=401, detail="Request timestamp is out of range.")

    payload = x_agent_timestamp.encode("utf-8") + b"." + body
    expected = hmac.new(
        settings.shared_secret.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, x_agent_signature):
        raise HTTPException(status_code=401, detail="Invalid signature.")
