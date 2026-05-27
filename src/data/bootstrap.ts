// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · bootstrap loader (v2)
//
// Single parallel load for the screens Koda.tsx renders. Replaces the chain
// of try/catch reads in loadAll(). Each resource has its own error path and
// fallback so one failure does not blank the whole UI.
//
// NOT WIRED IN YET. Use behind the `newBootstrap` feature flag once the v2
// data modules are populated for that user.
// ═══════════════════════════════════════════════════════════════════════════════

import { listTrades, type Trade } from "./trades";
import { getProfile, type Profile } from "./profile";
import { log } from "../lib/log";

export interface BootstrapResult {
  trades: Trade[];
  profile: Profile | null;
}

export async function bootstrap(userId: string): Promise<BootstrapResult> {
  const [trades, profile] = await Promise.all([
    listTrades(userId).catch(e => { log.error("bootstrap.trades", e); return [] as Trade[]; }),
    getProfile(userId).catch(e => { log.error("bootstrap.profile", e); return null; }),
  ]);
  return { trades, profile };
}
