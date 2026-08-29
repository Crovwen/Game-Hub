export function Card({ children, className = '', glow = false, onClick }) {
  return (
    <div
      onClick={onClick}
      className={[
        'card-premium p-4',
        glow ? 'shadow-glow' : '',
        onClick ? 'btn-press cursor-pointer' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} />;
}
