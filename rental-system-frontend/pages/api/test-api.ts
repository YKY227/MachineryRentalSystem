// src/app/api/test-jobs/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json([
    { id: "test-job", source: "test-jobs flat route" },
  ]);
}
