#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <esp_system.h>
#include <time.h>
#include "measurement.h"
#include "sensor.h"
#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif
#if __has_include("root_ca.h")
#include "root_ca.h"
#else
#include "root_ca.example.h"
#endif

namespace {
constexpr uint32_t SEND_INTERVAL_MS = 30000;
constexpr uint32_t MAX_RETRY_AGE_MS = 240000;
bool configured = false, credentialsRejected = false;
bool announcedReady = false;
uint32_t lastWifiAttempt = 0, lastSample = 0;
struct PendingReading {
  bool active = false;
  String json;
  uint32_t capturedAt = 0, nextAttempt = 0, backoff = 5000;
} pending;

bool due(uint32_t now, uint32_t when) { return static_cast<int32_t>(now - when) >= 0; }
bool clockReady() { return time(nullptr) >= 1735689600; }
void discardOfflineInput() {
#if FLOODNAV_SERIAL_INPUT
  while (Serial.available()) Serial.read();
#endif
}
bool configReady() {
  if (!strlen(WIFI_SSID) || strlen(DEVICE_TOKEN) != 64 || !strlen(SENSOR_ID) || strlen(SENSOR_ID) > 64) return false;
  for (const char* c = DEVICE_TOKEN; *c; ++c) if (!isxdigit(static_cast<unsigned char>(*c))) return false;
  for (const char* c = SENSOR_ID; *c; ++c) if (!isalnum(static_cast<unsigned char>(*c)) && *c != '_' && *c != '-') return false;
  const String url(SUPABASE_PROJECT_URL);
  return url.startsWith("https://") && url.indexOf("YOUR_PROJECT") < 0 && strstr(ROOT_CA_PEM, "-----BEGIN CERTIFICATE-----");
}
String uuidV4() {
  uint8_t b[16]; esp_fill_random(b, sizeof(b));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  char id[37];
  snprintf(id, sizeof(id), "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x", b[0],b[1],b[2],b[3],b[4],b[5],b[6],b[7],b[8],b[9],b[10],b[11],b[12],b[13],b[14],b[15]);
  return String(id);
}
void capture(float depth, uint32_t now) {
  const time_t timestamp = time(nullptr);
  struct tm utc; gmtime_r(&timestamp, &utc);
  char observedAt[25]; strftime(observedAt, sizeof(observedAt), "%Y-%m-%dT%H:%M:%SZ", &utc);
  JsonDocument doc;
  doc["sensor_id"] = SENSOR_ID; doc["reading_id"] = uuidV4();
  doc["water_depth_cm"] = roundf(depth * 100.0f) / 100.0f;
  doc["observed_at"] = observedAt;
  pending.json = ""; serializeJson(doc, pending.json);
  pending.active = true; pending.capturedAt = now; pending.nextAttempt = now; pending.backoff = 5000;
  Serial.printf("Measured %.2f cm; queued one reading.\n", depth);
}
void upload(uint32_t now) {
  WiFiClientSecure tls;
  tls.setCACert(ROOT_CA_PEM);
  tls.setHandshakeTimeout(10);
  HTTPClient http;
  String url(SUPABASE_PROJECT_URL);
  while (url.endsWith("/")) url.remove(url.length()-1);
  http.setConnectTimeout(8000); http.setTimeout(8000);
  // Redirects stay disabled: never forward the device token to another host.
  const bool started = http.begin(tls, url + "/functions/v1/ingest-reading");
  int status = -1;
  if (started) {
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-device-token", DEVICE_TOKEN);
    status = http.POST(pending.json);
    http.end();
  }
  if (status == 202) { pending.active = false; Serial.println("Supabase accepted reading (202)."); }
  else if (status == 401 || status == 403) {
    pending.active = false; credentialsRejected = true;
    Serial.println("Device rejected. Check token, sensor registration and enabled status; reboot after fixing.");
  } else if (status >= 400 && status < 500 && status != 408 && status != 429) {
    pending.active = false;
    Serial.printf("Payload/endpoint rejected (%d). Verify configuration; reading discarded.\n", status);
  } else {
    pending.nextAttempt = millis() + pending.backoff;
    pending.backoff = min(pending.backoff * 2, static_cast<uint32_t>(60000));
    Serial.printf("Upload unavailable (%d); retrying same reading ID.\n", status);
  }
  (void)now;
}
}

void setup() {
  Serial.begin(115200);
  beginSensor();
  configured = configReady();
  if (!configured) { Serial.println("Configure include/secrets.h and include/root_ca.h first. Upload is disabled."); return; }
  WiFi.mode(WIFI_STA); WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.println("Connecting Wi-Fi and synchronizing time before verified HTTPS uploads.");
}

void loop() {
  const uint32_t now = millis();
  if (!configured || credentialsRejected) { delay(100); return; }
  if (pending.active && now - pending.capturedAt >= MAX_RETRY_AGE_MS) {
    pending.active = false; Serial.println("Discarded old pending reading; awaiting a new measurement.");
  }
  if (WiFi.status() != WL_CONNECTED) {
    discardOfflineInput();
    announcedReady = false;
    if (now - lastWifiAttempt >= 15000) { lastWifiAttempt = now; WiFi.reconnect(); Serial.println("Reconnecting Wi-Fi..."); }
    delay(10); return;
  }
  if (!clockReady()) { discardOfflineInput(); delay(10); return; }
  if (!announcedReady) { announcedReady = true; Serial.println("Wi-Fi and clock ready. Awaiting a fresh depth measurement."); }
  float depth = 0;
#if FLOODNAV_SERIAL_INPUT
  // Consume commissioning input promptly, including while a previous upload retries.
  if (readFloodDepthCm(depth)) {
    if (!pending.active) capture(depth, now);
    else Serial.println("Previous reading still pending; enter a fresh sample after it completes.");
  }
#else
  if (!pending.active && now - lastSample >= SEND_INTERVAL_MS) {
    lastSample = now;
    if (readFloodDepthCm(depth) && validDepth(depth)) capture(depth, now);
    else Serial.println("No valid sensor reading; nothing uploaded.");
  }
#endif
  if (pending.active && due(now, pending.nextAttempt)) upload(now);
  delay(5);
}
