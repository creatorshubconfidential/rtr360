export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        {/* Spinning ring */}
        <div className="relative size-10">
          <div className="absolute inset-0 rounded-full border-[3px] border-slate-200" />
          <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-emerald-600" />
        </div>
        <p className="text-sm font-medium text-slate-400 animate-pulse">
          Loading RTR 360…
        </p>
      </div>
    </div>
  );
}
