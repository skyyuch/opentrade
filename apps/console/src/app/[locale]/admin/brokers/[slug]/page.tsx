import { AdminBrokerDetailClient } from './AdminBrokerDetailClient';

import type { ReactNode } from 'react';

type Props = {
  params: Promise<{ slug: string }>;
};

const AdminBrokerDetailPage = async ({ params }: Props): Promise<ReactNode> => {
  const { slug } = await params;
  return <AdminBrokerDetailClient slug={slug} />;
};

export default AdminBrokerDetailPage;
