import React, { useMemo } from 'react';
import { Folder as FolderIcon } from 'lucide-react';
import { Folder, ContentItem } from '../types';

interface Props {
  folder: Folder;
  allPosts: ContentItem[];
  className?: string;
  rounded?: string;
}

function pickThumb(post: ContentItem | undefined): string | null {
  if (!post) return null;
  if (post.type === 'video') {
    return post.thumbnailUrl || post.url || null;
  }
  if (post.images && post.images.length > 0) return post.images[0];
  return post.url || null;
}

const FolderCover: React.FC<Props> = ({
  folder,
  allPosts,
  className = '',
  rounded = 'rounded-2xl',
}) => {
  const covers = useMemo(() => {
    const map = new Map(allPosts.map(p => [p.id, p]));
    const urls: string[] = [];
    for (const id of folder.postIds) {
      const u = pickThumb(map.get(id));
      if (u) urls.push(u);
      if (urls.length >= 3) break;
    }
    return urls;
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
        <img src={covers[0]} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      </div>
    );
  }

  if (covers.length === 2) {
    return (
      <div
        className={`relative w-full h-full overflow-hidden border border-white/10 grid grid-cols-2 gap-[2px] ${rounded} ${className}`}
        style={wrapperStyle}
      >
        <img src={covers[0]} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        <img src={covers[1]} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      </div>
    );
  }

  // 3 covers — Pinterest-style: large left + 2 stacked right
  return (
    <div
      className={`relative w-full h-full overflow-hidden border border-white/10 grid grid-cols-2 gap-[2px] ${rounded} ${className}`}
      style={wrapperStyle}
    >
      <img src={covers[0]} alt="" className="w-full h-full object-cover row-span-2" referrerPolicy="no-referrer" />
      <div className="grid grid-rows-2 gap-[2px] h-full">
        <img src={covers[1]} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        <img src={covers[2]} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      </div>
    </div>
  );
};

export default FolderCover;
