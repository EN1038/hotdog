export type LineSettingsPublic = {
  configured: boolean;
  messagingEnabled: boolean;
  /** @deprecated kept for API compat; always false for platform OA */
  notifyStaffOnNewOrder: boolean;
  /** @deprecated kept for API compat; always false for platform OA */
  notifyBrandDailySummary: boolean;
  notifyOwnerRegistration: boolean;
  unlockedLineUserCount: number;
  hasAccessToken: boolean;
  hasChannelSecret: boolean;
  accessTokenSource: "env" | "database" | "none";
  channelSecretSource: "env" | "database" | "none";
  webhookUrl: string;
  linkedStaffCount: number;
  linkedAdminCount: number;
  adminRichMenuId: string | null;
  guestRichMenuId: string | null;
};
