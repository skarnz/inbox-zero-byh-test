import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import prisma from "@/utils/prisma";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { GmailProvider } from "@/providers/GmailProvider";
import { ASSISTANT_ONBOARDING_COOKIE } from "@/utils/cookies";
import { prefixPath } from "@/utils/path";
import { Chat } from "@/components/assistant-chat/chat";

export const maxDuration = 300; // Applies to the actions

export default async function AssistantPage({
  params,
}: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await params;

  // onboarding redirect
  const cookieStore = await cookies();
  const viewedOnboarding =
    cookieStore.get(ASSISTANT_ONBOARDING_COOKIE)?.value === "true";

  if (!viewedOnboarding) {
    const hasRule = await prisma.rule.findFirst({
      where: { emailAccountId },
      select: { id: true },
    });

    if (!hasRule) {
      redirect(prefixPath(emailAccountId, "/assistant?onboarding=true"));
    }
  }

  return (
    <GmailProvider>
      <Suspense>
        <PermissionsCheck />

        <div className="flex h-[calc(100vh-theme(spacing.16))] flex-col">
          <Chat emailAccountId={emailAccountId} />
        </div>
      </Suspense>
    </GmailProvider>
  );
}
