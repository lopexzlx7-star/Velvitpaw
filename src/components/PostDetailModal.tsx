import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Heart, Share2, Download, MessageCircle, 
  MoreHorizontal, User, Calendar, Clock,
  Volume2, VolumeX, Play, Pause
} from 'lucide-react';
import { ContentItem } from '../types';
import { db } from '../firebase';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import GlassCard from './GlassCard';

interface PostDetailModalProps {
  item: ContentItem;
  onClose: () => void;
  onLike: (id: string) => void;
  isLiked: boolean;
  currentUserUid?: string;
}

const PostDetailModal: React.FC<PostDetailModalProps> = ({ 
  item, onClose, onLike, isLiked, currentUserUid 
}) => {
  const [relatedPosts, setRelatedPosts] = useState<ContentItem[]>([]);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showShareMenu, setShowShareMenu] = useState(false);

  useEffect(() => {
    const fetchRelated = async () => {
      try {
        const q = query(
          collection(db, 'posts'),
          where('type', '==', item.type),
          limit(6)
        );
        const snapshot = await getDocs(q);
        const posts = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as ContentItem))
          .filter(p => p.id !== item.id);
        setRelatedPosts(posts);
      } catch (error) {
        console.error("Error fetching related posts:", error);
      }
    };
    fetchRelated();
  }, [item.id, item.type]);

  const handleDownload = async () => {
    try {
      const response = await fetch(item.mediaUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `post-${item.id}.${item.mediaType === 'video' ? 'mp4' : 'jpg'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: item.title,
        url: window.location.href,
      }).catch(console.error);
    } else {
      setShowShareMenu(true);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-0 sm:p-4"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="relative w-full max-w-6xl h-full sm:h-[90vh] bg-zinc-900 sm:rounded-3xl overflow-hidden flex flex-col md:flex-row"
      >
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-50 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
        >
          <X size={24} />
        </button>

        {/* Media Section */}
        <div className="flex-1 bg-black flex items-center justify-center relative group">
          {item.mediaType === 'video' ? (
            <div className="relative w-full h-full flex items-center justify-center">
              <video
                src={item.mediaUrl}
                className="max-w-full max-h-full object-contain"
                autoPlay
                loop
                muted={isMuted}
                playsInline
                onClick={() => setIsPlaying(!isPlaying)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
              <div className="absolute bottom-6 right-6 flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-3 bg-black/50 hover:bg-black/70 rounded-full text-white backdrop-blur-md"
                >
                  {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
              </div>
            </div>
          ) : (
            <img 
              src={item.mediaUrl} 
              alt={item.title}
              className="max-w-full max-h-full object-contain"
              referrerPolicy="no-referrer"
            />
          )}
        </div>

        {/* Info Section */}
        <div className="w-full md:w-[400px] bg-zinc-900 flex flex-col border-l border-white/10">
          <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
            {/* Author Info */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-400 to-cyan-400 flex items-center justify-center text-zinc-900 font-bold">
                  {item.authorName?.[0] || <User size={20} />}
                </div>
                <div>
                  <h3 className="text-white font-semibold">{item.authorName || 'Anonymous'}</h3>
                  <p className="text-zinc-500 text-xs">@{item.authorName?.toLowerCase().replace(/\s/g, '') || 'user'}</p>
                </div>
              </div>
              <button className="px-4 py-1.5 bg-white text-black rounded-full text-sm font-medium hover:bg-zinc-200 transition-colors">
                Follow
              </button>
            </div>

            {/* Post Info */}
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-white mb-2">{item.title}</h1>
              <div className="flex items-center gap-4 text-zinc-500 text-sm">
                <span className="flex items-center gap-1">
                  <Calendar size={14} />
                  {new Date(item.createdAt).toLocaleDateString()}
                </span>
                {item.duration && (
                  <span className="flex items-center gap-1">
                    <Clock size={14} />
                    {Math.floor(item.duration)}s
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-6 mb-8">
              <button 
                onClick={() => onLike(item.id)}
                className={`flex items-center gap-2 transition-colors ${isLiked ? 'text-rose-500' : 'text-zinc-400 hover:text-white'}`}
              >
                <Heart size={24} fill={isLiked ? "currentColor" : "none"} />
                <span className="font-medium">{item.likes || 0}</span>
              </button>
              <button className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
                <MessageCircle size={24} />
                <span className="font-medium">0</span>
              </button>
              <button 
                onClick={handleShare}
                className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors ml-auto"
              >
                <Share2 size={24} />
              </button>
              <button 
                onClick={handleDownload}
                className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
              >
                <Download size={24} />
              </button>
            </div>

            {/* Related Posts */}
            <div>
              <h4 className="text-white font-semibold mb-4">Related Posts</h4>
              <div className="grid grid-cols-2 gap-3">
                {relatedPosts.map(post => (
                  <div key={post.id} className="aspect-[3/4] rounded-xl overflow-hidden bg-zinc-800 relative group cursor-pointer">
                    <img 
                      src={post.mediaUrl} 
                      alt={post.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Comment Input (Placeholder) */}
          <div className="p-4 border-t border-white/10 bg-zinc-900/50">
            <div className="flex items-center gap-3 bg-zinc-800 rounded-full px-4 py-2">
              <input 
                type="text" 
                placeholder="Add a comment..." 
                className="flex-1 bg-transparent border-none focus:ring-0 text-white text-sm"
              />
              <button className="text-emerald-400 font-semibold text-sm hover:text-emerald-300 transition-colors">
                Post
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default PostDetailModal;
