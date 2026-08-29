const apiUrl = process.env.VITE_API_URL;
let hasError = false;

function fail(message) {
  console.error(`Deployment config error: ${message}`);
  hasError = true;
}

if (!apiUrl || apiUrl.trim() === '') {
  fail('VITE_API_URL is required for the Cloudflare Pages build.');
} else {
  try {
    const parsed = new URL(apiUrl);
    if (parsed.protocol !== 'https:') {
      fail('VITE_API_URL must use HTTPS in production.');
    }
    if (!parsed.pathname.replace(/\/+$/, '').endsWith('/api')) {
      fail('VITE_API_URL must include the backend /api path.');
    }
  } catch {
    fail('VITE_API_URL must be a valid URL.');
  }
}

if (hasError) {
  process.exitCode = 1;
} else {
  console.log('Frontend deployment config validation passed.');
}
