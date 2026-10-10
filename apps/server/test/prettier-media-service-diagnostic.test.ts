import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import * as prettier from 'prettier';
import { expect, it } from 'vitest';

it('prints canonical media service formatting', async () => {
  const path = fileURLToPath(new URL('../src/publishing/media-post-service.ts', import.meta.url));
  const source = await readFile(path, 'utf8');
  const formatted = await prettier.format(source, {
    parser: 'typescript',
    singleQuote: true,
    trailingComma: 'all',
    printWidth: 110,
    semi: true,
  });
  console.log('MEDIA_SERVICE_FORMAT_START');
  console.log(Buffer.from(formatted, 'utf8').toString('base64'));
  console.log('MEDIA_SERVICE_FORMAT_END');
  expect(source).toBe(formatted);
});
