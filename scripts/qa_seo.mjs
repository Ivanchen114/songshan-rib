import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_ORIGIN = 'https://songshan-rib.vercel.app';
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) errors.push(message);
}

const homepage = read('index.html');
requireMatch(homepage, /<html\s+lang="zh-TW">/i, '首頁缺少 lang="zh-TW"');
requireMatch(homepage, /<title>閱讀理解與表達｜松山高中校訂必修 R\.I\.B\.<\/title>/, '首頁 title 未使用正式課程名稱');
requireMatch(homepage, /<meta\s+name="description"\s+content="[^"]+">/i, '首頁缺少 meta description');
requireMatch(homepage, /<meta\s+name="robots"\s+content="[^"]*index[^"]*follow[^"]*">/i, '首頁未明確允許索引與追蹤連結');
requireMatch(homepage, new RegExp(`<link\\s+rel="canonical"\\s+href="${SITE_ORIGIN.replaceAll('.', '\\.')}/">`, 'i'), '首頁 canonical 網址不正確');

for (const property of ['og:type', 'og:locale', 'og:site_name', 'og:title', 'og:description', 'og:url', 'og:image']) {
  requireMatch(homepage, new RegExp(`<meta\\s+property="${property.replace(':', '\\:')}"\\s+content="[^"]+">`, 'i'), `首頁缺少 ${property}`);
}

const jsonLdBlocks = [...homepage.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
let websiteJsonLd = null;
for (const [, rawJson] of jsonLdBlocks) {
  try {
    const value = JSON.parse(rawJson);
    if (value['@type'] === 'WebSite') websiteJsonLd = value;
  } catch (error) {
    errors.push(`JSON-LD 無法解析：${error.message}`);
  }
}
if (!websiteJsonLd) {
  errors.push('首頁缺少 WebSite JSON-LD');
} else {
  if (websiteJsonLd.name !== '閱讀理解與表達') errors.push('WebSite JSON-LD 的 name 不正確');
  if (websiteJsonLd.url !== `${SITE_ORIGIN}/`) errors.push('WebSite JSON-LD 的 url 不正確');
}

const robots = read('robots.txt');
requireMatch(robots, /^User-agent:\s*\*$/mi, 'robots.txt 缺少 User-agent: *');
requireMatch(robots, /^Allow:\s*\/$/mi, 'robots.txt 未允許抓取全站');
requireMatch(robots, new RegExp(`^Sitemap:\\s*${SITE_ORIGIN.replaceAll('.', '\\.')}/sitemap\\.xml$`, 'mi'), 'robots.txt 缺少正確的 sitemap 位址');

const sitemap = read('sitemap.xml');
requireMatch(sitemap, /<urlset\s+xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/, 'sitemap.xml 命名空間不正確');
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const expectedUrls = [
  `${SITE_ORIGIN}/`,
  ...Array.from({ length: 18 }, (_, index) => `${SITE_ORIGIN}/W${index + 1}/`),
  `${SITE_ORIGIN}/worksheets/`,
];

for (const expectedUrl of expectedUrls) {
  if (!sitemapUrls.includes(expectedUrl)) errors.push(`sitemap.xml 缺少 ${expectedUrl}`);
}
if (new Set(sitemapUrls).size !== sitemapUrls.length) errors.push('sitemap.xml 有重複網址');
if (sitemapUrls.length !== expectedUrls.length) errors.push(`sitemap.xml 應有 ${expectedUrls.length} 個網址，實際為 ${sitemapUrls.length}`);

for (const url of sitemapUrls) {
  if (!url.startsWith(`${SITE_ORIGIN}/`)) {
    errors.push(`sitemap.xml 包含非正式網域：${url}`);
    continue;
  }
  const pathname = new URL(url).pathname;
  const localPath = pathname === '/' ? 'index.html' : path.join(pathname.slice(1), 'index.html');
  if (!fs.existsSync(path.join(rootDir, localPath))) errors.push(`sitemap.xml 網址沒有對應檔案：${url}`);
}

if (errors.length > 0) {
  console.error(`SEO QA FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`SEO QA PASS: homepage metadata, robots.txt, JSON-LD, and ${sitemapUrls.length} sitemap URLs`);
