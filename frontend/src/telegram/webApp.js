// Thin, defensive wrapper around window.Telegram.WebApp. Every call is
// guarded so the app also runs (degraded) in a plain desktop browser during
// development, where window.Telegram is undefined.

function tg() {
  return typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
}

export function initTelegramWebApp() {
  const webApp = tg();
  if (!webApp) return;
  webApp.ready();
  webApp.expand();
  try {
    webApp.setHeaderColor('#0B0F1A');
    webApp.setBackgroundColor('#0B0F1A');
  } catch {
    // older client versions may not support these — safe to ignore
  }
}

export function getInitData() {
  return tg()?.initData || '';
}

export function getTelegramUser() {
  return tg()?.initDataUnsafe?.user || null;
}

export function hapticImpact(style = 'light') {
  tg()?.HapticFeedback?.impactOccurred(style);
}

export function hapticNotification(type = 'success') {
  tg()?.HapticFeedback?.notificationOccurred(type);
}

export function closeWebApp() {
  tg()?.close();
}

export function onBackButton(handler) {
  const webApp = tg();
  if (!webApp) return () => {};
  webApp.BackButton.onClick(handler);
  webApp.BackButton.show();
  return () => {
    webApp.BackButton.offClick(handler);
    webApp.BackButton.hide();
  };
}
