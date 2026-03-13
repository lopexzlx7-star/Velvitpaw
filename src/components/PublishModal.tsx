import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Image as ImageIcon, Check, Loader2, AlertTriangle, 
  ChevronRight, ChevronLeft, Lock, Globe, Users, MessageSquare, 
  Repeat, Tag, Info, Maximize2, Square, Smartphone, Plus
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { db, auth } from '../firebase';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';

interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type AspectRatio = 'portrait' | 'landscape' | 'square' | 'original';

interface Draft {
  title: string;
  description: string;
  tags: string[];
  privacy: 'public' | 'followers' | 'private';
  allowComments: boolean;
  allowRepins: boolean;
  boardId: string;
  aspectRatio: AspectRatio;
  imageUrl: string | null;
  file: File | null;
}

const PublishModal: React.FC<PublishModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [step, setStep] = useState<'upload' | 'details' | 'confirm'>('upload');
  const [draft, setDraft] = useState<Draft>({
    title: '',
    description: '',
    tags: [],
    privacy: 'public',
    allowComments: true,
    allowRepins: true,
    boardId: '',
    aspectRatio: 'original',
    imageUrl: null,
    file: null
  });

  const [boards, setBoards] = useState<{id: string, name: string}[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [isCounting, setIsCounting] = useState(false);
  const [shake, setShake] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToGuidelines, setAgreedToGuidelines] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiRef = useRef<GoogleGenAI | null>(null);

  useEffect(() => {
    if (isOpen && auth.currentUser) {
      fetchBoards();
    }
  }, [isOpen]);

  const fetchBoards = async () => {
    if (!auth.currentUser) return;
    const q = query(collection(db, 'boards'), where('uid', '==', auth.currentUser.uid));
    const snapshot = await getDocs(q);
    setBoards(snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const [newBoardName, setNewBoardName] = useState('');
  const [showNewBoardInput, setShowNewBoardInput] = useState(false);

  const handleCreateBoard = async () => {
    if (!newBoardName.trim() || !auth.currentUser) return;
    try {
      const docRef = await addDoc(collection(db, 'boards'), {
        name: newBoardName,
        uid: auth.currentUser.uid,
        createdAt: new Date().toISOString()
      });
      setBoards(prev => [...prev, { id: docRef.id, name: newBoardName }]);
      setDraft(prev => ({ ...prev, boardId: docRef.id }));
      setNewBoardName('');
      setShowNewBoardInput(false);
    } catch (err) {
      console.error("Error creating board:", err);
    }
  };

  const processFile = async (file: File) => {
    setIsProcessing(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const imageUrl = event.target?.result as string;
        
        // Compression & Metadata Extraction
        const img = new Image();
        img.src = imageUrl;
        await img.decode();

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // HD Version (max 1920)
        const maxDim = 1920;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = (height / width) * maxDim;
            width = maxDim;
          } else {
            width = (width / height) * maxDim;
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);
        const compressedUrl = canvas.toDataURL('image/webp', 0.8);

        setDraft(prev => ({
          ...prev,
          file,
          imageUrl: compressedUrl,
          title: file.name.split('.')[0]
        }));
        
        setStep('details');
        analyzeImage(compressedUrl);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError('Erro ao processar imagem.');
    } finally {
      setIsProcessing(false);
    }
  };

  const analyzeImage = async (base64: string) => {
    setIsAnalyzing(true);
    try {
      if (!aiRef.current) {
        aiRef.current = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      }

      const model = aiRef.current.models.get('gemini-3-flash-preview');
      const base64Data = base64.split(',')[1];

      const prompt = `Analyze this image for a social media platform. 
      1. Suggest 5-8 relevant aesthetic tags (e.g., #cyberpunk, #minimalist).
      2. Check for explicit/NSFW content.
      Return JSON: { "tags": ["tag1", "tag2"], "isNsfw": boolean }`;

      const result = await model.generateContent({
        contents: [
          { role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: base64Data } }] }
        ],
        config: { responseMimeType: "application/json" }
      });

      const analysis = JSON.parse(result.text);
      setDraft(prev => ({
        ...prev,
        tags: analysis.tags || [],
        isNsfw: analysis.isNsfw || false
      }));
    } catch (err) {
      console.error("Analysis error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleConfirmClick = () => {
    if (!agreedToTerms || !agreedToGuidelines) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }

    setIsCounting(true);
    setCountdown(3);
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isCounting && countdown > 0) {
      timer = setTimeout(() => setCountdown(prev => prev - 1), 1000);
    } else if (isCounting && countdown === 0) {
      submitPost();
    }
    return () => clearTimeout(timer);
  }, [isCounting, countdown]);

  const submitPost = async () => {
    if (!auth.currentUser || !draft.imageUrl) return;
    setIsSubmitting(true);

    try {
      // In a real app, we would upload to Storage and get a URL.
      // Here we'll use the base64 for the demo or a placeholder.
      
      const postData = {
        title: draft.title,
        description: draft.description,
        url: draft.imageUrl, // Real app: storageUrl
        type: 'image',
        height: draft.aspectRatio === 'portrait' ? 600 : draft.aspectRatio === 'landscape' ? 300 : 450,
        authorUid: auth.currentUser.uid,
        authorName: localStorage.getItem('velvit_username') || 'User',
        createdAt: new Date().toISOString(),
        tags: draft.tags,
        privacy: draft.privacy,
        allowComments: draft.allowComments,
        allowRepins: draft.allowRepins,
        boardId: draft.boardId,
        likesCount: 0,
        savesCount: 0,
        viewsCount: 0
      };

      await addDoc(collection(db, 'posts'), postData);
      onSuccess();
      onClose();
    } catch (err) {
      setError('Erro ao publicar post.');
      setIsCounting(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRatioClass = () => {
    switch (draft.aspectRatio) {
      case 'portrait': return 'aspect-[4/5]';
      case 'landscape': return 'aspect-[16/9]';
      case 'square': return 'aspect-square';
      default: return 'aspect-auto';
    }
  };

  const getDimensions = () => {
    switch (draft.aspectRatio) {
      case 'portrait': return '1080 x 1350';
      case 'landscape': return '1920 x 1080';
      case 'square': return '1080 x 1080';
      default: return 'Original';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-black/90 backdrop-blur-xl">
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="glass-panel w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col rounded-[2rem] border border-white/10 shadow-2xl"
      >
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center">
              <Plus className="text-white" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tighter uppercase text-white">Publicar Obra</h2>
              <p className="text-[10px] uppercase tracking-widest text-white/30">Passo {step === 'upload' ? '1' : step === 'details' ? '2' : '3'} de 3</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white/5 rounded-2xl transition-colors text-white/30 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <AnimatePresence mode="wait">
            {step === 'upload' && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="h-full flex flex-col items-center justify-center text-center py-12"
              >
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full max-w-md aspect-square rounded-[3rem] border-2 border-dashed border-white/10 hover:border-white/30 hover:bg-white/5 transition-all cursor-pointer flex flex-col items-center justify-center gap-6 group"
                >
                  <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <ImageIcon size={40} className="text-white/20 group-hover:text-white/50 transition-colors" />
                  </div>
                  <div>
                    <p className="text-white font-bold uppercase tracking-widest text-xs">Arraste ou clique para upload</p>
                    <p className="text-white/30 text-[10px] mt-2 uppercase tracking-widest">PNG, JPG, WEBP até 10MB</p>
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept="image/*" 
                    className="hidden" 
                  />
                </div>
              </motion.div>
            )}

            {step === 'details' && (
              <motion.div
                key="details"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-12"
              >
                {/* Preview Column */}
                <div className="flex flex-col gap-6">
                  <div className="relative group">
                    <div className={`rounded-[2rem] overflow-hidden bg-black/40 border border-white/10 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${getRatioClass()}`}>
                      <AnimatePresence mode="wait">
                        <motion.img
                          key={draft.aspectRatio}
                          initial={{ opacity: 0, scale: 1.1 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ duration: 0.3 }}
                          src={draft.imageUrl!}
                          className="w-full h-full object-cover"
                        />
                      </AnimatePresence>
                      
                      <div className="absolute top-4 left-4 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-full border border-white/10 flex items-center gap-2">
                        <motion.div
                          animate={{ rotate: draft.aspectRatio === 'landscape' ? 90 : 0 }}
                          className="text-white/70"
                        >
                          <Smartphone size={12} />
                        </motion.div>
                        <span className="text-[10px] font-bold text-white uppercase tracking-widest">{getDimensions()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    {[
                      { id: 'original', icon: <Maximize2 size={16} />, label: 'Original' },
                      { id: 'portrait', icon: <Smartphone size={16} />, label: '4:5' },
                      { id: 'landscape', icon: <Smartphone className="rotate-90" size={16} />, label: '16:9' },
                      { id: 'square', icon: <Square size={16} />, label: '1:1' }
                    ].map(ratio => (
                      <button
                        key={ratio.id}
                        onClick={() => setDraft(prev => ({ ...prev, aspectRatio: ratio.id as AspectRatio }))}
                        className={`flex-1 py-3 rounded-2xl border transition-all flex flex-col items-center gap-2 ${
                          draft.aspectRatio === ratio.id 
                            ? 'bg-white border-white text-black' 
                            : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                        }`}
                      >
                        {ratio.icon}
                        <span className="text-[10px] font-bold uppercase tracking-widest">{ratio.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Form Column */}
                <div className="flex flex-col gap-8">
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-white/30 font-bold">Título da Obra *</label>
                      <input 
                        type="text" 
                        value={draft.title}
                        onChange={(e) => setDraft(prev => ({ ...prev, title: e.target.value.slice(0, 100) }))}
                        placeholder="Dê um nome marcante..."
                        className="w-full h-14 px-6 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none focus:border-white/30 transition-all"
                      />
                      <div className="flex justify-end">
                        <span className="text-[10px] text-white/20">{draft.title.length}/100</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-white/30 font-bold">Descrição</label>
                      <textarea 
                        value={draft.description}
                        onChange={(e) => setDraft(prev => ({ ...prev, description: e.target.value.slice(0, 500) }))}
                        placeholder="Conte a história por trás desta imagem..."
                        className="w-full h-32 p-6 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none focus:border-white/30 transition-all resize-none"
                      />
                      <div className="flex justify-end">
                        <span className="text-[10px] text-white/20">{draft.description.length}/500</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-white/30 font-bold">Tags Sugeridas</label>
                      <div className="flex flex-wrap gap-2">
                        {isAnalyzing ? (
                          <div className="flex items-center gap-2 text-white/30 text-[10px] uppercase tracking-widest">
                            <Loader2 size={12} className="animate-spin" /> Analisando estética...
                          </div>
                        ) : (
                          draft.tags.map(tag => (
                            <span key={tag} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-[10px] text-white/70 flex items-center gap-2">
                              {tag}
                              <button onClick={() => setDraft(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }))}>
                                <X size={10} />
                              </button>
                            </span>
                          ))
                        )}
                        <button className="px-3 py-1.5 bg-white/5 border border-dashed border-white/20 rounded-full text-[10px] text-white/30 hover:text-white transition-colors">
                          + Adicionar Tag
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest text-white/30 font-bold">Privacidade</label>
                        <select 
                          value={draft.privacy}
                          onChange={(e) => setDraft(prev => ({ ...prev, privacy: e.target.value as any }))}
                          className="w-full h-14 px-6 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none appearance-none"
                        >
                          <option value="public">Público</option>
                          <option value="followers">Seguidores</option>
                          <option value="private">Privado</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest text-white/30 font-bold">Coleção</label>
                        <div className="relative">
                          {showNewBoardInput ? (
                            <div className="flex gap-2">
                              <input 
                                type="text" 
                                value={newBoardName}
                                onChange={(e) => setNewBoardName(e.target.value)}
                                placeholder="Nome da Coleção"
                                className="flex-1 h-14 px-4 bg-white/5 border border-white/10 rounded-2xl text-white text-xs focus:outline-none"
                              />
                              <button 
                                onClick={handleCreateBoard}
                                className="px-4 bg-white text-black rounded-2xl text-[10px] font-bold uppercase"
                              >
                                <Check size={16} />
                              </button>
                              <button 
                                onClick={() => setShowNewBoardInput(false)}
                                className="px-4 bg-white/5 border border-white/10 rounded-2xl text-white/50"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ) : (
                            <select 
                              value={draft.boardId}
                              onChange={(e) => {
                                if (e.target.value === 'new') {
                                  setShowNewBoardInput(true);
                                } else {
                                  setDraft(prev => ({ ...prev, boardId: e.target.value }));
                                }
                              }}
                              className="w-full h-14 px-6 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none appearance-none"
                            >
                              <option value="">Nenhuma</option>
                              {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                              <option value="new">+ Criar Nova</option>
                            </select>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-6 pt-4">
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${draft.allowComments ? 'bg-white border-white text-black' : 'border-white/20 group-hover:border-white/40'}`}>
                          <input type="checkbox" checked={draft.allowComments} onChange={(e) => setDraft(prev => ({ ...prev, allowComments: e.target.checked }))} className="hidden" />
                          {draft.allowComments && <Check size={12} />}
                        </div>
                        <span className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Comentários</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${draft.allowRepins ? 'bg-white border-white text-black' : 'border-white/20 group-hover:border-white/40'}`}>
                          <input type="checkbox" checked={draft.allowRepins} onChange={(e) => setDraft(prev => ({ ...prev, allowRepins: e.target.checked }))} className="hidden" />
                          {draft.allowRepins && <Check size={12} />}
                        </div>
                        <span className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Repins</span>
                      </label>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 'confirm' && (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="h-full flex flex-col items-center justify-center max-w-lg mx-auto text-center"
              >
                <div className="w-20 h-20 rounded-[2rem] bg-white/5 flex items-center justify-center mb-8">
                  <Info size={40} className="text-white/50" />
                </div>
                <h3 className="text-2xl font-black tracking-tighter uppercase text-white mb-4">Quase lá!</h3>
                <p className="text-white/50 text-sm mb-12 leading-relaxed">
                  Antes de publicar sua obra no VELVIT, confirme que você possui os direitos autorais e que o conteúdo respeita nossas diretrizes estéticas e comunitárias.
                </p>

                <div className="w-full space-y-4 mb-12">
                  <label className="flex items-start gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-all text-left">
                    <div className={`mt-1 w-5 h-5 rounded-lg border flex items-center justify-center transition-all shrink-0 ${agreedToTerms ? 'bg-white border-white text-black' : 'border-white/20'}`}>
                      <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="hidden" />
                      {agreedToTerms && <Check size={12} />}
                    </div>
                    <span className="text-[10px] uppercase tracking-widest text-white/70 leading-normal font-bold">Confirmo que sou o autor original ou possuo direitos de uso comercial desta obra.</span>
                  </label>
                  <label className="flex items-start gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-all text-left">
                    <div className={`mt-1 w-5 h-5 rounded-lg border flex items-center justify-center transition-all shrink-0 ${agreedToGuidelines ? 'bg-white border-white text-black' : 'border-white/20'}`}>
                      <input type="checkbox" checked={agreedToGuidelines} onChange={(e) => setAgreedToGuidelines(e.target.checked)} className="hidden" />
                      {agreedToGuidelines && <Check size={12} />}
                    </div>
                    <span className="text-[10px] uppercase tracking-widest text-white/70 leading-normal font-bold">Concordo com as diretrizes de curadoria do VELVIT contra spam e conteúdo de baixa qualidade.</span>
                  </label>
                </div>

                <div className="flex gap-4 w-full">
                  <button 
                    onClick={() => setStep('details')}
                    className="flex-1 py-5 bg-white/5 hover:bg-white/10 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all"
                  >
                    Voltar e Editar
                  </button>
                  <motion.button
                    animate={shake ? { x: [-10, 10, -10, 10, 0] } : {}}
                    onClick={handleConfirmClick}
                    disabled={isCounting || isSubmitting}
                    className={`flex-1 py-5 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all relative overflow-hidden ${
                      agreedToTerms && agreedToGuidelines 
                        ? 'bg-white text-black' 
                        : 'bg-white/10 text-white/30 cursor-not-allowed'
                    }`}
                  >
                    {isCounting ? (
                      <span className="relative z-10">Publicando em {countdown}s...</span>
                    ) : isSubmitting ? (
                      <Loader2 className="animate-spin mx-auto" />
                    ) : (
                      'Confirmar Publicação'
                    )}
                    {isCounting && (
                      <motion.div 
                        initial={{ width: '0%' }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 3, ease: 'linear' }}
                        className="absolute inset-0 bg-black/10"
                      />
                    )}
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 bg-black/20 flex items-center justify-between">
          <button 
            onClick={() => step === 'details' ? setStep('upload') : step === 'confirm' ? setStep('details') : onClose()}
            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/30 hover:text-white transition-colors"
          >
            <ChevronLeft size={14} /> Cancelar
          </button>
          
          {step === 'details' && (
            <button 
              onClick={() => setStep('confirm')}
              disabled={!draft.title}
              className="px-8 py-4 bg-white text-black rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-white/90 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
            >
              Próximo <ChevronRight size={14} />
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default PublishModal;
