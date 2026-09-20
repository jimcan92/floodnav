#pragma once
void beginSensor();
// Return true only for a new, valid measurement in centimeters.
// False means unavailable/error, never a zero-depth substitute.
bool readFloodDepthCm(float& depthCm);
