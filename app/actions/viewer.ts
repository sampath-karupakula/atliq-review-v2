"use server";
// "Viewing as" (demo mode only): switch the demo person. A signed-in session would win over the switch, so it is
// ended first. Outside demo mode people sign in as themselves and this does nothing.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { demoMode } from "@/lib/config";
import { destroySession } from "@/lib/auth/session";
import { isRole, ROLE_COOKIE, ROLES } from "@/lib/roles";

export async function setViewingAs(formData: FormData) {
  const role = formData.get("role");
  if (!demoMode() || !isRole(role)) return;
  await destroySession();
  const jar = await cookies();
  jar.set(ROLE_COOKIE, role, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 30 });
  redirect(ROLES[role].home);
}
