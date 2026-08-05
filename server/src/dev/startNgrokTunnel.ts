/**
 * Local-only public tunnel so Lemon Squeezy webhooks can reach this server.
 * Requires NGROK_ENABLED=true and NGROK_AUTHTOKEN in server/.env.
 */

export type NgrokTunnelInfo = {
  readonly publicUrl: string;
  readonly webhookUrl: string;
};

function isNgrokEnabled(): boolean {
  const flag = process.env.NGROK_ENABLED?.trim().toLowerCase();
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  // `npm run dev` / `npm run dev:server` — not `npm start` (production).
  const lifecycle = process.env.npm_lifecycle_event;
  return lifecycle === 'dev' || lifecycle === 'dev:tunnel';
}

export async function maybeStartNgrokTunnel(port: number): Promise<NgrokTunnelInfo | null> {
  if (!isNgrokEnabled()) return null;

  const authtoken = process.env.NGROK_AUTHTOKEN?.trim();
  if (!authtoken) {
    console.warn(
      '[ngrok] NGROK_ENABLED=true but NGROK_AUTHTOKEN is missing — tunnel not started. ' +
        'Get a token at https://dashboard.ngrok.com/get-started/your-authtoken',
    );
    return null;
  }

  try {
    const ngrok = await import('@ngrok/ngrok');
    const domain = process.env.NGROK_DOMAIN?.trim() || undefined;
    const listener = await ngrok.forward({
      addr: port,
      authtoken,
      ...(domain ? { domain } : {}),
    });

    const publicUrl = listener.url()?.replace(/\/$/, '') ?? '';
    if (!publicUrl) {
      console.warn('[ngrok] tunnel started but public URL was empty');
      return null;
    }

    const webhookUrl = `${publicUrl}/api/webhooks/lemonsqueezy`;
    console.log('[ngrok] public API URL:', publicUrl);
    console.log('[ngrok] Lemon webhook Callback URL (Test mode):');
    console.log(`         ${webhookUrl}`);
    if (!domain) {
      console.log(
        '[ngrok] Free/ephemeral URL — update the Lemon webhook if this URL changes after restart. ' +
          'Set NGROK_DOMAIN to a reserved domain for a stable URL.',
      );
    }
    return { publicUrl, webhookUrl };
  } catch (error) {
    console.warn(
      '[ngrok] failed to start tunnel:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
