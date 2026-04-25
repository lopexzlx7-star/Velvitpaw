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

export interface Folder {
  id: string;
  ownerUid: string;
  name: string;
  description?: string;
  coverImage?: string | null;
  postIds: string[];
  createdAt: string;
}

export interface HashtagCategory {
  name: string;
  count: number;
  coverImage: string | null;
  latestAt: number;
}

export type NotificationType =
  | 'new_post'
  | 'new_follower'
  | 'recommended'
  | 'like'
  | 'comment';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  fromUserId: string;
  fromUserName?: string;
  fromUserPhotoUrl?: string | null;
  postId?: string;
  postThumbnailUrl?: string | null;
  message: string;
  createdAt: string | { seconds: number; nanoseconds: number };
  read: boolean;
}
