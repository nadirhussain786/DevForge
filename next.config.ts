import type { NextConfig } from "next";

/**
 * Security headers (§37).
 *
 * CSP is deliberately not set here. Next injects inline bootstrap scripts, so
 * a useful policy needs a per-request nonce, which belongs in proxy.ts where
 * the request exists — not in a static header list. A blanket
 * `script-src 'unsafe-inline'` would be worse than nothing: it looks like a
 * policy while permitting exactly the injection CSP exists to stop.
 *
 * Everything below is safe to set statically.
 */
const securityHeaders = [
  // Clickjacking. `frame-ancestors` supersedes X-Frame-Options where CSP is
  // supported, but the older header still covers legacy user agents.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },

  // Stop content-type sniffing turning a user upload into executable script.
  { key: "X-Content-Type-Options", value: "nosniff" },

  // Send the origin cross-site, the full URL same-origin. Full URLs here can
  // carry note ids and slugs, which are the user's business and no one else's.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // Nothing in EngForge needs these.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },

  // Two years, subdomains included. Only meaningful over HTTPS; ignored on
  // localhost.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },

  // Isolate the browsing context so a compromised third-party frame cannot
  // reach this window.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
