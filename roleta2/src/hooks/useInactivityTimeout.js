import { useEffect, useRef } from 'react';

const INACTIVITY_LIMIT = 90 * 60 * 1000;

export const useInactivityTimeout = ({ isActive, onTimeout }) => {
  const timeoutRef  = useRef(null);
  const callbackRef = useRef(onTimeout);

  useEffect(() => { callbackRef.current = onTimeout; }, [onTimeout]);

  useEffect(() => {
    if (!isActive) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      return;
    }

    const reset = () => {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => callbackRef.current?.(), INACTIVITY_LIMIT);
    };

    const onBlur  = () => clearTimeout(timeoutRef.current);
    const onFocus = () => reset();

    reset();
    window.addEventListener('blur',       onBlur);
    window.addEventListener('focus',      onFocus);
    document.addEventListener('mousemove',  reset, { passive: true });
    document.addEventListener('mousedown',  reset, { passive: true });
    document.addEventListener('keydown',    reset, { passive: true });
    document.addEventListener('touchstart', reset, { passive: true });

    return () => {
      clearTimeout(timeoutRef.current);
      window.removeEventListener('blur',       onBlur);
      window.removeEventListener('focus',      onFocus);
      document.removeEventListener('mousemove',  reset);
      document.removeEventListener('mousedown',  reset);
      document.removeEventListener('keydown',    reset);
      document.removeEventListener('touchstart', reset);
    };
  }, [isActive]);
};
