import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../app/api/classify/route";

test("invalid JSON structures return a client error before any API call", async () => {
  for (const input of [null, [], 123, "url", { url: 123 }, { url: "https://youtu.be/test", scope: "invalid" }]) {
    const response = await POST(new NextRequest("http://localhost/api/classify", { method: "POST", body: JSON.stringify(input) }));
    assert.equal(response.status, 400);
  }
});

test("invalid or conflicting count and percentage selections cannot start external API work", async (context) => {
  const fetchMock = context.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected external API call"); });
  const selections = [
    { scope: null }, { scope: "count" }, { scope: "percentage", percentage: 10 },
    ...[0, -1, 1.5, "10", null, Number.MAX_SAFE_INTEGER + 1].map(limit => ({ scope: "count", limit })),
    ...[0, -1, 101, 1.5, "10", null].map(percentage => ({ scope: "percentage", percentage, basisCount: 100 })),
    ...[0, -1, 1.5, "100", null, Number.MAX_SAFE_INTEGER + 1].map(basisCount => ({ scope: "percentage", percentage: 10, basisCount })),
    { scope: "all", limit: 10 }, { scope: "first100", percentage: 10 },
    { scope: "count", limit: 10, percentage: 10 }, { scope: "percentage", percentage: 10, basisCount: 100, limit: 10 },
    { limit: 10 },
  ];
  for (const selection of selections) {
    const response = await POST(new NextRequest("http://localhost/api/classify", {
      method: "POST", body: JSON.stringify({ url: "https://youtu.be/example1234", ...selection }),
    }));
    assert.equal(response.status, 400, JSON.stringify(selection));
  }
  assert.equal(fetchMock.mock.calls.length, 0);
});
