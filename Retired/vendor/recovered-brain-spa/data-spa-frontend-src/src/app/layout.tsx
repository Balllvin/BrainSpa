import "@/app/globals.css";
import { AppChrome } from "@/components/AppChrome";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/brand";

export const metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <AppChrome />
          {children}
        </div>
      </body>
    </html>
  );
}
