import type { GestureResponderEvent } from "react-native";

/**
 * Whether a Pressable `onPress` came from the second click of a mouse double-click.
 *
 * On web, react-native-web dispatches `onPress` from the DOM `click` event and hands it through as
 * `nativeEvent`, whose `detail` is the click count. Native touch events carry no `detail`, so a
 * double tap never reads as a double click; the single-press action still runs on every press,
 * and callers layer the double-click action on top of it.
 */
export function isDoubleClickPress(event: GestureResponderEvent): boolean {
  const detail = Reflect.get(event.nativeEvent, "detail");
  return detail === 2;
}
