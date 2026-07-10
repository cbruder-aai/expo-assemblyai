/**
 * Unit tests for the dependency-free client/protocol layer (`src/client`).
 *
 * These clients use only `WebSocket`, `fetch`, and base64 helpers — no `expo-*`
 * or React imports — so they run in a plain Node environment via ts-jest, no
 * react-native / jest-expo toolchain required. Hook- and native-seam-level tests
 * need the RN test environment and live with the example app.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  clearMocks: true,
};
