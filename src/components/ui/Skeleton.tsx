export function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-sm bg-slate-200/80 ${className}`}
      aria-hidden
    />
  );
}

export function SkeletonPedidoCard() {
  return (
    <div className="bg-white rounded-sm border border-slate-100 p-4 space-y-3 shadow-sm">
      <div className="flex justify-between gap-2">
        <SkeletonLine className="h-5 w-2/5" />
        <SkeletonLine className="h-5 w-16" />
      </div>
      <SkeletonLine className="h-4 w-3/4" />
      <SkeletonLine className="h-4 w-1/2" />
      <div className="flex gap-2 pt-2">
        <SkeletonLine className="h-10 flex-1 rounded-sm" />
        <SkeletonLine className="h-10 w-14 rounded-sm" />
      </div>
    </div>
  );
}

export function SkeletonPedidoList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3 min-w-0">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonPedidoCard key={i} />
      ))}
    </div>
  );
}
