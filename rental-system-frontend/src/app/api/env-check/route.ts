import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
    supabaseUrlValue: process.env.SUPABASE_URL ?? null,
    nodeEnv: process.env.NODE_ENV,
  });
}