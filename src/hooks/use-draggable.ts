import { useRef, useState, useEffect } from 'react';

interface Position {
  x: number;
  y: number;
}

interface SnapEdge {
  position: 'left' | 'right' | 'top' | 'bottom';
  offset: number;
}

export const useDraggable = (
  elementRef: React.RefObject<HTMLElement>,
  initialPosition: Position,
  snapThreshold: number = 20
) => {
  const [position, setPosition] = useState<Position>(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [snappedEdge, setSnappedEdge] = useState<SnapEdge | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (!elementRef.current) return;

    const element = elementRef.current;

    const handleMouseDown = (e: Event) => {
      const mouseEvent = e as MouseEvent;
      if ((mouseEvent.target as HTMLElement).closest('button, input, textarea')) return;
      
      const rect = element.getBoundingClientRect();
      dragStartRef.current = {
        x: mouseEvent.clientX,
        y: mouseEvent.clientY,
        startX: rect.left,
        startY: rect.top
      };
      setIsDragging(true);
      element.style.transition = 'none';
    };

    const updatePosition = (newX: number, newY: number) => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        // Calculate distances to edges
        const distanceLeft = newX;
        const distanceRight = windowWidth - (newX + rect.width);
        const distanceTop = newY;
        const distanceBottom = windowHeight - (newY + rect.height);

        let finalX = newX;
        let finalY = newY;
        let edge: SnapEdge | null = null;

        // Snap to closest edge if within threshold
        if (distanceLeft <= snapThreshold && distanceLeft <= distanceRight) {
          finalX = 0;
          edge = { position: 'left', offset: finalY };
        } else if (distanceRight <= snapThreshold) {
          finalX = windowWidth - rect.width;
          edge = { position: 'right', offset: finalY };
        }

        if (distanceTop <= snapThreshold && distanceTop <= distanceBottom) {
          finalY = 0;
          edge = { position: 'top', offset: finalX };
        } else if (distanceBottom <= snapThreshold) {
          finalY = windowHeight - rect.height;
          edge = { position: 'bottom', offset: finalX };
        }

        setPosition({ x: finalX, y: finalY });
        setSnappedEdge(edge);
      });
    };

    const handleMouseMove = (e: Event) => {
      if (!isDragging || !dragStartRef.current) return;
      const mouseEvent = e as MouseEvent;

      const dx = mouseEvent.clientX - dragStartRef.current.x;
      const dy = mouseEvent.clientY - dragStartRef.current.y;
      const newX = dragStartRef.current.startX + dx;
      const newY = dragStartRef.current.startY + dy;

      updatePosition(newX, newY);
    };

    const handleMouseUp = () => {
      dragStartRef.current = null;
      setIsDragging(false);
      element.style.transition = 'transform 0.2s ease-out';
    };

    // Add drag handle to the element
    const dragHandle = element.querySelector('.drag-handle') || element;
    dragHandle.addEventListener('mousedown', handleMouseDown as EventListener);
    window.addEventListener('mousemove', handleMouseMove as EventListener);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      dragHandle.removeEventListener('mousedown', handleMouseDown as EventListener);
      window.removeEventListener('mousemove', handleMouseMove as EventListener);
      window.removeEventListener('mouseup', handleMouseUp);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [elementRef, isDragging, snapThreshold]);

  return { position, isDragging, snappedEdge, setPosition };
}; 