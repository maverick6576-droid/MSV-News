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
    <div className="flex min-h-[100dvh] flex-col justify-between bg-[#0B0F17] px-6 py-12 text-white">
      <div className="mx-auto w-full max-w-sm pt-10">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300 ring-1 ring-white/10">
          <span className="h-2 w-2 rounded-full bg-[#4285F4]" />
          MSV News
        </div>

        <h1 className="mt-5 text-3xl font-bold tracking-tight text-white">
          Inicia tu jornada de reparto
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Introduce tu nombre o vehículo para cargar tus zonas y rutas offline.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <input
            id="driver-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Carlos · Ruta 2"
            autoComplete="name"
            className="w-full rounded-2xl bg-[#141B29] px-4 py-4 text-base text-white placeholder-slate-500 ring-1 ring-white/10 focus:ring-2 focus:ring-[#4285F4] focus:outline-none"
          />

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1A73E8] py-4 text-base font-bold text-white shadow-lg shadow-blue-950/40 active:scale-[0.98]"
          >
            Continuar
            <ArrowRight className="h-5 w-5" />
          </button>
        </form>
      </div>

      <p className="mx-auto max-w-sm text-center text-xs text-slate-500">
        Funciona sin Wi-Fi ni datos una vez sincronizadas las zonas.
      </p>
    </div>
  );
}
