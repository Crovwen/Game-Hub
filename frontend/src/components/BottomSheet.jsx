export function BottomSheet({ open, onClose, title, children }) {
  return (
    <div
      className={[
        'fixed inset-0 z-40 transition-opacity duration-200',
        open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
      ].join(' ')}
      aria-hidden={!open}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={[
          'absolute bottom-0 inset-x-0 card-premium rounded-t-xl2 rounded-b-none p-5 pb-8 transition-transform duration-300',
          open ? 'translate-y-0' : 'translate-y-full',
        ].join(' ')}
        style={{ maxHeight: '75vh', overflowY: 'auto' }}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-ink-faint/40" />
        {title && <h2 className="text-lg font-bold mb-3">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
