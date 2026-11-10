import { describe, expect, it } from 'vitest';
import { fileSize, formatDay, initials, previewText } from './format';

describe('format', () => {
  const now = new Date(2026, 10, 10, 15, 0, 0);

  it('labels recent days and keeps older dates readable', () => {
    expect(formatDay(new Date(2026, 10, 10, 9).toISOString(), now)).toBe('Today');
    expect(formatDay(new Date(2026, 10, 9, 9).toISOString(), now)).toBe('Yesterday');
    expect(formatDay(new Date(2026, 9, 2, 9).toISOString(), now)).toMatch(/Oct/);
  });

  it('builds initials, file sizes, and sidebar previews', () => {
    expect(initials('Amira Hassan')).toBe('AH');
    expect(fileSize(1536)).toBe('2 KB');
    expect(previewText('', 'Theo Marchetti')).toBe('Theo: Sent a file');
  });
});
