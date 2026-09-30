import * as assert from 'assert';
import { SQL_BACKSLASH_REASON, SQL_YEN_SIGN_REASON, sqlUnsafeCharacterReason } from '../../handler/sqlSafety';

suite('sqlSafety', () => {
  test('a backslash or a yen sign (U+00A5) is unsafe; a backslash is reported first', () => {
    assert.strictEqual(sqlUnsafeCharacterReason('C:\\Users'), SQL_BACKSLASH_REASON);
    assert.strictEqual(sqlUnsafeCharacterReason('\u00A5\' OR 1=1 --'), SQL_YEN_SIGN_REASON);
    assert.strictEqual(sqlUnsafeCharacterReason('\u00A5\\'), SQL_BACKSLASH_REASON);
    assert.strictEqual(
      SQL_YEN_SIGN_REASON,
      "a yen sign (\u00A5), which is saved as a backslash in Shift_JIS, CP932 and EUC-JP and is not safe in MySQL's default mode (the SQL is written as standard SQL)"
    );
  });

  test('other text is safe, including single quotes and look-alikes of the yen sign', () => {
    // U+FFE5 (fullwidth yen) is 0x818F in Shift_JIS, not 0x5C; U+FF3C (fullwidth backslash) is 0x815F.
    for (const text of ['', "O'Neil", "'; DROP TABLE t; --", '\uFFE5100', '\uFF3C', '円']) {
      assert.strictEqual(sqlUnsafeCharacterReason(text), undefined, text);
    }
  });
});
