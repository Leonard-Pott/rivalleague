import { test } from "node:test";
import assert from "node:assert/strict";
import { devOnly, HttpError } from "./guards.ts";

test("devOnly sperrt in Produktion mit 404", () => {
  assert.throws(
    () => devOnly("production"),
    (err: unknown) => err instanceof HttpError && err.status === 404,
  );
});

test("devOnly laesst Entwicklung und Test durch", () => {
  assert.doesNotThrow(() => devOnly("development"));
  assert.doesNotThrow(() => devOnly("test"));
  assert.doesNotThrow(() => devOnly(undefined));
});
