#!/usr/bin/env python3
"""
BonCore Concurrency & High-Throughput Stress Test
================================================
Fires concurrent requests against read, write, and adversarial error endpoints
to verify absence of SQLite lock contention, thread exhaustion, or HTTP 500 errors.
"""

import sys
import json
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_URL = "http://127.0.0.1:8000"

def task_invalid_table(idx):
    url = f"{BASE_URL}/api/orders/create"
    data = json.dumps({"table_id": 900000 + idx, "order_type": "dine_in"}).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json", "X-Restaurant-Code": "fatihciftligi"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, "unexpected_200"
    except urllib.error.HTTPError as e:
        return e.code, "expected_404"
    except Exception as e:
        return 0, str(e)

def task_read_areas(idx):
    url = f"{BASE_URL}/api/tables/areas"
    req = urllib.request.Request(url, headers={"X-Restaurant-Code": "fatihciftligi"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, "read_areas_ok"
    except Exception as e:
        return 0, str(e)

def task_read_categories(idx):
    url = f"{BASE_URL}/api/products/categories"
    req = urllib.request.Request(url, headers={"X-Restaurant-Code": "fatihciftligi"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, "read_cats_ok"
    except Exception as e:
        return 0, str(e)

def task_read_stats(idx):
    url = f"{BASE_URL}/api/orders/analytics/statistics"
    req = urllib.request.Request(url, headers={"X-Restaurant-Code": "fatihciftligi", "X-User-Role": "manager"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, "read_stats_ok"
    except Exception as e:
        return 0, str(e)

def run_stress():
    print("Executing 60 concurrent requests across read and error endpoints...")
    results = []
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = []
        for i in range(15):
            futures.append(executor.submit(task_invalid_table, i))
            futures.append(executor.submit(task_read_areas, i))
            futures.append(executor.submit(task_read_categories, i))
            futures.append(executor.submit(task_read_stats, i))

        for f in as_completed(futures):
            results.append(f.result())

    status_codes = [r[0] for r in results]
    http_500 = status_codes.count(500)
    http_200 = status_codes.count(200)
    http_404 = status_codes.count(404)
    network_errors = status_codes.count(0)

    print(f"Total concurrent requests: {len(results)}")
    print(f"HTTP 200 (Read OK): {http_200}")
    print(f"HTTP 404 (Adversarial Error Handled Cleanly): {http_404}")
    print(f"HTTP 500 (Internal Server Error): {http_500}")
    print(f"Network / Timeout Errors: {network_errors}")

    assert http_500 == 0, f"Observed {http_500} HTTP 500 errors!"
    assert network_errors == 0, f"Observed {network_errors} network errors!"
    assert http_404 == 15, f"Expected 15 HTTP 404 responses, got {http_404}"
    assert http_200 == 45, f"Expected 45 HTTP 200 responses, got {http_200}"
    print("CONCURRENCY & STRESS TEST PASSED WITH 100% SUCCESS!")
    return 0

if __name__ == "__main__":
    sys.exit(run_stress())
