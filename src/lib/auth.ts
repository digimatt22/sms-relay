import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { query } from "@/lib/db";
import { normalizeRole } from "@/lib/rbac";
import { verifyPassword } from "@/lib/security";
import type { AdminUser } from "@/lib/types";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login"
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const result = await query<AdminUser & { password_hash: string }>(
          `SELECT id, email, name, role, password_hash
             FROM admin_users
            WHERE email = $1
              AND (mobile_number IS NULL OR mobile_number_verified_at IS NOT NULL)`,
          [parsed.data.email.toLowerCase()]
        );
        const user = result.rows[0];
        if (!user || !verifyPassword(parsed.data.password, user.password_hash)) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name || user.email,
          role: normalizeRole(user.role)
        };
      }
    })
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = normalizeRole("role" in user && typeof user.role === "string" ? user.role : "admin");
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub || "";
        session.user.role = normalizeRole(typeof token.role === "string" ? token.role : "admin");
      }
      return session;
    }
  }
});
