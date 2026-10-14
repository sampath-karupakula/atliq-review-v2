import "server-only";
import { cookies } from "next/headers";
import { isRole, ROLE_COOKIE, type Role } from "./roles";

// Who is looking at the page. Until P11 this is the demo "Viewing as" cookie; the default is the CEO.
export async function currentRole(): Promise<Role> {
  const jar = await cookies();
  const v = jar.get(ROLE_COOKIE)?.value;
  return isRole(v) ? v : "ceo";
}
