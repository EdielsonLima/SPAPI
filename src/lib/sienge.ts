const SIENGE_API_URL = process.env.SIENGE_API_URL!;
const SIENGE_USERNAME = process.env.SIENGE_USERNAME!;
const SIENGE_PASSWORD = process.env.SIENGE_PASSWORD!;

const authHeader = "Basic " + Buffer.from(`${SIENGE_USERNAME}:${SIENGE_PASSWORD}`).toString("base64");

export async function siengeGet<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${SIENGE_API_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Sienge API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
