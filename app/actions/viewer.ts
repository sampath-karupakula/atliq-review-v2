"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isRole, ROLE_COOKIE, ROLES } from "@/lib/roles";

export async function setViewingAs(formData: FormData) {
  const role = formData.get("role");
  if (!isRole(role)) return;
  const jar = await cookies();
  jar.set(ROLE_COOKIE, role, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 30 });
  redirect(ROLES[role].home);
}
