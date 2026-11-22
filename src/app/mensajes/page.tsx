import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ensureBookingConversationAction,
  ensureHostApprovalConversationAction,
  ensureSupportInquiryConversationAction,
  getConversationMessagesAction,
  listMyConversationsAction,
} from "@/modules/messaging/actions";
import { MessagesCenterClient } from "@/components/messaging/MessagesCenterClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mensajes · I-bita Argentina",
  description:
    "Conversaciones internas de I-bita para estadías, entrevistas, aprobaciones y consultas de soporte.",
  robots: { index: false, follow: false },
};

interface MessagesPageProps {
  searchParams: Promise<{
    c?: string;
    booking?: string;
    inquiry?: string;
    hostApproval?: string;
  }>;
}

export default async function MessagesPage({
  searchParams,
}: MessagesPageProps) {
  const params = await searchParams;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let requestedConversationId = params.c?.trim() || null;

  if (params.booking?.trim()) {
    const res = await ensureBookingConversationAction(params.booking.trim());
    if (res.ok) {
      requestedConversationId = res.data.conversationId;
    }
  } else if (params.inquiry?.trim()) {
    const res = await ensureSupportInquiryConversationAction(
      params.inquiry.trim()
    );
    if (res.ok) {
      requestedConversationId = res.data.conversationId;
    }
  } else if (params.hostApproval?.trim()) {
    const res = await ensureHostApprovalConversationAction(
      params.hostApproval.trim()
    );
    if (res.ok) {
      requestedConversationId = res.data.conversationId;
    }
  }

  const [{ data: profile }, listRes] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    listMyConversationsAction(),
  ]);

  const canAccessAdmin =
    process.env.NODE_ENV !== "production" || profile?.role === "SUPERADMIN";
  const conversations = listRes.ok ? listRes.data : [];

  const targetId = requestedConversationId ?? conversations[0]?.id ?? null;
  const activeRes = targetId
    ? await getConversationMessagesAction(targetId)
    : null;

  const initialActiveConversation = activeRes?.ok
    ? activeRes.data.conversation
    : null;
  const initialMessages = activeRes?.ok ? activeRes.data.messages : [];

  return (
    <MessagesCenterClient
      currentUserId={user.id}
      currentUserEmail={user.email ?? ""}
      canAccessAdmin={canAccessAdmin}
      initialConversations={conversations}
      initialActiveConversation={initialActiveConversation}
      initialMessages={initialMessages}
      startOnThreadMobile={Boolean(requestedConversationId)}
    />
  );
}
