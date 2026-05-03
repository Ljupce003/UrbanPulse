"""Validate and upload a prepared payload JSON to UrbanPulse dataset endpoints.

Usage:
  python scripts\upload_payload.py \
    --payload out\traffic_payload.json \
    --base-url http://127.0.0.1:8080 \
    --token <SUPABASE_JWT>
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib import request, error


def post_json(url: str, token: str, payload: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {token}")
    try:
        with request.urlopen(req, timeout=120) as resp:
            data = resp.read().decode("utf-8")
            return json.loads(data) if data else {}
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} calling {url}: {detail}") from exc


def main():
    parser = argparse.ArgumentParser(description="Validate and upload a payload JSON")
    parser.add_argument("--payload", required=True, help="Path to JSON payload file")
    parser.add_argument("--base-url", default="http://127.0.0.1:8080", help="API base URL")
    parser.add_argument("--token", required=True, help="Bearer token for analyst/admin user")
    parser.add_argument("--skip-validate", action="store_true", help="Skip /api/data/validate call")
    args = parser.parse_args()

    payload_path = Path(args.payload)
    if not payload_path.exists():
        raise SystemExit(f"Payload file not found: {payload_path}")

    with open(payload_path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    base = args.base_url.rstrip("/")

    if not args.skip_validate:
        validate_payload = {
            "dataset_type": payload["dataset_type"],
            "mappings": payload.get("mappings", []),
            "rows": payload.get("rows", [])[:200],
        }
        vr = post_json(f"{base}/api/data/validate", args.token, validate_payload)
        print("Validation result:")
        print(json.dumps(vr, indent=2, ensure_ascii=True))
        if not vr.get("valid", False):
            raise SystemExit("Validation failed. Fix data before upload.")

    ur = post_json(f"{base}/api/data/upload", args.token, payload)
    print("Upload result:")
    print(json.dumps(ur, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    main()

