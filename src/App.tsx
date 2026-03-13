import { useState, useEffect, useRef, ChangeEvent, ReactNode } from 'react';
import { Search, X, Loader2, Info, Plus, User, Image as ImageIcon, RotateCcw, CheckCircle2, AlertCircle, Heart, Bell, Bookmark, UserPlus, UserMinus } from 'lucide-react';
import { motion, AnimatePresence, useScroll, useTransform } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp, 
  getDocFromServer, 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  deleteDoc, 
  updateDoc,
  onSnapshot 
} from 'firebase/firestore';
import { 
  signInAnonymously, 
  onAuthStateChanged, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from 'firebase/auth';
import { db, auth } from './firebase';
import { ContentItem, Notification } from './types';
import GlassCard from './components/GlassCard';
import FloatingNav from './components/FloatingNav';
import PublishModal from './components/PublishModal';
import DeleteBottomSheet from './components/DeleteBottomSheet';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType | 'auth', path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Specific check for Auth providers not enabled
  if (errorMessage.includes('auth/admin-restricted-operation') || errorMessage.includes('auth/operation-not-allowed')) {
    const authError = "O método de login (E-mail/Senha) não está ativado no Console do Firebase. Por favor, ative 'Email/Password' em Authentication > Sign-in method.";
    console.error(authError);
    throw new Error(JSON.stringify({
      error: authError,
      operationType: 'auth',
      path: null,
      authInfo: { userId: 'anonymous' }
    }));
  }

  if (errorMessage.includes('auth/invalid-credential') || errorMessage.includes('auth/wrong-password') || errorMessage.includes('auth/user-not-found')) {
    const authError = "Usuário ou senha incorretos.";
    throw new Error(JSON.stringify({
      error: authError,
      operationType: 'auth',
      path: null,
      authInfo: { userId: 'anonymous' }
    }));
  }

  if (errorMessage.includes('auth/email-already-in-use')) {
    const authError = "Este nome de usuário já está em uso.";
    throw new Error(JSON.stringify({
      error: authError,
      operationType: 'auth',
      path: null,
      authInfo: { userId: 'anonymous' }
    }));
  }

  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid || 'anonymous',
      email: auth.currentUser?.email,
    },
    operationType: operationType as OperationType,
    path
  };
  console.error('Firestore/Auth Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Simple ErrorBoundary Component
function ErrorBoundary({ children }: { children: ReactNode }) {
  const [hasError, setHasError] = useState(false);
  const [errorInfo, setErrorInfo] = useState<string | null>(null);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      try {
        const parsed = JSON.parse(event.error.message);
        if (parsed.error) {
          setHasError(true);
          setErrorInfo(parsed.error);
        }
      } catch {
        // Not a Firestore JSON error
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-space-gray-900 text-white text-center">
        <div className="glass-panel p-10 rounded-[40px] max-w-md">
          <AlertCircle size={48} className="mx-auto mb-6 text-red-500" />
          <h2 className="text-2xl font-bold mb-4">Ops! Algo deu errado</h2>
          <p className="text-white/60 mb-8">{errorInfo || 'Ocorreu um erro inesperado na conexão com o banco de dados.'}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-8 py-3 bg-white text-black font-bold rounded-full uppercase tracking-widest text-xs"
          >
            Recarregar App
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState<ContentItem[]>([]);
  const [userPosts, setUserPosts] = useState<ContentItem[]>([]);
  const [globalPosts, setGlobalPosts] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPlaceholderModal, setShowPlaceholderModal] = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [isDeleteSheetOpen, setIsDeleteSheetOpen] = useState(false);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const [bgImage, setBgImage] = useState<string | null>(() => localStorage.getItem('velvit_bg'));
  const [profilePic, setProfilePic] = useState<string | null>(() => localStorage.getItem('velvit_profile_pic'));
  const [username, setUsername] = useState<string>(() => localStorage.getItem('velvit_username') || 'Usuário');
  const [loginUsername, setLoginUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => !!localStorage.getItem('velvit_username'));
  const [loginLoading, setLoginLoading] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [likedIds, setLikedIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('velvit_likes');
    return saved ? JSON.parse(saved) : [];
  });
  const [likedItems, setLikedItems] = useState<ContentItem[]>(() => {
    const saved = localStorage.getItem('velvit_liked_items');
    return saved ? JSON.parse(saved) : [];
  });
  const [savedIds, setSavedIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('velvit_saves');
    return saved ? JSON.parse(saved) : [];
  });
  const [profileTab, setProfileTab] = useState<'posts' | 'liked'>('posts');
  const [activeTab, setActiveTab] = useState<'home' | 'foryou'>('home');
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem('velvit_search_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [showHistory, setShowHistory] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isGeneratingFeed, setIsGeneratingFeed] = useState(false);
  const [followingUids, setFollowingUids] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [trendingPosts, setTrendingPosts] = useState<ContentItem[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  
  const aiRef = useRef<GoogleGenAI | null>(null);
  const { scrollY } = useScroll();
  
  // Header opacity and scale based on scroll
  const headerOpacity = useTransform(scrollY, [0, 80], [1, 0]);
  const headerScale = useTransform(scrollY, [0, 80], [1, 0.9]);
  const headerY = useTransform(scrollY, [0, 80], [0, -40]);
  const headerPointerEvents = useTransform(scrollY, [0, 80], ["auto", "none"]);

  useEffect(() => {
    // One-time reset to ensure app starts "zerado" as requested
    const hasReset = localStorage.getItem('velvit_v1_reset');
    if (!hasReset) {
      localStorage.clear();
      localStorage.setItem('velvit_v1_reset', 'true');
      window.location.reload();
      return;
    }

    // Test connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    // Auth listener
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setupAuthListeners(user.uid);
      } else {
        setFollowingUids([]);
        setNotifications([]);
        unsubscribeFollowing();
        unsubscribeNotifications();
      }
    });

    // Global Posts listener
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(100));
    const unsubscribePosts = onSnapshot(q, (snapshot) => {
      const fetchedPosts = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as ContentItem[];
      
      // Filter out archived posts for global feed
      const visiblePosts = fetchedPosts.filter(p => !(p as any).archived);
      setGlobalPosts(visiblePosts);
      
      // Trending logic: most likes/saves in last 24h (simulated by count fields)
      const trending = [...visiblePosts]
        .sort((a: any, b: any) => ((b.likesCount || 0) + (b.savesCount || 0)) - ((a.likesCount || 0) + (a.savesCount || 0)))
        .slice(0, 10);
      setTrendingPosts(trending);

      // Also update userPosts for the profile tab (include archived)
      if (auth.currentUser) {
        setUserPosts(fetchedPosts.filter(p => (p as any).authorUid === auth.currentUser?.uid));
      }
    }, (err) => {
      console.error("Error fetching posts:", err);
    });

    // Following listener
    let unsubscribeFollowing = () => {};
    let unsubscribeNotifications = () => {};

    const setupAuthListeners = (uid: string) => {
      const followQ = query(collection(db, 'following'), where('followerUid', '==', uid));
      unsubscribeFollowing = onSnapshot(followQ, (snapshot) => {
        setFollowingUids(snapshot.docs.map(doc => doc.data().followingUid));
      });

      const notifQ = query(
        collection(db, 'notifications'), 
        where('recipientUid', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
      unsubscribeNotifications = onSnapshot(notifQ, (snapshot) => {
        setNotifications(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      });
    };


    return () => {
      unsubscribeAuth();
      unsubscribePosts();
      unsubscribeFollowing();
      unsubscribeNotifications();
    };
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      generateFeed();
    }
  }, [activeTab, globalPosts]);

  const generateFeed = async () => {
    if (searchQuery.trim()) return;
    
    setIsGeneratingFeed(true);
    setError(null);

    try {
      if (!aiRef.current) {
        aiRef.current = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      }

      const likedThemes = likedItems.map(item => item.title).join(', ');
      const historyContext = searchHistory.slice(0, 5).join(', ');
      
      let prompt = '';
      if (activeTab === 'foryou') {
        prompt = `You are an intelligent aesthetic curator for VELVIT's "For You" feed. 
        The user has liked these themes: ${likedThemes}. 
        Recent searches: ${historyContext}.
        
        Generate a JSON list of 15 high-quality, visually stunning image and GIF URLs that perfectly match this user's unique aesthetic.
        Focus on creating a cohesive, personalized experience.
        
        Return an array of objects with: id (string), url (string), title (string), type ("image" or "gif"), height (number between 300 and 600).
        Use reliable public image hosting URLs (like Unsplash, Pexels, or Giphy). 
        IMPORTANT: Return ONLY the JSON array.`;
      } else {
        prompt = `You are an intelligent aesthetic curator for VELVIT's "Explore" feed. 
        Generate a JSON list of 15 high-quality, visually stunning image and GIF URLs representing current trending aesthetics (e.g., cyber-minimalism, organic brutalism, high-fashion editorial, ethereal tech).
        
        Return an array of objects with: id (string), url (string), title (string), type ("image" or "gif"), height (number between 300 and 600).
        Use reliable public image hosting URLs (like Unsplash, Pexels, or Giphy). 
        IMPORTANT: Return ONLY the JSON array.`;
      }

      const response = await aiRef.current.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      const aiDiscovery = JSON.parse(response.text || '[]');
      
      // Algorithmic Mix (70% Following, 20% Discovery, 10% Trending)
      let finalFeed: ContentItem[] = [];

      if (activeTab === 'foryou' && auth.currentUser) {
        // 70% Following
        const followingPosts = globalPosts.filter(p => followingUids.includes((p as any).authorUid));
        const followingCount = Math.floor(20 * 0.7);
        finalFeed.push(...followingPosts.slice(0, followingCount));

        // 20% Discovery (AI)
        const discoveryCount = Math.floor(20 * 0.2);
        finalFeed.push(...aiDiscovery.slice(0, discoveryCount));

        // 10% Trending
        const trendingCount = Math.floor(20 * 0.1);
        finalFeed.push(...trendingPosts.slice(0, trendingCount));

        // Fill remaining with global posts if needed
        if (finalFeed.length < 20) {
          const remaining = globalPosts.filter(p => !finalFeed.find(f => f.id === p.id));
          finalFeed.push(...remaining.slice(0, 20 - finalFeed.length));
        }
      } else {
        // Explore: Mix AI and Global
        finalFeed = [...aiDiscovery, ...globalPosts.slice(0, 10)];
      }

      // Temporal Decay & Re-ranking
      // Weight = (Interactions + 1) / (HoursSinceCreation + 2)^1.5
      const now = new Date().getTime();
      const rankedFeed = finalFeed.map(item => {
        const createdAt = new Date((item as any).createdAt || now).getTime();
        const hoursOld = (now - createdAt) / (1000 * 60 * 60);
        const interactions = ((item as any).likesCount || 0) + ((item as any).savesCount || 0);
        const score = (interactions + 1) / Math.pow(hoursOld + 2, 1.5);
        return { item, score };
      })
      .sort((a, b) => b.score - a.score)
      .map(entry => entry.item);

      // Avoid duplicates
      const unique = rankedFeed.filter((item, index, self) =>
        index === self.findIndex((t) => t.url === item.url)
      );

      setItems(unique);
    } catch (err) {
      console.error("Feed generation error:", err);
      setItems(globalPosts);
    } finally {
      setIsGeneratingFeed(false);
    }
  };

  const handleLogin = async () => {
    if (!loginUsername || loginUsername.length < 3) {
      setLoginError('O nome deve ter pelo menos 3 caracteres.');
      return;
    }
    if (!password || password.length < 6) {
      setLoginError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    const cleanName = loginUsername.trim().toLowerCase().replace(/\s+/g, '_');
    const email = `${cleanName}@velvit.app`;
    setLoginLoading(true);
    setLoginError(null);
    setSuggestions([]);

    try {
      const userDoc = await getDoc(doc(db, 'users', cleanName));
      
      if (userDoc.exists()) {
        setLoginError('Este nome de usuário já existe.');
        return;
      } else {
        // Create user in Firebase Auth
        let userCredential;
        try {
          userCredential = await createUserWithEmailAndPassword(auth, email, password);
        } catch (authErr) {
          handleFirestoreError(authErr, 'auth', null);
          return;
        }
        
        const uid = userCredential.user.uid;
        
        // Create user doc in Firestore
        await setDoc(doc(db, 'users', cleanName), {
          username: cleanName,
          uid: uid,
          createdAt: serverTimestamp()
        });
        
        setUsername(cleanName);
        setIsLoggedIn(true);
        localStorage.setItem('velvit_username', cleanName);
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('auth')) throw err;
      handleFirestoreError(err, OperationType.WRITE, `users/${cleanName}`);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSignIn = async () => {
    if (!loginUsername || loginUsername.length < 3) {
      setLoginError('O nome deve ter pelo menos 3 caracteres.');
      return;
    }
    if (!password) {
      setLoginError('Digite sua senha.');
      return;
    }

    const cleanName = loginUsername.trim().toLowerCase().replace(/\s+/g, '_');
    const email = `${cleanName}@velvit.app`;
    setLoginLoading(true);
    setLoginError(null);

    try {
      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      } catch (authErr) {
        handleFirestoreError(authErr, 'auth', null);
        return;
      }
      
      const uid = userCredential.user.uid;
      
      // Verify if firestore doc exists (it should)
      const userDoc = await getDoc(doc(db, 'users', cleanName));
      if (!userDoc.exists()) {
        // If auth exists but doc doesn't, create it
        await setDoc(doc(db, 'users', cleanName), {
          username: cleanName,
          uid: uid,
          createdAt: serverTimestamp()
        });
      } else {
        await updateDoc(doc(db, 'users', cleanName), {
          uid: uid,
          lastLogin: serverTimestamp()
        });
      }
      
      setUsername(cleanName);
      setIsLoggedIn(true);
      localStorage.setItem('velvit_username', cleanName);
    } catch (err) {
      if (err instanceof Error && err.message.includes('auth')) throw err;
      handleFirestoreError(err, OperationType.GET, `users/${cleanName}`);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleResetDatabase = async () => {
    if (auth.currentUser?.email !== 'lopexz.lx7@gmail.com') {
      alert("Apenas o administrador pode realizar esta ação.");
      return;
    }

    if (!window.confirm("ATENÇÃO: Isso irá apagar TODOS os posts, boards, notificações e seguidores do banco de dados. Deseja continuar?")) {
      return;
    }

    setLoading(true);
    try {
      const collections = ['posts', 'boards', 'notifications', 'following'];
      for (const collName of collections) {
        const snapshot = await getDocs(collection(db, collName));
        const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
      }
      
      localStorage.clear();
      window.location.reload();
    } catch (err) {
      console.error("Erro ao resetar banco de dados:", err);
      alert("Erro ao resetar banco de dados. Verifique o console.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('velvit_username');
  };

  const handleLike = async (id: string) => {
    // Prevent liking own posts
    if (userPosts.some(p => p.id === id)) return;

    const itemToLike = [...items, ...userPosts].find(i => i.id === id);
    if (!itemToLike) return;

    const isLiked = likedIds.includes(id);
    
    // Local state update
    setLikedIds(prev => isLiked ? prev.filter(i => i !== id) : [...prev, id]);
    setLikedItems(prev => isLiked ? prev.filter(i => i.id !== id) : [...prev, itemToLike]);

    // Firestore update
    if (auth.currentUser) {
      try {
        const interactionId = `${auth.currentUser.uid}_${id}_like`;
        if (isLiked) {
          await deleteDoc(doc(db, 'interactions', interactionId));
        } else {
          await setDoc(doc(db, 'interactions', interactionId), {
            uid: auth.currentUser.uid,
            postId: id,
            type: 'like',
            createdAt: new Date().toISOString()
          });
          
          // Trigger smart notification logic (simulated)
          // In a real app, this would be a Cloud Function
          if ((itemToLike as any).authorUid) {
            const recipientUid = (itemToLike as any).authorUid;
            const notifId = `${recipientUid}_like_group`;
            const notifDoc = await getDoc(doc(db, 'notifications', notifId));
            
            if (notifDoc.exists()) {
              const data = notifDoc.data();
              await setDoc(doc(db, 'notifications', notifId), {
                ...data,
                count: (data.count || 1) + 1,
                message: `Seu post está bombando! +${(data.count || 1) + 1} curtidas recentemente.`,
                read: false,
                createdAt: new Date().toISOString()
              });
            } else {
              await setDoc(doc(db, 'notifications', notifId), {
                recipientUid,
                type: 'like_group',
                message: `Alguém curtiu seu post!`,
                count: 1,
                read: false,
                createdAt: new Date().toISOString()
              });
            }
          }
        }
      } catch (err) {
        console.error("Error updating like:", err);
      }
    }
  };

  const handleSave = async (id: string) => {
    if (!auth.currentUser) return;
    
    const isSaved = savedIds.includes(id);
    setSavedIds(prev => isSaved ? prev.filter(i => i !== id) : [...prev, id]);
    localStorage.setItem('velvit_saves', JSON.stringify(isSaved ? savedIds.filter(i => i !== id) : [...savedIds, id]));

    try {
      const interactionId = `${auth.currentUser.uid}_${id}_save`;
      const interactionDoc = await getDoc(doc(db, 'interactions', interactionId));
      
      if (interactionDoc.exists()) {
        await deleteDoc(doc(db, 'interactions', interactionId));
      } else {
        await setDoc(doc(db, 'interactions', interactionId), {
          uid: auth.currentUser.uid,
          postId: id,
          type: 'save',
          createdAt: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error("Error updating save:", err);
    }
  };

  const handleView = async (id: string) => {
    if (!auth.currentUser) return;
    
    // Simple view tracking (throttle in real app)
    try {
      const interactionId = `${auth.currentUser.uid}_${id}_view`;
      await setDoc(doc(db, 'interactions', interactionId), {
        uid: auth.currentUser.uid,
        postId: id,
        type: 'view',
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      // Silent fail for views
    }
  };

  const handleFollow = async (targetUid: string) => {
    if (!auth.currentUser || auth.currentUser.uid === targetUid) return;
    
    const followId = `${auth.currentUser.uid}_${targetUid}`;
    const isFollowing = followingUids.includes(targetUid);

    try {
      if (isFollowing) {
        await deleteDoc(doc(db, 'following', followId));
      } else {
        await setDoc(doc(db, 'following', followId), {
          followerUid: auth.currentUser.uid,
          followingUid: targetUid,
          createdAt: new Date().toISOString()
        });
        
        // Notify user
        await addDoc(collection(db, 'notifications'), {
          recipientUid: targetUid,
          type: 'new_post', // Reusing type for simplicity
          message: `Um novo usuário começou a seguir você!`,
          read: false,
          createdAt: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error("Error updating follow:", err);
    }
  };

  const handleDeletePost = (id: string) => {
    setPostToDelete(id);
    setIsDeleteSheetOpen(true);
  };

  const confirmDeletePost = async () => {
    if (!postToDelete) return;
    try {
      await deleteDoc(doc(db, 'posts', postToDelete));
      setItems(prev => prev.filter(item => item.id !== postToDelete));
      setPostToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `posts/${postToDelete}`);
    }
  };

  const handleArchivePost = async () => {
    if (!postToDelete) return;
    try {
      await updateDoc(doc(db, 'posts', postToDelete), {
        archived: true,
        updatedAt: new Date().toISOString()
      });
      setItems(prev => prev.filter(item => item.id !== postToDelete));
      setPostToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `posts/${postToDelete}`);
    }
  };

  const handleHomeClick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setSearchQuery('');
    handleSearch('trending aesthetic');
  };

  const updateBackground = (url: string) => {
    setBgImage(url);
    localStorage.setItem('velvit_bg', url);
  };

  const resetBackground = () => {
    setBgImage(null);
    localStorage.removeItem('velvit_bg');
  };

  const updateProfilePic = (url: string) => {
    setProfilePic(url);
    localStorage.setItem('velvit_profile_pic', url);
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>, type: 'bg' | 'profile' | 'post') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      if (type === 'bg') {
        updateBackground(base64String);
      } else if (type === 'profile') {
        updateProfilePic(base64String);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSearch = async (query: string) => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setShowHistory(false);
    
    // Save to history
    setSearchHistory(prev => {
      const newHistory = [query, ...prev.filter(q => q !== query)].slice(0, 10);
      localStorage.setItem('velvit_search_history', JSON.stringify(newHistory));
      return newHistory;
    });
    
    try {
      if (!aiRef.current) {
        aiRef.current = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      }

      // Algorithm logic: Get themes from liked items and search history
      const likedItems = items.filter(item => likedIds.includes(item.id));
      const likedThemes = likedItems.map(item => item.title).join(', ');
      const historyContext = searchHistory.slice(0, 5).join(', ');
      
      const algoContext = activeTab === 'foryou' 
        ? `The user likes these themes: ${likedThemes}. Recent searches: ${historyContext}. Prioritize similar aesthetic content.`
        : '';

      const prompt = `You are an intelligent aesthetic search engine for VELVIT. 
      The user is searching for: "${query}". 
      ${algoContext}
      
      Based on this query and user preferences, generate a JSON list of 15 high-quality, visually stunning image and GIF URLs.
      Prioritize content that matches the user's specific aesthetic if provided in the context.
      
      Return an array of objects with: id (string), url (string), title (string), type ("image" or "gif"), height (number between 300 and 600).
      Use reliable public image hosting URLs (like Unsplash, Pexels, or Giphy). 
      IMPORTANT: Return ONLY the JSON array.`;

      const response = await aiRef.current.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      const aiData = JSON.parse(response.text || '[]');
      
      // Integrate Global Posts into search
      const matchingGlobalPosts = globalPosts.filter(post => 
        post.title.toLowerCase().includes(query.toLowerCase()) ||
        query.toLowerCase().includes(post.title.toLowerCase())
      );

      // Combine and remove duplicates (by URL)
      const combined = [...matchingGlobalPosts, ...aiData];
      const unique = combined.filter((item, index, self) =>
        index === self.findIndex((t) => t.url === item.url)
      );

      setItems(unique);
    } catch (err) {
      console.error(err);
      setError("Failed to fetch content. Please try again.");
      // Fallback data if API fails
      setItems([
        { id: '1', url: 'https://picsum.photos/seed/velvit1/400/600', title: 'Velvit Aesthetic 01', type: 'image', height: 600 },
        { id: '2', url: 'https://picsum.photos/seed/velvit2/400/400', title: 'Velvit Aesthetic 02', type: 'image', height: 400 },
        { id: '3', url: 'https://picsum.photos/seed/velvit3/400/700', title: 'Velvit Aesthetic 03', type: 'image', height: 700 },
        { id: '4', url: 'https://picsum.photos/seed/velvit4/400/500', title: 'Velvit Aesthetic 04', type: 'image', height: 500 },
        { id: '5', url: 'https://picsum.photos/seed/velvit5/400/800', title: 'Velvit Aesthetic 05', type: 'image', height: 800 },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-space-gray-900 relative overflow-hidden">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel max-w-md w-full p-10 rounded-[40px] text-center relative z-10"
        >
          <h1 className="text-5xl font-black tracking-tighter text-white mb-10">VELVIT</h1>

          <div className="space-y-6 text-left">
            <div>
              <span className="text-[10px] uppercase tracking-widest text-white/30 mb-3 block">
                {authMode === 'register' ? 'Escolha seu nome de usuário' : 'Digite seu nome de usuário'}
              </span>
              <div className="relative mb-4">
                <input 
                  type="text" 
                  placeholder="Ex: aesthetic_user"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className={`w-full h-14 bg-white/5 border ${loginError ? 'border-red-500/50' : 'border-white/10'} rounded-2xl px-6 text-white focus:outline-none focus:border-white/30 transition-all`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const input = document.getElementById('passwordInput') as HTMLInputElement;
                      if (input) input.focus();
                    }
                  }}
                  id="usernameInput"
                />
              </div>

              <span className="text-[10px] uppercase tracking-widest text-white/30 mb-3 block">Sua Senha</span>
              <div className="relative">
                <input 
                  type="password" 
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full h-14 bg-white/5 border ${loginError ? 'border-red-500/50' : 'border-white/10'} rounded-2xl px-6 text-white focus:outline-none focus:border-white/30 transition-all`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      authMode === 'register' ? handleLogin() : handleSignIn();
                    }
                  }}
                  id="passwordInput"
                />
                {loginLoading && (
                  <Loader2 className="absolute right-5 top-1/2 -translate-y-1/2 text-white/30 animate-spin" size={20} />
                )}
              </div>
              
              <AnimatePresence>
                {loginError && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 flex items-start gap-2 text-red-400 text-xs"
                  >
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>{loginError}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {suggestions.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6"
                  >
                    <span className="text-[10px] uppercase tracking-widest text-white/20 mb-3 block">Sugestões disponíveis:</span>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.map(s => (
                        <button 
                          key={s}
                          onClick={() => {
                            setLoginUsername(s);
                            // We need to wait for state update or pass it directly
                            // For simplicity, let's just set the state and the user can click the button
                            // Or we can refactor handleLogin to accept an optional name
                          }}
                          className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-[10px] text-white/60 transition-all"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button 
              onClick={() => {
                authMode === 'register' ? handleLogin() : handleSignIn();
              }}
              disabled={loginLoading}
              className="w-full py-5 bg-white text-black font-black rounded-2xl hover:bg-white/90 transition-all active:scale-95 disabled:opacity-50 mt-4 uppercase tracking-widest text-xs"
            >
              {authMode === 'register' ? 'Começar Jornada' : 'Entrar no App'}
            </button>

            <button 
              onClick={() => {
                setAuthMode(authMode === 'register' ? 'login' : 'register');
                setLoginError(null);
                setSuggestions([]);
              }}
              disabled={loginLoading}
              className="w-full py-2 text-[10px] uppercase tracking-[0.3em] text-white/30 hover:text-white transition-all mt-2"
            >
              {authMode === 'register' ? (
                <>Já tenho conta? <span className="text-white font-bold underline underline-offset-4">Entrar</span></>
              ) : (
                <>Novo por aqui? <span className="text-white font-bold underline underline-offset-4">Criar Conta</span></>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen relative pb-32">
      {/* Background Layer */}
      <div className="fixed inset-0 z-[-2] bg-space-gray-900" />
      
      {/* Custom Background Image */}
      <AnimatePresence>
        {bgImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[-1]"
          >
            <img 
              src={bgImage} 
              alt="Background" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-space-gray-900/50 via-space-gray-900/80 to-space-gray-900" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Liquid Background Blobs (only visible when no custom bg or as overlay) */}
      <div className="liquid-bg opacity-50">
        <div className="liquid-blob w-[500px] h-[500px] bg-white/10 top-[-10%] left-[-10%]" />
        <div className="liquid-blob w-[400px] h-[400px] bg-space-gray-600/20 bottom-[-5%] right-[-5%]" style={{ animationDelay: '-5s' }} />
        <div className="liquid-blob w-[300px] h-[300px] bg-white/5 top-[40%] right-[20%]" style={{ animationDelay: '-10s' }} />
      </div>

      {/* Header / Search - Animated to hide on scroll */}
      <motion.header 
        style={{ 
          opacity: headerOpacity, 
          scale: headerScale, 
          y: headerY,
          pointerEvents: headerPointerEvents as any
        }}
        className="sticky top-0 z-40 px-6 py-8"
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={handleHomeClick}
            className="text-3xl md:text-4xl font-black tracking-tighter text-white cursor-pointer"
          >
            VELVIT
          </motion.h1>

          <div className="relative w-full md:w-[500px] flex items-center gap-4">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search anything..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setShowHistory(true)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
                className="w-full h-14 pl-14 pr-6 bg-white/5 backdrop-blur-md border border-white/10 rounded-full text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-all relative z-50"
              />
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30 z-50" size={20} />
              {loading && (
                <Loader2 className="absolute right-5 top-1/2 -translate-y-1/2 text-white/30 animate-spin z-50" size={20} />
              )}
            </div>

            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-4 bg-white/5 backdrop-blur-md border border-white/10 rounded-full text-white/50 hover:text-white transition-all z-50"
            >
              <Bell size={20} />
              {notifications.some(n => !n.read) && (
                <span className="absolute top-3 right-3 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </button>

            {/* Notifications Panel */}
            <AnimatePresence>
              {showNotifications && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full right-0 mt-4 w-80 glass-panel rounded-3xl z-[60] border border-white/10 overflow-hidden shadow-2xl"
                >
                  <div className="p-4 border-b border-white/5 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-widest text-white">Notificações</span>
                    <button onClick={() => setShowNotifications(false)} className="text-white/30 hover:text-white"><X size={16} /></button>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-white/20 text-xs uppercase tracking-widest">Nenhuma notificação</div>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} className={`p-4 border-b border-white/5 hover:bg-white/5 transition-colors ${!n.read ? 'bg-white/5' : ''}`}>
                          <p className="text-xs text-white/80 leading-relaxed">{n.message}</p>
                          <span className="text-[10px] text-white/30 mt-2 block">{new Date(n.createdAt).toLocaleDateString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Search History Dropdown */}
            <AnimatePresence>
              {showHistory && (
                <>
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowHistory(false)}
                    className="fixed inset-0 z-40"
                  />
                  {searchHistory.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute top-full left-0 right-0 mt-2 p-4 glass-panel rounded-2xl z-50 border border-white/10"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] uppercase tracking-widest text-white/30">Buscas Recentes</span>
                        <button 
                          onClick={() => {
                            setSearchHistory([]);
                            localStorage.removeItem('velvit_search_history');
                          }}
                          className="text-[10px] uppercase tracking-widest text-white/30 hover:text-white transition-colors"
                        >
                          Limpar
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {searchHistory.map((q, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              setSearchQuery(q);
                              handleSearch(q);
                            }}
                            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-full text-xs text-white/70 hover:text-white transition-all border border-white/5"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.header>

      {/* Main Content */}
      <main className="px-4 md:px-6 pb-24 max-w-7xl mx-auto">
        {/* Tabs */}
        <div className="flex items-center justify-between mb-8 border-b border-white/5">
          <div className="flex items-center gap-6 md:gap-8 overflow-x-auto no-scrollbar">
            <button 
              onClick={() => {
                setActiveTab('home');
              }}
              className={`pb-4 text-sm font-bold uppercase tracking-widest transition-all relative ${activeTab === 'home' ? 'text-white' : 'text-white/30 hover:text-white/50'}`}
            >
              Explorar
              {activeTab === 'home' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />}
            </button>
            <button 
              onClick={() => {
                setActiveTab('foryou');
              }}
              className={`pb-4 text-sm font-bold uppercase tracking-widest transition-all relative ${activeTab === 'foryou' ? 'text-white' : 'text-white/30 hover:text-white/50'}`}
            >
              Para Você
              {activeTab === 'foryou' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />}
            </button>
          </div>

          {!searchQuery && activeTab === 'foryou' && (
            <button 
              onClick={() => generateFeed()}
              disabled={isGeneratingFeed}
              className="pb-4 text-[10px] font-bold uppercase tracking-widest text-white/30 hover:text-white transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <RotateCcw size={12} className={isGeneratingFeed ? 'animate-spin' : ''} />
              {isGeneratingFeed ? 'Atualizando...' : 'Atualizar Algoritmo'}
            </button>
          )}
        </div>

        {/* Recommendations Section */}
        {activeTab === 'foryou' && likedItems.length > 0 && !searchQuery && (
          <div className="mb-12">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-1 h-4 bg-white rounded-full" />
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">Porque você curtiu {likedItems[likedItems.length - 1].title}</h2>
            </div>
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4">
              {items.slice(0, 5).map(item => (
                <div key={`rec-${item.id}`} className="min-w-[200px] w-[200px]">
                  <GlassCard 
                    item={item} 
                    isLiked={likedIds.includes(item.id)}
                    isSaved={savedIds.includes(item.id)}
                    isFollowing={followingUids.includes((item as any).authorUid)}
                    onLike={handleLike}
                    onSave={handleSave}
                    onFollow={handleFollow}
                    onView={handleView}
                    isUserPost={(item as any).authorUid === auth.currentUser?.uid}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mb-8 p-4 glass-panel rounded-xl flex items-center gap-3 text-white/70">
            <Info size={18} />
            <p>{error}</p>
          </div>
        )}

        <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4">
          {isGeneratingFeed && items.length === 0 ? (
            Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="mb-4 glass-panel rounded-2xl animate-pulse" style={{ height: 300 + Math.random() * 200 }} />
            ))
          ) : (
            items.map((item) => (
              <GlassCard 
                key={item.id} 
                item={item} 
                isLiked={likedIds.includes(item.id)}
                isSaved={savedIds.includes(item.id)}
                isFollowing={followingUids.includes((item as any).authorUid)}
                onLike={handleLike}
                onSave={handleSave}
                onFollow={handleFollow}
                onView={handleView}
                onDelete={handleDeletePost}
                isUserPost={(item as any).authorUid === auth.currentUser?.uid}
              />
            ))
          )}
        </div>

        {items.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-40 text-white/30">
            <Search size={48} className="mb-4 opacity-20" />
            <p className="text-xl font-medium">Explore o VELVIT</p>
            <p className="text-sm mt-2">Faça uma busca para começar sua jornada estética.</p>
          </div>
        )}
      </main>

      {/* Floating Navigation */}
      <FloatingNav 
        onHomeClick={handleHomeClick}
        onAddClick={() => setShowPublishModal(true)}
        onProfileClick={() => setShowPlaceholderModal('profile')}
      />

      {/* Modals */}
      <DeleteBottomSheet 
        isOpen={isDeleteSheetOpen}
        onClose={() => {
          setIsDeleteSheetOpen(false);
          setPostToDelete(null);
        }}
        onDelete={confirmDeletePost}
        onArchive={handleArchivePost}
      />

      <PublishModal 
        isOpen={showPublishModal} 
        onClose={() => setShowPublishModal(false)}
        onSuccess={() => {
          generateFeed();
          setShowPublishModal(false);
        }}
      />

      <AnimatePresence>
        {showPlaceholderModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-6 bg-black/80 backdrop-blur-md"
            onClick={() => setShowPlaceholderModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="glass-panel p-6 md:p-8 rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {showPlaceholderModal === 'profile' && (
                <div className="flex flex-col gap-8">
                  {/* Profile Header */}
                  <div className="flex flex-col md:flex-row items-center gap-8 border-b border-white/10 pb-8">
                    <div className="relative group">
                      <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white/10 group-hover:border-white/30 transition-all bg-white/5 flex items-center justify-center">
                        {profilePic ? (
                          <img src={profilePic} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          <User size={48} className="text-white/20" />
                        )}
                      </div>
                      <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-full">
                        <ImageIcon size={24} />
                        <input 
                          type="file" 
                          accept="image/*"
                          className="hidden" 
                          onChange={(e) => handleFileSelect(e, 'profile')}
                        />
                      </label>
                    </div>
                    
                    <div className="flex-1 text-center md:text-left">
                      <div className="flex flex-col md:flex-row items-center gap-4 mb-2">
                        <h2 className="text-3xl font-black tracking-tighter uppercase text-white">@{username}</h2>
                        <button 
                          onClick={handleLogout}
                          className="px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-[10px] uppercase tracking-widest text-white/50 hover:text-white transition-all"
                        >
                          Sair
                        </button>

                        {auth.currentUser?.email === 'lopexz.lx7@gmail.com' && (
                          <button 
                            onClick={handleResetDatabase}
                            className="px-4 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-full text-[10px] uppercase tracking-widest text-red-500 transition-all"
                          >
                            Resetar DB
                          </button>
                        )}
                      </div>
                      
                      <div className="flex flex-wrap gap-4 justify-center md:justify-start mt-4">
                        <label className="flex flex-col gap-1 cursor-pointer">
                          <span className="text-[10px] uppercase tracking-widest text-white/30">Mudar Fundo</span>
                          <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-xs hover:bg-white/10 transition-colors flex items-center gap-2">
                            <ImageIcon size={14} /> Escolher Foto
                          </div>
                          <input 
                            type="file" 
                            accept="image/*"
                            className="hidden" 
                            onChange={(e) => handleFileSelect(e, 'bg')}
                          />
                        </label>
                        
                        <label className="flex flex-col gap-1 cursor-pointer">
                          <span className="text-[10px] uppercase tracking-widest text-white/30">Mudar Perfil</span>
                          <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-xs hover:bg-white/10 transition-colors flex items-center gap-2">
                            <User size={14} /> Escolher Foto
                          </div>
                          <input 
                            type="file" 
                            accept="image/*"
                            className="hidden" 
                            onChange={(e) => handleFileSelect(e, 'profile')}
                          />
                        </label>

                        <button 
                          onClick={resetBackground}
                          className="mt-auto p-2 bg-white/5 border border-white/10 rounded-lg text-white/50 hover:text-white transition-colors"
                          title="Resetar Fundo"
                        >
                          <RotateCcw size={16} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Tabs Toggle */}
                  <div className="flex gap-4 mb-8 border-b border-white/5">
                    <button 
                      onClick={() => setProfileTab('posts')}
                      className={`pb-4 text-xs font-bold uppercase tracking-widest transition-all relative ${
                        profileTab === 'posts' ? 'text-white' : 'text-white/30 hover:text-white/50'
                      }`}
                    >
                      Meus Posts ({userPosts.length})
                      {profileTab === 'posts' && (
                        <motion.div layoutId="profileTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
                      )}
                    </button>
                    <button 
                      onClick={() => setProfileTab('liked')}
                      className={`pb-4 text-xs font-bold uppercase tracking-widest transition-all relative ${
                        profileTab === 'liked' ? 'text-white' : 'text-white/30 hover:text-white/50'
                      }`}
                    >
                      Curtidos ({likedItems.length})
                      {profileTab === 'liked' && (
                        <motion.div layoutId="profileTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
                      )}
                    </button>
                  </div>

                  {/* Content Section */}
                  <div>
                    {profileTab === 'posts' ? (
                      userPosts.length > 0 ? (
                        <div className="columns-2 sm:columns-3 gap-4">
                          {userPosts.map((post) => (
                            <GlassCard 
                              key={post.id} 
                              item={post} 
                              isLiked={likedIds.includes(post.id)}
                              onLike={handleLike}
                              onDelete={handleDeletePost}
                              isUserPost={true}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="py-12 text-center border-2 border-dashed border-white/5 rounded-2xl">
                          <p className="text-white/20 text-sm">Você ainda não postou nada.</p>
                        </div>
                      )
                    ) : (
                      likedItems.length > 0 ? (
                        <div className="columns-2 sm:columns-3 gap-4">
                          {likedItems.map((item) => (
                            <GlassCard 
                              key={item.id} 
                              item={item} 
                              isLiked={likedIds.includes(item.id)}
                              onLike={handleLike}
                              isUserPost={(item as any).authorUid === auth.currentUser?.uid}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="py-12 text-center border-2 border-dashed border-white/5 rounded-2xl">
                          <p className="text-white/20 text-sm">Você ainda não curtiu nada.</p>
                        </div>
                      )
                    )}
                  </div>

                  <button 
                    onClick={() => setShowPlaceholderModal(null)}
                    className="w-full py-4 bg-white text-black font-bold rounded-2xl mt-4"
                  >
                    Fechar
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}


