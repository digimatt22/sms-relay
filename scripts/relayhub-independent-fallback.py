#!/usr/bin/env python3
"""Send a redacted Relay Hub host-outage event through an external webhook."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import sys
import tempfile
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

sys.dont_write_bytecode = True

UNIT_RE = re.compile(r"[A-Za-z0-9_.@:-]{1,160}")
DEFAULT_STATE_PATH = Path.home() / ".local/state/sheldon/watchdog/fallback.json"


class FallbackError(RuntimeError):
    pass


def env_true(name: str) -> bool:
    return os.environ.get(name) == "true"


def positive_int(name: str, default: int) -> int:
    raw = os.environ.get(name, str(default))
    try:
        value = int(raw)
    except ValueError as exc:
        raise FallbackError(f"{name} must be an integer") from exc
    if value < 1:
        raise FallbackError(f"{name} must be positive")
    return value


def validate_webhook_url(raw: str) -> str:
    parsed = urlparse(raw)
    if parsed.scheme != "https" or not parsed.hostname:
        raise FallbackError("fallback webhook must use an HTTPS hostname")
    if parsed.username or parsed.password or parsed.fragment:
        raise FallbackError("fallback webhook URL has unsupported components")

    hostname = parsed.hostname.lower().rstrip(".")
    if (
        hostname == "localhost"
        or hostname.endswith(".localhost")
        or hostname == "sns.digicolony.net"
        or hostname.endswith(".local")
    ):
        raise FallbackError("fallback webhook is not independent")
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        address = None
    if address and (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_reserved
        or address.is_unspecified
    ):
        raise FallbackError("fallback webhook is not independent")
    return raw


def event_document(unit: str, now: datetime) -> dict[str, object]:
    occurred_at = now.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    host_id = os.environ.get("RELAYHUB_FALLBACK_HOST_ID", "sheldon")
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,80}", host_id):
        raise FallbackError("fallback host identifier is invalid")
    event_id = hashlib.sha256(f"{host_id}|{unit}|{occurred_at}".encode()).hexdigest()
    summary = f"Relay Hub external watchdog failed on {host_id}"
    return {
        "schema": "relayhub-independent-fallback/1",
        "event_id": event_id,
        "event": "relayhub_host_watchdog_failed",
        "severity": "critical",
        "service": "relayhub-sms",
        "host": host_id,
        "failed_unit": unit,
        "occurred_at": occurred_at,
        "summary": summary,
        "text": f"{summary}. Check host journal and readiness; keep writes fenced.",
        "recovery_action": "Inspect host journal, container state, PostgreSQL readiness, disk, memory, and backup age.",
    }


def recent_duplicate(state_path: Path, unit: str, now: datetime, window: int) -> bool:
    try:
        state = json.loads(state_path.read_text())
        delivered_at = datetime.fromisoformat(
            str(state["delivered_at"]).replace("Z", "+00:00")
        )
        return (
            state.get("failed_unit") == unit
            and 0 <= (now - delivered_at).total_seconds() < window
        )
    except (FileNotFoundError, KeyError, ValueError, TypeError, json.JSONDecodeError):
        return False


def record_delivery(state_path: Path, document: dict[str, object]) -> None:
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state = {
        "event_id": document["event_id"],
        "failed_unit": document["failed_unit"],
        "delivered_at": document["occurred_at"],
    }
    descriptor, temporary_name = tempfile.mkstemp(
        dir=state_path.parent,
        prefix=f".{state_path.name}.",
    )
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w") as destination:
            json.dump(state, destination)
            destination.write("\n")
        os.replace(temporary_name, state_path)
    except Exception:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def send(document: dict[str, object], webhook_url: str, timeout: int) -> int:
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "relayhub-independent-fallback/1",
    }
    bearer = os.environ.get("RELAYHUB_FALLBACK_BEARER_TOKEN")
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    request = Request(
        webhook_url,
        data=json.dumps(document, separators=(",", ":")).encode(),
        headers=headers,
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            status = response.status
    except HTTPError as exc:
        raise FallbackError(
            f"fallback provider returned HTTP {exc.code}"
        ) from None
    except (URLError, TimeoutError):
        raise FallbackError("fallback provider delivery failed") from None
    if not 200 <= status < 300:
        raise FallbackError(f"fallback provider returned HTTP {status}")
    return status


def main() -> int:
    if len(sys.argv) != 2 or not UNIT_RE.fullmatch(sys.argv[1]):
        raise FallbackError("usage: relayhub-independent-fallback FAILED_UNIT")
    unit = sys.argv[1]
    webhook_url = validate_webhook_url(
        os.environ.get("RELAYHUB_FALLBACK_WEBHOOK_URL", "")
    )
    now = datetime.now(timezone.utc)
    document = event_document(unit, now)

    if env_true("RELAYHUB_FALLBACK_DRY_RUN"):
        print(json.dumps(document, separators=(",", ":")))
        return 0
    if not env_true("RELAYHUB_FALLBACK_CONFIRMED_INDEPENDENT"):
        raise FallbackError("live fallback delivery is not confirmed")

    state_path = Path(
        os.environ.get("RELAYHUB_FALLBACK_STATE_PATH", str(DEFAULT_STATE_PATH))
    ).expanduser()
    dedup_seconds = positive_int("RELAYHUB_FALLBACK_DEDUP_SECONDS", 900)
    if recent_duplicate(state_path, unit, now, dedup_seconds):
        print('{"status":"suppressed","reason":"recent_duplicate"}')
        return 0

    status = send(
        document,
        webhook_url,
        positive_int("RELAYHUB_FALLBACK_TIMEOUT_SECONDS", 10),
    )
    record_delivery(state_path, document)
    print(
        json.dumps(
            {
                "status": "delivered",
                "provider_status": status,
                "event_id": document["event_id"],
            },
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except FallbackError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)

