import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// P0 holds only the key-value table used for app state (schema version, demo flags). The domain tables arrive in P2.
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
