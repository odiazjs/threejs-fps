import type {
  CharactersResponse,
  SelectCharacterResponse,
} from '../../shared/api/characters';
import { API_BASE_URL } from '../config/apiUrl';
import { rememberCharacterFaceModels } from '../content/characterFaces';
import { ensureSession } from './playerSession';

interface ApiErrorBody {
  error?: string;
}

async function authJson<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await ensureSession();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  const data = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok) {
    throw new Error(data.error ?? 'Request failed');
  }
  return data;
}

function applyFaceModels(data: CharactersResponse | SelectCharacterResponse): void {
  rememberCharacterFaceModels(
    data.characters.map((entry) => ({
      id: entry.id,
      name: entry.name,
      faceModelFile: entry.faceModelFile,
    })),
  );
}

export async function apiListCharacters(): Promise<CharactersResponse> {
  const data = await authJson<CharactersResponse>('/api/me/characters');
  applyFaceModels(data);
  return data;
}

export async function apiSelectCharacter(
  characterId: string,
): Promise<SelectCharacterResponse> {
  const data = await authJson<SelectCharacterResponse>('/api/me/characters/select', {
    method: 'POST',
    body: JSON.stringify({ characterId }),
  });
  applyFaceModels(data);
  return data;
}
