export interface ContentItem {
  id: string;
  title: string;
  url: string;
  thumbnailUrl?: string;
  images?: string[];
  authorName: string;
  authorPhotoUrl: string;
  authorUid: string;
  type: 'image' | 'video' | 'gif';
  createdAt: string;
  likesCount?: number;
  height?: number;
  tags?: string[];
  archived?: boolean;
  aspectRatio?: string;
  duration?: number;
  description?: string;
  hashtags?: string[];
}

export interface Notification {
  id: string;
  recipientUid: string;
  message: string;
  createdAt: string;
  read: boolean;
}
