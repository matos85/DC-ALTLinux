from __future__ import annotations

import json
import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .config import settings
from .operations import OPERATIONS, execute_operation
from .schemas import ExecuteRequest
from .security import verify_request


app = FastAPI(title="Domain Agent", version="0.1.2")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "domain-agent",
        "operations": sorted(OPERATIONS.keys()),
        "smb_host": settings.smb_host,
        "dns_server": settings.dns_server,
        "dc_ip": settings.dc_ip,
        "runs_in_docker": os.path.isfile("/.dockerenv"),
    }


@app.post("/execute")
async def execute(request: Request, payload: ExecuteRequest):
    body = await request.body()
    verify_request(
        body=body,
        x_agent_timestamp=request.headers.get("X-Agent-Timestamp", ""),
        x_agent_signature=request.headers.get("X-Agent-Signature", ""),
    )
    response = execute_operation(payload.operation, payload.payload, payload.dry_run)
    return JSONResponse(json.loads(response.model_dump_json()))
