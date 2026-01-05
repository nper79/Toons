
import React, { useState, useEffect } from 'react';
import { BookOpen, Sparkles, Mic, Play, Save, Check, Settings2 } from 'lucide-react';
import { ProcessingStatus } from '../types';
import { VOICES, generateSpeech, playAudio } from '../services/geminiService';

interface StoryInputProps {
  onAnalyze: (text: string, style: string) => void;
  status: ProcessingStatus;
  selectedVoice: string;
  onVoiceChange: (voice: string) => void;
}

const StoryInput: React.FC<StoryInputProps> = ({ onAnalyze, status, selectedVoice, onVoiceChange }) => {
  const [text, setText] = useState('');
  const [style, setStyle] = useState('Manhwa / Webtoon'); // Default to Manhwa
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  // Load saved preferences on mount
  useEffect(() => {
    const savedStyle = localStorage.getItem('sb_style');
    const savedVoice = localStorage.getItem('sb_voice');
    
    if (savedStyle) setStyle(savedStyle);
    if (savedVoice) onVoiceChange(savedVoice);
  }, []);

  const handleSavePreferences = (e: React.MouseEvent) => {
    e.preventDefault();
    localStorage.setItem('sb_style', style);
    localStorage.setItem('sb_voice', selectedVoice);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      onAnalyze(text, style);
    }
  };

  const handlePreviewVoice = async (e: React.MouseEvent, voiceName: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (previewingVoice) return; // Prevent multiple clicks

    setPreviewingVoice(voiceName);
    try {
      const audioData = await generateSpeech("This is a preview.", voiceName);
      await playAudio(audioData);
    } catch (error) {
      console.error("Failed to preview voice:", error);
    } finally {
      setPreviewingVoice(null);
    }
  };

  const isAnalyzing = status === ProcessingStatus.ANALYZING;

  return (
    <div className="w-full max-w-4xl mx-auto p-6 bg-slate-800 rounded-xl shadow-2xl border border-slate-700">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-500/20 rounded-lg">
              <BookOpen className="w-8 h-8 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Start Your Story</h2>
              <p className="text-slate-400">Paste your narrative below to begin the visualization process.</p>
            </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Configuration Section */}
        <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700/50">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-indigo-300 uppercase tracking-widest flex items-center gap-2">
                    <Settings2 className="w-4 h-4" /> Global Configuration
                </h3>
                <button 
                    onClick={handleSavePreferences}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-2 transition-all border
                    ${isSaved 
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' 
                        : 'bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700'}`}
                >
                    {isSaved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                    {isSaved ? 'SAVED' : 'SAVE PREFERENCES'}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Art Style</label>
                  <select 
                    value={style} 
                    onChange={(e) => setStyle(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="Manhwa / Webtoon">Manhwa / Webtoon (Recommended)</option>
                    <option value="Anime / Manga">Anime / Manga</option>
                    <option value="Cinematic Digital Art">Cinematic Digital Art</option>
                    <option value="Detailed Comic Book">Detailed Comic Book</option>
                    <option value="Realistic Photography">Realistic Photography</option>
                    <option value="Watercolor Illustration">Watercolor Illustration</option>
                    <option value="Retro Pixel Art">Retro Pixel Art</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                    <Mic className="w-4 h-4" /> Narrator Voice
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {VOICES.map((voice) => (
                      <div 
                        key={voice.name}
                        onClick={() => onVoiceChange(voice.name)}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer border transition-all ${
                          selectedVoice === voice.name 
                            ? 'bg-indigo-600/20 border-indigo-500' 
                            : 'bg-slate-900 border-slate-700 hover:border-slate-500'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${selectedVoice === voice.name ? 'bg-indigo-400' : 'bg-slate-600'}`} />
                          <div className="min-w-0">
                            <span className="text-sm font-bold text-white block truncate">{voice.name}</span>
                            <span className="text-[10px] text-slate-400 truncate block">{voice.style}</span>
                          </div>
                        </div>
                        
                        <button
                          onClick={(e) => handlePreviewVoice(e, voice.name)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-full transition-colors text-indigo-400 flex-shrink-0"
                          title="Preview Voice"
                        >
                          {previewingVoice === voice.name ? (
                             <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                             <Play className="w-3 h-3 fill-current" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
            </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Story Text</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your story here. The AI will act as a Manhwa Director, creating panels with text and silent atmospheric beats..."
            className="w-full h-64 bg-slate-900 border border-slate-700 rounded-lg p-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none font-serif leading-relaxed"
            disabled={isAnalyzing}
          />
        </div>

        <button
          type="submit"
          disabled={!text.trim() || isAnalyzing}
          className={`w-full flex items-center justify-center gap-2 p-4 rounded-lg font-bold text-lg transition-all
            ${!text.trim() || isAnalyzing 
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
              : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg hover:shadow-indigo-500/25'
            }`}
        >
          {isAnalyzing ? (
            <>
              <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              Analyzing & Directing Manhwa...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Generate Manhwa Storyboard
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default StoryInput;
