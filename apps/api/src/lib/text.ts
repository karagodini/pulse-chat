const HANDLE = /(?:^|\s)@([a-z][a-z0-9_]{2,20})\b/g;

export function extractHandles(body: string): string[] {
  const found = new Set<string>();
  HANDLE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HANDLE.exec(body)) !== null) {
    found.add(match[1]);
  }
  return [...found];
}

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'workspace';
}

export function directChannelName(a: string, b: string): string {
  return `dm:${[a, b].sort().join(':')}`;
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

const PALETTE = ['#ff4d2e', '#6aa6ff', '#d38bfe', '#3dce8a', '#e6b450', '#f08bb0', '#7ed0c8'];

export function colorForHandle(handle: string): string {
  let hash = 0;
  for (const char of handle) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
