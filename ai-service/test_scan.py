"""
Manual test harness for /scan/checksheet — prints the model's raw extraction per photo.

The point is to show, per image, exactly what came back BEFORE any of it reaches the form:
the local image metrics (sharpness, whether the page edges were found), then every field
with its confidence flag. If the extraction were guessing rather than reading, the flags
and the per-row results would not track the pen marks on the paper.

The machine catalogue is read straight out of the real SQLite database, not hardcoded, so
this exercises the same inspection points and categories the app itself uses.

Usage:
    python test_scan.py <folder-or-image>
    python test_scan.py scans/ --save-processed out/     # write the deskewed images out
    python test_scan.py sheet.jpg --prepare-only         # image pipeline only, no API call
    python test_scan.py sheet.jpg --json                 # raw JSON, unformatted

Requires the AI service on :5001 with AI_CHAT_PROVIDER able to reach Gemini
(--prepare-only needs neither the service nor a key).
"""

from __future__ import annotations

import argparse
import base64
import json
import pathlib
import sqlite3
import sys
import urllib.error
import urllib.request

SERVICE = "http://127.0.0.1:5001/scan/checksheet"
DB_PATH = pathlib.Path(__file__).resolve().parent.parent / "server" / "data" / "smartpm.db"
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

# Mirrors src/data.js FINDING_CATEGORIES. These live in the client bundle rather than the
# database, so unlike the machine catalogue they cannot be read out of SQLite.
CATEGORIES = [
    "Damaged part",
    "Needs replacement",
    "Needs lubrication",
    "Misaligned",
    "Leak detected",
    "Abnormal noise / vibration",
]

DIM = "\033[2m"
BOLD = "\033[1m"
RESET = "\033[0m"
RED = "\033[31m"
GREEN = "\033[32m"
AMBER = "\033[33m"


def load_catalogue() -> tuple[list[dict], list[str]]:
    """Machines + their checklists + technician names, from the live database."""
    if not DB_PATH.exists():
        sys.exit(f"Database not found at {DB_PATH}. Start the backend once to create it.")
    con = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        machines = []
        for mid, name, code in con.execute("SELECT id, name, code FROM machines ORDER BY id"):
            points = [
                r[0]
                for r in con.execute(
                    "SELECT label FROM checklist_items WHERE machine_id = ? ORDER BY sort_order", (mid,)
                )
            ]
            machines.append({"name": name, "code": code, "points": points})
        techs = [
            r[0] for r in con.execute("SELECT display_name FROM users WHERE role = 'technician' ORDER BY id")
        ]
        return machines, techs
    finally:
        con.close()


def post(payload: dict) -> dict:
    req = urllib.request.Request(
        SERVICE,
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return json.load(resp)
    except urllib.error.URLError as exc:
        sys.exit(f"Could not reach the AI service at {SERVICE}: {exc}")


def flag(conf: str) -> str:
    return f"{GREEN}high{RESET}" if conf == "high" else f"{AMBER}LOW{RESET}"


def render(path: pathlib.Path, res: dict, known_points: dict[str, list[str]]) -> None:
    print(f"\n{BOLD}{'=' * 78}{RESET}")
    print(f"{BOLD}{path.name}{RESET}")
    print(f"{BOLD}{'=' * 78}{RESET}")

    if not res.get("supported"):
        print(f"{RED}unsupported provider{RESET} — {res.get('note')}")
        return

    blur, thr = res.get("blur"), res.get("blurThreshold")
    if blur is not None:
        verdict = f"{RED}BELOW THRESHOLD{RESET}" if thr and blur < thr else f"{GREEN}ok{RESET}"
        print(f"  sharpness (Laplacian var) : {blur}  (threshold {thr})  {verdict}")
    if res.get("deskewed") is not None:
        found = res["deskewed"]
        print(
            f"  page edges detected       : "
            f"{GREEN + 'yes — deskewed + cropped' + RESET if found else AMBER + 'no — used frame as-is' + RESET}"
        )
    if res.get("width"):
        print(f"  image sent to model       : {res['width']}x{res['height']} px")
    if res.get("model"):
        print(f"  model                     : {res['model']}")

    if not res.get("ok"):
        print(f"\n  {RED}STOPPED{RESET} ({res.get('reason')}) — {res.get('note')}")
        if res.get("reason") == "blurry":
            print(f"  {DIM}No Gemini call was made — the blur gate short-circuited.{RESET}")
        return

    ex = res.get("extraction") or {}
    print(f"\n  {BOLD}Header{RESET}")
    print(f"    technician : {ex.get('technicianName')!r:<34} {flag(ex.get('technicianConfidence'))}")
    print(f"    date       : {ex.get('date')!r:<34} {flag(ex.get('dateConfidence'))}")
    print(f"    machine    : {ex.get('machine')!r:<34} {flag(ex.get('machineConfidence'))}")

    valid = known_points.get(ex.get("machine") or "", [])
    print(f"\n  {BOLD}Rows{RESET}")
    for i, p in enumerate(ex.get("points") or [], 1):
        label = p.get("label", "")
        known = f"{GREEN}✓{RESET}" if label in valid else f"{RED}✗ not on this machine{RESET}"
        result = p.get("result")
        colour = {"pass": GREEN, "fail": AMBER}.get(result, DIM)
        print(f"    {i}. {label[:44]:<44} {known}")
        print(f"       result   {colour}{result:<6}{RESET} {flag(p.get('resultConfidence'))}", end="")
        if result == "fail":
            cat = p.get("category")
            cat_known = "" if cat in CATEGORIES or cat is None else f" {RED}(not a real category){RESET}"
            print(f"   category {cat!r} {flag(p.get('categoryConfidence'))}{cat_known}", end="")
            print(f"   photo {p.get('photoAttached')}", end="")
        print()

    lows = sum(
        1
        for p in ex.get("points") or []
        if p.get("resultConfidence") != "high"
        or (p.get("result") == "fail" and p.get("categoryConfidence") != "high")
    )
    fails = sum(1 for p in (ex.get("points") or []) if p.get("result") == "fail")
    print(
        f"\n  {BOLD}Summary{RESET}: {len(ex.get('points') or [])} rows · {fails} fail · "
        f"{AMBER}{lows} row(s) flagged low-confidence{RESET}"
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("target", help="image file or folder of images")
    ap.add_argument("--prepare-only", action="store_true", help="run the local image pipeline only")
    ap.add_argument("--save-processed", metavar="DIR", help="write the deskewed image the model received")
    ap.add_argument("--json", action="store_true", help="dump raw JSON instead of the formatted view")
    args = ap.parse_args()

    target = pathlib.Path(args.target)
    if target.is_dir():
        images = sorted(p for p in target.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES)
    elif target.exists():
        images = [target]
    else:
        sys.exit(f"Not found: {target}")
    if not images:
        sys.exit(f"No images in {target}")

    if args.prepare_only:
        import scan  # local import: only this path needs OpenCV

        for path in images:
            data = base64.b64encode(path.read_bytes()).decode()
            prepared = scan.prepare(data)
            state = f"{GREEN}ok{RESET}" if prepared.ok else f"{RED}{prepared.reason}{RESET}"
            print(
                f"{path.name:<28} sharpness {prepared.blur:8.1f} "
                f"(thr {prepared.blur_threshold})  deskewed={prepared.deskewed}  "
                f"{prepared.width}x{prepared.height}  {state}"
            )
            if prepared.ok and args.save_processed:
                out = pathlib.Path(args.save_processed)
                out.mkdir(parents=True, exist_ok=True)
                (out / f"{path.stem}_processed.jpg").write_bytes(base64.b64decode(prepared.image_base64))
        return

    machines, techs = load_catalogue()
    known_points = {m["name"]: m["points"] for m in machines}
    print(f"{DIM}Catalogue from {DB_PATH.name}: "
          f"{len(machines)} machines, {sum(len(m['points']) for m in machines)} inspection points, "
          f"{len(CATEGORIES)} categories, {len(techs)} technicians{RESET}")

    for path in images:
        res = post(
            {
                "imageBase64": base64.b64encode(path.read_bytes()).decode(),
                "machines": machines,
                "categories": CATEGORIES,
                "technicians": techs,
                "returnProcessed": bool(args.save_processed),
            }
        )
        if args.save_processed and res.get("processedImageBase64"):
            out = pathlib.Path(args.save_processed)
            out.mkdir(parents=True, exist_ok=True)
            dest = out / f"{path.stem}_processed.jpg"
            dest.write_bytes(base64.b64decode(res["processedImageBase64"]))
            print(f"{DIM}wrote {dest}{RESET}")

        if args.json:
            res.pop("processedImageBase64", None)
            print(f"\n=== {path.name} ===")
            print(json.dumps(res, indent=2, ensure_ascii=False))
        else:
            render(path, res, known_points)


if __name__ == "__main__":
    main()
