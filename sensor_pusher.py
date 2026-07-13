"""
PRANA — Python IoT Sensor Pusher
─────────────────────────────────────────
Connect real sensors (thermal camera, microphone,
seismic sensor, CO2 sensor) and push data to PRANA backend.

Install: pip install websocket-client requests

Usage:
  python sensor_pusher.py                    # WebSocket mode (real-time)
  python sensor_pusher.py --mode rest        # REST mode (simpler, polling)
  python sensor_pusher.py --zone SECTOR-A1   # Push to specific zone
"""

import websocket
import requests
import json
import time
import argparse
import random
import threading

BACKEND_WS   = "wss://prana-the-decider.onrender.com"
BACKEND_REST = "https://prana-the-decider.onrender.com/api/sensor"
ZONE_ID      = "SECTOR-A1"

# ─────────────────────────────────────────
#  REPLACE THESE with your actual sensor reads
# ─────────────────────────────────────────

def read_thermal():
    """
    Replace with your thermal camera SDK call.
    Example: return thermal_cam.get_peak_temp()
    """
    return round(random.uniform(34.0, 38.5), 2)

def read_sound():
    """
    Replace with your microphone/acoustic sensor.
    Example: return microphone.get_peak_db()
    """
    return round(random.uniform(20, 80), 1)

def read_vibration():
    """
    Replace with your seismic/vibration sensor.
    Example: return seismic.get_mg()
    """
    return round(random.uniform(5, 70), 1)

def read_co2():
    """
    Replace with your CO2 sensor (e.g. MH-Z19B via serial).
    Example: return co2_sensor.read_ppm()
    """
    return round(random.uniform(400, 1700), 0)

def read_motion():
    """
    Replace with your PIR / optical flow sensor.
    Example: return motion_sensor.get_delta_percent()
    """
    return round(random.uniform(0, 12), 2)

def get_sensor_readings():
    """Collect all sensor values into one dict."""
    return {
        "thermal":   read_thermal(),
        "sound":     read_sound(),
        "vibration": read_vibration(),
        "co2":       read_co2(),
        "motion":    read_motion(),
    }


# ─────────────────────────────────────────
#  WEBSOCKET MODE (recommended — real-time)
# ─────────────────────────────────────────

def run_websocket(zone_id, interval=1.0):
    print(f"[PRANA] Connecting via WebSocket to {BACKEND_WS}...")

    def on_open(ws):
        print(f"[PRANA] ✓ Connected! Pushing {zone_id} data every {interval}s")

        def push_loop():
            while True:
                readings = get_sensor_readings()
                msg = {
                    "type": "SENSOR_UPDATE",
                    "payload": {
                        "zoneId":  zone_id,
                        "sensors": readings,
                        "source":  "python-iot",
                    }
                }
                try:
                    ws.send(json.dumps(msg))
                    print(f"[{zone_id}] thermal={readings['thermal']}°C | "
                          f"sound={readings['sound']}dB | "
                          f"co2={readings['co2']}ppm | "
                          f"vibration={readings['vibration']}mg")
                except Exception as e:
                    print(f"[ERROR] Send failed: {e}")
                    break
                time.sleep(interval)

        thread = threading.Thread(target=push_loop, daemon=True)
        thread.start()

    def on_error(ws, error):
        print(f"[PRANA] Error: {error}")

    def on_close(ws, *args):
        print("[PRANA] Disconnected. Reconnecting in 3s...")
        time.sleep(3)
        run_websocket(zone_id, interval)

    ws_app = websocket.WebSocketApp(
        BACKEND_WS,
        on_open=on_open,
        on_error=on_error,
        on_close=on_close,
    )
    ws_app.run_forever()


# ─────────────────────────────────────────
#  REST MODE (simpler — no persistent connection)
# ─────────────────────────────────────────

def run_rest(zone_id, interval=2.0):
    print(f"[PRANA] Pushing via REST to {BACKEND_REST} every {interval}s...")
    while True:
        readings = get_sensor_readings()
        payload = {
            "zoneId":  zone_id,
            "sensors": readings,
            "source":  "python-iot-rest",
        }
        try:
            r = requests.post(BACKEND_REST, json=payload, timeout=3)
            if r.ok:
                print(f"[{zone_id}] ✓ {readings}")
            else:
                print(f"[{zone_id}] ✗ HTTP {r.status_code}: {r.text}")
        except Exception as e:
            print(f"[ERROR] {e}")
        time.sleep(interval)


# ─────────────────────────────────────────
#  MULTI-ZONE MODE (push multiple zones)
# ─────────────────────────────────────────

def run_multi_zone(zones, interval=2.0):
    """Push sensor data for multiple zones simultaneously."""
    def push_zone(zone_id):
        run_rest(zone_id, interval + random.uniform(0, 0.5))

    threads = []
    for z in zones:
        t = threading.Thread(target=push_zone, args=(z,), daemon=True)
        threads.append(t)
        t.start()

    print(f"[PRANA] Pushing {len(zones)} zones simultaneously")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[PRANA] Stopped.")


# ─────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PRANA Sensor Pusher")
    parser.add_argument("--mode",     default="rest", choices=["websocket","rest","multi"])
    parser.add_argument("--zone",     default=ZONE_ID)
    parser.add_argument("--interval", default=1.0, type=float)
    args = parser.parse_args()

    print("╔══════════════════════════════════╗")
    print("║  PRANA Python Sensor Pusher      ║")
    print(f"║  Mode: {args.mode:<26}║")
    print(f"║  Zone: {args.zone:<26}║")
    print("╚══════════════════════════════════╝\n")

    if args.mode == "websocket":
        run_websocket(args.zone, args.interval)
    elif args.mode == "rest":
        run_rest(args.zone, args.interval)
    elif args.mode == "multi":
        all_zones = ["SECTOR-A1","SECTOR-B2","SECTOR-C3","SECTOR-D1","SECTOR-E2"]
        run_multi_zone(all_zones, args.interval)
