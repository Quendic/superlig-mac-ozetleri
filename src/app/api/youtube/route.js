import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Takım isimlerini eşleştirmek için yardımcı normalize fonksiyonu
function normalizeTeamName(str) {
    return (str || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .replace(/spor|fk|sk|united|utd|city|fc/g, '');
}

// beIN Sports'tan belirtilen haftanın Premier League logo ve skorlarını çek
async function fetchBeinPremierLeagueWeek(week) {
    if (!week) return [];
    try {
        const url = `https://beinsports.com.tr/mac-ozetleri-goller/ingiltere-premier-ligi/ozet/2026-2027/${week}/any-mac-ozeti`;
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 6000
        });
        const $ = cheerio.load(res.data);
        const script = $('#__NEXT_DATA__').html();
        if (!script) return [];
        const json = JSON.parse(script);
        return json.props?.pageProps?.data || [];
    } catch (e) {
        console.warn(`beIN PL logo fetch error (week ${week}):`, e.message);
        return [];
    }
}

// Server-side in-memory cache (10 dakika TTL)
const youtubeCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const playlistId = searchParams.get('list');
    const weekParam = searchParams.get('week');

    if (!playlistId) {
        return NextResponse.json({ error: 'Playlist ID is required' }, { status: 400 });
    }

    const cacheKey = `yt_${playlistId}_${weekParam || 'current'}`;
    const cached = youtubeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return NextResponse.json(cached.data);
    }

    const url = `https://www.youtube.com/playlist?list=${playlistId}`;

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
            },
            timeout: 10000
        });

        const html = response.data;
        const jsonMatch = html.match(/var ytInitialData = (\{.*?\});/);

        if (!jsonMatch) {
            throw new Error('YouTube verisi okunamadı.');
        }

        const data = JSON.parse(jsonMatch[1]);
        const rawItems = data.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

        const matches = [];

        for (const item of rawItems) {
            let title = '';
            let videoId = '';
            let thumbnail = '';

            // 1. Yeni YouTube UI: lockupViewModel
            if (item.lockupViewModel) {
                title = item.lockupViewModel.metadata?.lockupMetadataViewModel?.title?.content || '';
                videoId = item.lockupViewModel.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId || '';
                const thumbs = item.lockupViewModel.contentImage?.thumbnailViewModel?.image?.sources;
                if (thumbs && thumbs.length > 0) {
                    thumbnail = thumbs[thumbs.length - 1].url;
                }
            }
            // 2. Klasik YouTube UI: playlistVideoRenderer
            else if (item.playlistVideoRenderer) {
                title = item.playlistVideoRenderer.title?.runs?.[0]?.text || '';
                videoId = item.playlistVideoRenderer.videoId || '';
                const thumbs = item.playlistVideoRenderer.thumbnail?.thumbnails;
                if (thumbs && thumbs.length > 0) {
                    thumbnail = thumbs[thumbs.length - 1].url;
                }
            }

            if (!title || !videoId) continue;

            // Hafta bilgisini ayıkla (Örn: "5. Hafta", "1. Hafta")
            let week = null;
            const weekMatch = title.match(/(\d+)\.?\s*Hafta/i);
            if (weekMatch) {
                week = parseInt(weekMatch[1]);
            }

            // Başlıktan takım isimlerini ayıkla
            let home = 'Ev Sahibi';
            let away = 'Deplasman';
            let scoreHome = null;
            let scoreAway = null;

            const matchInfo = title.split('|')[0].trim();

            let scoreMatch = matchInfo.match(/(.+?)\s*\((\d+)\s*-\s*(\d+)\)\s*(.+)/);
            if (!scoreMatch) {
                scoreMatch = matchInfo.match(/(.+?)\s+(\d+)\s*-\s*(\d+)\s+(.+)/);
            }

            if (scoreMatch) {
                home = scoreMatch[1].trim();
                scoreHome = scoreMatch[2];
                scoreAway = scoreMatch[3];
                away = scoreMatch[4].trim();
            } else if (matchInfo.includes('-')) {
                const parts = matchInfo.split('-');
                home = parts[0].trim();
                away = parts.slice(1).join('-').trim();
            } else {
                const vsMatch = matchInfo.match(/(.+?)\s+vs\.?\s+(.+)/i);
                if (vsMatch) {
                    home = vsMatch[1].trim();
                    away = vsMatch[2].trim();
                } else {
                    home = matchInfo;
                    away = '';
                }
            }

            matches.push({
                id: videoId,
                matchId: videoId,
                home,
                away,
                homeLogo: null,
                awayLogo: null,
                scoreHome,
                scoreAway,
                week,
                title,
                hasSummary: true,
                videoUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&vq=hd1080&enablejsapi=1`,
                videoType: 'youtube',
                thumbnail: thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                events: []
            });
        }

        // Mevcut haftaları tespit et
        const availableWeeks = [...new Set(matches.map(m => m.week).filter(Boolean))].sort((a, b) => b - a);
        const currentWeek = availableWeeks.length > 0 ? availableWeeks[0] : 1;

        // Filtreleme
        let filteredMatches = matches;
        let selectedWeek = currentWeek;

        if (weekParam === 'all') {
            selectedWeek = null;
        } else if (weekParam === 'current' || !weekParam) {
            selectedWeek = currentWeek;
            filteredMatches = matches.filter(m => m.week === currentWeek);
        } else {
            selectedWeek = parseInt(weekParam);
            filteredMatches = matches.filter(m => m.week === selectedWeek);
        }

        // beIN Sports'tan o haftanın logo ve skor verilerini çekip eşleştir (Enrichment)
        if (selectedWeek) {
            const beinMatches = await fetchBeinPremierLeagueWeek(selectedWeek);
            if (beinMatches && beinMatches.length > 0) {
                filteredMatches = filteredMatches.map(m => {
                    const normHome = normalizeTeamName(m.home);
                    const normAway = normalizeTeamName(m.away);

                    const matched = beinMatches.find(b => {
                        const bHome = normalizeTeamName(b.homeTeam?.name);
                        const bAway = normalizeTeamName(b.awayTeam?.name);
                        return (normHome.includes(bHome) || bHome.includes(normHome)) &&
                               (normAway.includes(bAway) || bAway.includes(normAway));
                    });

                    if (matched) {
                        return {
                            ...m,
                            homeLogo: matched.homeTeam?.logo || null,
                            awayLogo: matched.awayTeam?.logo || null,
                            scoreHome: m.scoreHome ?? matched.homeTeam?.matchScore ?? null,
                            scoreAway: m.scoreAway ?? matched.awayTeam?.matchScore ?? null
                        };
                    }
                    return m;
                });
            }
        }

        const resultData = {
            week: selectedWeek,
            currentWeek,
            weeks: availableWeeks,
            matches: filteredMatches
        };

        youtubeCache.set(cacheKey, { data: resultData, timestamp: Date.now() });
        return NextResponse.json(resultData);

    } catch (error) {
        console.error('YouTube API error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
