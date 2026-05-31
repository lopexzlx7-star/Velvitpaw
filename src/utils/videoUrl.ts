import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT_PX = 768;

export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT_PX): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window === 'undefined' ? false : window.innerWidth < breakpoint
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [breakpoint]);
  return isMobile;
}

export function getResponsiveVideoUrl(url: string, mobile: boolean): string {
  if (!url) return url;
  if (!url.includes('res.cloudinary.com') || !url.includes('/video/upload/')) return url;
  // q_auto:best  = máxima qualidade automática (Cloudinary preserva fidelidade máxima)
  // ac_aac       = codec de áudio AAC (universal, alta qualidade)
  // af_48000     = sample rate 48 kHz (qualidade de estúdio)
  // Mobile: cap em 1080p para equilibrar qualidade e banda
  // Desktop: sem cap de resolução — exibe na resolução original do vídeo
  const transform = mobile
    ? 'q_auto:best,w_1920,h_1080,c_limit,ac_aac,af_48000'
    : 'q_auto:best,ac_aac,af_48000';
  // Se já tem QUALQUER transformação, deixa como está pra evitar dupla aplicação
  if (/\/video\/upload\/[^/]*[a-z]_/.test(url)) return url;
  return url.replace('/video/upload/', `/video/upload/${transform}/`);
}

export function useResponsiveVideoUrl(url: string): string {
  const isMobile = useIsMobile();
  return getResponsiveVideoUrl(url, isMobile);
}
