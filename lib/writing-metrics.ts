import type { WritingActivity } from "@/lib/studio-domain";

export const READING_WORDS_PER_MINUTE = 225;
export const DRAFTING_WORDS_PER_MINUTE = 20;

function startOfLocalDay(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function estimateReadingMinutes(wordCount: number) {
  if (wordCount <= 0) return 0;
  return Math.max(1, Math.ceil(wordCount / READING_WORDS_PER_MINUTE));
}

export function getDailyWritingMetrics(
  activities: WritingActivity[],
  dailyGoal: number,
  now = new Date()
) {
  const dayStart = startOfLocalDay(now);
  const todayActivities = activities.filter((activity) => {
    const recordedAt = new Date(activity.createdAt);
    return !Number.isNaN(recordedAt.valueOf()) && recordedAt >= dayStart && recordedAt <= now;
  });
  const netWordsToday = todayActivities.reduce((total, activity) => total + activity.wordDelta, 0);
  const wordsToday = Math.max(0, netWordsToday);
  const normalizedGoal = Number.isFinite(dailyGoal) && dailyGoal > 0 ? dailyGoal : 1500;

  return {
    wordsToday,
    dailyGoal: normalizedGoal,
    progressPercent: Math.round((wordsToday / normalizedGoal) * 100),
    scenesTouched: new Set(todayActivities.map((activity) => activity.sceneId)).size,
    estimatedWritingMinutes:
      wordsToday === 0 ? 0 : Math.max(1, Math.ceil(wordsToday / DRAFTING_WORDS_PER_MINUTE))
  };
}
