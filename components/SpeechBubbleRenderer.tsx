import React from 'react';
import { SpeechBubble, BubbleType } from '../types';

interface SpeechBubbleRendererProps {
    bubbles: SpeechBubble[];
    imageWidth: number;
    imageHeight: number;
    language?: string; // Current display language
    translations?: Record<string, string>; // bubbleId -> translated text
}

const SpeechBubbleRenderer: React.FC<SpeechBubbleRendererProps> = ({
    bubbles,
    imageWidth,
    imageHeight,
    language = 'original',
    translations = {}
}) => {
    // Sort bubbles by reading order
    const sortedBubbles = [...bubbles].sort((a, b) => a.order - b.order);

    const renderBubblePath = (bubble: SpeechBubble, x: number, y: number, width: number, height: number): string => {
        const radius = 12;

        switch (bubble.bubbleType) {
            case 'speech':
                // Rounded rectangle with tail
                return `
                    M ${x - width/2 + radius},${y - height/2}
                    L ${x + width/2 - radius},${y - height/2}
                    Q ${x + width/2},${y - height/2} ${x + width/2},${y - height/2 + radius}
                    L ${x + width/2},${y + height/2 - radius}
                    Q ${x + width/2},${y + height/2} ${x + width/2 - radius},${y + height/2}
                    L ${x - width/2 + radius},${y + height/2}
                    Q ${x - width/2},${y + height/2} ${x - width/2},${y + height/2 - radius}
                    L ${x - width/2},${y - height/2 + radius}
                    Q ${x - width/2},${y - height/2} ${x - width/2 + radius},${y - height/2}
                    Z
                `;

            case 'thought':
                // Cloud-like shape
                return `
                    M ${x - width/2 + radius},${y - height/2}
                    Q ${x - width/2},${y - height/2} ${x - width/2},${y - height/2 + radius}
                    Q ${x - width/2 - 5},${y - height/2 + radius/2} ${x - width/2},${y - height/2 + radius*1.5}
                    L ${x - width/2},${y + height/2 - radius*1.5}
                    Q ${x - width/2 - 5},${y + height/2 - radius/2} ${x - width/2},${y + height/2 - radius}
                    Q ${x - width/2},${y + height/2} ${x - width/2 + radius},${y + height/2}
                    L ${x + width/2 - radius},${y + height/2}
                    Q ${x + width/2},${y + height/2} ${x + width/2},${y + height/2 - radius}
                    Q ${x + width/2 + 5},${y + height/2 - radius/2} ${x + width/2},${y + height/2 - radius*1.5}
                    L ${x + width/2},${y - height/2 + radius*1.5}
                    Q ${x + width/2 + 5},${y - height/2 + radius/2} ${x + width/2},${y - height/2 + radius}
                    Q ${x + width/2},${y - height/2} ${x + width/2 - radius},${y - height/2}
                    Z
                `;

            case 'narration':
                // Sharp rectangle
                return `
                    M ${x - width/2},${y - height/2}
                    L ${x + width/2},${y - height/2}
                    L ${x + width/2},${y + height/2}
                    L ${x - width/2},${y + height/2}
                    Z
                `;

            case 'shout':
            case 'scream':
                // Spiky/jagged bubble
                const spikes = 8;
                let path = `M ${x - width/2},${y - height/2 + 5}`;
                for (let i = 0; i <= spikes; i++) {
                    const angle = (i / spikes) * Math.PI * 2;
                    const radiusVar = i % 2 === 0 ? 1 : 0.9;
                    const px = x + Math.cos(angle - Math.PI / 2) * (width / 2) * radiusVar;
                    const py = y + Math.sin(angle - Math.PI / 2) * (height / 2) * radiusVar;
                    path += ` L ${px},${py}`;
                }
                path += ' Z';
                return path;

            case 'whisper':
                // Dashed border rounded rectangle (same as speech)
                return renderBubblePath({ ...bubble, bubbleType: 'speech' }, x, y, width, height);

            default:
                return renderBubblePath({ ...bubble, bubbleType: 'speech' }, x, y, width, height);
        }
    };

    const renderTail = (bubble: SpeechBubble, x: number, y: number, width: number, height: number): JSX.Element | null => {
        if (bubble.tailDirection === 'none') return null;

        const tailLength = 20;
        let tailPath = '';

        switch (bubble.tailDirection) {
            case 'bottom-left':
                tailPath = `M ${x - width/4},${y + height/2} L ${x - width/2 - 10},${y + height/2 + tailLength} L ${x - width/4 + 10},${y + height/2}`;
                break;
            case 'bottom-right':
                tailPath = `M ${x + width/4},${y + height/2} L ${x + width/2 + 10},${y + height/2 + tailLength} L ${x + width/4 - 10},${y + height/2}`;
                break;
            case 'top-left':
                tailPath = `M ${x - width/4},${y - height/2} L ${x - width/2 - 10},${y - height/2 - tailLength} L ${x - width/4 + 10},${y - height/2}`;
                break;
            case 'top-right':
                tailPath = `M ${x + width/4},${y - height/2} L ${x + width/2 + 10},${y - height/2 - tailLength} L ${x + width/4 - 10},${y - height/2}`;
                break;
            case 'left':
                tailPath = `M ${x - width/2},${y} L ${x - width/2 - tailLength},${y} L ${x - width/2},${y + 10}`;
                break;
            case 'right':
                tailPath = `M ${x + width/2},${y} L ${x + width/2 + tailLength},${y} L ${x + width/2},${y + 10}`;
                break;
        }

        return (
            <path
                d={tailPath}
                fill={bubble.style?.backgroundColor || '#ffffff'}
                stroke={bubble.style?.borderColor || '#000000'}
                strokeWidth="2"
            />
        );
    };

    return (
        <svg
            width={imageWidth}
            height={imageHeight}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
            xmlns="http://www.w3.org/2000/svg"
        >
            {sortedBubbles.map((bubble) => {
                // Convert percentage to pixels
                const x = (bubble.position.x / 100) * imageWidth;
                const y = (bubble.position.y / 100) * imageHeight;
                const width = ((bubble.size?.width || 25) / 100) * imageWidth;
                const height = ((bubble.size?.height || 15) / 100) * imageHeight;

                // Get translated text if available
                const displayText = translations[bubble.id] || bubble.text;

                // Calculate responsive font size based on bubble size and text length
                const baseFontSize = (bubble.style?.fontSize || 1) * 14;
                const textLength = displayText.length;
                let fontSize = baseFontSize;

                // Scale down font for very long text in small bubbles
                if (textLength > 60 && width < 120) {
                    fontSize = baseFontSize * 0.85;
                } else if (textLength > 40 && width < 100) {
                    fontSize = baseFontSize * 0.9;
                }

                const textColor = bubble.style?.textColor || '#000000';
                const backgroundColor = bubble.style?.backgroundColor || '#ffffff';
                const borderColor = bubble.style?.borderColor || '#000000';

                return (
                    <g key={bubble.id}>
                        {/* Tail */}
                        {renderTail(bubble, x, y, width, height)}

                        {/* Bubble shape */}
                        <path
                            d={renderBubblePath(bubble, x, y, width, height)}
                            fill={backgroundColor}
                            stroke={borderColor}
                            strokeWidth={bubble.bubbleType === 'shout' || bubble.bubbleType === 'scream' ? '3' : '2'}
                            strokeDasharray={bubble.bubbleType === 'whisper' ? '5,5' : 'none'}
                        />

                        {/* Text */}
                        <foreignObject
                            x={x - width / 2 + 10}
                            y={y - height / 2 + 10}
                            width={width - 20}
                            height={height - 20}
                        >
                            <div
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: `${fontSize}px`,
                                    fontWeight: bubble.bubbleType === 'shout' || bubble.bubbleType === 'scream' ? 'bold' : 'normal',
                                    fontStyle: bubble.bubbleType === 'thought' ? 'italic' : 'normal',
                                    color: textColor,
                                    textAlign: 'center',
                                    padding: '6px',
                                    wordWrap: 'break-word',
                                    overflowWrap: 'break-word',
                                    wordBreak: 'break-word',
                                    fontFamily: 'Arial, sans-serif',
                                    lineHeight: '1.2',
                                    overflow: 'hidden'
                                }}
                            >
                                {displayText}
                            </div>
                        </foreignObject>

                        {/* Reading order indicator (small number in corner) */}
                        <circle
                            cx={x + width/2 - 10}
                            cy={y - height/2 + 10}
                            r="8"
                            fill="#4f46e5"
                            opacity="0.7"
                        />
                        <text
                            x={x + width/2 - 10}
                            y={y - height/2 + 14}
                            fontSize="10"
                            fill="#ffffff"
                            textAnchor="middle"
                            fontWeight="bold"
                        >
                            {bubble.order}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
};

export default SpeechBubbleRenderer;
