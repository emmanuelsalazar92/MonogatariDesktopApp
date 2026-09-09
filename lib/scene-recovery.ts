export const RECOVERY_MINIMUM_PREVIOUS_CHARACTERS = 1_000;
export const RECOVERY_MINIMUM_REMOVED_CHARACTERS = 500;
export const RECOVERY_MAXIMUM_REMAINING_RATIO = 0.4;

export type RecoveryReason = "content-emptied" | "major-content-reduction" | "notion-pull" | "version-restore";

export function recoveryReasonForContentChange(previous: string, next: string): RecoveryReason | null {
  if (!previous.trim() || previous === next) return null;
  if (!next.trim()) return "content-emptied";

  const removedCharacters = previous.length - next.length;
  const remainingRatio = next.length / previous.length;
  if (
    previous.length >= RECOVERY_MINIMUM_PREVIOUS_CHARACTERS &&
    removedCharacters >= RECOVERY_MINIMUM_REMOVED_CHARACTERS &&
    remainingRatio <= RECOVERY_MAXIMUM_REMAINING_RATIO
  ) {
    return "major-content-reduction";
  }
  return null;
}

export function recoveryCheckpointLabel(reason: RecoveryReason, baseRevision: number) {
  const description = reason === "content-emptied"
    ? "content emptied"
    : reason === "major-content-reduction"
      ? "major content reduction"
      : reason === "notion-pull"
        ? "before Notion pull"
      : "before version restore";
  return `Automatic recovery — ${description} (before revision ${baseRevision})`;
}
