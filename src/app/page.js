'use client';
import { useState, useEffect, useRef } from 'react';
import { Play, Calendar, List, AlertCircle } from 'lucide-react';
import './globals.css';

export default function Home() {
  const [selectedLeague, setSelectedLeague] = useState('super-lig');
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [currentWeek, setCurrentWeek] = useState(null);
  const [ytWeeks, setYtWeeks] = useState([]);
  const [matches, setMatches] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fixtureLoading, setFixtureLoading] = useState(false);
  const [error, setError] = useState(null);

  // İstemci tarafı bellek (Client-side memory cache)
  const clientCache = useRef({});

  // Klavye Kontrollerini Başlat
  useKeyboardControls(null, selectedMatch);

  const superLigWeeks = Array.from({ length: 34 }, (_, i) => i + 1);
  const weeks = selectedLeague === 'super-lig' ? superLigWeeks : (ytWeeks.length > 0 ? ytWeeks : [5, 4, 3, 2, 1]);

  // Lig veya Hafta Değiştiğinde Fikstürü Çek (Önbellek Kontrollü)
  useEffect(() => {
    let isCancelled = false;

    const fetchData = async () => {
      const cacheKey = `${selectedLeague}_${selectedWeek !== null ? selectedWeek : 'current'}`;

      // 1. Bellekte varsa anında göster (0ms)
      if (clientCache.current[cacheKey]) {
        const cached = clientCache.current[cacheKey];
        if (cached.currentWeek && !currentWeek) setCurrentWeek(cached.currentWeek);
        if (cached.weeks && selectedLeague === 'premier-league') setYtWeeks(cached.weeks);
        if (selectedWeek === null && cached.week) setSelectedWeek(cached.week);
        setMatches(cached.matches || []);
        setSelectedMatch(null);
        setFixtureLoading(false);
        return;
      }

      setFixtureLoading(true);
      setMatches([]);
      setSelectedMatch(null);
      setError(null);

      try {
        if (selectedLeague === 'super-lig') {
          const query = selectedWeek ? `?week=${selectedWeek}` : '?week=current';
          const res = await fetch(`/api/fixture${query}`);
          const data = await res.json();
          if (isCancelled) return;
          if (data.error) throw new Error(data.error);

          if (data.currentWeek && !currentWeek) setCurrentWeek(data.currentWeek);
          if (selectedWeek === null && data.week) setSelectedWeek(data.week);
          setMatches(data.matches || []);

          // Belleğe kaydet
          const cacheData = { matches: data.matches || [], currentWeek: data.currentWeek, week: data.week };
          clientCache.current[cacheKey] = cacheData;
          if (data.week && selectedWeek === null) {
            clientCache.current[`${selectedLeague}_${data.week}`] = cacheData;
          }

        } else if (selectedLeague === 'premier-league') {
          const query = selectedWeek ? `&week=${selectedWeek}` : '&week=current';
          const res = await fetch(`/api/youtube?list=PLC-ntSjW5uvU${query}`);
          const data = await res.json();
          if (isCancelled) return;
          if (data.error) throw new Error(data.error);

          if (data.weeks) setYtWeeks(data.weeks);
          if (data.currentWeek && !currentWeek) setCurrentWeek(data.currentWeek);
          if (selectedWeek === null && (data.week || data.currentWeek)) {
            setSelectedWeek(data.week || data.currentWeek);
          }
          setMatches(data.matches || []);

          // Belleğe kaydet
          const cacheData = { matches: data.matches || [], currentWeek: data.currentWeek, weeks: data.weeks, week: data.week || data.currentWeek };
          clientCache.current[cacheKey] = cacheData;
          if (cacheData.week && selectedWeek === null) {
            clientCache.current[`${selectedLeague}_${cacheData.week}`] = cacheData;
          }
        }
      } catch (e) {
        if (!isCancelled) {
          console.error('Fetch error:', e);
          setError(e.message);
        }
      } finally {
        if (!isCancelled) setFixtureLoading(false);
      }
    };

    fetchData();

    return () => {
      isCancelled = true;
    };
  }, [selectedLeague, selectedWeek]);

  // Lig değiştirme fonksiyonu
  const handleLeagueChange = (leagueId) => {
    if (selectedLeague === leagueId) return;
    setSelectedLeague(leagueId);
    setSelectedWeek(null);
    setCurrentWeek(null);
    setSelectedMatch(null);
    setError(null);
  };

  // Maçlar yüklendiğinde İLK MAÇA odaklan (Auto-focus - Retry Logic)
  useEffect(() => {
    if (!fixtureLoading && matches.length > 0) {
      const intervalId = setInterval(() => {
        const firstMatch = document.querySelector('.match-card');
        if (firstMatch) {
          firstMatch.focus();
          clearInterval(intervalId); // Bulunca dur
        }
      }, 100);

      // 2 saniye sonra pes et (sonsuz döngü olmasın)
      setTimeout(() => clearInterval(intervalId), 2000);
    }
  }, [fixtureLoading, matches]);

  // Maç tıklanınca - video URL fixture veya youtube API'den geliyor
  const playMatch = async (match) => {
    if (selectedMatch?.id === match.id && !error) return;

    setError(null);
    setSelectedMatch(match);

    const safeFullscreen = (v) => {
      try {
        if (v.requestFullscreen) v.requestFullscreen().catch(() => { });
        else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
        else if (v.msRequestFullscreen) v.msRequestFullscreen();
      } catch (e) { console.log('Fullscreen failed:', e); }
    };

    // YouTube embed ise otomatik tam ekrana geç
    if (match.videoType === 'youtube') {
      setTimeout(() => {
        const container = document.querySelector('.video-container') || document.querySelector('iframe');
        if (container) safeFullscreen(container);
      }, 150);
      return;
    }

    // Eğer doğrudan video yoksa, scrape API'yi dene
    if (!match.videoUrl && match.pageLink) {
      setLoading(true);
      try {
        const res = await fetch(`/api/scrape?url=${encodeURIComponent(match.pageLink)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Video yüklenemedi');

        // Veriyi güncelle
        const updatedMatch = { ...match, videoUrl: data.videoSource, videoType: data.videoType };
        setSelectedMatch(updatedMatch);

        // Otomatik Tam Ekran Denemesi (API Sonrası)
        setTimeout(() => {
          const v = document.querySelector('video');
          if (v) {
            v.play().catch(() => { });
            safeFullscreen(v);
          }
        }, 500);

      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    } else if (match.videoUrl) {
      // Zaten video varsa direkt seç ve tam ekrana geç
      setSelectedMatch(match);
      setTimeout(() => {
        const v = document.querySelector('video');
        if (v) {
          v.play().catch(() => { });
          safeFullscreen(v);
        }
      }, 100);
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Play fill="white" size={20} />
          Maç Özeti
        </h2>

        {/* Lig Seçici */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label className="dropdown-label"><Calendar size={14} style={{ display: 'inline', marginRight: '4px' }} /> Lig Seçin</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <button
              type="button"
              className={`league-btn ${selectedLeague === 'super-lig' ? 'active' : ''}`}
              onClick={() => handleLeagueChange('super-lig')}
            >
              <img src="/super-lig.png" alt="Süper Lig" className="league-icon" />
              Süper Lig
            </button>
            <button
              type="button"
              className={`league-btn ${selectedLeague === 'premier-league' ? 'active' : ''}`}
              onClick={() => handleLeagueChange('premier-league')}
            >
              <img src="/premier-league.png" alt="Premier Lig" className="league-icon" />
              Premier Lig
            </button>
          </div>
        </div>

        {/* Hafta Seçici */}
        <div className="week-selector">
          <label className="dropdown-label"><Calendar size={14} style={{ display: 'inline', marginRight: '4px' }} /> Hafta Seçin</label>
          <select
            className="dropdown"
            value={selectedWeek || ''}
            tabIndex="-1" // Oto-fokus engellendi, sadece JS ile erişilecek
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
                  {match.date && <span style={{ display: 'block', fontSize: '0.72rem', color: '#888', marginBottom: '4px' }}>{match.date}</span>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {match.homeLogo && (
                      <img src={match.homeLogo} alt="" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
                    )}
                    <span>{match.home}</span>
                    <span style={{ color: '#10b981', fontWeight: 'bold', margin: '0 2px' }}>
                      {match.scoreHome !== null && match.scoreHome !== undefined ? `${match.scoreHome} - ${match.scoreAway}` : '-'}
                    </span>
                    <span>{match.away}</span>
                    {match.awayLogo && (
                      <img src={match.awayLogo} alt="" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
                    )}
                  </div>
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

              {/* YouTube Embed Player */}
              {!loading && !error && selectedMatch.videoType === 'youtube' && (
                <iframe
                  key={selectedMatch.videoUrl}
                  src={selectedMatch.videoUrl}
                  title={selectedMatch.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                  allowFullScreen
                  width="100%"
                  height="100%"
                  style={{ width: '100%', height: '100%', border: 'none', background: '#000' }}
                />
              )}

              {/* beIN Sports MP4 Video Player */}
              {!loading && !error && selectedMatch.videoType !== 'youtube' && selectedMatch.videoUrl && (
                <video
                  key={selectedMatch.videoUrl}
                  controls
                  autoPlay
                  playsInline
                  onLoadedMetadata={(e) => {
                    const v = e.target;
                    // Otomatik oynat
                    v.play().catch(() => { });

                    // Tam ekran dene (Güvenli yöntem)
                    try {
                      if (v.requestFullscreen) v.requestFullscreen().catch(() => { });
                      else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
                      else if (v.msRequestFullscreen) v.msRequestFullscreen();
                    } catch (err) {
                      console.log('Fullscreen error:', err);
                    }
                  }}
                  width="100%"
                  height="100%"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
                >
                  <source src={selectedMatch.videoUrl} type="video/mp4" />
                  Tarayıcınız video etiketini desteklemiyor.
                </video>
              )}
            </div>

            {/* Goller (Sadece Bilgi) */}
            {selectedMatch.events && selectedMatch.events.filter(e => e.type === 'goal').length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: '#ccc' }}>⚽ Goller</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {selectedMatch.events.filter(e => e.type === 'goal').map((e, i) => (
                    <span
                      key={i}
                      style={{
                        padding: '0.4rem 0.8rem',
                        fontSize: '0.9rem',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '6px',
                        color: '#eee',
                        userSelect: 'none'
                      }}
                    >
                      <span style={{ color: '#10b981', fontWeight: 'bold' }}>{e.minute}&apos;</span> {e.description} ⚽
                    </span>
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

// Global Klavye Dinleyicisi (TV Kumandası & Klavye Desteği - Birebir orijinal kod)
function useKeyboardControls(videoRef, selectedMatch) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

      const video = document.querySelector('video');

      // Hangi tuşa basıldı?
      switch (e.key) {
        case ' ':
        case 'Enter':
          if (!['BUTTON', 'A', 'SELECT'].includes(document.activeElement.tagName) && video) {
            e.preventDefault();
            if (video.paused) video.play(); else video.pause();
          }
          break;

        case 'ArrowLeft':
          const sidebar = document.querySelector('.sidebar');
          const ae = document.activeElement;

          if (sidebar && !sidebar.contains(ae)) {
            const activeMatch = document.querySelector('.match-card.active');
            if (activeMatch) {
              e.preventDefault();
              activeMatch.focus();
            } else {
              const first = document.querySelector('.match-card');
              if (first) {
                e.preventDefault();
                first.focus();
              }
            }
          }
          break;

        case 'ArrowDown':
          if (document.activeElement.classList.contains('match-card')) {
            e.preventDefault();
            let next = document.activeElement.nextElementSibling;
            while (next && !next.classList.contains('match-card')) {
              next = next.nextElementSibling;
            }
            if (next) next.focus();
          }
          break;

        case 'ArrowUp':
          if (document.activeElement.tagName === 'VIDEO') {
            e.preventDefault();
            const v = document.activeElement;
            try {
              if (v.requestFullscreen) v.requestFullscreen().catch(() => { });
              else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
              else if (v.msRequestFullscreen) v.msRequestFullscreen();
            } catch (err) { console.log('Fullscreen manual error:', err); }
            return;
          }

          if (document.activeElement.classList.contains('match-card')) {
            e.preventDefault();
            let prev = document.activeElement.previousElementSibling;
            while (prev && !prev.classList.contains('match-card')) {
              prev = prev.previousElementSibling;
            }

            if (prev) {
              prev.focus();
            } else {
              const dropdown = document.querySelector('.dropdown');
              if (dropdown) dropdown.focus();
            }
          }
          break;

        case 'ArrowRight':
          if (document.activeElement.tagName === 'VIDEO') {
            e.preventDefault();
            const v = document.activeElement;
            if (v && v.currentTime) v.currentTime += 10;
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedMatch]);
}
