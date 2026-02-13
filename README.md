# beIN Sports Maç Özetleri - Video Scraper & Player

Bu proje, beIN Sports Türkiye web sitesinden maç özetlerini çekip oynatan modern bir Next.js uygulamasıdır.

## Özellikler

- **Video Scraper**: Sayfa kaynağını analiz ederek MP4, HLS (m3u8) veya Iframe kaynaklarını bulur.
- **Proxy Backend**: Next.js API Routes üzerinden HTML içeriğini çeker (CORS sorununu aşar).
- **Hafta ve Maç Seçimi**: Kullanıcı dostu arayüz.
- **Premium Tasarım**: Modern, karanlık mod (Dark Mode) arayüzü.

## Kurulum ve Çalıştırma

1. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```

2. Geliştirme sunucusunu başlatın:
   ```bash
   npm run dev
   ```

3. Tarayıcıda açın:
   `http://localhost:3000`

## Kullanım

1. Sol menüden bir hafta seçin (Şu an örnek veri olarak Hafta 25 ve 26 eklenmiştir).
2. Listeden bir maça tıklayın.
3. Uygulama, ilgili beIN Sports sayfasını arka planda analiz edecek ve videoyu oynatacaktır.

## Notlar

- Eğer video oynatılamazsa (Telif/Koruma nedeniyle), "beIN Sports sitesinde izle" linki belirir.
- Yeni maç eklemek için `src/app/page.js` içerisindeki `MATCH_DATA` objesini güncelleyebilirsiniz.

## Gelecek Geliştirmeler

- **Otomatik Fikstür Çekme**: Tüm sezonun maçlarını otomatik listelemek için bir scraper eklenebilir.
