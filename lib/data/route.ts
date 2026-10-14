import "server-only";
import { NextResponse } from "next/server";
import { AiFailedError } from "@/lib/ai/client";
import { MaskingLeakError } from "@/lib/privacy/leakcheck";
import { ReviewBusyError } from "./reviews";
import { BudgetError } from "./budget";

/** Runs a step handler and turns failures into plain-language JSON (fail closed, G10). */
export async function step<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    return NextResponse.json(await fn());
  } catch (err) {
    if (err instanceof BudgetError) {
      return NextResponse.json({ failed: true, reason: "budget", message: err.message }, { status: 429 });
    }
    if (err instanceof ReviewBusyError) {
      return NextResponse.json({ failed: true, reason: "busy", message: err.message }, { status: 409 });
    }
    if (err instanceof MaskingLeakError) {
      return NextResponse.json({ failed: true, reason: "masking_leak", message: err.message }, { status: 422 });
    }
    if (err instanceof AiFailedError) {
      return NextResponse.json({ failed: true, reason: err.kind, message: err.message }, { status: err.kind === "rate_limited" ? 429 : 422 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ failed: true, reason: "error", message: `Review failed — review manually. (${message})` }, { status: 500 });
  }
}
