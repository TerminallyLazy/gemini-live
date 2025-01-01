import React from 'react';
import './SNPViewer.scss';

interface SNP {
  id: string;
  position: {
    chainId: string;
    resNum: number;
    x: number;
    y: number;
    z: number;
  };
  wildtype: string;
  mutation: string;
  effect: string;
  description?: string;
}

interface SNPViewerProps {
  snps: SNP[];
  onSNPClick: (snp: SNP) => void;
  selectedSNP?: string;
  currentViewer: 'ngl' | '3dmol';
}

export const SNPViewer: React.FC<SNPViewerProps> = ({
  snps,
  onSNPClick,
  selectedSNP,
  currentViewer
}) => {
  const getEffectIcon = (effect: string) => {
    switch (effect.toLowerCase()) {
      case 'pathogenic':
        return '⚠️';
      case 'benign':
        return '✓';
      case 'uncertain':
        return '?';
      default:
        return '•';
    }
  };

  return (
    <div className="snp-viewer">
      <div className="snp-header">
        <h3>
          SNP Variants
          <span className="snp-count">{snps.length} found</span>
        </h3>
      </div>
      <div className="snp-list">
        {snps.map((snp) => (
          <div
            key={snp.id}
            className={`snp-item ${selectedSNP === snp.id ? 'selected' : ''}`}
            onClick={() => onSNPClick(snp)}
            title="Click to view on structure"
          >
            <div className="snp-main-info">
              <span className="snp-id">{snp.id}</span>
              <span className="snp-mutation">
                {snp.wildtype} → {snp.mutation}
              </span>
              <span className="snp-position">
                Chain {snp.position.chainId}:{snp.position.resNum}
              </span>
            </div>
            <div className="snp-effect" data-effect={snp.effect.toLowerCase()}>
              {getEffectIcon(snp.effect)} {snp.effect}
            </div>
            {snp.description && (
              <div className="snp-description">{snp.description}</div>
            )}
            {selectedSNP === snp.id && (
              <div className="snp-details">
                <div className="snp-detail-item">
                  <span className="label">Position:</span>
                  <span className="value">Chain {snp.position.chainId}, Residue {snp.position.resNum}</span>
                </div>
                <div className="snp-detail-item">
                  <span className="label">Change:</span>
                  <span className="value">{snp.wildtype} to {snp.mutation}</span>
                </div>
                <div className="snp-detail-item">
                  <span className="label">Viewer:</span>
                  <span className="value">{currentViewer.toUpperCase()}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}; 