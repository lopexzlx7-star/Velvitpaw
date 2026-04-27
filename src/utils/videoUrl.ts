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
  // q_auto:good = preset de qualidade boa (vs q_auto que tende a "eco" e comprime áudio)
  // ac_aac     = força codec de áudio AAC (moderno, alta qualidade, compatível com todos navegadores)
  // af_48000   = sample rate 48 kHz (qualidade de estúdio; padrão do q_auto pode cair p/ 22 kHz)
  const transform = mobile
    ? 'q_auto:good,w_1280,h_720,c_limit,ac_aac,af_48000'
    : 'q_auto:good,w_1920,h_1080,c_limit,ac_aac,af_48000';
  // Se já tem QUALQUER transformação, deixa como está pra evitar dupla aplicação
  if (/\/video\/upload\/[^/]*[a-z]_/.test(url)) return url;
  return url.replace('/video/upload/', `/video/upload/${transform}/`);
}

export function useResponsiveVideoUrl(url: string): string {
  const isMobile = useIsMobile();
  return getResponsiveVideoUrl(url, isMobile);
}
