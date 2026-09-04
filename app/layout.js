import './globals.css';

export const metadata = {
  title: 'Bihar Command Center',
  description: 'Bihar political intelligence dashboard'
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}