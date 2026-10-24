"use client";

// Maquete 3D do Quadro Espelho (Silva Packer) — "tabela de vendas em 3D", como
// a do Financeiro da Leven: cada apartamento é um bloco do pavimento na cor da
// situação, com as janelas da planta tipo (vidro na cor da situação) e a
// sacada em vidro colorido. Base, lojas e lazer em torre-3d-predio.ts.
// Clique (no corpo, na sacada ou numa janela) abre o card da unidade.
//
// Toda medida vem de lib/torre-3d (configDoEmpreendimento). Ajustar a planta
// ou o lado dos finais não mexe aqui.

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useTheme } from "next-themes";
import { RotateCw, X, Maximize2, Minimize2, Home, Layers, ChevronUp, LayoutGrid, Volume2, VolumeX, Banknote } from "lucide-react";
import { formatCurrency } from "@/lib/dashboard-utils";
import { VERSAO_ENTORNO, type DadosEntorno } from "@/lib/entorno-osm";
import { AndamentoObraCard } from "@/components/andamento-obra-card";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import PlantaDollhouse from "@/components/planta-dollhouse";
import PlantaFotos from "@/components/planta-fotos";
import CondicoesPagamentoModal from "@/components/condicoes-pagamento";
import { chaveDoEmpreendimento } from "@/lib/condicoes-pagamento";

// Música de fundo do 3D: faixa e volume (ver public/audio/LEIA-ME.md).
const MUSICA_URL = "/audio/quadro-3d-ambiente.mp3";
const MUSICA_VOLUME = 0.7; // padrão; o controle ao lado do botão guarda o escolhido
const MUSICA_PREF = "quadro3d_musica";
const MUSICA_VOL_PREF = "quadro3d_volume";
import { COR_SITUACAO, SITUACOES } from "@/lib/situacao-unidade";
import {
  configDoEmpreendimento, ordenarFinais, blocoDaUnidade, sacadaDaUnidade, cotaDoAndar, alturaEmbasamento, descricaoDaPosicao, baseDaTorre, janelasDaUnidade, plantaDaUnidade, type Bloco, type Janela,
} from "@/lib/torre-3d";
import { criarTexturas, materiaisDoPredio, caixaUV, montarBase, montarLazer, montarRua, montarQuadra } from "@/components/torre-3d-predio";

export interface Unidade3D {
  id: string;
  unit: string;
  andar: number;
  final: string;
  situacao: string;
  area: number;
  cliente: string;
  valor: number;
  preco: number;    // preço de tabela (unidade sem venda), 0 = sem preço
  apagada: boolean; // fora do filtro da tela → esmaecida
}

interface Props {
  unidades: Unidade3D[];
  empreendimento: string;
  mostrarValores: boolean;
  // Unidade com contrato: o card mostra "Ver contrato" (abre a ficha na tela).
  temContrato?: (id: string) => boolean;
  // dentro: na tela cheia, a ficha abre DENTRO da área do 3D (senão o
  // navegador sai da tela cheia para mostrá-la).
  onAbrirContrato?: (id: string, dentro: HTMLElement | null) => void;
}

const FACHADA = new THREE.Color("#e9e1d3");   // bege da perspectiva do Palácio
const VIDRO = new THREE.Color("#1f2a33");
const corDe = (sit: string) => new THREE.Color(COR_SITUACAO[sit] || "#f59e0b");
const temDono = (sit: string) => sit === "Vendido" || sit === "Permutante" || sit === "Vendido/Terceiros";

export default function Torre3D({ unidades, empreendimento, mostrarValores, temContrato, onAbrirContrato }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const escuro = resolvedTheme === "dark";
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [girando, setGirando] = useState(true);
  const api = useRef<{ resetar: () => void; girar: (v: boolean) => void; marcar: (id: string | null) => void; focar: (id: string) => void; filtrar: (sits: string[]) => void } | null>(null);
  const [espelhoAberto, setEspelhoAberto] = useState(true);
  const etiqueta = useRef<HTMLDivElement>(null);
  const bussola = useRef<HTMLDivElement>(null);
  const [plantaAberta, setPlantaAberta] = useState(false);
  const [condicoesAbertas, setCondicoesAbertas] = useState(false);
  const [abaPlanta, setAbaPlanta] = useState<"planta" | "tour" | "fotos">("planta");
  useEffect(() => { setPlantaAberta(false); setCondicoesAbertas(false); }, [selecionada]); // outra unidade = planta/condições fechadas
  const [fonteMapa, setFonteMapa] = useState("");
  const [avisoMapa, setAvisoMapa] = useState(""); // "carregando…" / "indisponível": o mapa não falha calado
  // Filtro da legenda (Edielson, 23/10: tem de funcionar na tela cheia, onde
  // os filtros da página somem). Vazio = todas; as de fora esmaecem.
  const [filtro, setFiltro] = useState<string[]>([]);
  const alternarFiltro = (s: string) => { setSelecionada(null); setFiltro(f => f.includes(s) ? f.filter(x => x !== s) : [...f, s]); };

  // Tela cheia (Edielson, 23/10): só a área do 3D. Fullscreen API no próprio
  // contêiner (o ResizeObserver ajusta o canvas); navegador sem a API
  // (iPhone) cai num modo fixo que cobre a janela.
  const caixa = useRef<HTMLDivElement>(null);
  const [telaCheia, setTelaCheia] = useState(false);
  const [cheiaFixa, setCheiaFixa] = useState(false);
  useEffect(() => {
    const f = () => setTelaCheia(!!caixa.current && document.fullscreenElement === caixa.current);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);
  useEffect(() => {
    if (!cheiaFixa) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setCheiaFixa(false); };
    const ov = document.body.style.overflow; document.body.style.overflow = "hidden";
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("keydown", esc); document.body.style.overflow = ov; };
  }, [cheiaFixa]);
  const cheia = telaCheia || cheiaFixa;
  const sairDaTelaCheia = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); setCheiaFixa(false); };
  const alternarTelaCheia = () => {
    if (cheia) { sairDaTelaCheia(); return; }
    const el = caixa.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => setCheiaFixa(true));
    else setCheiaFixa(true);
  };

  // Música de fundo (Edielson, 24/10): instrumental de biblioteca com licença
  // livre para uso comercial (public/audio/LEIA-ME.md). O navegador só toca
  // áudio depois de um clique, então ela entra ao abrir a tela cheia (que é o
  // modo de apresentar), com fade; o botão de alto-falante liga/desliga a
  // qualquer hora e a escolha fica lembrada no navegador. Sair da tela cheia
  // para a música; aba escondida pausa e volta ao reaparecer.
  const [musica, setMusica] = useState(false);
  const [volume, setVolume] = useState(MUSICA_VOLUME);
  const volumeRef = useRef(MUSICA_VOLUME);
  useEffect(() => { try { const v = Number(localStorage.getItem(MUSICA_VOL_PREF)); if (v > 0 && v <= 1) { setVolume(v); volumeRef.current = v; } } catch { /* sem storage */ } }, []);
  const mudarVolume = (v: number) => {
    v = Math.min(1, Math.max(0.05, v)); setVolume(v); volumeRef.current = v;
    try { localStorage.setItem(MUSICA_VOL_PREF, String(v)); } catch { /* sem storage */ }
    const a = audio.current; if (a && tocando.current) { if (fadeAtual.current) cancelAnimationFrame(fadeAtual.current); a.volume = v; }
  };
  const audio = useRef<HTMLAudioElement | null>(null);
  const fadeAtual = useRef<number | null>(null);
  const tocando = useRef(false);
  const fade = (a: HTMLAudioElement, alvo: number, ms: number, fim?: () => void) => {
    if (fadeAtual.current) cancelAnimationFrame(fadeAtual.current);
    const de = a.volume, t0 = performance.now();
    const passo = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      a.volume = de + (alvo - de) * k;
      if (k < 1) fadeAtual.current = requestAnimationFrame(passo); else { fadeAtual.current = null; fim?.(); }
    };
    fadeAtual.current = requestAnimationFrame(passo);
  };
  const tocarMusica = () => {
    if (tocando.current) return;
    let a = audio.current;
    if (!a) { a = new Audio(MUSICA_URL); a.loop = true; a.preload = "auto"; audio.current = a; }
    a.volume = 0;
    a.play().then(() => { tocando.current = true; setMusica(true); fade(a!, volumeRef.current, 1800); }).catch(() => { tocando.current = false; setMusica(false); });
  };
  const pararMusica = () => {
    const a = audio.current;
    tocando.current = false; setMusica(false);
    if (a && !a.paused) fade(a, 0, 700, () => a.pause());
  };
  const alternarMusica = () => {
    const ligar = !tocando.current;
    try { localStorage.setItem(MUSICA_PREF, ligar ? "on" : "off"); } catch { /* sem storage */ }
    if (ligar) tocarMusica(); else pararMusica();
  };
  useEffect(() => {
    let pref = "on";
    try { pref = localStorage.getItem(MUSICA_PREF) || "on"; } catch { /* sem storage */ }
    if (cheia && pref !== "off") tocarMusica();
    if (!cheia) pararMusica();
    // tocar/parar são estáveis o bastante: só dependem de refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cheia]);
  useEffect(() => {
    let pausadaPelaAba = false;
    const vis = () => {
      const a = audio.current; if (!a) return;
      if (document.hidden) { if (tocando.current && !a.paused) { a.pause(); pausadaPelaAba = true; } }
      else if (pausadaPelaAba) { pausadaPelaAba = false; a.play().catch(() => {}); }
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      if (fadeAtual.current) cancelAnimationFrame(fadeAtual.current);
      const a = audio.current; if (a) { a.pause(); a.src = ""; audio.current = null; }
    };
  }, []);

  const cfg = useMemo(() => configDoEmpreendimento(empreendimento), [empreendimento]);
  // Layout: finais de cada andar na ordem da frente.
  const layout = useMemo(() => {
    const porAndar = new Map<number, Unidade3D[]>();
    unidades.forEach(u => { if (!porAndar.has(u.andar)) porAndar.set(u.andar, []); porAndar.get(u.andar)!.push(u); });
    const andares = Array.from(porAndar.keys()).sort((a, b) => a - b);
    const ultimo = andares[andares.length - 1] ?? 1;
    const itens = andares.flatMap(a => {
      const lista = porAndar.get(a)!;
      const ordem = ordenarFinais(lista.map(u => u.final), cfg);
      return lista.map(u => ({ u, indice: ordem.indexOf(u.final), total: ordem.length }));
    });
    // Andares do projeto abaixo do primeiro com unidade no Sienge (Palácio:
    // 7º e 8º diferenciados): mesmos finais do andar de cima, sem situação.
    let primeiro = andares[0] ?? 1;
    if (cfg.primeiroAndar && andares.length && cfg.primeiroAndar < primeiro) {
      const ordem = ordenarFinais(porAndar.get(primeiro)!.map(u => u.final), cfg);
      for (let a = cfg.primeiroAndar; a < primeiro; a++)
        ordem.forEach((f, indice) => itens.push({
          u: { id: "", unit: "", andar: a, final: f, situacao: "", area: 0, cliente: "", valor: 0, preco: 0, apagada: false },
          indice, total: ordem.length,
        }));
      primeiro = cfg.primeiroAndar;
    }
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
    // Com mapa da cidade: neblina a partir de ~1 km, a borda do mapa some no céu.
    scene.fog = cfg.local ? new THREE.Fog(scene.background as THREE.Color, 1000, 2100) : new THREE.Fog(scene.background as THREE.Color, 600, 1400);

    const { primeiro, ultimo } = layout;
    const hBase = alturaEmbasamento(primeiro, cfg);
    const topo = cotaDoAndar(ultimo + 1, primeiro, cfg);

    const camera = new THREE.PerspectiveCamera(40, largura / altura, 1, cfg.local ? 3000 : 2000);
    // Enquadra o prédio inteiro (fov 40°): distância ~ 1,6 × a altura.
    const alvo = new THREE.Vector3(0, topo * 0.45, 0);
    // De frente, um pouco pela esquerda, como a perspectiva do Palácio.
    const posInicial = new THREE.Vector3(-topo * 0.75, topo * 0.5, topo * 1.6);
    camera.position.copy(posInicial);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(alvo);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 20; controls.maxDistance = cfg.local ? Math.max(topo * 3, 1100) : topo * 3;
    controls.autoRotate = true; controls.autoRotateSpeed = 0.6;

    scene.add(new THREE.HemisphereLight(escuro ? "#475569" : "#ffffff", escuro ? "#1e293b" : "#cbd5e1", escuro ? 1.1 : 1.6));
    const sol = new THREE.DirectionalLight("#ffffff", escuro ? 0.9 : 1.6);
    sol.position.set(topo * 0.6, topo * 1.2, topo * 0.8);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    const s = Math.max(topo, 90);
    Object.assign(sol.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: topo * 4 });
    scene.add(sol);

    const chao = new THREE.Mesh(new THREE.CircleGeometry(cfg.local ? 2600 : 400, 64), new THREE.MeshStandardMaterial({ color: escuro ? "#1e293b" : "#e2e8f0" }));
    chao.rotation.x = -Math.PI / 2; chao.receiveShadow = true;
    scene.add(chao);
    const descarte: { dispose(): void }[] = [chao.geometry, chao.material as THREE.Material];

    const tx = criarTexturas();
    const mats = materiaisDoPredio(tx);
    Object.values(tx).forEach(t => descarte.push(t));
    Object.values(mats).forEach(m => descarte.push(m));
    const grupo = new THREE.Group();
    scene.add(grupo);
    const geos: THREE.BufferGeometry[] = [];
    const juntar = (o: THREE.Object3D) => { grupo.add(o); };
    const add = (m: THREE.Mesh) => { grupo.add(m); descarte.push(m.geometry); return m; };
    const caixa = (b: Bloco, mat: THREE.Material, sombra = true) => add(caixaUV(b, mat, sombra));

    // Embasamento (lojas, garagens, portal), lazer na cobertura e a rua.
    const base = baseDaTorre(primeiro, cfg);
    montarBase(base, mats, juntar, geos, Math.min(16, cfg.largura * 0.45));
    montarLazer(base, juntar, descarte);
    montarRua(base, juntar, descarte, escuro);
    // Entorno real (ruas com nome, quadras, praia), carregado depois do prédio.
    let vivo = true, entorno: { grupo: THREE.Group; dispose: () => void } | null = null;
    let norte: THREE.Vector2 | null = null; // direção do norte na cena (x, z), vinda do mapa
    if (cfg.local) {
      const zRua = Math.max(...base.contorno.map(p => p[1])) + 13; // eixo da rua da frente (montarRua)
      let versaoNaCena = 0, tentativas = 0, espera: ReturnType<typeof setTimeout> | null = null;
      // Com o mapa de uma versão antiga no banco, o servidor devolve o que tem e
      // refaz por trás; aqui a tela pergunta de novo a cada 20 s e troca o mapa
      // na hora quando o novo chega (sem fechar e abrir).
      const carregar = () => {
        if (versaoNaCena === 0) setAvisoMapa("Carregando o mapa da cidade…");
        fetch(`/api/entorno-3d?chave=${encodeURIComponent(cfg.local!.chave)}&v=${VERSAO_ENTORNO}`, { cache: "no-store" })
          .then(r => r.ok ? r.json() : null)
          .then(async (d: DadosEntorno | null) => {
            if (!vivo) return;
            const versao = d?.versao ?? 1;
            if (d?.ruas?.length && versao > versaoNaCena) {
              const { montarEntorno } = await import("@/components/torre-3d-entorno");
              if (!vivo) return;
              if (entorno) { scene.remove(entorno.grupo); entorno.dispose(); }
              const e = montarEntorno(d, escuro);
              e.grupo.position.set(-(cfg.local?.ajusteX || 0), 0, zRua);
              scene.add(e.grupo); entorno = e; versaoNaCena = versao;
              setFonteMapa(d.fonte);
              if (d.norte) norte = new THREE.Vector2(d.norte[0], d.norte[1]).normalize();
            }
            if (versaoNaCena >= VERSAO_ENTORNO) { setAvisoMapa(""); return; }
            setAvisoMapa(versaoNaCena ? "Atualizando o mapa da cidade…" : "Carregando o mapa da cidade…");
            if (++tentativas < 30) espera = setTimeout(carregar, 20_000); // até 10 min
            else setAvisoMapa(versaoNaCena ? "" : "Mapa da cidade indisponível agora");
          })
          .catch(() => { if (vivo && !versaoNaCena) setAvisoMapa("Mapa da cidade indisponível agora"); });
      };
      carregar();
      descarte.push({ dispose: () => { if (espera) clearTimeout(espera); } });
    }
    montarQuadra(base, mats, juntar, descarte);
    descarte.push(...geos);

    const L = cfg.largura, P = cfg.profundidade;
    const yTorre = base.altura;                      // pé da torre (piso do lazer)
    // Pavimento de lazer sob a torre: vidro recuado entre pilares.
    if (hBase - yTorre > 1) {
      const matLazer = new THREE.MeshStandardMaterial({ color: escuro ? "#38bdf8" : "#b9d3e2", roughness: 0.1, metalness: 0.3, emissive: escuro ? "#0c4a6e" : "#000000" });
      descarte.push(matLazer);
      caixa({ x: 0, y: yTorre + (hBase - yTorre) / 2, z: 0, w: L - 2, h: hBase - yTorre, d: P - 2 }, matLazer);
      [-1, 1].forEach(sx => [-1, 1].forEach(sz => caixa({ x: sx * (L / 2 - 0.6), y: yTorre + (hBase - yTorre) / 2, z: sz * (P / 2 - 0.6), w: 1.2, h: hBase - yTorre, d: 1.2 }, mats.mosaico)));
    }

    // Apartamentos: corpo tingido pela situação + sacada na cor forte.
    const blocos: THREE.Object3D[] = [];
    const matsUnidade = new Map<string, { corpo: THREE.MeshStandardMaterial; sacada: THREE.MeshStandardMaterial; corBase: THREE.Color; sacBase: THREE.Color; opBase: number }>();
    const caixaDe = new Map<string, Bloco>(); // corpo de cada unidade (moldura e etiqueta da seleção)
    const janelas: { j: Janela; id: string; cor: THREE.Color }[] = [];
    const focos = new Map<string, THREE.Vector3>(); // frente de cada unidade (câmera vai até ela)
    const neutroCorpo = new THREE.MeshStandardMaterial({ color: FACHADA.clone(), roughness: 0.8 });
    const neutroSacada = new THREE.MeshStandardMaterial({ color: "#9fb4c2", roughness: 0.2, transparent: true, opacity: 0.55 });
    descarte.push(neutroCorpo, neutroSacada);
    layout.itens.forEach(({ u, indice, total }) => {
      const cor = corDe(u.situacao);
      const semSituacao = !u.id;
      const corpo = semSituacao ? neutroCorpo : new THREE.MeshStandardMaterial({
        color: u.apagada ? FACHADA.clone() : FACHADA.clone().lerp(cor, 0.45), roughness: 0.8,
        transparent: u.apagada, opacity: u.apagada ? 0.35 : 1,
      });
      const sac = semSituacao ? neutroSacada : new THREE.MeshStandardMaterial({ color: u.apagada ? FACHADA.clone() : cor, roughness: 0.3, transparent: true, opacity: u.apagada ? 0.3 : 0.75 });
      if (!semSituacao) { descarte.push(corpo, sac); matsUnidade.set(u.id, { corpo, sacada: sac, corBase: corpo.color.clone(), sacBase: sac.color.clone(), opBase: sac.opacity }); }
      const bloco = blocoDaUnidade(indice, total, u.andar, primeiro, cfg);
      if (!semSituacao) { focos.set(u.id, new THREE.Vector3(bloco.x, bloco.y, P / 2)); caixaDe.set(u.id, bloco); }
      const b = caixa(bloco, corpo);
      b.userData.id = u.id; blocos.push(b);
      const sb = sacadaDaUnidade(indice, total, u.andar, primeiro, cfg);
      caixa(sb, mats.clara); // laje
      const gc = caixa({ ...sb, y: sb.y + 0.6, h: 1.1, d: 0.08, z: sb.z + sb.d / 2 - 0.04 }, sac, false); // guarda-corpo de vidro
      gc.userData.id = u.id; blocos.push(gc);
      [-1, 1].forEach(l => { // guarda-corpo das pontas da sacada
        const lado = caixa({ x: sb.x + l * (sb.w / 2 - 0.04), y: sb.y + 0.6, z: sb.z, w: 0.08, h: 1.1, d: sb.d }, sac, false);
        lado.userData.id = u.id; blocos.push(lado);
      });
      const vidro = semSituacao ? VIDRO.clone() : u.apagada ? new THREE.Color("#5b6470") : VIDRO.clone().lerp(cor, 0.5);
      janelasDaUnidade(indice, total, u.andar, primeiro, cfg).forEach(j => janelas.push({ j, id: u.id, cor: j.aberta ? new THREE.Color("#3a3f45") : vidro }));
    });

    // Janelas: vidro (cor da situação, escurecida) e moldura clara, instanciados.
    const gJanela = new THREE.BoxGeometry(1, 1, 1);
    const matVidroJ = new THREE.MeshStandardMaterial({ roughness: 0.12, metalness: 0.35 });
    descarte.push(gJanela, matVidroJ);
    const vidros = new THREE.InstancedMesh(gJanela, matVidroJ, janelas.length);
    const molduras = new THREE.InstancedMesh(gJanela, mats.clara, janelas.length);
    const idDaJanela: string[] = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eixoY = new THREE.Vector3(0, 1, 0);
    janelas.forEach(({ j, id, cor }, k) => {
      const lateral = j.face === "esquerda" || j.face === "direita";
      const sinal = j.face === "frente" || j.face === "direita" ? 1 : -1;
      q.setFromAxisAngle(eixoY, lateral ? Math.PI / 2 : 0);
      const fora = (d: number) => lateral ? new THREE.Vector3(j.x + sinal * d, j.y, j.z) : new THREE.Vector3(j.x, j.y, j.z + sinal * d);
      m4.compose(fora(0.08), q, new THREE.Vector3(j.w, j.h, 0.06)); vidros.setMatrixAt(k, m4); vidros.setColorAt(k, cor);
      m4.compose(fora(0.04), q, new THREE.Vector3(j.w + 0.24, j.h + 0.24, 0.1)); molduras.setMatrixAt(k, m4);
      idDaJanela.push(id);
    });
    vidros.userData.ids = idDaJanela;
    const corVidro = janelas.map(j => j.cor);
    grupo.add(vidros, molduras); blocos.push(vidros);

    // Lajes (frisos) entre pavimentos; a cada 10 andares uma cinta mais forte.
    for (let a = primeiro; a <= ultimo + 1; a++) {
      const forte = a === primeiro || (a - primeiro) % 10 === 0;
      caixa({ x: 0, y: cotaDoAndar(a, primeiro, cfg), z: 0, w: L + (forte ? 1 : 0.5), h: forte ? 0.6 : 0.3, d: P + (forte ? 1 : 0.5) }, forte ? mats.clara : mats.fachada);
    }
    // Pilastras de pastilha nas quinas, da base ao coroamento.
    [-1, 1].forEach(sx => [-1, 1].forEach(sz => caixa({ x: sx * (L / 2 - 0.45), y: (yTorre + topo + 1) / 2, z: sz * (P / 2 - 0.45), w: 1.3, h: topo + 1 - yTorre, d: 1.3 }, mats.mosaico)));
    // Divisória das sacadas no meio da frente (planta: parede entre os livings).
    if (cfg.janelasTipo) caixa({ x: 0, y: (hBase + topo) / 2, z: P / 2 + cfg.sacada / 2, w: 0.25, h: topo - hBase, d: cfg.sacada }, mats.fachada);
    // Núcleo de escada e elevadores saindo pelos fundos.
    if (cfg.nucleo) {
      const n = cfg.nucleo, zc = -P / 2 - n.fundo / 2 + 0.2;
      caixa({ x: 0, y: (yTorre + topo + 7) / 2, z: zc, w: n.largura, h: topo + 7 - yTorre, d: n.fundo + 0.4 }, mats.fachada);
      [-1, 1].forEach(sx => caixa({ x: sx * (n.largura / 2 - 0.3), y: (yTorre + topo + 7) / 2, z: zc - n.fundo / 2 + 0.1, w: 0.9, h: topo + 7 - yTorre, d: 0.9 }, mats.mosaico));
      caixa({ x: 0, y: topo + 7.4, z: zc, w: n.largura + 0.8, h: 0.8, d: n.fundo + 1.2 }, mats.clara);
    }
    // Coroamento (perspectiva da fachada, Edielson 24/10): cornija e platibanda
    // claras; no meio da frente, sobre a prumada das sacadas, a torre branca
    // com o logo da construtora na face da frente; de cada lado dela, um
    // telhado curvo escuro (abóbada com eixo frente-fundos) até a quina.
    caixa({ x: 0, y: topo + 0.6, z: 0, w: L + 1.6, h: 1.2, d: P + 1.6 }, mats.clara);
    caixa({ x: 0, y: topo + 2.4, z: 0, w: L + 0.4, h: 2.4, d: P + 0.4 }, mats.fachada);
    [-1, 1].forEach(sx => caixa({ x: sx * (L / 2 - 1.5), y: topo + 2.4, z: P / 2 + 0.25, w: 2.4, h: 2.4, d: 0.2 }, mats.mosaico));
    caixa({ x: 0, y: topo + 3.9, z: 0, w: L + 1.2, h: 0.6, d: P + 1.2 }, mats.clara);
    const yTelha = topo + 4.2;
    // Torre central: largura da prumada das sacadas, da frente das sacadas até
    // o meio do prédio, subindo ~2 pavimentos acima da platibanda.
    const wTorre = (cfg.larguraSacada ?? 7) + 1.6, dTorre = P / 2 + cfg.sacada + 1.5, zTorre = P / 2 + cfg.sacada - dTorre / 2;
    const yTopoTorre = yTelha + 8.6;
    caixa({ x: 0, y: (topo + yTopoTorre) / 2, z: zTorre, w: wTorre, h: yTopoTorre - topo, d: dTorre }, mats.clara);
    caixa({ x: 0, y: yTelha - 0.4, z: zTorre, w: wTorre + 2.2, h: 1.1, d: dTorre + 2.2 }, mats.clara);   // entablamento do frontão
    caixa({ x: 0, y: yTopoTorre + 0.25, z: zTorre, w: wTorre + 1.0, h: 0.5, d: dTorre + 1.0 }, mats.clara); // cornija de cima
    const texLogo = new THREE.TextureLoader().load("/logo-icon.jpg"); texLogo.colorSpace = THREE.SRGBColorSpace; descarte.push(texLogo);
    const matLogo = new THREE.MeshStandardMaterial({ map: texLogo, roughness: 0.6 }); descarte.push(matLogo);
    const gLogo = new THREE.PlaneGeometry(wTorre * 0.56, wTorre * 0.56 * 1.6); descarte.push(gLogo);
    const logo = new THREE.Mesh(gLogo, matLogo);
    logo.position.set(0, yTopoTorre - wTorre * 0.56 * 0.8 - 1.0, zTorre + dTorre / 2 + 0.03);
    grupo.add(logo);
    // Abóbadas: meia-cana (raio 1) deitada com o eixo em z; escala = meia
    // largura × altura da curva × comprimento.
    const gAbobada = new THREE.CylinderGeometry(1, 1, 1, 32, 1, false, 0, Math.PI);
    gAbobada.rotateZ(Math.PI / 2); gAbobada.rotateY(Math.PI / 2); descarte.push(gAbobada);
    [-1, 1].forEach(sx => {
      const x0 = wTorre / 2 - 0.2, x1 = L / 2 + 0.3, wv = x1 - x0;
      const a = new THREE.Mesh(gAbobada, mats.telha);
      a.scale.set(wv / 2, 4.2, P + 0.6); a.position.set(sx * (x0 + wv / 2), yTelha, 0);
      a.castShadow = true; a.receiveShadow = true; grupo.add(a);
    });

    // Interação: passar o mouse acende, clicar seleciona.
    const ray = new THREE.Raycaster();
    const ponteiro = new THREE.Vector2();
    let sobre: string | null = null;
    let marcada: string | null = null;
    let filtroSit = new Set<string>();
    const sitDe = new Map(layout.itens.map(i => [i.u.id, i.u.situacao]));
    const fora = (id: string) => id !== marcada && ((filtroSit.size > 0 && !filtroSit.has(sitDe.get(id) || "")) || !!marcada);
    // Seleção (Edielson, 23/10: "tenho que saber qual é a unidade que eu
    // cliquei"): a unidade fica na cor cheia, com moldura que pulsa e etiqueta
    // com o número; as demais esmaecem para o tom da fachada.
    const CINZA = FACHADA.clone(), cinzaVidro = new THREE.Color("#8b97a3"), tmp = new THREE.Color();
    const pintar = () => {
      matsUnidade.forEach((m, id) => {
        const apaga = fora(id);
        m.corpo.color.copy(m.corBase); if (apaga) m.corpo.color.lerp(CINZA, 0.8);
        m.sacada.color.copy(m.sacBase); if (apaga) m.sacada.color.lerp(CINZA, 0.8);
        m.sacada.opacity = apaga ? 0.35 : m.opBase;
        const on = id === sobre || id === marcada;
        m.corpo.emissive.set(on ? (id === marcada ? "#ffffff" : "#94a3b8") : "#000000");
        m.corpo.emissiveIntensity = id === marcada ? 0.25 : 0.25;
      });
      idDaJanela.forEach((id, k) => {
        tmp.copy(corVidro[k]); if (id && fora(id)) tmp.lerp(cinzaVidro, 0.75);
        vidros.setColorAt(k, tmp);
      });
      if (vidros.instanceColor) vidros.instanceColor.needsUpdate = true;
      const b = marcada ? caixaDe.get(marcada) : undefined;
      moldura.visible = !!b;
      if (b) { moldura.position.set(b.x, b.y, b.z); moldura.scale.set(b.w + 0.5, b.h + 0.3, b.d + 0.5 + cfg.sacada); moldura.position.z += cfg.sacada / 2; }
    };
    // Moldura da unidade selecionada (arestas de uma caixa, pulsando no laço).
    const gMoldura = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    const matMoldura = new THREE.LineBasicMaterial({ color: "#facc15", transparent: true, depthTest: false });
    const moldura = new THREE.LineSegments(gMoldura, matMoldura);
    moldura.visible = false; moldura.renderOrder = 10; scene.add(moldura);
    descarte.push(gMoldura, matMoldura);
    const achar = (ev: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ponteiro.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ponteiro, camera);
      const hit = ray.intersectObjects(blocos, false)[0];
      if (!hit) return null;
      if (hit.instanceId !== undefined && hit.object.userData.ids) return (hit.object.userData.ids as string[])[hit.instanceId] || null;
      return (hit.object.userData.id as string | undefined) || null;
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

    // Voo da câmera: desliza até o destino; qualquer arrasto do usuário cancela.
    let voo: { pos: THREE.Vector3; alvo: THREE.Vector3 } | null = null;
    const cancelarVoo = () => { voo = null; };
    controls.addEventListener("start", cancelarVoo);
    api.current = {
      resetar: () => { voo = { pos: posInicial.clone(), alvo: alvo.clone() }; },
      focar: id => {
        const f = focos.get(id); if (!f) return;
        controls.autoRotate = false;
        // De frente e um pouco de lado, a ~45 m: o andar e os vizinhos de cima e de baixo.
        voo = { pos: new THREE.Vector3(f.x * 0.6 + (f.x <= 0 ? -16 : 16), f.y + 8, f.z + 44), alvo: f.clone() };
      },
      girar: v => { controls.autoRotate = v; },
      marcar: id => { marcada = id; pintar(); },
      filtrar: sits => { filtroSit = new Set(sits); pintar(); },
    };

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    });
    ro.observe(el);
    let quadro = 0;
    const laco = () => {
      quadro = requestAnimationFrame(laco);
      if (voo) {
        camera.position.lerp(voo.pos, 0.08); controls.target.lerp(voo.alvo, 0.08);
        if (camera.position.distanceTo(voo.pos) < 0.3 && controls.target.distanceTo(voo.alvo) < 0.3) voo = null;
      }
      controls.update(); renderer.render(scene, camera);
      const bu = bussola.current;
      if (bu) {
        bu.style.display = norte ? "flex" : "none";
        if (norte) {
          // Ângulo do norte em relação ao "para frente" da câmera (o alto da tela).
          const fx = controls.target.x - camera.position.x, fz = controls.target.z - camera.position.z;
          const ang = Math.atan2(fx * norte.y - fz * norte.x, fx * norte.x + fz * norte.y);
          const g = (ang * 180) / Math.PI;
          (bu.firstElementChild as HTMLElement).style.transform = `rotate(${g}deg)`;
          // As letras giram com a rosa, mas ficam sempre de pé.
          bu.querySelectorAll("text").forEach(t => t.setAttribute("transform", `rotate(${-g} ${t.getAttribute("x")} ${t.getAttribute("y")})`));
        }
      }
      if (moldura.visible) matMoldura.opacity = 0.55 + 0.45 * Math.sin(performance.now() / 260);
      const et = etiqueta.current, b = marcada ? caixaDe.get(marcada) : undefined;
      if (et) {
        if (!b) { et.style.display = "none"; return; }
        // Ponto acima da sacada, na frente da unidade.
        pEt.set(b.x, b.y + b.h / 2 + 0.4, b.z + b.d / 2 + cfg.sacada).project(camera);
        if (pEt.z > 1) { et.style.display = "none"; return; }
        et.style.display = "block";
        et.style.transform = `translate(${(pEt.x + 1) / 2 * el.clientWidth}px, ${(1 - pEt.y) / 2 * el.clientHeight}px)`;
      }
    };
    const pEt = new THREE.Vector3();
    laco();
    (window as unknown as { __torre3d?: unknown }).__torre3d = { renderer, scene, camera, controls };

    return () => {
      vivo = false; entorno?.dispose();
      cancelAnimationFrame(quadro);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointermove", mover);
      renderer.domElement.removeEventListener("pointerdown", baixar);
      renderer.domElement.removeEventListener("pointerup", soltar);
      controls.removeEventListener("start", cancelarVoo);
      controls.dispose();
      descarte.forEach(d => d.dispose());
      renderer.dispose();
      el.removeChild(renderer.domElement);
      api.current = null;
    };
  }, [layout, cfg, escuro]);

  useEffect(() => { api.current?.girar(girando); }, [girando, layout, escuro]);
  useEffect(() => { api.current?.marcar(selecionada); if (selecionada) setGirando(false); }, [selecionada, layout, escuro]);
  useEffect(() => { api.current?.filtrar(filtro); }, [filtro, layout, escuro]);

  const sel = selecionada ? porId.get(selecionada) : undefined;
  const contagem = SITUACOES.map(s => ({ ...s, n: unidades.filter(u => !u.apagada && u.situacao === s.nome).length })).filter(s => s.n > 0);
  // Espelho por pavimento (do último andar para baixo), na ordem da frente.
  const espelho = useMemo(() => {
    const porAndar = new Map<number, (typeof layout.itens)[number][]>();
    layout.itens.forEach(i => { if (!i.u.id) return; if (!porAndar.has(i.u.andar)) porAndar.set(i.u.andar, []); porAndar.get(i.u.andar)!.push(i); });
    return Array.from(porAndar.entries()).sort((a, b) => b[0] - a[0]).map(([andar, lista]) => ({ andar, lista: lista.sort((a, b) => a.indice - b.indice) }));
  }, [layout]);
  const irPara = (id: string) => { setSelecionada(id); api.current?.focar(id); };

  if (layout.itens.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-10">Nenhum apartamento com andar no nome (ex.: AP1201) para montar a maquete.</p>;
  }

  const botao = "h-8 inline-flex items-center justify-center gap-1.5 rounded-lg border shadow-sm bg-white/90 border-slate-200 text-slate-600 hover:text-slate-900 dark:bg-slate-900/85 dark:border-slate-700 dark:text-slate-300 dark:hover:text-white";
  return (
    <div ref={caixa} className={`${cheiaFixa ? "fixed inset-0 z-[100] rounded-none" : cheia ? "h-full w-full" : "relative w-full h-[640px] rounded-xl border border-slate-200/60 dark:border-slate-700/60"} relative overflow-hidden ${cheia ? "bg-slate-100 dark:bg-slate-950" : ""}`}>
      <div ref={host} className="absolute inset-0" />
      {/* Etiqueta da unidade selecionada, presa ao prédio (posição no laço do 3D) */}
      <div ref={etiqueta} className="pointer-events-none absolute left-0 top-0 z-10 hidden">
        {sel && (
          <div className="-translate-x-1/2 -translate-y-full flex flex-col items-center">
            <div className="flex items-center gap-1.5 rounded-md bg-slate-900/90 px-2.5 py-1 text-white shadow-lg ring-2 ring-yellow-400">
              <span className="h-2 w-2 rounded-full" style={{ background: COR_SITUACAO[sel.u.situacao] || "#f59e0b" }} />
              <span className="text-sm font-black tracking-tight">{sel.u.unit.replace(/^AP\s*/i, "")}</span>
              <span className="text-[10px] font-semibold text-slate-300">{sel.u.andar}º andar</span>
            </div>
            <div className="h-5 w-0.5 bg-yellow-400" />
          </div>
        )}
      </div>
      {/* Painel: legenda + espelho por pavimento (clique leva a câmera até a unidade) */}
      <div className="absolute left-3 top-3 bottom-3 flex w-[224px] max-w-[calc(100%-1.5rem)] flex-col pointer-events-none">
        <div className="pointer-events-auto flex max-h-full min-h-0 flex-col rounded-lg bg-white/90 dark:bg-slate-900/85 shadow-sm px-3 py-2 text-[11px]">
          <p className="font-bold text-slate-700 dark:text-slate-200">{cfg.nome === "padrão" ? empreendimento : cfg.nome}</p>
          <div className="mt-1 space-y-1">
            {contagem.map(s => {
              const on = filtro.length === 0 || filtro.includes(s.nome);
              return (
                <button key={s.nome} type="button" onClick={() => alternarFiltro(s.nome)} title={`Mostrar só ${s.nome} (clique de novo para tirar)`}
                  className={`flex w-full items-center gap-1.5 rounded px-1 -mx-1 py-0.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${on ? "" : "opacity-40"}`}>
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.cor }} />
                  <span className="flex-1 text-slate-600 dark:text-slate-300">{s.nome}: <strong>{s.n}</strong></span>
                  {filtro.includes(s.nome) && <span className="text-[9px] font-bold uppercase text-slate-400">filtro</span>}
                </button>
              );
            })}
            {filtro.length > 0 && (
              <button type="button" onClick={() => setFiltro([])} className="text-[10px] font-semibold text-sky-600 hover:underline dark:text-sky-400">Mostrar todas</button>
            )}
          </div>
          <button type="button" onClick={() => setEspelhoAberto(v => !v)} className="mt-2 flex w-full items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-800 dark:hover:text-white">
            <span className="inline-flex items-center gap-1.5"><Layers className="h-3 w-3" />Espelho por pavimento</span>
            <ChevronUp className={`h-3.5 w-3.5 transition-transform ${espelhoAberto ? "" : "rotate-180"}`} />
          </button>
          {espelhoAberto && (
            <div className="mt-1.5 min-h-0 flex-1 overflow-auto pr-1 space-y-[2px]">
              {espelho.map(({ andar, lista }) => (
                <div key={andar} className="flex items-center gap-1">
                  <span className="w-5 text-right text-[10px] font-bold tabular-nums text-slate-400">{andar}</span>
                  <div className="flex flex-1 gap-[3px]">
                    {lista.map(({ u }) => {
                      const ativo = u.id === selecionada;
                      return (
                        <button key={u.id} type="button" onClick={() => irPara(u.id)} title={`${u.unit} · ${u.situacao}`}
                          className={`flex-1 h-[20px] rounded-[4px] text-[10px] font-bold tabular-nums text-white transition-transform hover:-translate-y-px ${ativo ? "ring-2 ring-offset-1 ring-slate-900 dark:ring-white dark:ring-offset-slate-900" : ""} ${u.apagada || (filtro.length > 0 && !filtro.includes(u.situacao)) ? "opacity-30" : ""}`}
                          style={{ background: COR_SITUACAO[u.situacao] || "#f59e0b" }}>
                          {u.unit.replace(/^AP/i, "")}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-slate-400 pt-1.5">{cfg.cotaRef ? "Pelo projeto: planta tipo, cortes e garagens" : cfg.janelasTipo ? "Torre pela planta tipo · base e lazer estimados" : "Estudo de massa: medidas estimadas"}</p>
        </div>
      </div>
      {cfg.local && (
        <div className={`pointer-events-none absolute bottom-3 left-[248px] right-3 flex ${sel ? "justify-start" : "justify-center"} max-md:hidden`}>
          <AndamentoObraCard chave={cfg.local.chave} />
        </div>
      )}
      <div ref={bussola} style={{ display: "none" }} title="Norte" className="pointer-events-none absolute top-14 right-3 h-16 w-16 items-center justify-center rounded-full bg-white/85 dark:bg-slate-900/80 shadow ring-1 ring-slate-200 dark:ring-slate-700">
        <svg viewBox="-32 -32 64 64" className="h-full w-full">
          <path d="M0 -21 L5 0 L0 -3 L-5 0 Z" fill="#dc2626" />
          <path d="M0 21 L5 0 L0 3 L-5 0 Z" fill="#94a3b8" />
          <g fontSize="9" fontWeight="700" textAnchor="middle" dominantBaseline="central" fontFamily="Inter, system-ui, sans-serif">
            <text x="0" y="-26" fill="#dc2626">N</text>
            <text x="0" y="26" className="fill-slate-600 dark:fill-slate-300">S</text>
            <text x="26" y="0" className="fill-slate-600 dark:fill-slate-300">L</text>
            <text x="-26" y="0" className="fill-slate-600 dark:fill-slate-300">O</text>
          </g>
        </svg>
      </div>
      {(fonteMapa || avisoMapa) && <span className="pointer-events-none absolute top-1.5 left-1/2 -translate-x-1/2 text-[10px] text-slate-500/80">{avisoMapa || fonteMapa}</span>}
      {/* Controles */}
      <div className="absolute right-3 top-3 flex gap-1.5">
        <button type="button" onClick={() => setGirando(g => !g)} title={girando ? "Parar de girar" : "Girar"} className={`${botao} w-8 ${girando ? "!bg-blue-50 !border-blue-200 !text-blue-700" : ""}`}>
          <RotateCw className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => { setSelecionada(null); api.current?.resetar(); }} title="Voltar à vista inicial" className={`${botao} w-8`}>
          <Home className="h-4 w-4" />
        </button>
        {musica && (
          <input type="range" min={0.05} max={1} step={0.05} value={volume} onChange={e => mudarVolume(Number(e.target.value))} aria-label="Volume da música" title={`Volume ${Math.round(volume * 100)}%`}
            className="h-8 w-20 cursor-pointer accent-blue-600" />
        )}
        <button type="button" onClick={alternarMusica} title={musica ? `Tocando a ${Math.round(volume * 100)}% · clique para silenciar` : "Música de fundo (Elegant Piano, leberch · Pixabay)"} className={`${botao} w-8 ${musica ? "!bg-blue-50 !border-blue-200 !text-blue-700" : ""}`}>
          {musica ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
        <button type="button" onClick={alternarTelaCheia} title={cheia ? "Sair da tela cheia (Esc)" : "Tela cheia"} className={`${botao} px-2.5 text-xs font-semibold`}>
          {cheia ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}{cheia ? "Sair" : "Tela cheia"}
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
            {mostrarValores && sel.u.preco > 0 && <div className="flex justify-between"><dt className="text-slate-500">Preço de tabela</dt><dd className="font-semibold tabular-nums">{formatCurrency(sel.u.preco)}</dd></div>}
          </dl>
          {!temDono(sel.u.situacao) && (
            <button type="button" onClick={() => setCondicoesAbertas(true)} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">
              <Banknote className="h-3.5 w-3.5" /> Valor e condições
            </button>
          )}
          {plantaDaUnidade(cfg, sel.u.unit) && (
            <button type="button" onClick={() => setPlantaAberta(true)} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
              <LayoutGrid className="h-3.5 w-3.5" /> Ver planta
            </button>
          )}
          {onAbrirContrato && temContrato?.(sel.u.id) && (
            <button type="button" onClick={() => onAbrirContrato(sel.u.id, cheia ? caixa.current : null)} className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">
              Ver contrato
            </button>
          )}
        </div>
      )}
      {/* Valor e condições da unidade disponível: preço de tabela, condições do
          empreendimento (simuláveis; editores salvam o padrão) e fluxo de pagamento. */}
      {sel && !temDono(sel.u.situacao) && (
        <Dialog open={condicoesAbertas} onOpenChange={setCondicoesAbertas}>
          <DialogContent container={cheia ? caixa.current : undefined} className="max-h-[92vh] max-w-5xl gap-3 overflow-y-auto p-5 dark:bg-slate-900">
            <DialogTitle className="text-base">Apartamento {sel.u.unit} · {sel.u.andar}º andar · {empreendimento}</DialogTitle>
            <DialogDescription className="text-xs">Valor de tabela, condições de pagamento e fluxo. Os campos podem ser alterados para simular uma proposta.</DialogDescription>
            <CondicoesPagamentoModal chave={chaveDoEmpreendimento(cfg.local?.chave, empreendimento)} empreendimento={empreendimento} unidade={sel.u.unit} andar={sel.u.andar} posicao={descricaoDaPosicao(sel.indice, sel.total)} area={sel.u.area} preco={sel.u.preco} entregaConfig={cfg.entrega} condicoesConfig={cfg.condicoes} />
          </DialogContent>
        </Dialog>
      )}
      {/* Planta humanizada: abre dentro da área do 3D (não tira da tela cheia).
          Abas: Planta (imagem), Tour 3D (maquete da planta) e Fotos (banco, editável na tela). */}
      {sel && (() => {
        const pl = plantaDaUnidade(cfg, sel.u.unit);
        if (!pl) return null;
        const abas: { id: "planta" | "tour" | "fotos"; rotulo: string }[] = [{ id: "planta", rotulo: "Planta" }];
        if (pl.tour) abas.push({ id: "tour", rotulo: "Tour 3D" });
        if (cfg.local?.chave) abas.push({ id: "fotos", rotulo: "Fotos" });
        const aba = abas.some(a => a.id === abaPlanta) ? abaPlanta : "planta";
        return (
          <Dialog open={plantaAberta} onOpenChange={setPlantaAberta}>
            <DialogContent container={cheia ? caixa.current : undefined} className="max-w-5xl gap-3 p-5 dark:bg-slate-900">
              <DialogTitle className="text-base">Apartamento {sel.u.unit} · {sel.u.andar}º andar</DialogTitle>
              <DialogDescription className="text-xs">
                {pl.titulo}{sel.u.area > 0 ? ` · ${sel.u.area.toLocaleString("pt-BR")} m² privativos` : ""}{pl.espelhada ? " · espelhada (final " + sel.u.unit.slice(-2) + ")" : ""}
              </DialogDescription>
              {abas.length > 1 && (
                <div className="flex w-fit gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800" role="tablist">
                  {abas.map(a => (
                    <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} onClick={() => setAbaPlanta(a.id)}
                      className={`rounded-md px-3 py-1 text-xs font-semibold ${aba === a.id ? "bg-white text-slate-900 shadow dark:bg-slate-900 dark:text-white" : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"}`}>{a.rotulo}</button>
                  ))}
                </div>
              )}
              {aba === "planta" && (<>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pl.url} alt={pl.titulo} className="max-h-[72vh] w-full object-contain" style={pl.espelhada ? { transform: "scaleX(-1)" } : undefined} />
                {pl.nota && <p className="text-[11px] text-amber-700 dark:text-amber-300/80">{pl.nota}</p>}
              </>)}
              {aba === "tour" && pl.tour && <PlantaDollhouse imagem={pl.url} tour={pl.tour} espelhada={pl.espelhada} escuro={escuro} />}
              {aba === "fotos" && cfg.local?.chave && <PlantaFotos chave={cfg.local.chave} />}
              <p className="text-[10px] text-slate-500">Imagem ilustrativa. Móveis e decoração não fazem parte do imóvel.</p>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
