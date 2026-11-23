import { useState } from 'react';
import {
  Check,
  Copy,
  Flag,
  Layers,
  RefreshCw,
  RotateCcw,
  Sheet,
  Volume2,
  X,
} from 'lucide-react';
import { APPS_SCRIPT_TEMPLATE } from '../services/sheets';
import { isSpeechSupported } from '../services/tts';
import type { AppSettings, SheetMode } from '../types';

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
  const [copiedScript, setCopiedScript] = useState(false);

  const handleSaveAndSync = () => {
    onUpdateSettings(draft);
    onSyncNow(draft);
    onClose();
  };

  const handleSaveOnly = () => {
    onUpdateSettings(draft);
    onClose();
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const setSheetMode = (mode: SheetMode) => {
    setDraft((prev) => ({
      ...prev,
      sheet: { ...prev.sheet, mode },
    }));
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center">
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-700 bg-surface-900 text-white shadow-2xl sm:rounded-3xl">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-xl font-extrabold">Ajustes y Control</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-800 text-slate-300 active:scale-95"
            aria-label="Cerrar ajustes"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Contenido con scroll */}
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* Acciones de ruta activa */}
          {hasActiveZone && (
            <div className="space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Control de la ruta actual
              </h3>
              <div className="grid grid-cols-1 gap-2.5">
                {onBackToZones && (
                  <button
                    type="button"
                    onClick={() => {
                      onBackToZones();
                      onClose();
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl border border-slate-700 bg-surface-800 px-4 py-3.5 text-left font-bold text-white active:scale-[0.98]"
                  >
                    <Layers className="h-5 w-5 text-brand-400" />
                    Cambiar de zona / Otras rutas
                  </button>
                )}
                {onRestartRoute && (
                  <button
                    type="button"
                    onClick={() => {
                      onRestartRoute();
                      onClose();
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3.5 text-left font-bold text-amber-300 active:scale-[0.98]"
                  >
                    <RotateCcw className="h-5 w-5" />
                    Reiniciar ruta (volver a parada 1)
                  </button>
                )}
                {onFinishRoute && (
                  <button
                    type="button"
                    onClick={() => {
                      onFinishRoute();
                      onClose();
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-3.5 text-left font-bold text-emerald-300 active:scale-[0.98]"
                  >
                    <Flag className="h-5 w-5" />
                    Finalizar ruta ahora
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Ajustes de voz */}
          <div className="space-y-3 rounded-2xl border border-slate-800 bg-surface-950/60 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Volume2 className="h-4 w-4 text-sky-400" />
              Lectura en voz alta (es-ES)
            </div>

            {!isSpeechSupported() && (
              <p className="text-xs text-amber-400">
                Este navegador no soporta síntesis de voz nativa.
              </p>
            )}

            <label className="flex items-center justify-between gap-3 py-1">
              <span className="text-sm text-slate-300">Auto-lectura al pulsar Siguiente/Volver</span>
              <input
                type="checkbox"
                checked={draft.voice.autoSpeak}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    voice: { ...prev.voice, autoSpeak: e.target.checked },
                  }))
                }
                className="h-6 w-6 accent-brand-500"
              />
            </label>

            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-400">
                <span>Velocidad de voz</span>
                <span className="font-bold text-white">{draft.voice.rate.toFixed(1)}x</span>
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
                className="w-full accent-brand-500"
              />
            </div>

            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-400">
                <span>Volumen</span>
                <span className="font-bold text-white">{Math.round(draft.voice.volume * 100)}%</span>
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
                className="w-full accent-brand-500"
              />
            </div>
          </div>

          {/* Configuración de Google Sheets (Coste 0) */}
          <div className="space-y-3 rounded-2xl border border-slate-800 bg-surface-950/60 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Sheet className="h-4 w-4 text-emerald-400" />
              Fuente de datos Google Sheets (Coste 0)
            </div>

            <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-surface-900 p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setSheetMode('demo')}
                className={`rounded-lg py-2 ${
                  draft.sheet.mode === 'demo'
                    ? 'bg-brand-500 text-surface-950'
                    : 'text-slate-400'
                }`}
              >
                Demo
              </button>
              <button
                type="button"
                onClick={() => setSheetMode('apps_script')}
                className={`rounded-lg py-2 ${
                  draft.sheet.mode === 'apps_script'
                    ? 'bg-brand-500 text-surface-950'
                    : 'text-slate-400'
                }`}
              >
                Apps Script
              </button>
              <button
                type="button"
                onClick={() => setSheetMode('public_sheet')}
                className={`rounded-lg py-2 ${
                  draft.sheet.mode === 'public_sheet'
                    ? 'bg-brand-500 text-surface-950'
                    : 'text-slate-400'
                }`}
              >
                Hoja Pública
              </button>
            </div>

            {draft.sheet.mode === 'apps_script' && (
              <div className="space-y-2.5">
                <p className="text-xs text-slate-400">
                  Detecta automáticamente todas las pestañas de tu Google Sheet gratis. Pega el script en{' '}
                  <span className="font-semibold text-slate-200">Extensiones → Apps Script</span> y despliégalo como Aplicación Web (acceso: Cualquier usuario).
                </p>
                <button
                  type="button"
                  onClick={handleCopyScript}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-surface-800 px-3 py-1.5 text-xs font-bold text-slate-200"
                >
                  {copiedScript ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      Código copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copiar código Apps Script
                    </>
                  )}
                </button>
                <input
                  type="url"
                  value={draft.sheet.appsScriptUrl}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      sheet: { ...prev.sheet, appsScriptUrl: e.target.value },
                    }))
                  }
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full rounded-xl border border-slate-700 bg-surface-900 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                />
              </div>
            )}

            {draft.sheet.mode === 'public_sheet' && (
              <div className="space-y-2.5">
                <p className="text-xs text-slate-400">
                  Comparte tu Google Sheet como &quot;Cualquier persona con el enlace (Lector)&quot; y pega la URL o ID.
                </p>
                <input
                  type="text"
                  value={draft.sheet.sheetUrlOrId}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      sheet: { ...prev.sheet, sheetUrlOrId: e.target.value },
                    }))
                  }
                  placeholder="URL o ID de Google Sheet"
                  className="w-full rounded-xl border border-slate-700 bg-surface-900 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={draft.sheet.tabNames}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      sheet: { ...prev.sheet, tabNames: e.target.value },
                    }))
                  }
                  placeholder="Pestañas separadas por comas (ej. Zona 1, Zona 2)"
                  className="w-full rounded-xl border border-slate-700 bg-surface-900 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                />
              </div>
            )}

            {draft.sheet.mode !== 'demo' && (
              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  Ciudad / País por defecto (mejora geocodificación)
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
                  placeholder="Ej. Barcelona, España"
                  className="w-full rounded-xl border border-slate-700 bg-surface-900 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                />
              </div>
            )}
          </div>
        </div>

        {/* Pie de modal */}
        <div className="flex gap-2.5 border-t border-slate-800 px-5 py-4">
          <button
            type="button"
            onClick={handleSaveOnly}
            className="flex-1 rounded-2xl border border-slate-700 bg-surface-800 py-3.5 text-sm font-bold text-white active:scale-[0.98]"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={handleSaveAndSync}
            disabled={!isOnline || isSyncing}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3.5 text-sm font-extrabold text-surface-950 active:scale-[0.98] disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            Guardar y sincronizar
          </button>
        </div>
      </div>
    </div>
  );
}
