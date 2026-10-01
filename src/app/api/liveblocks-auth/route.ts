import { Liveblocks } from "@liveblocks/node";
import { ConvexHttpClient } from "convex/browser";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { api } from "../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const liveblocks = new Liveblocks({
  secret: process.env.LIVEBLOCKS_SECRET_KEY!,
});

export async function POST(req: Request) {
  const { sessionClaims } = await auth();

  if (!sessionClaims) {
    return new Response("Unauthorized", { status: 401 });
  }

  const user = await currentUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { room } = await req.json();
  const document = await convex.query(api.documents.getById, { id: room });

  if (!document) {
    return new Response("Unauthorized", { status: 401 });
  }

  const isOwner = document.ownerId === user.id;

  // Primary check: active org in session matches document org
  const isActiveOrgMember = !!(
    document.organizationId &&
    document.organizationId === sessionClaims.org_id
  );

  // Fallback check: user is actually a member of the document's org,
  // even if they don't have that org active in their current session.
  // This is the common case when a second user hasn't switched org context.
  let isOrgMemberViaApi = false;
  if (!isOwner && !isActiveOrgMember && document.organizationId) {
    try {
      const clerk = await clerkClient();
      const memberships =
        await clerk.organizations.getOrganizationMembershipList({
          organizationId: document.organizationId,
        });
      isOrgMemberViaApi = memberships.data.some(
        (membership) => membership.publicUserData?.userId === user.id
      );
    } catch (err) {
      console.error("[liveblocks-auth] Failed to verify org membership:", err);
    }
  }

  if (!isOwner && !isActiveOrgMember && !isOrgMemberViaApi) {
    return new Response("Unauthorized", { status: 401 });
  }

  const name =
    user.fullName ?? user.primaryEmailAddress?.emailAddress ?? "Anonymous";
  const nameToNumber = name
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hue = Math.abs(nameToNumber) % 360;
  const color = `hsl(${hue}, 80%, 60%)`;

  const session = liveblocks.prepareSession(user.id, {
    userInfo: {
      name,
      avatar: user.imageUrl,
      color,
    },
  });
  session.allow(room, session.FULL_ACCESS);
  const { body, status } = await session.authorize();

  return new Response(body, { status });
}
