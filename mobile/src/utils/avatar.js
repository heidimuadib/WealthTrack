import { API_URL } from '../config/api.config';

// The server stores a path rather than an absolute URL, so one stored value
// resolves against the LAN address in development and a real host in
// production without anything having to rewrite it.
export const avatarUri = (user) => (user?.avatarUrl ? `${API_URL}${user.avatarUrl}` : null);

// What stands in for a photo. Google accounts can arrive with no name at all,
// hence the final fallback rather than an empty circle.
export const initialFor = (user) => user?.name?.trim()?.charAt(0)?.toUpperCase() || 'U';
