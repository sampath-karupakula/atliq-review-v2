import "server-only";
// Who is acting. Until sign-in arrives (P11) the actor comes from the demo "Viewing as" cookie: Karandeep is the
// admin, Bhavin a reviewer, Counsel a read-only viewer. The interface (getCurrentUser, requireUser, authorize,
// PermissionError) is the one the real database sessions will keep, so routes and actions don't change in P11.
import { cache } from "react";
import { can, refusal, type Action, type Context, type Role } from "./permissions";
import { currentRole } from "@/lib/viewer";
import { ROLES } from "@/lib/roles";

export type CurrentUser = { id: string; name: string; email: string; role: Role; mustChangePassword: boolean; sessionId: string };

const ROLE_OF = { ceo: "admin", reviewer: "reviewer", counsel: "viewer" } as const;

/** The acting user for this request. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const r = await currentRole();
  const name = ROLES[r].name;
  return { id: `demo-${r}`, name, email: `${name.toLowerCase()}@atliq.test`, role: ROLE_OF[r], mustChangePassword: false, sessionId: `demo-${r}` };
});

export async function requireUser(): Promise<CurrentUser> {
  return getCurrentUser();
}

export class PermissionError extends Error {}

/** For actions and routes: the acting user if allowed to do `action`, else a PermissionError. */
export async function authorize(action: Action, ctx: Context = {}): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!can(u, action, ctx)) throw new PermissionError(refusal(action, ctx));
  return u;
}
