
import {
  pgTable,
  pgEnum,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const staffHelpStatusEnum = pgEnum(
  "staff_help_status",
  [
    "pending",
    "in_progress",
    "completed",
    "abandoned",
  ],
);

export const staffHelpRequestsTable = pgTable(
  "staff_help_requests",
  {
    id: integer("id")
      .primaryKey()
      .generatedAlwaysAsIdentity(),

    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),

    requesterId: text("requester_id").notNull(),

    requestMessageId: text("request_message_id")
      .notNull()
      .unique(),

    claimMessageId: text("claim_message_id"),

    assigneeId: text("assignee_id"),

    status: staffHelpStatusEnum("status")
      .notNull()
      .default("pending"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    claimedAt: timestamp("claimed_at", {
      withTimezone: true,
    }),

    lastActivityAt: timestamp("last_activity_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    completedAt: timestamp("completed_at", {
      withTimezone: true,
    }),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    activeRequesterUnique: uniqueIndex(
      "staff_help_active_requester_unique",
    )
      .on(table.guildId, table.requesterId)
      .where(
        sql`${table.status} IN ('pending', 'in_progress')`,
      ),

    statusActivityIndex: index(
      "staff_help_status_activity_idx",
    ).on(table.status, table.lastActivityAt),

    assigneeIndex: index(
      "staff_help_assignee_idx",
    ).on(table.assigneeId),
  }),
);

export const staffHelpHistoryTable = pgTable(
  "staff_help_history",
  {
    id: integer("id")
      .primaryKey()
      .generatedAlwaysAsIdentity(),

    requestId: integer("request_id")
      .notNull()
      .references(
        () => staffHelpRequestsTable.id,
        { onDelete: "cascade" },
      ),

    actorId: text("actor_id"),

    action: text("action").notNull(),

    messageId: text("message_id"),

    previousAssigneeId: text("previous_assignee_id"),

    newAssigneeId: text("new_assignee_id"),

    details: text("details"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    requestHistoryIndex: index(
      "staff_help_history_request_idx",
    ).on(table.requestId, table.createdAt),
  }),
);

export type StaffHelpRequest =
  typeof staffHelpRequestsTable.$inferSelect;

export type NewStaffHelpRequest =
  typeof staffHelpRequestsTable.$inferInsert;

export type StaffHelpHistory =
  typeof staffHelpHistoryTable.$inferSelect;
