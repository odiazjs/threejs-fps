/**
 * Offline checks for Lemon Squeezy webhook signature verification.
 * Run: npx tsx src/payments/verifySignatureSelfTest.ts
 */
import assert from 'node:assert/strict';
import { signLemonWebhookBody, verifyLemonWebhookSignature } from './lemonSqueezy.js';

const secret = 'test-secret-max-40-chars-ok!!!!!!!!';
const body = Buffer.from(
  JSON.stringify({
    meta: { event_name: 'order_created', custom_data: { playerId: 'u1', packId: 'pack_1k' } },
    data: {
      id: '99',
      attributes: {
        status: 'paid',
        first_order_item: { variant_id: 123 },
      },
    },
  }),
  'utf8',
);

const goodSig = signLemonWebhookBody(body, secret);
assert.equal(verifyLemonWebhookSignature(body, goodSig, secret), true, 'valid signature');
assert.equal(
  verifyLemonWebhookSignature(body, 'deadbeef', secret),
  false,
  'tampered signature rejected',
);
assert.equal(
  verifyLemonWebhookSignature(body, undefined, secret),
  false,
  'missing signature rejected',
);
assert.equal(
  verifyLemonWebhookSignature(Buffer.from(`${body.toString()} `), goodSig, secret),
  false,
  'body mutation rejected',
);

console.log('[payments] webhook signature self-test passed');
