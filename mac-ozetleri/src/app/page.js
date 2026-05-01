'use client';
import { useState, useEffect } from 'react';
import { Play, Calendar, List, AlertCircle, Globe } from 'lucide-react';
import './globals.css';

const LEAGUES = [
  { id: 'superlig', name: 'Süper Lig', type: 'bein' },
  { id: 'premierlig', name: 'Premier Lig', type: 'youtube', list: 'PLREq_OnJpFaSnbvvu8Zaew1ZfsQmS6eF9' },
];

export default function Home() {
  const [selectedLeague, setSelectedLeague] = useState(LEAGUES[0]);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(null);
  const [matches, setMatches] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fixtureLoading, setFixtureLoading] = useState(false);
  const [error, setError] = useState(null);

  // Klavye Kontrollerini Başlat
  useKeyboardControls(null, selectedMatch);

  // İlk açılışta veya lig değişince veri çek
  useEffect(() => {
    const init = async () => {
      setFixtureLoading(true);
      setError(null);
      setAvailableWeeks([]);
      setSelectedWeek(null);
      setCurrentWeek(null);
      try {
        if (selectedLeague.type === 'bein') {
          const res = await fetch('/api/fixture?week=current', { cache: 'no-store' });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          if (data.currentWeek) {
            setCurrentWeek(data.currentWeek);
            setSelectedWeek(data.currentWeek);
          } else {
            setSelectedWeek(data.week);
          }
          setMatches(data.matches || []);
          setAvailableWeeks(Array.from({ length: 38 }, (_, i) => i + 1));
        } else {
          const res = await fetch(`/api/youtube?list=${selectedLeague.list}`, { cache: 'no-store' });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          setMatches(data.matches || []);
          setAvailableWeeks(data.weeks || []);
          setSelectedWeek(data.week);
        }
      } catch (e) {
        console.error('Init error:', e);
        setError('Veriler yüklenirken bir hata oluştu.');
      } finally {
        setFixtureLoading(false);
      }
    };
    init();
  }, [selectedLeague]);

  // Maçlar yüklendiğinde İLK MAÇA odaklan (Auto-focus)
  useEffect(() => {
    if (!fixtureLoading && matches.length > 0) {
      const intervalId = setInterval(() => {
        const firstMatch = document.querySelector('.match-card');
        if (firstMatch) {
          firstMatch.focus();
          clearInterval(intervalId);
        }
      }, 100);
      setTimeout(() => clearInterval(intervalId), 2000);
    }
  }, [fixtureLoading, matches]);

  // Hafta değişince
  useEffect(() => {
    if (selectedWeek === null) return;
    const fetchMatches = async () => {
      setFixtureLoading(true);
      setMatches([]);
      setSelectedMatch(null);
      setError(null);
      try {
        const endpoint = selectedLeague.type === 'bein' 
          ? `/api/fixture?week=${selectedWeek}`
          : `/api/youtube?list=${selectedLeague.list}&week=${selectedWeek}`;
        
        const res = await fetch(endpoint, { cache: 'no-store' });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setMatches(data.matches || []);
      } catch (e) {
        console.error('Fetch error:', e);
        setError('Maçlar yüklenemedi.');
      } finally {
        setFixtureLoading(false);
      }
    };
    fetchMatches();
  }, [selectedWeek, selectedLeague]);

  // beIN verisi ile YouTube videosunu eşleştir
  const mergeHybrid = (beinMatches, ytMatches) => {
    const normalize = (name) => {
      if (!name) return '';
      let n = name.toLowerCase()
        .replace(/united/g, '')
        .replace(/utd/g, '')
        .replace(/city/g, '')
        .replace(/hotspur/g, '')
        .replace(/town/g, '')
        .replace(/& hove albion/g, '')
        .replace(/and hove albion/g, '')
        .replace(/hove albion/g, '')
        .replace(/albion/g, '')
        .replace(/fc/g, '')
        .replace(/\./g, '')
        .replace(/ham/g, 'ham') // West Ham için
        .trim();

      // Özel kısaltmalar
      if (n.includes('manchester')) n = n.replace('manchester', 'man');
      if (n.includes('wolverhampton')) n = 'wolves';
      if (n.includes('tottenham')) n = 'spurs';
      if (n.includes('palace')) n = 'palace';

      return n;
    };

    return beinMatches.map(m => {
      const bHome = normalize(m.home);
      const bAway = normalize(m.away);

      const match = ytMatches.find(yt => {
        const title = yt.title.toLowerCase().replace(/\./g, '');
        const tNormalized = title.replace(/united/g, '').replace(/utd/g, '').replace(/manchester/g, 'man');

        // Daha esnek eşleşme: Normalize edilmiş isimler başlıkta geçiyor mu?
        const homeMatch = tNormalized.includes(bHome) || tNormalized.includes(m.home.toLowerCase());
        const awayMatch = tNormalized.includes(bAway) || tNormalized.includes(m.away.toLowerCase());

        // Ek olarak: Eğer "Wolverhampton" ise "Wolves" ara
        const wolvesHome = bHome === 'wolves' && tNormalized.includes('wolverhampton');
        const wolvesAway = bAway === 'wolves' && tNormalized.includes('wolverhampton');

        return (homeMatch || wolvesHome) && (awayMatch || wolvesAway);
      });

      if (match) {
        return {
          ...m,
          videoUrl: match.videoUrl,
          videoType: 'youtube',
          hasSummary: true
        };
      }
      return { ...m, hasSummary: false };
    });
  };

  const playMatch = async (match) => {
    if (selectedMatch?.id === match.id && !error) return;
    setError(null);
    setSelectedMatch(match);

    if (match.videoType === 'youtube') return;

    const safeFullscreen = (v) => {
      try {
        if (v.requestFullscreen) v.requestFullscreen().catch(() => { });
        else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
        else if (v.msRequestFullscreen) v.msRequestFullscreen();
      } catch (e) { console.log('Fullscreen failed:', e); }
    };

    if (!match.videoUrl && match.pageLink) {
      setLoading(true);
      try {
        const res = await fetch(`/api/scrape?url=${encodeURIComponent(match.pageLink)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Video yüklenemedi');

        const updatedMatch = { ...match, videoUrl: data.videoSource, videoType: data.videoType };
        setSelectedMatch(updatedMatch);

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
        <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Play fill="white" size={20} />
          Maç Özeti
        </h2>

        {/* Lig Seçici */}
        <div className="week-selector">
          <label className="dropdown-label"><Globe size={14} style={{ display: 'inline', marginRight: '4px' }} /> Lig Seçin</label>
          <div className="league-tabs">
            {LEAGUES.map(league => (
              <button
                key={league.id}
                className={`league-tab ${selectedLeague.id === league.id ? 'active' : ''}`}
                onClick={() => setSelectedLeague(league)}
              >
                {league.name}
              </button>
            ))}
          </div>
        </div>

        {/* Hafta Seçici */}
        <div className="week-selector">
          <label className="dropdown-label"><Calendar size={14} style={{ display: 'inline', marginRight: '4px' }} /> Hafta Seçin</label>
          <select
            className="dropdown"
            value={selectedWeek || ''}
            tabIndex="-1"
            onChange={(e) => {
              setSelectedWeek(parseInt(e.target.value));
              setSelectedMatch(null);
              setError(null);
            }}
          >
            {!selectedWeek && <option value="">Hafta Seç...</option>}
            {availableWeeks.map(w => (
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
                    {match.home} {match.scoreHome ?? ''} {match.scoreAway !== null ? '-' : ''} {match.scoreAway ?? ''} {match.away}
                  </span>
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
            <h1>{selectedMatch.home} {selectedMatch.scoreHome ?? ''} - {selectedMatch.scoreAway ?? ''} {selectedMatch.away}</h1>

            <div className="video-container">
              {loading && <div className="loading-spinner"></div>}

              {error && (
                <div style={{ color: '#ef4444', textAlign: 'center', padding: '2rem' }}>
                  <AlertCircle size={48} style={{ margin: '0 auto 1rem' }} />
                  <p>{error}</p>
                </div>
              )}

              {!loading && !error && selectedMatch.videoUrl && (
                selectedMatch.videoType === 'youtube' ? (
                  <iframe
                    key={selectedMatch.videoUrl}
                    src={`${selectedMatch.videoUrl}&vq=hd1080`}
                    title={selectedMatch.title}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    onLoad={(e) => {
                      const iframe = e.target;
                      // Tıklama sonrası tam ekran denemesi
                      try {
                        if (iframe.requestFullscreen) iframe.requestFullscreen().catch(() => { });
                        else if (iframe.webkitRequestFullscreen) iframe.webkitRequestFullscreen();
                        else if (iframe.msRequestFullscreen) iframe.msRequestFullscreen();
                      } catch (err) { console.log('Iframe fullscreen error:', err); }
                    }}
                    style={{ width: '100%', height: '100%', borderRadius: 'var(--radius)' }}
                  ></iframe>
                ) : (
                  <video
                    key={selectedMatch.videoUrl}
                    controls
                    autoPlay
                    playsInline
                    onLoadedMetadata={(e) => {
                      const v = e.target;
                      v.play().catch(() => { });
                      try {
                        if (v.requestFullscreen) v.requestFullscreen().catch(() => { });
                        else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
                        else if (v.msRequestFullscreen) v.msRequestFullscreen();
                      } catch (err) { }
                    }}
                    width="100%"
                    height="100%"
                    style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
                  >
                    <source src={selectedMatch.videoUrl} type="video/mp4" />
                  </video>
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

// Global Klavye Dinleyicisi
function useKeyboardControls(videoRef, selectedMatch) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

      const video = document.querySelector('video');

      switch (e.key) {
        case ' ':
        case 'Enter':
          if (!['BUTTON', 'A', 'SELECT'].includes(document.activeElement.tagName)) {
            if (video) {
              e.preventDefault();
              if (video.paused) video.play(); else video.pause();
            }
          }
          break;

        case 'ArrowLeft':
          const sidebar = document.querySelector('.sidebar');
          if (sidebar && !sidebar.contains(document.activeElement)) {
            const activeMatch = document.querySelector('.match-card.active');
            if (activeMatch) { e.preventDefault(); activeMatch.focus(); }
          }
          break;

        case 'ArrowDown':
          if (document.activeElement.classList.contains('match-card')) {
            e.preventDefault();
            let next = document.activeElement.nextElementSibling;
            while (next && !next.classList.contains('match-card')) next = next.nextElementSibling;
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
            } catch (err) { }
            return;
          }
          if (document.activeElement.classList.contains('match-card')) {
            e.preventDefault();
            let prev = document.activeElement.previousElementSibling;
            while (prev && !prev.classList.contains('match-card')) prev = prev.previousElementSibling;
            if (prev) prev.focus();
            else {
              const dropdown = document.querySelector('.dropdown');
              if (dropdown) dropdown.focus();
            }
          }
          break;

        case 'ArrowRight':
          if (document.activeElement.tagName === 'VIDEO') {
            e.preventDefault();
            if (document.activeElement.currentTime) document.activeElement.currentTime += 10;
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedMatch]);
}
