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
  const transform = mobile
    ? 'q_auto,w_1280,h_720,c_limit'
    : 'q_auto,w_1920,h_1080,c_limit';
  if (url.includes(`/video/upload/${transform}/`)) return url;
  return url.replace('/video/upload/', `/video/upload/${transform}/`);
}

export function useResponsiveVideoUrl(url: string): string {
  const isMobile = useIsMobile();
  return getResponsiveVideoUrl(url, isMobile);
}
