import { unzipSync, strFromU8 } from 'fflate';

export function extractSingleJson(data: Uint8Array): string {
  const files = unzipSync(data);
  const names = Object.keys(files);
  if (names.length === 0) throw new Error('ZIP contains no files');
  const jsonName = names.find(n => n.toLowerCase().endsWith('.json')) ?? names[0];
  return strFromU8(files[jsonName]);
}
