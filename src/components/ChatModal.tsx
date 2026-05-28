import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Send, ArrowLeft, Search, Video, VideoOff, Mic, MicOff,
  PhoneOff, Lock, CheckCheck, Check, ImageIcon, Plus, Phone,
  Users, Globe, Copy, UserPlus, Crown, LogOut, MessageSquare, Hash,
  ChevronRight, Link2, Globe2, EyeOff, ShieldCheck, ShieldX
} from 'lucide-react';
import {
  collection, query, where, orderBy, onSnapshot, addDoc,
  updateDoc, doc, setDoc, getDoc, getDocs, serverTimestamp,
  arrayUnion, arrayRemove
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { getOrCreateKeyPair, deriveSharedKey, encryptText, decryptText } from '../utils/crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

type ChatView =
  | 'phone_phone' | 'phone_pending'
  | 'list'
  | 'dm_search' | 'dm_convo'
  | 'group_search' | 'group_create' | 'group_convo' | 'group_detail';

type MainTab = 'dms' | 'groups';

interface CurrentUser { uid: string; displayName: string; photoURL: string | null; }

interface ChatModalProps {
  currentUser: CurrentUser;
  onClose: () => void;
  initialChatWithUid?: string | null;
  initialChatWithName?: string | null;
  initialChatWithPhoto?: string | null;
}

interface ChatConvo {
  id: string; otherUid: string; otherName: string; otherPhoto: string | null;
  lastMessage: string; lastMessageAt: number; unread: number;
}

interface ChatMsg {
  id: string; senderId: string; content: string;
  type: 'text' | 'image' | 'video'; mediaUrl?: string; createdAt: number; read: boolean;
}

interface Group {
  id: string; name: string; description: string; adminUid: string;
  members: string[]; isPublic: boolean; inviteCode: string;
  lastMessage: string; lastMessageAt: number;
}

interface GroupMsg {
  id: string; senderId: string; senderName: string; content: string;
  type: 'text' | 'image' | 'video'; mediaUrl?: string; createdAt: number;
}

interface SearchUser { uid: string; username: string; profilePhotoUrl: string | null; }

interface PhoneLinkRequest {
  id: string;
  requestingUid: string;
  requestingUsername: string;
  requestingPhoto: string | null;
  phone: string;
  ownerUid: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STUN = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };
function getChatId(a: string, b: string) { return [a, b].sort().join('_'); }
function genCode() { return Math.random().toString(36).slice(2, 10).toUpperCase(); }
function fmt(ts: number) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
}

// Country codes for phone
const COUNTRIES = [
  { code: '+55', flag: '🇧🇷', name: 'Brasil' },
  { code: '+1', flag: '🇺🇸', name: 'EUA' },
  { code: '+351', flag: '🇵🇹', name: 'Portugal' },
  { code: '+54', flag: '🇦🇷', name: 'Argentina' },
  { code: '+34', flag: '🇪🇸', name: 'Espanha' },
  { code: '+44', flag: '🇬🇧', name: 'Reino Unido' },
  { code: '+49', flag: '🇩🇪', name: 'Alemanha' },
  { code: '+33', flag: '🇫🇷', name: 'França' },
];

// ─── Main Component ───────────────────────────────────────────────────────────

const ChatModal: React.FC<ChatModalProps> = ({
  currentUser, onClose, initialChatWithUid, initialChatWithName, initialChatWithPhoto
}) => {
  // ── Window size
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 500);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 500);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // ── Phone verification
  const [phoneLoading, setPhoneLoading] = useState(true);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneCountry, setPhoneCountry] = useState('+55');
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneSending, setPhoneSending] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [phoneRequestId, setPhoneRequestId] = useState('');
  const [incomingPhoneRequests, setIncomingPhoneRequests] = useState<PhoneLinkRequest[]>([]);

  // ── Navigation
  const [view, setView] = useState<ChatView>('list');
  const [tab, setTab] = useState<MainTab>('dms');

  // ── DM
  const [convos, setConvos] = useState<ChatConvo[]>([]);
  const [dmSearch, setDmSearch] = useState('');
  const [dmSearchResults, setDmSearchResults] = useState<SearchUser[]>([]);
  const [dmSearching, setDmSearching] = useState(false);
  const [activeConvo, setActiveConvo] = useState<{ chatId: string; otherUid: string; otherName: string; otherPhoto: string | null } | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [dmInput, setDmInput] = useState('');
  const [dmSending, setDmSending] = useState(false);
  const [myPrivateKey, setMyPrivateKey] = useState<CryptoKey | null>(null);
  const sharedKeys = useRef(new Map<string, CryptoKey>());

  // ── Groups
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [groupSearchResults, setGroupSearchResults] = useState<Group[]>([]);
  const [groupSearching, setGroupSearching] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [groupMessages, setGroupMessages] = useState<GroupMsg[]>([]);
  const [groupInput, setGroupInput] = useState('');
  const [groupSending, setGroupSending] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newGroupPublic, setNewGroupPublic] = useState(true);
  const [groupCreating, setGroupCreating] = useState(false);
  const [groupMembers, setGroupMembers] = useState<SearchUser[]>([]);
  const [addMemberQuery, setAddMemberQuery] = useState('');
  const [addMemberResults, setAddMemberResults] = useState<SearchUser[]>([]);
  const [copied, setCopied] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // ── Call
  const [callView, setCallView] = useState<'out' | 'in' | 'active' | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [callOtherName, setCallOtherName] = useState('');
  const [callOtherUid, setCallOtherUid] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [ageOk, setAgeOk] = useState(false);
  const [showAgeGate, setShowAgeGate] = useState(false);
  const [pendingCall, setPendingCall] = useState<{ uid: string; name: string } | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const msgsEnd = useRef<HTMLDivElement>(null);
  const grpMsgsEnd = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uns = useRef<Record<string, (() => void) | null>>({ convos: null, msgs: null, groups: null, grpMsgs: null, call: null, incoming: null, phoneReqs: null });

  // ── Check phone verification ──────────────────────────────────────────────
  useEffect(() => {
    getDocs(query(collection(db, 'users'), where('uid', '==', currentUser.uid))).then(snap => {
      if (!snap.empty) setPhoneVerified(!!snap.docs[0].data().verifiedPhone);
      setPhoneLoading(false);
    }).catch(() => setPhoneLoading(false));
  }, [currentUser.uid]);

  useEffect(() => {
    if (phoneLoading) return;
    if (!phoneVerified) { setView('phone_phone'); return; }
    initChat();
  }, [phoneLoading, phoneVerified]);

  const initChat = useCallback(async () => {
    try {
      const { privateKey, publicKeyB64 } = await getOrCreateKeyPair(currentUser.uid);
      setMyPrivateKey(privateKey);
      await setDoc(doc(db, 'userKeys', currentUser.uid), { publicKey: publicKeyB64, updatedAt: new Date().toISOString() }, { merge: true });
    } catch {}

    uns.current.convos = onSnapshot(
      query(collection(db, 'chats'), where('participants', 'array-contains', currentUser.uid)),
      snap => {
        const list: ChatConvo[] = snap.docs.map(d => {
          const data = d.data();
          const other = (data.participants as string[]).find(u => u !== currentUser.uid) || '';
          return { id: d.id, otherUid: other, otherName: data.participantNames?.[other] || 'Usuário', otherPhoto: data.participantPhotos?.[other] || null, lastMessage: data.lastMessage || '', lastMessageAt: data.lastMessageAt?.toMillis?.() || 0, unread: data.unread?.[currentUser.uid] || 0 };
        }).sort((a, b) => b.lastMessageAt - a.lastMessageAt);
        setConvos(list);
      }
    );

    uns.current.groups = onSnapshot(
      query(collection(db, 'groups'), where('members', 'array-contains', currentUser.uid)),
      snap => {
        const list: Group[] = snap.docs.map(d => {
          const data = d.data();
          return { id: d.id, name: data.name || '', description: data.description || '', adminUid: data.adminUid || '', members: data.members || [], isPublic: !!data.isPublic, inviteCode: data.inviteCode || '', lastMessage: data.lastMessage || '', lastMessageAt: data.lastMessageAt?.toMillis?.() || 0 };
        }).sort((a, b) => b.lastMessageAt - a.lastMessageAt);
        setGroups(list);
      }
    );

    uns.current.incoming = onSnapshot(
      query(collection(db, 'calls'), where('calleeId', '==', currentUser.uid), where('status', '==', 'ringing')),
      snap => {
        if (snap.empty || callView) return;
        const d = snap.docs[0]; const data = d.data();
        setCallId(d.id); setCallOtherName(data.callerName || 'Alguém'); setCallOtherUid(data.callerId); setCallView('in');
      }
    );

    uns.current.phoneReqs = onSnapshot(
      query(collection(db, 'phone_link_requests'), where('ownerUid', '==', currentUser.uid), where('status', '==', 'pending')),
      snap => {
        const reqs: PhoneLinkRequest[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        setIncomingPhoneRequests(reqs);
      }
    );

    if (initialChatWithUid) openDM(initialChatWithUid, initialChatWithName || 'Usuário', initialChatWithPhoto || null);
  }, [currentUser, initialChatWithUid, initialChatWithName, initialChatWithPhoto]);

  // ── Phone number uniqueness + request flow ───────────────────────────────
  const submitPhone = async () => {
    const fullPhone = phoneCountry + phoneInput.replace(/\D/g, '');
    if (fullPhone.replace(/\D/g, '').length < 10) { setPhoneError('Número inválido. Ex: 11 99999-9999'); return; }
    setPhoneSending(true); setPhoneError('');
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('verifiedPhone', '==', fullPhone)));
      if (!snap.empty) {
        const existing = snap.docs[0].data();
        if (existing.uid === currentUser.uid) { setPhoneVerified(true); return; }
        // Phone belongs to another user — request approval
        const mySnap = await getDocs(query(collection(db, 'users'), where('uid', '==', currentUser.uid)));
        const myData = mySnap.docs[0]?.data() || {};
        const reqRef = await addDoc(collection(db, 'phone_link_requests'), {
          requestingUid: currentUser.uid,
          requestingUsername: myData.username || currentUser.displayName || 'Usuário',
          requestingPhoto: myData.profilePhotoUrl || currentUser.photoURL || null,
          phone: fullPhone,
          ownerUid: existing.uid,
          status: 'pending',
          createdAt: Date.now(),
        });
        setPhoneRequestId(reqRef.id);
        setView('phone_pending');
      } else {
        // Phone is free — save directly
        await savePhone();
      }
    } catch (e: any) {
      setPhoneError(e.message || 'Erro ao verificar número. Tente novamente.');
    } finally { setPhoneSending(false); }
  };

  const savePhone = async () => {
    const fullPhone = phoneCountry + phoneInput.replace(/\D/g, '');
    const snap = await getDocs(query(collection(db, 'users'), where('uid', '==', currentUser.uid)));
    if (!snap.empty) await updateDoc(snap.docs[0].ref, { verifiedPhone: fullPhone, phoneVerifiedAt: new Date().toISOString() });
    setPhoneVerified(true);
  };

  // Listen for approval/denial of our pending phone link request
  useEffect(() => {
    if (view !== 'phone_pending' || !phoneRequestId) return;
    const unsub = onSnapshot(doc(db, 'phone_link_requests', phoneRequestId), async d => {
      if (!d.exists()) return;
      const status = d.data().status as string;
      if (status === 'approved') {
        await savePhone();
      } else if (status === 'denied') {
        setPhoneError('O dono do número negou o acesso. Tente um número diferente.');
        setView('phone_phone'); setPhoneRequestId('');
      }
    });
    return () => unsub();
  }, [view, phoneRequestId]);

  const approvePhoneRequest = async (req: PhoneLinkRequest) => {
    await updateDoc(doc(db, 'phone_link_requests', req.id), { status: 'approved' });
    const reqUserSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', req.requestingUid)));
    if (!reqUserSnap.empty) {
      await updateDoc(reqUserSnap.docs[0].ref, { verifiedPhone: req.phone, phoneVerifiedAt: new Date().toISOString() });
    }
  };

  const denyPhoneRequest = async (req: PhoneLinkRequest) => {
    await updateDoc(doc(db, 'phone_link_requests', req.id), { status: 'denied' });
  };

  // ── DM ────────────────────────────────────────────────────────────────────
  const getShared = useCallback(async (chatId: string, otherUid: string) => {
    if (sharedKeys.current.has(chatId)) return sharedKeys.current.get(chatId)!;
    if (!myPrivateKey) return null;
    try {
      const kd = await getDoc(doc(db, 'userKeys', otherUid));
      if (!kd.exists()) return null;
      const sk = await deriveSharedKey(myPrivateKey, kd.data().publicKey);
      sharedKeys.current.set(chatId, sk); return sk;
    } catch { return null; }
  }, [myPrivateKey]);

  const openDM = useCallback(async (otherUid: string, otherName: string, otherPhoto: string | null) => {
    const chatId = getChatId(currentUser.uid, otherUid);
    setActiveConvo({ chatId, otherUid, otherName, otherPhoto });
    setMessages([]); setView('dm_convo');
    const chatRef = doc(db, 'chats', chatId);
    const snap = await getDoc(chatRef);
    if (!snap.exists()) {
      await setDoc(chatRef, { participants: [currentUser.uid, otherUid], participantNames: { [currentUser.uid]: currentUser.displayName, [otherUid]: otherName }, participantPhotos: { [currentUser.uid]: currentUser.photoURL || null, [otherUid]: otherPhoto }, lastMessage: '', lastMessageAt: serverTimestamp(), unread: { [currentUser.uid]: 0, [otherUid]: 0 }, createdAt: new Date().toISOString() });
    } else { await updateDoc(chatRef, { [`unread.${currentUser.uid}`]: 0 }); }
    uns.current.msgs?.();
    const shared = await getShared(chatId, otherUid);
    uns.current.msgs = onSnapshot(query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc')), async mSnap => {
      const dec: ChatMsg[] = [];
      for (const d of mSnap.docs) {
        const data = d.data(); let content = '';
        if (shared && data.ct && data.iv) content = await decryptText(shared, data.ct, data.iv);
        else if (data.content) content = data.content;
        dec.push({ id: d.id, senderId: data.senderId, content, type: data.type || 'text', mediaUrl: data.mediaUrl, createdAt: data.createdAt?.toMillis?.() || Date.now(), read: data.read || false });
      }
      setMessages(dec);
      setTimeout(() => msgsEnd.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    });
  }, [currentUser, getShared]);

  const sendDM = useCallback(async (type: 'text' | 'image' | 'video' = 'text', mediaUrl?: string) => {
    if (!activeConvo || (!dmInput.trim() && type === 'text') || dmSending) return;
    const text = type === 'text' ? dmInput.trim() : '';
    setDmInput(''); setDmSending(true);
    try {
      const shared = await getShared(activeConvo.chatId, activeConvo.otherUid);
      const md: Record<string, any> = { senderId: currentUser.uid, type, mediaUrl: mediaUrl || null, createdAt: serverTimestamp(), read: false };
      if (shared && type === 'text') { const { ct, iv } = await encryptText(shared, text); md.ct = ct; md.iv = iv; } else { md.content = text; }
      await addDoc(collection(db, 'chats', activeConvo.chatId, 'messages'), md);
      const prev = type === 'text' ? text.slice(0, 60) : type === 'image' ? '📷 Imagem' : '🎬 Vídeo';
      await updateDoc(doc(db, 'chats', activeConvo.chatId), { lastMessage: prev, lastMessageAt: serverTimestamp() });
    } catch {} finally { setDmSending(false); }
  }, [activeConvo, dmInput, dmSending, currentUser, getShared]);

  // DM search
  useEffect(() => {
    if (view !== 'dm_search' || !dmSearch.trim()) { setDmSearchResults([]); return; }
    const t = setTimeout(async () => {
      setDmSearching(true);
      try {
        const snap = await getDocs(collection(db, 'users'));
        const res: SearchUser[] = [];
        snap.forEach(d => { const data = d.data(); if (data.uid !== currentUser.uid && data.username?.toLowerCase().includes(dmSearch.toLowerCase())) res.push({ uid: data.uid, username: data.username, profilePhotoUrl: data.profilePhotoUrl || null }); });
        setDmSearchResults(res.slice(0, 20));
      } catch {} finally { setDmSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [dmSearch, view, currentUser.uid]);

  // ── Groups ────────────────────────────────────────────────────────────────
  const openGroup = useCallback((group: Group) => {
    setActiveGroup(group); setGroupMessages([]); setView('group_convo');
    uns.current.grpMsgs?.();
    uns.current.grpMsgs = onSnapshot(query(collection(db, 'groups', group.id, 'messages'), orderBy('createdAt', 'asc')), snap => {
      const msgs: GroupMsg[] = snap.docs.map(d => { const data = d.data(); return { id: d.id, senderId: data.senderId, senderName: data.senderName || 'Usuário', content: data.content || '', type: data.type || 'text', mediaUrl: data.mediaUrl, createdAt: data.createdAt?.toMillis?.() || Date.now() }; });
      setGroupMessages(msgs);
      setTimeout(() => grpMsgsEnd.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    });
  }, []);

  const sendGroup = useCallback(async (type: 'text' | 'image' | 'video' = 'text', mediaUrl?: string) => {
    if (!activeGroup || (!groupInput.trim() && type === 'text') || groupSending) return;
    const text = type === 'text' ? groupInput.trim() : '';
    setGroupInput(''); setGroupSending(true);
    try {
      await addDoc(collection(db, 'groups', activeGroup.id, 'messages'), { senderId: currentUser.uid, senderName: currentUser.displayName, content: text, type, mediaUrl: mediaUrl || null, createdAt: serverTimestamp() });
      const prev = type === 'text' ? text.slice(0, 60) : type === 'image' ? '📷 Imagem' : '🎬 Vídeo';
      await updateDoc(doc(db, 'groups', activeGroup.id), { lastMessage: `${currentUser.displayName}: ${prev}`, lastMessageAt: serverTimestamp() });
    } catch {} finally { setGroupSending(false); }
  }, [activeGroup, groupInput, groupSending, currentUser]);

  const createGroup = async () => {
    if (!newGroupName.trim() || groupCreating) return;
    setGroupCreating(true);
    try {
      const code = genCode();
      const ref = await addDoc(collection(db, 'groups'), { name: newGroupName.trim(), description: newGroupDesc.trim(), adminUid: currentUser.uid, members: [currentUser.uid], isPublic: newGroupPublic, inviteCode: code, lastMessage: '', lastMessageAt: serverTimestamp(), createdAt: new Date().toISOString() });
      const g: Group = { id: ref.id, name: newGroupName.trim(), description: newGroupDesc.trim(), adminUid: currentUser.uid, members: [currentUser.uid], isPublic: newGroupPublic, inviteCode: code, lastMessage: '', lastMessageAt: Date.now() };
      setNewGroupName(''); setNewGroupDesc(''); setNewGroupPublic(true);
      openGroup(g);
    } catch {} finally { setGroupCreating(false); }
  };

  // Group search
  useEffect(() => {
    if (view !== 'group_search' || !groupSearch.trim()) { setGroupSearchResults([]); return; }
    const t = setTimeout(async () => {
      setGroupSearching(true);
      try {
        const snap = await getDocs(query(collection(db, 'groups'), where('isPublic', '==', true)));
        setGroupSearchResults(snap.docs.map(d => ({ id: d.id, ...d.data() } as Group)).filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase()) && !g.members.includes(currentUser.uid)).slice(0, 20));
      } catch {} finally { setGroupSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [groupSearch, view, currentUser.uid]);

  const joinGroup = async (g: Group) => {
    try { await updateDoc(doc(db, 'groups', g.id), { members: arrayUnion(currentUser.uid) }); openGroup({ ...g, members: [...g.members, currentUser.uid] }); } catch {}
  };

  const joinByCode = async () => {
    if (!joinCode.trim()) return;
    try {
      const snap = await getDocs(query(collection(db, 'groups'), where('inviteCode', '==', joinCode.trim().toUpperCase())));
      if (snap.empty) { alert('Código inválido'); return; }
      const g = { id: snap.docs[0].id, ...snap.docs[0].data() } as Group;
      if (g.members.includes(currentUser.uid)) { openGroup(g); return; }
      await joinGroup(g);
    } catch {}
  };

  const leaveGroup = async (g: Group) => {
    try { await updateDoc(doc(db, 'groups', g.id), { members: arrayRemove(currentUser.uid) }); setView('list'); setTab('groups'); } catch {}
  };

  // Group detail: load members
  useEffect(() => {
    if (view !== 'group_detail' || !activeGroup) return;
    (async () => {
      const ms: SearchUser[] = [];
      for (const uid of activeGroup.members) {
        const snap = await getDocs(query(collection(db, 'users'), where('uid', '==', uid)));
        if (!snap.empty) { const d = snap.docs[0].data(); ms.push({ uid, username: d.username || 'Usuário', profilePhotoUrl: d.profilePhotoUrl || null }); }
      }
      setGroupMembers(ms);
    })();
  }, [view, activeGroup]);

  // Group detail: add member search
  useEffect(() => {
    if (view !== 'group_detail' || !addMemberQuery.trim()) { setAddMemberResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        const res: SearchUser[] = [];
        snap.forEach(d => { const data = d.data(); if (data.uid !== currentUser.uid && !activeGroup?.members.includes(data.uid) && data.username?.toLowerCase().includes(addMemberQuery.toLowerCase())) res.push({ uid: data.uid, username: data.username, profilePhotoUrl: data.profilePhotoUrl || null }); });
        setAddMemberResults(res.slice(0, 10));
      } catch {}
    }, 350);
    return () => clearTimeout(t);
  }, [addMemberQuery, view, activeGroup, currentUser.uid]);

  const addMember = async (uid: string) => {
    if (!activeGroup) return;
    try { await updateDoc(doc(db, 'groups', activeGroup.id), { members: arrayUnion(uid) }); setActiveGroup(p => p ? { ...p, members: [...p.members, uid] } : p); setAddMemberQuery(''); setAddMemberResults([]); } catch {}
  };

  // ── Media ─────────────────────────────────────────────────────────────────
  const uploadMedia = async (file: File, mode: 'dm' | 'group') => {
    setUploadingMedia(true);
    try {
      const isVideo = file.type.startsWith('video/');
      const reader = new FileReader();
      const dataUrl: string = await new Promise(res => { reader.onload = () => res(reader.result as string); reader.readAsDataURL(file); });
      const res = await fetch('/api/upload-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: dataUrl.split(',')[1], filename: file.name }) });
      if (!res.ok) throw new Error();
      const json = await res.json();
      const url = json.url || json.secureUrl;
      if (url) { if (mode === 'dm') await sendDM(isVideo ? 'video' : 'image', url); else await sendGroup(isVideo ? 'video' : 'image', url); }
    } catch {} finally { setUploadingMedia(false); }
  };

  // ── Call ──────────────────────────────────────────────────────────────────
  const startCall = async (targetUid: string, targetName: string) => {
    if (!ageOk) { setPendingCall({ uid: targetUid, name: targetName }); setShowAgeGate(true); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = new RTCPeerConnection(STUN); pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.ontrack = e => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0]; };
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      const callRef = await addDoc(collection(db, 'calls'), { callerId: currentUser.uid, callerName: currentUser.displayName, calleeId: targetUid, calleeName: targetName, offer: offer.sdp, status: 'ringing', createdAt: serverTimestamp() });
      setCallId(callRef.id); setCallOtherName(targetName); setCallOtherUid(targetUid); setCallView('out');
      pc.onicecandidate = async e => { if (e.candidate) await addDoc(collection(db, 'calls', callRef.id, 'callerCandidates'), { candidate: JSON.stringify(e.candidate.toJSON()) }); };
      uns.current.call = onSnapshot(doc(db, 'calls', callRef.id), async snap => {
        const data = snap.data(); if (!data) return;
        if (data.answer && pc.signalingState === 'have-local-offer') { await pc.setRemoteDescription({ type: 'answer', sdp: data.answer }); setCallView('active'); }
        if (data.status === 'rejected' || data.status === 'ended') endCall();
      });
    } catch {}
  };

  const acceptCall = async () => {
    if (!callId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = new RTCPeerConnection(STUN); pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.ontrack = e => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0]; };
      const snap = await getDoc(doc(db, 'calls', callId));
      await pc.setRemoteDescription({ type: 'offer', sdp: snap.data()!.offer });
      const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
      await updateDoc(doc(db, 'calls', callId), { answer: answer.sdp, status: 'active' });
      pc.onicecandidate = async e => { if (e.candidate) await addDoc(collection(db, 'calls', callId, 'calleeCandidates'), { candidate: JSON.stringify(e.candidate.toJSON()) }); };
      const cands = await getDocs(collection(db, 'calls', callId, 'callerCandidates'));
      cands.forEach(async c => { try { await pc.addIceCandidate(JSON.parse(c.data().candidate)); } catch {} });
      setCallView('active');
    } catch {}
  };

  const endCall = useCallback(async () => {
    pcRef.current?.close(); pcRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop()); localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    uns.current.call?.();
    if (callId) try { await updateDoc(doc(db, 'calls', callId), { status: 'ended' }); } catch {}
    setCallId(null); setCallView(null);
  }, [callId]);

  const rejectCall = async () => {
    if (callId) try { await updateDoc(doc(db, 'calls', callId), { status: 'rejected' }); } catch {}
    setCallId(null); setCallView(null);
  };

  useEffect(() => () => {
    Object.values(uns.current).forEach(u => { if (typeof u === 'function') u(); });
    localStreamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // ── RENDER ───────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  // Tiny avatar helper
  const Avatar = ({ src, name, size = 36 }: { src?: string | null; name: string; size?: number }) => (
    <div className="rounded-full bg-white/10 flex-shrink-0 overflow-hidden flex items-center justify-center font-bold text-white/50" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {src ? <img src={src} alt={name} className="w-full h-full object-cover" /> : name[0]?.toUpperCase()}
    </div>
  );

  // Shared input bar
  const InputBar = ({ value, onChange, onSend, onFileClick, sending, uploading, mode }: { value: string; onChange: (v: string) => void; onSend: () => void; onFileClick: () => void; sending: boolean; uploading: boolean; mode: 'dm' | 'group' }) => (
    <div className="px-3 py-2 bg-[#161616] border-t border-white/5 flex items-end gap-2">
      <button onClick={onFileClick} disabled={uploading} className="p-2 rounded-full hover:bg-white/10 flex-shrink-0">
        {uploading ? <div className="w-5 h-5 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin" /> : <ImageIcon size={19} className="text-white/50" />}
      </button>
      <div className="flex-1 bg-white/10 rounded-2xl px-3 py-2 flex items-center">
        <textarea value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }} placeholder="Mensagem..." rows={1} className="w-full bg-transparent text-white text-sm outline-none placeholder-white/30 resize-none max-h-28 overflow-y-auto" style={{ lineHeight: '1.4' }} />
      </div>
      <button onClick={onSend} disabled={!value.trim() || sending} className={`p-2.5 rounded-full flex-shrink-0 transition-colors ${value.trim() ? 'bg-blue-600 hover:bg-blue-500' : 'bg-white/10'}`}>
        <Send size={17} className="text-white" />
      </button>
    </div>
  );

  // ── Call overlays (full-screen, outside popup) ────────────────────────────
  if (showAgeGate) return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-[#1a1a1a] rounded-2xl p-8 max-w-sm mx-4 text-center border border-white/10">
        <div className="text-5xl mb-4">🔞</div>
        <h2 className="text-xl font-bold text-white mb-2">Chamada +18</h2>
        <p className="text-white/60 text-sm mb-6">Chamadas de vídeo podem conter conteúdo adulto. Confirme que você tem 18 anos ou mais.</p>
        <div className="flex gap-3">
          <button onClick={() => { setShowAgeGate(false); setPendingCall(null); }} className="flex-1 py-3 rounded-xl bg-white/10 text-white text-sm">Cancelar</button>
          <button onClick={() => { setAgeOk(true); setShowAgeGate(false); if (pendingCall) { startCall(pendingCall.uid, pendingCall.name); setPendingCall(null); } }} className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-semibold">Tenho +18</button>
        </div>
      </motion.div>
    </div>
  );

  if (callView === 'in') return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-[#1a1a1a] rounded-3xl p-8 max-w-xs mx-4 text-center border border-white/10">
        <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4"><Video size={36} className="text-white" /></div>
        <p className="text-white/50 text-sm mb-1">Chamada de vídeo</p>
        <h3 className="text-xl font-bold text-white mb-8">{callOtherName}</h3>
        <div className="flex justify-center gap-8">
          <button onClick={rejectCall} className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center"><PhoneOff size={24} className="text-white" /></button>
          <button onClick={acceptCall} className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center"><Phone size={24} className="text-white" /></button>
        </div>
      </motion.div>
    </div>
  );

  if (callView === 'active' || callView === 'out') return (
    <div className="fixed inset-0 z-[400] bg-black flex flex-col">
      <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" style={{ display: callView === 'active' ? 'block' : 'none' }} />
      {callView === 'out' && <div className="flex-1 flex flex-col items-center justify-center"><div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center mb-4"><Video size={40} className="text-white" /></div><p className="text-white text-xl font-semibold">{callOtherName}</p><p className="text-white/50 mt-2">Chamando...</p></div>}
      <video ref={localVideoRef} autoPlay playsInline muted className="absolute bottom-28 right-4 w-28 h-40 rounded-2xl object-cover border-2 border-white/20 shadow-2xl" />
      <div className="absolute bottom-10 inset-x-0 flex justify-center gap-6">
        <button onClick={() => { localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; }); setMicOn(v => !v); }} className={`w-14 h-14 rounded-full flex items-center justify-center ${micOn ? 'bg-white/20' : 'bg-red-600'}`}>{micOn ? <Mic size={22} className="text-white" /> : <MicOff size={22} className="text-white" />}</button>
        <button onClick={endCall} className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-lg"><PhoneOff size={26} className="text-white" /></button>
        <button onClick={() => { localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; }); setCamOn(v => !v); }} className={`w-14 h-14 rounded-full flex items-center justify-center ${camOn ? 'bg-white/20' : 'bg-red-600'}`}>{camOn ? <Video size={22} className="text-white" /> : <VideoOff size={22} className="text-white" />}</button>
      </div>
    </div>
  );

  // ── Popup panel ────────────────────────────────────────────────────────────
  const panelStyle: React.CSSProperties = isMobile
    ? { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 300, width: 'min(92vw, 420px)', height: 'min(88svh, 660px)', borderRadius: 20 }
    : { position: 'fixed', top: 72, right: 14, width: 384, height: Math.min(620, window.innerHeight - 120), zIndex: 300, borderRadius: 20 };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50"
        style={{ zIndex: 299 }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ type: 'spring', damping: 30, stiffness: 340 }}
        className="glass-panel flex flex-col overflow-hidden"
        style={panelStyle}
      >
        {/* ── Loading ──────────────────────────────────────────────────── */}
        {phoneLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin" />
          </div>
        )}

        {/* ── Enter phone number ──────────────────────────────────────── */}
        {!phoneLoading && !phoneVerified && view === 'phone_phone' && (
          <div className="flex-1 flex flex-col">
            <div className="flex items-center gap-3 px-4 pt-4 pb-4 border-b border-white/8">
              <div className="flex-1">
                <h2 className="text-white font-semibold text-base">Número de Telefone</h2>
                <p className="text-white/40 text-xs mt-0.5">Necessário apenas na primeira vez</p>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X size={18} className="text-white/60" /></button>
            </div>
            <div className="flex-1 flex flex-col justify-center px-5 py-6 gap-4">
              <div className="w-16 h-16 rounded-full bg-blue-600/20 flex items-center justify-center mx-auto">
                <Phone size={28} className="text-blue-400" />
              </div>
              <div className="text-center">
                <h3 className="text-white font-bold text-lg">Seu número de telefone</h3>
                <p className="text-white/50 text-sm mt-1">Cada número é único por conta. Se já estiver em uso, o dono será notificado para aprovar.</p>
              </div>
              {phoneError && <p className="text-red-400 text-xs text-center bg-red-500/10 rounded-xl py-2 px-3">{phoneError}</p>}
              <div className="flex gap-2">
                <div className="relative">
                  <button onClick={() => setShowCountryPicker(v => !v)} className="h-12 px-3 rounded-xl bg-white/8 border border-white/10 text-white text-sm flex items-center gap-1 whitespace-nowrap">
                    {COUNTRIES.find(c => c.code === phoneCountry)?.flag} {phoneCountry}
                  </button>
                  {showCountryPicker && (
                    <div className="absolute top-14 left-0 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl z-10 overflow-hidden w-48">
                      {COUNTRIES.map(c => (
                        <button key={c.code} onClick={() => { setPhoneCountry(c.code); setShowCountryPicker(false); }} className="w-full px-3 py-2 text-left text-white text-sm hover:bg-white/10 flex items-center gap-2">
                          <span>{c.flag}</span><span>{c.name}</span><span className="text-white/40 text-xs ml-auto">{c.code}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input value={phoneInput} onChange={e => setPhoneInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitPhone(); }} placeholder="11 99999-9999" className="flex-1 h-12 bg-white/8 border border-white/10 rounded-xl px-4 text-white text-sm outline-none focus:border-blue-500/50 placeholder-white/20" inputMode="tel" />
              </div>
              <button onClick={submitPhone} disabled={phoneSending || !phoneInput.trim()} className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors">
                {phoneSending ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Phone size={16} /> Continuar</>}
              </button>
            </div>
          </div>
        )}

        {/* ── Waiting for phone owner approval ─────────────────────────── */}
        {!phoneLoading && !phoneVerified && view === 'phone_pending' && (
          <div className="flex-1 flex flex-col">
            <div className="flex items-center gap-3 px-4 pt-4 pb-4 border-b border-white/8">
              <button onClick={() => { setView('phone_phone'); setPhoneRequestId(''); setPhoneError(''); }} className="p-1.5 rounded-full hover:bg-white/10"><ArrowLeft size={18} className="text-white/60" /></button>
              <div className="flex-1">
                <h2 className="text-white font-semibold text-base">Aguardando aprovação</h2>
                <p className="text-white/40 text-xs mt-0.5">{phoneCountry} {phoneInput}</p>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X size={18} className="text-white/60" /></button>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center px-5 py-6 gap-5 text-center">
              <div className="w-20 h-20 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <Phone size={34} className="text-yellow-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg">Número em uso</h3>
                <p className="text-white/50 text-sm mt-2">O dono deste número foi notificado dentro do app. Quando ele aprovar, você terá acesso automaticamente.</p>
              </div>
              <div className="w-8 h-8 border-2 border-white/20 border-t-yellow-400 rounded-full animate-spin" />
              {phoneError && <p className="text-red-400 text-xs bg-red-500/10 rounded-xl py-2 px-3 w-full">{phoneError}</p>}
            </div>
          </div>
        )}

        {/* ── Main chat UI ───────────────────────────────────────────── */}
        {!phoneLoading && phoneVerified && (
          <>
            {/* ── Panel header (changes with view) ─── */}
            {view === 'list' && (
              <div className="flex flex-col border-b border-white/8 flex-shrink-0">
                <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
                  <span className="flex-1 text-white font-semibold text-base">Mensagens</span>
                  <button onClick={() => { setDmSearch(''); setView('dm_search'); }} className="p-1.5 rounded-full hover:bg-white/10" title="Nova mensagem"><Search size={17} className="text-white/60" /></button>
                  {tab === 'groups' && <button onClick={() => { setNewGroupName(''); setNewGroupDesc(''); setNewGroupPublic(true); setView('group_create'); }} className="p-1.5 rounded-full hover:bg-white/10" title="Criar grupo"><Plus size={17} className="text-white/60" /></button>}
                  <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X size={17} className="text-white/60" /></button>
                </div>
                <div className="flex border-t border-white/5">
                  {(['dms', 'groups'] as MainTab[]).map(t => (
                    <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${tab === t ? 'border-blue-500 text-blue-400' : 'border-transparent text-white/40 hover:text-white/60'}`}>
                      {t === 'dms' ? <><MessageSquare size={13} /> DMs</> : <><Users size={13} /> Grupos</>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Back-header for sub-views */}
            {(view === 'dm_search' || view === 'group_search' || view === 'group_create') && (
              <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-white/8 flex-shrink-0">
                <button onClick={() => setView('list')} className="p-1.5 rounded-full hover:bg-white/10"><ArrowLeft size={18} className="text-white/60" /></button>
                <span className="flex-1 text-white font-semibold text-sm">
                  {view === 'dm_search' && 'Nova conversa'}
                  {view === 'group_search' && 'Buscar grupos'}
                  {view === 'group_create' && 'Criar grupo'}
                </span>
                <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X size={17} className="text-white/60" /></button>
              </div>
            )}

            {view === 'dm_convo' && activeConvo && (
              <div className="flex items-center gap-2 px-3 pt-3 pb-3 border-b border-white/8 flex-shrink-0">
                <button onClick={() => { uns.current.msgs?.(); setView('list'); setTab('dms'); }} className="p-1.5 rounded-full hover:bg-white/10"><ArrowLeft size={18} className="text-white/60" /></button>
                <Avatar src={activeConvo.otherPhoto} name={activeConvo.otherName} size={32} />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate leading-none">{activeConvo.otherName}</p>
                  <div className="flex items-center gap-1 mt-0.5"><Lock size={9} className="text-green-400" /><span className="text-green-400 text-[9px]">criptografado</span></div>
                </div>
                <button onClick={() => startCall(activeConvo.otherUid, activeConvo.otherName)} className="p-1.5 rounded-full hover:bg-white/10"><Video size={17} className="text-white/60" /></button>
                <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X size={17} className="text-white/60" /></button>
              </div>
            )}

            {(view === 'group_convo' || view === 'group_detail') && activeGroup && (
              <div className="flex items-center gap-2 px-3 pt-3 pb-3 border-b border-white/8 flex-shrink-0">
                <button onClick={() => { if (view === 'group_detail') { setView('group_convo'); } else { uns.current.grpMsgs?.(); setView('list'); setTab('groups'); } }} className="p-1.5 rounded-full hover:bg-white/10"><ArrowLeft size={18} className="text-white/60" /></button>
                <div className="w-8 h-8 rounded-full bg-blue-600/30 flex items-center justify-center flex-shrink-0"><Hash size={16} className="text-blue-400" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate leading-none">{activeGroup.name}</p>
                  <p className="text-white/40 text-[9px] mt-0.5">{activeGroup.members.length} membros · {activeGroup.isPublic ? 'Público' : 'Privado'}</p>
                </div>
                {view === 'group_convo' && <button onClick={() => { setGroupMembers([]); setAddMemberQuery(''); setAddMemberResults([]); setView('group_detail'); }} className="p-1.5 rounded-full hover:bg-white/10"><Users size={17} className="text-white/60" /></button>}
                <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X size={17} className="text-white/60" /></button>
              </div>
            )}

            {/* ── Content area ─── */}
            <div className="flex-1 flex flex-col overflow-hidden">

              {/* LIST: DMs */}
              {view === 'list' && tab === 'dms' && (
                <div className="flex-1 overflow-y-auto">
                  {/* Incoming phone link requests */}
                  {incomingPhoneRequests.map(req => (
                    <div key={req.id} className="border-b border-white/5 px-4 py-3 bg-yellow-500/5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white/10 border border-white/10 overflow-hidden flex items-center justify-center flex-shrink-0">
                          {req.requestingPhoto
                            ? <img src={req.requestingPhoto} alt={req.requestingUsername} className="w-full h-full object-cover" />
                            : <Phone size={16} className="text-yellow-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">@{req.requestingUsername}</p>
                          <p className="text-yellow-400/70 text-xs mt-0.5">Quer usar seu número de telefone</p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => denyPhoneRequest(req)} className="flex-1 h-9 rounded-xl bg-white/8 hover:bg-white/12 text-white/70 text-xs font-medium transition-colors flex items-center justify-center gap-1.5">
                          <ShieldX size={13} /> Negar
                        </button>
                        <button onClick={() => approvePhoneRequest(req)} className="flex-1 h-9 rounded-xl bg-green-600/80 hover:bg-green-500 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5">
                          <ShieldCheck size={13} /> Permitir
                        </button>
                      </div>
                    </div>
                  ))}
                  {convos.length === 0 && incomingPhoneRequests.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-8">
                      <MessageSquare size={36} className="text-white/15 mb-3" />
                      <p className="text-white/30 text-sm">Nenhuma conversa ainda</p>
                      <button onClick={() => { setDmSearch(''); setView('dm_search'); }} className="mt-3 px-4 py-2 rounded-full bg-blue-600/20 text-blue-400 text-xs">Iniciar conversa</button>
                    </div>
                  )}
                  {convos.map(c => (
                    <button key={c.id} onClick={() => openDM(c.otherUid, c.otherName, c.otherPhoto)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 border-b border-white/5 transition-colors">
                      <Avatar src={c.otherPhoto} name={c.otherName} size={40} />
                      <div className="flex-1 text-left min-w-0">
                        <div className="flex items-center justify-between"><span className="text-white font-medium text-sm truncate">{c.otherName}</span><span className="text-white/30 text-[10px] ml-2 flex-shrink-0">{fmt(c.lastMessageAt)}</span></div>
                        <div className="flex items-center gap-1 mt-0.5"><span className="text-white/40 text-xs truncate flex-1">{c.lastMessage || 'Sem mensagens'}</span>{c.unread > 0 && <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center flex-shrink-0">{c.unread > 9 ? '9+' : c.unread}</span>}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* LIST: Groups */}
              {view === 'list' && tab === 'groups' && (
                <div className="flex-1 overflow-y-auto">
                  <div className="px-4 pt-3 pb-2 flex gap-2">
                    <button onClick={() => { setGroupSearch(''); setView('group_search'); }} className="flex-1 flex items-center gap-2 bg-white/8 rounded-xl px-3 py-2 text-white/40 text-xs hover:bg-white/12 transition-colors"><Search size={13} /> Buscar grupos públicos</button>
                    <button onClick={() => { setNewGroupName(''); setNewGroupDesc(''); setNewGroupPublic(true); setView('group_create'); }} className="px-3 py-2 rounded-xl bg-blue-600/20 text-blue-400 text-xs flex items-center gap-1"><Plus size={13} /> Criar</button>
                  </div>
                  {groups.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-8">
                      <Users size={36} className="text-white/15 mb-3" />
                      <p className="text-white/30 text-sm">Você não está em nenhum grupo</p>
                    </div>
                  )}
                  {groups.map(g => (
                    <button key={g.id} onClick={() => openGroup(g)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 border-b border-white/5 transition-colors">
                      <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0"><Hash size={18} className="text-blue-400" /></div>
                      <div className="flex-1 text-left min-w-0">
                        <div className="flex items-center gap-1.5"><span className="text-white font-medium text-sm truncate">{g.name}</span>{g.isPublic ? <Globe2 size={10} className="text-white/30 flex-shrink-0" /> : <EyeOff size={10} className="text-white/30 flex-shrink-0" />}</div>
                        <div className="flex items-center justify-between mt-0.5"><span className="text-white/40 text-xs truncate flex-1">{g.lastMessage || `${g.members.length} membros`}</span><span className="text-white/30 text-[10px] ml-2 flex-shrink-0">{fmt(g.lastMessageAt)}</span></div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* DM SEARCH */}
              {view === 'dm_search' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="px-4 pt-3 pb-2">
                    <div className="flex items-center gap-2 bg-white/8 rounded-xl px-3 py-2">
                      <Search size={14} className="text-white/40" />
                      <input autoFocus value={dmSearch} onChange={e => setDmSearch(e.target.value)} placeholder="Buscar usuário..." className="flex-1 bg-transparent text-white text-sm outline-none placeholder-white/30" />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {dmSearching && <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin" /></div>}
                    {dmSearchResults.map(u => (
                      <button key={u.uid} onClick={() => openDM(u.uid, u.username, u.profilePhotoUrl)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 border-b border-white/5 transition-colors">
                        <Avatar src={u.profilePhotoUrl} name={u.username} size={38} />
                        <span className="text-white text-sm font-medium">{u.username}</span>
                      </button>
                    ))}
                    {!dmSearching && dmSearch && !dmSearchResults.length && <p className="text-center text-white/30 text-sm py-8">Nenhum usuário encontrado</p>}
                  </div>
                </div>
              )}

              {/* DM CONVERSATION */}
              {view === 'dm_convo' && activeConvo && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
                    {messages.length === 0 && <div className="flex flex-col items-center justify-center h-full py-8"><Lock size={24} className="text-white/15 mb-2" /><p className="text-white/25 text-xs text-center">Mensagens protegidas com criptografia<br/>de ponta a ponta</p></div>}
                    {messages.map((msg, idx) => {
                      const mine = msg.senderId === currentUser.uid;
                      const prev = messages[idx - 1];
                      const showDate = !prev || new Date(msg.createdAt).toDateString() !== new Date(prev.createdAt).toDateString();
                      return (
                        <React.Fragment key={msg.id}>
                          {showDate && <div className="flex justify-center my-2"><span className="bg-white/8 text-white/40 text-[9px] px-3 py-1 rounded-full">{new Date(msg.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</span></div>}
                          <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[76%] rounded-2xl px-3 py-2 ${mine ? 'bg-blue-600 rounded-br-sm' : 'bg-[#2a2a2a] rounded-bl-sm'}`}>
                              {msg.type === 'image' && msg.mediaUrl && <img src={msg.mediaUrl} alt="" className="rounded-xl max-w-full max-h-48 object-cover mb-1 cursor-pointer" onClick={() => window.open(msg.mediaUrl, '_blank')} />}
                              {msg.type === 'video' && msg.mediaUrl && <video src={msg.mediaUrl} controls className="rounded-xl max-w-full max-h-48 mb-1" />}
                              {msg.content && <p className="text-white text-sm leading-relaxed break-words">{msg.content}</p>}
                              <div className={`flex items-center gap-1 mt-0.5 ${mine ? 'justify-end' : 'justify-start'}`}>
                                <span className="text-[9px] text-white/30">{fmt(msg.createdAt)}</span>
                                {mine && (msg.read ? <CheckCheck size={11} className="text-blue-300" /> : <Check size={11} className="text-white/30" />)}
                              </div>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}
                    <div ref={msgsEnd} />
                  </div>
                  <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadMedia(f, 'dm'); e.target.value = ''; }} />
                  <InputBar value={dmInput} onChange={setDmInput} onSend={sendDM} onFileClick={() => fileRef.current?.click()} sending={dmSending} uploading={uploadingMedia} mode="dm" />
                </div>
              )}

              {/* GROUP SEARCH */}
              {view === 'group_search' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="px-4 pt-3 pb-2 space-y-2">
                    <div className="flex items-center gap-2 bg-white/8 rounded-xl px-3 py-2">
                      <Search size={14} className="text-white/40" />
                      <input autoFocus value={groupSearch} onChange={e => setGroupSearch(e.target.value)} placeholder="Buscar grupos públicos..." className="flex-1 bg-transparent text-white text-sm outline-none placeholder-white/30" />
                    </div>
                    <div className="flex gap-2">
                      <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="Código de convite..." className="flex-1 h-9 bg-white/8 rounded-xl px-3 text-white text-xs outline-none placeholder-white/30 border border-white/8 focus:border-blue-500/40" maxLength={8} />
                      <button onClick={joinByCode} disabled={!joinCode.trim()} className="px-3 h-9 rounded-xl bg-blue-600/20 text-blue-400 text-xs disabled:opacity-40">Entrar</button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {groupSearching && <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin" /></div>}
                    {groupSearchResults.map(g => (
                      <button key={g.id} onClick={() => joinGroup(g)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 border-b border-white/5 transition-colors">
                        <div className="w-9 h-9 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0"><Hash size={16} className="text-blue-400" /></div>
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-white text-sm font-medium truncate">{g.name}</p>
                          <p className="text-white/40 text-xs truncate">{g.description || `${g.members.length} membros`}</p>
                        </div>
                        <span className="text-blue-400 text-xs">Entrar</span>
                      </button>
                    ))}
                    {!groupSearching && groupSearch && !groupSearchResults.length && <p className="text-center text-white/30 text-sm py-8">Nenhum grupo encontrado</p>}
                  </div>
                </div>
              )}

              {/* GROUP CREATE */}
              {view === 'group_create' && (
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                  <div className="space-y-1">
                    <label className="text-white/40 text-xs uppercase tracking-wider">Nome do grupo *</label>
                    <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Ex: Amigos da faculdade" className="w-full h-11 bg-white/8 border border-white/10 rounded-xl px-4 text-white text-sm outline-none focus:border-blue-500/50 placeholder-white/20" maxLength={50} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-white/40 text-xs uppercase tracking-wider">Descrição</label>
                    <textarea value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)} placeholder="Sobre o grupo..." rows={2} className="w-full bg-white/8 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500/50 placeholder-white/20 resize-none" maxLength={200} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-white/40 text-xs uppercase tracking-wider">Visibilidade</label>
                    {[{ val: true, icon: Globe2, label: 'Público', desc: 'Qualquer pessoa pode encontrar e entrar' }, { val: false, icon: EyeOff, label: 'Privado', desc: 'Somente por link de convite' }].map(opt => (
                      <button key={String(opt.val)} onClick={() => setNewGroupPublic(opt.val)} className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${newGroupPublic === opt.val ? 'border-blue-500/50 bg-blue-600/10' : 'border-white/8 bg-white/5 hover:bg-white/8'}`}>
                        <opt.icon size={18} className={newGroupPublic === opt.val ? 'text-blue-400' : 'text-white/40'} />
                        <div><p className={`text-sm font-medium ${newGroupPublic === opt.val ? 'text-blue-300' : 'text-white'}`}>{opt.label}</p><p className="text-white/40 text-xs">{opt.desc}</p></div>
                      </button>
                    ))}
                  </div>
                  <button onClick={createGroup} disabled={!newGroupName.trim() || groupCreating} className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors">
                    {groupCreating ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Plus size={16} /> Criar grupo</>}
                  </button>
                </div>
              )}

              {/* GROUP CONVERSATION */}
              {view === 'group_convo' && activeGroup && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
                    {groupMessages.length === 0 && <div className="flex flex-col items-center justify-center h-full py-8"><Hash size={24} className="text-white/15 mb-2" /><p className="text-white/25 text-xs text-center">Nenhuma mensagem ainda.<br/>Seja o primeiro a escrever!</p></div>}
                    {groupMessages.map((msg, idx) => {
                      const mine = msg.senderId === currentUser.uid;
                      const prev = groupMessages[idx - 1];
                      const showSender = !mine && (!prev || prev.senderId !== msg.senderId);
                      const showDate = !prev || new Date(msg.createdAt).toDateString() !== new Date(prev.createdAt).toDateString();
                      return (
                        <React.Fragment key={msg.id}>
                          {showDate && <div className="flex justify-center my-2"><span className="bg-white/8 text-white/40 text-[9px] px-3 py-1 rounded-full">{new Date(msg.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</span></div>}
                          <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[76%] rounded-2xl px-3 py-2 ${mine ? 'bg-blue-600 rounded-br-sm' : 'bg-[#2a2a2a] rounded-bl-sm'}`}>
                              {showSender && <p className="text-[10px] text-blue-300/80 font-semibold mb-0.5">{msg.senderName}</p>}
                              {msg.type === 'image' && msg.mediaUrl && <img src={msg.mediaUrl} alt="" className="rounded-xl max-w-full max-h-48 object-cover mb-1 cursor-pointer" onClick={() => window.open(msg.mediaUrl, '_blank')} />}
                              {msg.type === 'video' && msg.mediaUrl && <video src={msg.mediaUrl} controls className="rounded-xl max-w-full max-h-48 mb-1" />}
                              {msg.content && <p className="text-white text-sm leading-relaxed break-words">{msg.content}</p>}
                              <span className="text-[9px] text-white/30 block text-right mt-0.5">{fmt(msg.createdAt)}</span>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}
                    <div ref={grpMsgsEnd} />
                  </div>
                  <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadMedia(f, 'group'); e.target.value = ''; }} />
                  <InputBar value={groupInput} onChange={setGroupInput} onSend={sendGroup} onFileClick={() => fileRef.current?.click()} sending={groupSending} uploading={uploadingMedia} mode="group" />
                </div>
              )}

              {/* GROUP DETAIL */}
              {view === 'group_detail' && activeGroup && (
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                  {/* Invite link */}
                  <div className="bg-white/5 rounded-xl p-4 border border-white/8">
                    <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Link de convite</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-blue-300 text-xs bg-blue-600/10 px-3 py-2 rounded-lg font-mono tracking-widest">{activeGroup.inviteCode}</code>
                      <button onClick={() => { navigator.clipboard.writeText(activeGroup.inviteCode); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className={`px-3 py-2 rounded-lg text-xs transition-colors ${copied ? 'bg-green-600/20 text-green-400' : 'bg-white/8 text-white/60 hover:bg-white/12'}`}>
                        {copied ? '✓ Copiado' : <><Copy size={12} className="inline mr-1" />Copiar</>}
                      </button>
                    </div>
                    <p className="text-white/25 text-[10px] mt-2">Compartilhe este código para convidar pessoas</p>
                  </div>

                  {/* Add member (admin only) */}
                  {activeGroup.adminUid === currentUser.uid && (
                    <div className="space-y-2">
                      <p className="text-white/40 text-xs uppercase tracking-wider">Adicionar membro</p>
                      <div className="flex items-center gap-2 bg-white/8 rounded-xl px-3 py-2">
                        <Search size={13} className="text-white/40" />
                        <input value={addMemberQuery} onChange={e => setAddMemberQuery(e.target.value)} placeholder="Buscar usuário..." className="flex-1 bg-transparent text-white text-sm outline-none placeholder-white/30" />
                      </div>
                      {addMemberResults.map(u => (
                        <button key={u.uid} onClick={() => addMember(u.uid)} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/8 transition-colors">
                          <Avatar src={u.profilePhotoUrl} name={u.username} size={30} />
                          <span className="flex-1 text-white text-sm text-left">{u.username}</span>
                          <UserPlus size={14} className="text-blue-400" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Members */}
                  <div className="space-y-1">
                    <p className="text-white/40 text-xs uppercase tracking-wider">{activeGroup.members.length} membros</p>
                    {groupMembers.map(m => (
                      <div key={m.uid} className="flex items-center gap-3 px-3 py-2 rounded-xl">
                        <Avatar src={m.profilePhotoUrl} name={m.username} size={32} />
                        <span className="flex-1 text-white text-sm">{m.username}</span>
                        {m.uid === activeGroup.adminUid && <span className="flex items-center gap-1 text-yellow-400 text-[10px]"><Crown size={10} /> Admin</span>}
                      </div>
                    ))}
                  </div>

                  {/* Leave group */}
                  {activeGroup.adminUid !== currentUser.uid && (
                    <button onClick={() => leaveGroup(activeGroup)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-500/20 text-red-400 text-sm hover:bg-red-500/10 transition-colors">
                      <LogOut size={15} /> Sair do grupo
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </motion.div>
    </>
  );
};

export default ChatModal;
