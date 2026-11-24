import { useState } from 'react';
import {
  CheckCircle2,
  Flag,
  Layers,
  RefreshCw,
  RotateCcw,
  Sheet,
  Volume2,
  X,
} from 'lucide-react';
import { isSpeechSupported } from '../services/tts';
import type { AppSettings } from '../types';

interface SettingsModalProps {
  settings: AppSettings;
  hasActiveZone: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  onClose: () => void;
  onUpdateSettings: (next: AppSettings) => void;
  onSyncNow: (overrideSettings?: AppSettings) => void;
  onBackToZones?: () => void;
  onFinishRoute?: () => void;
  onRestartRoute?: () => void;
}

export function SettingsModal({
  settings,
  hasActiveZone,
  isOnline,
  isSyncing,
  onClose,
  onUpdateSettings,
  onSyncNow,
  onBackToZones,
  onFinishRoute,
  onRestartRoute,
}: SettingsModalProps) {
  const [draft, setDraft] = useState<AppSettings>(settings);

  const handleSaveAndSync = () => {
    onUpdateSettings(draft);
    onSyncNow(draft);
    onClose();
  };

  const handleSaveOnly = () => {
    onUpdateSettings(draft);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center">
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-[#0B0B0B] text-white shadow-2xl ring-1 ring-[#D4AF37]/30 sm:rounded-[28px]">
        {/* Tirador móvil */}
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-[#D4AF37]/40 sm:hidden" />

        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-white">Ajustes y control</h2>
            <p className="text-xs text-neutral-400">MSV News · Configuración local</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#181818] text-neutral-300 ring-1 ring-white/10 active:scale-95"
            aria-label="Cerrar ajustes"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Contenido con scroll */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Acciones de ruta activa */}
          {hasActiveZone && (
            <section className="space-y-2.5">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#E5C158]">
                Control de la ruta actual
              </h3>
              <div className="grid grid-cols-1 gap-2">
                {onBackToZones && (
                  <button
                    type="button"
                    onClick={() => {
                      onBackToZones();
                      onClose();
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl bg-[#141414] px-4 py-3.5 text-left text-sm font-bold text-white ring-1 ring-white/10 active:scale-[0.98]"
                  >
                    <Layers className="h-5 w-5 text-[#E5C158]" />
                    Volver a mis zonas (reinicia esta ruta)
                  </button>
                )}
                {onRestartRoute && (
                  <button
                    type="button"
                    onClick={() => {
                      onRestartRoute();
                      onClose();
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl bg-[#141414] px-4 py-3.5 text-left text-sm font-bold text-[#F3DC8B] ring-1 ring-[#D4AF37]/30 active:scale-[0.98]"
                  >
                    <RotateCcw className="h-5 w-5" />
                    Reiniciar ruta desde parada 1
                  </button>
                )}
                {onFinishRoute && (
                  <button
                    type="button"
                    onClick={() => {
                      onFinishRoute();
                      onClose();
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl bg-emerald-500/15 px-4 py-3.5 text-left text-sm font-bold text-emerald-300 ring-1 ring-emerald-500/35 active:scale-[0.98]"
                  >
                    <Flag className="h-5 w-5" />
                    Finalizar ruta ahora
                  </button>
                )}
              </div>
            </section>
          )}

          {/* Ajustes de voz */}
          <section className="space-y-4 rounded-2xl bg-[#121212] p-4 ring-1 ring-white/10">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Volume2 className="h-4 w-4 text-[#E5C158]" />
              Lectura en voz alta (es-ES)
            </div>

            {!isSpeechSupported() && (
              <p className="text-xs text-amber-400">
                Este dispositivo no soporta síntesis de voz.
              </p>
            )}

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-neutral-100">Auto-lectura al cambiar</p>
                <p className="text-xs text-neutral-400">Lee al pulsar Siguiente o Volver</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={draft.voice.autoSpeak}
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    voice: { ...prev.voice, autoSpeak: !prev.voice.autoSpeak },
                  }))
                }
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                  draft.voice.autoSpeak ? 'bg-[#D4AF37]' : 'bg-neutral-700'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-black transition-transform ${
                    draft.voice.autoSpeak ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-neutral-400">Velocidad de voz</span>
                <span className="font-bold text-[#F3DC8B] tabular-nums">
                  {draft.voice.rate.toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min="0.7"
                max="1.4"
                step="0.1"
                value={draft.voice.rate}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    voice: { ...prev.voice, rate: parseFloat(e.target.value) },
                  }))
                }
                className="w-full accent-[#D4AF37]"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-neutral-400">Volumen</span>
                <span className="font-bold text-[#F3DC8B] tabular-nums">
                  {Math.round(draft.voice.volume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={draft.voice.volume}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    voice: { ...prev.voice, volume: parseFloat(e.target.value) },
                  }))
                }
                className="w-full accent-[#D4AF37]"
              />
            </div>
          </section>

          {/* Base de datos fija Google Sheets */}
          <section className="space-y-3.5 rounded-2xl bg-[#121212] p-4 ring-1 ring-white/10">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Sheet className="h-4 w-4 text-emerald-400" />
                Base de datos Google Sheets
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Vinculada
              </span>
            </div>

            <p className="text-xs leading-relaxed text-neutral-400">
              Todas las pestañas de la Google Sheet corporativa se leen y separan automáticamente en
              zonas de reparto al sincronizar.
            </p>

            <div className="space-y-1">
              <label className="block text-xs text-neutral-400">
                Ciudad / País por defecto (geocodificación)
              </label>
              <input
                type="text"
                value={draft.sheet.cityHint}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    sheet: { ...prev.sheet, cityHint: e.target.value },
                  }))
                }
                placeholder="Ej. Mataró, España"
                className="w-full rounded-xl bg-black px-3.5 py-3 text-sm text-white placeholder-neutral-500 ring-1 ring-white/15 focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
              />
            </div>
          </section>
        </div>

        {/* Pie de modal */}
        <div className="safe-bottom flex gap-2.5 border-t border-white/10 bg-black/80 px-5 pt-3.5">
          <button
            type="button"
            onClick={handleSaveOnly}
            className="flex-1 rounded-2xl bg-[#181818] py-3.5 text-sm font-bold text-white ring-1 ring-white/15 active:scale-[0.98]"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={handleSaveAndSync}
            disabled={!isOnline || isSyncing}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#F3DC8B] via-[#D4AF37] to-[#B8860B] py-3.5 text-sm font-extrabold text-black active:scale-[0.98] disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            Sincronizar
          </button>
        </div>
      </div>
    </div>
  );
}
