const DEFAULT_SERVER_URL = 'http://localhost:4001';

export const SERVER_URL = import.meta.env.VITE_COLYSEUS_URL ?? DEFAULT_SERVER_URL;
