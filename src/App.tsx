import { useState, useEffect, useRef, ChangeEvent, ReactNode } from 'react';
import { Search, X, Loader2, Info, Plus, User, Image as ImageIcon, RotateCcw, CheckCircle2, AlertCircle, Heart, Bell, Bookmark, UserPlus, UserMinus, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
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
  signInWithEmailAndPassword 
} from 'firebase/auth';
import { db, auth } from './firebase';
import { ContentItem, Notification } from './types';
import GlassCard from './components/GlassCard';
import FloatingNav from './components/FloatingNav';
import PublishModal from './components/PublishModal';
import PostDetailModal from './components/PostDetailModal';
import DeleteConfirmModal from './components/DeleteConfirmModal';

enum OperationType { CREATE = 'create', UPDATE = 'update', DELETE = 'delete' }
interface FirestoreErrorInfo { error: string; operationType: string; path: string | null; }

function handleFirestoreError(error: unknown, operationType: OperationType | 'auth' | 'list', path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  let displayError = `Erro em ${operationType}`;
  if (errorMessage.includes('auth/invalid-credential')) displayError = "Usuário ou senha incorretos.";
  else if (errorMessage.includes('auth/email-already-in-use')) displayError = "Este nome de usuário já está em uso.";
  else if (errorMessage.includes('auth/operation-not-allowed')) displayError = "Login por e-mail não ativado no Firebase.";

  const errInfo: FirestoreErrorInfo = { error: displayError, operationType, path };
  console.error('App Error: ', JSON.stringify(errInfo));
  // Throwing an error with a JSON string to be caught by the ErrorBoundary
  throw new Error(JSON.stringify(errInfo));
}

function ErrorBoundary({ children }: { children: ReactNode }) {
  const [hasError, setHasError] = useState(false);
  const [errorInfo, setErrorInfo] = useState<string | null>(null);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      try {
        const parsed = JSON.parse(event.error.message);
        if (parsed.error) { setHasError(true); setErrorInfo(parsed.error); }
      } catch { /* Not a JSON error from us */ }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50 dark:bg-space-gray-900 text-center">
        <div className="dark:bg-white/5 bg-gray-200/50 backdrop-blur-xl p-10 rounded-[40px] max-w-md border dark:border-white/10 border-black/10">
          <AlertCircle size={48} className="mx-auto mb-6 text-red-500" />
          <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Ops! Algo deu errado</h2>
          <p className="text-gray-600 dark:text-white/60 mb-8">{errorInfo || 'Ocorreu um erro inesperado.'}</p>
          <button onClick={() => window.location.reload()} className="px-8 py-3 dark:bg-white dark:text-black bg-black text-white font-bold rounded-full uppercase tracking-widest text-xs">Recarregar</button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  // State declarations
  const [globalPosts, setGlobalPosts] = useState<ContentItem[]>([]);
  const [userPosts, setUserPosts] = useState<ContentItem[]>([]);
  const [likedItems, setLikedItems] = useState<ContentItem[]>(() => JSON.parse(localStorage.getItem('velvit_liked_items') || '[]'));
  const [likedIds, setLikedIds] = useState<string[]>(() => JSON.parse(localStorage.getItem('velvit_likes') || '[]'));
  const [savedIds, setSavedIds] = useState<string[]>(() => JSON.parse(localStorage.getItem('velvit_saves') || '[]'));
  const [username, setUsername] = useState<string>(() => localStorage.getItem('velvit_username') || 'Usuário');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => !!localStorage.getItem('velvit_username'));
  const [currentTab, setCurrentTab] = useState<'feed' | 'profile'>('feed');
  const [profileTab, setProfileTab] = useState<'posts' | 'liked'>('posts');
  const [activeTab, setActiveTab] = useState<'home' | 'foryou'>('home');
  const [loginUsername, setLoginUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => JSON.parse(localStorage.getItem('velvit_search_history') || '[]'));
  const [isGeneratingFeed, setIsGeneratingFeed] = useState(true);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [selectedPost, setSelectedPost] = useState<ContentItem | null>(null);
  const [followingUids, setFollowingUids] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [profilePic, setProfilePic] = useState<string | null>(() => localStorage.getItem('velvit_profile_pic'));
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('velvit_theme') as 'light' | 'dark') || 'dark');
  const [bgImage, setBgImage] = useState<string | null>(() => localStorage.getItem('velvit_bg'));
  const [bgOpacity, setBgOpacity] = useState<number>(() => parseFloat(localStorage.getItem('velvit_bg_opacity') || '0.3'));

  // Refs and animations
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll({ container: scrollRef });
  const headerOpacity = useTransform(scrollY, [0, 50], [1, 0]);

  // Effects
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('velvit_theme', theme);
  }, [theme]);

  useEffect(() => { localStorage.setItem('velvit_bg_opacity', String(bgOpacity)); }, [bgOpacity]);
  useEffect(() => { localStorage.setItem('velvit_likes', JSON.stringify(likedIds)); localStorage.setItem('velvit_liked_items', JSON.stringify(likedItems)); }, [likedIds, likedItems]);
  useEffect(() => { localStorage.setItem('velvit_saves', JSON.stringify(savedIds)); }, [savedIds]);
  useEffect(() => { localStorage.setItem('velvit_search_history', JSON.stringify(searchHistory)); }, [searchHistory]);

  useEffect(() => {
    let unsubAuth: (() => void) | undefined;
    let unsubPosts: (() => void) | undefined;
    let unsubFollowing: (() => void) | undefined;
    let unsubNotifs: (() => void) | undefined;

    unsubAuth = onAuthStateChanged(auth, user => {
      setIsLoggedIn(!!user);
      if (user) {
        const uid = user.uid;
        setUsername(localStorage.getItem('velvit_username') || 'User');
        unsubFollowing = onSnapshot(query(collection(db, 'following'), where('followerUid', '==', uid)), snap => setFollowingUids(snap.docs.map(d => d.data().followingUid)));
        unsubNotifs = onSnapshot(query(collection(db, 'notifications'), where('recipientUid', '==', uid), orderBy('createdAt', 'desc'), limit(20)), snap => setNotifications(snap.docs.map(d => ({ ...d.data(), id: d.id } as Notification))));
      } else {
        if (unsubFollowing) unsubFollowing();
        if (unsubNotifs) unsubNotifs();
        setFollowingUids([]);
        setNotifications([]);
      }
    });

    unsubPosts = onSnapshot(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(100)), snapshot => {
      const allPosts = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as ContentItem[];
      setGlobalPosts(allPosts.filter(p => !p.archived));
      if(auth.currentUser) setUserPosts(allPosts.filter(p => p.authorUid === auth.currentUser?.uid));
      setIsGeneratingFeed(false);
    }, () => { setIsGeneratingFeed(false); handleFirestoreError(new Error('Post fetch failed'), 'list', 'posts'); });

    return () => {
      if (unsubAuth) unsubAuth();
      if (unsubPosts) unsubPosts();
      if (unsubFollowing) unsubFollowing();
      if (unsubNotifs) unsubNotifs();
    };
  }, []);

  const items = searchQuery ? globalPosts.filter(p => p.title.toLowerCase().includes(searchQuery.toLowerCase())) : globalPosts;

  // Functions
  const handleAuth = async (mode: 'login' | 'register') => {
    if (!loginUsername || !password) return setLoginError('Preencha todos os campos.');
    const cleanName = loginUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const email = `${cleanName}@velvit.app`;
    setLoginLoading(true);
    setLoginError(null);
    try {
      const userCredential = mode === 'register'
        ? await createUserWithEmailAndPassword(auth, email, password)
        : await signInWithEmailAndPassword(auth, email, password);
      
      const userDocRef = doc(db, 'users', cleanName);
      if (mode === 'register' || !(await getDoc(userDocRef)).exists()) {
        await setDoc(userDocRef, { username: cleanName, uid: userCredential.user.uid, createdAt: serverTimestamp() });
      }
      setUsername(cleanName);
      setIsLoggedIn(true);
      localStorage.setItem('velvit_username', cleanName);
    } catch (err) {
      // This will be caught by the ErrorBoundary
      handleFirestoreError(err, 'auth', null);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    auth.signOut();
  };

  const handleLike = async (id: string) => {
    if (!auth.currentUser) return;
    const postRef = doc(db, 'posts', id);
    const newLikedIds = likedIds.includes(id)
      ? likedIds.filter(lId => lId !== id)
      : [...likedIds, id];

    setLikedIds(newLikedIds);

    if (newLikedIds.includes(id)) {
      const post = globalPosts.find(p => p.id === id);
      if(post) setLikedItems(prev => [...prev, post]);
    } else {
      setLikedItems(prev => prev.filter(item => item.id !== id));
    }

    try {
      await updateDoc(postRef, {
        likesCount: increment(newLikedIds.includes(id) ? 1 : -1)
      });
    } catch (error) {
      // Revert UI change on error
      setLikedIds(likedIds);
      setLikedItems(likedItems);
      handleFirestoreError(error, OperationType.UPDATE, `posts/${id}`);
    }
  };
  
  const handleDeleteAccount = () => setShowDeleteConfirmModal(true);
  const executeDeleteAccount = async () => {
    if (!auth.currentUser) return;
    setIsDeletingAccount(true);
    try {
        const q = query(collection(db, 'posts'), where('authorUid', '==', auth.currentUser.uid));
        const snapshot = await getDocs(q);
        await Promise.all(snapshot.docs.map(d => deleteDoc(d.ref)));
        await deleteDoc(doc(db, 'users', username));
        await auth.currentUser.delete();
        handleLogout();
    } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${username}`);
    } finally {
        setIsDeletingAccount(false);
    }
  }

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>, type: 'bg' | 'profile') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        if (type === 'bg') {
          setBgImage(result);
          localStorage.setItem('velvit_bg', result);
        } else {
          setProfilePic(result);
          localStorage.setItem('velvit_profile_pic', result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Render logic
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50 dark:bg-space-gray-900 relative overflow-hidden">
         <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="dark:bg-black/20 bg-white/50 backdrop-blur-2xl max-w-md w-full p-10 rounded-[40px] text-center relative z-10 border dark:border-white/10 border-black/10">
           <h1 className="text-5xl font-black tracking-tighter text-gray-900 dark:text-white mb-10">VELVIT</h1>
           <div className="space-y-4 text-left">
             <div>
               <span className="text-[10px] uppercase tracking-widest text-black/40 dark:text-white/30 mb-3 block">{authMode === 'register' ? 'Seu nome de usuário' : 'Nome de usuário'}</span>
               <input type="text" placeholder="ex: aesthetic_user" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} className={`w-full h-14 bg-black/5 dark:bg-white/5 border ${loginError ? 'border-red-500/50' : 'dark:border-white/10 border-black/10'} rounded-2xl px-6 text-gray-900 dark:text-white focus:outline-none focus:dark:border-white/30 focus:border-black/30 transition-all`} onKeyDown={(e) => e.key === 'Enter' && document.getElementById('passwordInput')?.focus()} />
             </div>
             <div>
                <span className="text-[10px] uppercase tracking-widest text-black/40 dark:text-white/30 mb-3 block">Sua Senha</span>
                <div className="relative">
                  <input type="password" placeholder="••••••••" id="passwordInput" value={password} onChange={(e) => setPassword(e.target.value)} className={`w-full h-14 bg-black/5 dark:bg-white/5 border ${loginError ? 'border-red-500/50' : 'dark:border-white/10 border-black/10'} rounded-2xl px-6 text-gray-900 dark:text-white focus:outline-none focus:dark:border-white/30 focus:border-black/30 transition-all`} onKeyDown={(e) => e.key === 'Enter' && handleAuth(authMode)} />
                  {loginLoading && <Loader2 className="absolute right-5 top-1/2 -translate-y-1/2 text-black/30 dark:text-white/30 animate-spin" size={20} />}
                </div>
             </div>
             {loginError && <div className="flex items-start gap-2 text-red-500 text-xs"><AlertCircle size={14} className="mt-0.5"/><span>{loginError}</span></div>}
            <button onClick={() => handleAuth(authMode)} disabled={loginLoading} className="w-full py-5 bg-black dark:bg-white text-white dark:text-black font-black rounded-2xl hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 mt-4 uppercase tracking-widest text-xs">{loginLoading ? 'Aguarde...' : (authMode === 'register' ? 'Começar Jornada' : 'Entrar no App')}</button>
            <button onClick={() => { setAuthMode(m => m === 'register' ? 'login' : 'register'); setLoginError(null); }} disabled={loginLoading} className="w-full py-2 text-[10px] uppercase tracking-[0.3em] text-black/40 dark:text-white/30 hover:text-black dark:hover:text-white transition-all">{authMode === 'register' ? <>Já tenho conta? <span className="font-bold underline">Entrar</span></> : <>Novo por aqui? <span className="font-bold underline">Criar Conta</span></>}</button>
           </div>
         </motion.div>
       </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 dark:bg-space-gray-900">
        {/* Backgrounds */}
        <div className="fixed inset-0 z-[-2] bg-gray-50 dark:bg-space-gray-900" />
        {bgImage && <motion.div initial={{ opacity: 0 }} animate={{ opacity: bgOpacity }} exit={{ opacity: 0 }} className="fixed inset-0 z-[-1]"><img src={bgImage} alt="" className="w-full h-full object-cover"/><div className="absolute inset-0 bg-gradient-to-b from-gray-200/20 via-gray-100/50 to-gray-50 dark:from-space-gray-900/50 dark:via-space-gray-900/80 dark:to-space-gray-900" /></motion.div>}
        <div className="liquid-bg opacity-10 dark:opacity-50"><div className="liquid-blob w-[500px] h-[500px] dark:bg-white/10 bg-gray-900/10 top-[-10%] left-[-10%]" style={{animationDelay:'0s'}} /><div className="liquid-blob w-[400px] h-[400px] dark:bg-space-gray-600/20 bg-gray-500/20 bottom-[-5%] right-[-5%]" style={{animationDelay:'-5s'}} /></div>
        
        <motion.header style={{ opacity: headerOpacity }} className="sticky top-0 z-40 px-6 py-8"><div className="max-w-7xl mx-auto flex items-center justify-center"><h1 className="text-3xl md:text-4xl font-black tracking-tighter text-gray-900 dark:text-white cursor-pointer" onClick={() => setCurrentTab('feed')}>VELVIT</h1></div></motion.header>

        <main className="relative min-h-screen">
          <AnimatePresence mode="wait">
            <motion.div key={currentTab} ref={scrollRef} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 pt-28 overflow-y-auto no-scrollbar z-30">
              {currentTab === 'feed' ? (
                <div className="px-4 md:px-6 pb-24 max-w-7xl mx-auto">
                  {/* Search and Notifs */}
                  <div className="flex items-center justify-between mb-8 gap-4">
                    <div className="relative flex-grow">
                      <input type="text" placeholder="Pesquisar..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onFocus={() => setShowHistory(true)} className="w-full h-16 pl-14 pr-6 bg-black/5 dark:bg-white/5 backdrop-blur-md border border-black/10 dark:border-white/10 rounded-full text-gray-900 dark:text-white placeholder-black/30 dark:placeholder-white/30 focus:outline-none focus:border-black/20 dark:focus:border-white/30" />
                      <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-black/30 dark:text-white/30" size={20} />
                    </div>
                    <div className="relative"><button onClick={() => setShowNotifications(s => !s)} className="relative p-4 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 rounded-full text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white"><Bell size={20} />{notifications.some(n => !n.read) && <span className="absolute top-3 right-3 w-2 h-2 bg-red-500 rounded-full" />}</button></div>
                  </div>
                  {/* Feed Tabs */}
                  <div className="flex items-center gap-8 mb-8 border-b border-black/10 dark:border-white/5">
                    <button onClick={() => setActiveTab('home')} className={`pb-4 text-sm font-bold uppercase tracking-widest relative ${activeTab === 'home' ? 'text-gray-900 dark:text-white' : 'text-gray-500/50 dark:text-white/30 hover:opacity-100'}`}>{activeTab === 'home' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-black dark:bg-white" />}Explorar</button>
                    <button onClick={() => setActiveTab('foryou')} className={`pb-4 text-sm font-bold uppercase tracking-widest relative ${activeTab === 'foryou' ? 'text-gray-900 dark:text-white' : 'text-gray-500/50 dark:text-white/30 hover:opacity-100'}`}>{activeTab === 'foryou' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-black dark:bg-white" />}Para Você</button>
                  </div>
                  {/* Feed Content */}
                  <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4">
                    {isGeneratingFeed ? Array.from({length: 10}).map((_, i) => <div key={i} style={{height: [250,300,400,600][i%4]}} className="mb-4 dark:bg-white/5 bg-gray-200/50 rounded-2xl animate-pulse"/>) : items.map(item => <GlassCard key={item.id} item={item} isLiked={likedIds.includes(item.id)} isSaved={savedIds.includes(item.id)} onClick={() => setSelectedPost(item)} isUserPost={item.authorUid === auth.currentUser?.uid} />)}
                  </div>
                </div>
              ) : (
                <div className="px-4 md:px-6 pb-24 max-w-4xl mx-auto">
                  <div className="dark:bg-white/5 bg-white/50 backdrop-blur-xl p-8 rounded-3xl relative border dark:border-white/10 border-black/10">
                    {/* Theme Toggle */}
                    <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} className="absolute top-6 right-6 p-3 bg-black/5 dark:bg-white/10 rounded-full text-black/50 dark:text-white/50"><AnimatePresence mode="wait">{theme === 'dark' ? <motion.div key="sun" initial={{y:-20, opacity:0}} animate={{y:0, opacity:1}} exit={{y:20, opacity:0}}><Sun size={20}/></motion.div> : <motion.div key="moon" initial={{y:-20, opacity:0}} animate={{y:0, opacity:1}} exit={{y:20, opacity:0}}><Moon size={20}/></motion.div>}</AnimatePresence></button>
                    {/* Profile Header */}
                    <div className="flex flex-col md:flex-row items-center gap-8 border-b dark:border-white/10 border-black/10 pb-8 mb-8">
                      <div className="relative group"><div className="w-32 h-32 rounded-full overflow-hidden border-4 dark:border-white/10 border-black/10"><label className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 group-hover:opacity-100 cursor-pointer"><ImageIcon size={24}/><input type="file" accept="image/*" className="hidden" onChange={e => handleFileSelect(e, 'profile')}/></label>{profilePic ? <img src={profilePic} alt="" className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center dark:bg-white/5 bg-black/5"><User size={48} className="dark:text-white/20 text-gray-400"/></div>}</div></div>
                      <div className="flex-1 text-center md:text-left">
                        <h2 className="text-3xl font-black tracking-tighter uppercase text-gray-900 dark:text-white">@{username}</h2>
                        <div className="flex gap-2 mt-4 justify-center md:justify-start"><button onClick={handleLogout} className="px-4 py-1.5 bg-black/5 dark:bg-white/5 rounded-full text-[10px] uppercase tracking-widest text-black/50 dark:text-white/50">Sair</button></div>
                      </div>
                    </div>
                    {/* Profile Body */}
                    <div className="flex flex-col sm:flex-row gap-8">
                      {/* Settings Column */}
                      <div className="sm:w-1/3"><h3 className="text-xs font-bold uppercase tracking-widest text-black/40 dark:text-white/50 mb-4">Configurações</h3><div className="space-y-4"><label className="flex flex-col gap-1 cursor-pointer"><span className="text-[10px] uppercase tracking-widest">Fundo</span><div className="dark:bg-white/5 bg-black/5 border dark:border-white/10 border-black/10 rounded-lg px-4 py-2 text-xs flex items-center gap-2"><ImageIcon size={14}/>Escolher Foto</div><input type="file" accept="image/*" className="hidden" onChange={e => handleFileSelect(e, 'bg')}/></label>{bgImage && <div className="space-y-2"><label className="text-[10px] uppercase tracking-widest">Transparência</label><input type="range" min="0.1" max="1" step="0.05" value={bgOpacity} onChange={e => setBgOpacity(parseFloat(e.target.value))} className="w-full accent-black dark:accent-white"/></div>}{bgImage && <button onClick={() => {setBgImage(null);localStorage.removeItem('velvit_bg'); setBgOpacity(0.3);}} className="p-2 w-full dark:bg-white/5 bg-black/5 border dark:border-white/10 border-black/10 rounded-lg flex items-center justify-center gap-2 text-xs"><RotateCcw size={14}/>Resetar</button>}</div></div>
                      {/* Tabs Column */}
                      <div className="flex-1">
                        <div className="flex gap-6 mb-4 border-b dark:border-white/10 border-black/10"><button onClick={() => setProfileTab('posts')} className={`pb-3 text-xs font-bold uppercase ${profileTab === 'posts' ? 'dark:text-white text-black' : 'dark:text-white/40 text-black/40'}`}>Meus Posts ({userPosts.length})</button><button onClick={() => setProfileTab('liked')} className={`pb-3 text-xs font-bold uppercase ${profileTab === 'liked' ? 'dark:text-white text-black' : 'dark:text-white/40 text-black/40'}`}>Curtidos ({likedItems.length})</button></div>
                        <div className="columns-2 sm:columns-3 gap-4">
                          {(profileTab === 'posts' ? userPosts : likedItems).map(item => <GlassCard key={item.id} item={item} isLiked={likedIds.includes(item.id)} isSaved={savedIds.includes(item.id)} onClick={() => setSelectedPost(item)} isUserPost={item.authorUid === auth.currentUser?.uid}/>)}
                        </div>
                      </div>
                    </div>
                     <div className="mt-8 pt-8 border-t dark:border-white/10 border-black/10"><button onClick={handleDeleteAccount} className="text-[10px] uppercase tracking-widest text-red-500/50 hover:text-red-500">Excluir Conta</button></div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Modals and Nav */}
        <FloatingNav onHomeClick={() => setCurrentTab('feed')} onAddClick={() => setShowPublishModal(true)} onProfileClick={() => setCurrentTab('profile')} />
        <PublishModal isOpen={showPublishModal} onClose={() => setShowPublishModal(false)} onSuccess={() => setShowPublishModal(false)} />
        <AnimatePresence>{selectedPost && <PostDetailModal item={selectedPost} onClose={() => setSelectedPost(null)} onLike={handleLike} isLiked={likedIds.includes(selectedPost.id)} currentUserUid={auth.currentUser?.uid} />}</AnimatePresence>
        <DeleteConfirmModal isOpen={showDeleteConfirmModal} onClose={() => setShowDeleteConfirmModal(false)} onConfirm={executeDeleteAccount} isDeleting={isDeletingAccount} />
      </div>
    </ErrorBoundary>
  );
}
