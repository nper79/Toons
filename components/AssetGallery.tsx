
import React from 'react';
import { Users, Map, RefreshCw, Wand2, Grid, CheckCircle2, Upload, Image as ImageIcon } from 'lucide-react';
import { Character, Setting } from '../types';

interface AssetGalleryProps {
  characters: Character[];
  settings: Setting[];
  onGenerateCharacter: (id: string) => void;
  onGenerateSetting: (id: string) => void;
  onUploadAsset: (type: 'character' | 'setting', id: string, file: File) => void;
}

const AssetGallery: React.FC<AssetGalleryProps> = ({ 
  characters, 
  settings, 
  onGenerateCharacter, 
  onGenerateSetting,
  onUploadAsset
}) => {

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'character' | 'setting', id: string) => {
    const file = e.target.files?.[0];
    if (file) {
        onUploadAsset(type, id, file);
    }
    // Reset input value so same file can be selected again if needed
    e.target.value = '';
  };

  return (
    <div className="space-y-12">
      {/* Characters Section */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <Users className="w-6 h-6 text-pink-400" />
          <h2 className="text-xl font-bold text-white">Character Sheets</h2>
          <span className="px-2 py-0.5 rounded-full bg-slate-700 text-xs text-slate-300">{characters.length}</span>
        </div>
        
        {/* Changed grid to 2 columns for wider character sheets */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {characters.map(char => (
            <div key={char.id} className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700 group hover:border-pink-500/50 transition-all flex flex-col md:flex-row">
              {/* Image Section */}
              <div className="md:w-2/3 aspect-video bg-slate-900 relative border-r border-slate-700 group-image">
                {char.imageUrl ? (
                  <img src={char.imageUrl} alt={char.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 p-6 text-center">
                    <Users className="w-12 h-12 mb-2 opacity-20" />
                    <p className="text-sm">Character Sheet Pending</p>
                  </div>
                )}
                
                {char.isGenerating && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                    <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              
              {/* Info Section */}
              <div className="md:w-1/3 p-4 flex flex-col justify-between bg-slate-850">
                <div className="space-y-3">
                  <div className="border-b border-slate-700 pb-2">
                      <h3 className="font-bold text-white text-lg uppercase tracking-wide">{char.name}</h3>
                      <p className="text-[10px] text-slate-400 uppercase">FRONT | SIDE | BACK | FACE</p>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-6 leading-relaxed">{char.description}</p>
                </div>

                <div className="flex flex-col gap-2 mt-4">
                    <button
                      onClick={() => onGenerateCharacter(char.id)}
                      disabled={char.isGenerating}
                      className="w-full py-2 bg-slate-700 hover:bg-pink-600 text-white text-xs font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    >
                      {char.imageUrl ? <RefreshCw className="w-3 h-3" /> : <Wand2 className="w-3 h-3" />}
                      {char.imageUrl ? 'Regenerate' : 'Generate'}
                    </button>
                    
                    <div className="relative">
                        <input 
                            type="file" 
                            id={`upload-char-${char.id}`} 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => handleFileChange(e, 'character', char.id)}
                        />
                        <label 
                            htmlFor={`upload-char-${char.id}`}
                            className="w-full py-2 bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
                        >
                            <Upload className="w-3 h-3" />
                            Upload Image
                        </label>
                    </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Settings Section */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <Map className="w-6 h-6 text-emerald-400" />
          <h2 className="text-xl font-bold text-white">Settings & Locations</h2>
          <span className="px-2 py-0.5 rounded-full bg-slate-700 text-xs text-slate-300">{settings.length}</span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {settings.map(setting => (
            <div key={setting.id} className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700 group hover:border-emerald-500/50 transition-all flex flex-col">
              {/* Changed to aspect-square to show the 2x2 grid nicely */}
              <div className="aspect-square bg-slate-900 relative group-image">
                 {setting.imageUrl ? (
                  <img src={setting.imageUrl} alt={setting.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 p-6 text-center">
                    <Grid className="w-12 h-12 mb-2 opacity-20" />
                    <p className="text-sm">Authorized Views Pending</p>
                  </div>
                )}
                
                {setting.isGenerating && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                    <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              
              <div className="p-4 bg-slate-850 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-white mb-1">{setting.name}</h3>
                  <p className="text-xs text-slate-400 line-clamp-3 mb-4">{setting.description}</p>
                  
                  {/* Authorized Views Thumbnails */}
                  {setting.authorizedViews && setting.authorizedViews.length > 0 && (
                      <div className="mb-4">
                          <p className="text-[10px] font-bold text-emerald-400 mb-2 uppercase tracking-wide">Authorized Views (Reference Assets)</p>
                          <div className="grid grid-cols-4 gap-1">
                              {setting.authorizedViews.map(view => (
                                  <div key={view.id} className="aspect-square bg-slate-700 rounded overflow-hidden border border-emerald-500/30 group/view relative">
                                      <img src={view.imageUrl} className="w-full h-full object-cover opacity-80 group-hover/view:opacity-100 transition-opacity" title={view.name} />
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 mt-2">
                    <button
                      onClick={() => onGenerateSetting(setting.id)}
                      disabled={setting.isGenerating}
                      className="w-full py-2 bg-slate-700 hover:bg-emerald-600 text-white text-sm rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    >
                      {setting.imageUrl ? <RefreshCw className="w-4 h-4" /> : <Wand2 className="w-4 h-4" />}
                      {setting.imageUrl ? 'Regenerate Ref' : 'Generate Ref'}
                    </button>
                    
                    <div className="relative">
                        <input 
                            type="file" 
                            id={`upload-setting-${setting.id}`} 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => handleFileChange(e, 'setting', setting.id)}
                        />
                        <label 
                            htmlFor={`upload-setting-${setting.id}`}
                            className="w-full py-2 bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
                        >
                            <Upload className="w-3 h-3" />
                            Upload Image
                        </label>
                    </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default AssetGallery;
