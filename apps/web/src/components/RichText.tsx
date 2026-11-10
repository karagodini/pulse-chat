export function RichText({ text }: { text: string }) {
  const tokens = text.split(/(@[a-z][a-z0-9_]{2,20}|https?:\/\/[^\s]+)/g);
  return (
    <p className="copy">
      {tokens.map((token, index) => {
        if (token.startsWith('@')) {
          return (
            <span className="mention" key={`${token}-${index}`}>
              {token}
            </span>
          );
        }
        if (token.startsWith('http')) {
          return (
            <a key={`${token}-${index}`} href={token} target="_blank" rel="noreferrer">
              {token}
            </a>
          );
        }
        return <span key={`${token}-${index}`}>{token}</span>;
      })}
    </p>
  );
}
