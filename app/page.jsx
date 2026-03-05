'use client';

import dynamic from 'next/dynamic';

const StripeCart = dynamic(() => import('./shop/page'), { ssr: false });

export default function Home() {
  return <StripeCart />;
}
