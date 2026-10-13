/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  // Behind Nginx (which gzips), NEXT_COMPRESS=false saves Node CPU.
  compress: process.env.NEXT_COMPRESS !== "false",
  images: {
    localPatterns: [
      { pathname: "/assets/**", search: "" },
      { pathname: "/api/site/branding/**", search: "" },
    ],
  },
  // Docker builds set NEXT_OUTPUT=standalone; local `next start` needs the default output.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" } : {}),
};

export default nextConfig;
