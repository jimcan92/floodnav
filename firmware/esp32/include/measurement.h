#pragma once
#include <cmath>
#include <cstdlib>
#include <cctype>
inline bool validDepth(float cm) { return std::isfinite(cm) && cm >= 0.0f && cm <= 1000.0f; }
inline bool parseDepth(const char* text, float& cm) {
  char* end = nullptr;
  cm = std::strtof(text, &end);
  if (end == text) return false;
  while (*end && std::isspace(static_cast<unsigned char>(*end))) ++end;
  return *end == '\0' && validDepth(cm);
}
