import type { Session } from 'electron';

export async function readSignedIn(ses: Pick<Session, 'cookies' | 'fetch'>): Promise<boolean | null> {
  try {
    const login = await ses.cookies.get({ url: 'https://leetcode.com', name: 'LEETCODE_SESSION' });
    if (!login.length) return false;
    const csrf = await ses.cookies.get({ url: 'https://leetcode.com', name: 'csrftoken' });
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Referer: 'https://leetcode.com/' };
    if (csrf[0]) headers['x-csrftoken'] = csrf[0].value;
    const response = await ses.fetch('https://leetcode.com/graphql/', {
      method: 'POST', headers, body: JSON.stringify({ query: 'query { userStatus { isSignedIn } }' }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return null;
    const data = await response.json() as { data?: { userStatus?: { isSignedIn?: boolean } } };
    const result = data.data?.userStatus?.isSignedIn;
    return typeof result === 'boolean' ? result : null;
  } catch { return null; }
}
