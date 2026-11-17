import { useEffect, useState } from 'react';

/** Object URL for `bytes`, revoked on change/unmount. Download links only; never passed to <img>/<audio> (CSP). */
export function useBlobUrl(bytes: Uint8Array | null, type: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!bytes) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [bytes, type]);
  return url;
}
