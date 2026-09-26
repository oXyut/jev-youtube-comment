import assert from "node:assert/strict";
import test from "node:test";
import { Children, createElement, isValidElement, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TimestampText } from "../components/timestamp-text";

test("ordinary comments keep their original text without interactive timestamps", () => {
  const html = renderToStaticMarkup(createElement(TimestampText, { text: "開始 ０：３０\n次 1:00" }));
  assert.equal(html, "開始 ０：３０\n次 1:00");
});

test("timestamp links preserve original characters, safely escape markup, and use half-open range highlighting", () => {
  const html = renderToStaticMarkup(createElement(TimestampText, {
    text: "<script> ０：３０ → 1:00 → ０：３０ & 2:00",
    onTimestampSelect: () => {},
    timestampRange: { startSeconds: 30, endSeconds: 60 },
    durationSeconds: 120,
    className: "timestamp",
    selectedClassName: "in-range",
  }));
  assert.equal((html.match(/<button/g) ?? []).length, 3);
  assert.equal((html.match(/data-in-range="true"/g) ?? []).length, 2);
  assert.equal((html.match(/>０：３０<\/button>/g) ?? []).length, 2);
  assert.match(html, /class="timestamp" aria-label="動画の1:00へ移動して再生"/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&amp; 2:00$/);
  assert.doesNotMatch(html, /<script>/);
});

test("timestamps outside the analysis range remain actionable without changing the range", () => {
  const selected: number[] = [];
  const range = { startSeconds: 30, endSeconds: 60 };
  const element = TimestampText({
    text: "0:30 と 1:00",
    onTimestampSelect: (seconds) => selected.push(seconds),
    timestampRange: range,
  });
  for (const child of Children.toArray(element.props.children)) {
    if (isValidElement<ButtonHTMLAttributes<HTMLButtonElement>>(child) && child.type === "button") {
      child.props.onClick?.({} as MouseEvent<HTMLButtonElement>);
    }
  }
  assert.deepEqual(selected, [30, 60]);
  assert.deepEqual(range, { startSeconds: 30, endSeconds: 60 });
});
