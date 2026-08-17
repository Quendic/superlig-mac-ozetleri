const axios = require('axios');
const cheerio = require('cheerio');

async function debug() {
    try {
        const res = await axios.get('https://beinsports.com.tr/mac-ozetleri-goller/super-lig/ozet/2026-2027/1/any-mac-ozeti', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const $ = cheerio.load(res.data);
        const json = JSON.parse($('#__NEXT_DATA__').html());
        const data = json.props.pageProps.data || [];
        console.log('Total matches found:', data.length);
        data.forEach(m => {
            console.log(`- ${m.homeTeam?.name} ${m.homeTeam?.matchScore} - ${m.awayTeam?.matchScore} ${m.awayTeam?.name}`);
        });
    } catch (e) {
        console.error(e.message);
    }
}
debug();
