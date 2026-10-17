export const PUBLIC_API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/$/, "");

export const SERVER_API_URL = (process.env.API_URL || PUBLIC_API_URL).replace(/\/$/, "");
