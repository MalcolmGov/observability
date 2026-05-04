import "server-only";

import { cookies } from "next/headers";
import { queryGet } from "@/db/client";

export const PULSE_AUTH_COOKIE = "pulse_user_id";

export type UserRole = "admin" | "responder" | "viewer";

export interface PulseUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl: string;
}

/**
 * Gets the current authenticated user context.
 * Falls back to the admin persona if no cookie is set,
 * to ensure the app functions smoothly before the user switches personas.
 */
export async function getCurrentUser(): Promise<PulseUser> {
  const c = await cookies();
  const userId = c.get(PULSE_AUTH_COOKIE)?.value?.trim() || "u_admin";

  const row = await queryGet<{
    id: string;
    email: string;
    name: string;
    role: string;
    avatar_url: string;
  }>(
    "SELECT id, email, name, role, avatar_url FROM users WHERE id = ?",
    [userId]
  );

  if (row) {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role as UserRole,
      avatarUrl: row.avatar_url,
    };
  }

  // Fallback if somehow the DB is empty or user is deleted
  return {
    id: "u_admin",
    email: "admin@pulse.local",
    name: "Alex (Admin)",
    role: "admin",
    avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Alex",
  };
}
