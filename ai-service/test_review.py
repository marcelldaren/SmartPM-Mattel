"""
Manual test harness for /draft/review — feeds it deliberately broken drafts.

A reviewer that rubber-stamps is worse than no reviewer, so each case below states what
it EXPECTS and the script reports whether the review agreed. The subtle cost case matters
most: a transposed digit (2.400.000 -> 2.040.000) is exactly the kind of error a model
makes when copying a number into prose, and exactly what a supervisor would skim past.

Usage:
    python test_review.py            # run every case
    python test_review.py --case 2   # run one case

Requires the AI service on :5001 with a Gemini-capable provider.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

SERVICE = "http://127.0.0.1:5001/draft/review"

# The authoritative facts Node would have computed. Every draft below is judged against
# exactly these — the reviewer never recomputes them.
FACTS = {
    "provider": "gemini",
    "vendorName": "Apex Industrial Services",
    "machineName": "Injection Molder A2",
    "checksheetCode": "CS-2046",
    "findingTitle": "Needs replacement",
    "itemLabel": "Mold position sensor",
    "partName": "Omron E2E-X7D1 proximity sensor",
    "costIdr": 2_400_000,
}

GOOD_BODY = """Dear Apex Industrial Services,

During preventive maintenance on Injection Molder A2 (checksheet CS-2046), the mold position sensor was found to require replacement.

Requested part: Omron E2E-X7D1 proximity sensor x 1
Estimated cost: Rp 2.400.000

Please confirm availability and lead time.

- SmartPM automated request - PT Mattel Indonesia (PTMI)"""

CASES = [
    {
        "name": "control - correct draft",
        "expect_ok": True,
        "subject": "Part Request - Omron E2E-X7D1 proximity sensor, Injection Molder A2",
        "body": GOOD_BODY,
    },
    {
        "name": "SUBTLE cost error (transposed digits: 2.400.000 -> 2.040.000)",
        "expect_ok": False,
        "subject": "Part Request - Omron E2E-X7D1 proximity sensor, Injection Molder A2",
        "body": GOOD_BODY.replace("Rp 2.400.000", "Rp 2.040.000"),
    },
    {
        "name": "BLATANT cost error (Rp 450.000)",
        "expect_ok": False,
        "subject": "Part Request - Omron E2E-X7D1 proximity sensor, Injection Molder A2",
        "body": GOOD_BODY.replace("Rp 2.400.000", "Rp 450.000"),
    },
    {
        "name": "wrong machine (Conveyor Line 7)",
        "expect_ok": False,
        "subject": "Part Request - Omron E2E-X7D1 proximity sensor, Conveyor Line 7",
        "body": GOOD_BODY.replace("Injection Molder A2", "Conveyor Line 7"),
    },
    {
        "name": "no cost stated at all",
        "expect_ok": False,
        "subject": "Part Request - Omron E2E-X7D1 proximity sensor, Injection Molder A2",
        "body": GOOD_BODY.replace("Estimated cost: Rp 2.400.000\n", ""),
    },
    {
        "name": "no clear ask, abrupt tone",
        "expect_ok": False,
        "subject": "sensor",
        "body": "Send the Omron E2E-X7D1 proximity sensor for Injection Molder A2. Rp 2.400.000.",
    },
    {
        "name": "cost formatted differently (Rp2,400,000) - must still PASS",
        "expect_ok": True,
        "subject": "Part Request - Omron E2E-X7D1 proximity sensor, Injection Molder A2",
        "body": GOOD_BODY.replace("Rp 2.400.000", "IDR 2,400,000"),
    },
]

BOLD, DIM, RESET = "\033[1m", "\033[2m", "\033[0m"
GREEN, RED = "\033[32m", "\033[31m"


def review(subject: str, body: str) -> dict:
    payload = {**FACTS, "subject": subject, "body": body}
    req = urllib.request.Request(
        SERVICE, data=json.dumps(payload).encode(), headers={"content-type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.load(resp)
    except urllib.error.URLError as exc:
        return {"error": f"{exc}. Is the AI service running on :5001?"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--case", type=int, help="run only this case number (1-based)")
    args = ap.parse_args()

    cases = [CASES[args.case - 1]] if args.case else CASES
    print(f"\nAuthoritative cost: Rp {FACTS['costIdr']:,}".replace(",", ".") + f"  ->  {SERVICE}\n")

    passed = 0
    for i, case in enumerate(cases, 1):
        print(f"{BOLD}[{i}] {case['name']}{RESET}")
        res = review(case["subject"], case["body"])
        if "error" in res:
            print(f"    {RED}ERROR{RESET} {res['error']}\n")
            continue

        ok = res.get("reviewed_ok")
        agreed = ok == case["expect_ok"]
        passed += agreed
        mark = f"{GREEN}caught as expected{RESET}" if agreed else f"{RED}WRONG{RESET}"
        print(f"    expected reviewed_ok={case['expect_ok']}   got={ok}   {mark}")
        for issue in res.get("issues", []):
            print(f"      - {issue}")
        print()

    print(f"{passed}/{len(cases)} cases behaved as expected\n")
    return 0 if passed == len(cases) else 1


if __name__ == "__main__":
    raise SystemExit(main())
