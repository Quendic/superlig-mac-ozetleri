import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import axios from 'axios';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const playlistId = searchParams.get('list');
    const weekParam = searchParams.get('week');

    if (!playlistId) {
        return NextResponse.json({ error: 'Playlist ID is required' }, { status: 400 });
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
        
        // Playlist video listesini bul
        let videos = [];
        try {
            const contents = data.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents;
            videos = contents || [];
        } catch (e) {
            console.error('YouTube parse error:', e);
            throw new Error('Playlist içeriği ayrıştırılamadı.');
        }

        const matches = videos
            .filter(v => v.playlistVideoRenderer)
            .filter(v => {
                const title = v.playlistVideoRenderer.title.runs[0].text;
                return !title.toLowerCase().includes('geniş özet');
            })
            .map(v => {
                const video = v.playlistVideoRenderer;
                const title = video.title.runs[0].text;
                const videoId = video.videoId;
                
                // Hafta bilgisini ayıkla (Örn: "34. Hafta")
                let week = null;
                const weekMatch = title.match(/(\d+)\.?\s*Hafta/i);
                if (weekMatch) {
                    week = parseInt(weekMatch[1]);
                }

                // Başlıktan takım ve skor ayıklama denemesi
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

                return {
                    id: videoId,
                    matchId: videoId,
                    home,
                    away,
                    scoreHome,
                    scoreAway,
                    week,
                    date: video.videoInfo?.runs?.[0]?.text || '',
                    title,
                    hasSummary: true,
                    videoUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`,
                    videoType: 'youtube',
                    thumbnail: video.thumbnail.thumbnails[video.thumbnail.thumbnails.length - 1].url,
                    events: []
                };
            });

        // Mevcut haftaları bul
        const availableWeeks = [...new Set(matches.map(m => m.week).filter(w => w !== null))].sort((a, b) => b - a);
        
        // Filtreleme
        let filteredMatches = matches;
        let selectedWeek = null;

        if (weekParam === 'all') {
            // Hiçbir filtreleme yapma, tüm listeyi dön
        } else {
            selectedWeek = weekParam ? parseInt(weekParam) : (availableWeeks[0] || null);
            if (selectedWeek) {
                filteredMatches = matches.filter(m => m.week === selectedWeek);
            }
        }

        return NextResponse.json({ 
            matches: filteredMatches, 
            weeks: availableWeeks,
            week: selectedWeek
        });

    } catch (error) {
        console.error('YouTube API error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
