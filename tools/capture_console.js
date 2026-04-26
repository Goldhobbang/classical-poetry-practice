const http = require('http');
const { JSDOM } = require('jsdom');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

(async () => {
  try {
    const html = await fetchUrl('http://localhost:3000/');
    const dom = new JSDOM(html, { url: 'http://localhost:3000/', resources: 'usable', runScripts: 'dangerously' });

    const errors = [];
    dom.window.addEventListener('error', (e) => {
      errors.push({ message: e.message, filename: e.filename, lineno: e.lineno });
    });
    const origConsoleError = dom.window.console.error.bind(dom.window.console);
    dom.window.console.error = (...args) => {
      errors.push({ consoleError: args.map(String).join(' ') });
      origConsoleError(...args);
    };

    // Wait for scripts to execute
    await new Promise((r) => setTimeout(r, 2000));

    if (errors.length === 0) {
      console.log('NO_ERRORS');
    } else {
      console.log('ERRORS_FOUND');
      console.log(JSON.stringify(errors, null, 2));
    }
  } catch (e) {
    console.error('CAPTURE_FAILED', e && e.stack ? e.stack : String(e));
    process.exit(1);
  }
})();
