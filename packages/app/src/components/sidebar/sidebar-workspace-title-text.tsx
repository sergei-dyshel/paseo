import { useMemo } from "react";
import { Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { SidebarStateBucket } from "@/utils/sidebar-agent-state";
import { getStatusDotColor } from "@/utils/status-dot-color";

// The status dot centers on the title's first line, so both share its line height.
export const SIDEBAR_WORKSPACE_TITLE_LINE_HEIGHT = 20;

/**
 * Render the title line of a sidebar workspace row.
 *
 * While the workspace has a status, the title is drawn in its status dot's color, so the row's
 * state reads from its name as well as from its dot. An idle workspace keeps the dimmed
 * foreground title.
 */
export function SidebarWorkspaceTitleText({
  label,
  statusBucket,
  isHovered,
  isCreating,
}: {
  label: string;
  statusBucket: SidebarStateBucket;
  isHovered: boolean;
  isCreating: boolean;
}) {
  const style = useMemo(
    () => [
      styles.title,
      isHovered && styles.titleHovered,
      isCreating && styles.titleCreating,
      getStatusTitleStyle(statusBucket),
    ],
    [isHovered, isCreating, statusBucket],
  );

  return (
    <Text style={style} numberOfLines={1}>
      {label}
    </Text>
  );
}

function getStatusTitleStyle(bucket: SidebarStateBucket) {
  switch (bucket) {
    case "needs_input":
      return styles.titleNeedsInput;
    case "failed":
      return styles.titleFailed;
    case "running":
      return styles.titleRunning;
    case "attention":
      return styles.titleAttention;
    case "done":
      return null;
  }
}

const styles = StyleSheet.create((theme) => ({
  // The title owns the first line outright now that the host, change request and CI moved
  // to the meta row, so it takes the full width the trailing slot leaves behind.
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: "400",
    lineHeight: SIDEBAR_WORKSPACE_TITLE_LINE_HEIGHT,
    opacity: 0.76,
    flex: 1,
    minWidth: 0,
  },
  titleCreating: {
    opacity: 0.92,
  },
  titleHovered: {
    opacity: 1,
  },
  // A status title is drawn at full opacity whether or not the row is hovered: the idle dimming
  // would blend the dot's color into the row background and the title would stop matching it.
  titleNeedsInput: {
    color: getStatusDotColor({ theme, bucket: "needs_input" }) ?? undefined,
    opacity: 1,
  },
  titleFailed: {
    color: getStatusDotColor({ theme, bucket: "failed" }) ?? undefined,
    opacity: 1,
  },
  titleRunning: {
    color: getStatusDotColor({ theme, bucket: "running" }) ?? undefined,
    opacity: 1,
  },
  titleAttention: {
    color: getStatusDotColor({ theme, bucket: "attention" }) ?? undefined,
    opacity: 1,
  },
}));
