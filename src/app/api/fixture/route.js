import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';

// beIN fikstür sayfasından güncel haftayı tespit et
async function detectCurrentWeek() {
    try {
        const res = await axios.get('https://beinsports.com.tr/lig/super-lig/fikstur', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 8000
        });
        const $ = cheerio.load(res.data);
        const json = JSON.parse($('#__NEXT_DATA__').html());
        return json.props?.pageProps?.orgData?.activeRound?.round || 22;
    } catch {
        return 22; // fallback
    }
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    let week = searchParams.get('week') || 'current';

    // Güncel haftayı tespit et
    let currentWeek = null;
    if (week === 'current') {
        currentWeek = await detectCurrentWeek();
        week = String(currentWeek);
    }

    // beIN Sports'un özet sayfası, hafta bazlı tüm maçları ve video URL'lerini döndürür.
    const url = `https://beinsports.com.tr/mac-ozetleri-goller/super-lig/ozet/2025-2026/${week}/any-mac-ozeti`;

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);
        const nextDataScript = $('#__NEXT_DATA__').html();

        if (!nextDataScript) {
            throw new Error('beIN Sports sayfasından veri okunamadı.');
        }

        const json = JSON.parse(nextDataScript);
        const rawMatches = json.props?.pageProps?.data || [];

        const matches = rawMatches
            .filter(m => m.homeTeam && m.awayTeam) // Sadece maç verisi olanlar
            .map((m, index) => {
                const homeName = m.homeTeam.name;
                const awayName = m.awayTeam.name;
                const homeScore = m.homeTeam.matchScore;
                const awayScore = m.awayTeam.matchScore;
                const isPlayed = homeScore !== null && homeScore !== undefined;

                // Video bilgileri doğrudan beIN'den geliyor
                const videoUrl = m.highlightVideoUrl || null;
                const pageLink = m.highlightPageLink
                    ? `https://beinsports.com.tr${m.highlightPageLink}`
                    : null;
                const thumbnail = m.highlightThumbnail || null;
                const title = m.highLightTitle || `${homeName} - ${awayName}`;

                // Tarih formatla
                let dateStr = '';
                if (m.matchDate) {
                    try {
                        dateStr = new Date(m.matchDate).toLocaleDateString('tr-TR', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                        });
                    } catch { dateStr = m.matchDate; }
                }

                // Gol/pozisyon anları
                const events = (m.matchEvents || []).map(e => ({
                    description: e.description,
                    minute: e.minute,
                    type: e.type === 0 ? 'goal' : 'highlight',
                    side: e.eventTeamSide,
                    videoUrl: e.videoUrl,
                    thumbnail: e.thumbnail
                }));

                return {
                    id: `${week}-${m.matchId}`,
                    matchId: m.matchId,
                    home: homeName,
                    away: awayName,
                    homeLogo: m.homeTeam.logo,
                    awayLogo: m.awayTeam.logo,
                    scoreHome: homeScore,
                    scoreAway: awayScore,
                    date: dateStr,
                    title,
                    hasSummary: isPlayed && !!videoUrl,
                    videoUrl,       // Doğrudan Akamaized video URL
                    pageLink,       // beIN Sports sayfa linki
                    thumbnail,
                    events
                };
            });

        return NextResponse.json({ week: parseInt(week), currentWeek, matches });

    } catch (error) {
        console.error('Fixture API error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
