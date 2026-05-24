import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Send, ArrowLeft, Search, Video, VideoOff, Mic, MicOff,
  PhoneOff, Lock, CheckCheck, Check, ImageIcon, Plus, Phone
} from 'lucide-react';
import {
  collection, query, where, orderBy, onSnapshot, addDoc,
  updateDoc, doc, setDoc, getDoc, getDocs, serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { getOrCreateKeyPair, deriveSharedKey, encryptText, decryptText } from '../utils/crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CurrentUser {
  uid: string;
  displayName: string;
  photoURL: string | null;
}

interface ChatModalProps {
  currentUser: CurrentUser;
  onClose: () => void;
  initialChatWithUid?: string | null;
  initialChatWithName?: string | null;
  initialChatWithPhoto?: string | null;
}

interface ChatConvo {
  id: string;
  otherUid: string;
  otherName: string;
  otherPhoto: string | null;
  lastMessage: string;
  lastMessageAt: number;
  unread: number;
}

interface ChatMsg {
  id: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'video';
  mediaUrl?: string;
  createdAt: number;
  read: boolean;
  encrypting?: boolean;
}

interface SearchUser {
  uid: string;
  username: string;
  profilePhotoUrl: string | null;
}

type ChatView = 'list' | 'conversation' | 'search' | 'call';

// ─── Constants ────────────────────────────────────────────────────────────────

const STUN = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };

function getChatId(uid1: string, uid2: string) {
  return [uid1, uid2].sort().join('_');
}

function formatTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const diff = (now.getTime() - d.getTime()) / 86400000;
  if (diff < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
}

// ─── Main Component ───────────────────────────────────────────────────────────

const ChatModal: React.FC<ChatModalProps> = ({
  currentUser,
  onClose,
  initialChatWithUid,
  initialChatWithName,
  initialChatWithPhoto,
}) => {
  const [view, setView] = useState<ChatView>('list');
  const [convos, setConvos] = useState<ChatConvo[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [activeConvo, setActiveConvo] = useState<{ chatId: string; otherUid: string; otherName: string; otherPhoto: string | null } | null>(null);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [myPrivateKey, setMyPrivateKey] = useState<CryptoKey | null>(null);
  const [myPublicKeyB64, setMyPublicKeyB64] = useState('');
  const sharedKeys = useRef<Map<string, CryptoKey>>(new Map());

  // WebRTC / Call state
  const [callView, setCallView] = useState<'ringing_out' | 'ringing_in' | 'active' | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [callOtherName, setCallOtherName] = useState('');
  const [callOtherUid, setCallOtherUid] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [showAgeGate, setShowAgeGate] = useState(false);
  const [pendingCallTarget, setPendingCallTarget] = useState<{ uid: string; name: string } | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const unsubConvos = useRef<(() => void) | null>(null);
  const unsubMessages = useRef<(() => void) | null>(null);
  const unsubCall = useRef<(() => void) | null>(null);
  const unsubIncoming = useRef<(() => void) | null>(null);

  // ─── Initialise encryption keys ─────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    getOrCreateKeyPair(currentUser.uid).then(async ({ privateKey, publicKeyB64 }) => {
      if (!mounted) return;
      setMyPrivateKey(privateKey);
      setMyPublicKeyB64(publicKeyB64);
      await setDoc(doc(db, 'userKeys', currentUser.uid), {
        publicKey: publicKeyB64,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }).catch(console.error);
    return () => { mounted = false; };
  }, [currentUser.uid]);

  // ─── Listen to conversations ─────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'chats'), where('participants', 'array-contains', currentUser.uid));
    unsubConvos.current = onSnapshot(q, async (snap) => {
      const list: ChatConvo[] = snap.docs.map(d => {
        const data = d.data();
        const otherUid = (data.participants as string[]).find(u => u !== currentUser.uid) || '';
        return {
          id: d.id,
          otherUid,
          otherName: data.participantNames?.[otherUid] || 'Usuário',
          otherPhoto: data.participantPhotos?.[otherUid] || null,
          lastMessage: data.lastMessage || '',
          lastMessageAt: data.lastMessageAt?.toMillis?.() || data.lastMessageAt || 0,
          unread: data.unread?.[currentUser.uid] || 0,
        };
      });
      list.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
      setConvos(list);
    });
    return () => { unsubConvos.current?.(); };
  }, [currentUser.uid]);

  // ─── Listen for incoming calls ────────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, 'calls'),
      where('calleeId', '==', currentUser.uid),
      where('status', '==', 'ringing')
    );
    unsubIncoming.current = onSnapshot(q, (snap) => {
      if (snap.empty || callView) return;
      const d = snap.docs[0];
      const data = d.data();
      setCallId(d.id);
      setCallOtherName(data.callerName || 'Alguém');
      setCallOtherUid(data.callerId);
      setCallView('ringing_in');
    });
    return () => { unsubIncoming.current?.(); };
  }, [currentUser.uid, callView]);

  // ─── Auto-open conversation if initialChatWithUid ────────────────────────────
  useEffect(() => {
    if (initialChatWithUid && myPrivateKey) {
      openConversation(initialChatWithUid, initialChatWithName || 'Usuário', initialChatWithPhoto || null);
    }
  }, [initialChatWithUid, myPrivateKey]);

  // ─── Get or derive shared key for a chat ─────────────────────────────────────
  const getSharedKey = useCallback(async (chatId: string, otherUid: string): Promise<CryptoKey | null> => {
    if (sharedKeys.current.has(chatId)) return sharedKeys.current.get(chatId)!;
    if (!myPrivateKey) return null;
    try {
      const keyDoc = await getDoc(doc(db, 'userKeys', otherUid));
      if (!keyDoc.exists()) return null;
      const theirPublicKey = keyDoc.data().publicKey as string;
      const shared = await deriveSharedKey(myPrivateKey, theirPublicKey);
      sharedKeys.current.set(chatId, shared);
      return shared;
    } catch (e) {
      console.error('Key derivation failed', e);
      return null;
    }
  }, [myPrivateKey]);

  // ─── Open a conversation ─────────────────────────────────────────────────────
  const openConversation = useCallback(async (otherUid: string, otherName: string, otherPhoto: string | null) => {
    const chatId = getChatId(currentUser.uid, otherUid);
    setActiveConvo({ chatId, otherUid, otherName, otherPhoto });
    setMessages([]);
    setView('conversation');

    // Create chat doc if it doesn't exist
    const chatRef = doc(db, 'chats', chatId);
    const snap = await getDoc(chatRef);
    if (!snap.exists()) {
      await setDoc(chatRef, {
        participants: [currentUser.uid, otherUid],
        participantNames: { [currentUser.uid]: currentUser.displayName, [otherUid]: otherName },
        participantPhotos: { [currentUser.uid]: currentUser.photoURL || null, [otherUid]: otherPhoto },
        lastMessage: '',
        lastMessageAt: serverTimestamp(),
        unread: { [currentUser.uid]: 0, [otherUid]: 0 },
        createdAt: new Date().toISOString(),
      });
    } else {
      // Reset unread
      await updateDoc(chatRef, { [`unread.${currentUser.uid}`]: 0 });
    }

    // Listen to messages
    unsubMessages.current?.();
    const shared = await getSharedKey(chatId, otherUid);
    const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'));
    unsubMessages.current = onSnapshot(q, async (mSnap) => {
      const decrypted: ChatMsg[] = [];
      for (const d of mSnap.docs) {
        const data = d.data();
        let content = '';
        if (shared && data.ct && data.iv) {
          content = await decryptText(shared, data.ct, data.iv);
        } else if (data.content) {
          content = data.content;
        } else if (data.type !== 'text') {
          content = '';
        }
        decrypted.push({
          id: d.id,
          senderId: data.senderId,
          content,
          type: data.type || 'text',
          mediaUrl: data.mediaUrl,
          createdAt: data.createdAt?.toMillis?.() || data.createdAt || Date.now(),
          read: data.read || false,
        });
      }
      setMessages(decrypted);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    });
  }, [currentUser, getSharedKey]);

  // ─── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (type: 'text' | 'image' | 'video' = 'text', mediaUrl?: string) => {
    if (!activeConvo || (!inputText.trim() && type === 'text')) return;
    if (sending) return;
    setSending(true);
    const text = type === 'text' ? inputText.trim() : (mediaUrl || '');
    setInputText('');
    try {
      const shared = await getSharedKey(activeConvo.chatId, activeConvo.otherUid);
      const chatRef = doc(db, 'chats', activeConvo.chatId);
      const msgData: Record<string, any> = {
        senderId: currentUser.uid,
        type,
        mediaUrl: mediaUrl || null,
        createdAt: serverTimestamp(),
        read: false,
      };
      if (shared && type === 'text') {
        const { ct, iv } = await encryptText(shared, text);
        msgData.ct = ct;
        msgData.iv = iv;
      } else {
        msgData.content = text;
      }
      await addDoc(collection(db, 'chats', activeConvo.chatId, 'messages'), msgData);
      const preview = type === 'text' ? text.slice(0, 60) : (type === 'image' ? '📷 Imagem' : '🎬 Vídeo');
      await updateDoc(chatRef, {
        lastMessage: preview,
        lastMessageAt: serverTimestamp(),
        lastSenderId: currentUser.uid,
        [`unread.${activeConvo.otherUid}`]: (convos.find(c => c.id === activeConvo.chatId)?.unread || 0) + 1,
      });
    } catch (e) {
      console.error('Send failed', e);
    } finally {
      setSending(false);
    }
  }, [activeConvo, inputText, sending, currentUser, getSharedKey, convos]);

  // ─── Search users ─────────────────────────────────────────────────────────────
  const searchUsers = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const results: SearchUser[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (
          data.uid !== currentUser.uid &&
          (data.username?.toLowerCase().includes(q.toLowerCase()))
        ) {
          results.push({ uid: data.uid, username: data.username, profilePhotoUrl: data.profilePhotoUrl || null });
        }
      });
      setSearchResults(results.slice(0, 20));
    } catch (e) {
      console.error(e);
    } finally {
      setSearching(false);
    }
  }, [currentUser.uid]);

  useEffect(() => {
    const t = setTimeout(() => searchUsers(searchQuery), 350);
    return () => clearTimeout(t);
  }, [searchQuery, searchUsers]);

  // ─── Media upload ─────────────────────────────────────────────────────────────
  const handleMediaUpload = useCallback(async (file: File) => {
    if (!activeConvo) return;
    setUploadingMedia(true);
    try {
      const isVideo = file.type.startsWith('video/');
      const reader = new FileReader();
      const dataUrl: string = await new Promise(res => {
        reader.onload = () => res(reader.result as string);
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.split(',')[1];
      const endpoint = isVideo ? '/api/upload-video-base64' : '/api/upload-image';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: base64, filename: file.name }),
      });
      if (!res.ok) throw new Error('Upload failed');
      const json = await res.json();
      const url = json.url || json.secureUrl;
      if (url) await sendMessage(isVideo ? 'video' : 'image', url);
    } catch (e) {
      console.error('Media upload error', e);
    } finally {
      setUploadingMedia(false);
    }
  }, [activeConvo, sendMessage]);

  // ─── WebRTC Video Call ────────────────────────────────────────────────────────
  const startCall = useCallback(async (targetUid: string, targetName: string) => {
    if (!ageConfirmed) {
      setPendingCallTarget({ uid: targetUid, name: targetName });
      setShowAgeGate(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = new RTCPeerConnection(STUN);
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.ontrack = (e) => {
        remoteStreamRef.current = e.streams[0];
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const callRef = await addDoc(collection(db, 'calls'), {
        callerId: currentUser.uid,
        callerName: currentUser.displayName,
        calleeId: targetUid,
        calleeName: targetName,
        offer: offer.sdp,
        status: 'ringing',
        createdAt: serverTimestamp(),
      });
      setCallId(callRef.id);
      setCallOtherName(targetName);
      setCallOtherUid(targetUid);
      setCallView('ringing_out');
      pc.onicecandidate = async (e) => {
        if (e.candidate) {
          await addDoc(collection(db, 'calls', callRef.id, 'callerCandidates'), {
            candidate: JSON.stringify(e.candidate.toJSON()),
          });
        }
      };
      // Listen for answer
      unsubCall.current = onSnapshot(doc(db, 'calls', callRef.id), async (snap) => {
        const data = snap.data();
        if (!data) return;
        if (data.answer && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription({ type: 'answer', sdp: data.answer });
          setCallView('active');
        }
        if (data.status === 'rejected' || data.status === 'ended') {
          endCall();
        }
        // Apply remote ICE candidates
        const cands = await getDocs(collection(db, 'calls', callRef.id, 'calleeCandidates'));
        cands.forEach(async cd => {
          try {
            await pc.addIceCandidate(JSON.parse(cd.data().candidate));
          } catch {}
        });
      });
    } catch (e) {
      console.error('Call failed', e);
    }
  }, [ageConfirmed, currentUser]);

  const acceptCall = useCallback(async () => {
    if (!callId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = new RTCPeerConnection(STUN);
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.ontrack = (e) => {
        remoteStreamRef.current = e.streams[0];
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
      };
      const callSnap = await getDoc(doc(db, 'calls', callId));
      const callData = callSnap.data();
      if (!callData) return;
      await pc.setRemoteDescription({ type: 'offer', sdp: callData.offer });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await updateDoc(doc(db, 'calls', callId), { answer: answer.sdp, status: 'active' });
      pc.onicecandidate = async (e) => {
        if (e.candidate) {
          await addDoc(collection(db, 'calls', callId, 'calleeCandidates'), {
            candidate: JSON.stringify(e.candidate.toJSON()),
          });
        }
      };
      // Apply caller ICE candidates
      const callerCands = await getDocs(collection(db, 'calls', callId, 'callerCandidates'));
      callerCands.forEach(async cd => {
        try { await pc.addIceCandidate(JSON.parse(cd.data().candidate)); } catch {}
      });
      setCallView('active');
    } catch (e) {
      console.error('Accept call failed', e);
    }
  }, [callId]);

  const endCall = useCallback(async () => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current?.getTracks().forEach(t => t.stop());
    remoteStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    unsubCall.current?.();
    if (callId) {
      try { await updateDoc(doc(db, 'calls', callId), { status: 'ended' }); } catch {}
    }
    setCallId(null);
    setCallView(null);
  }, [callId]);

  const rejectCall = useCallback(async () => {
    if (callId) {
      try { await updateDoc(doc(db, 'calls', callId), { status: 'rejected' }); } catch {}
    }
    setCallId(null);
    setCallView(null);
  }, [callId]);

  const toggleMic = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMicOn(v => !v);
  };
  const toggleCam = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setCamOn(v => !v);
  };

  // ─── Cleanup ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      unsubConvos.current?.();
      unsubMessages.current?.();
      unsubCall.current?.();
      unsubIncoming.current?.();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ─── Render: Age gate ─────────────────────────────────────────────────────────
  if (showAgeGate) {
    return (
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-[#1a1a1a] rounded-2xl p-8 max-w-sm mx-4 text-center border border-white/10"
        >
          <div className="text-5xl mb-4">🔞</div>
          <h2 className="text-xl font-bold text-white mb-2">Conteúdo +18</h2>
          <p className="text-white/60 text-sm mb-6">
            As chamadas de vídeo podem conter conteúdo adulto. Confirme que você tem 18 anos ou mais para continuar.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => { setShowAgeGate(false); setPendingCallTarget(null); }}
              className="flex-1 py-3 rounded-xl bg-white/10 text-white text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                setAgeConfirmed(true);
                setShowAgeGate(false);
                if (pendingCallTarget) {
                  startCall(pendingCallTarget.uid, pendingCallTarget.name);
                  setPendingCallTarget(null);
                }
              }}
              className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-semibold"
            >
              Tenho +18 anos
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ─── Render: Incoming call ────────────────────────────────────────────────────
  if (callView === 'ringing_in') {
    return (
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-[#1a1a1a] rounded-3xl p-8 max-w-xs mx-4 text-center border border-white/10"
        >
          <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
            <Video size={36} className="text-white" />
          </div>
          <p className="text-white/50 text-sm mb-1">Chamada de vídeo</p>
          <h3 className="text-xl font-bold text-white mb-8">{callOtherName}</h3>
          <div className="flex justify-center gap-8">
            <button onClick={rejectCall} className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center">
              <PhoneOff size={24} className="text-white" />
            </button>
            <button onClick={acceptCall} className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center">
              <Phone size={24} className="text-white" />
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ─── Render: Active / outgoing call ──────────────────────────────────────────
  if (callView === 'active' || callView === 'ringing_out') {
    return (
      <div className="fixed inset-0 z-[300] bg-black flex flex-col">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ display: callView === 'active' ? 'block' : 'none' }}
        />
        {callView === 'ringing_out' && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center mb-4">
              <Video size={40} className="text-white" />
            </div>
            <p className="text-white text-xl font-semibold">{callOtherName}</p>
            <p className="text-white/50 mt-2">Chamando...</p>
          </div>
        )}
        {/* Local preview */}
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute bottom-24 right-4 w-28 h-40 rounded-2xl object-cover border-2 border-white/20 shadow-2xl"
        />
        {/* Controls */}
        <div className="absolute bottom-8 inset-x-0 flex justify-center gap-6 px-6">
          <button
            onClick={toggleMic}
            className={`w-14 h-14 rounded-full flex items-center justify-center ${micOn ? 'bg-white/20' : 'bg-red-600'}`}
          >
            {micOn ? <Mic size={22} className="text-white" /> : <MicOff size={22} className="text-white" />}
          </button>
          <button
            onClick={endCall}
            className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-lg"
          >
            <PhoneOff size={26} className="text-white" />
          </button>
          <button
            onClick={toggleCam}
            className={`w-14 h-14 rounded-full flex items-center justify-center ${camOn ? 'bg-white/20' : 'bg-red-600'}`}
          >
            {camOn ? <Video size={22} className="text-white" /> : <VideoOff size={22} className="text-white" />}
          </button>
        </div>
      </div>
    );
  }

  // ─── Render: Main chat UI ─────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed inset-0 z-[200] flex flex-col bg-[#0e0e0e]"
    >
      {/* ── List View ────────────────────────────────────────────────────── */}
      {view === 'list' && (
        <>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 pt-14 pb-4 bg-[#161616] border-b border-white/5">
            <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
              <X size={20} className="text-white" />
            </button>
            <h1 className="flex-1 text-white font-semibold text-lg">Mensagens</h1>
            <button
              onClick={() => { setSearchQuery(''); setSearchResults([]); setView('search'); }}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <Search size={20} className="text-white" />
            </button>
          </div>

          {/* Conversations list */}
          <div className="flex-1 overflow-y-auto">
            {convos.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-8">
                <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/30">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <p className="text-white/40 text-sm">Nenhuma conversa ainda</p>
                <button
                  onClick={() => { setView('search'); }}
                  className="mt-4 px-5 py-2 rounded-full bg-white/10 text-white text-sm"
                >
                  Começar conversa
                </button>
              </div>
            )}
            {convos.map(c => (
              <button
                key={c.id}
                onClick={() => openConversation(c.otherUid, c.otherName, c.otherPhoto)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5"
              >
                <div className="w-12 h-12 rounded-full bg-white/10 flex-shrink-0 overflow-hidden">
                  {c.otherPhoto ? (
                    <img src={c.otherPhoto} alt={c.otherName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/50 font-bold text-lg">
                      {c.otherName[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-white font-medium text-sm truncate">{c.otherName}</span>
                    <span className="text-white/30 text-xs ml-2 flex-shrink-0">{formatTime(c.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-white/40 text-xs truncate flex-1">{c.lastMessage || 'Sem mensagens'}</span>
                    {c.unread > 0 && (
                      <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center flex-shrink-0">
                        {c.unread > 9 ? '9+' : c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* New chat FAB */}
          <button
            onClick={() => setView('search')}
            className="absolute bottom-8 right-6 w-14 h-14 rounded-full bg-blue-500 flex items-center justify-center shadow-2xl"
          >
            <Plus size={24} className="text-white" />
          </button>
        </>
      )}

      {/* ── Search View ──────────────────────────────────────────────────── */}
      {view === 'search' && (
        <>
          <div className="flex items-center gap-3 px-4 pt-14 pb-4 bg-[#161616] border-b border-white/5">
            <button onClick={() => setView('list')} className="p-2 rounded-full hover:bg-white/10 transition-colors">
              <ArrowLeft size={20} className="text-white" />
            </button>
            <div className="flex-1 bg-white/10 rounded-full px-4 py-2 flex items-center gap-2">
              <Search size={16} className="text-white/40" />
              <input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar usuário..."
                className="flex-1 bg-transparent text-white text-sm outline-none placeholder-white/30"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {searching && (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin" />
              </div>
            )}
            {searchResults.map(u => (
              <button
                key={u.uid}
                onClick={() => openConversation(u.uid, u.username, u.profilePhotoUrl)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5"
              >
                <div className="w-11 h-11 rounded-full bg-white/10 overflow-hidden flex-shrink-0">
                  {u.profilePhotoUrl ? (
                    <img src={u.profilePhotoUrl} alt={u.username} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/50 font-bold">
                      {u.username[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="text-white text-sm font-medium">{u.username}</span>
              </button>
            ))}
            {!searching && searchQuery && searchResults.length === 0 && (
              <p className="text-center text-white/30 text-sm py-8">Nenhum usuário encontrado</p>
            )}
          </div>
        </>
      )}

      {/* ── Conversation View ─────────────────────────────────────────────── */}
      {view === 'conversation' && activeConvo && (
        <>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 pt-14 pb-3 bg-[#161616] border-b border-white/5">
            <button onClick={() => { unsubMessages.current?.(); setView('list'); }} className="p-2 rounded-full hover:bg-white/10">
              <ArrowLeft size={20} className="text-white" />
            </button>
            <div className="w-9 h-9 rounded-full bg-white/10 overflow-hidden flex-shrink-0">
              {activeConvo.otherPhoto ? (
                <img src={activeConvo.otherPhoto} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/50 font-semibold">
                  {activeConvo.otherName[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm truncate">{activeConvo.otherName}</p>
              <div className="flex items-center gap-1">
                <Lock size={10} className="text-green-400" />
                <p className="text-green-400 text-[10px]">criptografia ponta a ponta</p>
              </div>
            </div>
            <button
              onClick={() => startCall(activeConvo.otherUid, activeConvo.otherName)}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <Video size={20} className="text-white" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1" id="messages-scroll">
            {messages.map((msg, idx) => {
              const isMine = msg.senderId === currentUser.uid;
              const prevMsg = messages[idx - 1];
              const showDate = !prevMsg || new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();
              return (
                <React.Fragment key={msg.id}>
                  {showDate && (
                    <div className="flex justify-center my-2">
                      <span className="bg-white/10 text-white/50 text-[10px] px-3 py-1 rounded-full">
                        {new Date(msg.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                      </span>
                    </div>
                  )}
                  <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[72%] rounded-2xl px-3 py-2 ${
                        isMine
                          ? 'bg-blue-600 rounded-br-sm'
                          : 'bg-[#2a2a2a] rounded-bl-sm'
                      }`}
                    >
                      {msg.type === 'image' && msg.mediaUrl && (
                        <img
                          src={msg.mediaUrl}
                          alt="imagem"
                          className="rounded-xl max-w-full max-h-60 object-cover mb-1"
                          onClick={() => window.open(msg.mediaUrl, '_blank')}
                        />
                      )}
                      {msg.type === 'video' && msg.mediaUrl && (
                        <video
                          src={msg.mediaUrl}
                          controls
                          className="rounded-xl max-w-full max-h-60 mb-1"
                        />
                      )}
                      {(msg.type === 'text' || msg.content) && (
                        <p className="text-white text-sm leading-relaxed break-words">{msg.content}</p>
                      )}
                      <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <span className="text-[10px] text-white/30">{formatTime(msg.createdAt)}</span>
                        {isMine && (
                          msg.read
                            ? <CheckCheck size={12} className="text-blue-300" />
                            : <Check size={12} className="text-white/30" />
                        )}
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center py-16">
                <Lock size={28} className="text-white/20 mb-3" />
                <p className="text-white/30 text-sm">Mensagens protegidas com</p>
                <p className="text-white/30 text-sm">criptografia de ponta a ponta</p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <div className="px-3 py-3 bg-[#161616] border-t border-white/5 flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleMediaUpload(file);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-full hover:bg-white/10 flex-shrink-0"
              disabled={uploadingMedia}
            >
              {uploadingMedia
                ? <div className="w-5 h-5 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin" />
                : <ImageIcon size={20} className="text-white/50" />
              }
            </button>
            <div className="flex-1 bg-white/10 rounded-2xl px-4 py-2 min-h-[40px] flex items-center">
              <textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Mensagem..."
                rows={1}
                className="w-full bg-transparent text-white text-sm outline-none placeholder-white/30 resize-none max-h-32 overflow-y-auto"
                style={{ lineHeight: '1.4' }}
              />
            </div>
            <button
              onClick={() => sendMessage()}
              disabled={!inputText.trim() || sending}
              className={`p-2.5 rounded-full flex-shrink-0 transition-colors ${
                inputText.trim() ? 'bg-blue-600 hover:bg-blue-500' : 'bg-white/10'
              }`}
            >
              <Send size={18} className="text-white" />
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
};

export default ChatModal;
