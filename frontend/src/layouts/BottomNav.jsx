const TABS = [
  { key: 'home', label: 'خانه', icon: '🏠' },
  { key: 'game', label: 'بازی', icon: '🎮' },
  { key: 'players', label: 'بازیکنان', icon: '🏆' },
  { key: 'friends', label: 'دوستان', icon: '👥' },
  { key: 'profile', label: 'پروفایل', icon: '👤' },
];

export function BottomNav({ active, onChange }) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-3 mb-3 card-premium rounded-xl2 flex justify-between px-2 py-2">
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className="btn-press relative flex flex-1 flex-col items-center gap-1 py-1.5 rounded-xl2"
            >
              {isActive && <span className="gem absolute -top-1 w-1.5 h-1.5 bg-turquoise shadow-glow" />}
              <span className={`text-xl transition-transform ${isActive ? 'scale-110' : 'opacity-60'}`}>{tab.icon}</span>
              <span className={`text-[11px] ${isActive ? 'text-turquoise font-bold' : 'text-ink-faint'}`}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
