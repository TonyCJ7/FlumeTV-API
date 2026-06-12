import { setAllUsersHasProxy, setHasProxyForUserIds } from "@/database/streamProxy.db";
import { isStreamProxyConfigured, parseProxyAcceptedUserIds } from "@/utils/streamProxy.utils";
import { dlog } from "@/utils/debug.utils";

export async function reconcileUserProxyFlagsOnStartup(): Promise<void> {
  if (!isStreamProxyConfigured()) {
    const updatedCount = await setAllUsersHasProxy(false);
    dlog("[STREAM PROXY] MediaFlow not configured; cleared has_proxy for all users", {
      updatedCount,
    });
    return;
  }

  const acceptedUserIds = parseProxyAcceptedUserIds();

  if (acceptedUserIds === null) {
    const updatedCount = await setAllUsersHasProxy(true);
    dlog("[STREAM PROXY] MediaFlow configured; enabled has_proxy for all users", {
      updatedCount,
    });
    return;
  }

  await setHasProxyForUserIds(acceptedUserIds, true);
  dlog("[STREAM PROXY] MediaFlow configured; enabled has_proxy for accepted users", {
    acceptedUserCount: acceptedUserIds.length,
  });
}
