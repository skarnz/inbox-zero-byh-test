import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { getLinkingOAuth2Client } from "@/utils/gmail/client";
import { GOOGLE_LINKING_STATE_COOKIE_NAME } from "@/utils/gmail/constants";
import { withError } from "@/utils/middleware";

const logger = createScopedLogger("google/linking/callback");

export const GET = withError(async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const receivedState = searchParams.get("state");
  const storedState = request.cookies.get(
    GOOGLE_LINKING_STATE_COOKIE_NAME,
  )?.value;

  const redirectUrl = new URL("/accounts", request.nextUrl.origin);
  const response = NextResponse.redirect(redirectUrl);

  if (!storedState || !receivedState || storedState !== receivedState) {
    logger.warn("Invalid state during Google linking callback", {
      receivedState,
      hasStoredState: !!storedState,
    });
    redirectUrl.searchParams.set("error", "invalid_state");
    response.cookies.delete(GOOGLE_LINKING_STATE_COOKIE_NAME);
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  let decodedState: { userId: string; intent: string; nonce: string };
  try {
    decodedState = JSON.parse(
      Buffer.from(storedState, "base64url").toString("utf8"),
    );
  } catch (error) {
    logger.error("Failed to decode state", { error });
    redirectUrl.searchParams.set("error", "invalid_state_format");
    response.cookies.delete(GOOGLE_LINKING_STATE_COOKIE_NAME);
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  response.cookies.delete(GOOGLE_LINKING_STATE_COOKIE_NAME);

  const { userId: targetUserId } = decodedState;

  if (!code) {
    logger.warn("Missing code in Google linking callback");
    redirectUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  const googleAuth = getLinkingOAuth2Client();

  try {
    const { tokens } = await googleAuth.getToken(code);
    const { id_token } = tokens;

    if (!id_token) {
      throw new Error("Missing id_token from Google response");
    }

    let payload: any;
    try {
      const ticket = await googleAuth.verifyIdToken({
        idToken: id_token,
        audience: env.GOOGLE_CLIENT_ID,
      });
      const verifiedPayload = ticket.getPayload();
      if (!verifiedPayload) {
        throw new Error("Could not get payload from verified ID token ticket.");
      }
      payload = verifiedPayload;
    } catch (err: any) {
      logger.error("ID token verification failed using googleAuth:", err);
      throw new Error(`ID token verification failed: ${err.message}`);
    }

    const providerAccountId = payload.sub;
    const providerEmail = payload.email;

    if (!providerAccountId || !providerEmail) {
      throw new Error(
        "ID token missing required subject (sub) or email claim.",
      );
    }

    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: { provider: "google", providerAccountId },
      },
      select: {
        id: true,
        userId: true,
        user: { select: { name: true, email: true } },
      },
    });

    if (!existingAccount) {
      logger.warn(
        `Merge Failed: Google account ${providerEmail} (${providerAccountId}) not found in the system. Cannot merge.`,
      );
      redirectUrl.searchParams.set("error", "account_not_found_for_merge");
      return NextResponse.redirect(redirectUrl, { headers: response.headers });
    }

    if (existingAccount.userId === targetUserId) {
      logger.warn(
        `Google account ${providerEmail} (${providerAccountId}) is already linked to the correct user ${targetUserId}. Merge action unnecessary.`,
      );
      redirectUrl.searchParams.set("error", "already_linked_to_self");
      return NextResponse.redirect(redirectUrl, {
        headers: response.headers,
      });
    }

    logger.info(
      `Merging Google account ${providerEmail} (${providerAccountId}) linked to user ${existingAccount.userId}, merging into ${targetUserId}.`,
    );
    await prisma.$transaction([
      prisma.account.update({
        where: { id: existingAccount.id },
        data: { userId: targetUserId },
      }),
      prisma.emailAccount.update({
        where: { accountId: existingAccount.id },
        data: {
          userId: targetUserId,
          name: existingAccount.user.name,
          email: existingAccount.user.email,
        },
      }),
      prisma.user.delete({
        where: { id: existingAccount.userId },
      }),
    ]);

    logger.info(
      `Account ${providerAccountId} re-assigned to user ${targetUserId}. Original user was ${existingAccount.userId}`,
    );
    redirectUrl.searchParams.set("success", "account_merged");
    return NextResponse.redirect(redirectUrl, {
      headers: response.headers,
    });
  } catch (error: any) {
    logger.error("Error in Google linking callback:", { error });
    let errorCode = "link_failed";
    if (error.message?.includes("ID token verification failed")) {
      errorCode = "invalid_id_token";
    } else if (error.message?.includes("Missing id_token")) {
      errorCode = "missing_id_token";
    } else if (error.message?.includes("ID token missing required")) {
      errorCode = "incomplete_id_token";
    } else if (error.message?.includes("Missing access_token")) {
      errorCode = "token_exchange_failed";
    }
    redirectUrl.searchParams.set("error", errorCode);
    redirectUrl.searchParams.set(
      "error_description",
      error.message || "Unknown error",
    );
    response.cookies.delete(GOOGLE_LINKING_STATE_COOKIE_NAME);
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }
});
