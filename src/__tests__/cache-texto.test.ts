// Trava da resposta em texto do cache do Sienge: tem de dar o mesmo JSON que o
// `{ ...dados, cachedAt }` de antes. Rodar: npx tsx src/__tests__/cache-texto.test.ts
import assert from "node:assert/strict";
import { etagDoCache, jsonComCachedAt, navegadorTemVersao, respostaMudou, respostaNaoMudou } from "../lib/cache-texto";
import { periodosDoPainel } from "../lib/painel-periodos";

const iso = "2026-11-09T13:39:14.158Z";

// Objeto (formato do data::text do PostgreSQL, com espaços)
const obj = '{"data": [{"billId": 1, "payments": []}], "metadata": {"count": 1}}';
assert.deepEqual(JSON.parse(jsonComCachedAt(obj, iso)), { ...JSON.parse(obj), cachedAt: iso });

// cachedAt antigo dentro do dado: vale o novo, como no spread
const velho = '{"data": [], "cachedAt": "2020-01-01T00:00:00.000Z"}';
assert.equal(JSON.parse(jsonComCachedAt(velho, iso)).cachedAt, iso);

// Objeto vazio e espaços nas pontas
assert.deepEqual(JSON.parse(jsonComCachedAt("  {}  ", iso)), { cachedAt: iso });

// Lista solta vira { data: [...] }
assert.deepEqual(JSON.parse(jsonComCachedAt("[1, 2]", iso)), { data: [1, 2], cachedAt: iso });

// Acento e caractere especial passam intactos
const acento = '{"data": [{"creditorName": "JOÃO \\"ZÉ\\" Ç"}]}';
assert.equal(JSON.parse(jsonComCachedAt(acento, iso)).data[0].creditorName, 'JOÃO "ZÉ" Ç');

// ETag = versão do cache; If-None-Match pode vir fraco (W/) ou com várias
assert.equal(etagDoCache(iso), `"${iso}"`);
assert.equal(navegadorTemVersao(`"${iso}"`, iso), true);
assert.equal(navegadorTemVersao(`W/"${iso}"`, iso), true);
assert.equal(navegadorTemVersao(`"x", "${iso}"`, iso), true);
assert.equal(navegadorTemVersao(`"2026-11-08T10:00:00.000Z"`, iso), false);
assert.equal(navegadorTemVersao(null, iso), false);

// Respostas curtas não ficam no disco do navegador
(async () => {
  const nm = respostaNaoMudou(iso);
  assert.equal(nm.headers.get("cache-control"), "no-store");
  assert.deepEqual(await nm.json(), { naoMudou: true, cachedAt: iso });
  const m = respostaMudou(iso);
  assert.equal(m.headers.get("cache-control"), "no-store");
  assert.deepEqual(await m.json(), { naoMudou: false, mudou: true, cachedAt: iso });

  // Períodos do Painel = os da rotina diária (CR até ano+15)
  assert.deepEqual(periodosDoPainel(2026), { inicio: "2016-01-01", fim: "2031-12-31", fimReceber: "2041-12-31" });

  console.log("cache-texto: ok");
})();
