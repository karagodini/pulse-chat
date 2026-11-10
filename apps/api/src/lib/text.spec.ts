import { colorForHandle, directChannelName, extractHandles, slugify } from './text';

describe('text helpers', () => {
  it('pulls handles out of a message without matching email addresses', () => {
    expect(extractHandles('Ask @theo and @naomi before we mail ops@kepler.io')).toEqual([
      'theo',
      'naomi',
    ]);
    expect(extractHandles('No mentions here.')).toEqual([]);
    expect(extractHandles('@am')).toEqual([]);
  });

  it('builds stable slugs and direct-message keys', () => {
    expect(slugify('  Kepler Analytics! ')).toBe('kepler-analytics');
    expect(slugify('!!!')).toBe('workspace');
    expect(directChannelName('b', 'a')).toBe(directChannelName('a', 'b'));
    expect(directChannelName('a', 'b')).toBe('dm:a:b');
  });

  it('picks a stable avatar color', () => {
    expect(colorForHandle('amira')).toBe(colorForHandle('amira'));
    expect(colorForHandle('amira')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
