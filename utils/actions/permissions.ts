"use server";

import { z } from "zod";
import { handleGmailPermissionsCheck } from "@/utils/gmail/permissions";
import { createScopedLogger } from "@/utils/logger";
import { actionClient, adminActionClient } from "@/utils/actions/safe-action";
import { getGmailAndAccessTokenForEmail } from "@/utils/account";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";

const logger = createScopedLogger("actions/permissions");

export const checkPermissionsAction = actionClient
  .metadata({ name: "checkPermissions" })
  .action(async ({ ctx: { emailAccountId } }) => {
    try {
      const { accessToken, tokens } = await getGmailAndAccessTokenForEmail({
        emailAccountId,
      });

      if (!accessToken) throw new SafeError("No access token");

      const { hasAllPermissions, error } = await handleGmailPermissionsCheck({
        accessToken,
        emailAccountId,
      });
      if (error) throw new SafeError(error);

      if (!hasAllPermissions) return { hasAllPermissions: false };

      if (!tokens.refreshToken)
        return { hasRefreshToken: false, hasAllPermissions };

      return { hasRefreshToken: true, hasAllPermissions };
    } catch (error) {
      logger.error("Failed to check permissions", {
        emailAccountId,
        error,
      });
      throw new SafeError("Failed to check permissions");
    }
  });

export const adminCheckPermissionsAction = adminActionClient
  .metadata({ name: "adminCheckPermissions" })
  .schema(z.object({ email: z.string().email() }))
  .action(async ({ parsedInput: { email } }) => {
    try {
      const emailAccount = await prisma.emailAccount.findUnique({
        where: { email },
        select: {
          id: true,
        },
      });
      if (!emailAccount) throw new SafeError("Email account not found");
      const emailAccountId = emailAccount.id;

      const { accessToken } = await getGmailAndAccessTokenForEmail({
        emailAccountId,
      });
      if (!accessToken) throw new SafeError("No Gmail access token");

      const { hasAllPermissions, error } = await handleGmailPermissionsCheck({
        accessToken,
        emailAccountId,
      });
      if (error) throw new SafeError(error);
      return { hasAllPermissions };
    } catch (error) {
      logger.error("Admin failed to check permissions", { email, error });
      throw new SafeError("Failed to check permissions");
    }
  });
