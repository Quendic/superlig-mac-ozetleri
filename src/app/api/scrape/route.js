
import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Function to validate URL
const isValidUrl = (url) => {
    try {
        const parsed = new URL(url);
        // Be flexible with subdomains
        return parsed.hostname.includes('beinsports.com.tr');
    } catch (e) {
        return false;
    }
};

// Helper: Resolve redirect if it's a redirector URL
const resolveRedirect = async (url) => {
    // Only resolve known redirect patterns
    if (url.includes('dt-switch.akamaized.net')) {
        try {
            const response = await axios.head(url, {
                maxRedirects: 0,
                validateStatus: status => status >= 200 && status < 400,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Referer': 'https://beinsports.com.tr/' // Important for some CDNs
                }
            });
            if (response.status === 301 || response.status === 302) {
                const finalUrl = response.headers.location;
                // Sometimes location is relative (unlikely here but good practice)
                if (finalUrl) return finalUrl;
            }
        } catch (e) {
            console.warn("Failed to resolve redirect:", e.message);
            // Fallback to original if resolution fails
        }
    }
    return url;
};


export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl || !isValidUrl(targetUrl)) {
        return NextResponse.json({ error: 'Invalid or missing beIN Sports URL' }, { status: 400 });
    }

    try {
        // 1. Fetch HTML content with proper headers to mimic a browser
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://beinsports.com.tr/',
            },
        });

        const html = response.data;
        const $ = cheerio.load(html);

        let videoSource = null;
        let videoType = null;
        let title = $('h1').text().trim() || $('title').text().trim();
        let thumbnail = $('meta[property="og:image"]').attr('content') || '';

        // 2. Strategy 1: Data Extraction from __NEXT_DATA__
        try {
            const nextDataScript = $('#__NEXT_DATA__').html();
            if (nextDataScript) {
                const nextData = JSON.parse(nextDataScript);

                // Path 1: jsonLd video details
                const jsonLd = nextData?.props?.pageProps?.jsonLd;
                if (jsonLd?.videoListDetails && Array.isArray(jsonLd.videoListDetails)) {
                    const mainVideo = jsonLd.videoListDetails[0];
                    if (mainVideo?.video) {
                        videoSource = mainVideo.video;
                        title = jsonLd.videoListTitle || title;
                        thumbnail = mainVideo.thumbnail || thumbnail;
                    }
                }

                // Path 2: Recursive Search in props
                if (!videoSource) {
                    const findVideoUrl = (obj) => {
                        if (!obj || typeof obj !== 'object') return null;
                        if (obj.videoUrl && typeof obj.videoUrl === 'string' && obj.videoUrl.startsWith('http')) return obj.videoUrl;
                        if (obj.highlightVideoUrl && typeof obj.highlightVideoUrl === 'string' && obj.highlightVideoUrl.startsWith('http')) return obj.highlightVideoUrl;

                        for (const k in obj) {
                            const res = findVideoUrl(obj[k]);
                            if (res) return res;
                        }
                        return null;
                    };
                    // Search inside pageProps.data (usually contains the match data)
                    videoSource = findVideoUrl(nextData?.props?.pageProps?.data);
                }
            }
        } catch (parseError) {
            console.error("Error parsing NEXT_DATA:", parseError);
        }

        // 3. Strategy 2: Look for <video> tag (Fallback)
        if (!videoSource) {
            const videoTagSrc = $('video source').attr('src') || $('video').attr('src');
            if (videoTagSrc) {
                videoSource = videoTagSrc;
            }
        }

        // 4. Strategy 3: Look for Iframe (Fallback)
        if (!videoSource) {
            $('iframe').each((i, el) => {
                const src = $(el).attr('src');
                if (src && (src.includes('player') || src.includes('embed') || src.includes('video'))) {
                    if (!videoSource) videoSource = src;
                }
            });
            if (videoSource) videoType = 'iframe';
        }

        if (!videoSource) {
            return NextResponse.json({ error: 'No video source found on this page' }, { status: 404 });
        }

        // 5. Post-Processing: Resolve Redirects if needed
        if (!videoType || videoType !== 'iframe') {
            videoSource = await resolveRedirect(videoSource);
        }

        // Determine type if not already set
        if (!videoType) {
            if (videoSource.includes('.m3u8')) videoType = 'hls';
            else if (videoSource.includes('.mp4')) videoType = 'mp4';
            else if (videoSource.includes('akamaized')) videoType = 'mp4'; // Likely resolved to mp4 now
            else videoType = 'unknown';
        }

        // If source is a relative path, fix it
        if (videoSource.startsWith('//')) {
            videoSource = 'https:' + videoSource;
        }

        return NextResponse.json({
            title,
            thumbnail,
            videoSource,
            videoType,
            originalUrl: targetUrl
        });

    } catch (error) {
        console.error('Scraping error:', error.message);
        return NextResponse.json({ error: 'Failed to fetch the URL' }, { status: 500 });
    }
}
