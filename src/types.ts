// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface TradeComment {
  id: number;
  author: string;
  text: string;
  ts: string;
}

/** Reactions are stored as arrays of user codes (one entry per reactor).
 *  Legacy data may contain a plain number — always normalise before display. */
export type ReactionMap = Record<string, string[] | number>;

export interface Trade {
  id: number;
  date: string;
  pair: string;
  session: string;
  bias: string;
  strategy: string;
  setup: string;
  entryPrice: string;
  slPrice: string;
  tpPrice: string;
  rr: string;
  outcome: string;
  pnl: string;
  notes: string;
  emotions: string;
  screenshot: string;
  pnlDollar: string;
  entryTime?: string;
  exitTime?: string;
  direction?: string;
  comments: TradeComment[];
  reactions: ReactionMap;
  createdAt?: string;
  updatedAt?: string;
  mae?: string;
  mfe?: string;
  ruleAdherence?: boolean | null;
  mistake?: string | null;
  source?: string;
  accountType?: "personal" | "funded" | "demo";
}

export interface Profile {
  name: string;
  handle: string;
  bio: string;
  avatar: string;
  broker: string;
  timezone: string;
  startDate: string;
  targetRR: string;
  maxTradesPerDay: string;
  uid?: string;
  code?: string;
  alias?: string;
  onboarded?: boolean;
  publicTrades?: boolean;
  instruments?: string[];
  socialLinks?: { twitter?: string };
  plan?: "free" | "pro" | "elite";
  stripeCustomerId?: string;
  email?: string;
  maxDailyLoss?: string;
  accountBalance?: string;
  // Prop firm / eval account mode
  propFirmMode?: boolean;
  propFirmBalance?: number;       // Starting balance ($)
  propFirmProfitTarget?: number;  // Profit target ($)
  propFirmDailyLossLimit?: number; // Max daily loss ($)
  propFirmMaxDrawdown?: number;   // Max total drawdown ($)
  // First-session survey fields
  priorTool?: string;
  almostStoppedReason?: string;
}

export interface CircleMember {
  name: string;
  handle: string;
  avatar: string;
  code: string;
  joinedAt: string;
}

export interface Circle {
  metric?: "dollar" | "r" | "winrate" | "trades" | "avgr";
  emoji?: string;
  id: number;
  code: string;
  name: string;
  description: string;
  strategy: string;
  privacy: "public" | "private";
  createdBy: string;
  createdAt: string;
  members: CircleMember[];
  isOwner: boolean;
}

export interface CircleChallenge {
  id: string;
  circleCode: string;
  title: string;
  metric: "dollar" | "r" | "winrate" | "trades" | "avgr";
  startedAt: string;
  endsAt: string;
  createdBy: string;
  status: "active" | "completed";
}

export interface ChallengeResult {
  id: string;
  challengeId: string;
  circleCode: string;
  winnerCode: string;
  winnerName: string;
  winnerHandle: string;
  winningValue: number;
  snapshotAt: string;
  challenge?: Pick<CircleChallenge, "title" | "metric" | "endsAt">;
}

export interface SharedTrade {
  id: string;
  circleCode: string;
  authorCode: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  tradeId: string;
  pair: string;
  side: "long" | "short";
  outcome: "win" | "loss" | "be";
  pnl: number;
  rr: number | null;
  strategy: string | null;
  notes: string | null;
  screenshot: string | null;
  date: string;
  sharedAt: string;
  reactions: Record<string, string[]>;
}

export interface CircleMessage {
  id: string;
  circleCode: string;
  senderId: string | null;
  senderName: string;
  senderHandle: string;
  senderAvatar: string | null;
  text: string;
  createdAt: string;
}

export type FeedItem =
  | { type: "trade";             ts: string; data: SharedTrade }
  | { type: "message";           ts: string; data: CircleMessage }
  | { type: "challenge_started"; ts: string; data: CircleChallenge }
  | { type: "member_joined";     ts: string; data: { id: string; text: string } };

export interface Insight {
  kicker: string;
  text: string;
  type: "info" | "warning" | "positive" | "danger";
}

export interface StrategyDef {
  name?: string;
  code: string;
  setups: string[];
  checklist: string[];
  rules: string[];
}

export interface EvalAccount {
  id: string;
  broker: string;
  firm: string;
  phase: string;
  startDate: string;
  startingBalance: number;
  profitTarget: number;
  maxDailyLoss: number;
  maxTotalDrawdown: number;
  currentBalance: number;
  isActive: boolean;
}

export type PropFirm = "Apex" | "TopstepX" | "FTMO" | "MyForexFunds" | "Other";
