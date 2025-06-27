import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { GroupItemType } from "@prisma/client";

const logger = createScopedLogger("rule/learned-patterns");

/**
 * Saves a learned pattern for a rule
 * - Creates a group for the rule if one doesn't exist
 * - Adds the from pattern to the group
 */
export async function saveLearnedPattern({
  emailAccountId,
  from,
  ruleName,
}: {
  emailAccountId: string;
  from: string;
  ruleName: string;
}) {
  const rule = await prisma.rule.findUnique({
    where: {
      name_emailAccountId: {
        name: ruleName,
        emailAccountId,
      },
    },
    select: { id: true, groupId: true },
  });

  if (!rule) {
    logger.error("Rule not found", { emailAccountId, ruleName });
    return;
  }

  let groupId = rule.groupId;

  if (!groupId) {
    // Create a new group for this rule if one doesn't exist
    const newGroup = await prisma.group.create({
      data: {
        emailAccountId,
        name: ruleName,
        rule: { connect: { id: rule.id } },
      },
    });

    groupId = newGroup.id;
  }

  await prisma.groupItem.upsert({
    where: {
      groupId_type_value: {
        groupId,
        type: GroupItemType.FROM,
        value: from,
      },
    },
    update: {},
    create: {
      groupId,
      type: GroupItemType.FROM,
      value: from,
    },
  });
}

/**
 * Saves multiple learned patterns for a rule
 * @param patterns An array of patterns to save
 */
export async function saveLearnedPatterns({
  emailAccountId,
  ruleName,
  patterns,
}: {
  emailAccountId: string;
  ruleName: string;
  patterns: Array<{
    type: GroupItemType;
    value: string;
    exclude?: boolean;
  }>;
}) {
  const rule = await prisma.rule.findUnique({
    where: {
      name_emailAccountId: {
        name: ruleName,
        emailAccountId,
      },
    },
    select: { id: true, groupId: true },
  });

  if (!rule) {
    logger.error("Rule not found", { emailAccountId, ruleName });
    return;
  }

  let groupId = rule.groupId;

  if (!groupId) {
    // Create a new group for this rule if one doesn't exist
    const newGroup = await prisma.group.create({
      data: {
        emailAccountId,
        name: ruleName,
        rule: { connect: { id: rule.id } },
      },
    });

    groupId = newGroup.id;
  }

  // Process all patterns in a single function
  for (const pattern of patterns) {
    // Store pattern with the exclude flag properly set in the database
    // This maps directly to the new exclude field in the GroupItem model
    await prisma.groupItem.upsert({
      where: {
        groupId_type_value: {
          groupId,
          type: pattern.type,
          value: pattern.value,
        },
      },
      update: {
        exclude: pattern.exclude || false,
      },
      create: {
        groupId,
        type: pattern.type,
        value: pattern.value,
        exclude: pattern.exclude || false,
      },
    });
  }
}
