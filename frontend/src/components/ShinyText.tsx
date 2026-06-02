import { useRef } from 'react';

interface ShinyTextProps {
  text: string;
  disabled?: boolean;
  speed?: number;
  className?: string;
  color?: string;
  shineColor?: string;
  spread?: number;
  pauseOnHover?: boolean;
  direction?: 'left' | 'right';
}

const ShinyText: React.FC<ShinyTextProps> = ({
  text,
  disabled = false,
  speed = 2,
  className = '',
  color = '#b5b5b5',
  shineColor = '#ffffff',
  spread = 120,
  pauseOnHover = false,
  direction = 'left',
}) => {
  const spanRef = useRef<HTMLSpanElement>(null);

  const gradientStyle: React.CSSProperties = {
    backgroundImage: `linear-gradient(${spread}deg, ${color} 0%, ${color} 35%, ${shineColor} 50%, ${color} 65%, ${color} 100%)`,
    backgroundSize: '200% auto',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    animation: disabled
      ? 'none'
      : `shimmer-slide ${speed}s ease-in-out infinite${direction === 'right' ? ' reverse' : ''}`,
  };

  const handleMouseEnter = () => {
    if (pauseOnHover && spanRef.current) {
      spanRef.current.style.animationPlayState = 'paused';
    }
  };

  const handleMouseLeave = () => {
    if (pauseOnHover && spanRef.current) {
      spanRef.current.style.animationPlayState = 'running';
    }
  };

  return (
    <span
      ref={spanRef}
      className={`inline-block ${className}`}
      style={gradientStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {text}
    </span>
  );
};

export default ShinyText;
