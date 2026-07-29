export default function robots() {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://felpus-web.vercel.app/sitemap.xml",
  };
}
