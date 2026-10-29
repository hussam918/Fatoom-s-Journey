export type Role = "parent" | "child";
export type TaskStatus = "pending" | "approved" | "rejected";
export type RequestStatus = "pending" | "approved" | "rejected";

export type Profile = {
  user_id: string;
  family_id: string;
  role: Role;
  display_name: string;
  avatar_emoji: string;
};

export type Task = {
  id: string;
  family_id: string;
  title: string;
  description: string | null;
  stars: number;
  cadence: "daily" | "once";
  active: boolean;
  created_at: string;
};

export type Completion = {
  id: string;
  task_id: string;
  child_id: string;
  task_date: string;
  status: TaskStatus;
  stars_awarded: number;
  submitted_at: string;
  reviewed_at: string | null;
};

export type Reward = {
  id: string;
  family_id: string;
  name: string;
  description: string | null;
  stars_cost: number;
  active: boolean;
};

export type RewardRequest = {
  id: string;
  reward_id: string;
  child_id: string;
  status: RequestStatus;
  stars_cost: number;
  requested_at: string;
  reviewed_at: string | null;
};

export type PointAdjustment = {
  id: string;
  family_id: string;
  child_id: string;
  points: number;
  behavior: string;
  created_by: string;
  created_at: string;
};

export type Family = { id: string; name: string };

