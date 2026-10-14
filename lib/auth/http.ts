import "server-only";
// Turns an authorization failure into the JSON shape the browser code expects (401 signed out, 403 not allowed).
import { NextResponse } from "next/server";
import { authorize, PermissionError } from "./session";
import type { Action, Context } from "./permissions";

export function authError(e: unknown): NextResponse {
  if (e instanceof PermissionError) {
    const signedOut = e.message.startsWith("Your session has ended");
    return NextResponse.json({ failed: true, reason: signedOut ? "signed_out" : "forbidden", message: e.message }, { status: signedOut ? 401 : 403 });
  }
  throw e;
}

/** For API routes: the user if allowed, otherwise a ready 401/403 response. */
export async function routeUser(action: Action, ctx: Context = {}) {
  try {
    return { user: await authorize(action, ctx), response: null };
  } catch (e) {
    return { user: null, response: authError(e) };
  }
}
