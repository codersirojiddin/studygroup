// Shapes returned by the Go API.

import type { Socials } from "@/lib/socials";

export type Role = "owner" | "moderator" | "member";

export type Me = {
  id: string;
  email: string;
  displayName: string;
  dailyGoalMinutes: number;
  createdAt: string;
  username: string | null;
  bio: string;
  profilePublic: boolean;
  socials: Socials;
};

export type UserSummary = { username: string; displayName: string };

export type Activity = {
  /** Days with study time inside the last year, oldest first. */
  days: { date: string; seconds: number }[];
  activeDays: number;
  totalSeconds: number;
  sessionCount: number;
  streakDays: number;
  longestStreakDays: number;
};

export type Profile = {
  username: string;
  displayName: string;
  bio: string;
  socials: Socials;
  joinedAt: string;
  activity: Activity;
};

export type Room = {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  visibility: "public" | "private";
  maxMembers: number;
  memberCount: number;
  myRole?: Role;
  inviteCode?: string;
  createdAt: string;
};

export type Member = { userId: string; displayName: string; role: Role; joinedAt: string };

export type Session = {
  id: string;
  roomId: string | null;
  roomName: string | null;
  topic: string;
  startedAt: string;
  endedAt: string | null;
  seconds: number;
  /** "pomodoro" = started automatically by the room timer's focus phase. */
  source: "manual" | "pomodoro";
};

export type Stats = {
  todaySeconds: number;
  weekSeconds: number;
  totalSeconds: number;
  sessionCount: number;
  streakDays: number;
  last7Days: { date: string; seconds: number }[];
};

export type Timer = {
  focusSeconds: number;
  breakSeconds: number;
  running: boolean;
  startedAt: string | null;
  pausedMs: number;
  updatedBy: string | null;
  updatedAt: string;
};

export type PresenceMember = {
  userId: string;
  displayName: string;
  studying: boolean;
  since?: string;
  topic?: string;
};

export type ChatMessage = {
  id: string;
  userId: string;
  displayName: string;
  text: string;
  sentAt: string;
};

export type LeaderboardEntry = { userId: string; displayName: string; seconds: number };

export type Todo = {
  id: string;
  title: string;
  done: boolean;
  doneAt: string | null;
  createdAt: string;
};
