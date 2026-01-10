import React from 'react';
import { TextPanel, TextPanelType } from '../types';

interface TextPanelRendererProps {
    panels: TextPanel[];
    position: 'before' | 'after'; // Which position to render
    translations?: Record<string, string>; // panelId -> translated text
}

const TextPanelRenderer: React.FC<TextPanelRendererProps> = ({
    panels,
    position,
    translations = {}
}) => {
    // Filter panels by position and sort by order
    const filteredPanels = panels
        .filter(p => p.position === position)
        .sort((a, b) => a.order - b.order);

    if (filteredPanels.length === 0) return null;

    const getTypeIcon = (type: TextPanelType): string => {
        switch (type) {
            case 'narration': return '';
            case 'inner_thought': return '💭';
            case 'dialogue': return '💬';
            case 'system': return '⚙️';
            case 'sfx': return '💥';
            default: return '';
        }
    };

    const getTypeLabel = (type: TextPanelType): string => {
        switch (type) {
            case 'narration': return 'Narration';
            case 'inner_thought': return 'Thought';
            case 'dialogue': return 'Dialogue';
            case 'system': return 'System';
            case 'sfx': return 'SFX';
            default: return '';
        }
    };

    return (
        <div className="w-full flex flex-col">
            {filteredPanels.map((panel) => {
                const displayText = translations[panel.id] || panel.text;
                const { style } = panel;

                return (
                    <div
                        key={panel.id}
                        className="w-full"
                        style={{
                            backgroundColor: style.backgroundColor,
                            borderLeft: panel.type === 'dialogue' ? '4px solid #3b82f6' :
                                        panel.type === 'inner_thought' ? '4px solid #8b5cf6' :
                                        panel.type === 'system' ? '4px solid #10b981' : 'none',
                        }}
                    >
                        <div className="px-6 py-4">
                            {/* Speaker label for dialogue/thoughts */}
                            {panel.speaker && (panel.type === 'dialogue' || panel.type === 'inner_thought') && (
                                <div
                                    className="text-xs font-bold mb-1 uppercase tracking-wide"
                                    style={{
                                        color: panel.type === 'dialogue' ? '#3b82f6' : '#8b5cf6'
                                    }}
                                >
                                    {getTypeIcon(panel.type)} {panel.speaker}
                                </div>
                            )}

                            {/* System type badge */}
                            {panel.type === 'system' && (
                                <div className="text-xs font-mono text-emerald-400 mb-1">
                                    {getTypeIcon(panel.type)} SYSTEM
                                </div>
                            )}

                            {/* Text content */}
                            <p
                                style={{
                                    color: style.textColor,
                                    fontStyle: style.fontStyle,
                                    fontWeight: style.fontWeight,
                                    textAlign: style.textAlign,
                                    fontFamily: panel.type === 'system' ? 'monospace' : 'inherit',
                                }}
                                className={`
                                    text-base leading-relaxed
                                    ${panel.type === 'narration' ? 'text-lg' : ''}
                                    ${panel.type === 'inner_thought' ? 'text-base' : ''}
                                    ${panel.type === 'sfx' ? 'text-2xl font-black' : ''}
                                `}
                            >
                                {panel.type === 'inner_thought' && '"'}
                                {displayText}
                                {panel.type === 'inner_thought' && '"'}
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default TextPanelRenderer;
