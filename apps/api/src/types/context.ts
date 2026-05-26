export type AuthUser = {
  userId: number;
  email: string;
  role: "admin" | "team" | "client";
};

export type Variables = {
  user: AuthUser;
  requestId: string;
};
