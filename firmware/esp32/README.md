# FloodNav ESP32 — PlatformIO

Source code for **ESP32 → Supabase Edge Function → FloodNav app**.

Default board: generic ESP32 Dev Module (`esp32dev`). The exact sensor model has not been supplied, so this project has two explicit environments:

- `esp32dev_serial`: working commissioning uploader. Enter an actual measured depth in centimeters through the USB serial monitor. It does not fabricate sensor values.
- `esp32dev_sensor`: hardware deployment entry point. Implement `readFloodDepthCm()` in `src/sensor.cpp` for the selected sensor first. Until then it reports no valid reading and uploads nothing.

Do not use the serial environment as unattended flood monitoring. No sensor pins are assumed. ESP32-S3/C3 or a specific board may require a different PlatformIO board ID before upload.

## Setup

1. Open this `firmware/esp32` folder with VS Code + PlatformIO.
2. Copy `include/secrets.example.h` to `include/secrets.h` and fill Wi-Fi SSID/password, Supabase project URL, registered sensor ID and its 64-character device token.
3. Copy `include/root_ca.example.h` to `include/root_ca.h`. Insert the PEM root CA from the issuer of **your project's HTTPS certificate chain**. The uploader verifies TLS; an absent or wrong CA prevents transmission. NTP time sync is required before TLS and observation timestamps.
4. Apply the database migration, register the sensor/token and deploy `ingest-reading` using [the Supabase guide](../../../docs/SUPABASE.md).
5. Build, then explicitly upload to the correct connected board:

```sh
pio run -e esp32dev_serial
pio run -e esp32dev_serial -t upload
pio device monitor -e esp32dev_serial
```

If using the local verification virtual environment from this workspace on Windows, replace `pio` with `.venv\Scripts\platformio.exe`. Its dependencies are ignored by Git.

After Wi-Fi/time synchronization, enter `23.5` followed by Enter. Look for **Supabase accepted reading (202)**. Open FloodNav → Online routes → Supabase ESP sensors, configure the public connection, and check the sensor reading after the next refresh.

## Wire contract

```json
{
  "sensor_id": "cebu-001",
  "reading_id": "469099cc-cf60-4789-90a0-75c161294169",
  "water_depth_cm": 23.5,
  "observed_at": "2026-09-20T08:00:00Z"
}
```

The device POSTs to `/functions/v1/ingest-reading` with `Content-Type: application/json` and `x-device-token`. Never put a Supabase service-role key or browser publishable key in the firmware: only the per-device token is needed.

Each observation has a random UUID v4. Network/server failures retry the **same payload, UUID and timestamp**, with backoff from 5 to 60 seconds. A pending sample expires after four minutes; a new sample is required. The queue is RAM-only and holds one reading, so power loss drops pending data. It is not an offline data logger.

The hardware environment samples every 30 seconds. Serial commissioning mode consumes one entered measurement at a time. While an upload is pending, another entered measurement is discarded with a message; enter a fresh sample after completion. Invalid/no reading never becomes `0` (zero is a measured dry condition). Authentication failures stop uploads until configuration is corrected and the board reboots. No token or Wi-Fi password is printed.

## Sensor adapter

`readFloodDepthCm(float&)` must return `true` only when it obtains a new valid depth between 0 and 1000 cm. Add driver initialization in `beginSensor()`. Keep calibration and hardware-error handling in the adapter. If the sensor measures distance rather than depth, perform the calibrated conversion there before uploading.

Build the hardware environment after implementing the adapter:

```sh
pio run -e esp32dev_sensor
```

## Tests

The Unity test checks numeric parsing, zero, upper bound and invalid values. Compilation without uploading:

```sh
pio test -e esp32dev_test --without-uploading --without-testing
```

Run on a deliberately connected test board with `pio test -e esp32dev_test`. No firmware is automatically flashed by this repository.

Official references: [PlatformIO ESP32 Dev Module](https://docs.platformio.org/en/stable/boards/espressif32/esp32dev.html), [Espressif Arduino core](https://github.com/espressif/arduino-esp32).
