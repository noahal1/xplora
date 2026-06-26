import * as React from 'react';
import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface FadeContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  container?: Element | string | null;
  /** Apply blur filter on enter (FadeContent). @default false */
  blur?: boolean;
  /** Scroll-triggered translate distance in px (AnimatedContent). @default 100 */
  distance?: number;
  /** Direction of scroll-triggered translate (AnimatedContent). @default 'vertical' */
  direction?: 'vertical' | 'horizontal';
  /** Reverse the translate direction (AnimatedContent). @default false */
  reverse?: boolean;
  /** Animate opacity (AnimatedContent). @default true */
  animateOpacity?: boolean;
  /** Initial scale (AnimatedContent). @default 1 */
  scale?: number;
  /** Animation duration in seconds (AnimatedContent) or ms (FadeContent). Auto-detected. @default 0.8 */
  duration?: number;
  /** GSAP ease string. @default 'power3.out' */
  ease?: string;
  /** Delay before animation in seconds (or ms if >10). @default 0 */
  delay?: number;
  /** IntersectionObserver threshold (0–1). @default 0.1 */
  threshold?: number;
  /** Initial opacity (0–1). @default 0 */
  initialOpacity?: number;
  /** Seconds after entrance to trigger disappear animation (0 = disabled). @default 0 */
  disappearAfter?: number;
  /** Duration of the disappear animation. @default 0.5 */
  disappearDuration?: number;
  /** GSAP ease for the disappear animation. @default 'power3.in' */
  disappearEase?: string;
  /** Callback on enter animation complete. */
  onComplete?: () => void;
  /** Callback on disappear animation complete. */
  onDisappearanceComplete?: () => void;
}

const FadeContent = React.forwardRef<HTMLDivElement, FadeContentProps>(({
  children,
  container,
  blur = false,
  distance = 100,
  direction = 'vertical',
  reverse = false,
  animateOpacity = true,
  scale = 1,
  duration = 0.8,
  ease = 'power3.out',
  delay = 0,
  threshold = 0.1,
  initialOpacity = 0,
  disappearAfter = 0,
  disappearDuration = 0.5,
  disappearEase = 'power3.in',
  onComplete,
  onDisappearanceComplete,
  className = '',
  ...props
}, ref) => {
  const internalRef = useRef<HTMLDivElement>(null);

  // Merge the forwarded ref with the internal ref
  const setRefs = (el: HTMLDivElement | null) => {
    internalRef.current = el;
    if (typeof ref === 'function') {
      ref(el);
    } else if (ref) {
      ref.current = el;
    }
  };

  useEffect(() => {
    const el = internalRef.current;
    if (!el) return;

    let scrollerTarget: Element | string | null = container || document.getElementById('snap-main-container') || null;

    if (typeof scrollerTarget === 'string') {
      scrollerTarget = document.querySelector(scrollerTarget);
    }

    const startPct = (1 - threshold) * 100;
    const getSeconds = (val: number) => (val > 10 ? val / 1000 : val);
    const axis = direction === 'horizontal' ? 'x' : 'y';
    const offset = reverse ? -distance : distance;

    // Initial state
    const from: gsap.TweenVars = {
      autoAlpha: animateOpacity ? initialOpacity : 1,
      filter: blur ? 'blur(10px)' : 'blur(0px)',
      willChange: 'opacity, filter, transform',
    };
    if (scale !== 1) from.scale = scale;
    if (distance !== 0) from[axis] = offset;

    gsap.set(el, from);

    // Build the "to" state
    const to: gsap.TweenVars = {
      autoAlpha: 1,
      filter: 'blur(0px)',
      duration: getSeconds(duration),
      ease,
    };
    if (scale !== 1) to.scale = 1;
    if (distance !== 0) to[axis] = 0;

    const tl = gsap.timeline({
      paused: true,
      delay: getSeconds(delay),
      onComplete: () => {
        if (onComplete) onComplete();
        if (disappearAfter > 0) {
          const disappearTo: gsap.TweenVars = {
            autoAlpha: animateOpacity ? initialOpacity : 0,
            filter: blur ? 'blur(10px)' : 'blur(0px)',
            delay: getSeconds(disappearAfter),
            duration: getSeconds(disappearDuration),
            ease: disappearEase,
            onComplete: () => onDisappearanceComplete?.(),
          };
          if (scale !== 1) disappearTo.scale = 0.8;
          if (distance !== 0) disappearTo[axis] = reverse ? distance : -distance;
          gsap.to(el, disappearTo);
        }
      },
    });

    tl.to(el, to);

    const st = ScrollTrigger.create({
      trigger: el,
      scroller: scrollerTarget || window,
      start: `top ${startPct}%`,
      once: true,
      onEnter: () => tl.play(),
    });

    return () => {
      st.kill();
      tl.kill();
      gsap.killTweensOf(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={setRefs} className={className} {...props}>
      {children}
    </div>
  );
});

FadeContent.displayName = 'FadeContent';

export default FadeContent;
