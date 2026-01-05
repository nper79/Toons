
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getWordDefinition } from '../services/geminiService';
import { Loader2, Book, Volume2 } from 'lucide-react';

interface InteractiveTextProps {
  text: string;
  tokens?: string[]; // Explicit tokens from AI
  nativeLanguage: string;
  className?: string;
  learningLanguage?: string; // To help decide rendering strategy
}

const InteractiveText: React.FC<InteractiveTextProps> = ({ 
    text, 
    tokens, 
    nativeLanguage, 
    className = "",
    learningLanguage 
}) => {
  const [selectedWord, setSelectedWord] = useState<{ word: string, definition: string, pronunciation?: string, x: number, y: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleWordClick = async (e: React.MouseEvent<HTMLSpanElement>, word: string) => {
    e.stopPropagation();
    if (!word || !word.trim()) return;

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    
    // Calculate position relative to viewport
    const x = rect.left + (rect.width / 2);
    const y = rect.top;

    setIsLoading(true);
    setSelectedWord({ word, definition: "Loading...", x, y });

    try {
      const result = await getWordDefinition(word, text, nativeLanguage);
      setSelectedWord({ 
        word, 
        definition: result.definition, 
        pronunciation: result.pronunciation,
        x, 
        y 
      });
    } catch (error) {
      setSelectedWord(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = () => setSelectedWord(null);
    window.addEventListener('click', handleClickOutside);
    window.addEventListener('scroll', handleClickOutside, true);
    return () => {
        window.removeEventListener('click', handleClickOutside);
        window.removeEventListener('scroll', handleClickOutside, true);
    };
  }, []);

  // RENDER LOGIC
  // Only use explicit tokens for languages that DO NOT use spaces (Japanese, Chinese, Thai).
  // For languages like Czech, English, etc., we rely on standard space-based splitting 
  // to ensure proper visual formatting.
  const isSpacelessLanguage = learningLanguage && ['Japanese', 'Chinese', 'Thai'].some(l => learningLanguage.includes(l));

  if (isSpacelessLanguage && tokens && tokens.length > 0) {
      return (
        <>
            <div ref={containerRef} className={`${className} leading-relaxed break-words`}>
                {tokens.map((token, index) => (
                    <span
                        key={index}
                        onClick={(e) => handleWordClick(e, token)}
                        className="cursor-pointer hover:bg-indigo-500/30 hover:text-indigo-200 transition-colors inline-block"
                        style={{ margin: 0, padding: 0 }} // Ensure no accidental spacing for these languages
                    >
                        {token}
                    </span>
                ))}
            </div>
            {renderPopup()} 
        </>
      );
  }

  // Fallback / Standard Logic (Western languages)
  // Split text into words but preserve punctuation
  const words = text.split(/(\s+)/);

  return (
    <>
      <div ref={containerRef} className={`${className} leading-relaxed`}>
        {words.map((segment, index) => {
           // Use unicode-aware regex to filter out punctuation
           const isWord = segment.trim().length > 0 && !/^[\p{P}\p{S}\s]+$/u.test(segment);
           
           if (!isWord) return <span key={index}>{segment}</span>;

           return (
             <span
               key={index}
               onClick={(e) => handleWordClick(e, segment)}
               className="cursor-pointer hover:bg-indigo-500/30 hover:text-indigo-200 rounded px-0.5 transition-colors border-b border-dashed border-indigo-500/30 hover:border-indigo-400"
             >
               {segment}
             </span>
           );
        })}
      </div>
      {renderPopup()}
    </>
  );

  function renderPopup() {
      if (!selectedWord) return null;
      return createPortal(
        <div 
            className="fixed z-[11000] bg-slate-900 border border-indigo-500/50 rounded-xl shadow-2xl p-4 w-64 animate-in fade-in zoom-in-95 duration-200"
            style={{ 
                top: Math.max(10, selectedWord.y - 150) + 'px', 
                left: Math.max(10, Math.min(window.innerWidth - 270, selectedWord.x - 128)) + 'px'
            }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/10">
                <span className="font-bold text-lg text-white font-serif">{selectedWord.word}</span>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-indigo-400" /> : <Book className="w-4 h-4 text-indigo-400" />}
            </div>
            
            {selectedWord.pronunciation && (
                 <div className="flex items-center gap-2 mb-2 text-xs text-slate-400 font-mono">
                    <Volume2 className="w-3 h-3" />
                    /{selectedWord.pronunciation}/
                 </div>
            )}
            
            <p className="text-sm text-indigo-100 leading-snug">
                {selectedWord.definition}
            </p>
            
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-slate-900 border-b border-r border-indigo-500/50 rotate-45" />
        </div>,
        document.body
      );
  }
};

export default InteractiveText;
