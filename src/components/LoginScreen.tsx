import { useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (driverName: string) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [name, setName] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onLogin(name.trim() || 'Conductor');
  };

  return (
    <div className="flex min-h-[100dvh] flex-col justify-between bg-black px-6 py-10 text-white">
      <div className="mx-auto w-full max-w-sm pt-4">
        {/* Logo corporativo Missatgers Sant Valentí */}
        <div className="overflow-hidden rounded-2xl border border-[#D4AF37]/30 bg-black shadow-[0_8px_32px_rgba(212,175,55,0.12)]">
          <img
            src="./logo-msv.png"
            alt="Missatgers Sant Valentí"
            className="w-full h-auto object-contain"
          />
        </div>

        <h1 className="mt-7 text-2xl font-bold tracking-tight text-white">
          Inicia tu jornada de reparto
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">
          Introduce tu nombre o vehículo para cargar tus zonas y rutas offline.
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <input
            id="driver-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Carlos · Ruta 2"
            autoComplete="name"
            className="w-full rounded-2xl bg-[#111111] px-4 py-4 text-base text-white placeholder-neutral-500 ring-1 ring-[#D4AF37]/25 focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
          />

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#F3DC8B] via-[#D4AF37] to-[#B8860B] py-4 text-base font-extrabold text-black shadow-lg shadow-[#D4AF37]/15 active:scale-[0.98]"
          >
            Continuar
            <ArrowRight className="h-5 w-5" />
          </button>
        </form>
      </div>

      <p className="mx-auto max-w-sm text-center text-xs text-neutral-500">
        Missatgers Sant Valentí · Funciona 100% sin Wi-Fi
      </p>
    </div>
  );
}
