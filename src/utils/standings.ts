import type { Challenge } from "../types/challenge";
import { dayNumberForDate, pointsForHold, addDays } from "./challenge";
import type { StandingsFeed, SocialMember } from "../sync/types";
import { displayName, displayAvatar, nameColor } from "./display";
import { titleFor, longestConsecutive, type Title } from "./trophies";

/** One account's computed standing in a challenge. */
export interface SquadMember {
  accountId: string;
  name: string;
  avatar: string;
  color: string;
  startedAt: string | null;
  daysDone: number;
  totalPoints: number;
  yesterdaySeconds: number;
  yesterdayPoints: number;
  /** Consecutive completed days ending on the last revealed day. */
  streak: number;
  isMe: boolean;
  rank: number;
  /**
   * The member's current title, derived from this challenge's feed data
   * (their sessions are not in the feed, so session-based titles never
   * apply in the squad views).
   */
  title: Title | null;
}

export interface StandingsView {
  asOf: string;
  /** The last revealed day (asOf minus one). */
  yesterday: string;
  /** Ranked by total points (ties: more days done, then name). */
  members: SquadMember[];
  /** Top 3 of yesterday by points (empty when nobody earned points). */
  podium: SquadMember[];
  /** A short generated line under the podium. */
  taunt: string | null;
}

function secondsByDate(member: SocialMember): Map<string, number> {
  const map = new Map<string, number>();
  for (const day of member.days) map.set(day.date, day.seconds);
  return map;
}

/**
 * Compute the squad view from the raw feed. Scoring uses the challenge's
 * own rules (the client is the single source of truth for points).
 */
export function computeStandings(
  challenge: Challenge,
  feed: StandingsFeed,
  myAccountId: string
): StandingsView {
  const yesterday = addDays(feed.asOf, -1);

  const members: SquadMember[] = feed.roster.map((raw) => {
    const days = secondsByDate(raw);
    const state = { startedAt: raw.startedAt, days: [] };
    let totalPoints = 0;
    let daysDone = 0;
    let bestHold = 0;
    let completedDays = 0;
    const completedDates = new Set<string>();
    for (const [date, seconds] of days) {
      const dayNumber = dayNumberForDate(challenge, state, date);
      const points = pointsForHold(challenge, seconds, dayNumber);
      totalPoints += points;
      if (seconds > 0) {
        daysDone += 1;
        if (seconds > bestHold) bestHold = seconds;
      }
      if (points > 0) {
        completedDays += 1;
        completedDates.add(date);
      }
    }
    // The member's title, derived from this challenge's data only (the
    // feed has no sessions, so session-based titles can't apply here).
    const title = titleFor({
      bestHoldSeconds: bestHold,
      totalPlankDays: completedDates.size,
      longestStreak: longestConsecutive(completedDates),
      bestChallengeDays: completedDays,
      sessionsCompleted: 0,
    });

    const yesterdaySeconds = days.get(yesterday) ?? 0;
    const yesterdayPoints =
      yesterdaySeconds > 0
        ? pointsForHold(
            challenge,
            yesterdaySeconds,
            dayNumberForDate(challenge, state, yesterday)
          )
        : 0;

    // Streak over the revealed days: walk back from yesterday while every
    // day has a hold.
    let streak = 0;
    let cursor = yesterday;
    while (days.has(cursor)) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }

    return {
      accountId: raw.accountId,
      name: displayName(raw.name),
      avatar: displayAvatar(raw.avatar),
      color: nameColor(raw.accountId),
      startedAt: raw.startedAt,
      daysDone,
      totalPoints,
      yesterdaySeconds,
      yesterdayPoints,
      streak,
      isMe: raw.accountId === myAccountId,
      rank: 0,
      title,
    };
  });

  const byTotal = (a: SquadMember, b: SquadMember) =>
    b.totalPoints - a.totalPoints ||
    b.daysDone - a.daysDone ||
    a.name.localeCompare(b.name);
  members.sort(byTotal);
  members.forEach((m, i) => {
    m.rank = i + 1;
  });

  const yesterdayPlayers = members
    .filter((m) => m.yesterdaySeconds > 0)
    .sort(
      (a, b) =>
        b.yesterdayPoints - a.yesterdayPoints ||
        b.yesterdaySeconds - a.yesterdaySeconds ||
        a.name.localeCompare(b.name)
    );
  const podium = yesterdayPlayers.slice(0, 3);
  const taunt = podiumTaunt(podium);

  return { asOf: feed.asOf, yesterday, members, podium, taunt };
}

/** A deterministic one-liner under the podium (the fun part). */
export function podiumTaunt(podium: SquadMember[]): string | null {
  if (podium.length === 0) {
    return "Quiet day — nobody recorded a hold yesterday.";
  }
  const top = podium[0];
  if (top.yesterdayPoints <= 0) {
    return "Holds were logged, but nobody reached the base mark yesterday.";
  }
  if (podium.length === 1) {
    return `${top.name} planked alone and took the crown.`;
  }
  const second = podium[1];
  const margin = Math.max(0, Math.round(top.yesterdaySeconds - second.yesterdaySeconds));
  if (margin >= 60) {
    return `${top.name} out-planked ${second.name} by ${margin}s. The floor is theirs.`;
  }
  if (margin >= 15) {
    return `${top.name} beats ${second.name} by ${margin}s — decided, but not comfy.`;
  }
  return `${top.name} wins by just ${margin}s. This is going in the group chat.`;
}
