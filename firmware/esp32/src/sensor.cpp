#include <Arduino.h>
#include "measurement.h"
#include "sensor.h"

void beginSensor() {
#if FLOODNAV_SERIAL_INPUT
  Serial.println("SERIAL INPUT MODE: enter a measured depth in cm followed by Enter. No synthetic readings are generated.");
#else
  Serial.println("HARDWARE MODE: implement readFloodDepthCm() for your actual sensor before deployment.");
#endif
}

bool readFloodDepthCm(float& depthCm) {
#if FLOODNAV_SERIAL_INPUT
  static char line[48];
  static size_t used = 0;
  static bool overflow = false;
  while (Serial.available()) {
    const char ch = static_cast<char>(Serial.read());
    if (ch == '\r') continue;
    if (ch == '\n') {
      line[used] = '\0';
      const bool valid = !overflow && parseDepth(line, depthCm);
      used = 0; overflow = false;
      if (valid) return true;
      Serial.println("Ignored invalid depth. Enter a number from 0 to 1000 cm.");
    } else if (used + 1 < sizeof(line)) line[used++] = ch;
    else overflow = true;
  }
#else
  // Replace with your sensor driver. Validate calibration and hardware status,
  // then return validDepth(depthCm). Do not return 0 for timeout/no echo.
  (void)depthCm;
#endif
  return false;
}
