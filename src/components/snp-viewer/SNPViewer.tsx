import React, { useEffect, useRef } from 'react';
import './SNPViewer.scss';

declare global {
  interface Window {
    $3Dmol: any;
  }
}

export const SNPViewer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !window.$3Dmol) return;

    const viewer = window.$3Dmol.createViewer(containerRef.current, {
      backgroundColor: 'black'
    });

    return () => {
      if (viewer) {
        try {
          viewer.clear();
        } catch (error) {
          console.error('Error cleaning up viewer:', error);
        }
      }
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      className="snp-viewer-container"
      style={{ width: '100%', height: '100%' }}
    />
  );
}; 