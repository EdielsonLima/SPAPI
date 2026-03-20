interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 15 * 60 * 1000;

// ─── Concurrency limiter ───────────────────────────────────────────────────────
// Limita requisições simultâneas ao Sienge para evitar rate limit (429)
const MAX_CONCURRENT = 3;
let activeRequests = 0;
const waitQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  return new Promise((resolve) => {
    if (activeRequests < MAX_CONCURRENT) {
      activeRequests++;
      resolve();
    } else {
      waitQueue.push(() => {
        activeRequests++;
        resolve();
      });
    }
  });
}

function releaseSlot() {
  activeRequests--;
  const next = waitQueue.shift();
  if (next) next();
}

// ─────────────────────────────────────────────────────────────────────────────

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

  await acquireSlot();

  try {
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
          const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : (attempt + 1) * 3000;
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
  } finally {
    releaseSlot();
  }
}

// ─── Bulk API fetcher (com concurrency limit + retry 429) ───────────────────
// Usa SIENGE_BULK_API_URL. Mesma proteção de rate limit que siengeGet.
export async function siengeBulkGet(url: string, authHeader: string): Promise<Response> {
  await acquireSlot();
  try {
    const maxRetries = 3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min timeout
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { Authorization: authHeader, "Content-Type": "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (response.status === 429) {
        if (attempt < maxRetries) {
          const retryAfter = response.headers.get("Retry-After");
          const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : (attempt + 1) * 5000;
          console.warn(`Sienge Bulk 429 — retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
          await delay(waitMs);
          continue;
        }
        throw new Error(`Sienge Bulk API 429 Too Many Requests (after ${maxRetries} retries)`);
      }

      return response;
    }
    throw new Error("Sienge Bulk API: max retries exceeded");
  } finally {
    releaseSlot();
  }
}

export async function siengePostFormData(endpoint: string, formData: FormData): Promise<{ ok: boolean; status: number; body?: unknown }> {
  const apiUrl = process.env.SIENGE_API_URL!;
  const username = process.env.SIENGE_USERNAME!;
  const password = process.env.SIENGE_PASSWORD!;
  const authHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

  const url = `${apiUrl}${endpoint}`;
  await acquireSlot();
  try {
    // Do NOT set Content-Type — fetch sets multipart/form-data with correct boundary automatically
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: authHeader },
      body: formData,
      cache: "no-store",
    });
    let body: unknown;
    try { body = await response.json(); } catch { /* no body */ }
    return { ok: response.ok, status: response.status, body };
  } finally {
    releaseSlot();
  }
}

export async function siengePut(endpoint: string): Promise<{ ok: boolean; status: number }> {
  const apiUrl = process.env.SIENGE_API_URL!;
  const username = process.env.SIENGE_USERNAME!;
  const password = process.env.SIENGE_PASSWORD!;
  const authHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

  const url = `${apiUrl}${endpoint}`;
  await acquireSlot();
  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    return { ok: response.ok, status: response.status };
  } finally {
    releaseSlot();
  }
}
