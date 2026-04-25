import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ContentItem } from '../types';

interface Props {
  posts: ContentItem[];
}

type Slide = { url: string; kind: 'image' | 'video'; poster?: string };

const IMAGE_MS = 3500;
const VIDEO_MS = 5000;
const FADE_MS = 800;

const isDirectVideoUrl = (u: string) =>
  /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(u) || u.includes('cloudinary.com/') && /\/video\//.test(u);

const shuffle = <T,>(arr: T[]): T[] => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const LoginBackdrop: React.FC<Props> = ({ posts }) => {
  const order = useMemo<Slide[]>(() => {
    const slides: Slide[] = [];
    const seen = new Set<string>();
    for (const p of posts) {
      if (p.type === 'image') {
        const urls = (p.images && p.images.length > 0) ? p.images : (p.url ? [p.url] : []);
        for (const u of urls) {
          if (u && !seen.has(u)) { seen.add(u); slides.push({ url: u, kind: 'image' }); }
        }
      } else if (p.type === 'video' || p.type === 'gif') {
        if (p.url && isDirectVideoUrl(p.url) && !seen.has(p.url)) {
          seen.add(p.url);
          slides.push({ url: p.url, kind: 'video', poster: p.thumbnailUrl || undefined });
        }
      }
    }
    return shuffle(slides);
  }, [posts]);

  const [activeLayer, setActiveLayer] = useState(0);
  const [layers, setLayers] = useState<[Slide | null, Slide | null]>([null, null]);
  const indexRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (order.length === 0) {
      setLayers([null, null]);
      return;
    }
    indexRef.current = 0;
    setLayers([order[0], null]);
    setActiveLayer(0);

    const scheduleNext = (currentSlide: Slide) => {
      const delay = currentSlide.kind === 'video' ? VIDEO_MS : IMAGE_MS;
      timerRef.current = window.setTimeout(() => {
        indexRef.current = (indexRef.current + 1) % order.length;
        const nextSlide = order[indexRef.current];
        setActiveLayer((cur) => {
          const nextLayerIdx = cur === 0 ? 1 : 0;
          setLayers((prev) => {
            const copy: [Slide | null, Slide | null] = [prev[0], prev[1]];
            copy[nextLayerIdx] = nextSlide;
            return copy;
          });
          return nextLayerIdx;
        });
        scheduleNext(nextSlide);
      }, delay);
    };

    scheduleNext(order[0]);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [order]);

  if (order.length === 0) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {[0, 1].map((i) => {
        const slide = layers[i];
        const visible = !!slide && activeLayer === i;
        if (!slide) {
          return <div key={i} className="absolute inset-0" style={{ opacity: 0 }} />;
        }
        const commonStyle: React.CSSProperties = {
          opacity: visible ? 1 : 0,
          transition: `opacity ${FADE_MS}ms ease-out`,
        };
        if (slide.kind === 'video') {
          return (
            <video
              key={`${i}-${slide.url}`}
              src={slide.url}
              poster={slide.poster}
              autoPlay
              muted
              playsInline
              loop
              preload="auto"
              className="absolute inset-0 w-full h-full object-cover"
              style={commonStyle}
            />
          );
        }
        return (
          <img
            key={`${i}-${slide.url}`}
            src={slide.url}
            alt=""
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover"
            style={commonStyle}
          />
        );
      })}
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
