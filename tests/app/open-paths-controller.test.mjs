import test from "node:test";
import assert from "node:assert/strict";

import { shouldSkipDuplicateOsOpenForDeduper } from "../../src/app/open-paths-controller.js";

test("OS open deduper suppresses only matching signatures within time window", () => {
  const deduper = { signature: "", timestamp: 0 };

  assert.equal(
    shouldSkipDuplicateOsOpenForDeduper(deduper, ["/a.txt"], 1000),
    false,
  );
  assert.equal(deduper.signature, "/a.txt");
  assert.equal(deduper.timestamp, 1000);

  assert.equal(
    shouldSkipDuplicateOsOpenForDeduper(deduper, ["/a.txt"], 2500),
    true,
  );

  assert.equal(
    shouldSkipDuplicateOsOpenForDeduper(deduper, ["/a.txt"], 3001),
    false,
  );

  assert.equal(
    shouldSkipDuplicateOsOpenForDeduper(deduper, ["/b.txt"], 3100),
    false,
  );
  assert.equal(deduper.signature, "/b.txt");
});
