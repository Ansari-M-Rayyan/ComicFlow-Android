import { useEffect, useMemo, useRef, useState } from 'react';

interface SlidingTitleProps {
  text: string;
  className?: string;
  duration?: number;
}

export function SlidingTitle({ text, className = '', duration }: SlidingTitleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [offset, setOffset] = useState(0);
  const [phase, setPhase] = useState<'idle-start' | 'sliding-end' | 'idle-end' | 'sliding-start'>('idle-start');

  // Measure overflow
  useEffect(() => {
    const measure = () => {
      const container = containerRef.current;
      const textNode = textRef.current;
      if (!container || !textNode) return;
      const diff = textNode.scrollWidth - container.clientWidth;
      setOffset(diff > 4 ? diff : 0);
    };

    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (observer) {
      if (containerRef.current) observer.observe(containerRef.current);
      if (textRef.current) observer.observe(textRef.current);
    }

    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [text]);

  // Calculate slide duration in ms (steady, readable scroll speed ~32px/sec, minimum 2s)
  const slideDuration = useMemo(() => {
    if (duration) return duration;
    return Math.max(2000, Math.round((offset / 32) * 1000));
  }, [offset, duration]);

  // Animation cycle
  useEffect(() => {
    setPhase('idle-start');
    if (offset <= 0) return;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let isCancelled = false;

    const runCycle = () => {
      // Step 1: Wait at start so title is readable
      setPhase('idle-start');
      timeoutId = setTimeout(() => {
        if (isCancelled) return;
        // Step 2: Slide to end
        setPhase('sliding-end');
        timeoutId = setTimeout(() => {
          if (isCancelled) return;
          // Step 3: Pause at end so ending is readable
          setPhase('idle-end');
          timeoutId = setTimeout(() => {
            if (isCancelled) return;
            // Step 4: Slide back to start
            setPhase('sliding-start');
            timeoutId = setTimeout(() => {
              if (isCancelled) return;
              // Loop
              runCycle();
            }, slideDuration);
          }, 2000);
        }, slideDuration);
      }, 2000);
    };

    runCycle();

    return () => {
      isCancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [offset, slideDuration]);

  // If no overflow, render standard text without any mask or transform
  if (offset <= 0) {
    return (
      <div ref={containerRef} className={`overflow-hidden whitespace-nowrap ${className}`}>
        <span ref={textRef} className="inline-block">
          {text}
        </span>
      </div>
    );
  }

  // Edge fade mask: soft gradient shadow effect on BOTH sides
  const maskImage = 'linear-gradient(to right, transparent 0px, black 24px, black calc(100% - 24px), transparent 100%)';

  const translateX = (phase === 'sliding-end' || phase === 'idle-end') ? -offset : 0;

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden whitespace-nowrap ${className}`}
      style={{
        maskImage,
        WebkitMaskImage: maskImage,
      }}
    >
      <span
        ref={textRef}
        className="inline-block"
        style={{
          transform: `translateX(${translateX}px)`,
          transition: `transform ${slideDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
          willChange: 'transform',
          paddingBottom: '0.12em',
        }}
      >
        {text}
      </span>
    </div>
  );
}
