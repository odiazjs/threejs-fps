const FRIENDS_KEY = 'fps_friends';

function normalize(username: string): string {
  return username.trim().toLowerCase();
}

function readFriends(): string[] {
  try {
    const raw = localStorage.getItem(FRIENDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((name): name is string => typeof name === 'string')
      .map((name) => name.trim().slice(0, 16))
      .filter((name) => name.length > 0);
  } catch {
    return [];
  }
}

function writeFriends(friends: string[]): void {
  const unique = [...new Map(friends.map((name) => [normalize(name), name])).values()];
  unique.sort((a, b) => a.localeCompare(b));
  localStorage.setItem(FRIENDS_KEY, JSON.stringify(unique));
}

export function getFriends(): string[] {
  return readFriends();
}

export function isFriend(username: string): boolean {
  const key = normalize(username);
  return readFriends().some((friend) => normalize(friend) === key);
}

export function addFriend(username: string): void {
  const trimmed = username.trim().slice(0, 16);
  if (!trimmed) return;

  const friends = readFriends();
  if (friends.some((friend) => normalize(friend) === normalize(trimmed))) return;

  writeFriends([...friends, trimmed]);
}

export function removeFriend(username: string): void {
  const key = normalize(username);
  writeFriends(readFriends().filter((friend) => normalize(friend) !== key));
}
