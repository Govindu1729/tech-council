import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

/**
 * Returns true when the current request is authenticated as an admin.
 *
 * Admin status is stamped onto the session by the credentials provider in
 * `lib/auth.ts`, which only issues a session for emails present in the
 * admin allow-list. Route handlers under `/api/admin` must call this and
 * return 401 before touching any data.
 *
 * The `middleware.ts` guard is defense-in-depth only; every admin route is
 * expected to enforce this itself so a routing/matcher change cannot silently
 * expose an endpoint.
 */
export async function isAdminRequest(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  return Boolean(session?.user?.isAdmin);
}
