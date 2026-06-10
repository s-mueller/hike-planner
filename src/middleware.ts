import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth?.user;
  const isOnLogin = req.nextUrl.pathname === "/login";
  const isApiAuth = req.nextUrl.pathname.startsWith("/api/auth");
  const isHealth = req.nextUrl.pathname === "/api/health";

  // Allow auth API routes and health check
  if (isApiAuth || isHealth) return NextResponse.next();

  // Redirect logged-in users away from login
  if (isOnLogin && isLoggedIn) {
    return NextResponse.redirect(new URL("/hikes", req.url));
  }

  // Require auth for everything else
  if (!isLoggedIn && !isOnLogin) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
