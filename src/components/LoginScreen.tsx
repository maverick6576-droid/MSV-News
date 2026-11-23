import { useState, type FormEvent } from 'react';
import { Newspaper, Truck } from 'lucide-react';

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
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-surface-950 px-6 py-10 text-white">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-surface-900 p-7 shadow-2xl">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500 text-surface-950 shadow-lg">
            <Newspaper className="h-9 w-9" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">MSV News</h1>
            <p className="text-sm text-slate-400">Reparto de periódicos · Modo Offline</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="driver-name" className="mb-2 block text-sm font-semibold text-slate-300">
              Nombre del conductor o ruta
            </label>
            <input
              id="driver-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Carlos · Furgoneta 2"
              autoComplete="name"
              className="w-full rounded-2xl border border-slate-700 bg-surface-950 px-4 py-4 text-lg text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-brand-500 py-4 text-lg font-extrabold text-surface-950 shadow-lg active:scale-[0.98]"
          >
            <Truck className="h-6 w-6" />
            Entrar a mis zonas
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Acceso local sin servidores ni cuotas. Tus datos y rutas se guardan en el dispositivo para funcionar sin Wi-Fi.
        </p>
      </div>
    </div>
  );
}
