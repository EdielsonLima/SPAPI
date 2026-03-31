"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";

const EMPREENDIMENTOS = [
  { src: "/empreendimentos/Domus.jpeg", nome: "Domus", descricao: "Balneário Camboriú" },
  { src: "/empreendimentos/Serenity.jpeg", nome: "Serenity", descricao: "Balneário Camboriú" },
  { src: "/empreendimentos/Tesla.jpeg", nome: "Tesla Residencial", descricao: "Balneário Camboriú" },
  { src: "/empreendimentos/Hannover.jpeg", nome: "Residencial Hannover", descricao: "Balneário Camboriú" },
  { src: "/empreendimentos/Jardins.jpeg", nome: "Edifício 135 Jardins", descricao: "Balneário Camboriú" },
  { src: "/empreendimentos/Palacio.jpeg", nome: "Palácio Elizabeth", descricao: "Balneário Camboriú" },
  { src: "/empreendimentos/Capri.jpeg", nome: "Solar di Capri", descricao: "Balneário Camboriú" },
  { src: "/empreendimentos/Siena.jpeg", nome: "Solar di Siena", descricao: "Balneário Camboriú" },
];

function formatDateTime(date: Date): string {
  const days = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  const months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${days[date.getDay()]}, ${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [availableImages, setAvailableImages] = useState<typeof EMPREENDIMENTOS>([]);

  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Check which images exist
  useEffect(() => {
    const checkImages = async () => {
      const available: typeof EMPREENDIMENTOS = [];
      for (const emp of EMPREENDIMENTOS) {
        try {
          const res = await fetch(emp.src, { method: "HEAD" });
          if (res.ok) available.push(emp);
        } catch { /* skip */ }
      }
      // If no images found, show at least a placeholder
      if (available.length === 0) {
        setAvailableImages([{ src: "", nome: "Silva Packer", descricao: "Construtora e Incorporadora" }]);
      } else {
        setAvailableImages(available);
      }
    };
    checkImages();
  }, []);

  // Auto-rotate carousel
  useEffect(() => {
    if (availableImages.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % availableImages.length);
    }, 8000); // 8 seconds per slide
    return () => clearInterval(interval);
  }, [availableImages.length]);

  const userName = session?.user?.name?.split(" ")[0] || "Usuário";
  const fullName = session?.user?.name || "Usuário";
  const currentEmp = availableImages[currentSlide];

  return (
    <div className="relative h-[calc(100vh-4rem)] -m-4 md:-m-6 overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        {currentEmp?.src ? (
          <>
            {availableImages.map((emp, idx) => (
              <div
                key={emp.src}
                className={`absolute inset-0 transition-opacity duration-1000 ${idx === currentSlide ? "opacity-100" : "opacity-0"}`}
              >
                <Image
                  src={emp.src}
                  alt={emp.nome}
                  fill
                  className="object-cover"
                  priority={idx === 0}
                />
              </div>
            ))}
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900" />
        )}
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/50" />
      </div>

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col justify-end p-8 md:p-12">
        {/* Welcome text */}
        <div className="max-w-2xl">
          <p className="text-white/60 text-sm font-medium tracking-widest uppercase mb-2">
            {currentTime ? formatDateTime(currentTime) : "\u00A0"}
          </p>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-2">
            {getGreeting()}, <span className="text-indigo-300">{userName}</span>
          </h1>
          <p className="text-white/50 text-lg">
            {fullName} — {process.env.NEXT_PUBLIC_COMPANY_NAME || "Silva Packer"}
          </p>
        </div>

        {/* Enterprise info + Carousel dots */}
        <div className="flex items-end justify-between mt-8">
          {currentEmp && (
            <div>
              <p className="text-white/80 text-xl font-bold">{currentEmp.nome}</p>
              <p className="text-white/40 text-sm">{currentEmp.descricao}</p>
            </div>
          )}

          {availableImages.length > 1 && (
            <div className="flex items-center gap-2">
              {availableImages.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentSlide(idx)}
                  className={`transition-all duration-300 rounded-full ${
                    idx === currentSlide
                      ? "w-8 h-2 bg-white"
                      : "w-2 h-2 bg-white/40 hover:bg-white/60"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
