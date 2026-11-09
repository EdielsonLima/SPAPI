// Trava do bilhete do Portal: a assinatura vale, e o claim `role: "admin"` é o
// que faz a pessoa ser administradora no Financeiro (edita o estoque do Resumo
// e a Tabela de Preços). Bilhete sem o claim, ou adulterado, não dá admin.
import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const AUD = "https://financeiro.exemplo.test";
process.env.PORTAL_SSO_PUBLIC_KEY = publicKey.export({ format: "der", type: "spki" }).toString("base64");
process.env.PORTAL_SSO_AUDIENCE = AUD;

const b64url = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
// Mesmo formato do emitirBilhete do Portal (portal-silva-packer/lib/sso.ts).
function bilhete(extra: Record<string, unknown> = {}, opcoes: { aud?: string } = {}) {
  const agora = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: "EdDSA", typ: "JWT" });
  const payload = b64url({
    iss: "portal-silva-packer", aud: opcoes.aud ?? AUD, sub: "Fulano@SilvaPacker.com.br", email: "Fulano@SilvaPacker.com.br",
    name: "Fulano", iat: agora, exp: agora + 60, jti: randomUUID(), ...extra,
  });
  const assinatura = sign(null, Buffer.from(`${header}.${payload}`), privateKey).toString("base64url");
  return { token: `${header}.${payload}.${assinatura}`, header, assinatura };
}

async function main() {
  const { validarBilhetePortal, portalSsoAtivo } = await import("../lib/portal-sso");
  assert.equal(portalSsoAtivo(), true);

  // Administrador no Portal → admin aqui.
  assert.deepEqual(validarBilhetePortal(bilhete({ role: "admin" }).token), { email: "fulano@silvapacker.com.br", name: "Fulano", admin: true });
  // Usuário comum, bilhete do Portal antigo (sem role) e valores que não são exatamente "admin".
  assert.equal(validarBilhetePortal(bilhete({ role: "user" }).token)?.admin, false);
  assert.equal(validarBilhetePortal(bilhete().token)?.admin, false);
  assert.equal(validarBilhetePortal(bilhete({ role: "ADMIN" }).token)?.admin, false);
  assert.equal(validarBilhetePortal(bilhete({ role: true }).token)?.admin, false);
  assert.equal(validarBilhetePortal(bilhete({ admin: true }).token)?.admin, false);

  // Trocar o role depois de assinado quebra a assinatura.
  const comum = bilhete({ role: "user" });
  const payloadForjado = b64url({ ...JSON.parse(Buffer.from(comum.token.split(".")[1], "base64url").toString("utf8")), role: "admin", jti: randomUUID() });
  assert.equal(validarBilhetePortal(`${comum.header}.${payloadForjado}.${comum.assinatura}`), null);

  // Bilhete só vale uma vez e só para este app.
  const unico = bilhete({ role: "admin" }).token;
  assert.equal(validarBilhetePortal(unico)?.admin, true);
  assert.equal(validarBilhetePortal(unico), null);
  assert.equal(validarBilhetePortal(bilhete({ role: "admin" }, { aud: "https://outro-app.exemplo.test" }).token), null);

  console.log("portal-sso: ok");
}
main().catch(e => { console.error(e); process.exit(1); });
