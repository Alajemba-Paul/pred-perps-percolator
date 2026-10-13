import assert from "node:assert/strict";
import test from "node:test";
import { isExpiredBlockhash } from "./confirm.ts";

test("expired blockhash errors are retried", () => {
  assert.equal(isExpiredBlockhash("Blockhash not found"), true);
  assert.equal(isExpiredBlockhash("TransactionExpiredBlockheightExceededError"), true);
  assert.equal(isExpiredBlockhash("custom program error: 0x9"), false);
});
