"use client";

// Maquete 3D do Quadro Espelho (Silva Packer) — "tabela de vendas em 3D", como
// a do Financeiro da Leven, em versão de estudo de massa: cada apartamento é um
// bloco do pavimento na cor da situação; a sacada (no canto de dentro, no
// Palácio) leva a cor forte. Clique abre o card da unidade.
//
// Toda medida vem de lib/torre-3d (configDoEmpreendimento). Ajustar a planta
// ou o lado dos finais não mexe aqui.

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useTheme } from "next-themes";
import { RotateCw, X, Maximize2 } from "lucide-react";
import { formatCurrency } from "@/lib/dashboard-utils";
import { COR_SITUACAO, SITUACOES } from "@/lib/situacao-unidade";
import {
  configDoEmpreendimento, ordenarFinais, blocoDaUnidade, sacadaDaUnidade, cotaDoAndar, alturaEmbasamento, descricaoDaPosicao, type Bloco,
} from "@/lib/torre-3d";

export interface Unidade3D {
  id: string;
  unit: string;
  andar: number;
  final: string;
  situacao: string;
  area: number;
  cliente: string;
  valor: number;
  apagada: boolean; // fora do filtro da tela → esmaecida
}

interface Props {
  unidades: Unidade3D[];
  empreendimento: string;
  mostrarValores: boolean;
}

const FACHADA = new THREE.Color("#e7dfd2");   // bege da perspectiva do Palácio
const BASE = new THREE.Color("#d8cebd");
const VENEZIANA = new THREE.Color("#3b3f45");
const corDe = (sit: string) => new THREE.Color(COR_SITUACAO[sit] || "#f59e0b");
const temDono = (sit: string) => sit === "Vendido" || sit === "Permutante" || sit === "Vendido/Terceiros";

function caixa(b: Bloco, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
  m.position.set(b.x, b.y, b.z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export default function Torre3D({ unidades, empreendimento, mostrarValores }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const escuro = resolvedTheme === "dark";
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [girando, setGirando] = useState(true);
  const api = useRef<{ resetar: () => void; girar: (v: boolean) => void; marcar: (id: string | null) => void } | null>(null);

  const cfg = useMemo(() => configDoEmpreendimento(empreendimento), [empreendimento]);
  // Layout: finais de cada andar na ordem da frente.
  const layout = useMemo(() => {
    const porAndar = new Map<number, Unidade3D[]>();
    unidades.forEach(u => { if (!porAndar.has(u.andar)) porAndar.set(u.andar, []); porAndar.get(u.andar)!.push(u); });
    const andares = Array.from(porAndar.keys()).sort((a, b) => a - b);
    const primeiro = andares[0] ?? 1;
    const ultimo = andares[andares.length - 1] ?? 1;
    const itens = andares.flatMap(a => {
      const lista = porAndar.get(a)!;
      const ordem = ordenarFinais(lista.map(u => u.final), cfg);
      return lista.map(u => ({ u, indice: ordem.indexOf(u.final), total: ordem.length }));
    });
    return { itens, primeiro, ultimo };
  }, [unidades, cfg]);
  const porId = useMemo(() => new Map(layout.itens.map(i => [i.u.id, i])), [layout]);

  // Cena: monta uma vez por empreendimento/dados/tema.
  useEffect(() => {
    const el = host.current;
    if (!el || layout.itens.length === 0) return;
    const largura = el.clientWidth, altura = el.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(largura, altura);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(escuro ? "#0f172a" : "#dbeafe");
    scene.fog = new THREE.Fog(scene.background as THREE.Color, 250, 600);

    const { primeiro, ultimo } = layout;
    const hBase = alturaEmbasamento(primeiro, cfg);
    const topo = cotaDoAndar(ultimo + 1, primeiro, cfg);

    const camera = new THREE.PerspectiveCamera(40, largura / altura, 1, 2000);
    // Enquadra o prédio inteiro (fov 40°): distância ~ 1,6 × a altura.
    const alvo = new THREE.Vector3(0, topo * 0.5, 0);
    const posInicial = new THREE.Vector3(topo * 0.85, topo * 0.6, topo * 1.65);
    camera.position.copy(posInicial);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(alvo);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 20; controls.maxDistance = topo * 3;
    controls.autoRotate = true; controls.autoRotateSpeed = 0.6;

    scene.add(new THREE.HemisphereLight(escuro ? "#475569" : "#ffffff", escuro ? "#1e293b" : "#cbd5e1", escuro ? 1.1 : 1.6));
    const sol = new THREE.DirectionalLight("#ffffff", escuro ? 0.9 : 1.6);
    sol.position.set(topo * 0.6, topo * 1.2, topo * 0.8);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    const s = Math.max(topo, 60);
    Object.assign(sol.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: topo * 4 });
    scene.add(sol);

    const chao = new THREE.Mesh(new THREE.CircleGeometry(400, 64), new THREE.MeshStandardMaterial({ color: escuro ? "#1e293b" : "#e2e8f0" }));
    chao.rotation.x = -Math.PI / 2; chao.receiveShadow = true;
    scene.add(chao);
    const descarte: (THREE.BufferGeometry | THREE.Material)[] = [chao.geometry, chao.material as THREE.Material];

    const matFachada = new THREE.MeshStandardMaterial({ color: FACHADA, roughness: 0.85 });
    const matBase = new THREE.MeshStandardMaterial({ color: BASE, roughness: 0.9 });
    const matVeneziana = new THREE.MeshStandardMaterial({ color: VENEZIANA, roughness: 0.6 });
    const matVidro = new THREE.MeshStandardMaterial({ color: "#1f2937", roughness: 0.15, metalness: 0.5 });
    descarte.push(matFachada, matBase, matVeneziana, matVidro);
    const grupo = new THREE.Group();
    scene.add(grupo);
    const add = (m: THREE.Mesh) => { grupo.add(m); descarte.push(m.geometry); return m; };

    // Embasamento: garagens com venezianas escuras e lojas no térreo.
    // Vai da frente das sacadas (+2 m) até `embasamento` m atrás da torre.
    const wB = cfg.largura + cfg.embasamento * 2;
    const zFrenteBase = cfg.profundidade / 2 + cfg.sacada + 2, zFundoBase = -cfg.profundidade / 2 - cfg.embasamento;
    add(caixa({ x: 0, y: hBase / 2, z: (zFrenteBase + zFundoBase) / 2, w: wB, h: hBase, d: zFrenteBase - zFundoBase }, matBase));
    const nVen = 5;
    for (let i = 0; i < nVen; i++) {
      const w = wB / nVen - 2;
      const x = -wB / 2 + (wB / nVen) * i + wB / nVen / 2;
      if (i === Math.floor(nVen / 2)) { add(caixa({ x, y: hBase / 2 + 1, z: zFrenteBase + 0.05, w: w * 0.7, h: hBase - 2, d: 0.1 }, matVidro)); continue; }
      add(caixa({ x, y: hBase * 0.6, z: zFrenteBase + 0.05, w, h: hBase * 0.55, d: 0.1 }, matVeneziana));
    }

    // Apartamentos: corpo tingido pela situação + sacada na cor forte.
    const blocos: THREE.Mesh[] = [];
    const matsUnidade = new Map<string, { corpo: THREE.MeshStandardMaterial; sacada: THREE.MeshStandardMaterial }>();
    layout.itens.forEach(({ u, indice, total }) => {
      const cor = corDe(u.situacao);
      const corpo = new THREE.MeshStandardMaterial({
        color: u.apagada ? FACHADA.clone() : FACHADA.clone().lerp(cor, 0.55), roughness: 0.8,
        transparent: u.apagada, opacity: u.apagada ? 0.35 : 1,
      });
      const sac = new THREE.MeshStandardMaterial({ color: u.apagada ? FACHADA.clone() : cor, roughness: 0.4, transparent: true, opacity: u.apagada ? 0.3 : 0.9 });
      descarte.push(corpo, sac);
      matsUnidade.set(u.id, { corpo, sacada: sac });
      const b = add(caixa(blocoDaUnidade(indice, total, u.andar, primeiro, cfg), corpo));
      b.userData.id = u.id; blocos.push(b);
      const sb = sacadaDaUnidade(indice, total, u.andar, primeiro, cfg);
      add(caixa(sb, matFachada)); // laje
      const gc = add(caixa({ ...sb, y: sb.y + 0.6, h: 1.1, d: 0.08, z: sb.z + sb.d / 2 - 0.04 }, sac)); // guarda-corpo
      gc.userData.id = u.id; blocos.push(gc);
    });
    // Lajes (frisos) entre pavimentos e coroamento.
    for (let a = primeiro; a <= ultimo + 1; a++) {
      add(caixa({ x: 0, y: cotaDoAndar(a, primeiro, cfg), z: 0, w: cfg.largura + 0.6, h: 0.3, d: cfg.profundidade + 0.6 }, matFachada));
    }
    add(caixa({ x: 0, y: topo + 2, z: 0, w: cfg.largura + 1.2, h: 4, d: cfg.profundidade + 1.2 }, matFachada));
    add(caixa({ x: 0, y: topo + 6, z: -1, w: cfg.largura * 0.5, h: 4, d: cfg.profundidade * 0.5 }, matBase));

    // Interação: passar o mouse acende, clicar seleciona.
    const ray = new THREE.Raycaster();
    const ponteiro = new THREE.Vector2();
    let sobre: string | null = null;
    let marcada: string | null = null;
    const pintar = () => {
      matsUnidade.forEach((m, id) => {
        const on = id === sobre || id === marcada;
        m.corpo.emissive.set(on ? (id === marcada ? "#ffffff" : "#94a3b8") : "#000000");
        m.corpo.emissiveIntensity = id === marcada ? 0.45 : 0.25;
      });
    };
    const achar = (ev: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ponteiro.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ponteiro, camera);
      return (ray.intersectObjects(blocos, false)[0]?.object.userData.id as string | undefined) ?? null;
    };
    const mover = (ev: PointerEvent) => { const id = achar(ev); if (id !== sobre) { sobre = id; renderer.domElement.style.cursor = id ? "pointer" : "grab"; pintar(); } };
    let inicio = { x: 0, y: 0 };
    const baixar = (ev: PointerEvent) => { inicio = { x: ev.clientX, y: ev.clientY }; };
    const soltar = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y) > 5) return; // foi arrasto
      const id = achar(ev);
      if (id) setSelecionada(id);
    };
    renderer.domElement.addEventListener("pointermove", mover);
    renderer.domElement.addEventListener("pointerdown", baixar);
    renderer.domElement.addEventListener("pointerup", soltar);

    api.current = {
      resetar: () => { camera.position.copy(posInicial); controls.target.copy(alvo); },
      girar: v => { controls.autoRotate = v; },
      marcar: id => { marcada = id; pintar(); },
    };

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    });
    ro.observe(el);
    let quadro = 0;
    const laco = () => { quadro = requestAnimationFrame(laco); controls.update(); renderer.render(scene, camera); };
    laco();
    (window as unknown as { __torre3d?: unknown }).__torre3d = { renderer, scene, camera };

    return () => {
      cancelAnimationFrame(quadro);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointermove", mover);
      renderer.domElement.removeEventListener("pointerdown", baixar);
      renderer.domElement.removeEventListener("pointerup", soltar);
      controls.dispose();
      descarte.forEach(d => d.dispose());
      renderer.dispose();
      el.removeChild(renderer.domElement);
      api.current = null;
    };
  }, [layout, cfg, escuro]);

  useEffect(() => { api.current?.girar(girando); }, [girando, layout, escuro]);
  useEffect(() => { api.current?.marcar(selecionada); if (selecionada) setGirando(false); }, [selecionada, layout, escuro]);

  const sel = selecionada ? porId.get(selecionada) : undefined;
  const contagem = SITUACOES.map(s => ({ ...s, n: unidades.filter(u => !u.apagada && u.situacao === s.nome).length })).filter(s => s.n > 0);

  if (layout.itens.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-10">Nenhum apartamento com andar no nome (ex.: AP1201) para montar a maquete.</p>;
  }

  return (
    <div className="relative w-full h-[640px] rounded-xl overflow-hidden border border-slate-200/60 dark:border-slate-700/60">
      <div ref={host} className="absolute inset-0" />
      {/* Legenda */}
      <div className="absolute left-3 top-3 rounded-lg bg-white/90 dark:bg-slate-900/85 shadow-sm px-3 py-2 text-[11px] space-y-1">
        <p className="font-bold text-slate-700 dark:text-slate-200">{cfg.nome === "padrão" ? empreendimento : cfg.nome}</p>
        {contagem.map(s => (
          <div key={s.nome} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.cor }} />
            <span className="text-slate-600 dark:text-slate-300">{s.nome}: <strong>{s.n}</strong></span>
          </div>
        ))}
        <p className="text-[10px] text-slate-400 pt-1">Estudo de massa: medidas estimadas</p>
      </div>
      {/* Controles */}
      <div className="absolute right-3 top-3 flex gap-1.5">
        <button type="button" onClick={() => setGirando(g => !g)} title={girando ? "Parar de girar" : "Girar"} className={`h-8 w-8 inline-flex items-center justify-center rounded-lg border shadow-sm ${girando ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white/90 border-slate-200 text-slate-600 dark:bg-slate-900/85 dark:border-slate-700 dark:text-slate-300"}`}>
          <RotateCw className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => api.current?.resetar()} title="Voltar à vista inicial" className="h-8 w-8 inline-flex items-center justify-center rounded-lg border shadow-sm bg-white/90 border-slate-200 text-slate-600 dark:bg-slate-900/85 dark:border-slate-700 dark:text-slate-300">
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
      {/* Card da unidade */}
      {sel && (
        <div className="absolute right-3 bottom-3 w-72 rounded-xl bg-white/95 dark:bg-slate-900/95 shadow-lg border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-lg font-black text-slate-800 dark:text-slate-100 leading-none">{sel.u.unit}</p>
              <p className="text-[11px] text-slate-500 mt-1">{sel.u.andar}º andar · {descricaoDaPosicao(sel.indice, sel.total)}</p>
            </div>
            <button type="button" onClick={() => setSelecionada(null)} className="text-slate-400 hover:text-slate-600" title="Fechar"><X className="h-4 w-4" /></button>
          </div>
          <span className="inline-flex items-center gap-1.5 mt-3 rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: COR_SITUACAO[sel.u.situacao] || "#f59e0b" }}>{sel.u.situacao}</span>
          <dl className="mt-3 space-y-1 text-xs">
            {sel.u.area > 0 && <div className="flex justify-between"><dt className="text-slate-500">Área privativa</dt><dd className="font-semibold tabular-nums">{sel.u.area.toLocaleString("pt-BR")} m²</dd></div>}
            {temDono(sel.u.situacao) && sel.u.cliente && sel.u.cliente !== "—" && <div className="flex justify-between gap-3"><dt className="text-slate-500">Cliente</dt><dd className="font-semibold text-right truncate" title={sel.u.cliente}>{sel.u.cliente}</dd></div>}
            {mostrarValores && sel.u.valor > 0 && <div className="flex justify-between"><dt className="text-slate-500">Valor no contrato</dt><dd className="font-semibold tabular-nums">{formatCurrency(sel.u.valor)}</dd></div>}
          </dl>
        </div>
      )}
    </div>
  );
}
