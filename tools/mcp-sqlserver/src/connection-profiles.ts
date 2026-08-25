export const CONNECTION_NAMES = ["dev", "drt", "prd"] as const;
export type ConnectionName = (typeof CONNECTION_NAMES)[number];
