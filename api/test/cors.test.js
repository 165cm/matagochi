import test from "node:test";
import assert from "node:assert/strict";
import { isOriginAllowed, parseAllowedOrigins } from "../src/cors.js";

test("allows configured origins and rejects others", () => {
  const allowed = parseAllowedOrigins("https://165cm.github.io,http://localhost:8000");
  assert.equal(isOriginAllowed("https://165cm.github.io", allowed), true);
  assert.equal(isOriginAllowed("http://localhost:8000", allowed), true);
  assert.equal(isOriginAllowed("https://example.com", allowed), false);
});

test("allows server-to-server requests without an Origin header", () => {
  const allowed = parseAllowedOrigins("https://165cm.github.io");
  assert.equal(isOriginAllowed("", allowed), true);
  assert.equal(isOriginAllowed(undefined, allowed), true);
});
