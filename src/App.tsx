import { useState, useEffect, useRef, ChangeEvent, ReactNode } from 'react';
import { Search, X, Loader2, Info, Plus, User, Image as ImageIcon, RotateCcw, CheckCircle2, AlertCircle, Heart, Bell, Bookmark, UserPlus, UserMinus } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
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
  onAuthStateChanged, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  deleteUser,
  updateEmail,
  sendPasswordResetEmail
} from 'firebase/auth';
import { db, auth } from './firebase';
import { ContentItem, Notification } from './types';
import GlassCard from './components/GlassCard';
import FloatingNav from './components/FloatingNav';
import PublishModal from './components/PublishModal';
import PostDetailModal from './components/PostDetailModal';

// Generates a Cloudinary video thumbnail URL by injecting the `so_0` transformation.
function getCloudinaryThumb(videoUrl: string): string | null {
  if (!videoUrl.includes('res.cloudinary.com')) return null;
  return videoUrl
    .replace('/video/upload/', '/video/upload/so_0/')
    .replace(/\.[^./]+$/, '.jpg');
}

// Generates an ImageKit video thumbnail by appending /ik-thumbnail.jpg
function getImageKitThumb(videoUrl: string): string | null {
  if (!videoUrl.includes('ik.imagekit.io')) return null;
  // Strip any existing query params, append ImageKit thumbnail suffix
  const base = videoUrl.split('?')[0];
  return `${base}/ik-thumbnail.jpg`;
}

// Returns the best available thumbnail URL for any video.
function getVideoThumb(item: { url: string; thumbnailUrl?: string }): string | null {
  if (item.thumbnailUrl) return item.thumbnailUrl;
  return getCloudinaryThumb(item.url) || getImageKitThumb(item.url);
}

// ─── RecommendationCard ───────────────────────────────────────────────────────
// Renders a single recommendation card in the search dropdown.
// • Videos: static ImageKit/Cloudinary thumbnail → plays Cloudinary video on hover
// • Images: standard <img> rendering
interface RecCardProps {
  key?: string | number;
  item: ContentItem;
  onClick: () => void;
}

function RecommendationCard({ item, onClick }: RecCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVideo = item.type === 'video';
  const previewUrl = isVideo ? getVideoThumb(item) : item.url;

  const handleMouseEnter = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleMouseLeave = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  return (
    <button
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="min-w-[100px] aspect-[9/16] rounded-xl overflow-hidden relative group bg-white/10 flex-shrink-0 border border-white/10"
    >
      {isVideo ? (
        <>
          {/* Static thumbnail — shown by default */}
          {previewUrl ? (
            <img
              src={previewUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500 group-hover:opacity-0"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="absolute inset-0 w-full h-full bg-white/5 flex items-center justify-center">
              <span className="text-white/20 text-2xl">▶</span>
            </div>
          )}
          {/* Cloudinary video — plays on hover */}
          <video
            ref={videoRef}
            src={item.url}
            muted
            loop
            playsInline
            preload="none"
            className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          />
        </>
      ) : (
        <img
          src={previewUrl || item.url}
          alt=""
          className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity duration-300"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent flex items-end p-2 pointer-events-none">
        <span className="text-[8px] text-white font-bold truncate uppercase tracking-tighter w-full">
          {item.title}
        </span>
      </div>
    </button>
  );
}

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
  const [activeHashtag, setActiveHashtag] = useState<string | null>(null);
  const [hashtagResults, setHashtagResults] = useState<string[]>([]);
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
  const [currentTab, setCurrentTab] = useState<'feed' | 'profile'>('feed');
  const [selectedPost, setSelectedPost] = useState<ContentItem | null>(null);
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [showEmailPopup, setShowEmailPopup] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [emailPopupLoading, setEmailPopupLoading] = useState(false);
  const [emailPopupError, setEmailPopupError] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [hasAttemptedLogin, setHasAttemptedLogin] = useState(false);
  const [hasRecoveryEmail, setHasRecoveryEmail] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollY = useMotionValue(0);
  const headerOpacity = useTransform(scrollY, [0, 50], [1, 0]);
  const headerScale = useTransform(scrollY, [0, 50], [1, 0.9]);
  const headerY = useTransform(scrollY, [0, 50], [0, -20]);
  const headerPointerEvents = useTransform(scrollY, [0, 50], ['auto', 'none']);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => scrollY.set(el.scrollTop);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  });

  useEffect(() => {
    const resetVersion = 'v2_total_reset';
    const hasReset = localStorage.getItem('velvit_reset_flag');
    if (hasReset !== resetVersion) {
      localStorage.clear();
      localStorage.setItem('velvit_reset_flag', resetVersion);
      window.location.reload();
      return;
    }

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

    let resolvedUid: string | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        resolvedUid = user.uid;
        setupAuthListeners(user.uid);

        // Always sync username and profile pic from Firestore on session restore
        try {
          const usersSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', user.uid)));
          if (!usersSnap.empty) {
            const data = usersSnap.docs[0].data();
            const firestoreUsername = data.username || '';
            let firestorePhoto = data.profilePhotoUrl || null;

            if (firestoreUsername) {
              setUsername(firestoreUsername);
              localStorage.setItem('velvit_username', firestoreUsername);
            }
            setHasRecoveryEmail(!!data.recoveryEmail);

            // Fallback: if no photo in users doc, look for it in the user's posts
            if (!firestorePhoto) {
              try {
                const postsSnap = await getDocs(query(
                  collection(db, 'posts'),
                  where('authorUid', '==', user.uid)
                ));
                const postWithPhoto = postsSnap.docs.find(d => d.data().authorPhotoUrl);
                if (postWithPhoto) firestorePhoto = postWithPhoto.data().authorPhotoUrl;
              } catch (_) {}
            }

            if (firestorePhoto) {
              setProfilePic(firestorePhoto);
              localStorage.setItem('velvit_profile_pic', firestorePhoto);
            }
          }
        } catch (_) {}

        // Re-filter user posts now that uid is known
        setUserPosts(prev => {
          const all = (window as any).__allFetchedPosts__ as ContentItem[] | undefined;
          if (all) return all.filter((p: any) => p.authorUid === user.uid);
          return prev;
        });
      } else {
        resolvedUid = null;
        setFollowingUids([]);
        setNotifications([]);
        unsubscribeFollowing();
        unsubscribeNotifications();
      }
    });

    const q = query(collection(db, 'posts'), limit(100));
    const unsubscribePosts = onSnapshot(q, (snapshot) => {
      const fetchedPosts = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as ContentItem[];
      
      fetchedPosts.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });

      // Store all posts globally so auth callback can re-filter after uid resolves
      (window as any).__allFetchedPosts__ = fetchedPosts;

      const visiblePosts = fetchedPosts.filter(p => !(p as any).archived);
      setGlobalPosts(visiblePosts);
      
      const trending = [...visiblePosts]
        .sort((a: any, b: any) => ((b.likesCount || 0) + (b.savesCount || 0)) - ((a.likesCount || 0) + (a.savesCount || 0)))
        .slice(0, 10);
      setTrendingPosts(trending);

      const uid = resolvedUid || auth.currentUser?.uid;
      if (uid) {
        setUserPosts(fetchedPosts.filter((p: any) => p.authorUid === uid));
      }
      
      setIsGeneratingFeed(false);
    }, (err) => {
      console.error("Error fetching posts:", err);
      setError("Erro ao carregar posts: " + err.message);
      setIsGeneratingFeed(false);
    });

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
    const existingPostIds = new Set(globalPosts.map(p => p.id));
    
    const updatedLikedItems = likedItems.filter(item => existingPostIds.has(item.id));
    if (updatedLikedItems.length !== likedItems.length) {
      setLikedItems(updatedLikedItems);
      localStorage.setItem('velvit_liked_items', JSON.stringify(updatedLikedItems));
    }

    const updatedLikedIds = likedIds.filter(id => existingPostIds.has(id));
    if (updatedLikedIds.length !== likedIds.length) {
      setLikedIds(updatedLikedIds);
      localStorage.setItem('velvit_likes', JSON.stringify(updatedLikedIds));
    }
  }, [globalPosts]);

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
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;
        
        await setDoc(doc(db, 'users', cleanName), {
          username: cleanName,
          uid: uid,
          profilePhotoUrl: null,
          createdAt: serverTimestamp()
        });
        
        setUsername(cleanName);
        setProfilePic(null);
        setIsLoggedIn(true);
        localStorage.setItem('velvit_username', cleanName);
        setShowEmailPopup(true);
      }
    } catch (err: any) {
      let displayError = "Erro ao criar conta. Tente novamente.";
      
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
    setHasAttemptedLogin(true);
    setLoginLoading(true);
    setLoginError(null);

    try {
      const userDoc = await getDoc(doc(db, 'users', cleanName));
      const recoveryEmailStored = userDoc.exists() ? (userDoc.data().recoveryEmail || '') : '';
      const email = recoveryEmailStored || `${cleanName}@velvit.app`;
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      // Fetch authoritative user data from Firestore by UID (not by typed username)
      const usersSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', uid)));
      if (!usersSnap.empty) {
        const data = usersSnap.docs[0].data();
        const firestoreUsername = data.username || cleanName;

        // If user typed an old/wrong username, block login
        if (firestoreUsername !== cleanName) {
          await signOut(auth);
          setLoginError('Usuário não encontrado.');
          return;
        }
        const firestorePhoto = data.profilePhotoUrl || null;

        setUsername(firestoreUsername);
        localStorage.setItem('velvit_username', firestoreUsername);

        if (firestorePhoto) {
          setProfilePic(firestorePhoto);
          localStorage.setItem('velvit_profile_pic', firestorePhoto);
        } else {
          // Fallback: try to get photo from user's posts
          try {
            const postsSnap = await getDocs(query(collection(db, 'posts'), where('authorUid', '==', uid)));
            const postWithPhoto = postsSnap.docs.find(d => d.data().authorPhotoUrl);
            const photo = postWithPhoto?.data().authorPhotoUrl || null;
            if (photo) {
              setProfilePic(photo);
              localStorage.setItem('velvit_profile_pic', photo);
            } else {
              setProfilePic(null);
              localStorage.removeItem('velvit_profile_pic');
            }
          } catch (_) {
            setProfilePic(null);
            localStorage.removeItem('velvit_profile_pic');
          }
        }

        // Update lastLogin in the correct doc
        try {
          await updateDoc(usersSnap.docs[0].ref, { lastLogin: serverTimestamp() });
        } catch (_) {}

        if (!usersSnap.docs[0].data().recoveryEmail) {
          setShowEmailPopup(true);
        }
      } else {
        // First login ever or doc missing — create with typed name
        await setDoc(doc(db, 'users', cleanName), {
          username: cleanName,
          uid: uid,
          createdAt: serverTimestamp()
        });
        setUsername(cleanName);
        localStorage.setItem('velvit_username', cleanName);
        setProfilePic(null);
        localStorage.removeItem('velvit_profile_pic');
        setShowEmailPopup(true);
      }

      setIsLoggedIn(true);
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

  const handleLogout = async () => {
    try { await signOut(auth); } catch {}
    const keysToRemove = [
      'velvit_username', 'velvit_profile_pic', 'velvit_bg',
      'velvit_likes', 'velvit_liked_items', 'velvit_saves', 'velvit_search_history'
    ];
    keysToRemove.forEach(k => localStorage.removeItem(k));
    setIsLoggedIn(false);
    setUsername('Usuário');
    setProfilePic(null);
    setBgImage(null);
    setLikedIds([]);
    setLikedItems([]);
    setSavedIds([]);
    setSearchHistory([]);
    setCurrentTab('feed');
    setLoginUsername('');
    setPassword('');
    setLoginError(null);
    setAuthMode('login');
  };

  const handleAddEmail = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!recoveryEmail.trim() || !emailRegex.test(recoveryEmail.trim())) {
      setEmailPopupError('Digite um endereço de e-mail válido.');
      return;
    }
    if (!auth.currentUser || !username) return;
    setEmailPopupLoading(true);
    setEmailPopupError(null);
    try {
      await updateEmail(auth.currentUser, recoveryEmail.trim());
      await updateDoc(doc(db, 'users', username), { recoveryEmail: recoveryEmail.trim() });
      setShowEmailPopup(false);
      setRecoveryEmail('');
      setHasRecoveryEmail(true);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setEmailPopupError('Este e-mail já está em uso por outra conta.');
      } else if (err.code === 'auth/invalid-email') {
        setEmailPopupError('E-mail inválido.');
      } else if (err.code === 'auth/requires-recent-login') {
        setEmailPopupError('Por segurança, saia e entre novamente para vincular o e-mail.');
      } else {
        setEmailPopupError('Erro ao salvar e-mail. Tente novamente.');
      }
    } finally {
      setEmailPopupLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const cleanName = forgotUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!cleanName || cleanName.length < 3) {
      setForgotError('Digite um nome de usuário válido.');
      return;
    }
    setForgotLoading(true);
    setForgotError(null);
    try {
      const userDoc = await getDoc(doc(db, 'users', cleanName));
      if (!userDoc.exists()) {
        setForgotError('Usuário não encontrado.');
        setForgotLoading(false);
        return;
      }
      const data = userDoc.data();
      const emailToReset = data.recoveryEmail || '';
      if (!emailToReset) {
        setForgotError('Este usuário não possui um e-mail de recuperação vinculado.');
        setForgotLoading(false);
        return;
      }
      await sendPasswordResetEmail(auth, emailToReset);
      setForgotSuccess(true);
    } catch (err: any) {
      setForgotError('Erro ao enviar e-mail. Tente novamente.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleLike = async (id: string) => {
    const itemToLike = [...items, ...userPosts].find(i => i.id === id);
    if (!itemToLike) return;

    const isLiked = likedIds.includes(id);
    
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
    
    const newLikedIds = isLiked ? likedIds.filter(i => i !== id) : [...likedIds, id];
    setLikedIds(newLikedIds);
    localStorage.setItem('velvit_likes', JSON.stringify(newLikedIds));

    const newLikedItems = isLiked ? likedItems.filter(i => i.id !== id) : [...likedItems, { ...itemToLike, likesCount: Math.max(0, (itemToLike.likesCount || 0) + 1) }];
    setLikedItems(newLikedItems);
    localStorage.setItem('velvit_liked_items', JSON.stringify(newLikedItems));

    if (auth.currentUser) {
      const interactionId = `${auth.currentUser.uid}_${id}_like`;
      try {
        const postRef = doc(db, 'posts', id);

        if (isLiked) {
          await deleteDoc(doc(db, 'interactions', interactionId));
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

      const newLikedItems = likedItems.filter(item => item.id !== id);
      setLikedItems(newLikedItems);
      localStorage.setItem('velvit_liked_items', JSON.stringify(newLikedItems));

      const newLikedIds = likedIds.filter(likedId => likedId !== id);
      setLikedIds(newLikedIds);
      localStorage.setItem('velvit_likes', JSON.stringify(newLikedIds));

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
    setActiveHashtag(null);
    setHashtagResults([]);
    setItems(globalPosts);
  };

  const handleUpdateUsername = async () => {
    if (!newUsername.trim() || !auth.currentUser) return;
    const cleanName = newUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (cleanName.length < 3) {
      alert("O nome deve ter pelo menos 3 caracteres.");
      return;
    }
    if (cleanName === username) {
      setIsEditingUsername(false);
      return;
    }

    try {
      const newUserRef = doc(db, 'users', cleanName);
      const newUserDoc = await getDoc(newUserRef);

      if (newUserDoc.exists() && newUserDoc.data().uid !== auth.currentUser.uid) {
        alert("Este nome de usuário já está em uso.");
        return;
      }

      const oldUserRef = doc(db, 'users', username);
      const oldUserDoc = await getDoc(oldUserRef);
      const oldData = oldUserDoc.exists() ? oldUserDoc.data() : {};

      await setDoc(newUserRef, {
        username: cleanName,
        uid: auth.currentUser.uid,
        createdAt: oldData.createdAt || new Date().toISOString(),
        ...(oldData.profilePhotoUrl ? { profilePhotoUrl: oldData.profilePhotoUrl } : {}),
      });

      try { await deleteDoc(oldUserRef); } catch (_) {}

      const currentPhoto = profilePic || null;
      const postsSnap = await getDocs(query(collection(db, 'posts'), where('authorUid', '==', auth.currentUser.uid)));
      await Promise.all(postsSnap.docs.map(d => updateDoc(d.ref, {
        authorName: cleanName,
        ...(currentPhoto ? { authorPhotoUrl: currentPhoto } : {}),
      })));

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
    const user = auth.currentUser;
    if (!user) return;
    const uid = user.uid;

    try {
      const postsSnap = await getDocs(query(collection(db, 'posts'), where('authorUid', '==', uid)));
      await Promise.all(postsSnap.docs.map(d => deleteDoc(d.ref)));

      const interSnap = await getDocs(query(collection(db, 'interactions'), where('uid', '==', uid)));
      await Promise.all(interSnap.docs.map(d => deleteDoc(d.ref)));

      const followSnap = await getDocs(query(collection(db, 'following'), where('followerUid', '==', uid)));
      await Promise.all(followSnap.docs.map(d => deleteDoc(d.ref)));

      await deleteDoc(doc(db, 'users', username));

      await deleteUser(user);

      await handleLogout();
    } catch (err: any) {
      console.error("Error deleting account:", err);
      if (err.code === 'auth/requires-recent-login') {
        alert("Por segurança, saia e entre novamente antes de excluir a conta.");
      } else {
        alert("Erro ao excluir conta. Tente novamente.");
      }
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

  const updateProfilePic = async (url: string) => {
    setProfilePic(url);
    localStorage.setItem('velvit_profile_pic', url);
    if (auth.currentUser && username) {
      try {
        const postsSnap = await getDocs(query(collection(db, 'posts'), where('authorUid', '==', auth.currentUser.uid)));
        await Promise.all(postsSnap.docs.map(d => updateDoc(d.ref, { authorPhotoUrl: url })));
        try {
          await updateDoc(doc(db, 'users', username), { profilePhotoUrl: url });
        } catch (_) {}
      } catch (err) {
        console.error('Error saving profile pic to Firestore:', err);
      }
    }
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

  const fuzzyScore = (text: string, query: string): number => {
    const t = text.toLowerCase().trim();
    const q = query.toLowerCase().trim();
    if (!q || !t) return 0;

    if (t === q) return 100;
    if (t.startsWith(q)) return 90;
    if (t.includes(q)) return 80;

    const tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length > 1) {
      const matched = tokens.filter(tok => t.includes(tok));
      if (matched.length === tokens.length) return 70;
      if (matched.length > 0) return 40 + Math.round((matched.length / tokens.length) * 25);
    }

    const chars = q.replace(/\s/g, '');
    let ci = 0;
    for (let i = 0; i < t.length && ci < chars.length; i++) {
      if (t[i] === chars[ci]) ci++;
    }
    if (ci === chars.length) return 15;

    return 0;
  };

  const runSearch = (query: string, saveHistory = false) => {
    const q = query.trim();
    setActiveHashtag(null);
    if (!q) {
      setItems(globalPosts);
      setHashtagResults([]);
      return;
    }

    if (saveHistory) {
      setSearchHistory(prev => {
        const newHistory = [q, ...prev.filter(h => h !== q)].slice(0, 4);
        localStorage.setItem('velvit_search_history', JSON.stringify(newHistory));
        return newHistory;
      });
    }

    const qLower = q.toLowerCase();

    // Collect all unique hashtags that partially contain the query
    const allHashtags = new Set<string>();
    globalPosts.forEach(post => {
      (post.hashtags || []).forEach(tag => allHashtags.add(tag));
    });
    const matchingHashtags = Array.from(allHashtags).filter(tag =>
      tag.includes(qLower)
    );
    setHashtagResults(matchingHashtags.slice(0, 8));

    const scored = globalPosts
      .map(post => {
        const titleScore = fuzzyScore(post.title, q);
        const authorScore = fuzzyScore(post.authorName || '', q);
        const descScore = post.description ? fuzzyScore(post.description, q) * 0.6 : 0;
        const hashtagScore = (post.hashtags || []).some(tag => tag.includes(qLower)) ? 85 : 0;
        return { post, score: Math.max(titleScore, authorScore, descScore, hashtagScore) };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ post }) => post);

    setItems(scored);
  };

  const handleSearch = (query: string) => {
    setShowHistory(false);
    runSearch(query, true);
  };

  const handleHashtagClick = (tag: string) => {
    setSearchQuery('');
    setHashtagResults([]);
    setShowHistory(false);
    setActiveHashtag(tag);
    const filtered = globalPosts.filter(p => (p.hashtags || []).includes(tag));
    setItems(filtered);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeHashtag && !searchQuery.trim()) {
        const filtered = globalPosts.filter(p => (p.hashtags || []).includes(activeHashtag));
        setItems(filtered);
      } else {
        runSearch(searchQuery);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [searchQuery, globalPosts, activeHashtag]);

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

            <AnimatePresence>
              {authMode === 'login' && hasAttemptedLogin && !showForgotPassword && (
                <motion.button
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  onClick={() => { setShowForgotPassword(true); setForgotUsername(loginUsername); setForgotError(null); setForgotSuccess(false); }}
                  className="w-full py-2 text-[10px] uppercase tracking-[0.3em] text-white/30 hover:text-white/60 transition-all mt-1"
                >
                  Esqueci minha senha
                </motion.button>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showForgotPassword && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden mt-2"
                >
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Recuperar Senha</span>
                      <button onClick={() => { setShowForgotPassword(false); setForgotError(null); setForgotSuccess(false); }} className="text-white/30 hover:text-white transition-colors"><X size={14} /></button>
                    </div>
                    {forgotSuccess ? (
                      <div className="flex items-center gap-2 text-green-400 text-xs">
                        <CheckCircle2 size={14} />
                        <span>E-mail enviado! Verifique sua caixa de entrada.</span>
                      </div>
                    ) : (
                      <>
                        <div>
                          <span className="text-[10px] uppercase tracking-widest text-white/30 mb-2 block">Seu nome de usuário</span>
                          <input
                            type="text"
                            placeholder="Ex: aesthetic_user"
                            value={forgotUsername}
                            onChange={(e) => setForgotUsername(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleForgotPassword(); }}
                            className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-white text-sm focus:outline-none focus:border-white/30 transition-all"
                          />
                        </div>
                        {forgotError && (
                          <p className="text-red-400 text-xs flex items-center gap-1.5"><AlertCircle size={12} />{forgotError}</p>
                        )}
                        <button
                          onClick={handleForgotPassword}
                          disabled={forgotLoading}
                          className="w-full py-3 bg-white/10 hover:bg-white/20 border border-white/10 text-white rounded-xl text-[10px] uppercase tracking-widest font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                          {forgotLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                          Enviar e-mail de recuperação
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <button 
              onClick={() => {
                setAuthMode(authMode === 'register' ? 'login' : 'register');
                setLoginError(null);
                setSuggestions([]);
                setShowForgotPassword(false);
                setHasAttemptedLogin(false);
                setForgotError(null);
                setForgotSuccess(false);
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
      <div className="fixed inset-0 z-[-2] bg-space-gray-900" />
      
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

      <div className="liquid-bg opacity-50">
        <div className="liquid-blob w-[500px] h-[500px] bg-white/10 top-[-10%] left-[-10%]" />
        <div className="liquid-blob w-[400px] h-[400px] bg-space-gray-600/20 bottom-[-5%] right-[-5%]" style={{ animationDelay: '-5s' }} />
        <div className="liquid-blob w-[300px] h-[300px] bg-white/5 top-[40%] right-[20%]" style={{ animationDelay: '-10s' }} />
      </div>

      <motion.header 
        style={{ 
          opacity: headerOpacity,
          scale: headerScale,
          y: headerY,
          pointerEvents: headerPointerEvents
        }}
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

      <main className="relative min-h-screen">
        <AnimatePresence initial={false}>
          {currentTab === 'feed' && (
            <motion.div
              ref={scrollRef}
              key="feed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 pt-24 overflow-y-auto no-scrollbar z-30"
            >
              <div className="px-4 md:px-6 pb-24 max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-8 gap-4">
                   <div className="relative flex-grow">
                    <div className="relative">
                        <input
                          type="text"
                          placeholder="Pesquisar posts ou #hashtags..."
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            if (e.target.value.trim()) setShowHistory(false);
                          }}
                          onFocus={() => {
                            if (searchQuery.trim()) {
                              setSearchQuery('');
                              setHashtagResults([]);
                              setActiveHashtag(null);
                              setItems(globalPosts);
                            }
                            setShowHistory(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleSearch(searchQuery);
                                (e.target as HTMLInputElement).blur();
                            }
                          }}
                          className="w-full h-16 pl-14 pr-6 bg-white/5 backdrop-blur-md border border-white/10 rounded-full text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-all"
                        />
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30" size={20} />
                        {loading && (
                          <Loader2 className="absolute right-5 top-1/2 -translate-y-1/2 text-white/30 animate-spin" size={20} />
                        )}
                    </div>
                    
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
                                <span className="text-[10px] uppercase tracking-widest text-white/30">Recomendações</span>
                              </div>
                              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                                {globalPosts.length === 0 ? (
                                  Array.from({ length: 4 }).map((_, i) => (
                                    <div
                                      key={`rec-skel-${i}`}
                                      className="min-w-[100px] aspect-[9/16] rounded-xl bg-white/5 animate-pulse flex-shrink-0"
                                    />
                                  ))
                                ) : (
                                  globalPosts.slice(0, 6).map(item => (
                                    <RecommendationCard
                                      key={`search-rec-${item.id}`}
                                      item={item}
                                      onClick={() => {
                                        setSearchQuery(item.title);
                                        handleSearch(item.title);
                                        setShowHistory(false);
                                      }}
                                    />
                                  ))
                                )}
                              </div>
                            </motion.div>
                          </>
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {hashtagResults.length > 0 && !showHistory && (
                        <motion.div
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          className="flex flex-wrap gap-2 mt-3"
                        >
                          {hashtagResults.map(tag => (
                            <button
                              key={tag}
                              onClick={() => handleHashtagClick(tag)}
                              className="px-3 py-1.5 bg-white/5 hover:bg-white/15 border border-white/10 rounded-full text-[11px] text-white/60 hover:text-white font-bold transition-all"
                            >
                              #{tag}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
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

                <AnimatePresence>
                  {activeHashtag && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="flex items-center gap-3 mb-6"
                    >
                      <span className="text-[10px] uppercase tracking-widest text-white/30">Filtrando por</span>
                      <div className="flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/20 rounded-full">
                        <span className="text-sm font-black text-white">#{activeHashtag}</span>
                        <button
                          onClick={handleHomeClick}
                          className="text-white/40 hover:text-white transition-colors ml-1"
                        >
                          <X size={12} />
                        </button>
                      </div>
                      <span className="text-[10px] text-white/20">{items.length} post{items.length !== 1 ? 's' : ''}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

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
                        onHashtagClick={handleHashtagClick}
                        isUserPost={(item as any).authorUid === auth.currentUser?.uid}
                        searchQuery={searchQuery}
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
                      Nenhuma publicação encontrada. Seja o primeiro a compartilhar algo.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {currentTab === 'profile' && (
            <motion.div
              ref={scrollRef}
              key="profile"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 pt-24 overflow-y-auto no-scrollbar z-30"
            >
              <div className="px-4 md:px-6 pb-24 max-w-4xl mx-auto">
                <div className="glass-panel p-8 rounded-3xl relative">
                  {!hasRecoveryEmail && (
                    <button
                      onClick={() => { setShowEmailPopup(true); setEmailPopupError(null); setRecoveryEmail(''); }}
                      title="Vincular e-mail de recuperação"
                      className="absolute top-4 right-4 flex items-center gap-1 px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-[8px] uppercase tracking-widest text-white/30 hover:text-white/60 transition-all"
                    >
                      <RotateCcw size={9} />
                      sync
                    </button>
                  )}
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
                        onHashtagClick={handleHashtagClick}
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

      <FloatingNav 
        onHomeClick={handleHomeClick}
        onAddClick={() => setShowPublishModal(true)}
        onProfileClick={() => setCurrentTab('profile')}
      />

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

      <AnimatePresence>
        {showEmailPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-6"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(20px)' }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              className="bg-black/90 border border-white/10 rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
                  <Info size={26} className="text-white/60" />
                </div>
                <h2 className="text-lg font-black uppercase tracking-tighter text-white">Vincule seu e-mail</h2>
                <p className="text-xs text-white/40 leading-relaxed">
                  Adicione um e-mail real para recuperar sua conta caso esqueça a senha ou o usuário.
                </p>
              </div>

              <div className="space-y-3">
                <span className="text-[10px] uppercase tracking-widest text-white/30 font-bold block">Seu e-mail</span>
                <input
                  type="email"
                  placeholder="exemplo@email.com"
                  value={recoveryEmail}
                  onChange={(e) => { setRecoveryEmail(e.target.value); setEmailPopupError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddEmail(); }}
                  className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-5 text-white text-sm focus:outline-none focus:border-white/30 transition-all placeholder:text-white/15"
                />
                {emailPopupError && (
                  <p className="text-red-400 text-xs flex items-center gap-1.5">
                    <AlertCircle size={12} />{emailPopupError}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleAddEmail}
                  disabled={emailPopupLoading}
                  className="w-full py-4 bg-white text-black font-black rounded-2xl uppercase tracking-widest text-xs hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {emailPopupLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                  Salvar e-mail
                </button>
                <button
                  onClick={() => setShowEmailPopup(false)}
                  className="w-full py-3 text-[10px] uppercase tracking-widest text-white/25 hover:text-white/50 transition-colors"
                >
                  Fazer isso depois
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}
