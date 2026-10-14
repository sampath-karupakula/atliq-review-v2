import { NextResponse } from "next/server";
import { checkDb } from "@/lib/db/health";
import { appToday } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await checkDb();
  return NextResponse.json({ db, today: appToday() }, { status: db.ok ? 200 : 503 });
}
