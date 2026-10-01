import { currentUser, finishSignIn, SIGN_IN_URL, type Me } from './api';

const KEY = 'il.signin';
/** A second trip to the gateway this soon means the first one didn't stick (blocked cookies, a refused code). */
const LOOP_MS = 60_000;

const tried = (): boolean => { try { return Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < LOOP_MS; } catch { return false; } };
const remember = () => { try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked: no loop guard */ } };
const forget = () => { try { sessionStorage.removeItem(KEY); } catch { /* nothing to forget */ } };

/**
 * Server mode start-up (MICROAPP_AUTH.md §4). Finishes a sign-in the gateway just sent back, or sends the
 * browser to the gateway. Returns who is signed in, or null when the browser is on its way to the gateway.
 */
export async function signInThroughGateway(go: (url: string) => void = url => location.assign(url)): Promise<Me | null> {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (code) {
    // The one-time code must not stay in the address bar, history or a bookmark.
    params.delete('code');
    const rest = params.toString();
    history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
    await finishSignIn(code);
  }

  const me = await currentUser();
  if (me) { forget(); return me; }
  // A code that was accepted but left no session means the cookie was dropped: another trip won't help.
  if (code || tried()) {
    forget();
    throw new Error("Couldn't sign you in through the Rizurf gateway. Open the logbook from the gateway again.");
  }
  remember();
  go(SIGN_IN_URL);
  return null;
}
