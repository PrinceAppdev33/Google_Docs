"use server";

import { ConvexHttpClient } from "convex/browser";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function getDocuments(ids: Id<"documents">[]) {
  return await convex.query(api.documents.getByIds, { ids });
}

export async function getUsers() {
  const { sessionClaims } = await auth();
  const clerk = await clerkClient();

  const orgId = sessionClaims?.org_id as string | undefined;

  // If user is in an organization, fetch all org members
  if (orgId) {
    const response = await clerk.users.getUserList({
      organizationId: [orgId],
    });

    return response.data.map((user) => ({
      id: user.id,
      name: user.fullName ?? user.primaryEmailAddress?.emailAddress ?? "Anonymous",
      avatar: user.imageUrl,
      color: "",
    }));
  }

  // Fallback: personal account — return only current user so Liveblocks
  // can still resolve user info for cursors/avatars
  const user = await currentUser();
  if (!user) return [];

  return [
    {
      id: user.id,
      name: user.fullName ?? user.primaryEmailAddress?.emailAddress ?? "Anonymous",
      avatar: user.imageUrl,
      color: "",
    },
  ];
}
