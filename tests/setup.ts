import "@testing-library/jest-dom/vitest";

Range.prototype.getClientRects = function getClientRects() {
  return {
    length: 0,
    item: () => null,
    [Symbol.iterator]: function* iterator() {
      return;
    },
  } as DOMRectList;
};

Range.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return new DOMRect(0, 0, 0, 0);
};
