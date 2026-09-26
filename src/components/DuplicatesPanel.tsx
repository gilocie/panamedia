import { useState } from 'react';
import { Trash2, Copy, Music, Video, FileText, Folder, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface FileItem {
  name: string;
  path: string;
  size: number;
  mtime: number;
  category: string;
}

interface DuplicatesPanelProps {
  libraryFiles: FileItem[];
  duplicateDeletePaths: string[];
  toggleDuplicateDelete: (path: string) => void;
  handleResolveDuplicates: () => void;
  onClose: () => void;
}

function formatBytes(bytes: number, decimals = 2) {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function getNormalizedName(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, '') // remove extension
    .replace(/(_\d+|\(\d+\))/g, '') // remove trailing (1) or _1
    .trim()
    .toLowerCase();
}

export function DuplicatesPanel({
  libraryFiles,
  duplicateDeletePaths,
  toggleDuplicateDelete,
  handleResolveDuplicates,
  onClose
}: DuplicatesPanelProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 9;

  // Group library files by normalized name
  const groupsMap = new Map<string, FileItem[]>();
  libraryFiles.forEach(file => {
    const key = getNormalizedName(file.name);
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key)!.push(file);
  });

  // Filter groups that have actual duplicates (more than 1 file)
  const duplicateGroups = Array.from(groupsMap.entries())
    .filter(([, files]) => files.length > 1)
    .sort(([a], [b]) => a.localeCompare(b));

  const totalGroups = duplicateGroups.length;
  const totalPages = Math.ceil(totalGroups / itemsPerPage) || 1;

  // Paginated groups
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedGroups = duplicateGroups.slice(startIndex, startIndex + itemsPerPage);

  const getFileIcon = (filename: string) => {
    const ext = '.' + (filename.split('.').pop() || '').toLowerCase();
    if (['.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg'].includes(ext)) {
      return <Music size={22} style={{ color: '#a5b4fc' }} />;
    } else if (['.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv'].includes(ext)) {
      return <Video size={22} style={{ color: '#c084fc' }} />;
    }
    return <FileText size={22} style={{ color: '#94a3b8' }} />;
  };

  const getFileTypeName = (filename: string) => {
    const ext = '.' + (filename.split('.').pop() || '').toLowerCase();
    if (['.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg'].includes(ext)) {
      return 'MP3 AUDIO';
    } else if (['.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv'].includes(ext)) {
      return 'VIDEO';
    }
    return 'FILE';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: '20px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'space-between', justifyContent: 'space-between', marginBottom: '20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Copy size={20} style={{ color: '#ef4444' }} />
          </div>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: '800', color: '#fff', margin: 0 }}>Duplicate File Manager</h2>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              {totalGroups} duplicate groups found &bull; {duplicateDeletePaths.length} files selected for deletion
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {duplicateDeletePaths.length > 0 && (
            <button
              onClick={handleResolveDuplicates}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)'
              }}
            >
              <Trash2 size={14} />
              Delete {duplicateDeletePaths.length} Files
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Grid Content */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', alignContent: 'start', paddingRight: '4px' }}>
        {paginatedGroups.map(([normName, files]) => {
          const sorted = [...files].sort((a, b) => (a.mtime || 0) - (b.mtime || 0));
          const newestMtime = Math.max(...files.map(f => f.mtime || 0));
          const groupTitle = files[0]?.name || normName;

          return (
            <div
              key={normName}
              style={{
                background: 'rgba(255, 255, 255, 0.01)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '12px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}
            >
              {/* Group Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.04)', paddingBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                  <Copy size={11} style={{ color: '#ef4444', flexShrink: 0 }} />
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={groupTitle}>
                    {groupTitle}
                  </span>
                </div>
                <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: '4px', flexShrink: 0 }}>
                  {files.length} copies
                </span>
              </div>

              {/* Files sub-grid */}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${files.length}, 1fr)`, gap: '10px' }}>
                {sorted.map((file, idx) => {
                  const checked = duplicateDeletePaths.includes(file.path);
                  const isNewest = file.mtime === newestMtime;
                  
                  // Extract parent directory name
                  const parts = file.path.split(/[\\/]/);
                  const parentFolder = parts.length > 1 ? parts[parts.length - 2] : 'Default';

                  // Determine badge
                  let badgeText = '✓ KEEP';
                  let badgeStyle = { background: 'rgba(74, 222, 128, 0.15)', color: '#4ade80', border: '1px solid rgba(74, 222, 128, 0.25)' };

                  if (checked) {
                    badgeText = '🗑 DELETE';
                    badgeStyle = { background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.25)' };
                  } else if (!isNewest) {
                    badgeText = '▲ OLDER';
                    badgeStyle = { background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.25)' };
                  }

                  return (
                    <div key={`${file.path}-${idx}`} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {/* Top Checkbox & Badge */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDuplicateDelete(file.path)}
                          style={{ cursor: 'pointer', accentColor: '#ef4444', width: '13px', height: '13px' }}
                        />
                        <span style={{ fontSize: '8px', fontWeight: 'bold', padding: '1px 5px', borderRadius: '3px', ...badgeStyle }}>
                          {badgeText}
                        </span>
                      </div>

                      {/* Middle Preview Box */}
                      <div style={{
                        height: '74px',
                        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(168, 85, 247, 0.12) 100%)',
                        borderRadius: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        border: '1px solid rgba(255,255,255,0.03)',
                        position: 'relative'
                      }}>
                        {getFileIcon(file.name)}
                        <span style={{ fontSize: '8px', fontWeight: 'bold', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.5px' }}>
                          {getFileTypeName(file.name)}
                        </span>
                      </div>

                      {/* Details Footer */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        <div style={{ fontSize: '9px', fontWeight: '600', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.name}>
                          {file.name}
                        </div>
                        <div style={{ display: 'flex', gap: '4px', fontSize: '8px', color: 'rgba(255,255,255,0.35)' }}>
                          <span>{formatBytes(file.size)}</span>
                          <span>&bull;</span>
                          <span>{file.mtime ? new Date(file.mtime).toLocaleDateString() : '?'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '8px', color: 'rgba(255,255,255,0.35)', marginTop: '1px' }}>
                          <Folder size={8} style={{ color: 'rgba(255,255,255,0.4)' }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px' }}>{parentFolder.toUpperCase()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.04)', paddingTop: '12px', flexShrink: 0 }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Page {currentPage} of {totalPages} &bull; Showing {paginatedGroups.length} groups
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 12px',
              borderRadius: '6px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: currentPage === 1 ? 'rgba(255,255,255,0.2)' : '#fff',
              fontSize: '11px',
              cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              outline: 'none'
            }}
          >
            <ChevronLeft size={12} />
            Previous
          </button>
          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 12px',
              borderRadius: '6px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: currentPage === totalPages ? 'rgba(255,255,255,0.2)' : '#fff',
              fontSize: '11px',
              cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              outline: 'none'
            }}
          >
            Next
            <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}