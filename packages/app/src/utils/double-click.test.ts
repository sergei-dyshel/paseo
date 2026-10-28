import { describe, expect, it } from "vitest";
import type { GestureResponderEvent } from "react-native";
import { isDoubleClickPress } from "./double-click";

function pressEvent(nativeEvent: object): GestureResponderEvent {
  return { nativeEvent } as unknown as GestureResponderEvent;
}

describe("isDoubleClickPress", () => {
  it("reads the second click of a web double-click", () => {
    expect(isDoubleClickPress(pressEvent({ detail: 2 }))).toBe(true);
  });

  it("ignores single clicks and later clicks of a burst", () => {
    expect(isDoubleClickPress(pressEvent({ detail: 1 }))).toBe(false);
    expect(isDoubleClickPress(pressEvent({ detail: 3 }))).toBe(false);
  });

  it("never fires for native touch events, which carry no click count", () => {
    expect(isDoubleClickPress(pressEvent({ touches: [], changedTouches: [] }))).toBe(false);
  });
});
