#pragma once
// Copy to root_ca.h and insert the PEM root CA that validates YOUR project host.
// Obtain it from the certificate issuer; do not use setInsecure().
constexpr char ROOT_CA_PEM[] = R"PEM(
)PEM";
