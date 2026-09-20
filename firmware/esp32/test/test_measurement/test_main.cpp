#include <Arduino.h>
#include <unity.h>
#include "measurement.h"
void test_depth_contract() {
  float cm;
  TEST_ASSERT_TRUE(parseDepth("23.5", cm)); TEST_ASSERT_FLOAT_WITHIN(.001, 23.5, cm);
  TEST_ASSERT_TRUE(parseDepth("0", cm)); TEST_ASSERT_TRUE(parseDepth("1000", cm));
  TEST_ASSERT_FALSE(parseDepth("nan", cm)); TEST_ASSERT_FALSE(parseDepth("inf", cm));
  TEST_ASSERT_FALSE(parseDepth("-1", cm)); TEST_ASSERT_FALSE(parseDepth("1001", cm));
  TEST_ASSERT_FALSE(parseDepth("23bad", cm)); TEST_ASSERT_FALSE(parseDepth("", cm));
}
void setup() { delay(2000); UNITY_BEGIN(); RUN_TEST(test_depth_contract); UNITY_END(); }
void loop() {}
