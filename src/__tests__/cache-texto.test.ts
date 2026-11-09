// Trava da resposta em texto do cache do Sienge: tem de dar o mesmo JSON que o
// `{ ...dados, cachedAt }` de antes. Rodar: npx tsx src/__tests__/cache-texto.test.ts
import assert from "node:assert/strict";
import { jsonComCachedAt } from "../lib/cache-texto";

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

console.log("cache-texto: ok");
