
'use client';
import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Play, Calendar, List, ChevronRight, AlertCircle, Loader2, RefreshCcw } from 'lucide-react';
import './globals.css';

const ReactPlayer = dynamic(() => import('react-player'), { ssr: false });

// MOCK DATA - To be replaced with automated scraping later
const MATCH_DATA = {
  'Week 26': [
    { id: 'gs-ank', title: 'Ankaragücü 0-3 Galatasaray', url: 'https://beinsports.com.tr/mac-ozetleri-goller/super-lig/ozet/2023-2024/26/mke-ankaragucu-0-3-galatasaray-mac-ozeti' },
    { id: 'bjk-kon', title: 'Beşiktaş 2-0 Konyaspor', url: 'https://beinsports.com.tr/mac-ozetleri-goller/super-lig/ozet/2023-2024/26/besiktas-2-0-tumosan-konyaspor-mac-ozeti' },
    { id: 'fb-rizespor', title: 'Çaykur Rizespor 1-3 Fenerbahçe', url: 'https://beinsports.com.tr/mac-ozetleri-goller/super-lig/ozet/2023-2024/26/caykur-rizespor-1-3-fenerbahce-mac-ozeti' },
  ],
  'Week 25': [
    { id: 'gs-basak', title: 'Galatasaray 2-0 Başakşehir', url: 'https://beinsports.com.tr/mac-ozetleri-goller/super-lig/ozet/2023-2024/25/galatasaray-2-0-istanbul-basaksehir-mac-ozeti' },
    { id: 'fb-alanya', title: 'Fenerbahçe 2-2 Alanyaspor', url: 'https://beinsports.com.tr/mac-ozetleri-goller/super-lig/ozet/2023-2024/25/fenerbahce-2-2-alanyaspor-mac-ozeti' },
  ]
};

export default function Home() {
  const [selectedWeek, setSelectedWeek] = useState('Week 26');
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [videoData, setVideoData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const playerRef = useRef(null);

  useEffect(() => {
    // Reset playing state when video changes
    setIsPlaying(false);
  }, [videoData]);

  const fetchVideoSource = async (match) => {
    // If clicking the same match, do nothing unless it failed
    if (selectedMatch?.id === match.id && !error) return;

    setLoading(true);
    setError(null);
    setVideoData(null);
    setSelectedMatch(match);

    try {
      const res = await fetch(`/api/scrape?url=${encodeURIComponent(match.url)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load video');
      }

      console.log('Video Data Loaded:', data);
      setVideoData(data);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Play fill="white" size={20} />
          Mac Özeti
        </h2>

        {/* Week Selector */}
        <div className="week-selector">
          <label className="dropdown-label"><Calendar size={14} style={{ display: 'inline', marginRight: '4px' }} /> Hafta Seçin</label>
          <select
            className="dropdown"
            value={selectedWeek}
            onChange={(e) => {
              setSelectedWeek(e.target.value);
              setSelectedMatch(null);
              setVideoData(null);
              setIsPlaying(false);
            }}
          >
            {Object.keys(MATCH_DATA).map(week => (
              <option key={week} value={week}>{week}</option>
            ))}
          </select>
        </div>

        {/* Match List */}
        <div className="match-list">
          <label className="dropdown-label"><List size={14} style={{ display: 'inline', marginRight: '4px' }} /> Maçlar</label>
          {MATCH_DATA[selectedWeek]?.map((match) => (
            <div
              key={match.id}
              className={`match-card ${selectedMatch?.id === match.id ? 'active' : ''}`}
              onClick={() => {
                fetchVideoSource(match);
                setIsPlaying(false);
              }}
            >
              <div className="match-title">{match.title}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {selectedMatch ? (
          <div style={{ width: '100%', maxWidth: '1000px' }}>
            <h1>{videoData?.title || selectedMatch.title}</h1>

            <div className="video-container">
              {loading && (
                <div className="loading-spinner"></div>
              )}

              {error && (
                <div style={{ color: '#ef4444', textAlign: 'center', padding: '2rem' }}>
                  <AlertCircle size={48} style={{ margin: '0 auto 1rem' }} />
                  <p>{error}</p>
                  <p style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '0.5rem' }}>
                    Orijinal linke yönlendiriliyorsunuz...
                  </p>
                  <a href={selectedMatch.url} target="_blank" rel="noopener noreferrer" className="retry-btn">
                    beIN Sports'ta İzle
                  </a>
                </div>
              )}

              {!loading && !error && videoData && (
                videoData.videoType === 'iframe' ? (
                  <iframe
                    src={videoData.videoSource}
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    allowFullScreen
                    style={{ position: 'absolute', top: 0, left: 0 }}
                  />
                ) : (
                  <div style={{ width: '100%', height: '100%', position: 'relative', background: '#000' }}>
                    {/* Try native video tag first as it is more robust for direct MP4 */}
                    <video
                      key={videoData.videoSource}
                      controls
                      autoPlay
                      playsInline
                      width="100%"
                      height="100%"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      crossOrigin="anonymous"
                    >
                      <source src={videoData.videoSource} type="video/mp4" />
                      Your browser does not support the video tag.
                    </video>

                    <div style={{ position: 'absolute', bottom: -30, right: 0, fontSize: '0.8rem', color: '#666' }}>
                      Source: {videoData.videoType}
                    </div>
                  </div>

                )
              )}
            </div>
          </div>
        ) : (
          <div className="placeholder">
            <Play size={64} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Özet İzle</h2>
            <p>Listeden bir maç seçin.</p>
          </div>
        )}
      </div>
    </div>
  );
}
