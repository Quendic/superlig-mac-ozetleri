import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Server-side in-memory cache (10 dakika TTL)
const premierCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

// Takım isimlerini eşleştirmek için yardımcı normalize fonksiyonu
function normalizeTeamName(str) {
    return (str || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .replace(/spor|fk|sk|united|utd|city|fc/g, '');
}

// beIN Sports'tan aktif Premier Lig haftasını tespit et
async function detectPremierLeagueCurrentWeek() {
    try {
        const res = await axios.get('https://beinsports.com.tr/mac-ozetleri-goller/ingiltere-premier-ligi', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 7000
        });
        const $ = cheerio.load(res.data);
        const script = $('#__NEXT_DATA__').html();
        if (script) {
            const j = JSON.parse(script);
            return j.props?.pageProps?.orgData?.activeRound?.round || 5;
        }
    } catch (e) {
        console.warn('Detect PL current week error:', e.message);
    }
    return 5;
}

// beIN Sports'tan doğrudan Premier Lig maçlarını, logolarını ve özet videolarını çek
async function fetchBeinPremierLeague(week) {
    try {
        const url = `https://beinsports.com.tr/mac-ozetleri-goller/ingiltere-premier-ligi/ozet/2026-2027/${week}/any-mac-ozeti`;
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 8000
        });
        const $ = cheerio.load(res.data);
        const script = $('#__NEXT_DATA__').html();
        if (!script) return [];
        const j = JSON.parse(script);
        const raw = j.props?.pageProps?.data || [];

        return raw
            .filter(m => m.homeTeam && m.awayTeam)
            .map(m => {
                const homeName = m.homeTeam.name;
                const awayName = m.awayTeam.name;
                const scoreHome = m.homeTeam.matchScore;
                const scoreAway = m.awayTeam.matchScore;
                const videoUrl = m.highlightVideoUrl || null;
                const pageLink = m.highlightPageLink ? `https://beinsports.com.tr${m.highlightPageLink}` : null;

                let dateStr = '';
                if (m.matchDate) {
                    try {
                        dateStr = new Date(m.matchDate).toLocaleDateString('tr-TR', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                        });
                    } catch { dateStr = m.matchDate; }
                }

                return {
                    id: String(m.matchId || `${week}-${homeName}-${awayName}`),
                    matchId: m.matchId,
                    home: homeName,
                    away: awayName,
                    scoreHome,
                    scoreAway,
                    homeLogo: m.homeTeam.logo || null,
                    awayLogo: m.awayTeam.logo || null,
                    week: parseInt(week),
                    date: dateStr,
                    title: m.highLightTitle || `${homeName} - ${awayName}`,
                    hasSummary: !!videoUrl,
                    videoUrl,
                    videoType: 'mp4',
                    pageLink,
                    thumbnail: m.highlightThumbnail || null,
                    events: []
                };
            });
    } catch (e) {
        console.warn(`beIN PL fetch error (week ${week}):`, e.message);
        return [];
    }
}

// YouTube oynatma listesinden videoları çekmeyi dene (Consent cookie + esnek ayrıştırma)
async function fetchYouTubePlaylist(playlistId) {
    try {
        const url = `https://www.youtube.com/playlist?list=${playlistId}`;
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
                'Cookie': 'SOCS=CAESEwgDEgk2NDU4MzUzNzEaAnRyIAEaBgiA_K-0Bg; PREF=tz=Europe.Istanbul&hl=tr&gl=TR'
            },
            timeout: 7000
        });

        const html = response.data;
        const jsonMatch = html.match(/var ytInitialData = (\{.*?\});/);
        if (!jsonMatch) return [];

        const data = JSON.parse(jsonMatch[1]);
        
        // Olası içerik yolları (Desktop UI, Mobile UI, veya Bölgesel UI)
        let rawItems = [];
        try {
            rawItems = data.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
            if (!rawItems.length) {
                rawItems = data.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents || [];
            }
        } catch { rawItems = []; }

        const ytMatches = [];
        for (const item of rawItems) {
            let title = '';
            let videoId = '';
            let thumbnail = '';

            if (item.lockupViewModel) {
                title = item.lockupViewModel.metadata?.lockupMetadataViewModel?.title?.content || '';
                videoId = item.lockupViewModel.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId || '';
                const thumbs = item.lockupViewModel.contentImage?.thumbnailViewModel?.image?.sources;
                if (thumbs && thumbs.length > 0) thumbnail = thumbs[thumbs.length - 1].url;
            } else if (item.playlistVideoRenderer) {
                title = item.playlistVideoRenderer.title?.runs?.[0]?.text || '';
                videoId = item.playlistVideoRenderer.videoId || '';
                const thumbs = item.playlistVideoRenderer.thumbnail?.thumbnails;
                if (thumbs && thumbs.length > 0) thumbnail = thumbs[thumbs.length - 1].url;
            }

            if (!title || !videoId) continue;

            let week = null;
            const weekMatch = title.match(/(\d+)\.?\s*Hafta/i);
            if (weekMatch) week = parseInt(weekMatch[1]);

            let home = 'Ev Sahibi';
            let away = 'Deplasman';
            const matchInfo = title.split('|')[0].trim();
            if (matchInfo.includes('-')) {
                const parts = matchInfo.split('-');
                home = parts[0].trim();
                away = parts.slice(1).join('-').trim();
            }

            ytMatches.push({
                videoId,
                title,
                week,
                home,
                away,
                thumbnail: thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                videoUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&vq=hd1080&enablejsapi=1`
            });
        }
        return ytMatches;
    } catch (e) {
        console.warn('YouTube playlist fetch failed:', e.message);
        return [];
    }
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const playlistId = searchParams.get('list') || 'PLC-ntSjW5uvU';
    const weekParam = searchParams.get('week');

    const cacheKey = `pl_${playlistId}_${weekParam || 'current'}`;
    const cached = premierCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return NextResponse.json(cached.data);
    }

    try {
        // 1. Güncel haftayı beIN Sports üzerinden kesin olarak öğren
        let currentWeek = await detectPremierLeagueCurrentWeek();
        let targetWeek = currentWeek;

        if (weekParam && weekParam !== 'current' && weekParam !== 'all') {
            targetWeek = parseInt(weekParam);
        }

        // 2. beIN Sports Premier League sayfasından o haftanın maçlarını çek
        // (Bu Vercel'de %100 çalışır, logolar, skorlar ve beIN video linkleri tamdır)
        const beinMatches = await fetchBeinPremierLeague(targetWeek);

        // 3. YouTube oynatma listesini çekmeyi dene
        const ytVideos = await fetchYouTubePlaylist(playlistId);

        let finalMatches = [];

        if (beinMatches.length > 0) {
            // beIN maçlarını baz al, YouTube'da videosu varsa YouTube embed URL'ini ekle
            finalMatches = beinMatches.map(bm => {
                const normHome = normalizeTeamName(bm.home);
                const normAway = normalizeTeamName(bm.away);

                const ytMatch = ytVideos.find(yt => {
                    if (yt.week && yt.week !== targetWeek) return false;
                    const ytHome = normalizeTeamName(yt.home);
                    const ytAway = normalizeTeamName(yt.away);
                    return (normHome.includes(ytHome) || ytHome.includes(normHome)) &&
                           (normAway.includes(ytAway) || ytAway.includes(normAway));
                });

                if (ytMatch) {
                    return {
                        ...bm,
                        id: ytMatch.videoId,
                        matchId: ytMatch.videoId,
                        videoUrl: ytMatch.videoUrl,
                        videoType: 'youtube',
                        thumbnail: ytMatch.thumbnail || bm.thumbnail
                    };
                }
                return bm; // Eğer YouTube'da bulunamazsa beIN MP4 videosu kullanılır
            });
        } else if (ytVideos.length > 0) {
            // beIN geçici olarak yanıt vermezse doğrudan YouTube maçlarını kullan
            finalMatches = ytVideos
                .filter(m => !targetWeek || m.week === targetWeek)
                .map(m => ({
                    id: m.videoId,
                    matchId: m.videoId,
                    home: m.home,
                    away: m.away,
                    scoreHome: null,
                    scoreAway: null,
                    homeLogo: null,
                    awayLogo: null,
                    week: m.week,
                    title: m.title,
                    hasSummary: true,
                    videoUrl: m.videoUrl,
                    videoType: 'youtube',
                    thumbnail: m.thumbnail,
                    events: []
                }));
        }

        // Mevcut haftalar
        const availableWeeks = [5, 4, 3, 2, 1];

        const resultData = {
            week: targetWeek,
            currentWeek,
            weeks: availableWeeks,
            matches: finalMatches
        };

        premierCache.set(cacheKey, { data: resultData, timestamp: Date.now() });
        return NextResponse.json(resultData);

    } catch (error) {
        console.error('Premier League API error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
