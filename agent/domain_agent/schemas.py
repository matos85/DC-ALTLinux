from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ExecuteRequest(BaseModel):
    operation: str
    payload: dict[str, Any] = Field(default_factory=dict)
    dry_run: bool = False


class ExecuteResponse(BaseModel):
    request_id: str
    operation: str
    dry_run: bool
    commands: list[list[str]] = Field(default_factory=list)
    stdout: str = ""
    stderr: str = ""
    data: dict[str, Any] = Field(default_factory=dict)
