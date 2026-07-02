'use client';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/50 p-8 backdrop-blur-xl shadow-2xl text-center">
        <div className="text-6xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold text-red-400 font-mono mb-2">Terminal Error</h1>
        <p className="text-[10px] text-slate-400 mb-6 font-mono">The quant engine encountered an unexpected state</p>
        <div className="bg-slate-950 rounded-lg p-3 mb-6 text-left">
          <p className="text-[9px] text-slate-500 font-mono break-all">{error?.message || 'Unknown error'}</p>
        </div>
        <button
          onClick={reset}
          className="w-full rounded-lg bg-emerald-500 p-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition"
        >
          Restart Terminal
        </button>
      </div>
    </div>
  );
}
