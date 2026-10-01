/**
 * The input / output examples of the DEVX commands of the showcase data
 * (scripts/showcase-data/DEVX.json), with the exact results (LF line breaks). In the showcase `⏎`
 * is a line break, `⇥` a tab and `·` a space.
 */
export interface Dev2Example {
  input: string;
  expected: string;
}

export const DEV2_EXAMPLES: Record<string, Dev2Example> = {
  'DEVX-001': {
    input: '{"userId":1}',
    expected: 'use serde::{Deserialize, Serialize};\n\n#[derive(Serialize, Deserialize)]\nstruct Root {\n    #[serde(rename = "userId")]\n    user_id: i64,\n}',
  },
  'DEVX-002': { input: '{"name":"a"}', expected: 'import kotlinx.serialization.Serializable\n\n@Serializable\ndata class Root(val name: String)' },
  'DEVX-003': {
    input: '{"age":3}',
    expected: 'using System.Text.Json.Serialization;\n\npublic class Root\n{\n    [JsonPropertyName("age")]\n    public long Age { get; set; }\n}',
  },
  'DEVX-004': { input: '{"a":1}', expected: 'z.object({ a: z.number() })' },
  'DEVX-005': { input: '{"id":1}', expected: 'struct Root: Codable {\n    let id: Int\n}' },
  'DEVX-006': { input: 'SELECT * FROM t', expected: 'select * from t' },
  'DEVX-007': { input: '#ff0000', expected: 'oklch(62.8% 0.258 29.23)' },
  'DEVX-008': { input: '#000000 #ffffff', expected: '21:1 (AAA)' },
  'DEVX-009': { input: '#112233', expected: '#eeddcc' },
  'DEVX-010': { input: '{color:red;align-items:center}', expected: '{align-items:center;color:red}' },
  'DEVX-011': { input: 'font-size: 12px; color: red', expected: '{ fontSize: \'12px\', color: \'red\' }' },
  'DEVX-012': { input: '{ fontSize: \'12px\' }', expected: 'font-size: 12px;' },
  'DEVX-013': { input: 'a(); // x\n/* y */b();', expected: 'a();\nb();' },
  'DEVX-014': { input: 'a"b', expected: '@"a""b"' },
  'DEVX-015': { input: 'a"#b', expected: 'r##"a"#b"##' },
  'DEVX-016': { input: 'echo $X', expected: 'cat <<\'EOF\'\necho $X\nEOF' },
  'DEVX-017': { input: '404', expected: '404 Not Found' },
  'DEVX-018': { input: 'report.pdf', expected: 'application/pdf' },
  'DEVX-019': { input: '{550E8400E29B41D4A716446655440000}', expected: '550e8400-e29b-41d4-a716-446655440000' },
  'DEVX-020': {
    input: '192.168.1.0/24',
    expected: 'network 192.168.1.0 / broadcast 192.168.1.255 / first 192.168.1.1 / last 192.168.1.254 / hosts 254',
  },
  'DEVX-021': { input: '2001:db8::1', expected: '2001:0db8:0000:0000:0000:0000:0000:0001' },
  'DEVX-022': { input: '2001:0db8:0000:0000:0000:0000:0000:0001', expected: '2001:db8::1' },
  'DEVX-023': { input: '192.168.0.1', expected: '3232235521' },
};

/** Expands the notation of the showcase examples: `⏎` (LF), `⇥` (tab), `·` (space). */
export const expandDev2 = (value: string): string => value.replace(/⏎/g, '\n').replace(/⇥/g, '\t').replace(/·/g, ' ');
