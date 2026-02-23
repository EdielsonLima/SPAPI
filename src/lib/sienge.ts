interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 15 * 60 * 1000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function siengeGet<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const apiUrl = process.env.SIENGE_API_URL!;
  const username = process.env.SIENGE_USERNAME!;
  const password = process.env.SIENGE_PASSWORD!;
  const authHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

  const url = new URL(`${apiUrl}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  }

  const cacheKey = url.toString();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }

  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (response.status === 429) {
      if (attempt < maxRetries) {
        const retryAfter = response.headers.get("Retry-After");
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : (attempt + 1) * 2000;
        await delay(waitMs);
        continue;
      }
      throw new Error(`Sienge API error: 429 Too Many Requests (after ${maxRetries} retries)`);
    }

    if (!response.ok) {
      throw new Error(`Sienge API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    cache.set(cacheKey, { data, timestamp: Date.now() });
    return data as T;
  }

  throw new Error("Sienge API error: max retries exceeded");
}
