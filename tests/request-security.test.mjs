import test from "node:test";
import assert from "node:assert/strict";
import { validMutationSource } from "../backend/cloud/request-security.ts";

const live = "https://clarity-investment-journal.example";
const request = (url, headers = {}) =>
  new Request(url, { method: "PUT", headers });

test("accepts direct same-origin and requests without an Origin header", () => {
  assert.equal(validMutationSource(request(live + "/api/ledger")), true);
  assert.equal(
    validMutationSource(request(live + "/api/ledger", { Origin: live })),
    true,
  );
});

test("accepts a Sites internal route URL only when every public same-origin signal agrees", () => {
  const headers = {
    Origin: live,
    Host: "clarity-investment-journal.example",
    Referer: live + "/",
    "Sec-Fetch-Site": "same-origin",
  };
  assert.equal(
    validMutationSource(
      request("https://internal.invalid/api/ledger", headers),
    ),
    true,
  );
  for (const changed of [
    { ...headers, Host: "other.example" },
    { ...headers, Referer: "https://other.example/" },
    { ...headers, "Sec-Fetch-Site": "cross-site" },
    { ...headers, Origin: "http://clarity-investment-journal.example" },
  ])
    assert.equal(
      validMutationSource(
        request("https://internal.invalid/api/ledger", changed),
      ),
      false,
    );
});

test("rejects malformed and ordinary cross-origin mutation requests", () => {
  assert.equal(
    validMutationSource(request(live + "/api/ledger", { Origin: "not a url" })),
    false,
  );
  assert.equal(
    validMutationSource(
      request(live + "/api/ledger", { Origin: "https://evil.example" }),
    ),
    false,
  );
});
