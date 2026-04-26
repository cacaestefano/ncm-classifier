import { unzipSync, strFromU8 } from 'fflate';

function isZip(data: Uint8Array): boolean {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
}

export function extractSingleJson(data: Uint8Array): string {
  if (!isZip(data)) return strFromU8(data);
  const files = unzipSync(data);
  const names = Object.keys(files);
  if (names.length === 0) throw new Error('ZIP contains no files');
  const jsonName = names.find(n => n.toLowerCase().endsWith('.json')) ?? names[0];
  return strFromU8(files[jsonName]);
}
