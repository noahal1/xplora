import { useEffect, useRef, useState, useMemo, useId } from 'react';

type BlurTextProps = {
  text?: string;
  delay?: number;
  className?: string;
  animateBy?: 'words' | 'letters';
  direction?: 'top' | 'bottom';
  threshold?: number;
  rootMargin?: string;
  stepDuration?: number;
};

const BlurText: React.FC<BlurTextProps> = ({
  text = '',
  delay = 200,
  className = '',
  animateBy = 'words',
  direction = 'top',
  threshold = 0.1,
  rootMargin = '0px',
  stepDuration = 0.35,
}) => {
  const elements = animateBy === 'words' ? text.split(' ') : text.split('');
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const uid = id.replace(/[^a-zA-Z0-9]/g, '_');

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.unobserve(ref.current as Element);
        }
      },
      { threshold, rootMargin }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  const keyframeName = `blur-text-${uid}-${direction}`;

  const keyframesStyle = useMemo(() => {
    const fromY = direction === 'top' ? '-30px' : '30px';
    return `@keyframes ${keyframeName} {
      0% { filter: blur(10px); opacity: 0; transform: translateY(${fromY}); }
      50% { filter: blur(5px); opacity: 0.5; transform: translateY(${direction === 'top' ? '3px' : '-3px'}); }
      100% { filter: blur(0px); opacity: 1; transform: translateY(0); }
    }`;
  }, [keyframeName, direction]);

  return (
    <>
      <style>{keyframesStyle}</style>
      <p ref={ref} className={`blur-text ${className} flex flex-wrap`}>
        {elements.map((segment, index) => (
          <span
            key={index}
            style={{
              display: 'inline-block',
              willChange: 'transform, filter, opacity',
              animation: inView
                ? `${keyframeName} ${stepDuration}s ease-out ${(index * delay) / 1000}s both`
                : 'none',
            }}
          >
            {segment === ' ' ? '\u00A0' : segment}
            {animateBy === 'words' && index < elements.length - 1 && '\u00A0'}
          </span>
        ))}
      </p>
    </>
  );
};

export default BlurText;
