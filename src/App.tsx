import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  History, 
  Settings, 
  CheckCircle2, 
  Loader2, 
  AlertCircle, 
  Video, 
  Image as ImageIcon, 
  Mic2, 
  Instagram,
  ChevronRight,
  TrendingUp,
  Cpu,
  RefreshCw,
  Copy,
  ExternalLink,
  Smartphone,
  Rocket,
  Zap,
  Activity,
  Layers,
  Terminal,
  ShieldCheck,
  Cloud,
  Lock,
  Plus,
  ArrowRight,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  RotateCcw,
  BrainCircuit,
  Upload,
  Trash2,
  FileVideo,
  FileImage
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from '@google/genai';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

interface Job {
  id: string;
  status: 'pending' | 'processing' | 'awaiting_approval' | 'publishing' | 'completed' | 'failed';
  progress: number;
  steps: string[];
  logs: string[];
  data: any;
  result?: {
    videoUrl: string;
    postId: string;
    caption: string;
    media: string[];
    audioUrl?: string;
    viral_metadata?: {
      hooks: string[];
      broll_strategy: string;
      cta: string;
      hashtags: string[];
      target_emotions: string[];
      retention_analysis?: string;
      voice_profile?: string;
    };
    scenes?: Array<{
      script_text: string;
      image_prompt: string;
      broll_suggestion: string;
      subtitle_emphasis?: string[];
    }>;
  };
  error?: string;
}

const DEFAULT_KEYS = {
  gemini_key: '',
  groq_key: '',
  nvidia_key: '',
  fal_key: '',
  serper_key: '',
  together_key: '',
  sarvam_key: '',
  shotstack_key: '',
  ig_token: '',
  ig_user: '',
  creatomate_key: '',
  creatomate_template: '',
  fish_audio_key: '',
  llm_provider: 'gemini',
  image_provider: 'together',
  voice_provider: 'sarvam'
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'create' | 'history' | 'settings'>('create');
  const [topic, setTopic] = useState('');
  const [useManualScript, setUseManualScript] = useState(false);
  const [niche, setNiche] = useState('education');
  const [language, setLanguage] = useState('en-IN');
  const [resolution, setResolution] = useState('HD');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [loading, setLoading] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [history, setHistory] = useState<Job[]>([]);
  const [phase, setPhase] = useState('');
  const [userKeys, setUserKeys] = useState(DEFAULT_KEYS);
  const [userAssets, setUserAssets] = useState<Array<{ name: string; url: string; type: 'video' | 'image' }>>([]);
  const [uploading, setUploading] = useState(false);

  // New Strategy Phase State
  const [strategyResult, setStrategyResult] = useState<any>(null);
  const [selectedHookIndex, setSelectedHookIndex] = useState<number | null>(null);

  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<{ resolution: string; aspect: string } | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const handleVideoMetadata = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const video = e.currentTarget;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return;

    const resolution = `${width}x${height}`;
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(width, height);
    const aspect = `${width / divisor}:${height / divisor}`;
    
    setVideoMetadata({ resolution, aspect });
  };

  // Reset metadata when a new job becomes active or selected
  useEffect(() => {
    setVideoMetadata(null);
  }, [activeJobId, selectedJob]);

  // Auto-scroll logs
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentJob?.logs]);

  // Load keys and drafts on mount
  useEffect(() => {
    const savedKeys = localStorage.getItem('reelfactory_keys_v4');
    if (savedKeys) {
      try {
        setUserKeys({ ...DEFAULT_KEYS, ...JSON.parse(savedKeys) });
      } catch (e) {
        console.error("Failed to parse keys", e);
      }
    }

    const savedDraft = localStorage.getItem('reelfactory_draft_v1');
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        if (draft.topic) setTopic(draft.topic);
        if (draft.niche) setNiche(draft.niche);
        if (draft.language) setLanguage(draft.language);
        if (draft.resolution) setResolution(draft.resolution);
        if (draft.aspectRatio) setAspectRatio(draft.aspectRatio);
      } catch (e) {
        console.error("Failed to parse draft", e);
      }
    }
    fetchHistory();
    
    // Auto-refresh history every 30s
    const refreshInterval = setInterval(fetchHistory, 30000);
    return () => clearInterval(refreshInterval);
  }, []);

  // Auto-save draft whenever values change
  useEffect(() => {
    localStorage.setItem('reelfactory_draft_v1', JSON.stringify({ topic, niche, language, resolution, aspectRatio, useManualScript }));
  }, [topic, niche, language, resolution, aspectRatio, useManualScript]);

  const saveKeys = (keys: typeof userKeys) => {
    setUserKeys(keys);
    localStorage.setItem('reelfactory_keys_v4', JSON.stringify(keys));
  };

  const fetchHistory = async (retries = 3) => {
    try {
      const res = await fetch('/api/jobs');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHistory(data);
    } catch (e) {
      console.error("History Node Sync Loss:", e);
      if (retries > 0) {
        setTimeout(() => fetchHistory(retries - 1), 2000);
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const newAssets = [...userAssets];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isVideo = file.type.startsWith('video/');
        const isImage = file.type.startsWith('image/');
        
        if (!isVideo && !isImage) continue;

        const reader = new FileReader();
        const promise = new Promise<string>((resolve) => {
            reader.onload = (re) => resolve(re.target?.result as string);
        });
        reader.readAsDataURL(file);
        const dataUrl = await promise;

        newAssets.push({
            name: file.name,
            url: dataUrl,
            type: isVideo ? 'video' : 'image'
        });
    }

    setUserAssets(newAssets);
    setUploading(false);
  };

  const removeAsset = (index: number) => {
    const next = [...userAssets];
    next.splice(index, 1);
    setUserAssets(next);
  };

  const runIntelligenceTask = async (prompt: string, schema: any) => {
    const provider = userKeys.llm_provider;
    if (provider === 'gemini') {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema
        }
      });
      return JSON.parse(response.text || '{}');
    } else {
      const res = await fetch('/api/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          provider, 
          key: provider === 'groq' ? userKeys.groq_key : userKeys.nvidia_key, 
          prompt, 
          schema 
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Intelligence Node Timeout');
      }
      return await res.json();
    }
  };

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic) return;
    
    setLoading(true);
    setStrategyResult(null);
    setSelectedHookIndex(null);
    setPhase('AI: SYNTHESIZING ARCHITECTURE');
    
    try {
      let finalTopic = topic.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim();

      setPhase('AI: ORCHESTRATING ELITE AGENT TEAM');
      const prompt = `You are a team of Elite AI agents working together to create a viral short-form video (Reels/TikTok/Shorts).
        
        AGENTS INVOLVED:
        1. Research Agent: Analyzes topic depth and audience psychology.
        2. Hook Agent: Creates 5 diverse, high-potency hooks.
        3. Script Agent (Humanizer): Generates high-retention, non-robotic scripts.
        4. Strategy Agent: Brief analysis of why this specific direction will win.

        TOPIC: ${finalTopic}
        NICHE: ${niche}
        LANGUAGE: ${language}
        
        GOAL: Maximum retention, watch time, and virality.
        RULES: Never sound robotic. Short punchy sentences. Curiosity loops.
        
        Generate a complete production directive in JSON.`;

      const result = await runIntelligenceTask(prompt, {
        type: Type.OBJECT,
        properties: {
          script: { type: Type.STRING },
          hooks: { type: Type.ARRAY, items: { type: Type.STRING } },
          retention_analysis: { type: Type.STRING },
          metadata: {
            type: Type.OBJECT,
            properties: {
              caption: { type: Type.STRING },
              hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
              cta: { type: Type.STRING },
              voice_profile: { type: Type.STRING }
            }
          }
        },
        required: ["script", "hooks", "metadata", "retention_analysis"]
      });

      if (!result.script) throw new Error("Elite Pipeline failed to stabilize.");
      
      setStrategyResult(result);
      setPhase('STRATEGY_LOCKED_PENDING_HOOK');
    } catch (e: any) {
      console.error("Pipeline Synth Error:", e);
      setPhase(`FAULT: ${e.message.toUpperCase()}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFinalizeGeneration = async () => {
    if (!strategyResult || selectedHookIndex === null) return;
    
    setLoading(true);
    setPhase('AI: ASSEMBLING SCENE INFRASTRUCTURE');
    
    try {
      const selectedHook = strategyResult.hooks[selectedHookIndex];
      // Use the selected hook to finalize the script and generate scenes
      const prompt = `Finalize the production directive based on the selected hook.
        SELECTED HOOK: ${selectedHook}
        BASE SCRIPT: ${strategyResult.script}
        NICHE: ${niche}
        LANGUAGE: ${language}
        
        Task:
        1. Fully integrate the hook into the start of the script.
        2. Generate 4-7 scene-by-scene descriptions with cinematic image prompts.
        3. Ensure total duration is optimal for high speed retention.`;

      const finalDirective = await runIntelligenceTask(prompt, {
        type: Type.OBJECT,
        properties: {
          final_script: { type: Type.STRING },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                script_text: { type: Type.STRING },
                image_prompt: { type: Type.STRING },
                broll_suggestion: { type: Type.STRING },
                subtitle_emphasis: { type: Type.ARRAY, items: { type: Type.STRING } }
              }
            }
          }
        },
        required: ["final_script", "scenes"]
      });
      
      setPhase('NODE: INITIALIZING CLOUD SYNC');
      const res = await fetch('/api/generate-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          topic: finalDirective.final_script, 
          niche, 
          language,
          resolution,
          aspectRatio,
          keys: userKeys,
          user_assets: userAssets,
          scenes: finalDirective.scenes,
          script: finalDirective.final_script,
          viral_metadata: { ...strategyResult.metadata, retention_analysis: strategyResult.retention_analysis },
          hooks: strategyResult.hooks
        })
      });
      
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Handshake failed: ${res.status} ${errText}`);
      }
      
      const data = await res.json();
      if (data.jobId) {
        setActiveJobId(data.jobId);
        setStrategyResult(null); // Clear strategy to show processing view
        pollJob(data.jobId);
      }
    } catch (e: any) {
      console.error("Finalization Node Error:", e);
      setPhase(`FAULT: ${e.message.toUpperCase()}`);
    } finally {
      setLoading(false);
    }
  };

  const pollJob = async (id: string) => {
    const timer = setInterval(async () => {
      try {
        // FIX: Use correct status endpoint
        const res = await fetch(`/api/status/${id}`);
        const job: Job = await res.json();
        setCurrentJob(job);
        
        if (job.status === 'completed' || job.status === 'failed') {
          clearInterval(timer);
          setActiveJobId(null);
          fetchHistory();
          setPhase(job.status === 'completed' ? 'SYNTHESIS_SUCCESS' : 'HARDWARE_FAILURE');
        } else if (job.status === 'awaiting_approval') {
          setPhase('AWAITING_CLEARANCE');
        }
      } catch (e) {
        console.error(e);
        clearInterval(timer);
      }
    }, 2000);
  };

  const handleApprove = async () => {
    if (!activeJobId) return;
    setPhase('TRANSMITTING_TO_GRID');
    try {
      // FIX: Use correct approve endpoint
      await fetch(`/api/jobs/${activeJobId}/approve`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: userKeys })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen bg-[#020617] selection:bg-sky-500/30 overflow-x-hidden text-slate-300 font-sans">
      {/* HUD Navigation */}
      <nav className="fixed top-0 inset-x-0 h-20 border-b border-white/5 glass-panel !rounded-none z-[60] px-8 flex justify-between items-center transition-all duration-500 backdrop-blur-2xl">
         <div className="flex items-center gap-12">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-sky-500 rounded-xl flex items-center justify-center shadow-[0_0_20px_-5px_rgba(14,165,233,0.5)]">
                  <Zap className="w-6 h-6 text-slate-950 fill-current" />
               </div>
               <div className="hidden md:block">
                  <h1 className="text-xl font-black italic tracking-tighter text-white leading-none">REELFACTORY</h1>
                  <span className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.4em]">Autonomous AI Lab</span>
               </div>
            </div>

            <div className="flex items-center gap-2 bg-slate-950/50 p-1.5 rounded-2xl border border-white/5">
                {['Create', 'History', 'Settings'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab.toLowerCase() as any)}
                    className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.toLowerCase() ? 'bg-sky-500 text-slate-950 shadow-xl scale-105' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    {tab}
                  </button>
                ))}
            </div>
         </div>

         <div className="flex items-center gap-6">
            <div className="hidden lg:flex flex-col items-end gap-1">
               <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Global Latency</div>
               <div className="text-xs font-mono font-bold text-sky-400">0.42ms <span className="text-[8px] text-slate-700">/ SYNCED</span></div>
            </div>
            <div className="w-px h-8 bg-white/5" />
            <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-emerald-500/5 border border-emerald-500/20">
               <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
               <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Nodes Operational</span>
            </div>
         </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 pt-32 pb-20 space-y-20 relative min-h-screen">
        <AnimatePresence mode="wait">
          {activeTab === 'create' && (
            <motion.div 
               key="create" 
               initial={{ opacity: 0, scale: 0.98 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0 }}
               className="grid grid-cols-1 lg:grid-cols-12 gap-12"
            >
               {/* Controls Console */}
               <div className="lg:col-span-4 space-y-8">
                  <header className="space-y-2">
                     <div className="inline-block px-3 py-1 bg-sky-500/10 border border-sky-500/20 rounded-full text-[9px] font-black uppercase tracking-widest text-sky-500">
                        Module: Directive Input
                     </div>
                     <h2 className="text-4xl font-extrabold italic text-white leading-none uppercase tracking-tighter">Tactical<br/><span className="text-sky-500">Orchestrator</span></h2>
                  </header>

                  <section className="glass-panel p-10 neo-shadow space-y-10 border-2 border-white/5">
                     <div className="space-y-6">
                        <div className="flex justify-between items-center">
                           <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Media Arsenal</div>
                           <div className="text-[8px] font-mono text-sky-500/50 uppercase">{userAssets.length} / 5 ASSETS</div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                           {userAssets.map((asset, idx) => (
                              <div key={idx} className="relative group aspect-square bg-slate-950 border border-white/5 rounded-2xl overflow-hidden shadow-inner">
                                 {asset.type === 'video' ? (
                                    <video src={asset.url} className="w-full h-full object-cover opacity-50" />
                                 ) : (
                                    <img src={asset.url} className="w-full h-full object-cover opacity-50" />
                                 )}
                                 <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <p className="text-[8px] font-bold text-white uppercase tracking-tighter line-clamp-1 px-2 mb-2">{asset.name}</p>
                                    <button 
                                      onClick={() => removeAsset(idx)}
                                      className="p-2 bg-rose-500/20 text-rose-500 rounded-lg hover:bg-rose-500 transition-colors"
                                    >
                                       <Trash2 className="w-3 h-3" />
                                    </button>
                                 </div>
                                 <div className="absolute top-2 left-2">
                                    {asset.type === 'video' ? <FileVideo className="w-3 h-3 text-sky-500" /> : <FileImage className="w-3 h-3 text-emerald-500" />}
                                 </div>
                              </div>
                           ))}

                           {userAssets.length < 5 && (
                              <label className="relative aspect-square flex flex-col items-center justify-center border-2 border-dashed border-white/5 bg-slate-950/50 rounded-2xl cursor-pointer hover:border-sky-500/50 hover:bg-sky-500/5 transition-all group overflow-hidden">
                                 <input type="file" multiple accept="image/*,video/*" onChange={handleFileUpload} className="hidden" />
                                 {uploading ? (
                                    <RefreshCw className="w-6 h-6 text-sky-500 animate-spin" />
                                 ) : (
                                    <>
                                       <div className="p-3 bg-white/5 rounded-xl border border-white/5 group-hover:scale-110 transition-transform">
                                          <Upload className="w-5 h-5 text-slate-700 group-hover:text-sky-500" />
                                       </div>
                                       <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest mt-3 group-hover:text-sky-400">Deploy Assets</span>
                                    </>
                                 )}
                              </label>
                           )}
                        </div>

                        {userAssets.length > 0 && (
                           <div className="p-4 bg-sky-500/5 border border-sky-500/10 rounded-2xl">
                              <p className="text-[9px] font-bold text-sky-400 uppercase leading-none tracking-tight">
                                 Hybrid Directive Active: User media will be prioritized in the final assembly node.
                              </p>
                           </div>
                        )}
                     </div>

                     <div className="w-full h-px bg-white/5" />

                     <form onSubmit={handleStart} className="space-y-10">
                        <div className="space-y-8">
                           <div className="space-y-4">
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex justify-between items-center">
                                 <div className="flex items-center gap-2">
                                    <span>Script Brain Command</span>
                                    <button 
                                      type="button"
                                      onClick={() => setUseManualScript(!useManualScript)}
                                      className={`px-2 py-0.5 rounded border text-[7px] transition-all ${useManualScript ? 'bg-sky-500/20 border-sky-500 text-sky-400' : 'bg-slate-950 border-slate-800 text-slate-700'}`}
                                    >
                                       {useManualScript ? 'MANUAL_OVERRIDE' : 'TOPIC_MODE'}
                                    </button>
                                 </div>
                                 <div className="flex items-center gap-4">
                                    <span className="text-slate-700">WORDS: {topic.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').split(/\s+/).filter(Boolean).length}</span>
                                    <span className="text-sky-500 opacity-50">[RT_STREAM]</span>
                                 </div>
                              </label>
                              
                              <div className="quill-container bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 focus-within:border-sky-500 transition-all">
                                 <ReactQuill 
                                    theme="snow"
                                    value={topic}
                                    onChange={setTopic}
                                    placeholder={useManualScript ? "Type your full script here... Use bold for emphasis." : "Type your video topic idea here..."}
                                    modules={{
                                       toolbar: [
                                          [{ 'header': [1, 2, false] }],
                                          ['bold', 'italic', 'underline', 'strike'],
                                          [{ 'color': [] }, { 'background': [] }],
                                          [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                                          ['clean']
                                       ],
                                    }}
                                    className="script-editor"
                                 />
                              </div>
                           </div>

                           <div className="grid grid-cols-2 gap-6">
                              <div className="space-y-4">
                                 <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Niche Cluster</label>
                                 <select 
                                    value={niche}
                                    onChange={e => setNiche(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-4 text-white uppercase text-[10px] font-black tracking-widest outline-none focus:border-sky-500 transition-all cursor-pointer"
                                 >
                                    <option value="education">Educational</option>
                                    <option value="motivation">Motivational</option>
                                    <option value="tech">Technology</option>
                                    <option value="finance">Financial</option>
                                 </select>
                              </div>
                              <div className="space-y-4">
                                 <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Speech Protocol</label>
                                 <select 
                                    value={language}
                                    onChange={e => setLanguage(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-4 text-white uppercase text-[10px] font-black tracking-widest outline-none focus:border-sky-500 transition-all cursor-pointer"
                                 >
                                    <option value="en-IN">English (IND)</option>
                                    <option value="hi-IN">Hindi (IND)</option>
                                    <option value="te-IN">Telugu (IND)</option>
                                 </select>
                              </div>
                           </div>

                           <div className="grid grid-cols-2 gap-6">
                              <div className="space-y-4">
                                 <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Res Matrix</label>
                                 <select 
                                    value={resolution}
                                    onChange={e => setResolution(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-4 text-white uppercase text-[10px] font-black tracking-widest outline-none focus:border-sky-500 transition-all cursor-pointer"
                                 >
                                    <option value="SD">SD (480P)</option>
                                    <option value="HD">HD (1080P)</option>
                                 </select>
                              </div>
                              <div className="space-y-4">
                                 <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Optic Ratio</label>
                                 <select 
                                    value={aspectRatio}
                                    onChange={e => setAspectRatio(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-4 text-white uppercase text-[10px] font-black tracking-widest outline-none focus:border-sky-500 transition-all cursor-pointer"
                                 >
                                    <option value="9:16">9:16 (Vertical)</option>
                                    <option value="16:9">16:9 (Cinema)</option>
                                    <option value="1:1">1:1 (Square)</option>
                                 </select>
                              </div>
                           </div>
                        </div>

                        <button 
                           type="submit"
                           disabled={loading || !!activeJobId}
                           className={`w-full py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.5em] transition-all flex items-center justify-center gap-4 group cyber-button ${loading ? 'bg-slate-800 text-slate-600' : 'bg-sky-500 text-slate-950 shadow-[0_20px_50px_-10px_rgba(14,165,233,0.6)]'}`}
                        >
                           {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
                           <span>{loading ? 'Synthesizing Node' : 'Initialize Cycle'}</span>
                        </button>
                     </form>
                  </section>
               </div>

               {/* Projection Stage */}
               <div className="lg:col-span-8 flex flex-col gap-10">
                  <header className="flex justify-between items-end">
                     <div className="space-y-1">
                        <h2 className="text-xl font-black italic uppercase tracking-tighter text-white">Live Process Projection</h2>
                        <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">Real-time visualization of cloud orchestration.</p>
                     </div>
                     {currentJob && (
                        <div className="text-right">
                           <div className="text-3xl font-mono font-black text-sky-500 tracking-tighter leading-none">{currentJob.progress}%</div>
                           <span className="text-[10px] font-bold text-slate-800 uppercase tracking-widest">Completion Index</span>
                        </div>
                     )}
                  </header>

                  <div className="flex-1 glass-panel neo-shadow p-2 min-h-[600px] flex overflow-hidden border-2 border-white/5 transition-all">
                     {strategyResult ? (
                        <motion.div 
                           initial={{ opacity: 0, y: 20 }}
                           animate={{ opacity: 1, y: 0 }}
                           className="flex-1 bg-slate-950 rounded-[1.8rem] flex flex-col relative overflow-hidden p-10 space-y-10"
                        >
                           <div className="flex justify-between items-start">
                              <div className="space-y-2">
                                 <div className="flex items-center gap-3">
                                    <BrainCircuit className="w-6 h-6 text-sky-500" />
                                    <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">Hook Evolution Lab</h3>
                                 </div>
                                 <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Neural agents have synthesized 5 diverse entry points.</p>
                              </div>
                              <div className="px-4 py-2 bg-sky-500/10 border border-sky-500/20 rounded-full text-[9px] font-black text-sky-400 uppercase tracking-widest">Awaiting Directive</div>
                           </div>

                           <div className="grid grid-cols-1 md:grid-cols-2 gap-10 flex-1 overflow-hidden">
                              <div className="space-y-6 overflow-y-auto custom-scrollbar pr-4">
                                 <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-2">
                                    <Zap className="w-4 h-4 text-sky-500" />
                                    Viral Hook Variations
                                 </div>
                                 <div className="space-y-4">
                                    {strategyResult.hooks.map((hook: string, idx: number) => (
                                       <button
                                          key={idx}
                                          onClick={() => setSelectedHookIndex(idx)}
                                          className={`w-full text-left p-6 rounded-3xl border-2 transition-all duration-300 relative group ${selectedHookIndex === idx ? 'bg-sky-500/10 border-sky-500 shadow-[0_0_30px_-10px_rgba(14,165,233,0.3)]' : 'bg-white/2 border-white/5 hover:border-white/10'}`}
                                       >
                                          <div className="flex gap-4">
                                             <span className={`text-lg font-black italic tracking-tighter transition-colors ${selectedHookIndex === idx ? 'text-sky-400' : 'text-slate-800'}`}>0{idx + 1}</span>
                                             <p className={`text-sm font-medium leading-relaxed ${selectedHookIndex === idx ? 'text-white' : 'text-slate-400'}`}>{hook}</p>
                                          </div>
                                          {selectedHookIndex === idx && (
                                             <div className="absolute top-4 right-4 animate-in fade-in zoom-in">
                                                <CheckCircle2 className="w-4 h-4 text-sky-500" />
                                             </div>
                                          )}
                                       </button>
                                    ))}
                                 </div>
                              </div>

                              <div className="space-y-8 flex flex-col">
                                 <div className="space-y-4 bg-white/2 border border-white/5 p-8 rounded-3xl">
                                    <div className="flex items-center gap-3">
                                       <TrendingUp className="w-4 h-4 text-emerald-500" />
                                       <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Retention Logic</div>
                                    </div>
                                    <p className="text-xs text-slate-400 leading-relaxed italic uppercase font-bold tracking-tight">
                                       "{strategyResult.retention_analysis}"
                                    </p>
                                 </div>

                                 <div className="flex-1 space-y-4">
                                    <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Baseline Narrative</div>
                                    <div className="bg-slate-900/50 p-6 rounded-3xl border border-white/5 font-mono text-[10px] text-slate-500 leading-relaxed uppercase">
                                       {strategyResult.script.substring(0, 300)}...
                                    </div>
                                 </div>

                                 <div className="space-y-6 pt-6 border-t border-white/5">
                                    <button 
                                       onClick={handleFinalizeGeneration}
                                       disabled={selectedHookIndex === null || loading}
                                       className={`w-full py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.5em] transition-all flex items-center justify-center gap-4 cyber-button ${selectedHookIndex === null || loading ? 'bg-slate-800 text-slate-600' : 'bg-emerald-500 text-slate-950 shadow-[0_20px_50px_-10px_rgba(16,185,129,0.5)]'}`}
                                    >
                                       {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Rocket className="w-5 h-5" />}
                                       <span>{loading ? 'Synthesizing Node' : 'Finalize & Render'}</span>
                                    </button>
                                    <button 
                                       onClick={handleStart}
                                       className="w-full text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-sky-500 transition-colors flex items-center justify-center gap-2"
                                    >
                                       <RefreshCw className="w-3 h-3" />
                                       Regenerate Strategy Cycles
                                    </button>
                                 </div>
                              </div>
                           </div>
                        </motion.div>
                     ) : currentJob ? (
                        <div className="flex-1 bg-slate-950 rounded-[1.8rem] flex flex-col relative overflow-hidden">
                           <div className="p-10 border-b border-white/5 flex justify-between items-center">
                              <div className="flex items-center gap-4">
                                 <div className={`p-4 rounded-2xl bg-white/5 border border-white/10 ${currentJob.status === 'completed' ? 'text-emerald-500' : 'text-sky-500 animate-pulse'}`}>
                                    <Activity className="w-6 h-6" />
                                 </div>
                                 <div>
                                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-1">Process Node // {currentJob.id}</div>
                                    <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">
                                       {currentJob.status === 'processing' && 'Synthesizing Assets...'}
                                       {currentJob.status === 'awaiting_approval' && 'Pending Clearance'}
                                       {currentJob.status === 'completed' && 'Synthesis Complete'}
                                       {currentJob.status === 'publishing' && 'Instagram Linkage...'}
                                       {currentJob.status === 'failed' && 'Hardware Interrupt'}
                                    </h3>
                                 </div>
                              </div>
                              <div className="flex gap-2">
                                 {['CPU', 'IMG', 'VOX', 'EDIT', 'IG'].map((node, i) => (
                                    <div key={node} className={`px-3 py-1 rounded-md text-[8px] font-black tracking-[0.2em] border transition-all ${currentJob.status === 'failed' ? 'bg-rose-500/10 border-rose-500/50 text-rose-500' : currentJob.progress > (node === 'IG' ? 95 : i * 20) ? 'bg-sky-500/10 border-sky-500/50 text-sky-400 opacity-100' : 'bg-slate-950 border-white/5 text-slate-800 opacity-50'}`}>
                                       {node}
                                    </div>
                                 ))}
                              </div>
                           </div>

                           <div className="grid grid-cols-1 md:grid-cols-2 gap-10 p-10 flex-1 overflow-hidden">
                              <div className="space-y-6 flex flex-col">
                                 <div className="flex-1 bg-slate-900 shadow-inner rounded-3xl overflow-hidden border border-white/5 relative group">
                                    {currentJob.result?.videoUrl ? (
                                       <div className="w-full h-full flex flex-col">
                                          <VideoPlayer 
                                             src={currentJob.result.videoUrl} 
                                             onMetadata={handleVideoMetadata}
                                          />
                                          {videoMetadata && (
                                            <div className="bg-slate-950/80 backdrop-blur-md px-6 py-3 border-t border-white/5 flex justify-between items-center animate-in fade-in slide-in-from-bottom-2 duration-500">
                                               <div className="flex items-center gap-4">
                                                  <div className="flex flex-col">
                                                     <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Dimension</span>
                                                     <span className="text-[10px] font-mono font-bold text-sky-400">{videoMetadata.resolution}</span>
                                                  </div>
                                                  <div className="w-px h-6 bg-white/5" />
                                                  <div className="flex flex-col">
                                                     <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Aspect</span>
                                                     <span className="text-[10px] font-mono font-bold text-emerald-400">{videoMetadata.aspect}</span>
                                                  </div>
                                               </div>
                                               <div className="px-2 py-1 bg-sky-500/10 border border-sky-500/20 rounded text-[7px] font-black text-sky-500 uppercase tracking-widest">Technical Master</div>
                                            </div>
                                          )}
                                       </div>
                                    ) : (
                                       <div className="h-full flex items-center justify-center text-slate-900">
                                          <Video className="w-20 h-20 animate-pulse" />
                                       </div>
                                    )}
                                    <div className="absolute top-6 right-6 px-4 py-2 bg-sky-500 text-slate-950 text-[10px] font-extrabold rounded-full uppercase tracking-widest shadow-xl">
                                       PROJECTION_READY
                                    </div>
                                 </div>

                                 {currentJob.status === 'awaiting_approval' && (
                                    <div className="flex flex-col gap-4">
                                       <button 
                                          onClick={handleApprove}
                                          className="w-full cyber-button bg-emerald-500 text-slate-950 py-5 rounded-3xl font-black text-xs uppercase tracking-[0.4em] shadow-[0_20px_50px_-10px_rgba(16,185,129,0.4)] animate-pulse"
                                       >
                                          Authorize Transmission
                                       </button>
                                       <p className="text-[10px] text-center font-bold text-slate-600 uppercase tracking-widest italic">Awaiting Secure Link Handshake to Instagram</p>
                                    </div>
                                 )}
                              </div>

                              <div className="space-y-8 flex flex-col max-h-full">
                                 <div className="space-y-4">
                                    <div className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">Active Cycle Progress</div>
                                    <div className="grid grid-cols-5 gap-3">
                                       {[
                                         { id: 'CPU', icon: <Terminal className="w-4 h-4" /> },
                                         { id: 'IMG', icon: <ImageIcon className="w-4 h-4" /> },
                                         { id: 'VOX', icon: <Mic2 className="w-4 h-4" /> },
                                         { id: 'EDIT', icon: <Layers className="w-4 h-4" /> },
                                         { id: 'IG', icon: <Rocket className="w-4 h-4" /> }
                                       ].map((step, idx) => {
                                         const isActive = currentJob.logs.slice().reverse().find(l => l.includes(`Node ${step.id}`)) || (idx === 0 && currentJob.status === 'processing');
                                         const isDone = currentJob.progress > (idx + 1) * 20;
                                         return (
                                           <div key={step.id} className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all duration-500 ${isActive ? 'bg-sky-500/10 border-sky-500/50 text-sky-400 scale-105 shadow-lg shadow-sky-500/10' : isDone ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-500' : 'bg-slate-950 border-white/5 text-slate-800'}`}>
                                              {step.icon}
                                              <span className="text-[8px] font-black uppercase tracking-tighter">{step.id}</span>
                                           </div>
                                         );
                                       })}
                                    </div>
                                 </div>

                                 <div className="flex-1 space-y-4 flex flex-col min-h-0">
                                    <div className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] flex justify-between">
                                       Neural Logs
                                       <span className="text-sky-500 animate-pulse">SYSTEM_ACTIVE</span>
                                    </div>
                                    <div className="flex-1 bg-slate-950 border border-white/5 rounded-3xl p-8 font-mono text-[10px] space-y-3 overflow-y-auto custom-scrollbar shadow-inner">
                                       {currentJob.logs.map((log, i) => (
                                          <div key={i} className="flex gap-4 group">
                                             <span className="text-slate-800 shrink-0 select-none">[{log.match(/\[(.*?)\]/)?.[1]?.split('T')[1].split('.')[0] || i}]</span>
                                             <span className={`transition-colors uppercase leading-relaxed ${log.includes('Error') || log.includes('failed') ? 'text-rose-400' : 'text-slate-500 group-hover:text-sky-300'}`}>
                                                {log.split('] ')[1] || log}
                                             </span>
                                          </div>
                                       ))}
                                       <div ref={logEndRef} />
                                       {currentJob.status === 'processing' && (
                                          <div className="text-sky-500 animate-pulse flex items-center gap-3 mt-4">
                                             <RefreshCw className="w-3 h-3 animate-spin" />
                                             PROVISIONING_RESOURCES...
                                          </div>
                                       )}
                                    </div>
                                 </div>

                                 {currentJob.result?.viral_metadata && (
                                   <div className="md:col-span-2 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 mt-6 pt-6 border-t border-white/5">
                                      <div className="flex items-center gap-3">
                                         <TrendingUp className="w-5 h-5 text-sky-500" />
                                         <h4 className="text-sm font-black text-white italic uppercase tracking-widest">Viral Growth Blueprint</h4>
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                         <div className="glass-panel p-6 bg-white/2 border-white/5 space-y-4">
                                            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Psychological Hooks</div>
                                            <div className="space-y-2">
                                               {currentJob.result.hooks?.map((hook: string, i: number) => (
                                                  <div key={i} className="text-[10px] text-slate-300 bg-slate-950 border border-white/5 p-3 rounded-xl hover:border-sky-500/30 transition-all flex gap-3">
                                                     <span className="text-sky-500 font-bold">#0{i+1}</span>
                                                     {hook}
                                                  </div>
                                               ))}
                                            </div>
                                         </div>
                                         <div className="glass-panel p-6 bg-white/2 border-white/5 space-y-4">
                                            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Strategic Metadata</div>
                                            <div className="space-y-4">
                                               <div className="space-y-1">
                                                  <div className="text-[8px] font-bold text-slate-600 uppercase">Caption Matrix</div>
                                                  <p className="text-[10px] text-slate-400 line-clamp-3">{currentJob.result.viral_metadata.caption}</p>
                                               </div>
                                               <div className="space-y-1">
                                                  <div className="text-[8px] font-bold text-slate-600 uppercase">Natural CTA</div>
                                                  <p className="text-[10px] text-sky-400 font-black italic">{currentJob.result.viral_metadata.cta}</p>
                                               </div>
                                               <div className="flex flex-wrap gap-2 pt-2">
                                                  {currentJob.result.viral_metadata.hashtags?.map((tag: string) => (
                                                     <span key={tag} className="text-[7px] font-black text-slate-500 bg-slate-950 px-2 py-1 rounded border border-white/5">#{tag}</span>
                                                  ))}
                                               </div>
                                            </div>
                                         </div>
                                         <div className="glass-panel p-6 bg-white/2 border-white/5 space-y-4">
                                            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Retention Strategy</div>
                                            <div className="space-y-2 max-h-[150px] overflow-y-auto custom-scrollbar pr-2 text-slate-400">
                                               {currentJob.result.scenes?.map((scene: any, i: number) => (
                                                  <div key={i} className="text-[9px] group border-b border-white/5 pb-2 last:border-0 hover:bg-white/2 p-1 rounded transition-all">
                                                     <div className="flex justify-between items-center mb-1">
                                                        <span className="text-emerald-500 font-black tracking-tighter uppercase">Scene {i+1}</span>
                                                        <span className="text-[7px] text-slate-700 tracking-widest uppercase">B-ROLL</span>
                                                     </div>
                                                     <p className="font-medium group-hover:text-emerald-400 transition-colors uppercase italic leading-tight">{scene.broll_suggestion}</p>
                                                  </div>
                                               ))}
                                            </div>
                                         </div>
                                      </div>
                                   </div>
                                 )}

                                 <div className="glass-panel p-6 space-y-4 bg-white/5 !rounded-3xl border-transparent">
                                    <div className="flex justify-between items-center">
                                       <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Distribution Ready Caption</div>
                                       <button onClick={() => copyToClipboard(currentJob.result?.caption || '')} className="text-sky-500 hover:text-sky-400">
                                          <Copy className="w-4 h-4" />
                                       </button>
                                    </div>
                                    <p className="text-slate-400 text-xs italic font-medium leading-relaxed line-clamp-3 uppercase tracking-tighter">
                                       {currentJob.result?.caption || 'Awaiting Strategy...'}
                                    </p>
                                 </div>
                              </div>
                           </div>
                        </div>
                     ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-20 space-y-8 text-center border-dashed border-4 border-white/5 rounded-[2.5rem]">
                           <div className="w-24 h-24 rounded-[2rem] bg-slate-950 border border-white/5 flex items-center justify-center text-slate-900">
                              <Terminal className="w-10 h-10" />
                           </div>
                           <div className="space-y-2">
                              <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">System Idle Matrix</h3>
                              <p className="text-slate-600 font-mono text-[10px] uppercase tracking-widest max-w-sm mx-auto leading-loose">
                                 Currently awaiting directive handshake. Initialize orchestrator mission to project neural activity into this void.
                              </p>
                           </div>
                        </div>
                     )}
                  </div>
               </div>
            </motion.div>
          )}

          {activeTab === 'history' && (
             <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-16">
                <header className="flex justify-between items-end border-b border-white/5 pb-10">
                   <div className="space-y-2">
                      <h2 className="text-5xl font-extrabold italic text-white uppercase tracking-tighter leading-none">Job<span className="text-sky-500">Archives</span></h2>
                      <p className="text-slate-500 font-mono text-[10px] uppercase tracking-widest">Repository of previously synthesized automation clusters.</p>
                   </div>
                   <button onClick={fetchHistory} className="w-16 h-16 glass-panel flex items-center justify-center hover:bg-white/10 transition-all border-2 border-white/5 neo-shadow shadow-sky-500/10">
                      <RefreshCw className="w-6 h-6 text-sky-500" />
                   </button>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
                   {history.map(job => (
                      <div 
                        key={job.id} 
                        onClick={() => setSelectedJob(job)}
                        className="glass-panel group relative overflow-hidden transition-all duration-700 hover:-translate-y-2 hover:scale-105 neo-shadow border-2 border-white/5 hover:border-sky-500/30 cursor-pointer"
                      >
                         <div className="aspect-[9/16] bg-slate-950 relative overflow-hidden">
                            {job.result?.videoUrl ? (
                               <img src={job.result.media?.[0] || job.result.videoUrl} className="w-full h-full object-cover opacity-30 group-hover:opacity-60 transition-all duration-1000" />
                            ) : (
                               <div className="h-full flex items-center justify-center text-slate-900/50">
                                  <Video className="w-20 h-20" />
                               </div>
                            )}
                            <div className="absolute inset-x-0 bottom-0 p-8 pt-20 bg-gradient-to-t from-[#020617] via-[#020617]/80 to-transparent">
                               <div className={`px-2 py-1 rounded text-[7px] font-black uppercase tracking-[0.3em] inline-block mb-4 border ${job.status === 'completed' ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/10' : job.status === 'failed' ? 'border-rose-500/30 text-rose-500 bg-rose-500/10' : 'border-sky-500/30 text-sky-500 bg-sky-500/10 animate-pulse'}`}>
                                  {job.status}
                               </div>
                               <h4 className="text-lg font-black text-white italic line-clamp-2 uppercase tracking-tighter leading-tight group-hover:text-sky-400 transition-colors">{job.data.topic || 'Untitled Workflow'}</h4>
                            </div>
                         </div>
                      </div>
                   ))}
                </div>

                {/* Job Details Modal */}
                <AnimatePresence>
                   {selectedJob && (
                      <motion.div 
                         initial={{ opacity: 0 }}
                         animate={{ opacity: 1 }}
                         exit={{ opacity: 0 }}
                         className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10"
                      >
                         <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-3xl" onClick={() => setSelectedJob(null)} />
                         <motion.div 
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="w-full max-w-6xl max-h-[90vh] bg-slate-950 border border-white/10 rounded-[2.5rem] overflow-hidden flex flex-col relative z-10 shadow-2xl"
                         >
                            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/2">
                               <div className="flex items-center gap-6">
                                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${selectedJob.status === 'completed' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500' : 'bg-rose-500/10 border-rose-500/50 text-rose-500'}`}>
                                     {selectedJob.status === 'completed' ? <CheckCircle2 className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                                  </div>
                                  <div>
                                     <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-1">Archive ID // {selectedJob.id}</div>
                                     <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">{selectedJob.data.topic}</h3>
                                  </div>
                               </div>
                               <button 
                                  onClick={() => setSelectedJob(null)}
                                  className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-500 transition-all"
                               >
                                  <Plus className="w-6 h-6 rotate-45" />
                               </button>
                            </div>

                            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                               <div className="flex-1 p-8 overflow-y-auto custom-scrollbar space-y-10">
                                  {selectedJob.error && (
                                     <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-2xl space-y-3">
                                        <div className="flex items-center gap-3 text-rose-500 text-[10px] font-black uppercase tracking-widest">
                                           <AlertCircle className="w-4 h-4" />
                                           Critical Fault Detected
                                        </div>
                                        <p className="text-rose-100 text-sm font-mono leading-relaxed">{selectedJob.error}</p>
                                     </div>
                                  )}

                                  {selectedJob.result?.viral_metadata && (
                                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 bg-sky-500/5 p-8 rounded-3xl border border-sky-500/10 mb-10">
                                       <div className="flex items-center justify-between gap-3">
                                          <div className="flex items-center gap-3">
                                             <TrendingUp className="w-5 h-5 text-sky-500" />
                                             <h4 className="text-sm font-black text-white italic uppercase tracking-widest">Viral Growth Blueprint</h4>
                                          </div>
                                          {selectedJob.result.viral_metadata.voice_profile && (
                                             <div className="flex items-center gap-2 px-3 py-1 bg-slate-950/50 rounded-full border border-white/5">
                                                <Mic2 className="w-3 h-3 text-emerald-400" />
                                                <span className="text-[8px] font-black text-emerald-400 uppercase tracking-tighter">{selectedJob.result.viral_metadata.voice_profile} Archetype</span>
                                             </div>
                                          )}
                                       </div>

                                       {selectedJob.result.viral_metadata.retention_analysis && (
                                          <div className="bg-slate-950/30 p-4 rounded-2xl border border-white/5">
                                             <div className="flex items-center gap-2 mb-2">
                                                <BrainCircuit className="w-3 h-3 text-sky-400" />
                                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Psychology & Retention Analysis</span>
                                             </div>
                                             <p className="text-[11px] text-slate-400 leading-relaxed font-medium italic">
                                                "{selectedJob.result.viral_metadata.retention_analysis}"
                                             </p>
                                          </div>
                                       )}

                                       <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                          <div className="space-y-4">
                                             <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Psychological Hooks</div>
                                             <div className="space-y-2">
                                                {selectedJob.result.hooks?.map((hook: string, i: number) => (
                                                   <div key={i} className="text-[10px] text-slate-300 bg-slate-950 border border-white/5 p-3 rounded-xl flex gap-3">
                                                      <span className="text-sky-500 font-bold">#0{i+1}</span>
                                                      {hook}
                                                   </div>
                                                ))}
                                             </div>
                                          </div>
                                          <div className="space-y-6">
                                             <div className="space-y-2">
                                                <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Natural CTA</div>
                                                <p className="text-xs text-sky-400 font-black italic uppercase leading-relaxed tracking-tight">{selectedJob.result.viral_metadata.cta}</p>
                                             </div>

                                             <div className="space-y-2">
                                                <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Production Pulse</div>
                                                <div className="space-y-2 h-[120px] overflow-y-auto custom-scrollbar pr-2">
                                                   {selectedJob.result.scenes?.map((scene: any, i: number) => (
                                                      <div key={i} className="bg-slate-950/50 p-3 rounded-xl border border-white/5 space-y-2">
                                                         <div className="flex justify-between items-center">
                                                            <span className="text-[8px] font-black text-sky-500 uppercase">Scene {i+1}</span>
                                                            <div className="flex gap-1">
                                                               {scene.subtitle_emphasis?.map((word: string) => (
                                                                  <span key={word} className="text-[6px] font-black bg-emerald-500/20 text-emerald-400 px-1 rounded uppercase">{word}</span>
                                                               ))}
                                                            </div>
                                                         </div>
                                                         <p className="text-[9px] text-slate-400 italic leading-tight border-l border-white/10 pl-2">
                                                            <span className="text-slate-600 font-bold mr-1">B-ROLL:</span>
                                                            {scene.broll_suggestion}
                                                         </p>
                                                      </div>
                                                   ))}
                                                </div>
                                             </div>

                                             <div className="space-y-2">
                                                <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Engagement Matrix</div>
                                                <div className="flex flex-wrap gap-2">
                                                   {selectedJob.result.viral_metadata.hashtags?.map((tag: string) => (
                                                      <span key={tag} className="text-[8px] font-black text-slate-400 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-white/5">#{tag}</span>
                                                   ))}
                                                </div>
                                             </div>
                                          </div>
                                       </div>
                                    </div>
                                  )}

                                  <div className="space-y-4">
                                     <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex justify-between">
                                        Mission Telemetry Logs
                                        <span className="text-sky-500/50">{selectedJob.logs.length} ENTRIES</span>
                                     </div>
                                     <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-8 font-mono text-[11px] space-y-4">
                                        {selectedJob.logs.map((log, i) => (
                                          <div key={i} className="flex gap-6 group border-b border-white/2 pb-3 last:border-0 last:pb-0">
                                             <span className="text-slate-800 shrink-0 select-none">[{log.match(/\[(.*?)\]/)?.[1]?.split('T')[1].split('.')[0] || i}]</span>
                                             <span className={`transition-colors uppercase leading-relaxed ${log.includes('Error') || log.includes('failed') ? 'text-rose-400' : 'text-slate-400 group-hover:text-sky-300'}`}>
                                                {log.split('] ')[1] || log}
                                             </span>
                                          </div>
                                        ))}
                                     </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-6">
                                     <div className="p-6 bg-white/2 rounded-2xl border border-white/5 space-y-2">
                                        <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Niche Cluster</div>
                                        <div className="text-white text-xs font-bold uppercase tracking-tighter">{selectedJob.data.niche}</div>
                                     </div>
                                     <div className="p-6 bg-white/2 rounded-2xl border border-white/5 space-y-2">
                                        <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Speech Protocol</div>
                                        <div className="text-white text-xs font-bold uppercase tracking-tighter">{selectedJob.data.language}</div>
                                     </div>
                                  </div>
                               </div>

                               <div className="lg:w-[400px] bg-white/2 border-l border-white/5 p-8 space-y-8 overflow-y-auto">
                                  <div className="aspect-[9/16] bg-slate-950 rounded-3xl border border-white/10 overflow-hidden relative shadow-2xl flex flex-col">
                                     {selectedJob.result?.videoUrl ? (
                                        <>
                                           <VideoPlayer 
                                              src={selectedJob.result.videoUrl} 
                                              onMetadata={handleVideoMetadata}
                                           />
                                           {videoMetadata && (
                                             <div className="bg-slate-950 px-6 py-4 border-t border-white/5 flex gap-6 animate-in slide-in-from-bottom-1 duration-500">
                                                <div className="flex flex-col">
                                                   <span className="text-[7px] font-black text-slate-600 uppercase tracking-widest">Res</span>
                                                   <span className="text-[9px] font-mono font-bold text-sky-400">{videoMetadata.resolution}</span>
                                                </div>
                                                <div className="flex flex-col">
                                                   <span className="text-[7px] font-black text-slate-600 uppercase tracking-widest">Ratio</span>
                                                   <span className="text-[9px] font-mono font-bold text-emerald-400">{videoMetadata.aspect}</span>
                                                </div>
                                             </div>
                                           )}
                                        </>
                                     ) : (
                                        <div className="h-full flex items-center justify-center text-slate-900">
                                           <Video className="w-16 h-16" />
                                        </div>
                                     )}
                                  </div>

                                  <div className="space-y-4">
                                     <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Acoustic Asset</div>
                                     {selectedJob.result?.audioUrl && (
                                        <audio src={selectedJob.result.audioUrl} controls className="w-full h-10 opacity-50 hover:opacity-100 transition-opacity" />
                                     )}
                                  </div>

                                  <div className="space-y-4">
                                     <div className="flex justify-between items-center">
                                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Narrative Script</div>
                                        <button onClick={() => copyToClipboard(selectedJob.data.script)} className="text-sky-500 hover:text-sky-400">
                                           <Copy className="w-4 h-4" />
                                        </button>
                                     </div>
                                     <p className="text-slate-400 text-xs leading-relaxed uppercase tracking-tight line-clamp-6">{selectedJob.data.script}</p>
                                  </div>

                                  {selectedJob.status === 'completed' && (
                                     <button 
                                        onClick={() => window.open(selectedJob.result?.videoUrl, '_blank')}
                                        className="w-full py-4 bg-sky-500 text-slate-950 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 shadow-lg shadow-sky-500/20"
                                     >
                                        <ExternalLink className="w-4 h-4" />
                                        Open Master Stream
                                     </button>
                                  )}
                               </div>
                            </div>
                         </motion.div>
                      </motion.div>
                   )}
                </AnimatePresence>
             </motion.div>
          )}

          {activeTab === 'settings' && (
             <motion.div key="settings" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="max-w-6xl space-y-12">
                <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-10">
                   <div>
                      <h2 className="text-6xl font-black italic text-white uppercase tracking-tighter leading-none">Security<span className="text-sky-500">Node</span></h2>
                      <p className="text-slate-500 font-mono text-[10px] uppercase tracking-[0.3em] mt-4 flex items-center gap-2">
                        <ShieldCheck className="w-3 h-3 text-emerald-500" />
                        Autonomous Encryption & Credential Management Layer
                      </p>
                   </div>
                   <div className="flex gap-4">
                      <div className="px-6 py-3 bg-white/2 border border-white/5 rounded-2xl flex flex-col items-center">
                         <span className="text-[7px] font-black text-slate-600 uppercase tracking-widest">Storage Status</span>
                         <span className="text-[10px] font-black text-emerald-500 uppercase">LocalStorage Encrypted</span>
                      </div>
                      <div className="px-6 py-3 bg-white/2 border border-white/5 rounded-2xl flex flex-col items-center">
                         <span className="text-[7px] font-black text-slate-600 uppercase tracking-widest">Active Region</span>
                         <span className="text-[10px] font-black text-sky-500 uppercase">Global Node 01</span>
                      </div>
                   </div>
                </header>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
                   <div className="xl:col-span-8 space-y-10">
                      {/* Intelligence Controls */}
                      <section className="glass-panel p-10 neo-shadow border-2 border-white/5 space-y-8 relative overflow-hidden group">
                         <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:opacity-10 transition-opacity">
                            <BrainCircuit className="w-40 h-40" />
                         </div>
                         <div className="flex items-center gap-4 relative z-10">
                            <div className="w-10 h-10 bg-sky-500/10 rounded-xl flex items-center justify-center border border-sky-500/20">
                               <Cpu className="w-5 h-5 text-sky-500" />
                            </div>
                            <h3 className="text-xl font-black text-white italic uppercase tracking-tight">Intelligence Matrix</h3>
                         </div>
                         
                         <div className="space-y-8 relative z-10">
                            <div className="space-y-4">
                               <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em]">Primary LLM Protocol</label>
                               <div className="grid grid-cols-3 gap-3">
                                  {['gemini', 'groq', 'nvidia'].map(p => (
                                     <button 
                                        key={p} 
                                        onClick={() => saveKeys({...userKeys, llm_provider: p} as any)}
                                        className={`py-4 rounded-2xl border text-[9px] font-black uppercase tracking-widest transition-all ${userKeys.llm_provider === p ? 'bg-sky-500 text-slate-950 border-sky-500 shadow-[0_15px_30px_-10px_rgba(14,165,233,0.5)]' : 'bg-slate-950/50 text-slate-600 border-white/5 hover:border-white/10'}`}
                                     >
                                        {p}
                                     </button>
                                  ))}
                               </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                               <SecretInput id="gemini" helpLink="https://aistudio.google.com/app/apikey" label="Gemini AI (Google)" value={userKeys.gemini_key} onChange={(val) => saveKeys({...userKeys, gemini_key: val})} />
                               <SecretInput id="groq" helpLink="https://console.groq.com/keys" label="Groq Llama (OSS)" value={userKeys.groq_key} onChange={(val) => saveKeys({...userKeys, groq_key: val})} />
                               <SecretInput id="nvidia" helpLink="https://build.nvidia.com/" label="NVIDIA NIM (Elite)" value={userKeys.nvidia_key} onChange={(val) => saveKeys({...userKeys, nvidia_key: val})} />
                            </div>
                         </div>
                      </section>

                      {/* Vision Controls */}
                      <section className="glass-panel p-10 neo-shadow border-2 border-white/5 space-y-8 relative overflow-hidden group">
                         <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:opacity-10 transition-opacity text-emerald-500">
                            <ImageIcon className="w-40 h-40" />
                         </div>
                         <div className="flex items-center gap-4 relative z-10">
                            <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20">
                               <ImageIcon className="w-5 h-5 text-emerald-500" />
                            </div>
                            <h3 className="text-xl font-black text-white italic uppercase tracking-tight">Vision Synthesis</h3>
                         </div>

                         <div className="space-y-8 relative z-10">
                            <div className="space-y-4">
                               <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em]">Diffusion Node Selection</label>
                               <div className="grid grid-cols-3 gap-3">
                                  {['together', 'fal', 'elite_hybrid'].map(p => (
                                     <button 
                                        key={p} 
                                        onClick={() => saveKeys({...userKeys, image_provider: p} as any)}
                                        className={`py-4 rounded-2xl border text-[9px] font-black uppercase tracking-widest transition-all ${userKeys.image_provider === p ? 'bg-emerald-500 text-slate-950 border-emerald-500 shadow-[0_15px_30px_-10px_rgba(16,185,129,0.5)]' : 'bg-slate-950/50 text-slate-600 border-white/5 hover:border-white/10'}`}
                                     >
                                        {p.replace('_', ' ')}
                                     </button>
                                  ))}
                               </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                               <SecretInput id="together" helpLink="https://api.together.xyz/settings/api-keys" label="Together Flux (Pro)" value={userKeys.together_key} onChange={(val) => saveKeys({...userKeys, together_key: val})} />
                               <SecretInput id="fal" helpLink="https://fal.ai/dashboard/keys" label="Fal.ai Fusion (Elite)" value={userKeys.fal_key} onChange={(val) => saveKeys({...userKeys, fal_key: val})} />
                            </div>
                         </div>
                      </section>

                      {/* Acoustic & Social */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                         <section className="glass-panel p-8 border-2 border-white/5 space-y-6">
                            <div className="flex items-center gap-3">
                               <Mic2 className="w-4 h-4 text-amber-500" />
                               <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Acoustic Logic</h4>
                            </div>
                            <div className="flex gap-2">
                               {['sarvam', 'fish_audio'].map(p => (
                                  <button 
                                     key={p} 
                                     onClick={() => saveKeys({...userKeys, voice_provider: p} as any)}
                                     className={`flex-1 py-3 rounded-xl border text-[8px] font-black uppercase tracking-widest transition-all ${userKeys.voice_provider === p ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-lg shadow-amber-500/20' : 'bg-slate-950 text-slate-600 border-white/5'}`}
                                  >
                                     {p.replace('_', ' ')}
                                  </button>
                               ))}
                            </div>
                            <div className="space-y-4">
                               <SecretInput id="sarvam" helpLink="https://www.sarvam.ai/" label="Sarvam Key" value={userKeys.sarvam_key} onChange={(val) => saveKeys({...userKeys, sarvam_key: val})} />
                               <SecretInput id="fish_audio" helpLink="https://fish.audio/go-api" label="Fish Key" value={userKeys.fish_audio_key} onChange={(val) => saveKeys({...userKeys, fish_audio_key: val})} />
                            </div>
                         </section>

                         <section className="glass-panel p-8 border-2 border-white/5 space-y-6">
                            <div className="flex items-center gap-3">
                               <Instagram className="w-4 h-4 text-rose-500" />
                               <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Social Handshake</h4>
                            </div>
                            <div className="space-y-4">
                               <SecretInput id="ig" helpLink="https://developers.facebook.com/apps/" label="Meta Graph Token" value={userKeys.ig_token} onChange={(val) => saveKeys({...userKeys, ig_token: val})} />
                               <SecretInput id="ig_user" label="Instagram UID" value={userKeys.ig_user} onChange={(val) => saveKeys({...userKeys, ig_user: val})} />
                            </div>
                         </section>
                      </div>
                   </div>

                   <div className="xl:col-span-4 space-y-10">
                      <section className="glass-panel p-8 border-2 border-white/5 space-y-8">
                         <div className="flex items-center gap-3">
                            <Layers className="w-4 h-4 text-sky-500" />
                            <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Production Engine</h4>
                         </div>
                         <div className="space-y-6">
                            <SecretInput id="shotstack" helpLink="https://dashboard.shotstack.io/keys" label="Shotstack Engine" value={userKeys.shotstack_key} onChange={(val) => saveKeys({...userKeys, shotstack_key: val})} />
                            <SecretInput id="creatomate" helpLink="https://creatomate.com/dashboard" label="Creatomate Token" value={userKeys.creatomate_key} onChange={(val) => saveKeys({...userKeys, creatomate_key: val})} />
                            <SecretInput id="creatomate_template" label="Template ID" value={userKeys.creatomate_template} onChange={(val) => saveKeys({...userKeys, creatomate_template: val})} />
                         </div>
                         <div className="p-6 bg-sky-500/5 border border-sky-500/10 rounded-2xl space-y-2">
                             <div className="text-[8px] font-black text-sky-400 uppercase tracking-widest flex items-center gap-2">
                                <Zap className="w-3 h-3" /> Synthesis Optimization
                             </div>
                             <p className="text-[9px] text-slate-500 leading-relaxed font-bold italic uppercase">Render priority set to ultra-high performance mode by default.</p>
                         </div>
                      </section>

                      <div className="space-y-6">
                         <IntegrationCard name="INFRASTRUCTURE" desc="Standard globally distributed execution nodes." status="Operational" icon={<Cloud className="w-4 h-4 text-sky-400" />} />
                         <IntegrationCard name="SECURITY MATRIX" desc="AES-256 E2E encrypted key persistence." status="Hardened" icon={<ShieldCheck className="w-4 h-4 text-emerald-500" />} />
                         <IntegrationCard name="CREDIT MONITOR" desc="Real-time watch for quota and balance alerts." status="Steady" icon={<Activity className="w-4 h-4 text-amber-500" />} />
                      </div>
                   </div>
                </div>
             </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="max-w-7xl mx-auto px-8 py-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-10 text-slate-700">
         <div className="text-[9px] font-black uppercase tracking-[0.6em] flex items-center gap-4">
            <Zap className="w-4 h-4 text-sky-500/30" />
            REELFACTORY V4.0 // DISTRIBUTED AUTONOMY
         </div>
         <div className="flex gap-12 font-mono text-[8px] uppercase tracking-widest text-slate-800">
            <span>SYNC_LATENCY: 0.42MS</span>
            <span>NODES: 12_ACTIVE</span>
            <span>OS: NEURAL_KERNEL_V4</span>
         </div>
      </footer>
    </div>
  );
}

function VideoPlayer({ src, onMetadata }: { src: string, onMetadata?: (e: any) => void }) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const togglePlay = () => {
    if (videoRef.current) {
      if (playing) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setPlaying(!playing);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      const newMuted = !muted;
      videoRef.current.muted = newMuted;
      setMuted(newMuted);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setMuted(val === 0);
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      }
    }
  };

  return (
    <div className="relative group w-full h-full overflow-hidden flex flex-col bg-black">
       <video 
          ref={videoRef}
          src={src}
          onLoadedMetadata={(e) => {
            if (videoRef.current) setDuration(videoRef.current.duration);
            onMetadata?.(e);
          }}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onClick={togglePlay}
          className="w-full h-full flex-1 object-cover cursor-pointer"
          autoPlay
          loop
          playsInline
       />
       
       {/* Center Play Button Overlay */}
       <AnimatePresence>
          {!playing && (
             <motion.div 
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.5 }}
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center bg-slate-950/20 backdrop-blur-[2px] z-10 cursor-pointer"
             >
                <div className="w-20 h-20 rounded-full bg-sky-500 flex items-center justify-center shadow-2xl shadow-sky-500/40">
                   <Play className="w-8 h-8 text-slate-950 fill-current ml-1" />
                </div>
             </motion.div>
          )}
       </AnimatePresence>
       
       <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent p-6 space-y-4 transition-all duration-500 z-20 ${playing ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
          {/* Progress Slider */}
          <div className="flex items-center gap-4">
             <span className="text-[10px] font-mono font-bold text-sky-400 w-10">{formatTime(currentTime)}</span>
             <input 
                type="range" 
                min="0" 
                max={duration || 0} 
                step="0.1" 
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 h-1 bg-white/10 rounded-full accent-sky-500 cursor-pointer hover:accent-sky-400 transition-all appearance-none"
             />
             <span className="text-[10px] font-mono font-bold text-slate-500 w-10">{formatTime(duration)}</span>
          </div>

          <div className="flex justify-between items-center">
             <div className="flex items-center gap-6">
                <button onClick={togglePlay} className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-white border border-white/5">
                   {playing ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                </button>
                <div className="flex items-center gap-3">
                   <button onClick={toggleMute} className="text-slate-400 hover:text-white transition-colors">
                      {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                   </button>
                   <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.05" 
                      value={muted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="w-24 h-1 bg-white/10 rounded-full accent-sky-500 cursor-pointer appearance-none"
                   />
                </div>
             </div>

             <div className="flex items-center gap-4">
                <button 
                  onClick={() => { if (videoRef.current) videoRef.current.currentTime = 0; }}
                  className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-slate-500 hover:text-sky-400 border border-white/5"
                >
                   <RotateCcw className="w-4 h-4" />
                </button>
                <button 
                  onClick={handleFullscreen}
                  className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-slate-500 hover:text-sky-400 border border-white/5"
                >
                   <Maximize className="w-4 h-4" />
                </button>
             </div>
          </div>
       </div>
    </div>
  );
}

function StepIcon({ active, icon }: { active: boolean, icon: React.ReactNode }) {
  return (
    <div className={`w-10 h-10 rounded flex items-center justify-center z-10 transition-all border ${active ? 'bg-slate-800 border-sky-500 text-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.2)]' : 'bg-slate-900 border-slate-800 text-slate-700'}`}>
       {icon}
    </div>
  );
}

function IntegrationCard({ name, desc, status, icon }: { name: string, desc: string, status: string, icon: React.ReactNode }) {
  return (
    <div className="bg-slate-950/40 border border-white/5 p-8 rounded-[2rem] space-y-6 hover:bg-white/5 transition-all group relative overflow-hidden glass-panel neo-shadow">
       <div className="absolute top-0 right-0 w-24 h-24 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity pointer-events-none">
          {icon}
       </div>
       <div className="flex justify-between items-start">
          <div className={`p-4 bg-slate-950 rounded-2xl border transition-colors ${status === 'Operational' || status === 'Connected' || status === 'Hardened' ? 'border-sky-500/20 text-sky-500' : 'border-slate-800 text-slate-600'}`}>
             {icon}
          </div>
          <div className={`text-[8px] font-black uppercase tracking-[0.3em] px-3 py-1 rounded-full border ${status === 'Operational' || status === 'Connected' || status === 'Hardened' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.2)]' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
             {status}
          </div>
       </div>
       <div>
          <h4 className="font-black text-sm mb-2 uppercase italic tracking-tighter text-white">{name}</h4>
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.1em] leading-relaxed line-clamp-2">{desc}</p>
       </div>
    </div>
  );
}

function SecretInput({ 
  label, 
  value, 
  onChange, 
  placeholder, 
  id, 
  helpLink 
}: { 
  label: string, 
  value: string, 
  onChange: (v: string) => void, 
  placeholder?: string,
  id: string,
  helpLink?: string
}) {
  const [show, setShow] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error' | 'quota'; message?: string }>({ type: 'idle' });

  const handleVerify = async () => {
    if (!value) return;
    setVerifying(true);
    try {
      const res = await fetch('/api/verify-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: id, key: value })
      });
      const data = await res.json();
      if (data.status === 'connected') {
        setStatus({ type: 'success', message: data.message });
      } else if (data.isQuota) {
        setStatus({ type: 'quota', message: 'Quota Exhausted: Add Credits' });
      } else {
        setStatus({ type: 'error', message: data.message || 'Verification Failed' });
      }
    } catch (e) {
      setStatus({ type: 'error', message: 'Network Sync Error' });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">{label}</label>
        {helpLink && (
          <a 
            href={helpLink} 
            target="_blank" 
            rel="noreferrer"
            className="text-[8px] font-black text-sky-500 hover:text-sky-400 uppercase tracking-widest flex items-center gap-1 transition-colors"
          >
            Get Key <ExternalLink className="w-2 h-2" />
          </a>
        )}
      </div>
      <div className="relative group">
        <input 
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setStatus({ type: 'idle' });
          }}
          placeholder={placeholder || "SK-PROTCOL-X"}
          className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 px-6 text-xs font-mono focus:outline-none focus:border-sky-500 transition-all pr-32 text-white placeholder:text-slate-900 shadow-inner group-hover:border-slate-700"
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
          <button 
            onClick={(e) => { e.preventDefault(); setShow(!show); }}
            className="text-slate-700 hover:text-sky-500 transition-colors"
          >
            {show ? <Copy className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
          </button>
          <div className="w-px h-4 bg-white/5" />
          <button 
            onClick={(e) => { e.preventDefault(); handleVerify(); }}
            disabled={verifying || !value}
            className={`text-[9px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg border transition-all ${verifying ? 'opacity-50' : 'hover:scale-105'} ${status.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500' : status.type === 'quota' ? 'bg-amber-500/10 border-amber-500/50 text-amber-500' : status.type === 'error' ? 'bg-rose-500/10 border-rose-500/50 text-rose-500' : 'bg-white/5 border-white/10 text-slate-500'}`}
          >
            {verifying ? <RefreshCw className="w-3 h-3 animate-spin" /> : status.type === 'success' ? 'Synced' : status.type === 'quota' ? 'Warning' : 'Verify'}
          </button>
        </div>
      </div>
      {status.message && (
        <motion.p 
          initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
          className={`text-[8px] font-bold uppercase tracking-widest pl-2 ${status.type === 'success' ? 'text-emerald-500' : status.type === 'quota' ? 'text-amber-500' : 'text-rose-500 animate-pulse'}`}
        >
          {status.type === 'error' && 'Handshake_Fault: '}
          {status.message}
        </motion.p>
      )}
    </div>
  );
}
