export interface ContentItem {
  id: string;
  title: string;
  url: string;
  authorName: string;
  authorPhotoUrl: string;
  authorUid: string; 
  type: 'image' | 'video';
  createdAt: string;
  likesCount?: number;
  height?: number;
  tags?: string[];
  archived?: boolean;
}

export interface Notification {
  id: string;
  recipientUid: string;
  message: string;
  createdAt: string; 
  read: boolean;
}
