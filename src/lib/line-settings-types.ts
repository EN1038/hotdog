export type LineSettingsPublic = {
  configured: boolean;
  messagingEnabled: boolean;
  notifyStaffOnNewOrder: boolean;
  notifyBrandDailySummary: boolean;
  hasAccessToken: boolean;
  hasChannelSecret: boolean;
  accessTokenSource: "env" | "database" | "none";
  channelSecretSource: "env" | "database" | "none";
  webhookUrl: string;
  linkedStaffCount: number;
  linkedAdminCount: number;
};
