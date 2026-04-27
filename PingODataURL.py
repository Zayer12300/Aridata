#!/usr/bin/env python3
"""
SAP OData Ping Utility — DEV 110
Pings all configured OData service endpoints and reports their status.
"""

import requests
from requests.auth import HTTPBasicAuth
import urllib3
from datetime import datetime
import time
import sys

# ─── Suppress SSL warnings (self-signed / internal CA) ────────────
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ══════════════════════════════════════════════════════════════════
#  CONFIGURATION
# ══════════════════════════════════════════════════════════════════

USERNAME    = "ZTEST1_SD110"
PASSWORD    = "Welcome@123456789"
ENVIRONMENT = "DEV 110"
TIMEOUT     = 15          # seconds per request
VERIFY_SSL  = False       # set to "/path/to/ca-bundle.pem" if you have the corp cert

ODATA_SERVICES = [
    {
        "name": "Purchase Order FS",
        "url":  "https://vhaftw05wd01.sap.corp.asmo.com:44380/sap/opu/odata/sap/C_PURCHASEORDER_FS_SRV",
    },
    {
        "name": "PO Maintain V2",
        "url":  "https://vhaftw05wd01.sap.corp.asmo.com:44380/sap/opu/odata/sap/MM_PUR_PO_MAINT_V2_SRV",
    },
    {
        "name": "Inbound Delivery API",
        "url":  "https://vhaftwdqwd01.sap.corp.asmo.com:44380/sap/opu/odata/sap/API_INBOUND_DELIVERY_SRV",
    },
    {
        "name": "LE Inbound Delivery ObjPg",
        "url":  "https://vhaftw05wd01.sap.corp.asmo.com:44380/sap/opu/odata/sap/LE_SHP_INBOUND_DELIVERY_OBJPG_SRV",
    },
]

# ══════════════════════════════════════════════════════════════════
#  STATUS HELPERS
# ══════════════════════════════════════════════════════════════════

# HTTP codes that mean "service is alive"
ALIVE_CODES = {200, 201, 204, 400, 401, 403, 404, 405, 500}

def resolve_status(http_code: int) -> tuple[str, str]:
    """Return (icon_label, note) based on HTTP response code."""
    mapping = {
        200: ("✅  UP",        "Authenticated & responding"),
        201: ("✅  UP",        "Created — service is live"),
        204: ("✅  UP",        "No Content — service is live"),
        400: ("⚠️   WARN",     "Bad Request — service alive, check query"),
        401: ("✅  UP",        "Reachable — credentials rejected (check user/client)"),
        403: ("⚠️   WARN",     "Forbidden — service alive, authorization issue"),
        404: ("⚠️   WARN",     "Not Found — wrong service path?"),
        405: ("⚠️   WARN",     "Method Not Allowed — service alive"),
        500: ("⚠️   WARN",     "Server Error — SAP internal issue"),
    }
    return mapping.get(http_code, ("⚠️   WARN", f"Unexpected HTTP {http_code}"))


# ══════════════════════════════════════════════════════════════════
#  PING FUNCTION
# ══════════════════════════════════════════════════════════════════

def ping_service(service: dict) -> dict:
    """
    Ping a single OData service by requesting its $metadata document.
    Returns a result dict with status, HTTP code, latency, and any error.
    """
    metadata_url = service["url"].rstrip("/") + "/$metadata"
    start = time.perf_counter()

    try:
        response = requests.get(
            metadata_url,
            auth=HTTPBasicAuth(USERNAME, PASSWORD),
            timeout=TIMEOUT,
            verify=VERIFY_SSL,
            headers={
                "Accept":       "application/xml, application/json;q=0.9",
                "sap-client":   "110",
                "x-csrf-token": "fetch",
            },
        )
        elapsed_ms = round((time.perf_counter() - start) * 1000, 1)
        icon, note = resolve_status(response.status_code)

        return {
            "name":    service["name"],
            "url":     service["url"],
            "status":  icon,
            "http":    response.status_code,
            "ms":      elapsed_ms,
            "note":    note,
            "error":   None,
        }

    except requests.exceptions.ConnectTimeout:
        elapsed_ms = round((time.perf_counter() - start) * 1000, 1)
        return {
            "name":   service["name"],
            "url":    service["url"],
            "status": "❌  TIMEOUT",
            "http":   None,
            "ms":     elapsed_ms,
            "note":   f"No response within {TIMEOUT}s",
            "error":  "ConnectTimeout",
        }

    except requests.exceptions.SSLError as e:
        elapsed_ms = round((time.perf_counter() - start) * 1000, 1)
        return {
            "name":   service["name"],
            "url":    service["url"],
            "status": "❌  SSL ERROR",
            "http":   None,
            "ms":     elapsed_ms,
            "note":   "SSL certificate verification failed",
            "error":  str(e)[:150],
        }

    except requests.exceptions.ConnectionError as e:
        elapsed_ms = round((time.perf_counter() - start) * 1000, 1)
        return {
            "name":   service["name"],
            "url":    service["url"],
            "status": "❌  UNREACHABLE",
            "http":   None,
            "ms":     elapsed_ms,
            "note":   "Host unreachable or DNS failure",
            "error":  str(e)[:150],
        }

    except requests.exceptions.ReadTimeout:
        elapsed_ms = round((time.perf_counter() - start) * 1000, 1)
        return {
            "name":   service["name"],
            "url":    service["url"],
            "status": "❌  READ TIMEOUT",
            "http":   None,
            "ms":     elapsed_ms,
            "note":   "Connected but no data received in time",
            "error":  "ReadTimeout",
        }

    except Exception as e:
        elapsed_ms = round((time.perf_counter() - start) * 1000, 1)
        return {
            "name":   service["name"],
            "url":    service["url"],
            "status": "❌  ERROR",
            "http":   None,
            "ms":     elapsed_ms,
            "note":   "Unexpected error",
            "error":  str(e)[:150],
        }


# ══════════════════════════════════════════════════════════════════
#  REPORT PRINTER
# ══════════════════════════════════════════════════════════════════

DIVIDER = "═" * 110

def print_header():
    print()
    print(DIVIDER)
    print(f"  SAP OData Ping Report")
    print(f"  Environment : {ENVIRONMENT}")
    print(f"  User        : {USERNAME}")
    print(f"  Timestamp   : {datetime.now().strftime('%Y-%m-%d  %H:%M:%S')}")
    print(f"  Timeout     : {TIMEOUT}s per service")
    print(DIVIDER)
    print(f"  {'#':<4} {'Service':<28} {'Status':<18} {'HTTP':<7} {'Latency':>9}  Note")
    print("─" * 110)

def print_result(idx: int, result: dict):
    http_str = str(result["http"]) if result["http"] else "—"
    ms_str   = f"{result['ms']} ms"
    note     = result["note"] or ""
    print(f"  {idx:<4} {result['name']:<28} {result['status']:<18} {http_str:<7} {ms_str:>9}  {note}")

def print_footer(results: list):
    total      = len(results)
    up_count   = sum(1 for r in results if r["status"].startswith("✅"))
    warn_count = sum(1 for r in results if r["status"].startswith("⚠️"))
    down_count = sum(1 for r in results if r["status"].startswith("❌"))

    print("─" * 110)
    print(f"  Summary:  {total} services pinged  │  ✅ UP: {up_count}  │  ⚠️  WARN: {warn_count}  │  ❌ DOWN/ERROR: {down_count}")
    print(DIVIDER)

    # Print detailed error info for any failures
    failures = [r for r in results if r["error"]]
    if failures:
        print()
        print("  ── Error Details ──────────────────────────────────────────────────────────")
        for r in failures:
            print(f"  [{r['name']}]")
            print(f"    URL   : {r['url']}")
            print(f"    Error : {r['error']}")
        print()

    print()
    print("  Legend:")
    print("    ✅ UP (200) — Authenticated and responding normally")
    print("    ✅ UP (401) — Service is reachable; check SAP user / client assignment")
    print("    ⚠️  WARN    — Service is alive but returned an unexpected HTTP code")
    print("    ❌ ERROR    — Service is unreachable (network/timeout/SSL issue)")
    print()


# ══════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════

def main():
    print_header()
    results = []

    for idx, service in enumerate(ODATA_SERVICES, start=1):
        sys.stdout.write(f"  {idx:<4} {service['name']:<28} pinging...\r")
        sys.stdout.flush()

        result = ping_service(service)
        results.append(result)
        print_result(idx, result)

    print_footer(results)
    return 0 if all(r["status"].startswith("✅") for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())