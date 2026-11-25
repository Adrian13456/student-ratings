const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message: string, readonly status?: number, readonly requestId?: string) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  token?: string;
  body?: object;
};

export async function requestApi<T>(
  path: string,
  { method = "GET", token, body }: RequestOptions = {},
): Promise<T> {
  const signal = AbortSignal.timeout(15000);
  let response: Response;

  try {
    response = await fetch(`${API_URL}/api${path}`, {
      method,
      signal,
      headers: {
        Accept: "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (signal.aborted) {
      throw new ApiError("Сервер не відповів вчасно.");
    }
    if (error instanceof TypeError) {
      throw new ApiError("Не вдалося зв’язатися з API. Перевірте підключення та спробуйте ще раз.");
    }
    throw error;
  }

  const requestId = response.headers.get("X-Request-Id") ?? undefined;
  if (response.status === 204) return undefined as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (signal.aborted) {
      throw new ApiError("Сервер не відповів вчасно.", response.status, requestId);
    }
    if (!(error instanceof SyntaxError)) throw error;
    if (response.ok) {
      throw new ApiError("Сервер повернув некоректну JSON-відповідь.", response.status, requestId);
    }
  }
  if (!response.ok) {
    const message = payload !== null && typeof payload === "object" && "message" in payload
      && typeof payload.message === "string" ? payload.message.trim() : "";
    throw new ApiError(message || `Помилка API (HTTP ${response.status}).`, response.status, requestId);
  }
  if (payload === undefined || payload === null || typeof payload !== "object") {
    throw new ApiError("Сервер повернув некоректну відповідь.", response.status, requestId);
  }
  return payload as T;
}
