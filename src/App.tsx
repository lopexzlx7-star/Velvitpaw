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
  onSnapshot,
  increment 
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
import PostDetailModal from './components/PostDetailModal';

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
  const [showPublishModal, setShowPublishModal] = useState(false);
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
  const [aiSuggestedTags, setAiSuggestedTags] = useState<string[]>(['Aesthetic', 'Nature', 'Art', 'Tech', 'Fashion', 'Architecture', 'Travel', 'Food']);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  // AI Recommendation Engine
  useEffect(() => {
    const generateAIRecommendations = async () => {
      if (likedItems.length === 0 || isGeneratingAI) return;
      
      setIsGeneratingAI(true);
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const likedTitles = likedItems.map(i => i.title).join(', ');
        const prompt = `Based on these liked posts: "${likedTitles}", suggest 8 short, one-word, uppercase trending search categories or tags for a visual social media app. Return ONLY a JSON array of strings.`;
        
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-latest",
          contents: prompt,
          config: { responseMimeType: "application/json" }
        });

        const suggestions = JSON.parse(response.text);
        if (Array.isArray(suggestions) && suggestions.length > 0) {
          setAiSuggestedTags(suggestions);
        }
      } catch (error) {
        console.error("AI Recommendation Error:", error);
      } finally {
        setIsGeneratingAI(false);
      }
    };

    // Generate every 5 likes or on first like
    if (likedItems.length > 0 && likedItems.length % 3 === 0) {
      generateAIRecommendations();
    }
  }, [likedItems.length]);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem('velvit_search_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [showHistory, setShowHistory] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isGeneratingFeed, setIsGeneratingFeed] = useState(true);
  const [followingUids, setFollowingUids] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [trendingPosts, setTrendingPosts] = useState<ContentItem[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [currentTab, setCurrentTab] = useState<'feed' | 'search' | 'profile'>('feed');
  const [selectedPost, setSelectedPost] = useState<ContentItem | null>(null);
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  
  const aiRef = useRef<GoogleGenAI | null>(null);
  const { scrollY } = useScroll();
  
  // Header opacity and scale based on scroll
  const headerOpacity = 1;
  const headerScale = 1;
  const headerY = 0;
  const headerPointerEvents = "auto";

  useEffect(() => {
    // One-time reset to ensure app starts "zerado" as requested
    const resetVersion = 'v2_total_reset';
    const hasReset = localStorage.getItem('velvit_reset_flag');
    if (hasReset !== resetVersion) {
      localStorage.clear();
      localStorage.setItem('velvit_reset_flag', resetVersion);
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
    const q = query(collection(db, 'posts'), limit(100));
    const unsubscribePosts = onSnapshot(q, (snapshot) => {
      const fetchedPosts = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as ContentItem[];
      
      // Sort client-side to avoid index issues
      fetchedPosts.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });

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
      
      setIsGeneratingFeed(false);
    }, (err) => {
      console.error("Error fetching posts:", err);
      setError("Erro ao carregar posts: " + err.message);
      setIsGeneratingFeed(false);
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
      setItems(globalPosts);
    }
  }, [globalPosts, searchQuery]);

  const handleLogin = async () => {
    if (!loginUsername || loginUsername.length < 3) {
      setLoginError('O nome deve ter pelo menos 3 caracteres.');
      return;
    }
    if (!password || password.length < 6) {
      setLoginError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    const cleanName = loginUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (cleanName.length < 3) {
      setLoginError('O nome de usuário resultante é muito curto ou inválido.');
      setLoginLoading(false);
      return;
    }
    const email = `${cleanName}@velvit.app`;
    setLoginLoading(true);
    setLoginError(null);
    setSuggestions([]);

    try {
      const userDoc = await getDoc(doc(db, 'users', cleanName));
      
      if (userDoc.exists()) {
        setLoginError('Este nome de usuário já existe.');
        setLoginLoading(false);
        return;
      } else {
        // Create user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
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
    } catch (err: any) {
      let displayError = "Erro ao criar conta. Tente novamente.";
      
      // Handle Firebase Auth errors specifically
      if (err.code === 'auth/email-already-in-use') {
        displayError = "Este nome de usuário já está em uso.";
      } else if (err.code === 'auth/invalid-email') {
        displayError = "Nome de usuário inválido.";
      } else if (err.code === 'auth/operation-not-allowed') {
        displayError = "O login por e-mail/senha não está ativado no Firebase.";
      } else if (err.code === 'auth/weak-password') {
        displayError = "A senha é muito fraca.";
      } else if (err.message && err.message.includes('{')) {
        try {
          const parsed = JSON.parse(err.message);
          if (parsed.error) displayError = parsed.error;
        } catch {
          displayError = err.message;
        }
      }
      
      setLoginError(displayError);
      console.error("Login Error:", err);
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

    const cleanName = loginUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (cleanName.length < 3) {
      setLoginError('O nome de usuário resultante é muito curto ou inválido.');
      setLoginLoading(false);
      return;
    }
    const email = `${cleanName}@velvit.app`;
    setLoginLoading(true);
    setLoginError(null);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
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
    } catch (err: any) {
      let displayError = "Usuário ou senha incorretos.";
      
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        displayError = "Usuário ou senha incorretos.";
      } else if (err.code === 'auth/too-many-requests') {
        displayError = "Muitas tentativas. Tente novamente mais tarde.";
      } else if (err.message && err.message.includes('{')) {
        try {
          const parsed = JSON.parse(err.message);
          if (parsed.error) displayError = parsed.error;
        } catch {
          displayError = err.message;
        }
      }
      
      setLoginError(displayError);
      console.error("SignIn Error:", err);
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
    const itemToLike = [...items, ...userPosts].find(i => i.id === id);
    if (!itemToLike) return;

    const isLiked = likedIds.includes(id);
    
    // Optimistic UI update for counts
    const updateItems = (prev: ContentItem[]) => prev.map(item => {
      if (item.id === id) {
        return {
          ...item,
          likesCount: Math.max(0, (item.likesCount || 0) + (isLiked ? -1 : 1))
        };
      }
      return item;
    });

    setItems(updateItems);
    setGlobalPosts(updateItems);
    setUserPosts(updateItems);
    
    // Local state update for liked IDs
    setLikedIds(prev => isLiked ? prev.filter(i => i !== id) : [...prev, id]);
    setLikedItems(prev => isLiked ? prev.filter(i => i.id !== id) : [...prev, { ...itemToLike, likesCount: Math.max(0, (itemToLike.likesCount || 0) + (isLiked ? -1 : 1)) }]);

    // Firestore update
    if (auth.currentUser) {
      const interactionId = `${auth.currentUser.uid}_${id}_like`;
      try {
        const postRef = doc(db, 'posts', id);

        if (isLiked) {
          await deleteDoc(doc(db, 'interactions', interactionId));
          // Only decrement if current count is > 0
          if ((itemToLike.likesCount || 0) > 0) {
            await updateDoc(postRef, {
              likesCount: increment(-1)
            });
          }
        } else {
          await setDoc(doc(db, 'interactions', interactionId), {
            uid: auth.currentUser.uid,
            postId: id,
            type: 'like',
            createdAt: new Date().toISOString()
          });
          await updateDoc(postRef, {
            likesCount: increment(1)
          });
        }
      } catch (err) {
        handleFirestoreError(err, isLiked ? OperationType.DELETE : OperationType.WRITE, `interactions/${interactionId}`);
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
      const postRef = doc(db, 'posts', id);
      
      if (isSaved) {
        await deleteDoc(doc(db, 'interactions', interactionId));
        await updateDoc(postRef, {
          savesCount: increment(-1)
        });
      } else {
        await setDoc(doc(db, 'interactions', interactionId), {
          uid: auth.currentUser.uid,
          postId: id,
          type: 'save',
          createdAt: new Date().toISOString()
        });
        await updateDoc(postRef, {
          savesCount: increment(1)
        });
      }
    } catch (err) {
      handleFirestoreError(err, isSaved ? OperationType.DELETE : OperationType.WRITE, `interactions/${auth.currentUser.uid}_${id}_save`);
    }
  };

  const handleView = async (id: string) => {
    if (!auth.currentUser) return;
    
    // Simple view tracking (throttle in real app)
    try {
      const interactionId = `${auth.currentUser.uid}_${id}_view`;
      const postRef = doc(db, 'posts', id);
      
      await setDoc(doc(db, 'interactions', interactionId), {
        uid: auth.currentUser.uid,
        postId: id,
        type: 'view',
        createdAt: new Date().toISOString()
      });
      
      await updateDoc(postRef, {
        viewsCount: increment(1)
      });
    } catch (err) {
      // Silent fail for views or log if needed
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
      }
    } catch (err) {
      console.error("Error updating follow:", err);
    }
  };

  const handleDeletePost = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'posts', id));
      setItems(prev => prev.filter(item => item.id !== id));
      setGlobalPosts(prev => prev.filter(item => item.id !== id));
      setUserPosts(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `posts/${id}`);
    }
  };

  const handleHomeClick = () => {
    if (currentTab !== 'feed') {
      setCurrentTab('feed');
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setSearchQuery('');
    setItems(globalPosts);
  };

  const handleUpdateUsername = async () => {
    if (!newUsername.trim() || !auth.currentUser) return;
    const cleanName = newUsername.trim().toLowerCase().replace(/\s/g, '');
    
    try {
      const userRef = doc(db, 'users', cleanName);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists() && userDoc.data().uid !== auth.currentUser.uid) {
        alert("Este nome de usuário já está em uso.");
        return;
      }

      await updateDoc(doc(db, 'users', username), { username: cleanName });
      setUsername(cleanName);
      localStorage.setItem('velvit_username', cleanName);
      setIsEditingUsername(false);
    } catch (err) {
      console.error("Error updating username:", err);
      alert("Erro ao atualizar nome de usuário.");
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm("TEM CERTEZA? Esta ação é irreversível e apagará todos os seus dados.")) return;
    
    try {
      // Delete user posts
      const q = query(collection(db, 'posts'), where('authorUid', '==', auth.currentUser?.uid));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      // Delete user doc
      await deleteDoc(doc(db, 'users', username));
      
      handleLogout();
      window.location.reload();
    } catch (err) {
      console.error("Error deleting account:", err);
      alert("Erro ao excluir conta.");
    }
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
      const newHistory = [query, ...prev.filter(q => q !== query)].slice(0, 4);
      localStorage.setItem('velvit_search_history', JSON.stringify(newHistory));
      return newHistory;
    });
    
    try {
      // Search only real posts from Firestore
      const matchingGlobalPosts = globalPosts.filter(post => 
        post.title.toLowerCase().includes(query.toLowerCase()) ||
        query.toLowerCase().includes(post.title.toLowerCase())
      );

      setItems(matchingGlobalPosts);
    } catch (err) {
      console.error(err);
      setError("Failed to fetch content. Please try again.");
      setItems([]);
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
        className="sticky top-0 z-50 px-6 py-8"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-center">
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={handleHomeClick}
            className="text-3xl md:text-4xl font-black tracking-tighter text-white cursor-pointer"
          >
            VELVIT
          </motion.h1>
        </div>
      </motion.header>

      {/* Main Content */}
      <main className="relative min-h-screen">
        <AnimatePresence initial={false}>
          {currentTab === 'feed' && (
            <motion.div
              key="feed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 pt-24 overflow-y-auto no-scrollbar z-30"
            >
              <div className="px-4 md:px-6 pb-24 max-w-7xl mx-auto">
                {/* Search and Notifications Row */}
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setCurrentTab('search')}
                      className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-white/50 hover:text-white transition-all flex items-center gap-3"
                    >
                      <Search size={20} />
                      <span className="text-[10px] uppercase tracking-widest font-bold">Pesquisar</span>
                    </button>
                  </div>

                  <div className="relative">
                    <button 
                      onClick={() => setShowNotifications(!showNotifications)}
                      className="relative p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-white/50 hover:text-white transition-all"
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
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center justify-between mb-8 border-b border-white/5">
                  <div className="flex items-center gap-6 md:gap-8 overflow-x-auto no-scrollbar">
                    <button 
                      onClick={() => setActiveTab('home')}
                      className={`pb-4 text-sm font-bold uppercase tracking-widest transition-all relative ${activeTab === 'home' ? 'text-white' : 'text-white/30 hover:text-white/50'}`}
                    >
                      Explorar
                      {activeTab === 'home' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />}
                    </button>
                    <button 
                      onClick={() => setActiveTab('foryou')}
                      className={`pb-4 text-sm font-bold uppercase tracking-widest transition-all relative ${activeTab === 'foryou' ? 'text-white' : 'text-white/30 hover:text-white/50'}`}
                    >
                      Para Você
                      {activeTab === 'foryou' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />}
                    </button>
                  </div>
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
                            onClick={() => setSelectedPost(item)}
                            isUserPost={(item as any).authorUid === auth.currentUser?.uid}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4">
                  {isGeneratingFeed && items.length === 0 ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} className="mb-4 glass-panel rounded-2xl animate-pulse" style={{ height: [250, 300, 400, 600][i % 4] }} />
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
                        onDelete={handleDeletePost}
                        onClick={() => setSelectedPost(item)}
                        isUserPost={(item as any).authorUid === auth.currentUser?.uid}
                      />
                    ))
                  )}
                </div>

                {items.length === 0 && !loading && !isGeneratingFeed && (
                  <div className="flex flex-col items-center justify-center py-40 text-center">
                    <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
                      <ImageIcon size={32} className="text-white/10" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2 uppercase tracking-tighter">O feed está vazio</h3>
                    <p className="text-white/40 text-xs max-w-xs leading-relaxed uppercase tracking-widest mx-auto">
                      Nenhuma publicação encontrada no banco de dados. Seja o primeiro a compartilhar algo incrível.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {currentTab === 'search' && (
            <motion.div
              key="search"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 pt-24 overflow-y-auto no-scrollbar bg-black/40 backdrop-blur-sm z-30"
            >
              <div className="px-4 md:px-6 pb-24 max-w-7xl mx-auto">
                {/* Search Bar in Search Tab */}
                <div className="relative mb-8">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Pesquisar..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => setShowHistory(true)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
                      className="w-full h-16 pl-14 pr-6 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-all"
                    />
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30" size={20} />
                    {loading && (
                      <Loader2 className="absolute right-5 top-1/2 -translate-y-1/2 text-white/30 animate-spin" size={20} />
                    )}
                  </div>

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
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute top-full left-0 right-0 mt-2 p-4 glass-panel rounded-2xl z-50 border border-white/10 max-h-[70vh] overflow-y-auto no-scrollbar"
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
                          <div className="flex flex-wrap gap-2 mb-6">
                            {searchHistory.map((q, i) => (
                              <button
                                key={i}
                                onClick={() => {
                                  setSearchQuery(q);
                                  handleSearch(q);
                                  setShowHistory(false);
                                }}
                                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-full text-xs text-white/70 hover:text-white transition-all border border-white/5"
                              >
                                {q}
                              </button>
                            ))}
                          </div>

                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-[10px] uppercase tracking-widest text-white/30">Sugestões da IA</span>
                            {isGeneratingAI && <Loader2 size={10} className="animate-spin text-white/30" />}
                          </div>
                          <div className="flex flex-wrap gap-2 mb-6">
                            {aiSuggestedTags.slice(0, 4).map((tag, i) => (
                              <button
                                key={`ai-sug-${i}`}
                                onClick={() => {
                                  setSearchQuery(tag);
                                  handleSearch(tag);
                                  setShowHistory(false);
                                }}
                                className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-full text-xs text-emerald-400 hover:text-emerald-300 transition-all border border-emerald-500/20"
                              >
                                {tag}
                              </button>
                            ))}
                          </div>

                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-[10px] uppercase tracking-widest text-white/30">Recomendações</span>
                          </div>
                          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                            {globalPosts.slice(0, 6).map(item => (
                              <button
                                key={`search-rec-${item.id}`}
                                onClick={() => {
                                  setSearchQuery(item.title);
                                  handleSearch(item.title);
                                  setShowHistory(false);
                                }}
                                className="min-w-[120px] aspect-[4/5] rounded-xl overflow-hidden relative group"
                              >
                                <img src={item.url} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" alt="" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-2">
                                  <span className="text-[8px] text-white font-bold truncate uppercase tracking-tighter">{item.title}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>

                <div className="glass-panel p-8 rounded-3xl mb-8">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-3xl font-black tracking-tighter uppercase">Explorar</h2>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-widest text-white/30">Curadoria IA</span>
                      {isGeneratingAI && <Loader2 size={12} className="animate-spin text-white/30" />}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {aiSuggestedTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => {
                          setSearchQuery(tag);
                          handleSearch(tag);
                          setCurrentTab('feed');
                        }}
                        className="aspect-video rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-sm font-bold uppercase tracking-widest transition-all group overflow-hidden relative"
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <span className="relative z-10">{tag}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="columns-2 md:columns-3 lg:columns-4 gap-4">
                  {globalPosts.slice(0, 20).map(item => (
                    <GlassCard 
                      key={`explore-${item.id}`}
                      item={item}
                      isLiked={likedIds.includes(item.id)}
                      onLike={handleLike}
                      onClick={() => setSelectedPost(item)}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {currentTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 pt-24 overflow-y-auto no-scrollbar z-30"
            >
              <div className="px-4 md:px-6 pb-24 max-w-4xl mx-auto">
                <div className="glass-panel p-8 rounded-3xl">
                  <div className="flex flex-col md:flex-row items-center gap-8 border-b border-white/10 pb-8 mb-8">
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
                      <div className="flex flex-col md:flex-row items-center gap-4 mb-4">
                        {isEditingUsername ? (
                          <div className="flex items-center gap-2">
                            <input 
                              type="text" 
                              value={newUsername}
                              onChange={(e) => setNewUsername(e.target.value)}
                              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-white text-sm focus:ring-1 focus:ring-white/20 outline-none"
                              placeholder="Novo username"
                            />
                            <button onClick={handleUpdateUsername} className="p-1 text-emerald-400 hover:text-emerald-300"><CheckCircle2 size={20} /></button>
                            <button onClick={() => setIsEditingUsername(false)} className="p-1 text-red-400 hover:text-red-300"><X size={20} /></button>
                          </div>
                        ) : (
                          <h2 className="text-3xl font-black tracking-tighter uppercase text-white">@{username}</h2>
                        )}
                        
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              setIsEditingUsername(true);
                              setNewUsername(username);
                            }}
                            className="px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-[10px] uppercase tracking-widest text-white/50 hover:text-white transition-all"
                          >
                            Editar
                          </button>
                          <button 
                            onClick={handleLogout}
                            className="px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-[10px] uppercase tracking-widest text-white/50 hover:text-white transition-all"
                          >
                            Sair
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-4 justify-center md:justify-start mb-6">
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

                      <div className="flex gap-4 justify-center md:justify-start">
                        <button 
                          onClick={handleDeleteAccount}
                          className="text-[10px] uppercase tracking-widest text-red-500/50 hover:text-red-500 transition-colors"
                        >
                          Excluir Conta
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-6 mb-8 border-b border-white/5">
                    <button 
                      onClick={() => setProfileTab('posts')}
                      className={`pb-4 text-xs font-bold uppercase tracking-widest transition-all relative ${profileTab === 'posts' ? 'text-white' : 'text-white/30 hover:text-white/50'}`}
                    >
                      Meus Posts ({userPosts.length})
                      {profileTab === 'posts' && <motion.div layoutId="profile-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />}
                    </button>
                    <button 
                      onClick={() => setProfileTab('liked')}
                      className={`pb-4 text-xs font-bold uppercase tracking-widest transition-all relative ${profileTab === 'liked' ? 'text-white' : 'text-white/30 hover:text-white/50'}`}
                    >
                      Curtidos ({likedItems.length})
                      {profileTab === 'liked' && <motion.div layoutId="profile-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />}
                    </button>
                  </div>

                  <div className="columns-2 sm:columns-3 gap-4">
                    {(profileTab === 'posts' ? userPosts : likedItems).map(post => (
                      <GlassCard 
                        key={`profile-${post.id}`}
                        item={post}
                        isLiked={likedIds.includes(post.id)}
                        onLike={handleLike}
                        onDelete={handleDeletePost}
                        onClick={() => setSelectedPost(post)}
                        isUserPost={(post as any).authorUid === auth.currentUser?.uid}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          </AnimatePresence>
      </main>

      {/* Floating Navigation */}
      <FloatingNav 
        onHomeClick={handleHomeClick}
        onAddClick={() => setShowPublishModal(true)}
        onProfileClick={() => setCurrentTab('profile')}
      />

      {/* Modals */}
      <PublishModal 
        isOpen={showPublishModal} 
        onClose={() => setShowPublishModal(false)}
        onSuccess={() => {
          setShowPublishModal(false);
        }}
      />

      <AnimatePresence>
        {selectedPost && (
          <PostDetailModal 
            item={selectedPost}
            onClose={() => setSelectedPost(null)}
            onLike={handleLike}
            onDelete={handleDeletePost}
            isLiked={likedIds.includes(selectedPost.id)}
            currentUserUid={auth.currentUser?.uid}
          />
        )}
      </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}


