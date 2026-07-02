import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/50 p-8 backdrop-blur-xl shadow-2xl text-center">
        <div className="text-6xl mb-4">404</div>
        <h1 className="text-xl font-bold text-red-400 font-mono mb-2">Signal Lost</h1>
        <p className="text-[10px] text-slate-400 mb-6 font-mono">The requested terminal route does not exist</p>
        <Link
          href="/dashboard"
          className="inline-block w-full rounded-lg bg-emerald-500 p-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition text-center"
        >
          Return to Terminal
        </Link>
      </div>
    </div>
  );
}
