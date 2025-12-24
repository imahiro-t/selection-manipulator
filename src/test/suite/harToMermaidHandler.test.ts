import * as assert from 'assert';
import { createDocument } from '../../handler/harToMermaidHandler';

suite('HAR to Mermaid Handler Test Suite', () => {
  test('Create Mermaid Diagram from HAR Entry', () => {
    const entry = {
      request: {
        method: 'GET',
        url: 'https://example.com/api',
        queryString: [],
        cookies: [],
        headers: []
      },
      response: {
        status: 200,
        statusText: 'OK',
        cookies: []
      }
    };
    const doc = createDocument([entry], false, false);
    assert.ok(doc.includes('sequenceDiagram'));
    assert.ok(doc.includes('participant example_com as example.com'));
    assert.ok(doc.includes('User ->>+ example_com: GET /api'));
  });
});
