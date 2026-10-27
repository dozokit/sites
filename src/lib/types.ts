// The builder as a whole: what every site shares.
export type State = {
  chat_apps: { id: string; name: string; created_at: number; last_used: number | null }[];
  analytics_url: string;
  email: { connected: boolean; to: string; last: string | null };
  sites: SiteRow[];
};

export type SiteRow = { id: number; slug: string; domain: string | null; name: string; address: string; published: number | null; draft: number; updated_at: number; unread: number };

// One site, open in the editor.
export type SiteDetail = { id: number; slug: string; domain: string | null; address: string; doc: SiteDoc; draft: number; published: number | null; analytics_site: string; unread: number };

export type SiteDoc = {
  langs: string[];
  business: { name: string; trade: string; town: string; google_url?: string; [k: string]: unknown };
  content: Record<string, { title: string; description: string; sections: { id: string; kind: string; title: string }[]; pages?: { slug: string; menu: string }[]; posts?: { slug: string; title: string }[] }>;
  [k: string]: unknown;
};

export type Recipe = { id: string; title: string; body: string };
