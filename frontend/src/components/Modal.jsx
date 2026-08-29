export function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm card-premium rounded-xl2 p-5 animate-pop-in">
        {title && <h2 className="text-lg font-bold mb-3">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
