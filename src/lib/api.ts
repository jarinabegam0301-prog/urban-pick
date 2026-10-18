export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type DatabaseError = {
  code?: string;
  message?: string;
  status?: number;
};

export function throwSupabaseError(error: DatabaseError): never {
  const message = error.message || "Supabase request failed.";
  const status =
    error.status ??
    (error.code === "PGRST116" ? 404
      : error.code === "42501" ? 403
        : error.code === "23505" || error.code === "23503" ? 409
          : error.code === "P0001" ? 400
            : 500);
  throw new ApiError(message, status);
}
