export interface ContentItem {
  id: string;
  url: string;
  title: string;
  description?: string;
  type: 'image' | 'gif' | 'video';
  duration?: number;
  height: number;
  width?: number;
  aspectRatio?: 'portrait' | 'landscape' | 'square' | 'wide' | 'original';
  authorUid: string;
  authorName: string;
  authorPhotoURL?: string;
  createdAt: string;
  likesCount?: number;
  savesCount?: number;
  viewsCount?: number;
  tags?: string[];
  privacy?: 'public' | 'followers' | 'private';
  allowComments?: boolean;
  allowRepins?: boolean;
  boardId?: string;
  isNsfw?: boolean;
  archived?: boolean;
}

export interface Board {
  id: string;
  name: string;
  uid: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  recipientUid: string;
  type: 'like_group' | 'trending' | 'new_post' | 'follow';
  message: string;
  read: boolean;
  createdAt: string;
  count?: number;
}
