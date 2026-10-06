import React, { useState } from 'react';
import { Film } from 'lucide-react';

interface MediaToolPreviewProps {
  fileName: string;
  streamingPort?: number;
  className?: string;
  imageStyle?: React.CSSProperties;
  cropAspectRatio?: string;
  watermarkText?: string;
  watermarkPosition?: string;
  watermarkOpacity?: number;
  watermarkIsImage?: boolean;
  note?: string;
  /** HUD chips / overlays drawn on top of the frame. */
  overlay?: React.ReactNode;
  style?: React.CSSProperties;
}

export const MediaToolPreview: React.FC<MediaToolPreviewProps> = ({
  fileName,
  streamingPort = 52322,
  className = '',
  imageStyle,
  cropAspectRatio,
  watermarkText,
  watermarkPosition = 'bottom-right',
  watermarkOpacity = 80,
  watermarkIsImage = false,
  note = 'Source frame',
  overlay,
  style
}) => {
  const [failed, setFailed] = useState(false);
  const thumbnailUrl = `http://127.0.0.1:${streamingPort}/thumbnail?path=${encodeURIComponent(fileName)}`;
  const basename = fileName.split(/[\\/]/).pop() || fileName;

  return (
    <div
      className={`converter-tool-preview ${className}`}
      role="img"
      aria-label={`${note} for ${basename}`}
      style={style}
    >
      {!failed && (
        <img
          src={thumbnailUrl}
          alt=""
          onError={() => setFailed(true)}
          style={imageStyle}
        />
      )}
      {failed && (
        <div className="converter-tool-preview__empty">
          <Film size={20} />
          <span>Frame preview unavailable</span>
        </div>
      )}
      {cropAspectRatio && (
        <div
          className="converter-tool-preview__crop"
          style={{ aspectRatio: cropAspectRatio }}
          aria-hidden="true"
        >
          <i />
          <i />
        </div>
      )}
      {watermarkText && (
        <div
          className={`converter-tool-preview__watermark converter-tool-preview__watermark--${watermarkPosition}`}
          style={{ opacity: watermarkOpacity / 100 }}
        >
          {watermarkIsImage ? <span className="converter-tool-preview__logo">LOGO</span> : watermarkText}
        </div>
      )}
      {overlay}
      <div className="converter-tool-preview__caption">
        <span>{note}</span>
        <span title={basename}>{basename}</span>
      </div>
    </div>
  );
};
