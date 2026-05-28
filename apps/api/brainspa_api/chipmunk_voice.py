from __future__ import annotations

import json
import urllib.error
import urllib.request

from fastapi import HTTPException

from .state import get_xai_api_key


def create_voice_client_secret() -> dict[str, object]:
    api_key = get_xai_api_key()
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="XAI API key not set. Add it in Settings → Chipmunk or export XAI_API_KEY.",
        )
    body = json.dumps({"expires_after": {"seconds": 3600}}).encode("utf-8")
    request = urllib.request.Request(
        "https://api.x.ai/v1/realtime/client_secrets",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:400]
        raise HTTPException(status_code=502, detail=f"xAI client secret failed: {detail}") from error
    except (OSError, urllib.error.URLError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=502, detail=f"xAI client secret failed: {error}") from error
    return payload
