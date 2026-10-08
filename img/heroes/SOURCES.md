# Hero portraits — provenance

All portraits are the game's own hero card art as published on the Kingshot official
wiki (https://kingshotwiki.com/heroes/ — hero index page, fetched 2026-08-21, name →
portrait matched by each card's `title` attribute).

Each file here is a 256×256 center-crop re-encode (WebP, q82) of the wiki's uploaded
original, converted with ffmpeg. Originals are hosted by the wiki on AWS S3
(`got-global-wiki.s3.us-west-1.amazonaws.com`):

| File | Source URL (as listed on the wiki) |
|---|---|
| alcar.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-15.png |
| amadeus.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-25.png |
| amane.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-9.png |
| ava.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2026/05/Ava.png |
| chenko.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-7.png |
| helga.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-27.png |
| hilde.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-23.png |
| jabel.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-24.png |
| margot.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-22.png |
| marlin.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-19.png |
| petra.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-21.png |
| rosa.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-16.png |
| saul.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-20.png |
| thrud.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-13.png |
| vivian.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-12.png |
| weewoo.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2026/05/WeeWoo.png |
| yang.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2026/04/3-Yang.jpg |
| yeonwoo.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-10.png |
| zoe.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-17.png |

Served locally from this repo so the page stays fully offline-static (no hotlinks).

## Directory completion · 2026-10-08

The 15 missing portraits were matched by the wiki card title and hero page, then centre-cropped to 256×256 and encoded as WebP at quality 82. All 34 directory heroes now have local portraits. Jaegar on the wiki maps to the existing Jaeger catalogue ID.

| File | Original | Hero page |
|---|---|---|
| diana.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-8.png | https://kingshotwiki.com/heroes/kingshot_wiki_hero_name_50008_kingshot_end/ |
| edwin.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-4.png | https://kingshotwiki.com/heroes/kingshot_wiki_hero_name_50002_kingshot_end/ |
| fahd.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-11.png | https://kingshotwiki.com/heroes/kingshot_wiki_hero_name_50029_kingshot_end/ |
| forrest.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/exec-82284738-d852-41e2-8617-eb0b27832fb8.png | https://kingshotwiki.com/heroes/kingshot_wiki_hero_name_50000_kingshot_end/ |
| gordon.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-5.png | https://kingshotwiki.com/heroes/kingshot_wiki_hero_name_50005_kingshot_end/ |
| howard.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%B4%AB%E3%80%90.png | https://kingshotwiki.com/heroes/kingshot_wiki_hero_name_50004_kingshot_end/ |
| olive.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-1.png | https://kingshotwiki.com/heroes/kingshot_wiki_hero_name_50003_kingshot_end/ |
| quinn.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-6.png | https://kingshotwiki.com/heroes/kingshot_wiki_hero_name_50006_kingshot_end/ |
| seth.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-3.png | https://kingshotwiki.com/heroes/kingshot_wiki_hero_name_50001_kingshot_end/ |
| eric.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-26.png | https://kingshotwiki.com/heroes/kingshot_wiki_hero_name_50010_kingshot_end/ |
| jaeger.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-18.png | https://kingshotwiki.com/heroes/jaegar/ |
| longfei.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2025/10/%E7%BB%84-14.png | https://kingshotwiki.com/heroes/long-fei/ |
| sophia.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2026/04/2-Sophia.jpg | https://kingshotwiki.com/heroes/kingshot_wiki_hero_name_50030_kingshot_end/ |
| triton.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2026/04/1-Triton.jpg | https://kingshotwiki.com/heroes/kingshot_wiki_hero_name_50019_kingshot_end/ |
| charles.webp | https://got-global-wiki.s3.us-west-1.amazonaws.com/wp-content/uploads/2026/05/Charles.png | https://kingshotwiki.com/heroes/kingshot_wiki_hero_name_50032_kingshot_end/ |
