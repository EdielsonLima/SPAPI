import { createPublicKey, verify, type KeyObject } from "crypto";

/**
 * Login único pelo Portal Silva Packer.
 *
 * O Portal assina um bilhete curto (EdDSA/Ed25519, formato JWT) dizendo quem é o
 * usuário e para qual app ele vale. Aqui só guardamos a chave PÚBLICA
 * (PORTAL_SSO_PUBLIC_KEY, DER/SPKI em base64): dá para conferir, não para fabricar.
 * Sem a variável, o login pelo Portal fica desligado e só a tela de login funciona.
 */

const ISSUER = "portal-silva-packer";
const FOLGA_RELOGIO_S = 30;
const VALIDADE_MAX_S = 120;

// Bilhetes já usados (jti → exp). Um processo só no EasyPanel; o bilhete vale
// 60 s, então perder a lista num restart não abre janela relevante.
const usados = new Map<string, number>();

let chaveCache: { raw: string; key: KeyObject } | null = null;

function chavePublica(): KeyObject | null {
  const raw = process.env.PORTAL_SSO_PUBLIC_KEY;
  if (!raw) return null;
  if (chaveCache?.raw !== raw) {
    chaveCache = {
      raw,
      key: createPublicKey({ key: Buffer.from(raw, "base64"), format: "der", type: "spki" }),
    };
  }
  return chaveCache.key;
}

function audienciaEsperada(): string | null {
  const explicita = process.env.PORTAL_SSO_AUDIENCE;
  if (explicita) return explicita.replace(/\/+$/, "");
  const url = process.env.NEXTAUTH_URL;
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function lerJson(parte: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(parte, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function portalSsoAtivo(): boolean {
  return !!process.env.PORTAL_SSO_PUBLIC_KEY;
}

export function validarBilhetePortal(token: string): { email: string; name: string } | null {
  const key = chavePublica();
  const aud = audienciaEsperada();
  if (!key || !aud || typeof token !== "string") return null;

  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [h, p, s] = partes;

  const header = lerJson(h);
  if (!header || header.alg !== "EdDSA") return null;

  const ok = verify(null, Buffer.from(`${h}.${p}`), key, Buffer.from(s, "base64url"));
  if (!ok) return null;

  const payload = lerJson(p);
  if (!payload) return null;

  const agora = Math.floor(Date.now() / 1000);
  const { iss, aud: audToken, exp, iat, jti, email, name } = payload as Record<string, unknown>;
  if (iss !== ISSUER || audToken !== aud) return null;
  if (typeof exp !== "number" || typeof iat !== "number" || typeof jti !== "string") return null;
  if (exp < agora - FOLGA_RELOGIO_S || iat > agora + FOLGA_RELOGIO_S) return null;
  if (exp - iat > VALIDADE_MAX_S) return null;
  if (typeof email !== "string" || !email) return null;

  for (const [id, expira] of usados) if (expira < agora - FOLGA_RELOGIO_S) usados.delete(id);
  if (usados.has(jti)) return null;
  usados.set(jti, exp);

  return { email: email.toLowerCase().trim(), name: typeof name === "string" ? name : email };
}
