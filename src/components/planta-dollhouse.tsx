"use client";

// Tour "dollhouse" da planta humanizada: a imagem da planta é o piso, as
// paredes (extraídas da imagem por scripts/extrair-paredes-planta.py) sobem
// em 3D e a câmera voa até o ambiente escolhido. Abre dentro do diálogo
// "Ver planta" do Quadro Espelho 3D (torre-3d.tsx).

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { TourPlanta } from "@/lib/torre-3d";

interface Props {
  imagem: string;      // planta humanizada (textura do piso)
  tour: TourPlanta;    // paredes + ambientes
  espelhada: boolean;  // final espelhado: a maquete inteira é invertida em x
  escuro?: boolean;    // tema do painel
}

type Vista = { theta: number; phi: number; r: number; tx: number; tz: number };
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export default function PlantaDollhouse({ imagem, tour, espelhada, escuro = false }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const rotulos = useRef<(HTMLButtonElement | null)[]>([]);
  const api = useRef<{ selecionar(i: number): void; geral(): void; noite(v: boolean): void; parede(h: number): void; girar(v: boolean): void } | null>(null);
  const [sel, setSel] = useState(-1);
  const [noite, setNoite] = useState(false);
  const [girar, setGirar] = useState(true);
  const [parede, setParede] = useState(1.1);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let vivo = true;
    const descarte: { dispose(): void }[] = [];
    const aborta = new AbortController();
    let renderer: THREE.WebGLRenderer | null = null;

    (async () => {
      let paredes: { w: number; h: number; rects: number[][] };
      try {
        const r = await fetch(tour.paredes, { signal: aborta.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        paredes = await r.json();
      } catch (e) {
        if (vivo) setErro("Não consegui carregar as paredes da planta (" + (e instanceof Error ? e.message : "erro") + ").");
        return;
      }
      if (!vivo) return;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        setErro("O navegador não liberou o 3D (WebGL). Veja a planta na aba Planta.");
        return;
      }
      const celular = el.clientWidth < 768;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, celular ? 1.5 : 2));
      renderer.setSize(el.clientWidth, el.clientHeight, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab";
      el.appendChild(renderer.domElement);

      const PX = tour.pxPorMetro, W = paredes.w, H = paredes.h, FW = W / PX, FH = H / PX;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, el.clientWidth / el.clientHeight, 0.1, 200);
      const hemi = new THREE.HemisphereLight("#fff6ea", "#8a7b6a", 0.75);
      const sol = new THREE.DirectionalLight("#fff1dc", 1.35);
      sol.position.set(-9, 16, 10); sol.castShadow = true;
      sol.shadow.mapSize.set(celular ? 1024 : 2048, celular ? 1024 : 2048);
      Object.assign(sol.shadow.camera, { left: -14, right: 14, top: 12, bottom: -12, near: 1, far: 50 });
      sol.shadow.bias = -0.0006;
      scene.add(hemi, sol, sol.target);

      // Tudo que é a maquete fica no grupo: o espelho do final é scale.x = -1.
      const grupo = new THREE.Group();
      grupo.scale.x = espelhada ? -1 : 1;
      scene.add(grupo);
      const lado = THREE.DoubleSide; // com scale negativa a ordem das faces inverte

      // Luzes quentes por ambiente (modo noite).
      const luzes = new THREE.Group(); luzes.visible = false; grupo.add(luzes);
      const centro = (c: [number, number, number, number]) => ({ x: (c[0] + c[2]) / 2 / PX - FW / 2, z: (c[1] + c[3]) / 2 / PX - FH / 2 });
      tour.ambientes.forEach(a => { const { x, z } = centro(a.caixa); const p = new THREE.PointLight("#ffc27a", 1.8, 7, 2); p.position.set(x, 1.6, z); luzes.add(p); });

      // Base escura + piso com a planta.
      const base = new THREE.Mesh(new THREE.BoxGeometry(FW + 1.2, 0.35, FH + 1.2), new THREE.MeshStandardMaterial({ color: "#2b2622", roughness: 0.85, side: lado }));
      base.position.y = -0.19; base.receiveShadow = true; grupo.add(base);
      descarte.push(base.geometry, base.material as THREE.Material);
      const tex = await new Promise<THREE.Texture>((ok, falha) => new THREE.TextureLoader().load(imagem, ok, undefined, falha)).catch(() => null);
      if (!vivo) { renderer.dispose(); return; }
      if (!tex) { setErro("Não consegui carregar a imagem da planta."); renderer.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      descarte.push(tex);
      const matPiso = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: lado });
      const piso = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), matPiso);
      piso.rotation.x = -Math.PI / 2; piso.receiveShadow = true; grupo.add(piso);
      descarte.push(piso.geometry, matPiso);
      // Recorte do ambiente em destaque: a mesma textura, só o retângulo dele.
      const texDestaque = tex.clone(); texDestaque.needsUpdate = true; descarte.push(texDestaque);
      const matDestaque = new THREE.MeshStandardMaterial({ map: texDestaque, roughness: 0.95, transparent: true, opacity: 0, side: lado });
      const destaque = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), matDestaque);
      destaque.rotation.x = -Math.PI / 2; destaque.position.y = 0.012; destaque.receiveShadow = true; grupo.add(destaque);
      descarte.push(destaque.geometry, matDestaque);

      // Paredes: uma instância por retângulo; altura ajustável.
      const matParede = new THREE.MeshStandardMaterial({ color: "#f1ece3", roughness: 0.75, side: lado });
      const gParede = new THREE.BoxGeometry(1, 1, 1); gParede.translate(0, 0.5, 0);
      const paredesMesh = new THREE.InstancedMesh(gParede, matParede, paredes.rects.length);
      paredesMesh.castShadow = true; paredesMesh.receiveShadow = true; grupo.add(paredesMesh);
      descarte.push(gParede, matParede);
      let alturaParede = parede;
      const m4 = new THREE.Matrix4();
      const montarParedes = () => {
        paredes.rects.forEach(([x, y, w, h], i) => {
          m4.makeScale(w / PX + 0.01, alturaParede, h / PX + 0.01);
          m4.setPosition((x + w / 2) / PX - FW / 2, 0, (y + h / 2) / PX - FH / 2);
          paredesMesh.setMatrixAt(i, m4);
        });
        paredesMesh.instanceMatrix.needsUpdate = true; precisa = true;
      };
      // Vidro da varanda (esquadrias): faixas translúcidas onde a planta não tem parede.
      if (tour.vidros?.length) {
        const matVidro = new THREE.MeshStandardMaterial({ color: "#bcd5e6", transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.2, side: lado });
        descarte.push(matVidro);
        tour.vidros.forEach(([x, y, w, h]) => {
          const v = new THREE.Mesh(gParede, matVidro);
          v.scale.set(w / PX, 1.2, h / PX); v.position.set((x + w / 2) / PX - FW / 2, 0, (y + h / 2) / PX - FH / 2);
          grupo.add(v);
        });
      }

      // Câmera orbital própria (arrastar gira, roda/pinça aproxima) com voo suave.
      const vista: Vista = { theta: -0.6, phi: 0.95, r: FW * 1.2, tx: 0, tz: 0 };
      const alvo = new THREE.Vector3();
      let precisa = true, auto = girar, ultimoToque = 0, tween: { de: Vista; para: Vista; t0: number; ms: number } | null = null;
      const aplicar = () => {
        const { theta, phi, r, tx, tz } = vista;
        camera.position.set(tx + r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi), tz + r * Math.sin(phi) * Math.cos(theta));
        alvo.set(tx, 0, tz); camera.lookAt(alvo);
      };
      const voar = (para: Vista, ms = 1500) => { tween = { de: { ...vista }, para, t0: performance.now(), ms }; };
      const toque = () => { ultimoToque = performance.now(); };
      const dom = renderer.domElement;
      const ponteiros = new Map<number, PointerEvent>();
      let arrasto: { x: number; y: number; moveu: boolean; th: number; ph: number } | null = null, pinca: number | null = null;
      const ray = new THREE.Raycaster();
      const escolher = (ev: PointerEvent) => {
        const r = dom.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camera);
        const h = ray.intersectObject(piso);
        if (!h.length) return;
        const p = grupo.worldToLocal(h[0].point.clone());
        const px = (p.x + FW / 2) * PX, py = (p.z + FH / 2) * PX;
        const i = tour.ambientes.findIndex(a => px >= a.caixa[0] && px <= a.caixa[2] && py >= a.caixa[1] && py <= a.caixa[3]);
        if (i >= 0) selecionar(i);
      };
      const baixar = (e: PointerEvent) => { dom.setPointerCapture(e.pointerId); ponteiros.set(e.pointerId, e); arrasto = { x: e.clientX, y: e.clientY, moveu: false, th: vista.theta, ph: vista.phi }; dom.style.cursor = "grabbing"; };
      const mover = (e: PointerEvent) => {
        if (!ponteiros.has(e.pointerId)) return;
        ponteiros.set(e.pointerId, e);
        if (ponteiros.size === 2) {
          const [a, b] = [...ponteiros.values()];
          const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          if (pinca) { vista.r = THREE.MathUtils.clamp(vista.r * pinca / d, 4, FW * 2.2); tween = null; precisa = true; }
          pinca = d; toque(); return;
        }
        if (!arrasto) return;
        const dx = e.clientX - arrasto.x, dy = e.clientY - arrasto.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) arrasto.moveu = true;
        vista.theta = arrasto.th - dx * 0.006; vista.phi = THREE.MathUtils.clamp(arrasto.ph - dy * 0.005, 0.15, 1.35);
        tween = null; precisa = true; toque();
      };
      const soltar = (e: PointerEvent) => {
        ponteiros.delete(e.pointerId); if (ponteiros.size < 2) pinca = null;
        if (arrasto && !arrasto.moveu && ponteiros.size === 0) escolher(e);
        arrasto = null; dom.style.cursor = "grab";
      };
      const roda = (e: WheelEvent) => { e.preventDefault(); vista.r = THREE.MathUtils.clamp(vista.r * (1 + Math.sign(e.deltaY) * 0.08), 4, FW * 2.2); tween = null; precisa = true; toque(); };
      dom.addEventListener("pointerdown", baixar); dom.addEventListener("pointermove", mover);
      dom.addEventListener("pointerup", soltar); dom.addEventListener("pointercancel", soltar);
      dom.addEventListener("wheel", roda, { passive: false });

      let selecionado = -1;
      const selecionar = (i: number) => {
        selecionado = i; toque();
        const [x0, y0, x1, y1] = tour.ambientes[i].caixa;
        const { x, z } = centro(tour.ambientes[i].caixa), w = (x1 - x0) / PX, d = (y1 - y0) / PX;
        destaque.scale.set(w, d, 1); destaque.position.x = x; destaque.position.z = z;
        texDestaque.repeat.set((x1 - x0) / W, (y1 - y0) / H); texDestaque.offset.set(x0 / W, 1 - y1 / H);
        matPiso.color.setScalar(0.42); matDestaque.opacity = 1;
        voar({ theta: vista.theta, phi: 0.62, r: THREE.MathUtils.clamp(Math.max(w, d) * 2.1, 5, 20), tx: x * grupo.scale.x, tz: z });
        auto = false; setSel(i); setGirar(false); precisa = true;
      };
      const geral = () => {
        selecionado = -1; matPiso.color.setScalar(1); matDestaque.opacity = 0;
        voar({ theta: -0.6, phi: 0.95, r: FW * 1.2, tx: 0, tz: 0 }); auto = true; setSel(-1); setGirar(true); precisa = true;
      };
      api.current = {
        selecionar, geral,
        noite: v => { luzes.visible = v; hemi.intensity = v ? 0.05 : 0.75; sol.intensity = v ? 0.06 : 1.35; sol.color.set(v ? "#9fb4e6" : "#fff1dc"); renderer!.toneMappingExposure = v ? 0.8 : 1; precisa = true; },
        parede: h => { alturaParede = h; montarParedes(); },
        girar: v => { auto = v; precisa = true; },
      };
      montarParedes();

      // Rótulos em HTML projetados sobre o centro de cada ambiente.
      const v3 = new THREE.Vector3();
      const posicionarRotulos = () => {
        const r = dom.getBoundingClientRect();
        tour.ambientes.forEach((a, i) => {
          const b = rotulos.current[i]; if (!b) return;
          const { x, z } = centro(a.caixa);
          grupo.localToWorld(v3.set(x, alturaParede + 0.3, z)).project(camera);
          b.style.left = ((v3.x + 1) / 2 * r.width) + "px"; b.style.top = ((1 - v3.y) / 2 * r.height) + "px";
          b.style.display = v3.z < 1 ? "" : "none";
          const pequeno = !!a.menor && selecionado < 0 && vista.r > FW * 0.9;
          b.style.opacity = pequeno ? "0" : selecionado >= 0 && selecionado !== i ? "0.25" : "1";
          b.style.pointerEvents = pequeno ? "none" : "";
        });
      };

      const obs = new ResizeObserver(() => {
        if (!renderer) return;
        renderer.setSize(el.clientWidth, el.clientHeight, false);
        camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); precisa = true;
      });
      obs.observe(el);
      descarte.push({ dispose: () => obs.disconnect() });

      let ultimo = performance.now(), raf = 0;
      const laco = (t: number) => {
        raf = requestAnimationFrame(laco);
        const dt = Math.min(0.05, (t - ultimo) / 1000); ultimo = t;
        if (tween) {
          const k = Math.min(1, (t - tween.t0) / tween.ms), e = easeIO(k);
          (["theta", "phi", "r", "tx", "tz"] as const).forEach(c => { vista[c] = tween!.de[c] + (tween!.para[c] - tween!.de[c]) * e; });
          if (k >= 1) tween = null; precisa = true;
        } else if (auto && t - ultimoToque > 2500) { vista.theta += dt * 0.08; precisa = true; }
        if (precisa) { aplicar(); renderer!.render(scene, camera); posicionarRotulos(); precisa = false; }
      };
      raf = requestAnimationFrame(laco);
      setPronto(true);
      descarte.push({ dispose: () => {
        cancelAnimationFrame(raf);
        dom.removeEventListener("pointerdown", baixar); dom.removeEventListener("pointermove", mover);
        dom.removeEventListener("pointerup", soltar); dom.removeEventListener("pointercancel", soltar);
        dom.removeEventListener("wheel", roda);
        luzes.children.forEach(l => (l as THREE.PointLight).dispose());
        renderer!.dispose(); renderer!.forceContextLoss(); dom.remove();
      } });
    })();

    return () => {
      vivo = false; aborta.abort(); api.current = null;
      descarte.forEach(d => d.dispose());
      setPronto(false);
    };
    // A cena é montada uma vez por planta/espelho; os controles falam com ela pela api.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagem, tour, espelhada]);

  const btn = "rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800";
  const btnOn = "rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-slate-900";
  return (
    <div className="flex flex-col gap-2 md:flex-row">
      <div ref={host} className={`relative h-[52vh] min-h-[280px] flex-1 overflow-hidden rounded-xl md:h-[62vh] ${escuro ? "bg-[#17150f]" : "bg-[#ece7df]"}`}
        style={{ backgroundImage: escuro ? "radial-gradient(120% 90% at 50% 10%, #1b1813, #0d0c09)" : "radial-gradient(120% 90% at 50% 10%, #efe9df, #d9d1c4)" }}>
        {tour.ambientes.map((a, i) => (
          <button key={a.nome} type="button" ref={e => { rotulos.current[i] = e; }} onClick={() => api.current?.selecionar(i)}
            className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-semibold shadow transition-opacity ${sel === i ? "border-transparent bg-amber-600 text-white" : "border-black/10 bg-white/85 text-slate-800 dark:border-white/15 dark:bg-slate-900/85 dark:text-slate-100"}`}
            style={{ display: "none" }}>{a.nome}</button>
        ))}
        {!pronto && !erro && <div className="absolute inset-0 z-10 flex items-center justify-center text-xs text-slate-500">Montando a maquete da planta…</div>}
        {erro && <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center text-xs text-amber-700 dark:text-amber-300">{erro}</div>}
        {pronto && sel < 0 && <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-[10px] text-white">Arraste para girar · role para aproximar · clique num ambiente</div>}
      </div>
      <div className="flex shrink-0 flex-col gap-2 md:w-52">
        <div className="flex flex-wrap gap-1.5 md:flex-col">
          {tour.ambientes.map((a, i) => (
            <button key={a.nome} type="button" onClick={() => api.current?.selecionar(i)} className={`${sel === i ? btnOn : btn} text-left md:w-full`}>{a.nome}</button>
          ))}
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-2 dark:border-slate-700">
          <button type="button" onClick={() => api.current?.geral()} className={btn}>Visão geral</button>
          <button type="button" onClick={() => { const v = !noite; setNoite(v); api.current?.noite(v); }} className={noite ? btnOn : btn}>Noite</button>
          <button type="button" onClick={() => { const v = !girar; setGirar(v); api.current?.girar(v); }} className={girar ? btnOn : btn}>Girar</button>
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">Parede
            <input type="range" min={0.4} max={2.8} step={0.1} value={parede} onChange={e => { const h = Number(e.target.value); setParede(h); api.current?.parede(h); }} className="w-24 accent-amber-600" aria-label="Altura das paredes" />
          </label>
        </div>
      </div>
    </div>
  );
}
