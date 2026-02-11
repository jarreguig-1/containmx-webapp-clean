// src/app/layout.tsx
export const metadata = {
  title: "ContainMX",
  description: "App",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head />
      <body>{children}</body>
    </html>
  );
}