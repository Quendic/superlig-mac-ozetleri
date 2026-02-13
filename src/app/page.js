'use client';
import { useState, useEffect } from 'react';
import { Play, Calendar, List, AlertCircle } from 'lucide-react';
import './globals.css';

export default function Home() {
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [currentWeek, setCurrentWeek] = useState(null);
  const [matches, setMatches] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fixtureLoading, setFixtureLoading] = useState(false);
  const [error, setError] = useState(null);

  const weeks = Array.from({ length: 34 }, (_, i) => i + 1);

  // İlk açılışta güncel haftayı tespit et
  useEffect(() => {
    const init = async () => {
      setFixtureLoading(true);
      try {
        const res = await fetch('/api/fixture?week=current');
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        if (data.currentWeek) setCurrentWeek(data.currentWeek);
        setSelectedWeek(data.week);
        setMatches(data.matches || []);
      } catch (e) {
        console.error('Init error:', e);
        setSelectedWeek(1);
      } finally {
        setFixtureLoading(false);
      }
    };
    init();
  }, []);

  // Hafta değişince fikstürü çek (ilk yükleme hariç)
  useEffect(() => {
    if (selectedWeek === null) return;
    const fetchFixture = async () => {
      setFixtureLoading(true);
      setMatches([]);
      setSelectedMatch(null);
      setError(null);
      try {
        const res = await fetch(`/api/fixture?week=${selectedWeek}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        if (data.currentWeek && !currentWeek) setCurrentWeek(data.currentWeek);
        setMatches(data.matches || []);
      } catch (e) {
        console.error('Fixture error:', e);
      } finally {
        setFixtureLoading(false);
      }
    };
    fetchFixture();
  }, [selectedWeek]);

  // Maç tıklanınca - video URL zaten fixture API'den geliyor
  const playMatch = async (match) => {
    if (selectedMatch?.id === match.id && !error) return;

    setError(null);
    setSelectedMatch(match);

    // Eğer doğrudan video yoksa, scrape API'yi dene
    if (!match.videoUrl && match.pageLink) {
      setLoading(true);
      try {
        const res = await fetch(`/api/scrape?url=${encodeURIComponent(match.pageLink)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Video yüklenemedi');
        // videoSource'u match objesine ekle
        match.videoUrl = data.videoSource;
        match.videoType = data.videoType;
        setSelectedMatch({ ...match });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Play fill="white" size={20} />
          Maç Özeti
        </h2>

        {/* Hafta Seçici */}
        <div className="week-selector">
          <label className="dropdown-label"><Calendar size={14} style={{ display: 'inline', marginRight: '4px' }} /> Hafta Seçin</label>
          <select
            className="dropdown"
            value={selectedWeek || ''}
            onChange={(e) => {
              setSelectedWeek(parseInt(e.target.value));
              setSelectedMatch(null);
              setError(null);
            }}
          >
            {selectedWeek === null && <option value="">Yükleniyor...</option>}
            {weeks.map(w => (
              <option key={w} value={w} style={w === currentWeek ? { color: '#10b981', fontWeight: 'bold' } : {}}>
                {w}. Hafta{w === currentWeek ? ' ★ Güncel' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Maç Listesi */}
        <div className="match-list">
          <label className="dropdown-label"><List size={14} style={{ display: 'inline', marginRight: '4px' }} /> Maçlar</label>

          {fixtureLoading ? (
            <div style={{ color: '#888', padding: '1rem', textAlign: 'center' }}>Yükleniyor...</div>
          ) : matches.length === 0 ? (
            <div style={{ color: '#888', padding: '1rem', textAlign: 'center' }}>Bu hafta için maç bulunamadı.</div>
          ) : (
            matches.map((match) => (
              <div
                key={match.id}
                className={`match-card ${selectedMatch?.id === match.id ? 'active' : ''}`}
                style={{ opacity: match.hasSummary ? 1 : 0.5, cursor: match.hasSummary ? 'pointer' : 'default' }}
                tabIndex={match.hasSummary ? 0 : -1}
                role="button"
                onClick={() => match.hasSummary && playMatch(match)}
                onKeyDown={(e) => e.key === 'Enter' && match.hasSummary && playMatch(match)}
              >
                <div className="match-title">
                  {match.date && <span style={{ display: 'block', fontSize: '0.72rem', color: '#888', marginBottom: '3px' }}>{match.date}</span>}
                  <span style={{ fontWeight: 600 }}>
                    {match.home} {match.scoreHome ?? ''} - {match.scoreAway ?? ''} {match.away}
                  </span>
                  {!match.hasSummary && <span style={{ display: 'block', fontSize: '0.7rem', color: '#eab308', marginTop: '4px' }}>Özet Mevcut Değil</span>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Ana İçerik */}
      <div className="main-content">
        {selectedMatch ? (
          <div style={{ width: '100%', maxWidth: '1000px' }}>
            <h1>{selectedMatch.title || `${selectedMatch.home} - ${selectedMatch.away}`}</h1>

            <div className="video-container">
              {loading && (
                <div className="loading-spinner"></div>
              )}

              {error && (
                <div style={{ color: '#ef4444', textAlign: 'center', padding: '2rem' }}>
                  <AlertCircle size={48} style={{ margin: '0 auto 1rem' }} />
                  <p>{error}</p>
                  {selectedMatch.pageLink && (
                    <a href={selectedMatch.pageLink} target="_blank" rel="noopener noreferrer" className="retry-btn">
                      beIN Sports&apos;ta İzle
                    </a>
                  )}
                </div>
              )}

              {!loading && !error && selectedMatch.videoUrl && (
                <video
                  key={selectedMatch.videoUrl}
                  controls
                  autoPlay
                  playsInline
                  width="100%"
                  height="100%"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
                >
                  <source src={selectedMatch.videoUrl} type="video/mp4" />
                  Tarayıcınız video etiketini desteklemiyor.
                </video>
              )}
            </div>

            {/* Goller */}
            {selectedMatch.events && selectedMatch.events.filter(e => e.type === 'goal').length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: '#ccc' }}>⚽ Goller</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {selectedMatch.events.filter(e => e.type === 'goal').map((e, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        if (e.videoUrl) {
                          setSelectedMatch(prev => ({ ...prev, videoUrl: e.videoUrl, title: e.description }));
                        }
                      }}
                      style={{
                        padding: '0.4rem 0.8rem',
                        fontSize: '0.8rem',
                        background: 'rgba(16,185,129,0.15)',
                        border: '1px solid #10b981',
                        borderRadius: '8px',
                        color: '#fff',
                        cursor: e.videoUrl ? 'pointer' : 'default',
                        opacity: e.videoUrl ? 1 : 0.5
                      }}
                    >
                      {e.minute}&apos; {e.description} ⚽
                    </button>
                  ))}
                </div>
              </div>
            )}
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
