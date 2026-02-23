import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: ["/dashboard/:path*", "/cadastros/:path*", "/financeiro/:path*", "/suprimentos/:path*"],
};
