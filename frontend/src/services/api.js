const BASE_URL = import.meta.env.VITE_API_URL || '';

let authToken = null;

export function setAuthToken(token) {
  authToken = token;
}

export function getAuthToken() {
  return authToken;
}

async function request(path, { method = 'GET', body, skipAuth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (!skipAuth && authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // empty body is fine (e.g. some 204s)
  }

  if (!res.ok) {
    const error = new Error(data?.error || 'مشکلی پیش آمد. دوباره تلاش کن.');
    error.code = data?.code;
    error.status = res.status;
    throw error;
  }
  return data;
}

export const api = {
  loginWithTelegram: (initData) => request('/api/auth/telegram', { method: 'POST', body: { initData }, skipAuth: true }),
  me: () => request('/api/users/me'),

  games: () => request('/api/games'),

  leaderboard: (limit = 50) => request(`/api/leaderboard?limit=${limit}`),

  friends: () => request('/api/friends'),
  friendRequests: () => request('/api/friends/requests'),
  sendFriendRequest: (identifier) => request('/api/friends/requests', { method: 'POST', body: { identifier } }),
  respondFriendRequest: (id, accept) => request(`/api/friends/requests/${id}/respond`, { method: 'POST', body: { accept } }),

  activeMatch: () => request('/api/matches/active'),
  matchNotifications: () => request('/api/matches/notifications'),
  joinQueue: (gameId, type) => request('/api/matches/queue', { method: 'POST', body: { gameId, type } }),
  leaveQueue: () => request('/api/matches/queue', { method: 'DELETE' }),
  sendGameInvite: (toUserId, gameId, type) => request('/api/matches/friend-requests', { method: 'POST', body: { toUserId, gameId, type } }),
  listGameInvites: () => request('/api/matches/friend-requests'),
  respondGameInvite: (id, accept) => request(`/api/matches/friend-requests/${id}/respond`, { method: 'POST', body: { accept } }),
  getMatch: (id) => request(`/api/matches/${id}`),
};
