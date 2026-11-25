export const NOTIFICATIONS_REFRESH_EVENT = "ibita:notifications-refresh";

export interface NotificationsSummaryPayload {
  unreadMessagesCount: number;
  unreadConversationsCount: number;
  pendingHostRequestsCount: number;
  totalAttentionCount: number;
}

export const EMPTY_NOTIFICATIONS_SUMMARY: NotificationsSummaryPayload = {
  unreadMessagesCount: 0,
  unreadConversationsCount: 0,
  pendingHostRequestsCount: 0,
  totalAttentionCount: 0,
};

export function dispatchNotificationsRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT));
}

export async function fetchNotificationsSummary(): Promise<NotificationsSummaryPayload> {
  try {
    const res = await fetch("/api/notifications/summary", {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) return EMPTY_NOTIFICATIONS_SUMMARY;
    const data = (await res.json()) as Partial<NotificationsSummaryPayload> & {
      ok?: boolean;
    };
    if (!data.ok) return EMPTY_NOTIFICATIONS_SUMMARY;
    return {
      unreadMessagesCount: Number(data.unreadMessagesCount ?? 0),
      unreadConversationsCount: Number(data.unreadConversationsCount ?? 0),
      pendingHostRequestsCount: Number(data.pendingHostRequestsCount ?? 0),
      totalAttentionCount: Number(data.totalAttentionCount ?? 0),
    };
  } catch {
    return EMPTY_NOTIFICATIONS_SUMMARY;
  }
}
