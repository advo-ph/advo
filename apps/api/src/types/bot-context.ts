export type BotKeyContext = {
  botKeyId: number;
  teamMemberId: number;
  teamMemberName: string;
  /** Null when the member has no login account — see §5.1, key creation requires one. */
  linkedUserId: number | null;
  /** From user.role. Null when linkedUserId is null. */
  role: "admin" | "team" | "client" | null;
  /** From user.is_owner. False when linkedUserId is null. */
  isOwner: boolean;
};

export type McpVariables = {
  requestId: string;
  botKey: BotKeyContext;
};
