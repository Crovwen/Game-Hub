function formatNumber(n) {
  return new Intl.NumberFormat('fa-IR').format(n ?? 0);
}

export function CoinsPill({ value, size = 'md' }) {
  const pad = size === 'lg' ? 'px-4 py-2 text-base' : 'px-3 py-1.5 text-sm';
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full bg-gold-soft border border-gold/30 ${pad}`}>
      <span className="gem bg-gold w-2 h-2" />
      <span>🪙</span>
      <span className="tabular font-bold text-gold">{formatNumber(value)}</span>
    </div>
  );
}

export function ScorePill({ value, size = 'md' }) {
  const pad = size === 'lg' ? 'px-4 py-2 text-base' : 'px-3 py-1.5 text-sm';
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full bg-turquoise-soft border border-turquoise/30 ${pad}`}>
      <span className="gem bg-turquoise w-2 h-2" />
      <span>⭐</span>
      <span className="tabular font-bold text-turquoise">{formatNumber(value)}</span>
    </div>
  );
}
