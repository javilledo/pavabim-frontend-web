import React, { useEffect, useState } from 'react';
import { fetchAuthenticatedBlobUrl } from '../../api/client';

interface AuthenticatedImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
}

export const AuthenticatedImage: React.FC<AuthenticatedImageProps> = ({
  src,
  alt,
  className = '',
}) => {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src) {
      setResolvedUrl(null);
      setLoading(false);
      setFailed(false);
      return;
    }

    if (src.startsWith('data:') || src.startsWith('blob:')) {
      setResolvedUrl(src);
      setLoading(false);
      setFailed(false);
      return;
    }

    let cancelled = false;
    let generatedBlobUrl: string | null = null;

    setLoading(true);
    setFailed(false);

    fetchAuthenticatedBlobUrl(src)
      .then((blobUrl) => {
        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        generatedBlobUrl = blobUrl;
        setResolvedUrl(blobUrl);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedUrl(null);
          setFailed(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (generatedBlobUrl) {
        URL.revokeObjectURL(generatedBlobUrl);
      }
    };
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-asphalt-950 border border-asphalt-700 text-[11px] text-asphalt-400 ${className}`}
      >
        {failed ? 'No disponible' : 'Sin captura'}
      </div>
    );
  }

  if (loading || !resolvedUrl) {
    return (
      <div
        className={`flex items-center justify-center bg-asphalt-950 border border-asphalt-700 text-[11px] text-pavasal-400 animate-pulse ${className}`}
      >
        Cargando imagen...
      </div>
    );
  }

  return <img src={resolvedUrl} alt={alt} className={className} />;
};

export default AuthenticatedImage;
