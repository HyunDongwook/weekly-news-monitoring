const url = 'https://news.google.com/rss/articles/CBMiWEFVX3lxTFBVX3dScWFqQ2ZoVERUOFlzNmF4UDhqdERfMml0eDN0Q2h1ZFJVY1hORzRhSTExYXd0S0RuVUxsS1ZYMFNKTEhneFVmRUZ4TW16bUI1SmwtMmE?oc=5';
const res = await fetch(url, { redirect: 'follow' });
console.log('FINAL URL:', res.url);
const html = await res.text();
console.log('LENGTH:', html.length);
console.log(html.slice(0, 4000));
