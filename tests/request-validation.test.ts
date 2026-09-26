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
