import { describe, expect, it } from 'vitest';

import { createTextPostPreview } from '../src/index.js';

describe('M02 text post preview', () => {
  it('preserves approved commentary in the canonical payload', () => {
    expect(createTextPostPreview({ text: 'Hello' }).payload.commentary).toBe('Hello');
  });
});
