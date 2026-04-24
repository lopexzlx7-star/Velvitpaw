import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ContentItem } from '../types';

interface Props {
  posts: ContentItem[];
}

const ROTATE_MS = 3500;

const shuffle = <T,>(arr: T[]): T[] => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const LoginBackdrop: React.FC<Props> = ({ posts }) => {
  const order = useMemo(() => {
    const imageUrls: string[] = [];
    for (const p of posts) {
      if (p.type !== 'image') continue;
      if (p.images && p.images.length > 0) {
        for (const u of p.images) if (u) imageUrls.push(u);
      } else if (p.url) {
        imageUrls.push(p.url);
      }
    }
    return shuffle(Array.from(new Set(imageUrls)));
  }, [posts]);

  const [activeLayer, setActiveLayer] = useState(0);
  const [urls, setUrls] = useState<[string | null, string | null]>([null, null]);
  const indexRef = useRef(0);

  useEffect(() => {
    if (order.length === 0) {
      setUrls([null, null]);
      return;
    }
    indexRef.current = 0;
    setUrls([order[0], null]);
    setActiveLayer(0);

    const id = window.setInterval(() => {
      indexRef.current = (indexRef.current + 1) % order.length;
      const nextUrl = order[indexRef.current];
      setActiveLayer((cur) => {
        const nextLayer = cur === 0 ? 1 : 0;
        setUrls((prev) => {
          const copy: [string | null, string | null] = [prev[0], prev[1]];
          copy[nextLayer] = nextUrl;
          return copy;
        });
        return nextLayer;
      });
    }, ROTATE_MS);

    return () => window.clearInterval(id);
  }, [order]);

  if (order.length === 0) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {[0, 1].map((i) => (
        <img
          key={i}
          src={urls[i] || undefined}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-out"
          style={{ opacity: urls[i] && activeLayer === i ? 1 : 0 }}
        />
      ))}
      {/* Dark gradient overlay so the form stays readable */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.65) 40%, rgba(0,0,0,0.78) 100%)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
        }}
      />
    </div>
  );
};

export default LoginBackdrop;
