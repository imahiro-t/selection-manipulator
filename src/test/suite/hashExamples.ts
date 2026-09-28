/**
 * The input / output examples of the HASH table in docs/ROADMAP.md with the full expected values
 * (the ROADMAP shows only their first characters followed by `…`). `key` is the HMAC key and, for
 * HASH-017, `expected` is the notification text.
 */
export const HASH_ROADMAP_EXAMPLES: Record<string, { input: string; expected: string; key?: string }> = {
  'HASH-001': { input: 'abc', expected: '23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7' },
  'HASH-002': { input: 'abc', expected: 'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7' },
  'HASH-003': { input: 'abc', expected: '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532' },
  'HASH-004': { input: 'abc', expected: 'b751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0' },
  'HASH-005': { input: 'abc', expected: '53048e2681941ef99b2e29b76b4c7dabe4c2d0c634fc6d46e0e2f13107e7af23' },
  'HASH-006': { input: 'abc', expected: 'ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923' },
  'HASH-007': { input: 'abc', expected: '508c5e8c327c14e2e1a72ba34eeb452f37458b209ed63a294d999b4c86675982' },
  'HASH-008': { input: 'abc', key: 'key', expected: '4fd0b215276ef12f2b3e4c8ecac2811498b656fc' },
  'HASH-009': { input: 'abc', key: 'key', expected: '30ddb9c8f347cffbfb44e519d814f074cf4047a55d6f563324f1c6a33920e5edfb2a34bac60bdc96cd33a95623d7d638' },
  'HASH-010': { input: 'abc', key: 'key', expected: '09b6dbab8d11795ca7c8d82f1cf91682013c7cb980abbb25473be4ae7f7b5683' },
  'HASH-011': { input: 'hello', expected: '3610a686' },
  'HASH-012': { input: 'hello', expected: '062c0215' },
  'HASH-013': { input: 'hello', expected: '4f9f2cab' },
  'HASH-014': { input: 'abc', expected: 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=' },
  'HASH-015': { input: 'abc', expected: 'sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn' },
  'HASH-016': {
    input: 'a\nb',
    expected: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb\n3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d',
  },
  'HASH-017': { input: '79927398713', expected: 'Luhn: valid' },
  'HASH-018': { input: 'abc', expected: 'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7' },
  'HASH-019': { input: 'abc', expected: '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532' },
  'HASH-020': { input: 'abc', expected: 'ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923' },
};
