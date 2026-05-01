const axios = require('axios');
const cheerio = require('cheerio');

async function debug() {
    try {
        const res = await axios.get('https://beinsports.com.tr/mac-ozetleri-goller/super-lig/ozet/2025-2026/22/any-mac-ozeti', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(res.data);
        const json = JSON.parse($('#__NEXT_DATA__').html());
        const match = json.props.pageProps.data[0];
        console.log('Match Keys:', Object.keys(match));
        console.log('HomeTeam Keys:', Object.keys(match.homeTeam));
        console.log('HomeScore:', match.homeTeam.matchScore);
        console.log('AwayScore:', match.awayTeam.matchScore);
    } catch (e) {
        console.error(e.message);
    }
}
debug();
