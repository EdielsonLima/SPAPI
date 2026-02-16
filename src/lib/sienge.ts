export async function siengeGet<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const apiUrl = process.env.SIENGE_API_URL!;
  const username = process.env.SIENGE_USERNAME!;
  const password = process.env.SIENGE_PASSWORD!;
  const authHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

  const url = new URL(`${apiUrl}${endpoint}`);
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
