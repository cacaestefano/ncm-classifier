import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { extractSingleJson } from '../../src/lib/import/unzip';

describe('extractSingleJson', () => {
  it('extracts the only file in a zip', () => {
    const json = '{"hello":"world"}';
    const zipped = zipSync({ 'data.json': strToU8(json) });
    const out = extractSingleJson(zipped);
    expect(out).toBe(json);
  });

  it('throws if zip has no files', () => {
    const zipped = zipSync({});
    expect(() => extractSingleJson(zipped)).toThrow();
  });
});
