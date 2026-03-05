import './globals.css';

export const metadata = {
  title: 'Tri Dimensions - Precision Hydration Shop',
  description: 'Shop premium Precision Hydration products from Tri Dimensions',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
