import { ADMIN_COOKIE } from "@/lib/auth";
import { appPath } from "@/lib/paths";
import { getSiteUrl } from "@/lib/site";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE);
  return NextResponse.redirect(`${getSiteUrl()}${appPath("/admin/login")}`);
}