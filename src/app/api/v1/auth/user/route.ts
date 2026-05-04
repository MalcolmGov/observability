import { NextResponse } from "next/server";
import { getCurrentUser, PULSE_AUTH_COOKIE } from "@/lib/auth";
import { queryAll } from "@/db/client";

export async function GET() {
  const user = await getCurrentUser();
  
  // Also return the list of all available personas so the UI can build the dropdown
  const allUsers = await queryAll<{
    id: string;
    email: string;
    name: string;
    role: string;
    avatar_url: string;
  }>("SELECT id, email, name, role, avatar_url FROM users ORDER BY name ASC", []);
  
  return NextResponse.json({
    user,
    availablePersonas: allUsers.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      avatarUrl: u.avatar_url
    }))
  });
}

export async function PUT(req: Request) {
  try {
    const { userId } = await req.json();
    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }
    
    // Validate that the user exists
    const users = await queryAll<{ id: string }>("SELECT id FROM users WHERE id = ?", [userId]);
    if (users.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const response = NextResponse.json({ success: true, userId });
    
    // Set cookie
    response.cookies.set(PULSE_AUTH_COOKIE, userId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return response;
  } catch (error) {
    return NextResponse.json({ error: "Failed to switch persona" }, { status: 500 });
  }
}
