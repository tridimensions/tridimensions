import './globals.css';

export const metadata = {
  title: 'TriDimensions - Precision Hydration Shop',
  description: 'Shop premium Precision Hydration products from TriDimensions',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
