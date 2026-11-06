import { auth } from "@/lib/auth/server";

// Redirects signed-out visitors away from protected pages and refreshes the
// session cookie when needed. Authorization for data happens in the Go API.
export default auth.middleware({
  loginUrl: "/auth/sign-in",
});

export const config = {
  matcher: ["/dashboard/:path*", "/account/:path*", "/rooms/:path*"],
};
