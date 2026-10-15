import "server-only";
import { getCurrentUser } from "@/lib/auth/session";
import type { Role } from "./roles";

const VIEW_OF = { admin: "ceo", reviewer: "reviewer", viewer: "counsel" } as const;

// Which screens someone sees (CEO, reviewer or counsel), from the signed-in account's role (or the demo person).
export async function currentRole(): Promise<Role> {
  return VIEW_OF[(await getCurrentUser()).role];
}
