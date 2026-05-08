#!/usr/bin/env python3
"""
Create + populate a Domo dataset on a target instance using the same
ryuu-session auth that community-domo-cli uses (refresh_token from
~/.config/configstore/ryuu/<instance>.json -> oauth2/token -> oauth2/sid ->
X-Domo-Authentication header).

Workflow (csv-upload provider, UPLOAD transport):

  1. POST /api/data/v1/streams                       create stream + dataset
  2. POST /api/data/v1/streams/{id}/executions       open an execution
  3. PUT  .../executions/{eid}/part/1   (text/csv)   stream the CSV body
  4. PUT  .../executions/{eid}/commit                commit (REPLACE)

Usage:
  scripts/domo_dataset.py create-and-upload \
    --instance domo.domo.com \
    --csv scripts/sales_org_people.csv \
    --name "Sales Org People (v2)"

Prints DATASET_ID=<uuid> on success.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path
from typing import Any


def http(method: str, url: str, *, headers: dict[str, str] | None = None,
         data: bytes | None = None, timeout: int = 120) -> tuple[int, dict[str, str], bytes]:
    req = urllib.request.Request(url=url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), e.read()


def get_sid(instance: str) -> str:
    cfg_path = Path.home() / ".config" / "configstore" / "ryuu" / f"{instance}.json"
    if not cfg_path.exists():
        raise SystemExit(f"No ryuu config for {instance} at {cfg_path}")
    cfg = json.loads(cfg_path.read_text())
    refresh = cfg.get("refreshToken")
    if not refresh:
        raise SystemExit(f"No refreshToken in {cfg_path}")

    base = f"https://{instance}/api"
    body = urllib.parse.urlencode({
        "client_id": "domo:internal:devstudio",
        "grant_type": "refresh_token",
        "refresh_token": refresh,
    }).encode()
    s, _, raw = http(
        "POST", f"{base}/oauth2/token",
        headers={"content-type": "application/x-www-form-urlencoded;charset=utf-8",
                 "accept": "application/json"},
        data=body,
    )
    if s >= 400:
        raise SystemExit(f"oauth2/token failed: {s} {raw[:300]!r}")
    access = json.loads(raw)["access_token"]
    s, _, raw = http(
        "GET", f"{base}/oauth2/sid",
        headers={"authorization": f"Bearer {access}", "accept": "application/json"},
    )
    if s >= 400:
        raise SystemExit(f"oauth2/sid failed: {s} {raw[:300]!r}")
    return json.loads(raw)["sid"]


def derive_columns(csv_path: Path, sample_rows: int = 200) -> list[dict[str, str]]:
    with csv_path.open(newline="") as f:
        reader = csv.reader(f)
        headers = next(reader)
        rows = []
        for i, r in enumerate(reader):
            if i >= sample_rows:
                break
            rows.append(r)

    cols: list[dict[str, str]] = []
    for col_idx, name in enumerate(headers):
        sampled = [r[col_idx] for r in rows if col_idx < len(r) and r[col_idx] != ""]
        if not sampled:
            t = "STRING"
        elif all(_is_int(v) for v in sampled):
            t = "LONG"
        elif all(_is_num(v) for v in sampled):
            t = "DOUBLE"
        elif all(_is_date(v) for v in sampled):
            t = "DATE"
        else:
            t = "STRING"
        cols.append({"name": name, "type": t})
    return cols


def _is_int(v: str) -> bool:
    try:
        int(v); return True
    except ValueError:
        return False


def _is_num(v: str) -> bool:
    try:
        float(v); return True
    except ValueError:
        return False


def _is_date(v: str) -> bool:
    if len(v) != 10:
        return False
    try:
        date.fromisoformat(v); return True
    except ValueError:
        return False


def create_stream(instance: str, sid: str, *, name: str, description: str,
                  columns: list[dict[str, str]]) -> dict[str, Any]:
    base = f"https://{instance}/api"
    payload = {
        "dataSource": {"name": name, "description": description},
        "transport": {"type": "UPLOAD"},
        "updateMethod": "REPLACE",
        "dataProvider": {"key": "csv-upload"},
        "schemaDefinition": {"columns": columns},
    }
    s, _, raw = http(
        "POST", f"{base}/data/v1/streams",
        headers={"x-domo-authentication": sid, "content-type": "application/json",
                 "accept": "application/json"},
        data=json.dumps(payload).encode(),
    )
    if s >= 400:
        raise SystemExit(f"create stream failed: {s} {raw[:600]!r}")
    return json.loads(raw)


def open_execution(instance: str, sid: str, stream_id: int) -> int:
    base = f"https://{instance}/api"
    s, _, raw = http(
        "POST", f"{base}/data/v1/streams/{stream_id}/executions",
        headers={"x-domo-authentication": sid, "content-type": "application/json",
                 "accept": "application/json"},
        data=b"{}",
    )
    if s >= 400:
        raise SystemExit(f"create execution failed: {s} {raw[:600]!r}")
    return int(json.loads(raw)["executionId"])


def upload_part(instance: str, sid: str, stream_id: int, exec_id: int,
                part: int, csv_bytes: bytes) -> None:
    base = f"https://{instance}/api"
    s, _, raw = http(
        "PUT", f"{base}/data/v1/streams/{stream_id}/executions/{exec_id}/part/{part}",
        headers={"x-domo-authentication": sid, "content-type": "text/csv",
                 "accept": "application/json"},
        data=csv_bytes,
    )
    if s >= 400:
        raise SystemExit(f"upload part {part} failed: {s} {raw[:600]!r}")


def commit_execution(instance: str, sid: str, stream_id: int, exec_id: int) -> dict[str, Any]:
    base = f"https://{instance}/api"
    s, _, raw = http(
        "PUT", f"{base}/data/v1/streams/{stream_id}/executions/{exec_id}/commit",
        headers={"x-domo-authentication": sid, "accept": "application/json"},
    )
    if s >= 400:
        raise SystemExit(f"commit failed: {s} {raw[:600]!r}")
    return json.loads(raw)


def wait_for_index(instance: str, sid: str, stream_id: int, exec_id: int,
                   timeout: int = 120) -> str:
    base = f"https://{instance}/api"
    deadline = time.time() + timeout
    while time.time() < deadline:
        s, _, raw = http(
            "GET", f"{base}/data/v1/streams/{stream_id}/executions/{exec_id}",
            headers={"x-domo-authentication": sid, "accept": "application/json"},
        )
        if s < 400:
            state = json.loads(raw).get("currentState", "")
            if state in ("SUCCESS", "ERROR", "INVALID", "FAILED"):
                return state
        time.sleep(2)
    return "TIMEOUT"


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    p1 = sub.add_parser("create-and-upload")
    p1.add_argument("--instance", required=True, help="e.g. domo.domo.com")
    p1.add_argument("--csv", required=True, type=Path)
    p1.add_argument("--name", required=True)
    p1.add_argument("--description", default="Created by sales-org-visualizer deploy script")

    p2 = sub.add_parser("upload-only")
    p2.add_argument("--instance", required=True)
    p2.add_argument("--csv", required=True, type=Path)
    p2.add_argument("--stream-id", required=True, type=int)

    args = p.parse_args(argv)

    sid = get_sid(args.instance)

    if args.cmd == "create-and-upload":
        cols = derive_columns(args.csv)
        print("Derived schema:")
        for c in cols:
            print(f"  {c['name']:<22} {c['type']}")

        stream = create_stream(
            args.instance, sid,
            name=args.name, description=args.description, columns=cols,
        )
        stream_id = int(stream["id"])
        ds_id = stream["dataSource"]["id"]
        print(f"\nCreated stream {stream_id}, dataset {ds_id}")
    else:
        stream_id = args.stream_id
        ds_id = None

    csv_bytes = args.csv.read_bytes()
    exec_id = open_execution(args.instance, sid, stream_id)
    print(f"Opened execution {exec_id}; uploading {len(csv_bytes)} bytes…")
    upload_part(args.instance, sid, stream_id, exec_id, 1, csv_bytes)
    commit_execution(args.instance, sid, stream_id, exec_id)
    final = wait_for_index(args.instance, sid, stream_id, exec_id)
    print(f"Execution finished with state={final}")

    if ds_id:
        print(f"\nDATASET_ID={ds_id}")
    return 0 if final == "SUCCESS" else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
