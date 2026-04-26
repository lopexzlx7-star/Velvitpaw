import React, { useMemo } from 'react';
import { Folder as FolderIcon } from 'lucide-react';
import { Folder, ContentItem } from '../types';
import { useIsMobile, getResponsiveVideoUrl } from '../utils/videoUrl';

interface Props {
  folder: Folder;
  allPosts: ContentItem[];
  className?: string;
  rounded?: string;
}

interface CoverEntry {
  url: string;
  isVideo: boolean;
  poster?: string;
}

function pickCover(post: ContentItem | undefined): CoverEntry | null {
  if (!post) return null;
  if (post.type === 'video') {
    if (post.thumbnailUrl) {
      return { url: post.thumbnailUrl, isVideo: false };
    }
    if (post.url) {
      return { url: post.url, isVideo: true };
    }
    return null;
  }
  if (post.images && post.images.length > 0) return { url: post.images[0], isVideo: false };
  if (post.url) return { url: post.url, isVideo: false };
  return null;
}

const CoverMedia: React.FC<{ entry: CoverEntry; className?: string }> = ({ entry, className = '' }) => {
  const isMobile = useIsMobile();
  if (entry.isVideo) {
    return (
      <video
        src={`${getResponsiveVideoUrl(entry.url, isMobile)}#t=0.1`}
        poster={entry.poster}
        className={className}
        muted
        playsInline
        preload="metadata"
        disablePictureInPicture
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          try { v.currentTime = 0.1; } catch {}
        }}
      />
    );
  }
  return <img src={entry.url} alt="" className={className} referrerPolicy="no-referrer" />;
};

const FolderCover: React.FC<Props> = ({
  folder,
  allPosts,
  className = '',
  rounded = 'rounded-2xl',
}) => {
  const covers = useMemo(() => {
    const map = new Map(allPosts.map(p => [p.id, p]));
    const list: CoverEntry[] = [];
    for (const id of folder.postIds) {
      const c = pickCover(map.get(id));
      if (c) list.push(c);
      if (list.length >= 3) break;
    }
    return list;
  }, [folder.postIds, allPosts]);

  const wrapperStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
  };

  if (covers.length === 0) {
    return (
      <div
        className={`relative w-full h-full overflow-hidden border border-white/10 flex items-center justify-center ${rounded} ${className}`}
        style={wrapperStyle}
      >
        <FolderIcon size={28} className="text-white/15" />
      </div>
    );
  }

  if (covers.length === 1) {
    return (
      <div
        className={`relative w-full h-full overflow-hidden border border-white/10 ${rounded} ${className}`}
        style={wrapperStyle}
      >
        <CoverMedia entry={covers[0]} className="w-full h-full object-cover" />
      </div>
    );
  }

  if (covers.length === 2) {
    return (
      <div
        className={`relative w-full h-full overflow-hidden border border-white/10 grid grid-cols-2 grid-rows-1 gap-[2px] ${rounded} ${className}`}
        style={wrapperStyle}
      >
        <CoverMedia entry={covers[0]} className="w-full h-full object-cover min-h-0" />
        <CoverMedia entry={covers[1]} className="w-full h-full object-cover min-h-0" />
      </div>
    );
  }

  // 3 covers — Pinterest-style: large left + 2 stacked right
  return (
    <div
      className={`relative w-full h-full overflow-hidden border border-white/10 grid grid-cols-2 grid-rows-2 gap-[2px] ${rounded} ${className}`}
      style={wrapperStyle}
    >
      <CoverMedia entry={covers[0]} className="w-full h-full object-cover row-span-2 min-h-0" />
      <CoverMedia entry={covers[1]} className="w-full h-full object-cover min-h-0" />
      <CoverMedia entry={covers[2]} className="w-full h-full object-cover min-h-0" />
    </div>
  );
};

export default FolderCover;
