import assert from "node:assert/strict";
import test from "node:test";
import { commentLimit, formatCommentScope, parseCommentScope } from "../lib/comment-scope";

test("percentage targets round up, retain their confirmation-time basis and handle safe integers", () => {
  for (const [basisCount, percentage, expected] of [
    [1234, 10, 124], [50, 10, 5], [1, 1, 1], [100, 7, 7], [101, 100, 101],
    [Number.MAX_SAFE_INTEGER, 100, Number.MAX_SAFE_INTEGER],
  ]) {
    const scope = parseCommentScope({ scope: "percentage", percentage, basisCount });
    assert.equal(commentLimit(scope), expected);
    assert.deepEqual(scope, { scope: "percentage", percentage, basisCount });
  }
  assert.equal(commentLimit({ scope: "count", limit: 137 }), 137);
  assert.equal(commentLimit({ scope: "first100" }), 100);
  assert.equal(commentLimit({ scope: "all" }), undefined);
});

test("range labels distinguish a percentage target from all comments", () => {
  assert.equal(formatCommentScope({ scope: "percentage", percentage: 10, basisCount: 1234 }), "10%目安・先頭124件まで");
  assert.equal(formatCommentScope({ scope: "count", limit: 1234 }), "先頭1,234件まで");
  assert.equal(formatCommentScope({ scope: "first100" }), "先頭100件まで");
  assert.equal(formatCommentScope({ scope: "all" }), "全件");
});
