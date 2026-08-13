"""
Manual test harness for /vision/verify — prints the model's raw output per image.

The point of this script is falsifiability. A model that is merely echoing the category
label back will return "Consistent" no matter which category you hand it, so `--sweep`
runs one image against every finding category at once. If the verdicts differ across
categories, the model is genuinely looking at the pixels; if they are all "Consistent",
it is rubber-stamping and the prompt needs work.

Usage:
    python test_vision.py <folder-or-image> --category "Damaged part"
    python test_vision.py <folder-or-image> --sweep
    python test_vision.py photo.jpg --sweep --machine "Conveyor Line 7" --item "Roller bearings"

Requires the AI service running on :5001 with AI_CHAT_PROVIDER able to reach Gemini.
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import pathlib
import sys

import urllib.error
import urllib.request

SERVICE = "http://127.0.0.1:5001/vision/verify"
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}

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
COLOR = {
    "Consistent": "\033[32m",
    "Uncertain": "\033[90m",
    "Possible mismatch": "\033[33m",
}


def collect(target: pathlib.Path) -> list[pathlib.Path]:
    if target.is_file():
        return [target]
    return sorted(p for p in target.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES)


def verify(path: pathlib.Path, category: str, machine: str, item: str) -> dict:
    mime = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    payload = {
        "provider": "gemini",
        "imageBase64": base64.b64encode(path.read_bytes()).decode(),
        "mime": mime,
        "category": category,
        "machineName": machine,
        "itemLabel": item,
    }
    req = urllib.request.Request(
        SERVICE,
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.load(resp)
    except urllib.error.URLError as exc:
        return {"error": f"{exc}. Is the AI service running on :5001?"}


def show(category: str, res: dict) -> None:
    if "error" in res:
        print(f"  {category:<28} ERROR  {res['error']}")
        return
    if not res.get("supported"):
        print(f"  {category:<28} SKIPPED  {res.get('note')}")
        return

    verdict = res.get("verdict") or "— no verdict —"
    tint = COLOR.get(verdict, "")
    print(f"  {BOLD}{category}{RESET}")
    print(f"    verdict     {tint}{verdict}{RESET}")
    if res.get("description"):
        print(f"    observed    {DIM}{res['description']}{RESET}")
    if res.get("reasoning"):
        print(f"    reasoning   {DIM}{res['reasoning']}{RESET}")
    if res.get("note"):
        print(f"    note        {DIM}{res['note']}{RESET}")
    print()


def main() -> int:
    ap = argparse.ArgumentParser(description="Run photos through SmartPM's vision verifier.")
    ap.add_argument("target", type=pathlib.Path, help="Image file or folder of images")
    ap.add_argument("--category", default="Damaged part", help="Claimed finding category")
    ap.add_argument("--sweep", action="store_true", help="Run each image against every category")
    ap.add_argument("--machine", default="CNC Mill #3")
    ap.add_argument("--item", default="Spindle housing")
    ap.add_argument("--raw", action="store_true", help="Also dump the raw JSON response")
    args = ap.parse_args()

    if not args.target.exists():
        print(f"No such path: {args.target}", file=sys.stderr)
        return 1

    images = collect(args.target)
    if not images:
        print(f"No images found in {args.target} ({', '.join(sorted(IMAGE_SUFFIXES))})", file=sys.stderr)
        return 1

    categories = CATEGORIES if args.sweep else [args.category]
    print(f"\n{len(images)} image(s) x {len(categories)} category/categories -> {SERVICE}\n")

    for path in images:
        kb = path.stat().st_size / 1024
        print(f"{BOLD}=== {path.name} {RESET}{DIM}({kb:.0f} KB){RESET}")
        verdicts = []
        for category in categories:
            res = verify(path, category, args.machine, args.item)
            show(category, res)
            if args.raw:
                print(f"    {DIM}raw: {json.dumps(res, ensure_ascii=False)}{RESET}\n")
            verdicts.append(res.get("verdict"))

        # The echo check: identical verdicts across every category means the model is not
        # discriminating between claims, whatever the prose says.
        if args.sweep:
            distinct = {v for v in verdicts if v}
            if len(distinct) <= 1:
                print(f"  {DIM}!! every category returned {distinct or 'nothing'} — possible rubber-stamping{RESET}")
            else:
                print(f"  {DIM}ok: {len(distinct)} distinct verdicts across {len(categories)} categories{RESET}")
        print()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
