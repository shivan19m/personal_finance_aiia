import { NextResponse, NextRequest } from "next/server";
import { auth } from "@/app/(auth)/auth"; // Import NextAuth correctly

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  console.log(`🟢 Middleware triggered for: ${pathname}`);

  // ✅ Allow Plaid webhooks to bypass authentication
  if (pathname.startsWith("/api/plaid/webhook")) {
    console.log("🟢 Allowing Plaid webhook request");
    return NextResponse.next();
  }

  // ✅ Allow login and register pages without checking authentication
  if (pathname === "/login" || pathname === "/register") {
    console.log("🟢 Allowing access to login/register");
    return NextResponse.next();
  }

  try {
    const session = await auth();
    console.log("🔹 Session data:", session);

    // ✅ Define protected routes that require authentication
    const protectedRoutes = ["/", "/:id"];

    if (!session && protectedRoutes.includes(pathname)) {
      console.log("🔴 User not authenticated. Redirecting to /login");
      return NextResponse.redirect(new URL("/login", req.url));
    }

    console.log("🟢 Request allowed to proceed");
    return NextResponse.next();
  } catch (error) {
    console.error("🔴 Middleware error:", error);
    return NextResponse.error();
  }
}

// ✅ Maintain original matcher structure
export const config = {
  matcher: ["/", "/:id", "/api/:path*", "/login", "/register"],
};
