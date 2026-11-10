// Maquete vinda do projeto (SketchUp) para o 3D do Quadro Espelho: leitura do
// arquivo .m3d gerado por scripts/skp-para-maquete.py. Puro, sem three.js.
//
// O arquivo (já sem o gzip): "M3D1" + uint32 tamanho do cabeçalho + cabeçalho
// JSON + posições (uint16 × 9 por triângulo, quantizadas na caixa min–max) +
// cores (uint8 × 3 por triângulo, sRGB). Metros; origem no eixo da torre e no
// nível da rua; x para a direita, y para cima, z para a frente (as sacadas).
//
// A casca (base, lazer, topo, rua) vem numa faixa só; cada apartamento tem a
// sua, com o vidro separado do resto — é o que o 3D pinta pela situação.

// [primeiro triângulo, quantidade]
export type Faixa = [number, number];

export interface UnidadeModelo {
  andar: number;   // 0 = primeiro pavimento de apartamentos
  lado: number;    // 0 = esquerda, 1 = direita, olhando a frente
  opaco: Faixa;
  vidro: Faixa;
  caixa: [number, number, number, number, number, number]; // x0, y0, z0, x1, y1, z1 (m)
}

export interface CabecalhoModelo {
  versao: number;
  origem: string;
  triangulos: number;
  min: [number, number, number];
  max: [number, number, number];
  casca: { opaco: Faixa; vidro: Faixa };
  andares: { piso: number; topo: number }[];
  unidades: UnidadeModelo[];
}

export interface Modelo3D {
  cab: CabecalhoModelo;
  posicoes: Uint16Array; // 9 por triângulo
  cores: Uint8Array;     // 3 por triângulo
}

export function ehGzip(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  return b.length === 2 && b[0] === 0x1f && b[1] === 0x8b;
}

// Recebe o arquivo já descompactado.
export function lerModelo(buf: ArrayBuffer): Modelo3D {
  const bytes = new Uint8Array(buf);
  if (bytes.length < 8 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "M3D1") {
    throw new Error("Arquivo de maquete inválido (esperado M3D1)");
  }
  const tamCab = new DataView(buf).getUint32(4, true);
  const cab = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + tamCab))) as CabecalhoModelo;
  const n = cab.triangulos;
  const iniPos = 8 + tamCab, iniCor = iniPos + n * 18;
  if (bytes.length < iniCor + n * 3) throw new Error("Arquivo de maquete cortado");
  // Cópia: o início das posições pode cair em byte ímpar e o Uint16Array exige par.
  const posicoes = new Uint16Array(buf.slice(iniPos, iniCor));
  const cores = bytes.slice(iniCor, iniCor + n * 3);
  return { cab, posicoes, cores };
}

// Vértices (x, y, z em metros) dos triângulos de uma faixa: 9 números por triângulo.
export function posicoesDaFaixa(m: Modelo3D, [ini, qtd]: Faixa): Float32Array {
  const out = new Float32Array(qtd * 9);
  const { min, max } = m.cab;
  const esc = [(max[0] - min[0]) / 65535, (max[1] - min[1]) / 65535, (max[2] - min[2]) / 65535];
  const base = ini * 9;
  for (let i = 0; i < out.length; i++) out[i] = min[i % 3] + m.posicoes[base + i] * esc[i % 3];
  return out;
}

// sRGB (0–255) → linear (0–1), que é como o three.js espera a cor por vértice.
const LINEAR = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  return t;
})();

// Cor por vértice (linear) dos triângulos de uma faixa: a cor do triângulo
// repetida nos três vértices.
export function coresDaFaixa(m: Modelo3D, [ini, qtd]: Faixa): Float32Array {
  const out = new Float32Array(qtd * 9);
  for (let t = 0; t < qtd; t++) {
    const o = (ini + t) * 3;
    const r = LINEAR[m.cores[o]], g = LINEAR[m.cores[o + 1]], b = LINEAR[m.cores[o + 2]];
    for (let v = 0; v < 3; v++) { out[t * 9 + v * 3] = r; out[t * 9 + v * 3 + 1] = g; out[t * 9 + v * 3 + 2] = b; }
  }
  return out;
}

export const chaveDaUnidade = (andar: number, lado: number) => `${andar}:${lado}`;

export function unidadesPorChave(m: Modelo3D): Map<string, UnidadeModelo> {
  return new Map(m.cab.unidades.map(u => [chaveDaUnidade(u.andar, u.lado), u]));
}
