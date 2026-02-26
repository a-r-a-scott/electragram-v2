import type { NextConfig } from "next";

const IDENTITY_URL      = process.env.IDENTITY_SERVICE_URL      ?? "http://localhost:3001";
const CONTACTS_URL      = process.env.CONTACTS_SERVICE_URL      ?? "http://localhost:3002";
const EVENTS_URL        = process.env.EVENTS_SERVICE_URL        ?? "http://localhost:3003";
const MESSAGING_URL     = process.env.MESSAGING_SERVICE_URL     ?? "http://localhost:3004";
const CHAT_URL          = process.env.CHAT_SERVICE_URL          ?? "http://localhost:3007";
const INTEGRATIONS_URL  = process.env.INTEGRATIONS_SERVICE_URL  ?? "http://localhost:3008";
const DESIGN_URL        = process.env.DESIGN_SERVICE_URL        ?? "http://localhost:3009";
const ANALYTICS_URL     = process.env.ANALYTICS_SERVICE_URL     ?? "http://localhost:3010";

const nextConfig: NextConfig = {
  transpilePackages: ["@electragram/ui", "@electragram/types"],
  experimental: {
    typedRoutes: true,
  },

  async rewrites() {
    return [
      // ── Identity (auth, users, accounts) ───────────────────────────────────
      { source: "/api/auth/:path*",     destination: `${IDENTITY_URL}/api/auth/:path*` },
      { source: "/api/users/:path*",    destination: `${IDENTITY_URL}/api/users/:path*` },
      { source: "/api/accounts/:path*", destination: `${IDENTITY_URL}/api/accounts/:path*` },

      // ── Contacts ───────────────────────────────────────────────────────────
      { source: "/api/contacts/:path*",      destination: `${CONTACTS_URL}/api/contacts/:path*` },
      { source: "/api/contact-lists/:path*", destination: `${CONTACTS_URL}/api/contact-lists/:path*` },
      { source: "/api/contact-fields/:path*",destination: `${CONTACTS_URL}/api/contact-fields/:path*` },

      // ── Events ─────────────────────────────────────────────────────────────
      { source: "/api/events/:path*", destination: `${EVENTS_URL}/api/events/:path*` },
      { source: "/api/forms/:path*",  destination: `${EVENTS_URL}/api/forms/:path*` },
      { source: "/api/guests/:path*", destination: `${EVENTS_URL}/api/guests/:path*` },

      // ── Messaging ──────────────────────────────────────────────────────────
      { source: "/api/campaigns/:path*", destination: `${MESSAGING_URL}/api/campaigns/:path*` },
      { source: "/api/messages/:path*",  destination: `${MESSAGING_URL}/api/messages/:path*` },
      { source: "/api/broadcasts/:path*",destination: `${MESSAGING_URL}/api/broadcasts/:path*` },

      // ── Chat ───────────────────────────────────────────────────────────────
      { source: "/api/conversations/:path*", destination: `${CHAT_URL}/api/conversations/:path*` },
      { source: "/api/chat/:path*",          destination: `${CHAT_URL}/api/chat/:path*` },

      // ── Integrations ───────────────────────────────────────────────────────
      { source: "/api/integrations/:path*", destination: `${INTEGRATIONS_URL}/api/integrations/:path*` },
      { source: "/api/oauth/:path*",        destination: `${INTEGRATIONS_URL}/api/oauth/:path*` },

      // ── Design ─────────────────────────────────────────────────────────────
      { source: "/api/templates/:path*",  destination: `${DESIGN_URL}/api/templates/:path*` },
      { source: "/api/themes/:path*",     destination: `${DESIGN_URL}/api/themes/:path*` },
      { source: "/api/fonts/:path*",      destination: `${DESIGN_URL}/api/fonts/:path*` },

      // ── Analytics ──────────────────────────────────────────────────────────
      { source: "/api/analytics/:path*", destination: `${ANALYTICS_URL}/api/analytics/:path*` },
      { source: "/api/reports/:path*",   destination: `${ANALYTICS_URL}/api/reports/:path*` },
    ];
  },
};

export default nextConfig;
